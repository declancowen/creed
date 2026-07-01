# Design Document

## Overview

This feature makes Supabase the single home for the shared document workspace's review and version control. Every edit — from a human in the editor or an agent over MCP — is routed through one policy-gated entry point that either rejects it, turns it into a workspace-shared **proposal**, or applies it directly. Applying a change (via an accepted proposal or a direct edit) appends an immutable **version** to the document's history. Members review proposals inline, browse history, diff, and revert — all without GitHub.

The document-workspace GitHub sync (push / pull / status / webhook / repo access) is **removed**. Properties stay in Supabase columns; the frontmatter-for-GitHub round-trip is retired for documents.

This design reuses the profile's existing proposal vocabulary and UI (`Proposal` draft shapes, `InlineProposalDiff`, the "N proposals · Accept all" bar, `computeDiffParts`) and generalizes them from single-user profile state to workspace-shared Supabase rows.

Out of scope: the legacy single-file profile keeps its current proposals/permissions.

## Architecture

```
Actor (human editor OR agent via MCP)
        │  submit change (draft)
        ▼
┌───────────────────────────────────────────────┐
│  routeDocumentEdit()  (server, single entry)    │
│  reads workspace policy for actor_type          │
│    cant-edit → reject                            │
│    propose   → createProposal()                  │
│    direct    → applyChange() + appendVersion()   │
└───────────────────────────────────────────────┘
        │                         │
        ▼                         ▼
 creed_document_proposals   creed_documents (content, revision++)
        │  accept                 + creed_document_versions (append)
        ▼
 applyChange() + appendVersion()  ── same apply path as direct
```

Key properties:
- One server-side router (`routeDocumentEdit`) owns the policy decision. The editor and MCP both call it; neither writes documents directly.
- The **apply path** is shared by "accept a proposal" and "direct edit" so versioning and concurrency are identical for both.
- Optimistic concurrency uses the existing `creed_documents.revision` column and the existing `.eq("revision", expectedRevision)` guard in `lib/shared-documents.ts`.

## Data Models

New Supabase migration (forward-only, idempotent, RLS matching existing `creed_*` tables).

### `creed_workspace_settings` (singleton)
Mirrors the `creed_document_dashboard_global_preferences` singleton pattern (`id boolean primary key default true` with a `check (id)`).

| column | type | notes |
| --- | --- | --- |
| id | boolean pk | always `true` |
| human_edit_policy | text | `cant-edit` \| `propose` \| `direct`, default `propose` |
| agent_edit_policy | text | `cant-edit` \| `propose` \| `direct`, default `propose` |
| updated_by | uuid | |
| updated_at | timestamptz | |

### `creed_document_proposals`
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| document_id | uuid fk → creed_documents | indexed |
| actor_type | text | `human` \| `agent` |
| author_user_id | uuid null | set for human + for the accepting member |
| author_agent_label | text null | e.g. "Codex" |
| draft | jsonb | a `ProposalDraft` (rich-text/new-section/rename-section/recolor-section/delete-section/reorder-section) |
| section_id | text null | target section for section-scoped drafts |
| summary | text | short human-readable description |
| base_revision | integer | document revision the draft was authored against |
| status | text | `pending` \| `accepted` \| `rejected`, default `pending` |
| resolving | boolean | in-flight accept/reject lock (Req 6.7) |
| created_at | timestamptz | |
| resolved_at | timestamptz null | |
| resolved_by | uuid null | |

Indexes: `(document_id, status)` for the pending list per document.

### `creed_document_versions` (append-only, immutable)
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| document_id | uuid fk → creed_documents | indexed |
| revision | integer | the document revision this version produced |
| content | text | full body snapshot after the change |
| actor_type | text | `human` \| `agent` |
| author_user_id | uuid null | |
| author_agent_label | text null | |
| summary | text | e.g. "Accepted rich-text proposal", "Reverted to v4" |
| source_proposal_id | uuid null | set when produced by an accepted proposal |
| created_at | timestamptz | |

No update/delete policies — inserts only.

### Reused: `creed_documents`
`revision` (optimistic concurrency) and `content` (body-only) stay. The GitHub columns (`github_repo_owner/name/branch/path`, `last_remote_sha`, `last_synced_content_hash`, `last_synced_revision`, `sync_status`) become dead for documents; leave them in place (nullable) to avoid a destructive migration, but stop reading/writing them. A follow-up migration can drop them once nothing references them.

## Components and Interfaces

### New: `lib/document-editing.ts` (server) — the policy router + apply path
- `readWorkspaceEditPolicy(client)` → `{ human, agent }`.
- `routeDocumentEdit(client, { documentId, actorType, author, draft, sectionId, expectedRevision, summary })`
  → `{ outcome: "rejected" | "proposed" | "applied", proposal? , document? , version? }`.
  Decides via policy: `cant-edit` → `{ rejected }` (403); `propose` → `createDocumentProposal`; `direct` → `applyDocumentChange`.
- `applyDocumentChange(client, {...})` — applies a `ProposalDraft` to the document's parsed sections (reusing the markdown parse/serialize already in `file-screen`/`shared-documents`), writes content guarded on `expectedRevision`, and appends a `creed_document_versions` row in the same logical operation. Advances `revision`. This is the shared path for direct edits and accepted proposals.

### New: `lib/document-proposals.ts` (server)
- `createDocumentProposal(...)` → inserts a `pending` row with attribution + `base_revision`.
- `listDocumentProposals(client, documentId)` → pending proposals (workspace-shared).
- `acceptDocumentProposal(client, { proposalId, actorUserId })`:
  1. Atomically claim the proposal: `update ... set resolving=true where id=? and status='pending' and resolving=false returning *` — if no row, it's already resolved/locked (Req 6.6/6.7).
  2. If `base_revision` ≠ current document revision AND the draft can't apply cleanly → mark stale/return "out of date" (Req 7.4), clear `resolving`.
  3. `applyDocumentChange(...)` (apply + version, attributed to the proposal author).
  4. `update status='accepted', resolved_at, resolved_by, resolving=false`.
  5. Record `recordDocumentActivity` (reuse `lib/document-collaboration.ts`).
- `rejectDocumentProposal(...)` — same claim/lock, set `status='rejected'`, keep the row (Req 6.5), record activity.

### New: `lib/document-versions.ts` (server)
- `appendDocumentVersion(...)` (called by `applyDocumentChange`).
- `listDocumentVersions(client, documentId)`.
- `revertDocumentToVersion(client, { documentId, versionId, actorType, author, expectedRevision })` — loads the version content and routes it back through `routeDocumentEdit` as a normal change (so revert respects the edit policy and appends a new version; never deletes later versions — Req 8.3/8.4).

### API routes (session-authed, `requireApiAuth`)
- `GET/PUT /api/app/workspace-settings` — read/update the two policies.
- `POST /api/app/documents/[id]/proposals` — create (used when human policy = `propose`).
- `GET  /api/app/documents/[id]/proposals` — list pending.
- `POST /api/app/documents/[id]/proposals/[proposalId]/accept`
- `POST /api/app/documents/[id]/proposals/[proposalId]/reject`
- `GET  /api/app/documents/[id]/versions` — history.
- `POST /api/app/documents/[id]/versions/[versionId]/revert`
- Change `PUT /api/app/documents/[id]` (content) and `PATCH` (metadata) to call `routeDocumentEdit` with `actorType: "human"` instead of writing directly.

### MCP changes (`app/mcp/route.ts`)
- `creed_update_document`, `creed_update_document_metadata`, `creed_create_document` → route through `routeDocumentEdit` with `actorType: "agent"` and the agent label as `author_agent_label`. Under `propose` (default) these now create proposals; the tool result reports `{ outcome: "proposed" | "applied" }`.
- Update tool descriptions to say edits are subject to the workspace agent policy (may become proposals needing approval).
- `creed_read_document` stops returning GitHub frontmatter; returns body + structured property fields.

### Removals
- Delete `app/api/app/documents/[id]/github/**` (push, status, pull/preview, pull/apply).
- Delete `lib/document-github.ts` and the document-only GitHub helpers in `lib/shared-documents.ts` (`serializeSharedDocument` for push, `markSharedDocumentSynced`, `applyRemoteDocumentPull`, sync-hash helpers) and the `CREED_DOCUMENTS_GITHUB_*` seeding in `createSharedDocument`.
- Remove document frontmatter round-trip usage (`lib/document-markdown.ts`) from the document write/read paths (properties live in columns). Keep the file only if the profile still needs it; otherwise delete.
- Leave the profile's `creed.md` GitHub sync (`/api/app/github/*`) untouched — that's the separate, in-scope-elsewhere profile feature.

### UI (`components/creed`)
- `file-screen.tsx` (documentMode):
  - Remove Save / Publish / Pull buttons, the version split-button, and all GitHub sync dialogs/status for documents.
  - On edit: submit through the new proposal/direct route per policy. Under `direct`, apply optimistically; under `propose`, create a proposal and show it inline.
  - Render document proposals with the existing `InlineProposalDiff` / `InlineMetaProposal` and the "N proposals · Accept all / Reject all" bar (shown at 2+).
  - Add a **Version History** panel (reuse the `activeDocumentPanel` pattern next to comments/activity): list versions (attribution + timestamp), diff a version against current (reuse `computeDiffParts` / `SectionChangeRow`), and a Revert action.
- `settings-screen.tsx`:
  - Remove the legacy per-section permission grid and the single "Agent edit behaviour" control.
  - Add two `SectionPermissionControl`-style selectors bound to `human_edit_policy` and `agent_edit_policy` (values `cant-edit | propose | direct`), saved via `/api/app/workspace-settings`.

## Data Flow — edit → propose → accept → version

```
1. Author edits doc → client submits draft + expectedRevision to route.
2. routeDocumentEdit reads policy for actorType.
   - propose: insert creed_document_proposals (pending, base_revision).
              → other members see it via the document proposals list.
   - direct:  applyDocumentChange → write content (guard .eq revision)
              → append creed_document_versions → revision++.
3. A member clicks Accept on a pending proposal:
   - claim (resolving=true, status=pending) → else "already being acted on".
   - stale check (base_revision vs current) → else "out of date".
   - applyDocumentChange (attributed to proposal author) → version + revision++.
   - status=accepted; activity recorded.
4. Reject: claim → status=rejected (kept in history) → activity recorded.
5. Revert(vN): load vN.content → routeDocumentEdit (policy-gated) → new version.
```

## Error Handling

- **Policy `cant-edit`**: route returns 403 `{ error: "<actor> editing is turned off for this workspace." }`.
- **Stale revision on apply** (`updateSharedDocumentContent` conflict): 409 "Document changed since it was read." Editor re-reads and retries/merges.
- **Proposal out of date** (Req 7.4): 409 on accept; UI marks the proposal stale and offers re-review.
- **Concurrent accept/reject** (Req 6.7): the atomic `resolving` claim loses → 409 "already being acted on."
- **Accept of non-pending** (Req 6.6): 409 "no longer pending."
- All server logging via `lib/observability.ts` (`log.info/warn/error`), never `console.log`.

## Testing Strategy

- **Unit** (`lib/document-editing`, `document-proposals`, `document-versions`): policy routing table (2 actor types × 3 policies), apply-path versioning, revert-appends-not-deletes, stale-revision rejection, proposal claim/lock races.
- **Draft application**: each `ProposalDraft` kind (rich-text, new-section, rename, recolor, delete, reorder) applies correctly to parsed sections and produces the expected version content — reuse/generalize the profile's `applyProposalToSection` tests.
- **API route**: auth required; accept/reject/revert happy-path + conflict codes (403/404/409).
- **MCP**: agent edit under `propose` creates a proposal (not an apply); under `direct` applies; under `cant-edit` returns the disabled error.
- **UI**: proposals bar appears at 2+, accept/reject wiring, version history diff + revert; confirm no GitHub controls render in documentMode.
- Verify with `npx tsc --noEmit -p .`, `npm run lint`, `npm run build`; run `supabase db reset` for the new migration.

## Files: added / modified / deleted

**Added**
- `supabase/migrations/NNNN_workspace_proposal_versioning.sql`
- `lib/document-editing.ts`, `lib/document-proposals.ts`, `lib/document-versions.ts`
- `app/api/app/workspace-settings/route.ts`
- `app/api/app/documents/[id]/proposals/route.ts`
- `app/api/app/documents/[id]/proposals/[proposalId]/accept/route.ts`
- `app/api/app/documents/[id]/proposals/[proposalId]/reject/route.ts`
- `app/api/app/documents/[id]/versions/route.ts`
- `app/api/app/documents/[id]/versions/[versionId]/revert/route.ts`

**Modified**
- `lib/shared-documents.ts` (drop GitHub sync helpers + `CREED_DOCUMENTS_GITHUB_*` seeding; keep revision-guarded content/metadata writers)
- `app/api/app/documents/[id]/route.ts` (route via policy)
- `app/mcp/route.ts` (agent edits via policy; read returns body-only; tool descriptions)
- `components/creed/file-screen.tsx` (remove GitHub toolbar/sync; add document proposals + version history)
- `components/creed/settings-screen.tsx` (two-policy controls; remove legacy grid)
- `lib/document-collaboration.ts` (activity actions for proposal accepted/rejected/reverted)

**Deleted**
- `app/api/app/documents/[id]/github/**`
- `lib/document-github.ts`
- `lib/document-markdown.ts` (if the profile doesn't need it)

## Correctness Properties

Invariants the implementation must uphold (targets for property-based and unit tests):

### Property 1: Policy determinism
For any `(actorType, policy)` pair, `routeDocumentEdit` yields exactly one outcome — `rejected` iff policy is `cant-edit`, `proposed` iff `propose`, `applied` iff `direct`. No other mapping is possible.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**

### Property 2: Version-per-apply
Every applied change (accepted proposal or direct edit) appends exactly one `creed_document_versions` row and advances `creed_documents.revision` by exactly 1. No apply leaves the version count unchanged; no apply appends more than one.

**Validates: Requirements 3.1, 3.3, 10.3**

### Property 3: Append-only history
The number of versions for a document is monotonically non-decreasing. Revert appends; it never deletes or mutates existing versions. Reverting to a prior version and back yields the original content but a strictly larger version count.

**Validates: Requirements 3.4, 8.4**

### Property 4: Pending isolation
While a proposal is `pending`, the target document's applied `content` and `revision` are unchanged by that proposal's existence.

**Validates: Requirements 4.5**

### Property 5: At-most-once resolution
A given proposal transitions out of `pending` at most once. Concurrent accept/reject attempts result in exactly one success and the rest failing with a conflict, and the proposal's draft is applied to the document at most once.

**Validates: Requirements 6.4, 6.6, 6.7**

### Property 6: Concurrency guard
No document write succeeds when submitted against a revision other than the document's current revision; a stale write is always rejected without mutating content.

**Validates: Requirements 7.4, 10.1, 10.2, 10.3**

### Property 7: Reject safety
Rejecting a proposal never changes document content and never appends a version; the rejected proposal remains retrievable in history and is never returned to `pending` automatically.

**Validates: Requirements 6.3, 6.5**

### Property 8: Attribution preservation
The attribution recorded on a version produced by an accepted proposal equals the proposal's author, not the accepting member.

**Validates: Requirements 7.2, 13.1, 13.2**

## Migration / Back-Compat

- Existing documents keep their body-only `content`; no data migration needed.
- The dormant GitHub columns on `creed_documents` are left nullable and unused (non-destructive); a later cleanup migration can drop them.
- `sync_status` values already stored are ignored by the new UI.
- Profile (`creed.md`) GitHub sync and profile proposals are untouched.

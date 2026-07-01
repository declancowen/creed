# Review: Full working-tree change (AI/GitHub-sync removal + Supabase document workspace)

## Scope

Entire uncommitted working tree vs `HEAD` (66f3b2a): 62 tracked files changed
(+6051/-6127) plus new untracked source (proposals/versions/comments APIs,
document references + mentions, dashboard folders, MCP client mgmt, migrations,
tests). Excludes non-source untracked dirs (`Creator Platform Notion Export 2/`,
`.skills-tmp/`) which are now gitignored.

Intended change: remove AI BYOK + quality-scoring and document GitHub sync; add a
Supabase-only shared-document workspace with two edit policies (human/agent each:
cant-edit|propose|direct), proposal + append-only version history, comments as
private pending proposals, soft-delete + restore for docs/folders, `[[doc:]]`/
`[[folder:]]` references and `@`-mentions, mermaid blocks, dashboard folder views,
and MCP client management.

## Review status

| Field | Value |
|-------|-------|
| Last reviewed | 2026-07-01 14:06 |
| Total turns | 1 |
| Open findings | 0 (3 deferred with rationale) |
| Resolved this turn | 8 |

## Turn 1 — 2026-07-01 14:06

**Method:** four gates first (tsc/lint/tests/build all green on the original
tree), then a parallel cluster read (removals, proposals API, editor/refs,
dashboard/folders, core+MCP, config/security) with every reported finding
independently re-verified against the code before fixing.

**Outcome:** all clear after fixes. Auth verified present on every new
`/api/app/*` route; `/mcp` + `/api/creed/write` token auth intact; comment
privacy verified (pending comments only via `listPendingCommentsForUser` scoped
to `created_by`); editor XSS-safe (doc-reference innerHTML is hardcoded SVG;
mermaid `securityLevel: "strict"`).

**Risk:** High (shared contracts, agent contract, migrations, policy routing,
destructive folder delete) — reduced to Low after fixes.

### Resolved findings

- **C1 (Med, concurrency)** `lib/document-editing.ts` — `propose` path recorded
  `baseRevision` from a fresh re-read, defeating the accept-time stale-write
  guard. Now uses `input.expectedRevision` (falls back to current revision when
  the caller omitted it, preserving prior behaviour for agents that don't send
  one).
- **C3 (Med, policy bypass)** `app/mcp/route.ts` — `creed_create_folder`,
  `creed_archive_document`, `creed_archive_folder` did not honor the agent
  `cant-edit` policy. Added the same gate the other mutation tools use.
- **C4/D1 (Med, data loss)** `lib/shared-documents.ts` — `deleteSharedDocumentFolder`
  hard-deleted documents by `folder_id` with no archive filter, destroying live
  (individually-restored) docs in an archived subtree. Now deletes only archived
  docs; survivors fall back to root via `folder_id on delete set null`.
- **D2/D3 (Low, stranded data)** `lib/shared-documents.ts` — restoring a doc/
  folder whose container is still archived left it invisible. Restore now
  detaches to root when the parent/folder is archived or gone.
- **R1 (Med, agent contract)** `lib/creed-data.ts` — hidden agent guidance still
  advertised the removed `creed_get_quality_report` tool. Removed.
- **R2 (Low, agent contract)** `lib/creed-data.ts` — "quality popover" wording
  referenced removed UI. Reworded to "Content structure rules".
- **C5/R3 (Low, agent contract)** `app/mcp/route.ts` — removed stale GitHub-sync
  references from `creed_list_documents`, `creed_read_document`, and the activity
  tool descriptions; removed the dead `githubPath` input from `creed_create_document`.
- **X1 (Low, defense-in-depth)** `next.config.ts` — added `/dashboard/:path*` to
  `NO_STORE_PATHS` (per-user page). `/documents` intentionally omitted — not a route.

### Deferred (with rationale)

- **R4 (Low)** unreachable GitHub-pull branch in `components/creed/file-screen.tsx`
  (documentMode arm is gated off) — remove during the Fallow dead-code pass to
  avoid churning the 2700-line god file in a deploy-oriented turn.
- **C2 (Low)** re-pressing Save under `propose` can create duplicate pending
  proposals (no content dedupe) — needs file-screen state work; scheduled for the
  audit phase.
- **X2 (advisory)** `mermaid` uses a caret range; renders user content but is
  already `securityLevel: "strict"`. Optional exact-pin.

### Validation

- `npx tsc --noEmit -p .` — clean
- `npm run lint` — 0 errors, 37 pre-existing warnings
- `npm test` — 68/68
- `npm run build` — success

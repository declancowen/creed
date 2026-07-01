# Review: Workspace proposal-based versioning (Model S, Supabase-only)

## Project context

| Field | Value |
|-------|-------|
| **Repository** | Creed |
| **Remote** | github.com/declancowen/Creed |
| **Branch** | `main` (uncommitted working tree) |
| **Stack** | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind v4, Supabase (Postgres + RLS + auth), OpenRouter BYOK |

## Scope

- `supabase/migrations/20260701120000_add_workspace_proposal_versioning.sql` — added Turn 1
- `lib/workspace-settings.ts` — added Turn 1
- `lib/document-editing.ts` — added Turn 1
- `lib/document-versions.ts` — added Turn 1
- `app/api/app/workspace-settings/route.ts` — added Turn 1
- `app/api/app/documents/[id]/route.ts` (PUT/PATCH) — added Turn 1
- `app/api/app/documents/[id]/proposals/**` + `versions/**` — added Turn 1
- `app/mcp/route.ts` (document tools + `MCP_INSTRUCTIONS`) — added Turn 1
- `components/creed/document-review-panel.tsx` — added Turn 1
- `components/creed/file-screen.tsx` (documentMode edit/review wiring, GitHub-sync removal) — added Turn 1
- `components/creed/settings-screen.tsx` (two-policy edit UI) — added Turn 1
- `AGENTS.md` — added Turn 1

Adjacent uncommitted work reviewed at surface level only (see coverage note): `components/creed/rich-text-editor.tsx` (in-editor comment composer + mermaid), `components/creed/extensions/mermaid-block.tsx`, `app/(creed-app)/dashboard/**`, `app/api/app/document-folders/**`, document restore routes, `components/creed/create-document-dialog.tsx`, `app/globals.css`, `package.json`/lockfile.

## Hotspots

- `edit-policy routing` (human/agent × cant-edit/propose/direct) — added Turn 1
- `optimistic-concurrency + append-only versioning` (`expectedRevision`, revision advance) — added Turn 1
- `agent contract drift` (MCP tool descriptions vs actual policy behavior) — added Turn 1
- `client review-state freshness` (proposal list vs applied revision) — added Turn 1

## Review status

| Field | Value |
|-------|-------|
| **Review started** | 2026-07-01 11:50 |
| **Last reviewed** | 2026-07-01 12:03 |
| **Total turns** | 2 |
| **Open findings** | 0 |
| **Resolved findings** | 5 |
| **Accepted findings** | 1 (O1-4, consistent with current single-workspace model) |

---

## Turn 2 — 2026-07-01 12:03

| Field | Value |
|-------|-------|
| **Commit** | `66f3b2a` (working tree, uncommitted) |
| **IDE / Agent** | Kiro / Claude Opus 4.8 |

**Summary:** Follow-up on "why defer". Closed the two deferred items that were genuinely worth doing now and formally accepted the one that is not a fix. `O1-1` (cross-user proposal liveness) fixed by polling; `O1-3` (local policy-type re-declaration) fixed by importing the canonical type + a compile-time guard; `O1-4` (RLS `using(true)`) accepted with rationale.
**Outcome:** all clear (proposal-versioning slice). Partial review boundary on adjacent uncommitted work unchanged.
**Risk score:** Low (Turn 2) — both fixes are additive and localized; no schema, API contract, or write-path change.
**Change archetypes:** shared-UI, polling/liveness, type-consolidation.
**Confidence:** High for the two fixes; adjacent-work boundary still unreviewed.
**Deep-review evidence:** Pass A — poll mirrors the existing `creed-provider`/`notification-menu` pattern (interval + focus + visibility pause), no new fetch contract; refetch is idempotent GET. Pass B — removed a duplicate type definition and added a `satisfies` guard so the settings UI cannot drift from the canonical union.
**Bug classes / invariants checked:** client review-state freshness (now covered on local create, applied revision, focus, visibility, and 30s poll); UI/enum contract drift (now compile-time enforced).
**Branch totality:** Re-verified no live-source references to removed GitHub modules; both edited files re-linted in isolation; full tsc/tests re-run.
**Residual risk / unknowns:** Poll interval is 30s, so another member's proposal can lag up to 30s unless the tab regains focus (immediate on focus). Adjacent uncommitted files (`creed-provider.tsx`, `rich-text-editor.tsx`) are being actively edited and produced transient tsc/lint failures during this run that cleared on re-run — they are not part of this feature and remain out of scope.

### Validation

- `npx tsc --noEmit -p .` — passed (clean on re-run; one transient mid-save read in `creed-provider.tsx` cleared immediately)
- `npm test` (vitest) — passed (62/62)
- `npx eslint` on both edited files — passed

### Resolved / Carried / New findings

#### O1-1 — Cross-user proposal liveness (RESOLVED)
- **Fix applied:** `DocumentReviewPanel` now polls `refresh()` every 30s, pausing when the tab is hidden and refetching on window focus and when the tab becomes visible. Mirrors the app's existing polling pattern rather than introducing Supabase realtime.
- **Prevention artifact:** liveness is now structural (interval + focus/visibility), not dependent on a manual reload.

#### O1-3 — Local `EditPolicyValue` re-declaration (RESOLVED)
- **Fix applied:** `settings-screen.tsx` imports `EditPolicyValue` from `lib/workspace-settings` and drops the local alias. Added `EDIT_POLICY_OPTIONS satisfies readonly { value: EditPolicyValue }[]` as a zero-runtime compile-time guard.
- **Prevention artifact:** the `satisfies` guard fails the build if the UI options ever diverge from the canonical union.

#### O1-4 — RLS `select using (true)` on the three new tables (ACCEPTED, not a fix)
- **Decision:** Accepted. This matches the existing shared-document tables and the product's current single shared workspace; all writes still go through the service-role client behind `requireApiAuth`. "Fixing" it would mean building per-workspace tenancy that does not exist yet, which would be speculative.
- **Revisit trigger:** introduction of multiple workspaces/tenants — at that point reads must be workspace-scoped rather than `using (true)`.

### Recommendations

1. **Fix first:** Done — O1-1 and O1-3 closed this turn.
2. **Defer on purpose:** Only O1-4, and only because it is a future-tenancy note, not a defect. Recorded with an explicit revisit trigger.
3. **Patterns noticed:** Live editing of unrelated files during verification produces transient tsc/lint failures; re-run to confirm before treating as real.

---

## Turn 1 — 2026-07-01 11:56

| Field | Value |
|-------|-------|
| **Commit** | `66f3b2a` (working tree, uncommitted) |
| **IDE / Agent** | Kiro / Claude Opus 4.8 |

**Summary:** Reviewed the Model S proposal-versioning vertical slice end to end: schema, policy router, apply/version path, proposal lifecycle, HTTP + MCP surfaces, settings UI, and the document-viewer review panel. Focus per user request: (a) agent files + MCP structured correctly against the data model, (b) frontend/backend in sync. Ran a dual pass (correctness/safety + maintainability/structure). Fixed one Medium behavioral gap and two Low contract/docs gaps in this turn.

**Outcome:** all clear with low-risk unknowns (proposal-versioning slice); partial review on adjacent uncommitted work.
**Risk score:** Medium — shared contract, auth-gated writes, a schema migration, optimistic concurrency, and the agent-facing contract all changed, but blast radius is scoped to the shared-document workspace and there is strong unit coverage of the router/versioning invariants.
**Change archetypes:** contract change, migration, shared-UI, optimistic/persisted state, security/authz-adjacent, removal (GitHub sync).
**Intended change:** Replace document GitHub sync with a Supabase-only proposal + append-only version model; every edit is gated by two independent workspace policies (human/agent: `cant-edit|propose|direct`, default `propose`); any workspace member can accept/reject; accepting applies + versions.
**Intent vs actual:** Matches. Writes go through `routeDocumentEdit` for both actors; accepted proposals and direct edits share one apply path (`applyDocumentContent`) that guards on `expectedRevision` and appends exactly one version.
**Confidence:** Medium-High — core write path traced through UI, HTTP, MCP, lib, and schema; 62 unit tests cover Correctness Properties 1-8. Confidence held below High because adjacent uncommitted work in the same tree is only surface-reviewed and there is no multi-user realtime proof.
**Coverage note:** Full trace of the proposal-versioning slice. Adjacent work (comment composer, mermaid, folders, dashboard, restore) NOT deeply reviewed — see residual risk.
**Static/analyzer evidence:** Not used this turn (no Fallow run tied to this diff). `npm run lint` used as the lint gate.
**Architecture impact:** Improves current-state failure mode: removes the two-way GitHub sync + `409` divergence guard that had no reconcile path, replacing it with a single source of truth (Supabase) and an in-app review/version model. Reduces one whole class of sync-divergence bugs.
**Deep-review evidence:** Dual pass completed. Pass A (correctness/safety): write-path contract, policy gating, concurrency, and agent contract all consistent; one client-freshness gap found (B1-1). Pass B (maintainability/structure): apply/version logic is centralized in one place (good); found local type re-declaration (O1-3) and doc/discoverability gaps (F1-1, O1-2).
**Remediation plans:** Not requested. Fixes applied inline this turn; residual items are Low and deferred.
**Bug classes / invariants checked:** optimistic-concurrency stale-write rejection; append-only version monotonicity; policy routing table (2×3); at-most-once proposal resolution (claim-lock); attribution preservation; agent-contract truthfulness (tool description == behavior).
**Branch totality:** Working tree vs `HEAD`. Verified no live source references to the deleted `lib/document-github.ts` or `app/api/app/documents/[id]/github/**` (only historical mentions remain in `.reviews/`, `.kiro/`, `.audits/` docs).
**Sibling closure:** Checked both write entry points (human PUT + agent MCP) and both metadata paths (human PATCH + `creed_update_document_metadata`) for consistent policy gating. Confirmed the legacy section-proposal UI (`ReviewPill`) is disabled in document mode (`pendingProposals = []`), so there is no duplicate proposal surface.
**Remediation impact surface:** B1-1 fix touches only the review panel refresh trigger and one call site; no API or schema change.
**Residual risk / unknowns:** (1) No realtime/poll for proposals authored by *other* members — they appear after reload/remount (O1-1). (2) Adjacent uncommitted comment-composer/mermaid/folder work is unreviewed and one file (`rich-text-editor.tsx`) was mid-save during the run. (3) RLS grants `select` to all authenticated users on the three new tables (O1-4) — consistent with the existing single shared-workspace model, but would need revisiting under multi-workspace tenancy.

### Validation

- `npx tsc --noEmit -p .` — passed
- `npm run lint` — passed (0 errors, 41 pre-existing warnings)
- `npm test` (vitest) — passed (62/62)
- `npm run build` — passed prior turn after clearing a corrupted `.next-runtime` dev-types file; no source change since that affects build output
- `git grep` for deleted GitHub modules/routes in live source — no hits

### Branch-totality proof

- **Non-delta files/systems re-read:** migration (data-model source of truth), `lib/workspace-settings.ts`, `lib/document-editing.ts` (`draftContent`, `mapProposal`, `applyDocumentContent`, `routeDocumentEdit`, `revertDocumentToVersion`), `lib/document-versions.ts`.
- **Prior open findings rechecked:** none (Turn 1).
- **Prior resolved/adjacent areas revalidated:** confirmed the earlier GitHub-sync removal left no dangling imports.
- **Hotspots or sibling paths revisited:** both actor write paths + both metadata paths; document-mode vs profile-mode proposal rendering.
- **Dependency/adjacent surfaces revalidated:** settings policy contract (GET/PUT `{policy}`) against the settings-screen loader/saver.
- **Why this is enough:** the feature's correctness lives in one apply/route path with direct unit coverage; the UI, HTTP, and MCP layers are thin adapters over it and were each traced to that path.

### Challenger pass

`done` — Assumed one serious issue remained and hunted the weakest-evidence area (client review-state freshness). Found B1-1 (proposal created via Save not reflected until reload). Also probed: metadata-not-versioned divergence (intentional, now documented — F1-1), and read-authz on the new tables (consistent with existing model — O1-4). No Critical/High remained.

### Resolved / Carried / New findings

#### B1-1 — Review panel did not refresh after a proposal created from the editor (RESOLVED)
- **Type/Severity:** Bug / Medium
- **File:** `components/creed/document-review-panel.tsx`, `components/creed/file-screen.tsx`
- **What:** Under the default `propose` policy, saving in the editor creates a pending proposal, but the review panel only refetched on mount or when the document `revision` changed. A proposal does not advance `revision`, so the just-created proposal did not appear until the view remounted or reloaded.
- **Root cause:** Panel refetch keyed on `[documentId, revision]` only; the propose path returns without a revision change and had no refresh signal.
- **Codebase implication:** Undercuts the headline review loop for the most common (default) policy; a user could believe their change was lost.
- **Evidence:** `handleSaveDocument` `proposed` branch toasts + reloads activity but did not touch the panel; panel `useEffect(..., [refresh, revision])`.
- **Fix applied:** Added an optional `refreshSignal` prop to `DocumentReviewPanel` (included in the refetch effect deps). `file-screen.tsx` holds `reviewRefreshKey`, increments it in the `proposed` branch of `handleSaveDocument`, and passes it to the panel. Accept/revert already refresh via the `revision` change through `onDocumentUpdated`.
- **Remediation radius:** Must-fix-now (bounded, in newly added code). Done.
- **Prevention artifact:** The `refreshSignal` prop is the reusable hook for any future write path that creates a proposal without changing revision.
- **Verification:** tsc + lint + tests green after the change.

#### F1-1 — `creed_update_document_metadata` description omitted policy gating (RESOLVED)
- **Type/Severity:** Flag / Low
- **File:** `app/mcp/route.ts`
- **What:** Metadata updates are gated by the agent `cant-edit` policy but apply directly (never versioned/proposed) — an intentional divergence from content edits. The tool description said nothing about this, so an agent could not tell metadata is not proposal-gated.
- **Root cause:** Description not updated when the metadata path was deliberately kept as a direct write.
- **Fix applied:** Description now states it is subject to the agent edit policy (blocked when agent editing is off, otherwise applied directly, not versioned/proposed).
- **Remediation radius:** Should-fix-now (cheap contract clarity). Done.
- **Prevention artifact:** Contract stated in the tool description that ships to every connected agent.

#### O1-2 — AGENTS.md lib layout omitted the new modules (RESOLVED)
- **Type/Severity:** Observation / Low
- **File:** `AGENTS.md`
- **What:** The `lib/` layout list did not mention `workspace-settings.ts`, `document-editing.ts`, `document-versions.ts`.
- **Fix applied:** Added all three with one-line descriptions.

#### O1-1 — No realtime/poll for proposals authored by other members (OPEN, deferred)
- **Type/Severity:** Observation / Low
- **File:** `components/creed/document-review-panel.tsx`
- **What:** The panel fetches on mount, on `revision` change, and now on local proposal creation, but has no subscription/poll. A proposal created by another user appears only after reload/remount.
- **Why defer:** Acceptable for v1; the workspace is not promised realtime for proposals. If desired later, add a Supabase realtime subscription or a lightweight poll keyed on document id.
- **Prevention artifact:** N/A (feature enhancement, not a defect).

#### O1-3 — `settings-screen.tsx` re-declares `EditPolicyValue` locally (OPEN, deferred)
- **Type/Severity:** Observation / Low
- **File:** `components/creed/settings-screen.tsx`
- **What:** A local `EditPolicyValue` type is derived from `EDIT_POLICY_OPTIONS` instead of importing from `lib/workspace-settings.ts`. Structurally identical today; drift risk if the enum changes.
- **Why defer:** No current bug. Fold into the next settings-screen touch by importing the canonical type.

#### O1-4 — New tables grant `select` to all authenticated users (OPEN, deferred, consistent-with-existing)
- **Type/Severity:** Observation / Low
- **File:** `supabase/migrations/20260701120000_add_workspace_proposal_versioning.sql`
- **What:** `creed_workspace_settings`, `creed_document_proposals`, `creed_document_versions` grant `select` to `authenticated` with `using (true)`; all writes go through the service-role client behind `requireApiAuth`. This matches the existing shared-document tables (single shared workspace).
- **Why defer:** No regression versus the current model. Flag for revisit if/when per-workspace tenancy is introduced (reads would then need workspace scoping, not `using (true)`).

### Recommendations

1. **Fix first:** Done — B1-1 (panel freshness) fixed and verified.
2. **Then address:** Nothing blocking. Optional: O1-3 (import the canonical policy type) on the next settings edit.
3. **Patterns noticed:** The one-apply-path design (`applyDocumentContent` shared by direct edits and accepted proposals) is the right call — concurrency/versioning correctness lives in a single place with direct test coverage.
4. **Suggested approach:** If multi-user liveness becomes a requirement, add a realtime subscription in `DocumentReviewPanel` rather than polling in `file-screen`.
5. **Architecture transition:** GitHub document sync fully removed with no dangling references; profile `creed.md` GitHub sync (`/api/app/github/*`) intentionally untouched and still present.
6. **Defer on purpose:** O1-1, O1-3, O1-4. Adjacent uncommitted comment-composer/mermaid/folders/dashboard work is a separate change set and should get its own review pass before commit.

### Coverage limitation (partial review)

This review deep-covers the proposal-versioning feature only. The working tree also contains unrelated in-progress changes (`rich-text-editor.tsx` in-editor comment composer, `mermaid-block.tsx`, document folders + restore, dashboard data split, `create-document-dialog.tsx`, `globals.css`, dependency bumps). Those were not traced. Note: during this run a full `eslint` pass transiently reported `CommentComposerPopover is not defined` in `rich-text-editor.tsx`; a re-run and the TS language server both came back clean, indicating a mid-save partial read rather than a real defect. That file is actively being edited and should be re-reviewed once its change set is settled.

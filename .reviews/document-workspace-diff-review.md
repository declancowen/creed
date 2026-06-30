# Document Workspace Diff Review

Date: 2026-06-30
Scope: local working tree changes for invite auth, dashboard documents, `/file` document mode, comments/activity, BYOK-only settings, billing removal, Phosphor icon migration, and final pill palette updates.

## Outcome

Status: issues found and fixed in this pass. No open blocking findings remain.

## Findings Fixed

### B1 - Google/GitHub connect used manual identity linking

Severity: high

Fix:
- Invite Google connect and Settings Google/GitHub connect now use guarded OAuth sign-in instead of Supabase identity-link calls.
- `/auth/callback` verifies `expected_email` before accepting the OAuth session or saving GitHub integration tokens.
- Mismatched OAuth emails sign out and redirect back with `oauth_email_mismatch`.

### B2 - Credits and payment paths stayed live after UI removal

Severity: high

Fix:
- Removed visible/runtime credits and payment app routes.
- AI settings normalize to BYOK and reject non-BYOK writes.
- AI credential resolution is BYOK-only.
- Removed the Stripe SDK dependency and collapsed legacy entitlement checks to an explicit self-hosted allow shim.
- Removed the old refund-only OAuth revoke helper that became dead code.

### B3 - Dashboard grouping did not cover all document properties

Severity: medium

Fix:
- Dashboard grouping now includes priority and t-shirt size.
- Dragging between groups updates status/type/stage/lifecycle/priority/size.
- Added a migration to extend dashboard preference `group_by` constraints.

### B4 - Group drag state could remain visually active

Severity: medium

Fix:
- Document rows/cards clear drag state on `dragend`.
- Drop handling clears drag state before applying a property update.

### B5 - Document comments were panel-only

Severity: medium

Fix:
- `/file` section cards now render lightweight live comment markers for open comments whose reference quote appears in that section.
- Selecting a marker opens the existing comments panel on that comment.

### B6 - Invalid `/file?document=` values fell back to the personal editor

Severity: medium

Fix:
- `/file` now returns `notFound()` for unknown document slugs.

### B7 - Product UI still mixed old icon wrappers with Phosphor icons

Severity: low

Fix:
- Active signed-in and login surfaces now use the local Phosphor adapter.
- The shared action wrapper now accepts regular Phosphor icon components.
- Fallow dead-code cleanup removed the orphaned old icon wrapper files.

### B8 - New document API routes repeated auth/JSON/error boilerplate

Severity: low

Fix:
- Added shared authenticated JSON parsing and result-error helpers in `lib/api-auth.ts`.
- Updated document, folder, comment, notification, and dashboard-preference routes to use them.

## Verification

- `npx tsc --noEmit -p .` passed.
- `npm run lint` passed with warnings only.
- `npm test` passed, 23 tests.
- `npm audit --json` passed with 0 vulnerabilities.
- `npm run build` passed.
- `git diff --check` passed.
- Fallow dead-code passed with 0 issues in normal and production modes.

## Notes

- Fallow health remains grade B because of existing large-file complexity hotspots in `components/creed/file-screen.tsx`, `lib/creed-backend.ts`, `components/creed/settings-screen.tsx`, and adjacent god files. This pass reduced dead code and duplication without rewriting those files.
- Local `supabase db reset` could not run because Docker is not running.

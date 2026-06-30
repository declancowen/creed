# Full Repo Audit

Date: 2026-06-30
Scope: invite-only auth, shared document dashboard, `/file` document editor reuse, comments/activity, GitHub integration, BYOK settings, marketing/billing removal, icons, and Supabase migrations.

## Result

Status: pass with one environment caveat.

## Checks

- `/api/app/*` routes all contain `requireApiAuth()` or `requireApiJson()`.
- `/api/creed/*` and `/mcp` remain token/OAuth authenticated.
- Old marketing, signup, onboarding, pricing, payment, and billing routes were removed.
- Active app icons now import the local Phosphor adapter.
- Dashboard and editor property pills share the same property metadata and widened color palette.
- Supabase migrations cover shared documents, folders, comments, activity, notifications, dashboard properties/preferences, GitHub sync fields, and BYOK-only AI settings.
- GitHub routes are session-authenticated before using integration data.

## Verification

- `npx tsc --noEmit -p .` passed.
- `npm run lint` passed with warnings only.
- `npm test` passed, 23 tests.
- `npm audit --json` passed with 0 vulnerabilities.
- `npm run build` passed.
- `git diff --check` passed.
- Fallow dead-code passed with 0 issues in normal and production modes.
- Fallow health: B, 76.5.
- Fallow duplication: 4.9996%.

## Caveat

- `supabase db reset` did not run locally because Docker is not running: `Cannot connect to the Docker daemon at unix:///var/run/docker.sock`.

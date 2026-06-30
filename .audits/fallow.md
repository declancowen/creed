# Fallow Audit

Date: 2026-06-30
Branch: `main`

## Result

- Dead-code, normal mode: 0 issues.
- Dead-code, production mode: 0 issues.
- Health score: B, 76.5.
- Duplication: 4.9996%, 49 clone groups.

## Actions Taken

- Removed unused marketing, onboarding, public route, old icon, billing, Stripe, roadmap, and service-worker code.
- Removed unused package dependencies, including Stripe.
- Pruned the last dead billing export found after the payment cleanup.
- Added a shared authenticated JSON route helper, reducing API duplication below Fallow's duplication penalty threshold.
- Kept a single inline suppression for the generated Next route import in `next-env.d.ts`.

## Accepted Structural Debt

Fallow health still flags complexity in pre-existing large modules:

- `components/creed/file-screen.tsx`
- `components/creed/creed-provider.tsx`
- `lib/creed-backend.ts`
- `components/creed/shell.tsx`
- `components/creed/settings-screen.tsx`
- `lib/ai/quality.ts`
- `lib/creed-data.ts`

Those are architectural follow-up candidates. Refactoring them was out of scope for this branch because the user's requested behavior depends on keeping the existing `/file` surface and settings wiring intact.

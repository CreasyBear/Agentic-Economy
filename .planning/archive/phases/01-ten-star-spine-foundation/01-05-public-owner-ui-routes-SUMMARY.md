---
phase: 01
plan: 05
slug: public-owner-ui-routes
status: complete
subsystem: public-owner-ui
tags: [tanstack-start, public-routes, owner-readback, claim-flow, seo, accessibility]
requires: [01-01-substrate-and-guardrails, 01-02-contracts-schema-idempotency-admin-foundation, 01-03-business-claim-publish-suppress, 01-04-admin-dispute-operator-recovery]
provides:
  - public and owner TanStack route shells for home, claim, success, owner status, removal request, and business profile
  - AE public layout, form, feedback, and status components
  - source-owned public owner readback seam
  - source-owned public business SEO metadata and JSON-LD builders
  - Playwright public-owner route and accessibility specs
affects:
  - src/routes
  - src/components/ae
  - src/components/ui
  - src/lib/ui
  - src/modules/catalog
  - src/modules/seo
  - tests/e2e
  - tests/seo
  - tests/unit
tech_stack:
  added:
    - TanStack public route adapters under root src/routes
    - shadcn-style field/input/select/textarea/empty/spinner primitives
    - Playwright compact and wide public-owner specs
  patterns:
    - route shells delegate status/readback logic to module-owned seams
    - human labels map from shared status presentation helpers
    - SEO metadata and JSON-LD are generated from source-owned public catalog DTOs
key_files:
  created:
    - src/components/ae/feedback/AeEmptyState.tsx
    - src/components/ae/forms/AeClaimFormSection.tsx
    - src/components/ae/forms/AeReviewBlock.tsx
    - src/components/ae/status/AeCapabilityList.tsx
    - src/components/ae/status/AeStatusCard.tsx
    - src/components/ui/empty.tsx
    - src/components/ui/field.tsx
    - src/components/ui/input.tsx
    - src/components/ui/native-select.tsx
    - src/components/ui/spinner.tsx
    - src/components/ui/textarea.tsx
    - src/modules/catalog/internal/owner-public-flow.ts
    - src/modules/seo/internal/public-business-seo.ts
    - src/routes/$slug.tsx
    - src/routes/claim.success.tsx
    - src/routes/claim.tsx
    - src/routes/owner.status.tsx
    - src/routes/privacy.remove-business.tsx
    - tests/e2e/a11y/public-owner-a11y.spec.ts
    - tests/e2e/public-owner-ui.spec.ts
    - tests/seo/public-business-seo.test.ts
    - tests/unit/catalog/owner-public-flow.test.ts
  modified:
    - src/components/ae/layout/AePublicShell.tsx
    - src/lib/ui/status-presentation.ts
    - src/modules/catalog/internal/public-catalog-dto.ts
    - src/modules/catalog/public.ts
    - src/modules/seo/internal/json-ld.ts
    - src/modules/seo/public.ts
    - src/routeTree.gen.ts
    - src/routes/index.tsx
    - tests/unit/catalog/public-catalog-dto.test.ts
    - tests/unit/seo-json-ld.test.ts
decisions:
  - Public route copy stays narrow: claim, publish, status readback, unavailable capabilities, and removal/correction only.
  - Owner/public status display uses shared presentation helpers rather than route-local status/color/copy decisions.
  - Public business SEO is source-owned and receives only the public catalog DTO, keeping private owner/admin/contact fields out of metadata.
  - Browser specs use public route behavior and do not assert authenticated Clerk flows while real Clerk credentials are absent.
metrics:
  started_at: "2026-06-27T23:00:00Z"
  completed_at: "2026-06-28T01:30:00Z"
  commits: 4
---

# Phase 01 Plan 05: Public Owner UI Routes Summary

Public and owner UI route shells now expose the truthful first owner journey: claim, success/readback, public business profile, and removal/correction request.

## What Shipped

| Task | Result | Commit |
|---|---|---|
| 01-05-B/F | Added owner public readback and public business SEO/JSON-LD seams. | 8961e8c |
| 01-05-A/B/C/D/E/F | Added public layout/components plus `/`, `/claim`, `/claim/success`, `/owner/status`, `/privacy/remove-business`, and `/{slug}` routes. | c7743b7 |
| 01-05-G | Made the public skip target programmatically focusable for keyboard proof. | fb98147 |
| 01-05-G | Added Playwright public-owner route and a11y coverage for compact and wide projects. | 0152af2 |

## Verification

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | Passed | `tsc --noEmit` completed. |
| `npm run test:unit` | Passed | 19 files, 51 tests. |
| `npm run test:integration` | Passed | 1 file, 2 tests. |
| `npm run test:copy` | Passed | 2 files, 18 tests. |
| `npm run test:seo` | Passed | 1 file, 1 test. |
| `npm run test:ui-contract` | Passed | 2 files, 2 tests. |
| `npm run test:imports` | Passed | 3 files, 3 tests. |
| `npm run test:source-mining` | Passed | 1 file, 1 test. |
| `npm run test:ts-standards` | Passed | 1 file, 1 test. |
| `npm test` | Passed | 31 files, 82 tests. |
| `npm run build` | Passed | Client and SSR bundles built. |
| `npm run check:convex-codegen` | Blocked | Sandboxed run now reaches network startup after `.env.local` adds `CONVEX_DEPLOYMENT`, but fails on external Sentry DNS. Elevated rerun was rejected because Convex CLI telemetry would send project/deployment metadata externally without explicit user approval. |
| `npm run test:e2e` | Blocked | Sandboxed run could not bind `127.0.0.1:3000`. Elevated run with `.env.local` failed because the backup did not contain real Clerk keys and the placeholder publishable key is malformed. A rerun with a syntactically valid local-only Clerk placeholder and installed Chromium started Vite, then Chromium navigation failed with `net::ERR_NAME_NOT_RESOLVED` for local route loads. |
| `npm run test:a11y` | Blocked | Same local server and Clerk/browser environment blockers as `test:e2e`; a11y specs are present under `tests/e2e/a11y`. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Actual route layout] Adapted route paths to root TanStack Start layout**
- **Found during:** Tasks A-F
- **Issue:** The plan referenced `apps/web/src/routes`, but this repo uses root `src/routes`.
- **Fix:** Added all public owner route adapters under `src/routes` and regenerated `src/routeTree.gen.ts`.
- **Files modified:** `src/routes/*`, `src/routeTree.gen.ts`
- **Commits:** c7743b7

**2. [Rule 2 - Missing critical functionality] Added shared status conversion helpers**
- **Found during:** Tasks E-F
- **Issue:** Owner/public readback needed to show separate public, index, discovery, trust, capability, and first-request states without route-local raw labels.
- **Fix:** Added status conversion and first-request label helpers to `src/lib/ui/status-presentation.ts`, then composed them from AE status components.
- **Files modified:** `src/lib/ui/status-presentation.ts`, `src/components/ae/status/*`, `src/routes/*`
- **Commits:** c7743b7

## Environment Notes

- `.env.local` now contains the Convex deployment derived from the backup URL: `dev:modest-mockingbird-218` and `https://modest-mockingbird-218.convex.cloud`.
- The backup repo did not contain real Clerk credentials or a Clerk issuer. `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, and `CLERK_JWT_ISSUER_DOMAIN` still need real values before local browser rendering, authenticated flows, and Convex auth codegen can be fully proven.
- Playwright Chromium was installed locally during verification after the first browser run reported the browser binary was missing.

## Known Stubs

| Stub | File | Reason |
|---|---|---|
| Source-owned default public owner flow | `src/modules/catalog/internal/owner-public-flow.ts` | Provides deterministic first-route readbacks until live Convex-backed owner/session resolution is wired. |
| Clerk-backed browser proof | `.env.local`, `tests/e2e/*` | Real Clerk test credentials were not present in the backup or current repo, so Playwright could not complete route rendering proof against the actual auth middleware. |
| Convex auth codegen | `convex/auth.config.ts` | `CLERK_JWT_ISSUER_DOMAIN` remains unset and elevated Convex telemetry/network execution requires explicit user approval. |

## Threat Flags

None beyond planned PR05 surfaces. Public routes render only source-owned DTO/readback data, omit raw owner/admin/private contact authority fields, and keep bookings/payments/automated actions explicitly unavailable.

## Self-Check: PASSED WITH ENVIRONMENT BLOCKERS

- Summary file created at `.planning/phases/01-ten-star-spine-foundation/01-05-public-owner-ui-routes-SUMMARY.md`.
- Task commits found: 8961e8c, c7743b7, fb98147, 0152af2.
- No tracked files were deleted by task commits.

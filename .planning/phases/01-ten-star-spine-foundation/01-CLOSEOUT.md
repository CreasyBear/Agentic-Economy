---
phase: 01-ten-star-spine-foundation
status: blocked-final-r10-evidence
created: 2026-06-28
updated: 2026-06-28
source_plan: 01-09-deploy-readback-closeout
---

# Phase 01 Closeout

Phase 01 is not closed. The non-browser local suite is green, the deploy smoke harness is executable and fail-closed, but the current full local Playwright run is not green, Convex codegen is auth-gated, live deploy smoke inputs are absent, and five-owner internal-alpha evidence does not exist.

## Closeout Decision

| Gate | Decision | Evidence |
|---|---|---|
| Non-browser local implementation suite | Pass | Typecheck, unit, integration, copy, import, source-mining, type, standards, SEO, UI contract, and build passed on 2026-06-28. |
| Local browser suite | Blocked | `npm run test:e2e` with command-scoped local Clerk bypass passed 16 checks and failed 2 `/registry` checks because the server could not find public function `registry:listPublicBusinessCatalog`. |
| Convex codegen/readback | Auth-gated | `npm run check:convex-codegen` returned Convex `401 Unauthorized: MissingAccessToken`; real generated bindings, Clerk issuer, and Convex readbacks are not proven. |
| Deployment readback | Blocked | `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `SMOKE_ADMIN_STORAGE_STATE`, `SMOKE_OWNER_STORAGE_STATE`, and `SMOKE_BUSINESS_SLUG` are missing from the shell environment and absent from `.env.local`. |
| Deploy smoke harness | Ready but env-gated | `npm run test:deploy-smoke` is executable and fail-closed, but it was not run because required deploy URLs, storage states, and business slug were missing. |
| Internal founder-assisted alpha | Not ready | `01-ALPHA-EVIDENCE.md` records 0 of 5 real friendly-owner activation rows. Current evidence is local instrumentation plus a Sam rehearsal only. |
| Public launch | Not ready | GTM readiness still requires owner activation proof, deployed readback, attribution, support capacity, and clean live discovery evidence. |

## Local Verification Run

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | Pass | `tsc --noEmit`. |
| `npm run test:unit` | Pass | 31 files, 110 tests. |
| `npm run test:integration` | Pass | 8 files, 25 tests. |
| `npm run test:e2e` | Fail closed | 16 passed, 2 failed on `/registry`; server error: `Could not find public function for 'registry:listPublicBusinessCatalog'`. |
| `npm run test:a11y` | Pass local | 4/4 with command-scoped local Clerk bypass values. |
| `npm run test:copy` | Pass | 3 files, 28 tests. |
| `npm run test:imports` | Pass | 3 files, 3 tests. |
| `npm run test:source-mining` | Pass | 1 file, 2 tests. |
| `npm run test:types` | Pass | 1 file, 4 tests. |
| `npm run test:ts-standards` | Pass | 1 file, 1 test. |
| `npm run test:seo` | Pass | 2 files, 8 tests. |
| `npm run test:ui-contract` | Pass | 2 files, 2 tests. |
| `npm run build` | Pass | Client and SSR bundles built. |
| `npm run check:convex-codegen` | Auth gate | Convex returned `401 Unauthorized: MissingAccessToken` and suggested `npx convex dev`. |
| `npm run test:deploy-smoke` | Not run | Required deploy inputs were missing; see `01-DEPLOY-READBACK-EVIDENCE.md`. |

Browser commands used only command-scoped local values:

```bash
VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true \
VITE_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5jb20k \
CLERK_SECRET_KEY=sk_test_placeholder \
npm run test:e2e
```

The same local-only bypass shape was used for `npm run test:a11y`. Fake Clerk keys were not written to `.env.local`, and these browser passes do not prove real Clerk behavior.

## Deploy Smoke Harness

Added `npm run test:deploy-smoke`, backed by:

- `playwright.deploy-smoke.config.ts`
- `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`

The harness requires:

```text
DEPLOY_BASE_URL
DEPLOY_CONVEX_URL
SMOKE_ADMIN_STORAGE_STATE
SMOKE_OWNER_STORAGE_STATE
SMOKE_BUSINESS_SLUG
```

It covers the Phase 1 deployment/readback surface:

- Public HTML routes: `/`, `/claim`, `/claim/success`, `/privacy/remove-business`, `/registry`, `/{slug}`.
- Public API routes: `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}`.
- Discovery routes: `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`.
- Admin readback routes: `/admin/claims`, `/admin/audit-events`, `/admin/index-health`.
- Header checks for content type, no-store cache headers, and CORS on discovery routes.
- SEO/discovery parity checks: published page indexability, missing page noindex, sitemap exclusions, llms unsupported-capability honesty, robots private-route exclusions.
- Clerk/session expectations: owner storage state must be denied from admin routes; admin storage state must see operator readback surfaces.
- Convex URL expectation: deployed HTTPS URL must be non-local and reachable without a 5xx response.

Storage-state files are local operator artifacts and must stay out of git.

## What Is Not Proven

No live Vercel preview or production URL was tested in this run. No real Convex deployment was read back. No real Clerk session or middleware behavior was proven. No suppression or kill-switch behavior was exercised against a live deployment. The current full local Playwright suite is also not green because `/registry` fails without the generated Convex public function `registry:listPublicBusinessCatalog`.

The deploy smoke test now encodes those expectations so the next operator run can fail on real evidence instead of passing silently.

## R10 Evidence Artifacts

| Artifact | Status | Decision |
|---|---|---|
| `01-DEPLOY-READBACK-EVIDENCE.md` | Blocked | Records local command results, Convex `MissingAccessToken`, local `/registry` browser failure, missing deploy inputs, and deploy harness coverage. |
| `01-ALPHA-EVIDENCE.md` | Blocked | Records 0 of 5 real owner activation rows and the required row shape. |
| `01-INTERNAL-ALPHA-READINESS.md` | Not ready | Points to the alpha evidence artifact and keeps five-owner readiness blocked. |

## GTM and Internal Alpha

`.planning/phases/01-ten-star-spine-foundation/01-INTERNAL-ALPHA-READINESS.md` remains authoritative for the current alpha decision:

- current status: not alpha-ready;
- blocker: five real friendly-owner activation rows do not exist; Plan 01-15 recorded 0/5;
- current proof: instrumentation and local Sam route rehearsal only;
- still required: real owner attempts, source/channel attribution, share or interest evidence, friction/failure notes, and no unresolved P0 local/deployed failures.

No public launch, paid acquisition, Product Hunt-style campaign, partner push, payment claim, booking claim, action claim, inbox claim, developer/API platform claim, or Phase 2+ capability claim is supported by Phase 01 evidence.

## Review Artifacts

Fable 5 accepted findings are mapped in `.planning/phases/01-ten-star-spine-foundation/01-FABLE-CLOSEOUT.md`. Remaining Fable risk is evidence-gated: real Clerk/Convex/deploy proof and five-owner activation evidence.

Matt Pocock review context is prepared in `.planning/phases/01-ten-star-spine-foundation/01-MATT-REVIEW-CONTEXT.md`. The artifact keeps Standards and Spec review axes separate. This closeout does not claim that an external Matt review has been run.

## Remaining Risks

1. Convex codegen/deploy readback is blocked until Convex CLI authentication and real Clerk/Convex configuration are available.
2. Full local Playwright is not green until `/registry` can resolve generated Convex public function `registry:listPublicBusinessCatalog` or an approved local readback path.
3. Admin transport-level HTTP denial is not proven live because no real Clerk/session deployment was available.
4. Suppression, cache invalidation, operator repair, and kill-switch behavior are locally covered through module/route tests but not deployed/readback verified.
5. Internal alpha remains blocked until five friendly owners create activation evidence rows.
6. Dirty top-level planning files already existed before this plan; this closeout intentionally records Phase 01 status in phase-owned artifacts rather than mixing unrelated planning changes.

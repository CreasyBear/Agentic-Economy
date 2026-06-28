---
phase: 01-ten-star-spine-foundation
status: blocked-for-live-deploy-readback
created: 2026-06-28
updated: 2026-06-28
source_plan: 01-09-deploy-readback-closeout
---

# Phase 01 Closeout

Phase 01 has a green local product/test suite and an executable deployment smoke harness. It is not live-deploy verified, not Convex/Clerk verified, not internal-alpha ready, and not public-launch ready.

## Closeout Decision

| Gate | Decision | Evidence |
|---|---|---|
| Local implementation suite | Pass | Typecheck, unit, integration, browser, copy, import, source-mining, type, standards, SEO, UI contract, build, and full Vitest passed on 2026-06-28. |
| Convex codegen/readback | Blocked | `npm run check:convex-codegen` fails on external DNS/Sentry fetch and still lacks real `CLERK_JWT_ISSUER_DOMAIN`; no network approval was requested. |
| Deployment readback | Blocked | No `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, Clerk session storage states, or approval/evidence for live Vercel/Convex/Clerk smoke was available. |
| Deploy smoke harness | Ready but env-gated | `npm run test:deploy-smoke` is executable and fails clearly when required deploy env/storage-state inputs are missing. |
| Internal founder-assisted alpha | Not ready | Fewer than five friendly-owner activation rows exist. Current evidence is local instrumentation plus a Sam rehearsal only. |
| Public launch | Not ready | GTM readiness still requires owner activation proof, deployed readback, attribution, support capacity, and clean live discovery evidence. |

## Local Verification Run

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | Pass | `tsc --noEmit`. |
| `npm run test:unit` | Pass | 22 files, 63 tests. |
| `npm run test:integration` | Pass | 5 files, 13 tests. |
| `npm run test:e2e` | Pass | 16/16 with command-scoped local Clerk bypass values. Initial sandbox server bind failed; rerun with local server permissions passed. |
| `npm run test:a11y` | Pass | 4/4 with command-scoped local Clerk bypass values. |
| `npm run test:copy` | Pass | 3 files, 28 tests. |
| `npm run test:imports` | Pass | 3 files, 3 tests. |
| `npm run test:source-mining` | Pass | 1 file, 2 tests. |
| `npm run test:types` | Pass | 1 file, 3 tests. |
| `npm run test:ts-standards` | Pass | 1 file, 1 test. |
| `npm run test:seo` | Pass | 2 files, 7 tests. |
| `npm run test:ui-contract` | Pass | 2 files, 2 tests. |
| `npm run build` | Pass | Client and SSR bundles built. |
| `npm test` | Pass | 40 files, 122 tests. |
| `npm run test:deploy-smoke` with no env | Expected fail | Fails before test execution with missing `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `SMOKE_ADMIN_STORAGE_STATE`, `SMOKE_OWNER_STORAGE_STATE`, and `SMOKE_BUSINESS_SLUG`. |
| `npm run check:convex-codegen` | Blocked | Fails with `TypeError: fetch failed` and `getaddrinfo ENOTFOUND o1192621.ingest.sentry.io`; real Clerk issuer/network approval still missing. |

Browser commands used only command-scoped local values:

```bash
VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true \
VITE_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5jb20k \
CLERK_SECRET_KEY=sk_test_placeholder \
npm run test:e2e
```

The same local-only values were used for `npm run test:a11y`. Fake Clerk keys were not written to `.env.local`.

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

No live Vercel preview or production URL was tested in this run. No real Convex deployment was read back. No real Clerk session or middleware behavior was proven. No suppression or kill-switch behavior was exercised against a live deployment.

The deploy smoke test now encodes those expectations so the next operator run can fail on real evidence instead of passing silently.

## GTM and Internal Alpha

`.planning/phases/01-ten-star-spine-foundation/01-INTERNAL-ALPHA-READINESS.md` remains authoritative for the current alpha decision:

- current status: not alpha-ready;
- blocker: five real friendly-owner activation rows do not exist;
- current proof: instrumentation and local Sam route rehearsal only;
- still required: real owner attempts, source/channel attribution, share or interest evidence, friction/failure notes, and no unresolved P0 local/deployed failures.

No public launch, paid acquisition, Product Hunt-style campaign, partner push, payment claim, booking claim, action claim, inbox claim, developer/API platform claim, or Phase 2+ capability claim is supported by Phase 01 evidence.

## Review Artifacts

Fable 5 accepted findings are mapped in `.planning/phases/01-ten-star-spine-foundation/01-FABLE-CLOSEOUT.md`. Remaining Fable risk is evidence-gated: real Clerk/Convex/deploy proof and five-owner activation evidence.

Matt Pocock review context is prepared in `.planning/phases/01-ten-star-spine-foundation/01-MATT-REVIEW-CONTEXT.md`. The artifact keeps Standards and Spec review axes separate. This closeout does not claim that an external Matt review has been run.

## Remaining Risks

1. Convex codegen/deploy readback is blocked until real Clerk issuer configuration exists and explicit networked Convex CLI approval is granted.
2. Admin transport-level HTTP denial is not proven live because no real Clerk/session deployment was available.
3. Suppression, cache invalidation, operator repair, and kill-switch behavior are locally covered through module/route tests but not deployed/readback verified.
4. Internal alpha remains blocked until five friendly owners create activation evidence rows.
5. Dirty top-level planning files already existed before this plan; this closeout intentionally records Phase 01 status in a new phase-owned artifact rather than mixing unrelated planning changes.

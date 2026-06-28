---
phase: 01-ten-star-spine-foundation
source_plan: 01-15
status: passed
created: 2026-06-28
updated: 2026-06-28
evidence_timestamp_utc: 2026-06-28T15:26:38Z
requirements: [R10]
---

# Phase 01 Deploy and Readback Evidence

R10 technical deployment/readback evidence is green as of 2026-06-28T15:26:38Z. This artifact covers local command gates, Convex codegen, and live Vercel/Convex/Clerk smoke. It does not cover the separate five-owner internal-alpha gate.

## Latest Formal Recheck

| Check | Result | Evidence |
|---|---:|---|
| Local non-browser suite | PASS | Typecheck, unit, integration, types, imports, source-mining, TS standards, copy, SEO, UI contract, and build all passed. |
| Local browser suite | PASS LOCAL | `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e` passed 20 checks across compact and wide Chromium. |
| Local a11y suite | PASS LOCAL | `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:a11y` passed 4 checks. |
| Convex codegen | PASS | `CI=1 CONVEX_VERSION_API_ORIGIN=http://127.0.0.1:9 npm run check:convex-codegen` reached `loyal-peacock-107`, uploaded/analyzed functions, generated dry-run bindings, and completed TypeScript. |
| Clerk storage states | REFRESHED | Admin and owner smoke storage states were refreshed through Clerk sign-in tokens. Token/cookie/secret values were not printed or committed. |
| Deploy smoke | PASS | `npm run test:deploy-smoke` passed 5/5 against `https://agentic-economy-phi.vercel.app` and `https://loyal-peacock-107.convex.cloud` using slug `agentic-economy-r10-smoke`. |

## Command Evidence

| Command | Result |
|---|---:|
| `npm run typecheck` | PASS |
| `npm run test:unit` | PASS, 31 files / 110 tests |
| `npm run test:integration` | PASS, 8 files / 26 tests |
| `npm run test:types` | PASS, 1 file / 4 tests |
| `npm run test:imports` | PASS, 3 files / 3 tests |
| `npm run test:source-mining` | PASS, 1 file / 2 tests |
| `npm run test:ts-standards` | PASS, 1 file / 1 test |
| `npm run test:copy` | PASS, 3 files / 28 tests |
| `npm run test:seo` | PASS, 2 files / 8 tests |
| `npm run test:ui-contract` | PASS, 2 files / 2 tests |
| `npm run build` | PASS |
| `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e` | PASS, 20 checks |
| `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:a11y` | PASS, 4 checks |
| `CI=1 CONVEX_VERSION_API_ORIGIN=http://127.0.0.1:9 npm run check:convex-codegen` | PASS |
| `DEPLOY_BASE_URL=... DEPLOY_CONVEX_URL=... SMOKE_*... npm run test:deploy-smoke` | PASS, 5 checks |

## Deploy Smoke Coverage

The live smoke covered:

- public HTML routes: `/`, `/claim`, `/claim/success`, `/privacy/remove-business`, `/registry`, and `/{slug}`;
- public APIs: `/api/businesses`, `/api/businesses/search?q=`, and `/api/businesses/{slug}`;
- discovery outputs: `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, and `/robots.txt`;
- content-type, no-store cache, CORS, canonical/noindex/index, private-route exclusion, and unsupported-capability copy;
- owner storage-state denial from `/admin/claims`, `/admin/audit-events`, and `/admin/index-health`;
- admin storage-state readback for claims, audit events, index health, repair/readback, and public surfaces;
- explicit HTTPS Convex deployment reachability without a 5xx response.

## Security Notes

- Secret values, Clerk sign-in tokens, and storage-state contents were not printed.
- `.auth/admin.json` and `.auth/owner.json` remain local operator artifacts and must not be committed.
- The local browser bypass remains command-scoped behind `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`; deployed smoke uses real Clerk/Vercel/Convex behavior.

## Remaining Non-Deploy Evidence

This artifact is passed, but Phase 01 R10 as a whole is not fully passed until `01-ALPHA-EVIDENCE.md` has five real owner activation rows and the review/requirements traceability gaps recorded in `01-VERIFICATION.md` are resolved or explicitly deferred.

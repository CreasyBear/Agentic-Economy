---
phase: 01-ten-star-spine-foundation
source_plan: 01-15
status: blocked
created: 2026-06-28
updated: 2026-06-28
evidence_timestamp_utc: 2026-06-28T10:38:00Z
requirements: [R10]
---

# Phase 01 Deploy and Readback Evidence

R10 is blocked. This artifact records the final evidence gate exactly as run on
2026-06-28 and does not treat local rehearsal, missing deploy inputs, or missing
Convex authentication as green production evidence.

## Input Status

Only key names and status are recorded. Secret values and storage-state contents
were not printed.

| Input | Shell env status | `.env.local` key status | Evidence impact |
|---|---|---|---|
| `CLERK_JWT_ISSUER_DOMAIN` | missing | present-empty | Real Convex auth configuration is not proven. |
| `CLERK_SECRET_KEY` | missing | present-empty | Real Clerk server auth is not proven. |
| `CONVEX_DEPLOYMENT` | missing | present-nonempty | Deployment name exists locally, but CLI auth is missing. |
| `VITE_CLERK_PUBLISHABLE_KEY` | missing | present-empty | Real browser Clerk proof is not available. |
| `VITE_CONVEX_URL` | missing | present-nonempty | Convex URL exists locally, but codegen still auth-gates. |
| `DEPLOY_BASE_URL` | missing | absent | Deploy smoke cannot run. |
| `DEPLOY_CONVEX_URL` | missing | absent | Deploy smoke cannot run. |
| `SMOKE_ADMIN_STORAGE_STATE` | missing | absent | Admin deploy readback cannot run. |
| `SMOKE_OWNER_STORAGE_STATE` | missing | absent | Non-admin denial readback cannot run. |
| `SMOKE_BUSINESS_SLUG` | missing | absent | Durable deployed business readback cannot run. |

## Local Command Evidence

| Command | Result | Evidence |
|---|---:|---|
| `npm run typecheck` | PASS | `tsc --noEmit` exited 0. |
| `npm run test:unit` | PASS | 31 files, 110 tests passed. |
| `npm run test:integration` | PASS | 8 files, 25 tests passed. |
| `npm run test:copy` | PASS | 3 files, 28 tests passed. |
| `npm run test:imports` | PASS | 3 files, 3 tests passed. |
| `npm run test:source-mining` | PASS | 1 file, 2 tests passed. |
| `npm run test:types` | PASS | 1 file, 4 tests passed. |
| `npm run test:ts-standards` | PASS | 1 file, 1 test passed. |
| `npm run test:seo` | PASS | 2 files, 8 tests passed. |
| `npm run test:ui-contract` | PASS | 2 files, 2 tests passed. |
| `npm run build` | PASS | Client and SSR production builds completed. |
| `npm run test:a11y` with command-scoped local Clerk bypass | PASS LOCAL | 4 Playwright accessibility tests passed. This is local route proof, not real Clerk/deploy proof. |
| `npm run test:e2e` with command-scoped local Clerk bypass | FAIL CLOSED | 16 tests passed and 2 registry route tests failed. The Vite server reported `Could not find public function for 'registry:listPublicBusinessCatalog'`, so `/registry` did not render the expected heading in compact or wide Chromium. |
| `npm run check:convex-codegen` | AUTH GATE | Convex CLI returned `401 Unauthorized: MissingAccessToken: An access token is required for this command.` The CLI suggested authenticating with `npx convex dev`. |

The local Playwright bypass used only command-scoped placeholder values for route
rendering. No fake Clerk keys were written to `.env.local`.

## Convex Codegen Readback

`npm run check:convex-codegen` did not pass. The observed blocker is Convex CLI
authentication:

```text
401 Unauthorized: MissingAccessToken: An access token is required for this command.
Authenticate with `npx convex dev`
```

Because the command stopped at the Convex access-token gate, this run does not
prove generated function bindings, the real Clerk issuer, real Clerk keys, or
live Convex deployment readbacks.

## Local Browser Readback

The full local browser suite is not green in this checkout. The failing route is
`/registry`; both compact and wide Chromium failed to find the registry heading
after the server raised the missing generated Convex public function error for
`registry:listPublicBusinessCatalog`.

This is recorded as fail-closed evidence. It was not fixed in Plan 01-15 because
this plan owns evidence artifacts and deploy-smoke harness files only, and the
failure is in the existing durable registry/runtime codegen boundary.

## Deploy Smoke Evidence

`npm run test:deploy-smoke` was not run in Task 2 because the plan and user
instructions require all non-secret deploy inputs and storage-state paths to be
present before executing live smoke.

| Required input | Status | Decision |
|---|---|---|
| `DEPLOY_BASE_URL` | missing from shell env; absent from `.env.local` | Block deploy smoke. |
| `DEPLOY_CONVEX_URL` | missing from shell env; absent from `.env.local` | Block deploy smoke. |
| `SMOKE_ADMIN_STORAGE_STATE` | missing from shell env; absent from `.env.local` | Block admin readback. |
| `SMOKE_OWNER_STORAGE_STATE` | missing from shell env; absent from `.env.local` | Block non-admin denial readback. |
| `SMOKE_BUSINESS_SLUG` | missing from shell env; absent from `.env.local` | Block durable business readback. |

Storage-state files are local operator artifacts and must not be committed.

## Deploy Smoke Harness Coverage

No harness edit was needed in Task 2. The existing deploy-smoke spec already
fails closed on missing inputs and checks the R10 live-readback surfaces when the
inputs are provided:

- public HTML routes: `/`, `/claim`, `/claim/success`, `/privacy/remove-business`, `/registry`, and `/{slug}`;
- public APIs: `/api/businesses`, `/api/businesses/search?q=`, and `/api/businesses/{slug}`;
- discovery routes and headers: `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, and `/robots.txt`;
- durable slug presence across registry/API/discovery outputs from the provided `SMOKE_BUSINESS_SLUG`;
- sitemap and llms omissions for admin/private/suppressed/future capability surfaces;
- owner storage-state denial from `/admin/claims`, `/admin/audit-events`, and `/admin/index-health`;
- admin storage-state readback for claims, audit events, index health, repair/readback, and public surfaces;
- explicit HTTPS, non-local `DEPLOY_CONVEX_URL` reachability without a 5xx response.

Because no live Vercel/Convex/Clerk URL, storage state, or durable business slug
was available, this artifact records blocked deploy evidence rather than a
skipped green.

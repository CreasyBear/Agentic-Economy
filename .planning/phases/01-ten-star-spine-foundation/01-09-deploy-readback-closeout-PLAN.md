---
phase: 01
plan: 09
slug: deploy-readback-closeout
status: ready-for-execution
wave: 9
depends_on: [01-01-substrate-and-guardrails, 01-02-contracts-schema-idempotency-admin-foundation, 01-03-business-claim-publish-suppress, 01-04-admin-dispute-operator-recovery, 01-05-public-owner-ui-routes, 01-06-registry-search-api-repair, 01-07-discovery-llms-sitemap-robots, 01-08-gate-suite-review-alpha-readiness]
requirements: [R10]
created: 2026-06-27
---

# 01-09 — Deployment Readback Closeout Plan

## Objective

Prove Phase 1 works outside local tests by deploying/readback-smoking Vercel, Convex, and Clerk, checking public HTTP behavior and private/admin denial, then closing the phase only if local, deployed, product, security, SEO/AEO, and GTM evidence all agree.

## Authority Inputs

- `01-SPEC.md` R10.
- `PHASE.md` PR09, launch checklist, runtime kill-switches, GTM gate.
- `01-VALIDATION.md` manual-only deployment/readback verification.
- `.planning/GTM-READINESS.md`, `.planning/SEO-AEO-SPEC.md`, `.planning/SECURITY-SPEC.md`.
- Skills: `tanstack-start-best-practices`, `clerk-tanstack-patterns`, `convex`, `accessibility`, `playwright-best-practices`, `product-design`.

## Scope

### In

- Vercel preview/live URL readback.
- Convex deployment/codegen readback.
- Clerk middleware/session readback.
- HTTP smoke for `/`, `/claim`, `/claim/success`, `/privacy/remove-business`, `/registry`, `/api/businesses`, `/api/businesses/search?q=`, `/api/businesses/{slug}`, `/{slug}`, `/{slug}/ucp`, `/llms.txt`, `/sitemap.xml`, `/robots.txt`.
- `/admin/*` 401/403 for non-admin.
- Cache/content-type/CORS header checks.
- Search Console/Bing setup only when a domain exists; AI visibility baseline only when public domain exists.
- Runtime kill-switch behavior test.

### Out

- No public launch announcement, paid acquisition, Product Hunt, partner campaign, payments, actions, inbox, or Phase 2 implementation.

## Implementation Steps

| ID | Change | Files | Acceptance |
|----|--------|-------|------------|
| 01-09-A | Run full local suite one final time. | no planned code unless failures require fixes | Local suite green before deploy/readback. |
| 01-09-B | Deploy/readback Vercel + Convex + Clerk. | deployment config/readme only if behavior or setup changed | Preview/live URL, Convex deployment/codegen, and Clerk session/middleware evidence recorded. |
| 01-09-C | Run executable HTTP route smoke. | `tests/deploy-smoke/phase1-deploy-smoke.spec.ts`, `package.json` script `test:deploy-smoke` | `npm run test:deploy-smoke` passes against `DEPLOY_BASE_URL`, `DEPLOY_CONVEX_URL`, `SMOKE_ADMIN_STORAGE_STATE`, `SMOKE_OWNER_STORAGE_STATE`, and `SMOKE_BUSINESS_SLUG`; every listed public route returns expected status/body/header; admin routes deny non-admin. |
| 01-09-D | Verify discovery/SEO/AEO deployed parity. | smoke evidence | No private URLs in sitemap/llms; published page not noindexed; private/admin not indexable; content-type/cache/CORS correct. |
| 01-09-E | Verify suppression and kill switches in deployed/readback mode. | smoke evidence/tests | Operator controls change behavior and audit/readback; suppression hides page/search/API/sitemap/llms/UCP. |
| 01-09-F | Final closeout artifact. | `.planning/phases/01-ten-star-spine-foundation/01-CLOSEOUT.md` or GSD verifier artifact | Launch checklist complete, review findings resolved/recorded, GTM internal-alpha gate status clear, remaining risks explicit. |

## Product Design Pass

- **Primary user/job/object/outcome:** founder/operator decides whether internal alpha can begin; object is deployed launch spine; outcome is verified real-world behavior and honest remaining risk.
- **Rendered/deployed states:** public happy path, empty registry, no results, suppressed/not found, degraded discovery, admin denied, operator repair readback, invalid claim form, long owner text.
- **Quality bar:** deployment proof does not replace compact/wide rendered UI evidence or accessibility checks.

## Verification

Local:

```text
npm run typecheck
npm run check:convex-codegen
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run test:copy
npm run test:imports
npm run test:source-mining
npm run test:types
npm run test:ts-standards
npm run test:seo
npm run test:ui-contract
npm run build
```

Executable deploy smoke command:

```text
DEPLOY_BASE_URL=https://... DEPLOY_CONVEX_URL=https://... SMOKE_ADMIN_STORAGE_STATE=.auth/admin.json SMOKE_OWNER_STORAGE_STATE=.auth/owner.json SMOKE_BUSINESS_SLUG=<published-slug> npm run test:deploy-smoke
```

Storage-state files are local operator artifacts and must not be committed.

Deployed/readback smoke must cover:

```text
/
/claim
/claim/success
/privacy/remove-business
/registry
/api/businesses
/api/businesses/search?q=
/api/businesses/{slug}
/{slug}
/{slug}/ucp
/llms.txt
/sitemap.xml
/robots.txt
/admin/* non-admin denial
cache/content-type/CORS headers
Convex deployment/codegen readback
Clerk middleware/session readback
operator controls, kill switches, and suppression behavior
```

## Stop Conditions

- Local and deployed behavior disagree.
- Any public discovery route leaks suppressed/private/admin data.
- Admin/operator health cannot reconstruct claim → publish → index → manifest.
- Runtime kill-switches are untested.
- `/mattpocock-review`, Fable closeout mapping, product-design UI evidence, or GTM internal-alpha evidence remains unresolved.

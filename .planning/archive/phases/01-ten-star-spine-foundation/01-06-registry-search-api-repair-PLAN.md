---
phase: 01
plan: 06
slug: registry-search-api-repair
status: ready-for-execution
wave: 6
depends_on: [01-01-substrate-and-guardrails, 01-02-contracts-schema-idempotency-admin-foundation, 01-03-business-claim-publish-suppress, 01-04-admin-dispute-operator-recovery, 01-05-public-owner-ui-routes]
requirements: [R5, R6, R8, R10]
created: 2026-06-27
---

# 01-06 — Registry, Search, API, Repair Plan

## Objective

Expose a strict, read-only public registry/search/API projection backed by the source-owned catalog DTO, with durable projection attempts, forced-failure readback, retry/rebuild repair, and admin/owner visibility into stale or degraded indexing.

## Authority Inputs

- `01-SPEC.md` R5, R6, R8, R10.
- `PHASE.md` PR06.
- `01-PATTERNS.md` clusters 6, 13, 14, 15, 16.
- `.planning/AI-SPEC.md` public JSON catalog contract.
- `.planning/SEO-AEO-SPEC.md` public API/schema parity.
- Source-mining ledger rows for backup registry/search analogs.
- Skills: `tanstack-start-best-practices`, `tanstack-router-best-practices`, `convex`, `codebase-design`, `product-design`.

## Scope

### In

- `syncCatalogProjection`, `retryRegistryProjection`, `listPublicBusinessCatalog`, `searchPublicBusinessCatalog`, `getPublicBusinessCatalogBySlug`, `getIndexStatus`, `readCatalogHealth`.
- Routes: `/registry`, `/api/businesses`, `/api/businesses/search`, `/api/businesses/{slug}`, `/admin/index-health` completed beyond prior shell.
- Deterministic Convex-backed search across name, service name, category, suburb, state, postcode, and service-area tokens.
- Projection/readback state with logical key, source hash/version, status, retry count, retry-after, redacted failure, timestamps, repair action/result.

### Out

- No external search engine, ranking, marketplace ordering, usage leaderboard, API keys, SDK docs, MCP/OpenAPI, payment/action fields, or discovery manifest route.

## Implementation Steps

| ID | Change | Files | Acceptance |
|----|--------|-------|------------|
| 01-06-A | Implement registry projection from catalog DTO. | `src/modules/registry/internal/projection-attempts.ts`, `convex/registry.ts` | Published eligible business queues and writes projection item; source hash/version stored. |
| 01-06-B | Implement durable attempt/readback/retry semantics. | registry/observability modules, tests | Forced adapter failure persists admin-visible failed attempt; retry succeeds without duplicate audit/projection side effects. |
| 01-06-C | Implement deterministic public list/search/detail APIs. | `src/modules/registry/public.ts`, API routes | Suppressed/unpublished absent; stable pagination; explicit empty/404/error shapes; no private owner/contact fields. |
| 01-06-D | Implement `/registry` UI. | route and AE list/search components | Loading/empty/no-results/populated/pagination/error states render; search story for Sam works. |
| 01-06-E | Complete `/admin/index-health`. | admin route/components | Operator can answer source state, projection attempt, affected public surfaces, repair action, and repair result. |
| 01-06-F | Add schema parity and route tests. | `tests/integration/registry*.test.ts`, `tests/e2e/registry*.spec.ts`, `tests/seo/*` | API/page/registry share DTO or explicit typed subset; route tests cover 404/empty/suppressed. |

## Product Design Pass

- **Primary user/job/object/outcome:** customer/search agent searches for current public service catalogs; owner/operator sees whether their listing is indexed; object is registry projection; outcome is findable facts plus repairable stale state.
- **States:** no records, query no results, populated, suppressed absent, stale/degraded projection, failed attempt, retry in progress, retry success/failure.
- **Copy:** registry is "strict but measure everything" — no ranking/demand/marketplace theatre.
- **Admin UX:** repair action is explicit and auditable, not a hidden manual ops instruction; `/registry` and `/admin/index-health` require compact/wide, keyboard, focus, label/error, and long-content proof.

## Verification

```text
npm run typecheck
npm run check:convex-codegen
npm run test:unit
npm run test:integration
npm run test:e2e
npm run test:a11y
npm run test:copy
npm run test:ui-contract
npm run test:seo
npm run test:imports
npm run build
```

## Stop Conditions

- Registry/search route assembles its own DTO or writes source state directly.
- Search requires Meilisearch/external engine in Phase 1.
- Projection failure is only logged or warned and not persisted with repair action.
- API exposes private fields, raw DB rows, dead documented routes, API keys, MCP/OpenAPI, or callable/payment fields.

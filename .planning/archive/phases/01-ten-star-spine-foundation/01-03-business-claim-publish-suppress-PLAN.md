---
phase: 01
plan: 03
slug: business-claim-publish-suppress
status: ready-for-execution
wave: 3
depends_on: [01-01-substrate-and-guardrails, 01-02-contracts-schema-idempotency-admin-foundation]
requirements: [R3, R6, R8, R10]
created: 2026-06-27
---

# 01-03 — Business Claim, Publish, Suppression Plan

## Objective

Implement the source-owned no-ABN claim → service catalog publish → suppression mutation path with CSRF, rate-limit, duplicate/impersonation checks, idempotency, audit, and projection invalidation hooks before public route exposure.

## Authority Inputs

- `01-SPEC.md` R3 and related edge/prohibition coverage.
- `PHASE.md` PR03 interfaces and acceptance tests.
- `01-PATTERNS.md` clusters 4, 5, 9, 10.
- `.planning/source-mining/phase-1-ledger.md` row for backup `convex/claimPublishing.ts`.
- `.planning/SECURITY-SPEC.md` CSRF, duplicate, suppression, prompt-injection, and redaction rules.
- Skills: `convex`, `convex-setup-auth`, `clerk-tanstack-patterns`, `tanstack-start-best-practices`, `codebase-design`.

## Scope

### In

- `claimBusiness`, `publishBusinessCatalog`, `suppressBusiness`, `getPublicBusinessCatalog`, `readCatalogHealth` through public module seams and Convex functions.
- Required security helpers: `assertCsrf`, `rateLimitClaim`, `detectDuplicateClaim`, owner binding check, deterministic slug allocation.
- Catalog DTO builder enough to return source-owned public data for tests and later routes.
- Projection/discovery queue records as durable attempts or pending work items; no public discovery route yet.

### Out

- No public `/claim` or `/{slug}` UI route. Tests call module/server seams directly.
- No external search, no UCP route, no sitemap/llms route, no booking/payment/callable semantics.

## Implementation Steps

| ID | Change | Files | Acceptance |
|----|--------|-------|------------|
| 01-03-A | Implement server-derived actor/owner binding and claim creation. | `src/modules/business/internal/claim.ts`, `convex/business.ts` | Anonymous claims fail; authenticated owner can create no-ABN claim with valid T0 facts. |
| 01-03-B | Add deterministic slug and duplicate/impersonation fingerprint handling. | `src/modules/security/internal/duplicates.ts`, business tests | Same normalized business gets deterministic conflict/pending-review behavior without leaking existing owner details. |
| 01-03-C | Add CSRF/same-site Origin and rate limit in every session-cookie mutation path. | `src/modules/security/internal/{csrf,rate-limit}.ts` | Missing/foreign CSRF rejected; buckets written/read through source state. |
| 01-03-D | Implement service row and first-request disclosure validation. | `src/modules/catalog/internal/first-request.ts`, `src/modules/catalog/internal/public-catalog-dto.ts` | Publish requires at least one valid service; raw contact values stay out of public DTO; unavailable modes carry reason. |
| 01-03-E | Implement idempotent publish through the catalog owner seam. | `src/modules/catalog/internal/publish.ts`, `src/modules/catalog/public.ts`, `convex/catalog.ts` | Repeated publish returns same result and creates one audit/projection/discovery attempt per logical target without business-module ownership of catalog writes. |
| 01-03-F | Implement scoped suppression and invalidation through owning public seams or a typed outbox. | `src/modules/business/internal/visibility.ts`, `src/modules/catalog/public.ts`, `src/modules/observability/internal/outbox.ts` | Suppression hides catalog reads and records audit plus registry/discovery invalidation intent without importing registry/discovery `internal/*`. |
| 01-03-G | Add integration/unit coverage. | `tests/integration/claim-publish.test.ts`, `tests/unit/*` | All PHASE.md PR03 acceptance tests are covered. |

## Product Design Pass

- **Primary user/job/object/outcome:** Sam claims his business and publishes emergency plumbing service facts; object is a public business/service catalog; outcome is truthful source-owned public eligibility without ABN and without implying booking/payment/action.
- **States to preserve for UI:** claim pending, contested, rejected, publish pending, publish failed, published-not-indexed, suppressed, unavailable service, unavailable first request, non-callable, non-payable.
- **Consequences:** publish queues registry and discovery attempts through owning seams or typed outbox; suppression removes exposure everywhere; both must be auditable and reversible only through recorded authority.
- **Copy risk:** owner-authored text is untrusted data and never instructions for public/agent outputs.

## Verification

```text
npm run typecheck
npm run check:convex-codegen
npm run test:unit
npm run test:integration
npm run test:types
npm run test:ts-standards
npm run test:imports
npm run test:source-mining
npm run test:copy
```

## Stop Conditions

- Browser input supplies actor, ownerId, adminId, Clerk ID, trust tier, public status, or admin authority.
- Capability `available` emits booking, payment, callable, action, or endpoint semantics.
- Publish creates duplicate audit/projection rows under retry.
- Suppression changes only one public surface or relies on cache expiry instead of source eligibility.

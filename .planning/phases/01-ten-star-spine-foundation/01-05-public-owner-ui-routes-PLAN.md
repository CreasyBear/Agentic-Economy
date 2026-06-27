---
phase: 01
plan: 05
slug: public-owner-ui-routes
status: ready-for-execution
wave: 5
depends_on: [01-01-substrate-and-guardrails, 01-02-contracts-schema-idempotency-admin-foundation, 01-03-business-claim-publish-suppress, 01-04-admin-dispute-operator-recovery]
requirements: [R3, R4, R8, R10]
created: 2026-06-27
---

# 01-05 — Public and Owner UI Routes Plan

## Objective

Ship the thin TanStack route adapters and AE UI surfaces for `/`, `/claim`, `/claim/success`, owner status/readback, and `/{slug}` so Sam can claim/publish a truthful no-ABN public service catalog and see precise status/next-action readback.

## Authority Inputs

- `01-SPEC.md` R3, R4, R8, R10.
- `01-UI-SPEC.md` full UI contract.
- `DESIGN.md`, `.impeccable/design.json`, and `.planning/FRONTEND-DESIGN-FRAMEWORK.md`.
- `PHASE.md` PR05.
- `01-PATTERNS.md` clusters 8, 12, 13, 14.
- Skills: `product-design`, `shadcn`, `make-interfaces-feel-better`, `impeccable`, `accessibility`, `tanstack-start-best-practices`, `tanstack-router-best-practices`, `clerk-tanstack-patterns`.

## Scope

### In

- Routes: `/`, `/claim`, `/claim/success`, `/privacy/remove-business`, `/{slug}`, and owner status/readback path chosen by current route architecture.
- Thin adapters over public module seams; loaders/server functions validate inputs and return exported DTO/result unions.
- SEO builders for public business pages live in `src/modules/seo/public.ts`, `src/modules/seo/internal/public-business-seo.ts`, and `src/modules/seo/internal/json-ld.ts`, fed only by the source-owned catalog DTO.
- Rendered states: loading, empty, sparse, invalid input, permission denied, publish pending, publish failed, published-not-indexed, service/capability degraded, suppressed/unavailable, degraded discovery, noindex/not-found.
- Compact 375px and wide layout proof, keyboard/focus proof, copy scan, UI contract scan.

### Out

- `/registry`, API/search, UCP, llms, sitemap, robots, customer inquiry, owner inbox, notifications, payments, bookings, actions, protocol/dev surfaces.

## Implementation Steps

| ID | Change | Files | Acceptance |
|----|--------|-------|------------|
| 01-05-A | Wire TanStack Start root, Clerk provider/middleware, and route organization following skills. | `apps/web/src/routes/*`, start/root files | `auth()` works server-side; `beforeLoad` is UX only; server/Convex guards still enforce. |
| 01-05-B | Build/extend AE components for public/owner surfaces. | `src/components/ae/{layout,status,forms,feedback,data}/*` | Routes compose existing AE components; no route-local primitive lookalikes or visual tokens. |
| 01-05-C | Implement home page with one primary claim CTA and registry teaser only if honest. | `/` route | No protocol/payment/marketplace/developer/fake-demand sections; copy passes claims scan. |
| 01-05-D | Implement claim form flow against module/server seam. | `/claim` route and server functions | Form collects business identity, service facts, first-request disclosure, review/publish; validation errors preserve input and focus first error. |
| 01-05-E | Implement claim success/owner status readback. | `/claim/success`, owner status route | Shows public URL, public/index/discovery/trust/capability states, human labels for bookings/payments/automated actions not live, next action, and noindex; raw negative flags stay in DTO/admin diagnostics. |
| 01-05-F | Implement public business page and SEO seam. | `/{slug}` route, `src/modules/seo/public.ts`, `src/modules/seo/internal/public-business-seo.ts`, `src/modules/seo/internal/json-ld.ts`, `tests/unit/seo-json-ld.test.ts`, `tests/seo/public-business-seo.test.ts` | First viewport includes identity, suburb/state, service facts, first-request mode/status, unavailable capability, removal link; no raw private fields; JSON-LD/metadata/canonical/noindex are module-owned. |
| 01-05-G | Add E2E/a11y/copy/UI tests. | `tests/e2e/*`, `tests/e2e/a11y/*`, `tests/copy/*`, `tests/ui-contract/*` | Sam no-ABN E2E passes; 375px/wide keyboard/focus/error states verified. |

## Product Design Pass

- **Primary user/job/object/outcome:** Sam, owner/operator of Parramatta Emergency Plumbing, claims and publishes a service catalog; a public customer/search agent can understand what is available now; object is the public service catalog; outcome is truthful reachability without booking/payment/action claims.
- **Primary surfaces:** `/claim`, `/claim/success`, `/{slug}`; `/` exists only to guide the right user into the claim path.
- **Product decisions:** one coherent claim flow unless evidence proves a stepper; owner pages use human labels, not `callable`/`paymentRequired`; machine negative flags appear only in DTO/admin diagnostics.
- **Verification:** rendered compact and wide evidence for every materially changed surface; keyboard order, focus movement, target size, long text, escaped owner text, and reduced motion checks.

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
npm run build
```

## Stop Conditions

- Route maps status/copy/color directly instead of using shared status/copy mappers.
- Claim form asks for ABN as required T0 field.
- Owner/public copy implies booking, payment, callback guarantee, agent action, ABR verification, demand, partner network, or protocol support.
- Public page exposes raw contact/private fields without explicit source-owned public disclosure rules.

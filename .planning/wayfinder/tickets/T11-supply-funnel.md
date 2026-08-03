# T11 — Supply landing + self-serve onboarding for API-native businesses

Labels: `wayfinder:task` (plan AFK, copy HITL review). Status: open, unclaimed. Raised by founder grilling 2026-07-30 (business-model decision, MAP Destination v2).

## Question

Build the supply side of the marketplace: a dedicated landing page carrying the compelling offer ("List your API free. Agents pay your price per call. You keep X%.") and a self-serve onboarding funnel that takes an API-native business from landing → registered capability → priced listing → first agent call, without an operator in the loop. Rails exist: capability publish/promotion (ADR-026 lineage), T5 keyless sentinel, readiness probes, `/api/v1/services` + MCP distribution. Missing: the landing, the funnel UX, per-call pricing config (free tier allowed), and the earnings view (stub until T12 pays out).

Constraints: flywheel copy and funnel mechanics must borrow named documented patterns — `research/2026-07-30-marketplace-pattern-borrow.md` (Apify publish flow, Shopify-style landing, RapidAPI plan matrix) and `research/2026-07-30-flywheel-patterns.md` (atomic network, hard-side/single-player mode, liquidity metrics) — no invented growth mechanics. Project copy rules require claims to track evidence; time-to-first-successful-call is the onboarding metric.

## Resolution

Implemented the T11 supply landing, generated assistant proof, claim handoff, authenticated publisher hosts, resumable six-step funnel, keyless/credential reference seam, T12 pricing seam, single-player call/earnings boundary, and liquidity event contracts.

Files changed include `src/routes/for-providers.tsx`, `src/routes/claim.tsx`, `src/routes/claim.success.tsx`, `src/routes/_operator/owner.supply.tsx`, `src/routes/_operator/owner.supply.$offeringRef.tsx`, owner Offering handoff routes, `src/components/ae/supply/*`, `src/modules/capability-supply/supply-funnel.functions.ts`, pricing and credential runtime seams, liquidity instrumentation, `convex/capabilitySupply.ts`, `src/modules/capability-supply/internal/convex-schema.ts`, `convex/schema.ts` composition (unchanged because module composition already spread the fragment), and focused tests.

Verification run locally:
- `npx vitest run tests/unit/capability-supply/publication-importers.test.ts` — 18 passed.
- `npx vitest run tests/unit/action-invocation/dynamic-published-operation.test.ts` — 27 passed.
- `npx vitest run tests/unit/schema/convex-schema.test.ts` — 3 passed.
- `npx vitest run tests/unit/capability-supply/supply-liquidity.test.ts` — 3 passed.
- `npx vitest run tests/unit/capability-supply/credential-runtime.test.ts` — 3 passed.
- `npx vitest run tests/unit/capability-supply/supply-funnel.test.ts` — 3 passed.
- `npx vitest run tests/unit/ui/supply-funnel.test.tsx` — 4 passed.
- `npx vitest run tests/unit/routes/supply-landing.test.ts` — 1 passed.
- `npx vitest run tests/unit/routes/supply-owner-routes.test.ts` — 1 passed.
- `npx vitest run tests/unit/catalog/claim-draft.test.ts tests/unit/business/claim.test.ts` — 14 passed.

Deviations: no live provider, credential vault, payout rail, or hosted readback was available; credentialed and x402 execution remain typed HITL refusals. No project-wide commands or Playwright run per Wave 4 constraints. Public landing metadata remains `noindex` pending the plan's copy HITL review. The owner publish orchestration source mutation is represented through the authenticated source-function seam and requires the configured Convex deployment for live mutation execution.

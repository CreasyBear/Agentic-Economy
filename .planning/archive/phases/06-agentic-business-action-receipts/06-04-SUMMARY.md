---
phase: 06-agentic-business-action-receipts
plan: "06-04"
subsystem: routes
tags: [business-action, routes, owner-readback, admin-reconstruction, receipts, source-local]
requires:
  - phase: 06-agentic-business-action-receipts/06-02
    provides: Convex business-action source persistence and server-source seam
provides:
  - Owner business-action queue, checkpoint, and receipt route adapters
  - Admin/operator business-action reconstruction route adapters
  - Business-action route-readback integration tests for owner/admin redaction and evidence separation
  - Source-local business-action readback server seams for route loaders
affects: [phase-06-business-action, owner-routes, admin-routes, receipt-verification]
tech-stack:
  added: []
  patterns:
    - Source/local proof only; production proof not claimed
    - Routes adapt source-owned server seams and public module seams only
    - Private endpoint refs and provider payloads are represented as redacted hashes/counts
key-files:
  created:
    - src/routes/owner.business-actions.tsx
    - src/routes/owner.business-actions.$requestId.tsx
    - src/routes/owner.business-actions.$requestId.receipt.tsx
    - src/routes/admin.business-actions.tsx
    - src/routes/admin.business-actions.$requestId.tsx
    - tests/integration/business-action-route-readbacks.test.ts
  modified:
    - src/modules/business-action/business-action.functions.ts
    - src/modules/business-action/public.ts
    - src/routes/api.business-actions.stripe-webhook.ts
    - src/routeTree.gen.ts
key-decisions:
  - "source/local proof only; production proof not claimed"
  - "Owner/admin routes read through module server seams and route helper functions rather than route-local fixtures."
  - "GuardrailDecisionEvidence is displayed separately from post-checkpoint ExternalEvidenceEvent."
  - "Private evidence refs are exposed only as counts, hashes, retention class, and access policy; raw refs and payloads stay hidden."
patterns-established:
  - "Business-action route readbacks export pure source-state helpers for integration tests while components consume server-loader readbacks."
  - "Business-action server seams provide local source proof fallback and fail closed when source readback is unavailable."
requirements-completed: [P6-R4, P6-R8, P6-R9, P6-R10, P6-R13]
coverage:
  - id: D1
    description: "Owner business-action queue, checkpoint, and receipt route adapters derive readbacks from source state/server seams and fail closed for wrong owners."
    requirement: P6-R4
    verification:
      - kind: integration
        ref: "tests/integration/business-action-route-readbacks.test.ts#business-action owner route readbacks"
        status: pass
      - kind: other
        ref: "npm run test:imports"
        status: pass
    human_judgment: false
  - id: D2
    description: "Admin/operator routes reconstruct success, refusal, proof-gap, guardrail decision, external evidence, support/no-repair, and private evidence metadata."
    requirement: P6-R8
    verification:
      - kind: integration
        ref: "tests/integration/business-action-route-readbacks.test.ts#business-action admin route readbacks"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D3
    description: "Route and public seam guardrails exclude module-internal imports and raw private/provider evidence from route output."
    requirement: P6-R13
    verification:
      - kind: integration
        ref: "tests/integration/business-action-route-readbacks.test.ts#redacts private evidence families while preserving operator metadata"
        status: pass
      - kind: other
        ref: "npm run test:imports"
        status: pass
    human_judgment: false
duration: 27min
completed: 2026-06-29
status: complete
---

# Phase 6 Plan 06-04: Business Action Routes Summary

**Owner and admin business-action receipt routes backed by source-local readbacks, redacted evidence metadata, and route-boundary tests.**

source/local proof only

production proof not claimed

## Performance

- **Duration:** 27 min
- **Started:** 2026-06-29T13:12:41Z
- **Completed:** 2026-06-29T13:39:17Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Added owner business-action queue, checkpoint, and receipt route adapters with source-state readback helpers and server-loader wiring.
- Added admin/operator reconstruction routes that separate guardrail decision evidence from post-checkpoint external evidence.
- Added route-readback integration tests covering owner wrong-owner denial, checkpoint outcomes, result artifact proof gaps, admin success/refusal/proof-gap reconstruction, evidence separation, and private evidence redaction.
- Added missing source-local business-action readback server seams so routes no longer render from empty route-local state.

## Task Commits

1. **Task 1 RED: Add owner route-readback tests** - `1c2f92e` (test)
2. **Task 1 GREEN: Add owner business-action routes** - `ddcedba` (feat)
3. **Task 2 RED: Add admin route-readback tests** - `1b3c2bb` (test)
4. **Task 2 GREEN: Add admin reconstruction routes** - `42189b7` (feat)
5. **Verification fix: Satisfy route typecheck** - `fa19bbd` (fix)
6. **Missing seam fix: Wire routes to server seams** - `f975c68` (fix)

## Files Created/Modified

- `src/routes/owner.business-actions.tsx` - Owner queue route, source-state queue helper, server-result conversion, and redacted reconstruction builder.
- `src/routes/owner.business-actions.$requestId.tsx` - Owner checkpoint/detail route backed by business-action detail server readback.
- `src/routes/owner.business-actions.$requestId.receipt.tsx` - Owner receipt route backed by source-state receipt reconstruction.
- `src/routes/admin.business-actions.tsx` - Admin reconstruction list route, search validation, redacted evidence metadata, and server-result conversion.
- `src/routes/admin.business-actions.$requestId.tsx` - Admin detail route for one business-action request.
- `tests/integration/business-action-route-readbacks.test.ts` - Owner/admin route-readback integration coverage.
- `src/modules/business-action/business-action.functions.ts` - Source-local owner/admin readback server seams for route loaders.
- `src/modules/business-action/public.ts` - Lazy public seam for Stripe webhook signature verification to keep routes off module internals.
- `src/routes/api.business-actions.stripe-webhook.ts` - Updated to import the public business-action seam.
- `src/routeTree.gen.ts` - Generated route registration for owner/admin business-action routes.

## Decisions Made

- Kept Phase 6 route copy and readbacks explicitly local/source scoped: source/local proof only; production proof not claimed.
- Used module server seams plus pure source-state route helpers. Tests can assert deterministic source behavior, while route components do not own fixture arrays.
- Preserved guardrail decision evidence as pre-checkpoint decision evidence and rendered external evidence as separate post-checkpoint evidence.
- Returned private evidence as redacted metadata only: counts, hashes, retention class, access policy, support/no-repair state, and source labels.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed pre-existing business-action route import guard failure**
- **Found during:** Task 1 verification.
- **Issue:** `npm run test:imports` failed because `src/routes/api.business-actions.stripe-webhook.ts` imported `src/modules/business-action/internal/stripe-checkout`.
- **Fix:** Added a lazy public seam in `src/modules/business-action/public.ts` for Stripe webhook signature verification and updated the route import.
- **Files modified:** `src/modules/business-action/public.ts`, `src/routes/api.business-actions.stripe-webhook.ts`
- **Verification:** `npm run test:imports`; `npx vitest run tests/unit/business-action/stripe-checkout-evidence.test.ts`
- **Committed in:** `ddcedba`

**2. [Rule 3 - Blocking] Fixed strict route/server-result TypeScript contracts**
- **Found during:** Plan-level typecheck.
- **Issue:** Server function results are serialized records, exact optional prop types rejected undefined props, and route tests imported ID brands from the wrong seam.
- **Fix:** Narrowed serialized route values before rendering, adjusted exact optional prop handling, and imported ID brands from the common ID seam.
- **Files modified:** `src/routes/owner.business-actions.$requestId.tsx`, `src/routes/owner.business-actions.$requestId.receipt.tsx`, `src/routes/admin.business-actions.tsx`, `tests/integration/business-action-route-readbacks.test.ts`, `src/modules/business-action/public.ts`
- **Verification:** `npm run typecheck`
- **Committed in:** `fa19bbd`

**3. [Rule 2 - Missing Critical Functionality] Added owner/admin source-readback server seams**
- **Found during:** Stub scan before closeout.
- **Issue:** The new list/detail components initially rendered from empty source state because 06-02 exposed only an owner receipt query seam.
- **Fix:** Added owner queue/detail and admin reconstruction server seams with module-owned local source proof fallback and wired all owner/admin routes through loader data.
- **Files modified:** `src/modules/business-action/business-action.functions.ts`, owner/admin business-action routes.
- **Verification:** `npx vitest run tests/integration/business-action-route-readbacks.test.ts`; `npm run test:imports`; `npm run typecheck`
- **Committed in:** `f975c68`

**Total deviations:** 3 auto-fixed issues: two blocking fixes and one missing critical server-seam fix.
**Impact on plan:** Required for correctness and verification. No public production proof, provider authority, payment claim, route-local demo fixture, or raw private evidence exposure was added.

## Issues Encountered

- RED tests failed as expected before owner/admin route modules existed.
- `npm run test:imports` exposed the prior 06-03 Stripe webhook route import-boundary miss; fixed via public seam before continuing.
- Typecheck required explicit narrowing for serialized server-function records in route UI rendering.
- Requirements closeout hook returned `not_found` for `P6-R4`, `P6-R8`, `P6-R9`, `P6-R10`, and `P6-R13` because `.planning/REQUIREMENTS.md` does not define those IDs.

## Verification

- `npx vitest run tests/integration/business-action-route-readbacks.test.ts` - PASS, 7 tests.
- `npm run test:imports` - PASS, 3 tests.
- `npm run typecheck` - PASS.
- `npx vitest run tests/unit/business-action/stripe-checkout-evidence.test.ts` - PASS, 7 tests, for the public-seam import fix.

## Known Stubs

None. Stub-pattern scan found only source-local default parameters, fail-closed empty source results for denied admin reads, and private evidence fixtures inside tests/module-owned local source proof. Routes are wired to module server seams and do not define route-local Business Action arrays.

## Threat Flags

None. The new owner/admin route surfaces and redacted private evidence readbacks are the planned scope of 06-04; no public production route or public proof claim was added.

## Auth Gates

None.

## User Setup Required

None - no external service configuration required. Local route proof remains source/local only.

## Next Phase Readiness

Phase 6 now has inspectable owner/admin route readbacks for the business-action receipt chain. Production proof is still not claimed; external/deployed provider proof remains blocked for later plans.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/06-agentic-business-action-receipts/06-04-SUMMARY.md`.
- Plan-owned created/modified files exist.
- Task commits found: `1c2f92e`, `ddcedba`, `1b3c2bb`, `42189b7`, `fa19bbd`, `f975c68`.
- Required verification commands passed: focused business-action route Vitest, `npm run test:imports`, and `npm run typecheck`.
- Closeout summary states `source/local proof only` and `production proof not claimed`.

---
*Phase: 06-agentic-business-action-receipts*
*Completed: 2026-06-29*

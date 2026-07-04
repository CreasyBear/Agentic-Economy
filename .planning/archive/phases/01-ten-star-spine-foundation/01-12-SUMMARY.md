---
phase: 01-ten-star-spine-foundation
plan: 12
subsystem: runtime-security
tags: [convex, clerk, admin, suppression, disputes, operator-controls, tanstack-start]

requires:
  - phase: 01-ten-star-spine-foundation
    provides: Durable owner claim and catalog readback seams from 01-10 and 01-11
provides:
  - Source-owned admin membership, dispute, suppression, and operator-control Convex handlers
  - Protected admin route loaders backed by Convex readbacks
  - Durable public removal dispute intake with local E2E bypass preserved
affects: [phase-01, admin-runtime, public-removal, operator-controls, verification]

tech-stack:
  added: []
  patterns:
    - Convex handler adapters load and persist Phase 1 source state through owning module seams
    - TanStack Start route loaders call typed Convex server functions and fail closed when auth/env is absent

key-files:
  created:
    - tests/integration/admin-runtime.test.ts
    - tests/integration/suppression-runtime.test.ts
  modified:
    - convex/business.ts
    - convex/security.ts
    - convex/observability.ts
    - src/routes/admin.claims.tsx
    - src/routes/admin.audit-events.tsx
    - src/routes/admin.index-health.tsx
    - src/routes/privacy.remove-business.tsx
    - tests/integration/admin-runtime.test.ts

key-decisions:
  - "Admin power is resolved only from stored source-owned membership rows after an explicitly preauthorized first owner_admin bootstrap."
  - "Denied admin/operator/suppression/dispute operations emit audited denial rows and return no private readback payloads."
  - "Admin route loaders call protected Convex queries; local missing auth/env falls back to denied readbacks with empty rows."
  - "The privacy removal route uses Convex dispute intake by default and keeps the existing VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E local bypass for Playwright."

patterns-established:
  - "Runtime adapter pattern: Convex functions use source-state load/persist plus domain public module seams."
  - "Route readback pattern: TanStack Start loaders call server functions with typed Convex references and fail closed."
  - "Redaction pattern: public dispute intake returns a receipt only, never raw contact data or private evidence refs."

requirements-completed: [R6, R8, R10]

coverage:
  - id: D1
    description: Source-owned admin, dispute, suppression, and operator-control handlers persist durable audited state
    requirement: R8
    verification:
      - kind: integration
        ref: "npm run test:integration -- tests/integration/admin-runtime.test.ts tests/integration/suppression-runtime.test.ts"
        status: pass
      - kind: unit
        ref: "./node_modules/.bin/vitest run tests/unit/security/admin-readbacks.test.ts tests/unit/observability/operator-controls.test.ts"
        status: pass
      - kind: other
        ref: "npm run typecheck"
        status: pass
    human_judgment: false
  - id: D2
    description: Admin route loaders consume protected Convex readbacks instead of membership-undefined shells
    requirement: R6
    verification:
      - kind: e2e
        ref: "VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true ./node_modules/.bin/playwright test tests/e2e/public-owner-ui.spec.ts"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
      - kind: other
        ref: "rg -n \"membership: undefined|readAdminRouteShell\" src/routes/admin.claims.tsx src/routes/admin.audit-events.tsx src/routes/admin.index-health.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: Public removal form records durable dispute intake with redacted receipts
    requirement: R10
    verification:
      - kind: e2e
        ref: "VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true ./node_modules/.bin/playwright test tests/e2e/public-owner-ui.spec.ts"
        status: pass
      - kind: integration
        ref: "npm run test:integration -- tests/integration/admin-runtime.test.ts tests/integration/suppression-runtime.test.ts"
        status: pass
    human_judgment: false

duration: 22min
completed: 2026-06-28
status: complete
---

# Phase 01 Plan 12: Source-Owned Admin Runtime Summary

**Convex-backed admin, suppression, dispute, removal, and operator controls with protected route readbacks.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-06-28T09:21:53Z
- **Completed:** 2026-06-28T09:43:11Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added failing runtime coverage for admin membership bootstrap/grant, admin readbacks, operator controls, suppression/unsuppression, dispute open/close, denial audit rows, and public redaction.
- Replaced denied-only Convex stubs with source-state-backed handlers for security, business visibility, and observability runtime controls.
- Wired admin claims, audit events, and index health route loaders to protected Convex queries instead of `membership: undefined` shells.
- Wired `/privacy/remove-business` to `security:openRemovalDispute` by default while preserving the explicit local E2E bypass.

## Task Commits

1. **Task 1: Add runtime admin and suppression tests** - `7610417` (test)
2. **Task 2: Implement source-owned admin, dispute, suppression, and operator Convex handlers** - `4b98ec3` (feat)
3. **Task 3: Wire admin and removal routes to protected runtime readbacks** - `29905fb` (feat)

## Files Created/Modified

- `tests/integration/admin-runtime.test.ts` - Runtime coverage for admin readbacks, membership authority, operator controls, dispute close, and denial redaction.
- `tests/integration/suppression-runtime.test.ts` - Runtime coverage for public dispute intake and source-owned suppression/unsuppression.
- `convex/security.ts` - Source-owned admin membership, protected admin readbacks, public dispute intake, and dispute close handlers.
- `convex/business.ts` - Source-owned suppression and unsuppression handlers with denial audit rows.
- `convex/observability.ts` - Source-owned operator control mutation/query adapters.
- `src/routes/admin.claims.tsx` - Protected Convex claims readback loader.
- `src/routes/admin.audit-events.tsx` - Protected Convex audit-events readback loader.
- `src/routes/admin.index-health.tsx` - Protected Convex index-health readback loader while retaining exported test row builders.
- `src/routes/privacy.remove-business.tsx` - Durable Convex removal dispute submission with local E2E bypass.

## Decisions Made

- Kept admin route guards as UX only; Convex/source membership remains the enforcement boundary.
- Returned compact, validator-shaped Convex results to avoid leaking full private dispute/contact/evidence rows.
- Preserved the existing `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E` bypass for local Playwright because local E2E does not provide a Convex deployment URL.
- Did not modify or stage unrelated dirty Phase 2-5 planning, billing, inquiry, protected-action, or future observability work.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Convex validator return-shape mismatches**
- **Found during:** Task 2
- **Issue:** Source module return types had broader operator keys, branded operation IDs, readonly arrays, and optional `undefined` fields that did not satisfy Convex validators under `exactOptionalPropertyTypes`.
- **Fix:** Added compact result serializers, Phase 1 key guards, branded operation/correlation IDs, mutable readback rows, and omitted absent optional fields.
- **Files modified:** `convex/security.ts`, `convex/observability.ts`
- **Verification:** `npm run typecheck`; focused integration tests.
- **Committed in:** `4b98ec3`

**2. [Rule 3 - Blocking] Preserved local E2E removal bypass**
- **Found during:** Task 3
- **Issue:** The durable removal route correctly required Convex, but local Playwright verification runs with `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` and no Convex URL, so the receipt test could not record a local request.
- **Fix:** Added an explicit local-only bypass matching the existing owner-claim pattern; normal execution still calls `security:openRemovalDispute`.
- **Files modified:** `src/routes/privacy.remove-business.tsx`
- **Verification:** Direct Playwright spec passed all 14 tests.
- **Committed in:** `29905fb`

**Total deviations:** 2 auto-fixed issues.

## Issues Encountered

- `npm run check:convex-codegen` is auth-gated in this environment with `401 Unauthorized: MissingAccessToken`. No code change was made for this gate.
- `npm run test:unit -- tests/unit/security/admin-readbacks.test.ts tests/unit/observability/operator-controls.test.ts` runs all `tests/unit` because of the package script and fails on unrelated dirty `convex/schema.ts` Phase 2-5 table additions. The intended focused files pass through direct Vitest.
- The first Playwright run was sandbox-blocked with `listen EPERM 127.0.0.1:3000`; the same direct spec passed after escalation.
- After `4b98ec3`, unrelated future operator-control edits appeared in `convex/observability.ts` and `tests/unit/observability/operator-controls.test.ts`. They remain unstaged and were not included in 01-12 commits.

## Verification

- PASS: `npm run typecheck`
- PASS: `npm run test:integration -- tests/integration/admin-runtime.test.ts tests/integration/suppression-runtime.test.ts`
- PASS: `./node_modules/.bin/vitest run tests/unit/security/admin-readbacks.test.ts tests/unit/observability/operator-controls.test.ts`
- PASS: `npm run test:copy`
- PASS: `npm run test:ui-contract`
- PASS: `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true ./node_modules/.bin/playwright test tests/e2e/public-owner-ui.spec.ts` (escalated for local dev-server bind)
- PASS: `npm run build`
- AUTH-GATED: `npm run check:convex-codegen` failed with Convex `401 MissingAccessToken`
- KNOWN CONTAMINATION: package-script `npm run test:unit -- ...` hit unrelated dirty schema expansion; direct focused Vitest passed

## Known Stubs

None. The removal-route local path is an explicit E2E bypass gated by `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E`, not the production path.

## Threat Flags

None beyond the plan threat model. This plan intentionally touched the Clerk session to admin action boundary, public removal form to dispute source-state boundary, and admin route to private readback boundary.

## Dirty Boundary

Preserved unrelated dirty/untracked work as requested. Notable unstaged plan-owned leftovers after this plan are unrelated future operator-control edits in `convex/observability.ts` and `tests/unit/observability/operator-controls.test.ts`.

## Self-Check: PASSED

- Found summary file: `.planning/phases/01-ten-star-spine-foundation/01-12-SUMMARY.md`
- Found task commit: `7610417`
- Found task commit: `4b98ec3`
- Found task commit: `29905fb`

## User Setup Required

Convex codegen/deployment verification requires authentication:

- Run `npx convex dev` or otherwise provide a valid Convex access token before rerunning `npm run check:convex-codegen`.

## Next Phase Readiness

R8/R6/R10 runtime gaps are closed in committed 01-12 work. Follow-up verification can use the protected admin route loaders and source-owned Convex handlers once Clerk admin storage state and Convex auth are available.

---
*Phase: 01-ten-star-spine-foundation*
*Completed: 2026-06-28*

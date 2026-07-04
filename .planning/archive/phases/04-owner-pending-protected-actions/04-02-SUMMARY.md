---
phase: 04-owner-pending-protected-actions
plan: 02
subsystem: protected-action
tags: [convex, tanstack-start, protected-actions, owner-approval, contact-follow-up]
requires:
  - phase: 04-owner-pending-protected-actions
    provides: selected contact-follow-up contract and owner-pending UI specification
provides:
  - Durable selected-action Convex/server runtime for `contact-follow-up`
  - Owner approve/reject route wiring with source-owned readbacks
  - One-use gateway, attempt, receipt, proof-gap, private evidence, retry, and no-repair persistence
  - Local deterministic E2E fixture for non-deployed owner/admin readback verification
affects: [phase-04, protected-action-verification, owner-routes, admin-routes]
tech-stack:
  added: []
  patterns:
    - Selected-action-specific server functions using `protectedActions:*` source references
    - Convex read/write DTO serialization with finite redacted audit payloads
    - Local-only protected-action fixture gated by explicit test/dev conditions
key-files:
  created:
    - src/modules/protected-action/contact-follow-up.functions.ts
    - tests/unit/convex/protected-actions-runtime.test.ts
    - tests/unit/protected-action/selected-action-policy.test.ts
    - tests/unit/server/protected-action-server-seams.test.ts
  modified:
    - convex/protectedActions.ts
    - src/modules/protected-action/internal/contact-follow-up.ts
    - src/modules/protected-action/internal/schema.ts
    - src/modules/protected-action/public.ts
    - src/routes/owner.actions.tsx
    - src/routes/owner.actions.$proposalId.tsx
    - src/routes/owner.actions.$proposalId.receipt.tsx
    - src/routes/admin.protected-actions.tsx
    - src/routes/admin.protected-actions.$proposalId.tsx
    - tests/integration/protected-action-route-readbacks.test.ts
    - tests/e2e/protected-action-owner-flow.spec.ts
    - tests/e2e/a11y/protected-action-a11y.spec.ts
    - tests/copy/phase4-protected-action-claims.test.ts
    - tests/types/protected-actions-contracts.test.ts
    - tests/unit/schema/convex-schema.test.ts
key-decisions:
  - Keep selected action exactly `contact-follow-up`; no generic action catalog, provider marketplace, autonomous execution, descriptor authority, MCP/OpenAPI mutation authority, or money rails were introduced.
  - Treat missing deployed proof inputs as no deployed Phase 4 proof claim; do not create deployed evidence without real source-backed IDs.
patterns-established:
  - Browser routes receive typed available/error/denied readbacks from server functions.
  - Owner mutations resolve authority server-side and persist decisions before any gateway or attempt.
  - Reconstruction readbacks expose redacted hashes/statuses and private evidence refs, not raw provider/customer payloads.
requirements-completed: []
coverage:
  - id: D1
    description: Durable selected-action runtime persists proposals, policy, owner decisions, one-use gateway admissions, attempts, receipts, private evidence refs, no-repair records, audit events, and operation rows.
    verification:
      - kind: unit
        ref: npm run test:unit -- tests/unit/protected-action tests/unit/convex/protected-actions-runtime.test.ts tests/unit/server/protected-action-server-seams.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Owner/admin mounted routes use source-owned contact-follow-up server readbacks and keep noindex, selected-action-only copy.
    verification:
      - kind: integration
        ref: npm run test:integration -- tests/integration/protected-action-route-readbacks.test.ts
        status: pass
      - kind: unit
        ref: npm run test:copy -- tests/copy/phase4-protected-action-claims.test.ts
        status: pass
      - kind: unit
        ref: npm run test:seo -- tests/seo/protected-action-noindex.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Browser approve/reject/receipt/admin flows are populated by the local deterministic fixture.
    verification:
      - kind: e2e
        ref: npm run test:e2e -- --grep "selected protected action"
        status: pass
    human_judgment: true
    rationale: Re-run with local-server permission after hydration gating fix passed compact and wide browser coverage.
metrics:
  duration: continuation run
  completed: 2026-06-29
  status: complete
---

# Phase 4 Plan 2: Owner-Approved Protected Action Runtime Gaps Summary

**Durable `contact-follow-up` owner approval runtime with source-owned Convex persistence, route readbacks, retry/no-repair handling, and local verification fixtures.**

## Accomplishments

- Implemented selected-action Convex functions for contact follow-up proposal, queue/detail/receipt reads, owner approve/reject, retry, no-repair, and admin reconstruction.
- Added `contact-follow-up.functions.ts` server functions with zod validation, typed server results, `protectedActions:*` source references, source error handling, and a deterministic local fixture for local-only verification.
- Wired owner and admin routes to server readbacks, including approval consequence acknowledgement, reject reason validation, focus recovery, mutation success/error states, receipt reconstruction, and admin redacted readback views.
- Persisted and reconstructed one-use gateway admissions, attempts, receipts/proof gaps, private evidence references, retry exhaustion, and no-repair records.
- Expanded tests for policy edges, Convex persistence, server seams, route readbacks, type contracts, copy/source guardrails, SEO noindex, browser specs, and accessibility specs.

## Files Created/Modified

- `convex/protectedActions.ts` - Selected-action Convex runtime, persistence mapper, owner/admin auth checks, CSRF checks, operation rows, and finite redacted audit DTOs.
- `src/modules/protected-action/contact-follow-up.functions.ts` - Server-function seam and local E2E fixture.
- `src/modules/protected-action/internal/contact-follow-up.ts` - Retry bounds, no-repair state, attempt private evidence refs, and idempotency conflict ordering.
- `src/modules/protected-action/internal/schema.ts` - No-repair durable table and proposal policy hints.
- `src/modules/protected-action/public.ts` - Public selected-action exports.
- `src/routes/owner.actions*.tsx` and `src/routes/admin.protected-actions*.tsx` - Mounted server readbacks and owner/admin UI wiring.
- `tests/unit/convex/protected-actions-runtime.test.ts`, `tests/unit/server/protected-action-server-seams.test.ts`, `tests/unit/protected-action/selected-action-policy.test.ts` - New focused runtime coverage.
- `tests/integration/protected-action-route-readbacks.test.ts`, `tests/types/protected-actions-contracts.test.ts`, `tests/copy/phase4-protected-action-claims.test.ts`, `tests/e2e/protected-action-owner-flow.spec.ts`, `tests/e2e/a11y/protected-action-a11y.spec.ts` - Expanded gap-closure coverage.

## Verification

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run check:convex-codegen` | Passed after rerun with network permission |
| `npm run test:unit -- tests/unit/protected-action tests/unit/convex/protected-actions-runtime.test.ts tests/unit/server/protected-action-server-seams.test.ts` | Passed: 44 files, 199 tests |
| `npm run test:integration -- tests/integration/protected-action-route-readbacks.test.ts` | Passed: 10 files, 32 tests |
| `npm run test:types -- tests/types/protected-actions-contracts.test.ts` | Passed: 2 files, 7 tests |
| `npm run test:copy -- tests/copy/phase4-protected-action-claims.test.ts` | Passed: 4 files, 32 tests |
| `npm run test:ui-contract -- tests/ui-contract/protected-action-status-copy.test.ts` | Passed: 3 files, 4 tests |
| `npm run test:seo -- tests/seo/protected-action-noindex.test.ts` | Passed: 4 files, 11 tests |
| `npm run test:source-mining` | Passed: 1 file, 2 tests |
| `npm run test:imports` | Passed: 3 files, 3 tests |
| `npm run test:ts-standards` | Passed: 1 file, 1 test |
| `npm run build -- --logLevel error` | Passed |
| `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e -- --grep "selected protected action"` | Passed: 8 tests |
| `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e:a11y -- --grep "selected protected action"` | Passed: 2 tests |

### Post-Summary Verification Fix

**4. [Rule 2 - Browser hydration race] Owner decision forms submitted before React hydration**
- **Found during:** Focused Playwright verification rerun
- **Issue:** Approve/reject buttons were enabled in server-rendered HTML, so an early click could submit the native form before React attached validation handlers.
- **Fix:** Gate owner approve/reject buttons behind route hydration and keep reject validation field-level to avoid duplicate accessible text.
- **Files modified:** `src/routes/owner.actions.$proposalId.tsx`
- **Verification:** `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e -- --grep "selected protected action"` and `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e:a11y -- --grep "selected protected action"`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Attempt idempotency conflict ordering**
- **Found during:** Unit verification
- **Issue:** A same-idempotency-key attempt with changed readback was reported as retry exhaustion after the retry cap was added.
- **Fix:** Check same-key replay/conflict before retry-limit evaluation.
- **Files modified:** `src/modules/protected-action/internal/contact-follow-up.ts`
- **Verification:** `npm run test:unit -- tests/unit/protected-action tests/unit/convex/protected-actions-runtime.test.ts tests/unit/server/protected-action-server-seams.test.ts`

**2. [Rule 3 - Blocking test contract] Schema contract included the new durable no-repair table**
- **Found during:** Focused unit verification
- **Issue:** The existing schema contract failed after adding `protectedActionNoRepairRecords`.
- **Fix:** Updated the schema contract test to include the no-repair table and its required indexes.
- **Files modified:** `tests/unit/schema/convex-schema.test.ts`
- **Verification:** Focused unit command and `npm run test:ts-standards`

**3. [Rule 2 - Critical verification fixture] Added a pending local proposal**
- **Found during:** E2E coverage update
- **Issue:** The deterministic local fixture only had receipt/proof-gap rows, so mounted approve/reject controls were correctly disabled and could not exercise owner mutation UI.
- **Fix:** Added a separate pending `contact-follow-up` fixture proposal while preserving receipt/proof-gap readbacks.
- **Files modified:** `src/modules/protected-action/contact-follow-up.functions.ts`, `tests/e2e/protected-action-owner-flow.spec.ts`, `tests/e2e/a11y/protected-action-a11y.spec.ts`
- **Verification:** Typecheck and local non-browser suites passed; browser execution remains blocked by sandbox local-server permissions.

## Known Stubs

None. Stub scan over changed plan files found only optional default parameters and null guards, not UI/data placeholders.

## Threat Flags

None beyond the plan threat model. New owner mutations resolve owner authority from source auth, use CSRF admission, persist decisions before gateway/attempt creation, and expose redacted readbacks only. Admin reconstruction uses admin authority checks and never returns raw provider/customer payloads.

## Deployed Proof Boundary

`DEPLOY_BASE_URL`, `PHASE4_CONTACT_FOLLOW_UP_PROPOSAL_ID`, and `PHASE4_CONTACT_FOLLOW_UP_READBACK_ID` were absent. No deployed Phase 4 proof is claimed, and `.planning/phases/04-owner-pending-protected-actions/04-DEPLOY-READBACK-EVIDENCE.md` was not created.

## Git Boundary

No staging, commits, pushes, tags, branch changes, or git ref/index writes were performed. Pre-existing unrelated planning/config/catalog changes were preserved and not edited, including Phase 2 evidence files.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/04-owner-pending-protected-actions/04-02-SUMMARY.md`.
- Deployed evidence file was not created because deployed proof inputs were absent.
- No commits were expected or created because the user prohibited git index/ref writes.

---
phase: 06-agentic-business-action-receipts
plan: "06-02"
subsystem: convex
tags: [business-action, convex, source-write, receipts, private-evidence, source-local]
requires:
  - phase: 06-agentic-business-action-receipts/06-01
    provides: pure business-action domain seam and verifier
provides:
  - Convex business-action source tables and indexed store helpers
  - Source-write gated Convex business-action adapter and server-source seam
  - Guardrail, Hermes evidence, private evidence retention, export, and tombstone persistence
affects: [phase-06-business-action, convex-source, receipt-verification]
tech-stack:
  added: []
  patterns:
    - Source/local proof only; production proof not claimed
    - Convex adapters delegate to src/modules/business-action/public.ts
    - Browser-supplied authority/provider/money/receipt/checkpoint fields fail closed
    - Private evidence exports are redacted hash-only and tombstone raw refs
key-files:
  created:
    - convex/businessActionStore.ts
    - convex/businessActions.ts
    - src/modules/business-action/business-action.functions.ts
    - tests/unit/convex/business-actions-runtime.test.ts
  modified:
    - convex/schema.ts
key-decisions:
  - "source/local proof only; production proof not claimed"
  - "Use the existing protected_action source-write admission scope for Phase 6 server-originated writes; adding a new business_action admission scope is outside 06-02 file scope."
  - "Keep Convex adapter logic thin: validators, source-write admission, authority derivation, persistence, and public-domain seam calls only."
  - "Reject browser-supplied owner/admin/business/provider authority, amount/currency, receipt status, checkpoint result, and raw evidence payload fields before persistence."
patterns-established:
  - "Business-action source persistence mirrors protected-action indexed upsert patterns without route/UI dependencies."
  - "Private evidence lifecycle keeps hashes and audit metadata while redacting/tombstoning raw refs."
requirements-completed: [P6-R2, P6-R3, P6-R4, P6-R5, P6-R8, P6-R9, P6-R11, P6-R13]
coverage:
  - id: D1
    description: "Business-action source state persists and replays cards, mandates, requests, checkpoints, guardrails, Hermes evidence, artifacts, receipts, support/no-repair records, operation keys, and private evidence refs without duplicate rows."
    requirement: P6-R2
    verification:
      - kind: unit
        ref: "tests/unit/convex/business-actions-runtime.test.ts#persists and replays the source slice without duplicate durable rows"
        status: pass
      - kind: other
        ref: "npm run check:convex-codegen"
        status: pass
    human_judgment: false
  - id: D2
    description: "Convex runtime derives owner authority server-side, rejects caller-supplied authority/money/provider/receipt/checkpoint fields, and returns redacted owner readbacks."
    requirement: P6-R3
    verification:
      - kind: unit
        ref: "tests/unit/convex/business-actions-runtime.test.ts#rejects missing source-write admission and caller-supplied authority money provider or receipt fields"
        status: pass
      - kind: unit
        ref: "tests/unit/convex/business-actions-runtime.test.ts#derives owner authority server-side for checkpoints and redacted owner receipt readbacks"
        status: pass
    human_judgment: false
  - id: D3
    description: "Guardrail block/refusal evidence persists without creating downstream Hermes/external evidence after a refused checkpoint."
    requirement: P6-R8
    verification:
      - kind: unit
        ref: "tests/unit/convex/business-actions-runtime.test.ts#persists guardrail block and refusal evidence without downstream external evidence after refused checkpoint"
        status: pass
    human_judgment: false
  - id: D4
    description: "Private evidence refs export as redacted hashes and tombstone raw private refs on delete while retaining lawful audit hashes."
    requirement: P6-R11
    verification:
      - kind: unit
        ref: "tests/unit/convex/business-actions-runtime.test.ts#exports private evidence as redacted hashes and tombstones raw refs on delete"
        status: pass
    human_judgment: false
duration: 26min
completed: 2026-06-29
status: complete
---

# Phase 6 Plan 06-02: Business Action Convex Source Summary

**Convex-backed source/local business-action receipts with source-write admission, server-derived authority, redacted readbacks, and private evidence retention.**

source/local proof only

production proof not claimed

## Performance

- **Duration:** 26 min
- **Started:** 2026-06-29T12:19:29Z
- **Completed:** 2026-06-29T12:45:18Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added Convex business-action tables and store helpers for durable source-local cards, mandates, requests, checkpoints, guardrails, Hermes evidence, artifacts, receipts, support/no-repair records, operation keys, and private evidence refs.
- Added source-write gated Convex mutations/queries plus React Start server-source refs that delegate to the public business-action seam rather than reimplementing domain rules.
- Enforced server-derived owner authority and fail-closed rejection for untrusted browser authority, provider, money, receipt, checkpoint, and raw evidence fields.
- Added private evidence export/tombstone behavior that keeps hash/audit metadata while excluding raw private refs from public projections.

## Task Commits

1. **Task 1 RED: Add business-action Convex tables and store helpers** - `d9f89b3` (test)
2. **Task 1 GREEN: Add business-action Convex source store** - `0f07dca` (feat)
3. **Task 2 RED: Add source-write gated Convex adapter and server seam** - `6ba0680` (test)
4. **Task 2 GREEN: Add source-gated business-action adapter** - `5b1ab2e` (feat)
5. **Task 3 RED: Persist guardrail evidence and private evidence policy** - `9bdb123` (test)
6. **Task 3 GREEN: Persist guardrail and Hermes evidence policy** - `853eb9a` (feat)

## Files Created/Modified

- `convex/businessActionStore.ts` - Module-owned business-action tables, indexed loaders, upsert persistence, private evidence export, and tombstone helpers.
- `convex/businessActions.ts` - Source-write gated mutations/queries for capability requests, owner checkpoints, guardrail decisions, Hermes evidence, receipts, and owner receipt readbacks.
- `convex/schema.ts` - Composes the business-action tables into the Convex schema.
- `src/modules/business-action/business-action.functions.ts` - React Start server-source refs and thin server adapters for the Convex business-action functions.
- `tests/unit/convex/business-actions-runtime.test.ts` - Focused Convex runtime tests for persistence, authority, private evidence retention, guardrail policy, and server refs.

## Decisions Made

- Used the existing `protected_action` source-write admission scope because 06-02 did not include the source-write admission module in its file scope; business-action-specific rejection, persistence, and receipt semantics still live in the business-action adapter/domain seam.
- Kept route/UI layers out of the business-action runtime seam. Server functions expose source refs only and do not own domain rules.
- Treated private evidence refs as exportable only through redacted hashes with explicit tombstone behavior for raw private refs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed strict TypeScript return contracts**
- **Found during:** Task 2 and Task 3 GREEN verification.
- **Issue:** Strict TypeScript and Convex validators rejected broad error/result return shapes, Hermes evidence status narrowing, and TanStack server-function serializability.
- **Fix:** Tightened runtime error code typing, widened Hermes evidence return validation to the domain status set, serialized server-function results as JSON-safe records, and cast reloaded Hermes evidence through the public event type after validator checks.
- **Files modified:** `convex/businessActions.ts`, `convex/businessActionStore.ts`, `src/modules/business-action/business-action.functions.ts`
- **Verification:** `npx vitest run tests/unit/convex/business-actions-runtime.test.ts`, `npm run typecheck`
- **Committed in:** `5b1ab2e`, `853eb9a`

**Total deviations:** 1 auto-fixed blocking issue.
**Impact on plan:** Required for correctness and type safety; no route/UI or external-provider scope was added.

## Issues Encountered

- RED tests failed as expected before each implementation commit.
- `npm run check:convex-codegen` initially hit sandbox DNS/network handling for the configured tooling path; rerunning with approved network escalation passed.
- `state.advance-plan` could not parse the current frontmatter-only plan counters in `STATE.md`; `state.update-progress`, metric, decision, session, and roadmap hooks completed, and the reported progress/metric label were normalized in the closeout diff.
- `requirements.mark-complete` reported Phase 6 IDs as `not_found` because `.planning/REQUIREMENTS.md` currently tracks the Phase 1-5 closeout milestone. The completed Phase 6 requirement IDs are recorded in this summary frontmatter.

## Verification

- `npx vitest run tests/unit/convex/business-actions-runtime.test.ts` - PASS, 7 tests.
- `npm run check:convex-codegen` - PASS.
- `npm run typecheck` - PASS.

## Known Stubs

None. Stub-pattern scan found only normal null checks, empty test-helper defaults, and test utility initialization in plan-owned files.

## Auth Gates

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 6 now has a durable source/local Convex seam for business-action receipts and evidence policy. Production proof is still not claimed, and external provider/deployed proof remains blocked for later phases.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/06-agentic-business-action-receipts/06-02-SUMMARY.md`.
- Plan-owned created/modified files exist.
- Task commits found: `d9f89b3`, `0f07dca`, `6ba0680`, `5b1ab2e`, `9bdb123`, `853eb9a`.
- Required verification commands passed: focused Convex runtime Vitest, `npm run check:convex-codegen`, and `npm run typecheck`.
- GSD state hooks ran; `state.advance-plan` returned a parser error for this STATE format, and `requirements.mark-complete` returned `not_found` for Phase 6 IDs because the active requirements file is Phase 1-5 scoped.

---
*Phase: 06-agentic-business-action-receipts*
*Completed: 2026-06-29*

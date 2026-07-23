---
phase: 05-consumer-operating-proof
plan: 07
subsystem: api
tags: [comparison, structured-agent, read-only, parity, import-boundary]
requires:
  - phase: 05-consumer-operating-proof
    provides: exact Offering resolution, deterministic comparison, and human answer-first projection
provides:
  - fixed anonymous POST /api/compare adapter for comparison.compare
  - strict registered inspect-only structured comparison action
  - semantic parity and recursive zero-effect boundary evidence
  - professional-service and machine-data transfer falsification
affects: [phase-5-verification, structured-agent-surface, public-comparison]
tech-stack:
  added: []
  patterns:
    - fixed action adapter over a strict shared semantic contract
    - recursive import graph plus executed emission instrumentation
    - labelled exact-read fixtures for cross-profile falsification
key-files:
  created:
    - src/modules/comparison/comparison.actions.ts
    - src/routes/api.compare.ts
    - tests/eval/offering-comparison-transfer.test.ts
    - tests/imports/comparison-boundaries.test.ts
  modified:
    - src/modules/actions/index.ts
    - src/modules/comparison/comparison.functions.ts
    - src/routeTree.gen.ts
    - tests/integration/comparison-public-agent-route.test.ts
    - tests/integration/comparison-surface-parity.test.ts
key-decisions:
  - "The public adapter exposes exactly comparison.compare; callers cannot select an action."
  - "Only the action harness discriminator is transport-only; the remaining offering-comparison:v1 object deep-equals the human application result."
  - "Transfer evidence injects labelled records through the existing local exact-read port while retaining the real action, application, resolver, comparator, and host."
patterns-established:
  - "Structured read adapters re-resolve exact public records server-side and return Cache-Control: no-store."
  - "Effect fences traverse the actual runtime graph and detect aliases, side-effect imports, relative imports, and cross-owner private imports."
requirements-completed: [P5-AGENT]
coverage:
  - id: D1
    description: "Anonymous structured callers can compare up to four exact Offering revisions through one strict read-only action."
    requirement: P5-AGENT
    verification:
      - kind: integration
        ref: "tests/integration/comparison-public-agent-route.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Human and structured callers receive the same source-owned comparison meaning."
    requirement: P5-AGENT
    verification:
      - kind: integration
        ref: "tests/integration/comparison-surface-parity.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Comparison remains effect-free and transfers across professional-service and machine-data profiles."
    requirement: P5-AGENT
    verification:
      - kind: other
        ref: "tests/imports/comparison-boundaries.test.ts"
        status: pass
      - kind: other
        ref: "tests/eval/offering-comparison-transfer.test.ts"
        status: pass
    human_judgment: false
duration: 34min
completed: 2026-07-23
status: complete
---

# Phase 5 Plan 07: Structured Offering Comparison Summary

**One fixed anonymous read action now returns the exact source-owned Offering comparison used by the human surface, with strict input limits, no consequence authority, and cross-profile falsification.**

## Performance

- **Duration:** 34 min
- **Started:** 2026-07-23T10:37:36Z
- **Completed:** 2026-07-23T11:11:12Z
- **Tasks:** 3
- **Files modified:** 10 including this summary

## Accomplishments

- Added `comparison.compare` and `POST /api/compare` with strict closed schemas, four-selection and three-priority ceilings, duplicate rejection, bounded request bodies, server-side exact re-resolution, and `no-store`.
- Proved the structured output deep-equals the human application result after removing only the harness discriminator; no semantic timestamps or comparison facts are stripped.
- Fenced comparison entries from effect owners and cross-owner private source, then executed the actual direct harness with zero invocation, control, attempt, history, fetch, or source-mutation observations.
- Ran four labelled Offerings through the same real action/application/resolver/comparator/host, covering professional and machine ordering, tie, unknown, not supplied, stale, partial, exact-revision disclosure, decisive fact mutation, and cross-profile `not_comparable`.

## Task Commits

1. **Task 1 RED: public action and parity contract** — `6d8e176b`
2. **Task 1 GREEN: fixed read-only comparison action** — `80dce538`
3. **Task 2 RED: comparison effect fence** — `0ad531f3`
4. **Task 2 GREEN: narrow traversed harness graph** — `b7909df3`
5. **Task 2 correction: direct control instrumentation** — `6a63af12`
6. **Task 3 RED: missing machine transfer fixture** — `2a9b6714`
7. **Task 3 GREEN: vertical and horizontal transfer eval** — `22171de0`

## Verification

- `npm exec -- vitest run tests/integration/comparison-public-agent-route.test.ts tests/integration/comparison-surface-parity.test.ts tests/unit/actions/registry.test.ts tests/imports/comparison-boundaries.test.ts tests/eval/offering-comparison-transfer.test.ts` — 5 files, 40 tests passed.
- `npm exec -- oxlint` on every changed source and test path — passed with warnings denied.
- Changed-path TypeScript diagnostic filter — no changed-path errors.
- `npm run build` after route creation and route-tree generation — passed.
- `git diff --check` — passed.

## Decisions Made

The structured API is intentionally fixed to one inspect-only action. There is no caller-selected action ID, authority input, effect continuation, arbitrary property bag, score, or profile-specific host branch. The exact historical Offering remains selected even when a newer current revision exists; the newer revision is disclosed rather than substituted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Boundary correctness] Closed import-fence bypasses**

- **Found during:** Task 2
- **Issue:** Side-effect and relative imports could evade the first graph parser, and treating the harness runtime as a terminal could hide transitive ownership.
- **Fix:** Parse side-effect imports, resolve relative imports, reject cross-owner `internal/*` access, and traverse `harness/action-tool` itself.
- **Files modified:** `tests/imports/comparison-boundaries.test.ts`, `src/routes/api.compare.ts`
- **Verification:** Focused Task 2 matrix passed 18 tests.
- **Committed in:** `b7909df3`

**2. [Rule 2 - Evidence correctness] Observed direct control emissions**

- **Found during:** Task 2
- **Issue:** The initial negative runtime evidence observed network and source mutations but inferred invocation/control/attempt/history absence from static reachability.
- **Fix:** Reused the existing harness boundary instrumentation around the actual direct runner.
- **Files modified:** `tests/integration/comparison-surface-parity.test.ts`
- **Verification:** Zero invocation, control, attempt, and history emissions; one expected allow-policy observation.
- **Committed in:** `6a63af12`

**Total deviations:** 2 auto-fixed correctness gaps. Both strengthened the named boundary without widening production behavior.

## Issues Encountered

`npm run test:imports` still reports seven inherited failures in capability-contract, capability-supply, private-import, and Customer Request completeness tests. None names or traverses a changed Plan 05-07 path. The focused comparison graph/runtime matrix is green; these unrelated failures were recorded and not absorbed into an implementation loop.

## Known Stubs

None. The transfer records are explicitly labelled eval fixtures and enter only through a test-local mock of the existing local exact-read port.

## Evidence and Claim Ceiling

Evidence class: source inspection, focused unit/integration tests, recursive import analysis, and labelled local fixture evals.

This proves a source-owned, effect-free structured comparison contract for the named fixtures and paths. It does not prove hosted reachability, real supply quality, recommendation quality, customer demand, willingness to pay, retention, provider fulfilment, payment, or production safety.

## User Setup Required

None.

## Next Phase Readiness

Plan 05-07 is ready for parent integration and Phase 5 verification. There is no source-linked P0/P1 blocker within this plan boundary.

## Self-Check: PASSED

All created files and task commits exist. The worktree was clean before this summary was added.

---
*Phase: 05-consumer-operating-proof*
*Completed: 2026-07-23*

---
phase: 05-consumer-operating-proof
plan: 05
subsystem: comparison
tags: [offering-comparison, exact-revision, deterministic-brief, lexicographic-ordering, provenance]
requires:
  - phase: 05-consumer-operating-proof
    provides: catalog comparison envelopes, public history reads, and live registry suppression
provides:
  - Strict bounded offering-comparison:v1 URL and semantic contracts
  - Live-gated exact-revision resolution with ordinary partial and refusal outcomes
  - Pure stated-priority ordering and deterministic answer-first briefs
affects: [05-06, comparison-route, consumer-operating-proof]
tech-stack:
  added: []
  patterns:
    - Exact tuple resolution behind an observable live-availability gate
    - Minimal decisive priority prefix without scores, weights, or hidden tie-breaks
    - Stable total length-prefixed semantic identifiers
key-files:
  created:
    - src/modules/comparison/public.ts
    - src/modules/comparison/internal/contract.ts
    - src/modules/comparison/internal/resolve.ts
    - src/modules/comparison/internal/compare.ts
    - src/modules/comparison/internal/brief.ts
  modified:
    - tests/unit/comparison/contract.test.ts
    - tests/unit/comparison/profiles.test.ts
    - tests/unit/comparison/resolve.test.ts
    - tests/unit/comparison/compare.test.ts
    - tests/unit/comparison/brief.test.ts
key-decisions:
  - "Ordering is lexicographic over the stated closed priority sequence; it has no score, weight, model inference, or hidden tie-break."
  - "The URL observation timestamp is request context only and never becomes a known public fact."
  - "A live suppression refusal prevents the historical Offering read, while valid sibling selections remain available in URL order."
patterns-established:
  - "Resolve exact identity from businessId, offeringRef, and revision; keep projectionObservedAt outside the read-port identity."
  - "Only the minimal priority prefix required for a unique order may appear as decisive evidence."
requirements-completed: [P5-COMPARE]
coverage:
  - id: D1
    description: Strict bounded URL and registered-profile contracts
    requirement: P5-COMPARE
    verification:
      - kind: unit
        ref: tests/unit/comparison/contract.test.ts and tests/unit/comparison/profiles.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Exact historical selection resolution behind live suppression checks
    requirement: P5-COMPARE
    verification:
      - kind: unit
        ref: tests/unit/comparison/resolve.test.ts plus catalog and registry predecessor guards
        status: pass
    human_judgment: false
  - id: D3
    description: Deterministic stated-priority comparison and complete decision brief
    requirement: P5-COMPARE
    verification:
      - kind: unit
        ref: tests/unit/comparison/compare.test.ts and tests/unit/comparison/brief.test.ts
        status: pass
    human_judgment: false
duration: 28min
completed: 2026-07-23
status: complete
---

# Phase 5 Plan 05: Offering Comparison Semantics Summary

**Exact-revision Offering comparison with live suppression, closed lexicographic priorities, explicit uncertainty, and a model-independent deterministic brief**

## Performance

- **Duration:** 28 min
- **Started:** 2026-07-23T07:24:46Z
- **Completed:** 2026-07-23T07:52:38Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- Added a strict public contract for up to four exact Offering tuples and three registered priorities; malformed, duplicate, over-limit, unknown, and free-text state is refused without throwing.
- Added a two-stage resolver that checks live availability before reading exact public history, preserves selected old revisions and URL order, reports newer current references separately, and retains valid selections when siblings are refused.
- Added common-first and registered-profile rows, pure stated-priority ordering, and stable briefs whose reasons, facts, caveats, details, and inspect-only actions use deterministic semantic IDs.

## Observable Evals

The final focused and predecessor matrix passed 61 tests across seven files. Observable cases include:

- malformed and fifth selections, fourth priorities, duplicates, oversized identifiers, unknown priorities, and lone-surrogate identifiers produce ordinary bounded outcomes rather than exceptions;
- a suppressed Offering calls only the live gate and never the historical read;
- an eligible old revision remains selected while a newer current reference is disclosed separately;
- stale or partial projections and refused selected items suppress ordering;
- no priority, ties, missing decisive evidence, stale decisive evidence, and cross-profile facts remain explicitly unranked;
- swapping two stated machine-data priorities swaps the winner, proving sequence rather than weights;
- an earlier priority that uniquely orders the set is the sole decisive prefix, while later unknown facts remain visible without vetoing that order;
- a tampered URL observation timestamp cannot become a known public fact;
- brief IDs and bounded foreground facts remain deterministic while all mandatory caveats survive.

## Task Commits

1. **Semantic RED for all three tasks** — `3e3d7af9` (test)
2. **Strict contracts, resolver, comparator, projection, and brief** — `37690997` (feat)
3. **Keep URL observation time non-authoritative** — `563f8f7c` (fix)

## Files Created/Modified

- `src/modules/comparison/public.ts` — intentional comparison public seam.
- `src/modules/comparison/internal/contract.ts` — closed `offering-comparison:v1` types and ordinary outcomes.
- `src/modules/comparison/internal/url-state.ts` — strict bounded parse and canonical serialization.
- `src/modules/comparison/internal/profiles/professional-service-v1.ts` — registered professional-service dimensions.
- `src/modules/comparison/internal/profiles/machine-data-v1.ts` — registered machine-data dimensions.
- `src/modules/comparison/internal/resolve.ts` — live-first exact-history resolver.
- `src/modules/comparison/internal/projection.ts` — common-first source-owned fact rows and stable identifiers.
- `src/modules/comparison/internal/compare.ts` — pure lexicographic ordering and explicit unranked states.
- `src/modules/comparison/internal/brief.ts` — deterministic answer-first decision brief.
- `tests/unit/comparison/{contract,profiles,resolve,compare,brief}.test.ts` — semantic, adversarial, provenance, and mutation evals.

## Decisions Made

- The system evaluates priorities sequentially and stops once the full set has a unique order. Later rows remain visible, but non-decisive missing evidence does not retroactively veto an already-settled earlier priority.
- Stable selection IDs use total length-prefixed tuple components. This prevents delimiter collisions and remains defined for arbitrary JavaScript strings, including lone UTF-16 surrogates.
- `projectionObservedAt` remains normalized URL/request context. It is stripped before read-port calls, omitted from fact rows, and cannot establish public provenance or affect ordering.
- Stale/partial projection disposition and any refused selected item suppress ordering even when individual displayed cells are otherwise known.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Correctness] Made stable tuple identifiers total and collision-free**

- **Found during:** Hostile contract review
- **Issue:** Delimiter-based identity could collide for colon-bearing tuple components, and URI encoding could throw for lone surrogates.
- **Fix:** Used total length-prefixed components and added both adversarial falsifiers.
- **Files modified:** `src/modules/comparison/internal/projection.ts`, `tests/unit/comparison/contract.test.ts`
- **Verification:** Final 61-test matrix passed.
- **Committed in:** `37690997`

**2. [Rule 1 - Safety] Suppressed ordering for non-current or unavailable selected state**

- **Found during:** Comparator correction audit
- **Issue:** Known cells could otherwise rank a stale/partial projection or an incomplete selected set.
- **Fix:** Added aggregate resolver disposition and fail-closed ordering postures for stale, partial, and unavailable selection state.
- **Files modified:** `src/modules/comparison/internal/resolve.ts`, `src/modules/comparison/internal/compare.ts`, comparison tests
- **Verification:** Stale, partial, and refused-selection falsifiers passed.
- **Committed in:** `37690997`

**3. [Rule 1 - Evidence] Restricted decisive evidence to the minimal required priority prefix**

- **Found during:** Source-facing ordering review
- **Issue:** Reporting all configured priorities as decisive would overstate why an order was reached.
- **Fix:** Evaluated priorities in sequence and emitted only the prefix needed to uniquely order the full set.
- **Files modified:** `src/modules/comparison/internal/compare.ts`, `tests/unit/comparison/compare.test.ts`
- **Verification:** Anti-weight and later-unknown tests passed.
- **Committed in:** `37690997`

**4. [Rule 1 - Provenance] Prevented untrusted URL time from becoming a public fact**

- **Found during:** Final provenance audit
- **Issue:** `projectionObservedAt` originated in public URL state but was projected as a known `publicly_observed` fact.
- **Fix:** Kept it solely as non-authoritative request context and removed the fact-row dimension.
- **Files modified:** `src/modules/comparison/internal/contract.ts`, `src/modules/comparison/internal/projection.ts`, `tests/unit/comparison/compare.test.ts`
- **Verification:** Tampered timestamp falsifier and final 61-test matrix passed.
- **Committed in:** `563f8f7c`

**Total deviations:** 4 auto-fixed Rule 1 correctness/evidence issues.
**Impact on plan:** All changes narrowed claims and closed safety or provenance gaps inside the planned comparison boundary; no route, UI, action, effect, registry, or catalog ownership was added.

## Verification

- `npm exec -- vitest run tests/unit/comparison/contract.test.ts tests/unit/comparison/profiles.test.ts tests/unit/comparison/resolve.test.ts tests/unit/comparison/compare.test.ts tests/unit/comparison/brief.test.ts tests/unit/catalog/offering-public-history.test.ts tests/unit/registry/offering-runtime-guards.test.ts` — PASS, 7 files / 61 tests.
- `npm run typecheck 2>&1 | rg 'src/modules/comparison|tests/unit/comparison' || true` — PASS, no changed-path diagnostics.
- `npm run test:imports` — inherited-red outside this parcel: capability-supply, capability-contract, private-import, and Customer Request completeness diagnostics; no comparison path was reported.
- `git diff --check` — PASS.

## Known Stubs

None. Empty arrays in the implementation are bounded accumulators for resolved results, caveats, and ordering work; they are not UI or data-source placeholders.

## Issues Encountered

Repository-wide typecheck and import checks remain red in unchanged Phase 5 predecessor areas. They were recorded as inherited diagnostics and not absorbed into this bounded parcel. The changed-path type filter and comparison import boundary are clean.

## Evidence and Claim Ceiling

Evidence is isolated committed source plus deterministic unit and hostile-fixture execution. It proves contract behavior, exact read-port sequencing, refusal semantics, projection safety, ordering rules, and brief completeness at this revision.

It does not prove route or UI reachability, browser behavior, hosted deployment, live provider fulfilment, customer usefulness, accessibility in use, or production safety. The comparison owner is ready for parent integration, but is not yet a customer-visible operating loop.

## User Setup Required

None.

## Next Phase Readiness

The parent can integrate commits `3e3d7af9`, `37690997`, and `563f8f7c`, then rerun the seven-file matrix on the integrated tree. The next safe product action is 05-06 transport/rendering against this single public semantic owner; it must not recreate ranking or provenance meaning in route or UI code.

## Self-Check: PASSED

All 14 plan-owned source/test paths exist. Commits `3e3d7af9`, `37690997`, and `563f8f7c` are present, the worktree is clean before summary creation, and no tracked file deletion appears in any task commit.

---
*Phase: 05-consumer-operating-proof*
*Completed: 2026-07-23*

---
phase: 05-consumer-operating-proof
plan: 02
subsystem: catalog
tags: [convex, offering-history, comparison-profiles, zod]
requires:
  - phase: 05-consumer-operating-proof
    plan: 01
    provides: committed Offering-v2 source and public projection predecessor
provides:
  - exact historically public Offering revision resolution with live suppression
  - retained-safe ordinary withdrawal and immediate privacy or safety hiding
  - strict professional_service:v1 and machine_data:v1 comparison profiles
affects: [05-03-registry-cutover, 05-05-comparison-semantics, 05-06-public-comparison]
tech-stack:
  added: []
  patterns:
    - exact retained-public-history evidence before immutable fact reads
    - closed Zod profile codecs validated before revision hashing
key-files:
  created:
    - src/modules/catalog/internal/offering-public-history.ts
    - tests/unit/catalog/offering-public-history.test.ts
    - tests/unit/comparison/contract.test.ts
    - tests/unit/comparison/profiles.test.ts
  modified:
    - .planning/adr/ADR-026-one-business-supply-graph.md
    - src/modules/catalog/internal/offering-supply.ts
    - src/modules/catalog/internal/offering-source.ts
    - src/modules/catalog/internal/schema.ts
    - src/modules/catalog/public.ts
    - convex/catalog.ts
    - convex/catalogSupplyProjection.ts
    - tests/unit/schema/convex-schema.test.ts
key-decisions:
  - "Retain safe previously public Offering revisions after ordinary withdrawal; privacy, safety and live-business suppression hide them immediately."
  - "Keep current authoring compatible when no comparison profile is supplied, while strictly refusing malformed supplied profiles before hashing."
patterns-established:
  - "Historical resolution checks live business publication and suppression before exact public-history evidence and revision facts."
  - "A newer current revision is returned only as separate identity, never as a substitute for the selected historical revision."
requirements-completed: [P5-CATALOG]
coverage:
  - id: D1
    description: Exact retained historical revision resolution with non-substitution and live suppression
    requirement: P5-CATALOG
    verification:
      - kind: unit
        ref: tests/unit/catalog/offering-public-history.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/schema/convex-schema.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Strict closed professional-service and machine-data profile codecs inside revision identity
    requirement: P5-CATALOG
    verification:
      - kind: unit
        ref: tests/unit/comparison/contract.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/comparison/profiles.test.ts
        status: pass
    human_judgment: false
duration: 29min
completed: 2026-07-23
status: complete
---

# Phase 05 Plan 02: Catalog history and comparison profiles Summary

**Exact retained-public Offering history with fail-closed live suppression and two strict revision-hashed comparison profiles**

## Performance

- **Duration:** 29 min
- **Started:** 2026-07-23T05:23:00Z
- **Completed:** 2026-07-23T05:52:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Recorded the accepted `retain-safe-history` policy in ADR-026 and implemented exact publication evidence keyed by business, Offering, revision and source hash.
- Added a bounded indexed resolver that refuses never-public, mismatched, suppressed, privacy-hidden and safety-hidden selections before returning revision facts.
- Made privacy and safety withdrawal dispositions monotonic: later ordinary pause, retirement or withdrawal cannot downgrade either hidden state.
- Added one strict comparison envelope with exactly `professional_service:v1` and `machine_data:v1`; explicit known, unknown, not-supplied and stale facts are validated before participating in the revision hash.

## Task Commits

1. **Tasks 2–3 RED: historical eligibility and closed profile contracts** — `faaec0f2`
2. **Tasks 1–3 GREEN: ADR policy, source contracts, persistence and bounded read** — `ec553904`
3. **Bounded P1 correction: monotonic privacy and safety hiding** — correction commit containing this summary update

## Files Created/Modified

- `.planning/adr/ADR-026-one-business-supply-graph.md` — accepted withdrawal, suppression and non-substitution policy.
- `src/modules/catalog/internal/offering-public-history.ts` — exact historical eligibility and ordinary refusal outcomes.
- `src/modules/catalog/internal/offering-supply.ts` — strict comparison fact/profile codecs and public projection.
- `src/modules/catalog/internal/offering-source.ts` — validates profiles before immutable revision hashing.
- `src/modules/catalog/internal/schema.ts` — retained-history table/index and closed stored profile validators.
- `src/modules/catalog/public.ts` — intentional catalog exports.
- `convex/catalog.ts` — bounded exact historical read and withdrawal disposition recording.
- `convex/catalogSupplyProjection.ts` — publication evidence creation and stored-profile validation.
- `tests/unit/catalog/offering-public-history.test.ts` — exactness, hostile lineage, suppression and bounded-read falsifiers.
- `tests/unit/comparison/contract.test.ts` — common envelope and typed fact-state falsifiers.
- `tests/unit/comparison/profiles.test.ts` — both profile versions, hostile shapes and hash participation.
- `tests/unit/schema/convex-schema.test.ts` — frozen predecessor inventory plus retained-history table/index.

## Decisions Made

- Ordinary withdrawal stops new discovery but records `withdrawnAt` and retains safe exact history.
- `hidden_privacy` and `hidden_safety` are explicit durable dispositions; live business unpublication or suppression is rechecked on every read.
- Current Offering authoring may omit a comparison profile for compatibility. Once supplied, a profile must pass a strict closed codec; malformed data is refused rather than cast or defaulted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reconciled stale schema inventory before establishing the semantic RED**
- **Found during:** Task 2
- **Issue:** The inherited schema inventory omitted 19 tables already committed by the exact predecessor, so its baseline failure could mask the missing retained-history table.
- **Fix:** Added only the frozen predecessor table names and the new retained-history expectation; no source table was removed or altered to satisfy stale assertions.
- **Files modified:** `tests/unit/schema/convex-schema.test.ts`
- **Verification:** RED then failed solely for the missing retained-history table/index; GREEN passes.
- **Committed in:** `faaec0f2`

**2. [Rule 3 - Tool path correction] Removed accidental shared-checkout patch hunks**
- **Found during:** Task 3
- **Issue:** Relative patch calls initially resolved to the shared checkout rather than the delegated worktree.
- **Fix:** Reversed only the exact inserted hunks, moved the sole new shared file to Trash, and reapplied through absolute worktree-contained paths. No reset, restore, cleanup or permanent deletion was used.
- **Files modified:** No shared-checkout changes remain from this plan.
- **Verification:** Marker scan of the shared checkout returned no inserted plan symbols; all owned work is committed only on the isolated branch.
- **Committed in:** Not applicable; correction removed unintended writes.

**3. [Rule 1 - Bug] Preserved privacy and safety hiding across later lifecycle changes**
- **Found during:** Parent integration audit
- **Issue:** A later ordinary non-published transition defaulted to `retain_safe_history`, and the persistence helper overwrote an already hidden privacy or safety disposition.
- **Fix:** Ordinary transitions now omit a disposition override, while the persistence helper treats either existing hidden disposition as monotonic. This plan defines no unhide transition.
- **Files modified:** `convex/catalog.ts`, `convex/catalogSupplyProjection.ts`, `tests/unit/catalog/offering-public-history.test.ts`
- **Verification:** Both `hidden_privacy` and `hidden_safety` remain unchanged after a later ordinary withdrawal; focused matrix passes.
- **Committed in:** Bounded correction commit containing this summary update.

**Total deviations:** 3 auto-fixed blocking/tooling/behavior issues. **Impact:** No product scope expansion; the correction closes a privacy and safety downgrade path inside the planned catalog-owned transition.

## Issues Encountered

- Full repository typecheck remains inherited-red in capability-supply, Customer Request, notification and older tests. A filtered diagnostic reported zero errors in the changed catalog and Convex paths.
- The generated Convex control plane was not called. This plan has no codegen, deployment or hosted-readback evidence.

## Known Stubs

None. Optional absence of a comparison profile is an explicit compatibility state, not rendered or comparison-ready mock data.

## Verification

- `npm exec -- vitest run tests/unit/catalog/offering-public-history.test.ts tests/unit/schema/convex-schema.test.ts tests/unit/comparison/contract.test.ts tests/unit/comparison/profiles.test.ts tests/unit/catalog/offering-source.test.ts tests/unit/catalog/offering-supply.test.ts` — PASS, 6 files / 33 tests.
- `rg -n "historically public|withdrawnAt|safe display|suppression|never-public|never substitutes|privacy|safety" .planning/adr/ADR-026-one-business-supply-graph.md` — PASS.
- `git diff --check` — PASS.
- `npm run typecheck` — DIAGNOSTIC, inherited repository failures remain; changed-path filter is empty.

## Evidence and Claim Ceiling

Evidence is an isolated committed source candidate plus focused local unit/schema fixtures and read-only type diagnostics. It proves the catalog contract and source transitions exercised by those tests. It does not prove deployment, hosted readback, real supply, recommendation quality, provider behavior, customer value, accessibility in use or production safety.

## Next Phase Readiness

Parent should audit and integrate the exact candidate revision before 05-03. Registry transport and action parity remain downstream; comparison rendering, ordering and generative composition do not own or alter these facts.

## Self-Check: PASSED

- All key created files exist.
- RED commit `faaec0f2` and GREEN commit `ec553904` exist.
- Focused plan matrix, including monotonic privacy/safety regression coverage, passes and no changed-path type errors remain.

---
*Phase: 05-consumer-operating-proof*
*Completed: 2026-07-23*

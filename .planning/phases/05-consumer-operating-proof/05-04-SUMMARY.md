---
phase: 05-consumer-operating-proof
plan: 04
subsystem: answer-and-discovery
tags: [offering-v2, answer-thread, discovery, react, astryx, tdd]
requires:
  - phase: 05-consumer-operating-proof
    plan: 03
    provides: strict profile-bearing Offering-v2 registry action output
provides:
  - strict Offering-v2 Answer and Answer Thread consumption without legacy reconstruction
  - durable offering-cards artifact from live turn through public replay and Astryx rendering
  - honest discovery adapter claims and a literal fail-closed consumer inventory
affects: [05-05, 05-07, comparison-semantics, answer-thread, developer-discovery]
tech-stack:
  added: []
  patterns:
    - discriminated legacy-v1 and Offering-v2 consumer lanes
    - exact source-order Offering artifact projection
    - source-graph consumer inventory gate
key-files:
  created: []
  modified:
    - src/modules/answer/internal/dto-to-answer-source.ts
    - src/modules/answer/internal/answer-tool-use-agent.ts
    - src/modules/answer-thread/internal/tool-runner.ts
    - src/modules/answer-thread/internal/turns/retrieval-first.ts
    - src/modules/answer-thread/internal/answer-turn-finalization.ts
    - src/modules/answer/answer-schema.ts
    - src/components/ae/artifacts/AeGenerativeAnswer.tsx
    - src/modules/discovery/developer-discovery.ts
    - tests/integration/discovery-llms-offering-parity.test.ts
key-decisions:
  - "Keep catalogue-v1 AnswerSource explicitly legacy-only and add a separate OfferingAnswerSource lane."
  - "Represent visible v2 results as offering-cards in registry source order; do not adapt, rank, or infer a primary Offering."
  - "Only the three executable registry GET adapters are claimed reachable; comparison remains deferred to 05-07."
patterns-established:
  - "Offering-v2 continuity: exact business, Offering revision, comparison profile, provenance/currentness, access, and support facts survive tool, snapshot, freeze, replay, and artifact payloads."
  - "Legacy isolation: v1 providers, comparison, inquiry, shortlist, and follow-up paths do not accept v2 action output."
requirements-completed: [P5-REGISTRY]
coverage:
  - id: D1
    description: "Answer and Answer Thread preserve exact Offering-v2 sources and reject ungrounded slugs."
    requirement: P5-REGISTRY
    verification:
      - kind: integration
        ref: "tests/integration/answer-tool-calls.test.ts and tests/integration/answer-turn-empty-state.test.ts"
        status: pass
      - kind: unit
        ref: "tests/unit/answer/answer-tool-use-agent.test.ts and tests/unit/answer-thread/answer-turn-grounding.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Offering cards persist, replay, merge idempotently, cap in source order, and render business and Offering names without fabricated legacy labels."
    requirement: P5-REGISTRY
    verification:
      - kind: unit
        ref: "tests/unit/answer-thread/public-projection.test.ts, tests/unit/answer-stream/answer-turn-state.test.ts, and tests/unit/chat/ae-generative-answer-selected-provider.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "Discovery exposes exact Offering facts, names only real GET adapters, and fails closed on a new v1 action-output consumer."
    requirement: P5-REGISTRY
    verification:
      - kind: integration
        ref: "tests/integration/discovery-llms-offering-parity.test.ts and tests/integration/registry-offering-parity.test.ts"
        status: pass
    human_judgment: false
duration: 27min
completed: 2026-07-23
status: complete
---

# Phase 5 Plan 04: Offering-v2 Consumer Migration Summary

**Exact Offering revisions and closed profiles now survive registry actions through Answer, durable Answer Thread replay, visible Astryx cards, and honest discovery descriptors without rebuilding legacy service, trust, contact, ranking, or effect meaning.**

## Performance

- **Duration:** 27 min
- **Started:** 2026-07-23T06:50:32Z
- **Completed:** 2026-07-23T07:17:14Z
- **Tasks:** 2
- **Files modified:** 35

## Accomplishments

- Split Answer consumption into explicit legacy-v1 and strict Offering-v2 lanes, preserving both closed comparison profiles and exact revisions.
- Closed the real customer loop from a direct v2 registry match to a non-empty answer, durable frozen evidence, public replay, idempotent capped `offering-cards`, and minimal Astryx rendering.
- Migrated discovery projections and added a binding-aware source inventory that fails with the path of any new unreviewed v1 action-output consumer.

## Task Commits

1. **Task 1 RED: consumer parity gates** - `eb242ba8`
2. **Expanded vertical RED: visible durable artifact gaps** - `358e99e6`
3. **Tasks 1-2 GREEN: Offering consumers, discovery inventory, and visible artifact bridge** - `6a5e4e76`

## Files Created/Modified

- `src/modules/answer/internal/dto-to-answer-source.ts` - Separates exact Offering-v2 projection from explicit legacy AnswerSource mapping.
- `src/modules/answer/internal/answer-tool-use-agent.ts` - Accumulates exact Offering sources and grounds their business slugs.
- `src/modules/answer-thread/internal/tool-runner.ts` - Executes registered read actions into the v2-native result lane.
- `src/modules/answer-thread/internal/turns/retrieval-first.ts` - Treats v2 matches as non-empty and uses uncertainty-safe customer copy.
- `src/modules/answer-thread/internal/answer-turn-finalization.ts` - Freezes exact source/revision/profile identity into durable evidence and hashes.
- `src/modules/answer/answer-schema.ts` - Adds the strict `offering-cards` artifact discriminant.
- `src/components/ae/artifacts/AeGenerativeAnswer.tsx` - Renders compact Astryx business and Offering cards without legacy trust/contact claims.
- `src/modules/discovery/developer-discovery.ts` - Publishes exact Offering facts and only real structured registry GET adapters.
- `tests/integration/discovery-llms-offering-parity.test.ts` - Enforces discovery parity and the literal source-flow inventory.

## Decisions Made

- Legacy provider artifacts remain intact for legacy inputs only. V2 sources use a separate discriminated field and artifact.
- Source/citation order is the only order preserved. This plan adds no ranking, comparison ordering, primary Offering, inquiry, effect continuation, or contact preference.
- The visible card is deliberately compact, but its artifact payload retains exact revision/profile facts for later inspection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Closed the visible and durable Answer artifact bridge**
- **Found during:** Task 1
- **Issue:** The initially bounded tool-runner projection was discarded by the next live Answer consumer, making a real v2 match look empty and leaving no customer-visible outcome.
- **Fix:** With parent authorization, carried the discriminated source through the existing snapshot, gate, persistence, replay, reducer, and Astryx artifact seams.
- **Files modified:** Answer and Answer Thread artifact pipeline plus focused evals
- **Verification:** Nine focused files, 48 tests passing
- **Committed in:** `358e99e6`, `6a5e4e76`

**2. [Rule 1 - Bug] Removed confirmation claims from partial Offering facts**
- **Found during:** Expanded Answer artifact audit
- **Issue:** Initial copy said businesses confirmed fit, timing, price, access, and availability even though v2 allows unknown, not-supplied, stale, and absent-access facts.
- **Fix:** Replaced it with neutral published-details wording, an explicit missing/unknown/stale caveat, and an inspection-first next step; added a falsifier.
- **Files modified:** `src/modules/answer-thread/internal/turns/retrieval-first.ts`, `tests/unit/answer-thread/answer-turn-grounding.test.ts`
- **Verification:** Unknown/stale/no-access copy falsifier passing
- **Committed in:** `6a5e4e76`

---

**Total deviations:** 2 auto-fixed (1 missing critical path, 1 correctness bug)
**Impact on plan:** The authorized expansion was the minimum existing artifact path required to make the planned consumer migration reachable, durable, and observable. No new endpoint, database/schema, control plane, dependency, comparison, or effect surface was added.

## Issues Encountered

- Repository-wide typecheck remains non-zero from inherited diagnostics, with zero diagnostics in changed paths.
- `test:imports` remains non-zero from seven inherited architecture checks, including existing private-import debt.
- `test:copy` remains non-zero from four inherited checks: the pre-existing paid-operation settlement scanner findings and the absent `.planning/GTM-READINESS.md`.
- The commit hook reported six non-blocking React Doctor performance warnings while scoring 91/100; focused behavior and render evals remained green.

## Verification

- `npm exec -- vitest run` over the nine focused registry, Answer, Answer Thread, reducer, renderer, and discovery files: **48/48 passed**.
- `npm run typecheck`: **non-zero repository-wide; zero changed-path diagnostics**.
- `npm run test:imports`: **non-zero from inherited failures; no new owned-path failure**.
- `npm run test:copy`: **non-zero from inherited failures; no new owned-path failure**.
- `git diff --check`: **passed**.

Evidence class is source, unit/integration, local fixture, and React render evidence only. It does not prove hosted reachability, provider operation, deployment, recommendation quality, production safety, or customer value.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- 05-05 can consume exact, profile-bearing Offering facts without crossing a v2-to-v1 reconstruction seam.
- Comparison reachability remains correctly deferred to the fixed POST adapter in 05-07.
- Parent integration must rerun the same matrices on the integrated exact tree before upgrading the evidence claim.

## Self-Check: PASSED

- All 35 changed source/test files exist.
- Commits `eb242ba8`, `358e99e6`, and `6a5e4e76` exist on the worktree branch.
- Summary claims match the final focused command results and inherited-failure logs.

---
*Phase: 05-consumer-operating-proof*
*Completed: 2026-07-23*

---
phase: 05-consumer-operating-proof
plan: 03
subsystem: registry
tags: [convex, offering-v2, full-text-search, zod, opaque-cursors]
requires:
  - phase: 05-consumer-operating-proof
    plan: 02
    provides: exact Offering revisions and closed comparison profiles
provides:
  - one strict Offering-v2 meaning across public HTTP and registered list/search/detail actions
  - strict stored-snapshot and public-result codecs with no legacy or private destination
  - business-level Offering-v2 search documents synchronized from the projection rebuild
  - v2-filtered native Convex search pagination with opaque continuation cursors
affects: [05-04-consumer-migration, 05-05-comparison-semantics, public-registry]
tech-stack:
  added: []
  patterns:
    - public routes execute registered read-only actions backed by one source-owned application read
    - projection rebuild transaction owns one current Offering-v2 search document per business
    - legacy and v2 search documents coexist behind discriminator-specific full-text indexes
key-files:
  created:
    - src/modules/registry/internal/offering-snapshot-codec.ts
  modified:
    - convex/catalogSupplyProjection.ts
    - convex/registry.ts
    - src/modules/registry/internal/schema.ts
    - src/modules/registry/internal/search-documents.ts
    - src/modules/registry/registry.actions.ts
    - src/routes/api.businesses.ts
    - src/routes/api.businesses.search.ts
    - src/routes/api.businesses.$slug.ts
key-decisions:
  - "Keep registry.list/search/detail anonymous, read-only and replayable while making HTTP routes execute those exact registered actions."
  - "Evolve registrySearchDocuments compatibly with a strict v2 discriminator and separate v2-filtered full-text index; retain v1 rows and index during migration."
  - "Use stable business identity for one v2 document per business, and use Convex native opaque cursors instead of slug pagination over a repeated first window."
patterns-established:
  - "Stored Offering projections are strictly decoded before allowlisted public projection; malformed comparison currentness and extra/private fields fail closed."
  - "Successful projection rebuilds atomically replace search truth; retirement, unpublication, suppression or invalid projection removes it."
requirements-completed: [P5-REGISTRY]
coverage:
  - id: D1
    description: Strict profile-bearing Offering-v2 codecs preserve both closed profiles and refuse hostile stored or public payloads
    requirement: P5-REGISTRY
    verification:
      - kind: unit
        ref: tests/unit/registry/offering-runtime-guards.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/registry-offering-parity.test.ts
        status: pass
    human_judgment: false
  - id: D2
    description: Public list, search and detail HTTP routes execute their corresponding anonymous read-only registered actions
    requirement: P5-REGISTRY
    verification:
      - kind: unit
        ref: tests/unit/actions/registry.test.ts
        status: pass
      - kind: integration
        ref: tests/integration/registry-offering-parity.test.ts
        status: pass
    human_judgment: false
  - id: D3
    description: Native Offering publication owns one business-level search document with bounded opaque-cursor pagination and fail-closed removal
    requirement: P5-REGISTRY
    verification:
      - kind: unit
        ref: tests/unit/registry/search-documents.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/convex/registry-runtime.test.ts
        status: pass
      - kind: unit
        ref: tests/unit/schema/convex-schema.test.ts
        status: pass
    human_judgment: false
duration: 36min
completed: 2026-07-23
status: complete
---

# Phase 05 Plan 03: Offering-v2 registry parity Summary

**Strict Offering-v2 registry list/search/detail across HTTP and registered actions, with projection-owned native full-text search and opaque cursor continuation**

## Performance

- **Duration:** 36 min
- **Started:** 2026-07-23T06:01:47Z
- **Completed:** 2026-07-23T06:38:17Z
- **Tasks:** 2
- **Files modified:** 17

## Accomplishments

- Cut `registry.list`, `registry.search` and `registry.detail` plus their existing public HTTP routes to the same strict Offering-v2 application meaning while retaining anonymous, authority-free, replayable and zero-effect operation.
- Added strict stored-snapshot, public DTO and exact Convex return validation. Both `professional_service:v1` and `machine_data:v1` facts, provenance, currentness and exact revisions survive transport; service-v1, trust-grade and private fields have no v2 output destination.
- Evolved the existing search table compatibly: v1 rows and their index remain, while one business-level `registry-search-document:v2` row contains only public Offering search facts and is selected through a v2-filtered full-text index.
- Made the existing successful projection rebuild transaction replace native search truth and remove it on retirement, business unpublication, suppression or invalid projection.
- Replaced repeated first-window search with Convex native `.paginate`, opaque continuation cursors, page separation and typed invalid-cursor refusal.

## Task Commits

1. **Tasks 1–2 RED: strict Offering-v2 codec, HTTP/action parity and hostile projections** — `0ce31039`
2. **Tasks 1–2 GREEN: strict registry adapters and route-to-action execution** — `2c008d97`
3. **Predecessor RED: native Offering search document, index and cursor behavior** — `409df815`
4. **Suppression RED: remove indexed Offering facts before refusal** — `12f13d02`
5. **Predecessor GREEN: projection-owned native Offering search and pagination** — `21a218f9`

## Files Created/Modified

- `src/modules/registry/internal/offering-snapshot-codec.ts` — strict stored projection and public v2 codecs with catalog-owned comparison semantics.
- `src/modules/registry/internal/offering-api-projection.ts` — preserves public comparison profiles in the Offering DTO.
- `src/modules/registry/registry.actions.ts` — v2 output contracts and explicit anonymous read-only invocation contracts.
- `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts` — strict query parsing and execution through the corresponding registered action.
- `src/modules/registry/internal/search-documents.ts` — one allowlisted business-level v2 document builder with public Offering profile facts and exact revisions.
- `src/modules/registry/internal/schema.ts` — compatible v1/v2 document union, stable-business lookup and v2-filtered full-text index.
- `convex/catalogSupplyProjection.ts` — transactional search document replacement/removal from the existing projection rebuild hook.
- `convex/registry.ts` — exact v2 validators, strict stored decode, bounded native search pagination and typed cursor refusal.
- `tests/integration/registry-offering-parity.test.ts` — HTTP/action execution and semantic digest parity for both profiles.
- `tests/unit/registry/search-documents.test.ts` — privacy allowlist, exact profile/revision, slug-change replacement, retirement and live-suppression falsifiers.
- `tests/unit/convex/registry-runtime.test.ts` — native Offering-only term, page-one/page-two separation, v2 filter and invalid-cursor refusal.
- `tests/unit/schema/convex-schema.test.ts` — compatible table/index contract.

## Decisions Made

- Search documents are internal derived inventory, not an alternate Offering authority. The catalog projection remains authoritative and the same rebuild transaction owns search replacement or removal.
- A stable `businessId` lookup enforces one v2 document per business even when its public slug changes.
- Native Convex continuation cursors remain opaque. The public adapter relays them without interpreting or converting them to slugs.
- Answer Thread, discovery, inquiry, comparison ordering and Customer Request consumers remain outside this plan and retain their 05-04+ ownership.

## Deviations from Plan

### Authorized Predecessor Completion

**1. Added the missing native Offering-v2 search publication predecessor**
- **Found during:** Final Task 2 audit
- **Issue:** The initial v2 search read used legacy service-v1 search documents, which had no native Offering publication writer and repeatedly queried the same first window.
- **Decision:** Parent authorized a narrow ownership expansion to the existing schema fragment, search-document builder and projection rebuild hook.
- **Fix:** Added one compatible v2 document/index, atomic synchronization and native opaque cursor pagination. No new API edge, Meili caller, generic search layer or scan was introduced.
- **Verification:** Native Offering-only search, two one-item pages without overlap, v2 index filtering, replacement/removal and legacy compatibility all pass.
- **Committed in:** `21a218f9`

### Auto-fixed Issues

**2. [Rule 1 - Bug] Used stable business identity rather than slug for document ownership**
- **Found during:** Pre-commit hostile readback
- **Issue:** A slug-keyed v2 document could leave stale duplicate search truth after a business renamed its slug.
- **Fix:** Added `businessId`, the `by_businessId` index and stable business-keyed replacement. A slug-change regression proves only one updated row remains.
- **Files modified:** `src/modules/registry/internal/schema.ts`, `src/modules/registry/internal/search-documents.ts`, `convex/catalogSupplyProjection.ts`, `tests/unit/registry/search-documents.test.ts`
- **Verification:** Focused registry matrix passes.
- **Committed in:** `21a218f9`

**3. [Rule 1 - Bug] Delegated structural comparison validation to the catalog-owned semantic validator**
- **Found during:** Strict-codec implementation audit
- **Issue:** A structural duplicate alone could admit impossible known/stale currentness windows.
- **Fix:** The registry codec now finishes structural validation by invoking the canonical catalog comparison validator; hostile `validUntil < observedAt` fixtures refuse.
- **Files modified:** `src/modules/registry/internal/offering-snapshot-codec.ts`, `tests/unit/registry/offering-runtime-guards.test.ts`
- **Verification:** Hostile stored and public projection tests pass.
- **Committed in:** `2c008d97`

**Total deviations:** 1 authorized predecessor completion and 2 correctness fixes. **Impact:** The blast radius stayed inside the existing registry table, projection rebuild and public registry reads. No unrelated consumer or control-plane scope was absorbed.

## Issues Encountered

- Full repository typecheck remains inherited-red in capability-supply, Customer Request, notification and older test paths. The changed-path diagnostic filter is empty.
- Convex codegen, deployment and hosted index readback were not run because no control-plane or deployment authorization was provided.

## Known Stubs

None. Empty Offering arrays and absent optional comparison facts are explicit public states, not placeholder data.

## Verification

- Original 05-03 matrix plus predecessor coverage — PASS, 11 files / 65 tests.
- Original strict registry matrix — PASS, 5 files / 40 tests.
- `npm run typecheck` — DIAGNOSTIC, inherited repository failures remain; changed-path filter is empty.
- `git diff --check` — PASS.

Fixture semantic digests:

- list: `26794e2441fa942ab6b3712a5755e38e52eaf1e24501bf7ab5e44dafb797c302`
- search: `78b72f9758c540ed118bf17d0c812b47db51dd96f08e1e973ee3ec612388f78e`
- detail: `2d64c4a71fe8d122f93a4a99237bd3b6e604b756e9ecc015c26fb1035d7fbebe`

## Evidence and Claim Ceiling

Evidence is an isolated committed source candidate plus focused local unit, integration and schema fixtures. It proves the source transitions and semantic parity those tests execute. It does not prove generated-schema deployment, hosted search-index construction, public reachability, production cursor behavior, real supply quality, provider fulfilment, customer value, accessibility in use or production safety.

## Next Phase Readiness

Parent should audit and integrate this exact candidate, then regenerate its parent-owned Convex edge once and run the registry/HTTP matrix before releasing the revision to 05-04. Answer Thread and other consumers can now migrate to one source-owned Offering-v2 registry meaning without inheriting service-v1 search truth.

## Self-Check: PASSED

- All 17 changed source/test paths and the summary exist in the isolated worktree.
- RED commits `0ce31039`, `409df815`, `12f13d02` and GREEN commits `2c008d97`, `21a218f9` exist.
- The final 11-file/65-test matrix passes, the changed-path typecheck filter is empty and `git diff --check` passes.

---
*Phase: 05-consumer-operating-proof*
*Completed: 2026-07-23*

---
phase: 03-standard-agent-builder-discovery
plan: 01
subsystem: discovery-api
tags: [tanstack-start, public-catalog, developer-discovery, read-only-api, playwright, vitest]
requires:
  - phase: 01-ten-star-spine-foundation
    provides: Public catalog/search/detail/UCP/llms/sitemap source truth.
  - phase: 02-human-inquiry-owner-inbox
    provides: Public inquiry availability status contract only; private inquiry fields are excluded.
provides:
  - Read-only developer discovery route and JSON artifact endpoints.
  - Generated schema, examples, and fixture bundle over public catalog DTO parity.
  - Support matrix, gated exclusions, P2 public status adapter, fetch telemetry, and support kill controls.
  - Focused unit, integration, SEO, copy, E2E, and a11y coverage for Phase 3.
affects: [phase-03, public-discovery, developer-docs, copy-scans, route-tree]
tech-stack:
  added: []
  patterns:
    - Public-only discovery artifacts with non-authority metadata.
    - Optional protocol projections withheld unless source-owned gate evidence accepts.
    - Privacy-safe fetch telemetry returned as public readback headers.
key-files:
  created:
    - src/routes/api.discovery.schema.ts
    - src/routes/api.discovery.examples.ts
    - src/routes/api.discovery.fixtures.ts
    - tests/unit/discovery/developer-discovery-support-matrix.test.ts
    - tests/unit/discovery/developer-discovery-parity.test.ts
    - tests/unit/discovery/developer-discovery-telemetry.test.ts
    - tests/unit/discovery/developer-discovery-kill-rules.test.ts
    - tests/integration/developer-discovery.test.ts
    - tests/seo/developer-discovery.test.ts
    - tests/e2e/developer-discovery.spec.ts
    - tests/e2e/a11y/developer-discovery-a11y.spec.ts
    - tests/fixtures/bad-copy/protocol-claims.fixture
  modified:
    - src/modules/discovery/public.ts
    - src/routes/developers.discovery.tsx
    - src/lib/ui/contract-scans.ts
    - src/routeTree.gen.ts
key-decisions:
  - "Phase 2 dependency is satisfied only through readP2InquiryAvailabilityPublicStatus with state, publicReason, source, and lastVerifiedAt."
  - "API keys, SDK, CLI, plugin, hosted MCP, Agent Router, gallery, payment descriptors, and protected-action descriptors remain unavailable/deferred exclusions."
  - "Generated discovery artifacts live on read-only JSON routes and carry nonAuthority plus unsupported mutation/payment/action/provider/request-market flags."
  - "No commits were made by executor per user sprint-commit policy."
patterns-established:
  - "Discovery route handlers expose artifacts plus X-AE-* readback headers without logging secrets."
  - "Copy/source scans allow Phase 3 readback claims only in source-owned discovery runtime contexts."
  - "Playwright Phase 3 smokes assert endpoint payloads, headers, focus, and compact layout."
requirements-completed: [R1, R2, R3, R4, R5, R6, R7, R8]
coverage:
  - id: D1
    description: "Public P2 inquiry availability adapter exposes only allowed public fields and allowed states."
    requirement: R1
    verification:
      - kind: unit
        ref: "npm run test:unit -- tests/unit/discovery"
        status: pass
    human_judgment: false
  - id: D2
    description: "Support matrix ships base read-only discovery rows and keeps future platform/payment/action surfaces gated."
    requirement: R2
    verification:
      - kind: unit
        ref: "tests/unit/discovery/developer-discovery-support-matrix.test.ts"
        status: pass
      - kind: copy
        ref: "npm run test:copy && npm run test:copy:fixtures"
        status: pass
    human_judgment: false
  - id: D3
    description: "Generated schema, examples, and fixtures come from public DTO parity and withhold on disabled publication or parity failure."
    requirement: R3
    verification:
      - kind: unit
        ref: "tests/unit/discovery/developer-discovery-parity.test.ts"
        status: pass
      - kind: integration
        ref: "tests/integration/developer-discovery.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Developer discovery page and machine endpoints compile and serve read-only artifacts."
    requirement: R4
    verification:
      - kind: integration
        ref: "npm run test:integration -- tests/integration/developer-discovery.test.ts"
        status: pass
      - kind: e2e
        ref: "npx playwright test tests/e2e/developer-discovery.spec.ts --project=compact-chromium"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: false
  - id: D5
    description: "OpenAPI/MCP/API-key/platform surfaces are withheld by default and covered by protocol claim scans."
    requirement: R5
    verification:
      - kind: unit
        ref: "tests/unit/discovery/developer-discovery-kill-rules.test.ts"
        status: pass
      - kind: other
        ref: "npm run test:source-mining && npm run test:ui-contract"
        status: pass
    human_judgment: false
  - id: D6
    description: "Privacy-safe fetch telemetry maps to canonical Phase 3 funnel events without API-key events."
    requirement: R6
    verification:
      - kind: unit
        ref: "tests/unit/discovery/developer-discovery-telemetry.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "Discovery support record and kill controls gate launch readiness and publication."
    requirement: R7
    verification:
      - kind: unit
        ref: "tests/unit/discovery/developer-discovery-kill-rules.test.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: "Focused Phase 3 smoke, SEO, copy, type, import, standards, and UI scans pass locally."
    requirement: R8
    verification:
      - kind: other
        ref: "npm run typecheck; npm run test:types; npm run test:imports; npm run test:ts-standards"
        status: pass
      - kind: seo
        ref: "npm run test:seo -- tests/seo/developer-discovery.test.ts"
        status: pass
      - kind: automated_ui
        ref: "npx playwright test tests/e2e/a11y/developer-discovery-a11y.spec.ts --project=compact-chromium"
        status: pass
    human_judgment: false
duration: 24m52s
completed: 2026-06-29
status: complete
---

# Phase 3 Plan 01: Standard Agent/Builder Discovery Production Summary

**Read-only developer discovery over public catalog DTOs with generated schema/examples/fixtures, gated exclusions, public P2 status, and privacy-safe fetch telemetry.**

## Performance

- **Duration:** 24m52s
- **Started:** 2026-06-29T03:49:18Z
- **Completed:** 2026-06-29T04:14:10Z
- **Tasks:** 9/9
- **Files created/modified by executor:** 16 source/test files plus this summary

## Accomplishments

- Added Phase 3 public discovery contracts in `src/modules/discovery/public.ts`: P2 public inquiry availability status, support matrix, gated exclusions, generated artifacts, publication controls, support record readiness, kill rules, projection gates, and fetch telemetry.
- Added `/api/discovery/schema`, `/api/discovery/examples`, and `/api/discovery/fixtures` read-only JSON handlers with public cache/CORS/nosniff/readback headers.
- Updated `/developers/discovery` download links to the machine endpoints and kept API keys unavailable in public readback.
- Extended copy/source scans for Phase 3 readback contexts and protocol overclaim fixtures.
- Added focused unit, integration, SEO, E2E, and a11y coverage for P3-01 through P3-08.

## Task Commits

User explicitly requested sprint commits, not executor task commits. No staging, commits, pushes, or git index/ref writes were performed.

1. **P3-01: Gate Phase 3 on Phase 1 truth and public P2 status only** - `pending sprint commit` / `not committed by executor per user sprint policy`
2. **P3-02: Create support matrix and gated exclusions** - `pending sprint commit` / `not committed by executor per user sprint policy`
3. **P3-03: Generate schema, examples, and fixtures from public DTO parity** - `pending sprint commit` / `not committed by executor per user sprint policy`
4. **P3-04: Ship readback route and machine endpoints** - `pending sprint commit` / `not committed by executor per user sprint policy`
5. **P3-05: Gate optional OpenAPI, MCP, and API-key surfaces** - `pending sprint commit` / `not committed by executor per user sprint policy`
6. **P3-06: Add privacy-safe telemetry and operator readback** - `pending sprint commit` / `not committed by executor per user sprint policy`
7. **P3-06B: Create support record and kill controls** - `pending sprint commit` / `not committed by executor per user sprint policy`
8. **P3-07: Expand protocol claim scans and copy controls** - `pending sprint commit` / `not committed by executor per user sprint policy`
9. **P3-08: Add focused tests, smoke, and closeout proof** - `pending sprint commit` / `not committed by executor per user sprint policy`

**Plan metadata:** `pending sprint commit` / `not committed by executor per user sprint policy`

## Files Created/Modified

- `src/modules/discovery/public.ts` - Phase 3 discovery public contracts, artifacts, telemetry, gates, and support readiness.
- `src/routes/developers.discovery.tsx` - Discovery page download links point at JSON endpoints.
- `src/routes/api.discovery.schema.ts` - Schema artifact endpoint and shared JSON/header helpers.
- `src/routes/api.discovery.examples.ts` - Examples artifact endpoint.
- `src/routes/api.discovery.fixtures.ts` - Fixture bundle endpoint.
- `src/routeTree.gen.ts` - Narrow generated route manifest entries for the new discovery API routes.
- `src/lib/ui/contract-scans.ts` - Phase 3 runtime/source-owned readback allowlist and API route scan scope.
- `tests/unit/discovery/developer-discovery-support-matrix.test.ts` - Support matrix and gated exclusions coverage.
- `tests/unit/discovery/developer-discovery-parity.test.ts` - Generated artifact parity and withholding coverage.
- `tests/unit/discovery/developer-discovery-telemetry.test.ts` - Fetch telemetry and canonical funnel coverage.
- `tests/unit/discovery/developer-discovery-kill-rules.test.ts` - Support record, kill controls, and publication controls coverage.
- `tests/integration/developer-discovery.test.ts` - Route handler and loader integration coverage.
- `tests/seo/developer-discovery.test.ts` - SEO/AEO safety coverage for artifacts and headers.
- `tests/e2e/developer-discovery.spec.ts` - Focused Playwright discovery route/API smoke.
- `tests/e2e/a11y/developer-discovery-a11y.spec.ts` - Focused Playwright keyboard/layout smoke.
- `tests/fixtures/bad-copy/protocol-claims.fixture` - Negative protocol/platform claim fixture.

## Decisions Made

- Kept Phase 3’s Phase 2 dependency as an explicit public status contract only: `state`, `publicReason`, `source`, and `lastVerifiedAt`.
- Kept API-key support unavailable in discovery publication controls even when an operator control key exists elsewhere; Phase 3 adds no API-key authority.
- Withheld optional OpenAPI/MCP rows by default and allowed them only through `evaluateDiscoveryProjectionGate`.
- Consolidated Phase 3 discovery code into the existing discovery public seam because this worktree already had Phase 3 WIP there; no new internal modules were required to satisfy the plan.
- Manually patched `src/routeTree.gen.ts` because no local route generator script was available; the patch was limited to route registrations needed for compile/runtime discovery endpoints.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] API-key public readback was positive**
- **Found during:** P3-05/P3-06 verification
- **Issue:** The route copy initially rendered `Discovery API key gate: enabled`, which violated the Phase 3 no-API-key-authority constraint.
- **Fix:** `readDeveloperDiscoveryPublicationControls` now keeps `discoveryApiKeysEnabled: false`; tests assert API-key authority remains unavailable.
- **Files modified:** `src/modules/discovery/public.ts`, `tests/unit/discovery/developer-discovery-kill-rules.test.ts`
- **Verification:** `npm run test:unit -- tests/unit/discovery` passed.
- **Committed in:** `pending sprint commit`

**2. [Rule 3 - Blocking] Generated artifact withholding needed exact union typing**
- **Found during:** Typecheck
- **Issue:** `withholdDeveloperDiscoveryArtifact` returned a broad union and exact optional-property calls passed explicit `undefined`.
- **Fix:** Added typed overloads and omitted optional properties instead of passing `undefined`.
- **Files modified:** `src/modules/discovery/public.ts`, `tests/unit/discovery/developer-discovery-telemetry.test.ts`
- **Verification:** `npm run typecheck` passed.
- **Committed in:** `pending sprint commit`

**3. [Rule 3 - Blocking] Copy scanner misclassified source-owned support-readback copy**
- **Found during:** `npm run test:copy`
- **Issue:** Phase 3 support escalation/parity strings were flagged as public overclaims.
- **Fix:** Extended the existing source-owned Phase 3 readback allowlist narrowly for support escalation, parity, route health, and private-data-exposure guardrail language.
- **Files modified:** `src/lib/ui/contract-scans.ts`
- **Verification:** `npm run test:copy` and `npm run test:copy:fixtures` passed.
- **Committed in:** `pending sprint commit`

### Process Deviations

- **Sprint commit policy:** Per user instruction, no per-task commits or final docs commit were made.
- **STATE/ROADMAP updates deferred:** GSD state advancement was not run because Phase 2 is explicitly not fully closed and this worktree already has broad dirty planning files. Advancing the planner state would overstate phase progression.
- **Code organization:** The plan listed optional internal discovery files; implementation stayed in `src/modules/discovery/public.ts` to complete the existing Phase 3 WIP without introducing unnecessary seams.
- **Route manifest:** `src/routeTree.gen.ts` was manually patched for the new API routes because no local TanStack route generation command was present.

**Total deviations:** 3 auto-fixed, 4 process deviations.

## Issues Encountered

- `npm run check:convex-codegen` initially failed in the sandbox with `getaddrinfo ENOTFOUND o1192621.ingest.sentry.io`. The orchestrator reran it with approved network access and it passed.
- Initial Playwright E2E run failed because sandboxed Vite could not bind `127.0.0.1` (`listen EPERM`). Focused E2E and a11y reruns passed with approved local-server permissions.
- The worktree had substantial pre-existing Phase 2/3 dirty files and untracked artifacts before closeout. The executor did not revert, stage, commit, clean, or overwrite unrelated changes.

## Verification Commands

- `npm run test:unit -- tests/unit/discovery/developer-discovery-route.test.ts` - initially failed on API-key overclaim, then passed: 34 files, 159 tests.
- `npm run test:unit -- tests/unit/discovery` - initially failed on an over-broad test regex, then passed: 38 files, 173 tests.
- `npm run test:integration -- tests/integration/developer-discovery.test.ts` - passed: 9 files, 28 tests.
- `npm run test:seo -- tests/seo/developer-discovery.test.ts` - passed: 3 files, 10 tests.
- `npm run test:copy` - initially failed on support-readback scanner context, then passed: 3 files, 29 tests.
- `npm run test:copy:fixtures` - passed: 3 files, 29 tests.
- `npm run typecheck` - initially failed on exact optional/union typing, then passed.
- `npm run test:types` - passed: 1 file, 4 tests.
- `npm run test:imports` - passed: 3 files, 3 tests.
- `npm run test:source-mining` - passed: 1 file, 2 tests.
- `npm run test:ts-standards` - passed: 1 file, 1 test.
- `npm run test:ui-contract` - passed: 2 files, 2 tests.
- `npm run build` - passed.
- `npm run check:convex-codegen` - passed with approved network access.
- `npx playwright test tests/e2e/developer-discovery.spec.ts --project=compact-chromium` - sandbox run failed on local bind `EPERM`; approved local-server rerun passed: 2 tests.
- `npx playwright test tests/e2e/a11y/developer-discovery-a11y.spec.ts --project=compact-chromium` - approved local-server run passed: 1 test.
- `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e` - passed: 30 tests.
- `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:a11y` - passed: 8 tests.

## Known Stubs

None. Stub scan for `TODO`, `FIXME`, `placeholder`, `coming soon`, and display-facing `not available` found no matches in the Phase 3 runtime/test files. `not_available_yet` remains a domain enum from the public catalog contract, not a UI stub.

## Threat Flags

None beyond planned Phase 3 public read-only GET endpoints. The new endpoints expose public catalog-derived schema/examples/fixtures only, use no mutation/provider/payment/action authority, and are covered by privacy/private-field and future-authority negative scans.

## Self-Check: PASSED

- File existence check found all Phase 3 deliverable files listed in this summary.
- Commit existence check intentionally skipped: executor made no commits per user sprint policy.
- Private P2 field names appear only in negative test assertions and regex guards, not in runtime output fields.
- Generated output directories `.output`, `test-results`, and pre-existing `output/playwright/phase2-ui` were left untouched; no `git clean` or destructive cleanup was run.

## User Setup Required

None for local source verification. Deployed Phase 3 proof, if required later, should be run after the sprint commit/deploy checkpoint.

## Next Phase Readiness

Phase 3 local implementation is complete against the current worktree. Remaining sprint-level work is to review the broad existing dirty tree and decide final sprint commit boundaries. Phase 2 remains not fully closed; Phase 3 intentionally exposes only the public inquiry availability status contract until Phase 2 closeout is complete.

---
*Phase: 03-standard-agent-builder-discovery*
*Completed: 2026-06-29*

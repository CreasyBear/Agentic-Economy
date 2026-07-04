---
phase: 03-standard-agent-builder-discovery
plan: 02
subsystem: discovery-api
tags: [developer-discovery, route-parity, public-catalog, route-health, playwright]
requires:
  - phase: 03-standard-agent-builder-discovery
    provides: 03-01 read-only developer discovery page and JSON artifact endpoints.
provides:
  - Route-derived Phase 3 schema/examples/fixtures over `/api/businesses`, search, and detail response bodies.
  - Executed public route-health readback for catalog list/search/detail, AE-hosted UCP, llms, sitemap, and robots.
  - Builder/agent smoke proving route-derived facts or explicit degraded/unavailable route evidence without deployed-proof claims.
affects: [phase-03, developer-discovery, public-api-parity, route-health]
tech-stack:
  added: []
  patterns:
    - Public route snapshot contract owned by `src/modules/discovery/public.ts`.
    - Route-layer snapshot builder executes existing public handlers and maps failures to public health rows.
    - Runtime artifacts fail closed to degraded/unavailable readback instead of fixture truth.
key-files:
  created:
    - .planning/phases/03-standard-agent-builder-discovery/03-02-SUMMARY.md
  modified:
    - src/modules/discovery/public.ts
    - src/routes/developers.discovery.tsx
    - src/routes/api.discovery.schema.ts
    - src/routes/api.discovery.examples.ts
    - src/routes/api.discovery.fixtures.ts
    - tests/unit/discovery/developer-discovery-route.test.ts
    - tests/unit/discovery/developer-discovery-parity.test.ts
    - tests/integration/developer-discovery.test.ts
    - tests/integration/discovery-route-parity.test.ts
    - tests/e2e/developer-discovery.spec.ts
    - tests/seo/developer-discovery.test.ts
key-decisions:
  - "Kept route imports out of the discovery module; route execution lives in the route layer."
  - "Preserved source-state artifact generation only for explicit fixture/unit callers."
  - "Degraded public facts can still appear in examples when route/schema parity passes; only route/schema failure withholds artifacts."
  - "No commits, staging, STATE.md update, or ROADMAP.md update were performed per sprint policy."
patterns-established:
  - "DeveloperDiscoveryRouteSnapshot separates route execution evidence from source-state fixtures."
  - "Route health rows include httpStatus, checkedAt, cacheControl, schemaVersion, and public errorCode."
requirements-completed: [P3-R2, P3-R3, P3-R8]
coverage:
  - id: D1
    description: "Phase 3 schema/examples/fixtures derive public facts from executed durable list/search/detail route bodies."
    requirement: P3-R2
    verification:
      - kind: unit
        ref: "npm run test:unit -- tests/unit/discovery/developer-discovery-route.test.ts tests/unit/discovery/developer-discovery-parity.test.ts tests/unit/discovery/developer-discovery-telemetry.test.ts"
        status: pass
      - kind: integration
        ref: "npm run test:integration -- tests/integration/developer-discovery.test.ts tests/integration/discovery-route-parity.test.ts tests/integration/registry-api.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Route health is generated from route execution/readback with public 404, outage, stale, unavailable, and schema-mismatch states."
    requirement: P3-R3
    verification:
      - kind: unit
        ref: "tests/unit/discovery/developer-discovery-route.test.ts#maps executed route failures"
        status: pass
      - kind: integration
        ref: "tests/integration/discovery-route-parity.test.ts#fixture routeHealth"
        status: pass
    human_judgment: false
  - id: D3
    description: "Builder/agent smoke proves route-derived facts or explicit degraded/unavailable route evidence without deployed-proof claims."
    requirement: P3-R8
    verification:
      - kind: e2e
        ref: "npx playwright test tests/e2e/developer-discovery.spec.ts --project=compact-chromium"
        status: pass
    human_judgment: false
  - id: D4
    description: "P2 public-status-only and future-authority boundaries remain enforced."
    requirement: P3-R8
    verification:
      - kind: unit
        ref: "tests/unit/discovery private/future authority negative assertions"
        status: pass
      - kind: seo
        ref: "npm run test:seo -- tests/seo/developer-discovery.test.ts tests/seo/discovery-files.test.ts"
        status: pass
      - kind: other
        ref: "npm run test:copy"
        status: pass
    human_judgment: false
duration: 18m19s
completed: 2026-06-29
status: complete
---

# Phase 3 Plan 02: Standard Agent/Builder Discovery Route-Parity Gaps Summary

**Route-executed developer discovery artifacts with public API parity, real route-health readback, and focused builder smoke coverage.**

## Performance

- **Duration:** 18m19s
- **Started:** 2026-06-29T04:36:53Z
- **Completed:** 2026-06-29T04:55:12Z
- **Tasks:** 3/3
- **Files modified:** 12 plus this summary

## Accomplishments

- Added `DeveloperDiscoveryRouteSnapshot` and route execution health mapping in `src/modules/discovery/public.ts`.
- Updated `/developers/discovery` and `/api/discovery/{schema,examples,fixtures}` to use route-derived snapshots by default.
- Generated examples now use `PublicBusinessCatalogApiDto` route body shape and `public-business-catalog-api:v1`.
- Added route-health evidence fields: `httpStatus`, `checkedAt`, `cacheControl`, `schemaVersion`, and public `errorCode`.
- Narrowed artifact withholding so list/search/detail parity failures remain critical, while UCP/llms/sitemap/robots readback failures degrade the readback without erasing valid route-derived examples.
- Expanded unit, integration, SEO, and Playwright smoke coverage for durable route parity, route failures, degraded facts, and private/future authority exclusions.

## Task Commits

User explicitly requested sprint commits, not executor task commits. No staging, commits, pushes, or git index/ref writes were performed.

1. **Task 1: Wire Phase 3 artifacts to durable public route snapshots** - `pending sprint commit`
2. **Task 2: Replace synthetic route health with actual route execution/readback** - `pending sprint commit`
3. **Task 3: Expand builder/agent smoke and closeout gates without deployed-proof claims** - `pending sprint commit`

**Plan metadata:** `pending sprint commit`

## Files Created/Modified

- `src/modules/discovery/public.ts` - Route snapshot contracts, API DTO examples, executed route-health mapper, and route-derived freshness behavior.
- `src/routes/developers.discovery.tsx` - Async loader uses route snapshot readback and renders health status details.
- `src/routes/api.discovery.schema.ts` - Shared route snapshot builder and async schema handler.
- `src/routes/api.discovery.examples.ts` - Async examples handler uses shared route snapshot path.
- `src/routes/api.discovery.fixtures.ts` - Async fixture handler includes executed route-health evidence.
- `tests/unit/discovery/developer-discovery-route.test.ts` - Route snapshot and route failure health coverage.
- `tests/unit/discovery/developer-discovery-parity.test.ts` - Public API DTO example parity coverage.
- `tests/integration/developer-discovery.test.ts` - Non-default durable route-client artifact parity coverage.
- `tests/integration/discovery-route-parity.test.ts` - Fixture bundle parity in durable public route context.
- `tests/e2e/developer-discovery.spec.ts` - Builder/agent API/page smoke over public routes and artifacts.
- `tests/seo/developer-discovery.test.ts` - Async schema endpoint safety coverage.

## Decisions Made

- The discovery module owns pure snapshot/health contracts only; route execution stays in the route layer to avoid importing route files into the module.
- `/developers/discovery` uses a loader-only dynamic import for snapshot building so the UI remains a readback consumer.
- Degraded public route facts remain visible in examples when route/schema parity passes; artifact state becomes `degraded`, not empty.
- No deployed Phase 3 proof is claimed. Local route-handler and Playwright evidence are recorded only as local proof.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Preserve route-derived degraded facts instead of withholding all examples**
- **Found during:** Task 2 integration verification
- **Issue:** Durable registry routes can validly return public facts with `discoveryStatus: degraded`; treating all degraded facts as withheld erased current route-derived examples.
- **Fix:** Keep examples populated for degraded route-derived facts when route/schema parity passes; reserve withholding for unavailable/parity-failed states.
- **Files modified:** `src/modules/discovery/public.ts`, `tests/integration/discovery-route-parity.test.ts`
- **Verification:** Focused unit and integration gates passed.
- **Committed in:** `pending sprint commit`

**2. [Rule 3 - Blocking] Non-critical route-health failures erased valid examples**
- **Found during:** Orchestrator Playwright verification
- **Issue:** UCP/llms/sitemap/robots readback failures could mark the whole artifact unavailable, causing `/api/discovery/examples` to return an empty examples array even when `/api/businesses` list/search/detail parity succeeded.
- **Fix:** Treat list/search/detail parity as the critical artifact-withholding boundary; non-critical discovery-file readback failures now degrade the route readback while preserving route-derived examples.
- **Files modified:** `src/modules/discovery/public.ts`
- **Verification:** Focused route-parity unit/integration and Playwright smoke passed; full E2E passed when run sequentially.
- **Committed in:** `pending sprint commit`

### Process Deviations

- **Sprint commit policy:** No task commits or final docs commit were made.
- **STATE/ROADMAP updates skipped:** `.planning/STATE.md` and `.planning/ROADMAP.md` were left untouched per user instruction.
- **Narrow route helper placement:** The route snapshot builder was added to `src/routes/api.discovery.schema.ts` and imported by sibling discovery routes. This is a narrow route-layer helper needed to call existing public handlers.

**Total deviations:** 2 auto-fixed, 3 process deviations.

## Issues Encountered

- Sandboxed Playwright failed to start Vite with `listen EPERM 127.0.0.1`, then watcher `EMFILE`. Escalated local-server run was required.
- `npm run test:e2e -- tests/e2e/developer-discovery.spec.ts --project=compact-chromium` runs all `tests/e2e` because the npm script already includes `tests/e2e`; focused Playwright smoke is run with `npx playwright test tests/e2e/developer-discovery.spec.ts --project=compact-chromium` instead.
- Running full E2E and full a11y concurrently caused competing Playwright web servers on the same local port and produced transient `socket hang up`/`ERR_CONNECTION_REFUSED` failures. Sequential reruns passed.
- `npm run check:convex-codegen` initially failed in the executor sandbox on DNS for `o1192621.ingest.sentry.io`; the orchestrator reran it with approved network access and it passed.

## Verification Commands

- `npm run test:unit -- tests/unit/discovery/developer-discovery-route.test.ts tests/unit/discovery/developer-discovery-parity.test.ts tests/unit/discovery/developer-discovery-telemetry.test.ts` - PASS: 38 files, 176 tests.
- `npm run test:integration -- tests/integration/developer-discovery.test.ts tests/integration/discovery-route-parity.test.ts tests/integration/registry-api.test.ts` - PASS: 9 files, 29 tests.
- `npm run typecheck` - PASS.
- `npm run test:seo -- tests/seo/developer-discovery.test.ts tests/seo/discovery-files.test.ts` - PASS: 3 files, 10 tests.
- `npm run test:copy` - PASS: 3 files, 29 tests.
- `npm run test:source-mining` - PASS: 1 file, 2 tests.
- `npm run test:ts-standards` - PASS: 1 file, 1 test.
- `npm run test:ui-contract` - PASS: 2 files, 2 tests.
- `npm run build` - PASS.
- `npx playwright test tests/e2e/developer-discovery.spec.ts --project=compact-chromium` - PASS: 2 tests.
- `npx playwright test tests/e2e/developer-discovery.spec.ts` - PASS: 4 tests.
- `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e` - PASS: 30 tests when run sequentially.
- `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:a11y` - PASS: 8 tests when run sequentially.
- `npm run check:convex-codegen` - PASS with approved network access.

## Known Stubs

None. Stub scan for `TODO`, `FIXME`, `placeholder`, and `coming soon` in the modified Phase 3 source/test files returned no matches.

## Threat Flags

None beyond the planned public read-only discovery route snapshot surface. The route snapshot executes public GET handlers only, returns safe public error codes, and tests assert absence of private P2 fields and future authority flags.

## Self-Check: PASSED

- Summary file created at `.planning/phases/03-standard-agent-builder-discovery/03-02-SUMMARY.md`.
- Required source/test files exist in the worktree.
- No commits were expected or made; all task commit metadata is `pending sprint commit`.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were not updated by this executor.
- Private/future-surface names appear only in negative tests/type definitions or gated exclusion copy, not as positive runtime authority.

## User Setup Required

None for local source verification.

## Next Phase Readiness

The three Phase 3 verifier gaps targeted by 03-02 are closed locally: durable route parity is wired, route health is readback-based, and focused builder smoke proves route-derived facts or explicit degraded/unavailable route evidence. Deployed Phase 3 proof remains intentionally unclaimed.

---
*Phase: 03-standard-agent-builder-discovery*
*Completed: 2026-06-29*

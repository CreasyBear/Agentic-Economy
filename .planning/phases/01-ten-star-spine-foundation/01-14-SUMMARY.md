---
phase: 01-ten-star-spine-foundation
plan: 14
subsystem: durable-discovery-runtime
tags: [convex, tanstack-start, discovery, ucp, llms, sitemap, suppression]

requires:
  - phase: 01-13
    provides: "Durable registry/search/API query seam and suppression parity"
provides:
  - "Durable Convex discovery read queries for UCP, llms.txt, and sitemap.xml"
  - "Runtime discovery route handlers backed by Convex query references instead of route-local default state"
  - "Cross-surface durable catalog and suppression parity coverage after registry/API wiring"
  - "Fixture-only compatibility exports for existing synchronous guardrail tests"
affects: [phase-01-verification, discovery, registry-api, deploy-smoke]

tech-stack:
  added: []
  patterns:
    - "Public discovery routes call durable Convex query references through injectable query clients"
    - "Legacy synchronous route helper exports are fixture-only; TanStack route server handlers use durable async paths"
    - "Suppression-aware discovery outputs share the public catalog eligibility predicate"

key-files:
  created:
    - .planning/phases/01-ten-star-spine-foundation/01-14-SUMMARY.md
  modified:
    - convex/discovery.ts
    - src/modules/discovery/internal/source-state.ts
    - src/modules/discovery/public.ts
    - src/routes/$slug.ucp.ts
    - src/routes/llms[.]txt.ts
    - src/routes/sitemap[.]xml.ts
    - tests/integration/discovery-routes.test.ts
    - tests/integration/discovery-route-parity.test.ts
    - tests/seo/discovery-files.test.ts

key-decisions:
  - "Discovery route server handlers now use durable Convex query references; synchronous helper exports remain fixture-only for existing guardrail tests."
  - "Tasks 2 and 3 landed in one green implementation commit because the source query seam and route rewiring are not independently green against the RED tests."
  - "Pre-existing developer-discovery edits in src/modules/discovery/public.ts were preserved unstaged through index-only staging."
  - "Convex codegen remains an auth gate, not a code failure, until the local Convex CLI has an access token."

patterns-established:
  - "Discovery route tests inject durable query clients instead of rebuilding route-local source state."
  - "Runtime negative grep guards default source factories out of discovery route files and internal runtime source-state code."
  - "Fixture compatibility wrappers live behind explicit fixture names and are not wired to TanStack route server handlers."

requirements-completed: [R6, R7, R8, R10]

coverage:
  - id: D1
    description: "A non-default durable catalog is exposed consistently through UCP, llms.txt, sitemap.xml, public page DTO, registry, search, and API detail."
    requirement: R7
    verification:
      - kind: integration
        ref: "npm run test:integration -- tests/integration/discovery-routes.test.ts tests/integration/discovery-route-parity.test.ts"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: false
  - id: D2
    description: "Suppression removes the same durable catalog from page, registry/API dependencies, UCP, llms.txt, and sitemap.xml."
    requirement: R8
    verification:
      - kind: integration
        ref: "tests/integration/discovery-route-parity.test.ts#tracks one durable catalog and suppression"
        status: pass
      - kind: other
        ref: "rg -n createDefaultDiscoverySourceState src/routes/$slug.ucp.ts src/routes/llms[.]txt.ts src/routes/sitemap[.]xml.ts src/modules/discovery/internal/source-state.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Convex discovery readbacks include source hash/version, latest attempt, repair action/result, degraded/stale states, and affected public surfaces."
    requirement: R6
    verification:
      - kind: other
        ref: "npm run typecheck"
        status: pass
      - kind: other
        ref: "npm run check:convex-codegen"
        status: unknown
    human_judgment: true
    rationale: "Convex CLI verification is auth-gated with 401 MissingAccessToken in this environment."
  - id: D4
    description: "Discovery files keep unsupported capability flags negative and exclude private owner/contact/admin/evidence fields."
    requirement: R10
    verification:
      - kind: unit
        ref: "npm run test:seo"
        status: pass
      - kind: unit
        ref: "npm run test:copy"
        status: pass
    human_judgment: false

duration: 19min
completed: 2026-06-28
status: complete
---

# Phase 01 Plan 14: Durable Discovery Runtime Summary

**UCP, llms.txt, and sitemap.xml now read durable published and suppression-aware catalog state through Convex-backed discovery queries.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-06-28T10:06:46Z
- **Completed:** 2026-06-28T10:26:03Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added RED coverage tracing one non-Sam durable catalog across public page DTO, registry/search/API dependencies, UCP, llms.txt, and sitemap.xml.
- Added suppression parity coverage proving the same durable catalog is omitted from page, registry/API, UCP, llms.txt, and sitemap.xml.
- Added Convex public discovery read queries for manifest, llms, and sitemap generation from durable eligible catalog rows.
- Rewired TanStack discovery route server handlers to durable query clients and removed route-local default discovery state construction.

## Task Commits

1. **Task 1: Add durable discovery and suppression parity tests** - `c5c1f6f` (`test`)
2. **Tasks 2-3: Durable discovery queries and route rewiring** - `295cd1c` (`feat`)

Tasks 2 and 3 landed together because the RED tests exercise the source query seam and route rewiring as one runtime path; splitting would have produced an intermediate commit that still failed the planned route verification.

## Files Created/Modified

- `convex/discovery.ts` - Public read queries for catalog UCP manifests, llms.txt, sitemap.xml, and suppression-aware durable catalog selection.
- `src/modules/discovery/internal/source-state.ts` - Renamed the internal default-state implementation to fixture-scoped wording.
- `src/modules/discovery/public.ts` - Query-client test seam and fixture-only compatibility helpers; unrelated pre-existing developer-discovery work remains unstaged.
- `src/routes/$slug.ucp.ts` - Runtime handler uses durable discovery query references; sync helper remains fixture-only.
- `src/routes/llms[.]txt.ts` - Runtime handler uses durable llms query references; sync helper remains fixture-only.
- `src/routes/sitemap[.]xml.ts` - Runtime handler uses durable sitemap query references; sync helper remains fixture-only.
- `tests/integration/discovery-routes.test.ts` - Durable non-default UCP route coverage.
- `tests/integration/discovery-route-parity.test.ts` - Cross-surface durable and suppression parity coverage.
- `tests/seo/discovery-files.test.ts` - Durable llms/sitemap public-field and capability-flag coverage.

## Decisions Made

- Kept `ConvexHttpClient` imports in route files rather than `src/modules/discovery/public.ts`, because Convex runtime code imports the discovery public module for domain types.
- Preserved existing synchronous route helper exports for guardrail tests, but moved runtime `Route.server.handlers` to explicit `handleDurable*` functions.
- Used index-only staging for `src/modules/discovery/public.ts` to commit only 01-14 changes and preserve pre-existing developer-discovery worktree edits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Preserved synchronous guardrail helper compatibility**
- **Found during:** Task 3 typecheck
- **Issue:** Existing copy/claims guardrail tests call `handleUcpManifestRequest()` and `handleLlmsTxtRequest()` synchronously. Making those names async broke typecheck outside 01-14-owned tests.
- **Fix:** Added durable async `handleDurable*` exports for route server handlers and kept the old helper names as fixture-only synchronous wrappers.
- **Files modified:** `src/routes/$slug.ucp.ts`, `src/routes/llms[.]txt.ts`, `src/routes/sitemap[.]xml.ts`, `src/modules/discovery/public.ts`
- **Verification:** `npm run typecheck`; `npm run test:copy`; focused discovery integration tests.
- **Committed in:** `295cd1c`

**2. [Rule 3 - Blocking] Renamed internal default discovery source factory**
- **Found during:** Task 3 negative grep verification
- **Issue:** The required grep still matched the internal runtime source-state factory definition.
- **Fix:** Renamed the internal implementation to `createFixtureDiscoverySourceState` while preserving the public fixture API.
- **Files modified:** `src/modules/discovery/internal/source-state.ts`, `src/modules/discovery/public.ts`
- **Verification:** Negative grep returned no matches.
- **Committed in:** `295cd1c`

**Total deviations:** 2 auto-fixed (Rule 3: 2)
**Impact on plan:** Both were required to satisfy verification without touching unrelated dirty files.

## Issues Encountered

- `npm run check:convex-codegen` remains auth-gated with Convex `401 Unauthorized: MissingAccessToken`.
- `.planning/ROADMAP.md` and unrelated Phase 2-5 files were already dirty before 01-14. They were not staged with task commits.
- `src/modules/discovery/public.ts` still has pre-existing unstaged developer-discovery work; 01-14 committed only its scoped public-module hunks.

## Verification

| Command | Result | Notes |
|---|---:|---|
| `npm run test:integration -- tests/integration/discovery-routes.test.ts tests/integration/discovery-route-parity.test.ts` before implementation | RED | Failed on missing `setPublicDiscoveryQueryClientForTests`. |
| `npm run test:seo -- tests/seo/discovery-files.test.ts` before implementation | RED | Failed on missing `setPublicDiscoveryQueryClientForTests`. |
| `npm run typecheck` | PASS | Completed after fixture-compatible route exports were restored. |
| `npm run check:convex-codegen` | AUTH GATE | Convex CLI returned `401 Unauthorized: MissingAccessToken`. |
| `npm run test:integration -- tests/integration/discovery-routes.test.ts tests/integration/discovery-route-parity.test.ts` | PASS | 8 files, 25 tests passed. |
| `npm run test:seo` | PASS | 2 files, 8 tests passed. |
| `npm run test:copy` | PASS | 3 files, 28 tests passed. |
| `npm run build` | PASS | Client and SSR builds completed. |
| `rg -n "createDefaultDiscoverySourceState" ...runtime discovery files...` | PASS | No matches in runtime route files or internal source-state code. |

## Auth Gates

- Convex codegen is still blocked by missing Convex authentication. The CLI reported `401 Unauthorized: MissingAccessToken` and suggested authenticating with `npx convex dev`.

## Known Stubs

None. Stub scan hits are intentional unavailable-capability copy and null/empty collection guards, not unimplemented route behavior.

## Threat Flags

None beyond the plan threat model. This plan intentionally touched durable catalog rows to public text/XML/UCP outputs and kept outputs allowlisted, suppression-aware, and negative on callable/payment flags.

## Dirty Boundary

- Preserved unrelated dirty/untracked Phase 2-5 planning, billing, observability, inquiry, protected-action, route tree, and server work.
- Preserved pre-existing `src/modules/discovery/public.ts` developer-discovery hunks unstaged by using index-only staging for the 01-14 public-module changes.
- `.planning/ROADMAP.md` was already dirty before closeout; ROADMAP mutation should be reconciled separately to avoid mixing unrelated planning edits.

## User Setup Required

- Convex CLI authentication is required before `npm run check:convex-codegen` can pass.

## Next Phase Readiness

Plan 01-15 deploy smoke can target real durable discovery slugs for `/llms.txt`, `/sitemap.xml`, and `/{slug}/ucp`. The remaining known blocker is Convex CLI authentication for codegen/readback proof.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/01-ten-star-spine-foundation/01-14-SUMMARY.md`.
- Task commits exist: `c5c1f6f`, `295cd1c`.
- Post-commit deletion checks found no tracked deletions in task commits.
- 01-14 task files are committed; only the pre-existing `src/modules/discovery/public.ts` developer-discovery overlay remains unstaged.

---
*Phase: 01-ten-star-spine-foundation*
*Completed: 2026-06-28*

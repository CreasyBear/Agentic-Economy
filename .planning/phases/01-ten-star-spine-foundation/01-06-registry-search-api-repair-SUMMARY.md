---
phase: 01-ten-star-spine-foundation
plan: 06
subsystem: registry-search-api
tags: [tanstack-start, tanstack-router, convex, registry, search, public-api, admin-readback, seo]
requires:
  - phase: 01-05-public-owner-ui-routes
    provides: public owner routes, AE shell components, public catalog page/readback patterns
provides:
  - durable registry projection attempts with source version/hash, redacted failure, retry, repair action, and repair result
  - public list/search/detail business catalog API routes with strict public DTO filtering
  - registry UI route with truthful list/search/empty/no-results/pagination states
  - admin index-health readback rows for source state, projection attempt, affected public surfaces, and repair result
affects: [registry, public-api, seo, admin-readbacks, public-owner-ui, phase-02]
tech-stack:
  added: []
  patterns:
    - source-owned catalog DTO projection into registry attempts/items/index status
    - TanStack Start server route handlers returning explicit public JSON DTOs
    - guarded admin readback rows stripped on denied membership
key-files:
  created:
    - src/modules/registry/internal/projection-attempts.ts
    - src/modules/registry/internal/search.ts
    - src/routes/api.businesses.ts
    - src/routes/api.businesses.search.ts
    - src/routes/api.businesses.$slug.ts
    - src/routes/registry.tsx
    - tests/integration/registry-api.test.ts
    - tests/unit/registry/projection-attempts.test.ts
  modified:
    - src/modules/registry/public.ts
    - src/modules/catalog/public.ts
    - src/modules/catalog/internal/public-catalog-dto.ts
    - src/modules/catalog/internal/publish.ts
    - src/routes/admin.index-health.tsx
    - src/components/ae/readback/AeAdminReadbackPanel.tsx
    - convex/security.ts
    - src/routeTree.gen.ts
key-decisions:
  - "Registry search uses deterministic in-process catalog DTO projection, not an external search engine."
  - "Public API DTO omits private ids, source hashes, raw owner/contact/admin data, MCP/OpenAPI, callable, and payment fields."
  - "Admin index-health rows are generated from registry health but remain stripped from denied admin route reads."
patterns-established:
  - "Public route handlers delegate to module-owned seams and apply response-level no-store caching."
  - "Projection repair is modeled as durable state with redacted attempts and idempotent retry."
requirements-completed: [R5, R6, R8, R10]
coverage:
  - id: D1
    description: "Registry projection attempts persist source hash/version, redacted forced failures, retry, readback, and repair result."
    requirement: R5
    verification:
      - kind: unit
        ref: "tests/unit/registry/projection-attempts.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Public businesses API list/search/detail routes expose only the public typed catalog subset."
    requirement: R6
    verification:
      - kind: integration
        ref: "tests/integration/registry-api.test.ts"
        status: pass
      - kind: other
        ref: "npm run test:seo"
        status: pass
    human_judgment: false
  - id: D3
    description: "/registry renders truthful list, search, no-results, empty, pagination, loading, and error states."
    requirement: R6
    verification:
      - kind: e2e
        ref: "tests/e2e/public-owner-ui.spec.ts#registry search lists Sam and renders truthful no-results and pagination states"
        status: pass
    human_judgment: false
  - id: D4
    description: "/admin/index-health readback can answer source state, projection attempt, affected surfaces, repair action, and repair result for authorized reads."
    requirement: R8
    verification:
      - kind: unit
        ref: "tests/unit/security/admin-readbacks.test.ts"
        status: pass
    human_judgment: false
duration: 37min
completed: 2026-06-28
status: complete
---

# Phase 01 Plan 06: Registry, Search, API, Repair Summary

**Source-owned registry projection with repairable attempts, strict public catalog APIs, truthful registry search UI, and admin index-health readback.**

## Performance

- **Duration:** 37 min
- **Started:** 2026-06-28T01:33:41Z
- **Completed:** 2026-06-28T02:10:32Z
- **Tasks:** 6
- **Files modified:** 29

## Accomplishments

- Implemented registry projection sync/retry/readback from source-owned catalog DTOs, including redacted forced-failure attempts and idempotent retry behavior.
- Added `/api/businesses`, `/api/businesses/search`, and `/api/businesses/{slug}` handlers with explicit public DTO filtering, deterministic search, stable cursor pagination, empty search, 404, and suppressed/unpublished exclusion.
- Added `/registry` with truthful search/list states and compact/wide browser coverage for Sam's published catalog.
- Completed `/admin/index-health` with source, attempt, affected surface, repair action, and repair result rows that are hidden from denied reads.

## Task Commits

1. **Task A: Registry projection sync** - `58693a8` (feat)
2. **Task B: Projection repair retry coverage** - `5a1d064` (test)
3. **Task C: Public catalog API routes** - `aa41a80` (feat)
4. **Task D: Registry search UI** - `ce0b999` (feat)
5. **Task E: Admin index-health readback** - `4f351c3` (feat)
6. **Task F: API pagination/public subset repair and coverage** - `4a1aebe` (fix)

## Files Created/Modified

- `src/modules/registry/internal/projection-attempts.ts` - projection sync, forced failure persistence, retry, health readback, index status.
- `src/modules/registry/internal/search.ts` - public list/search/detail DTOs, deterministic search tokens, stable cursor pagination.
- `src/routes/api.businesses.ts`, `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts` - TanStack Start public JSON routes.
- `src/routes/registry.tsx` - public registry search/list UI.
- `src/routes/admin.index-health.tsx` - guarded admin health rows from registry source/projection readback.
- `src/components/ae/readback/AeAdminReadbackPanel.tsx` - repair result and affected public surface display for allowed admin readbacks.
- `tests/unit/registry/projection-attempts.test.ts`, `tests/integration/registry-api.test.ts`, `tests/seo/public-business-seo.test.ts`, `tests/e2e/public-owner-ui.spec.ts` - focused registry/API/SEO/UI coverage.

## Decisions Made

- Kept Phase 1 search local and deterministic over public catalog DTO fields; no external search service, ranking engine, or marketplace ordering.
- Used explicit public API DTOs rather than returning catalog/internal records directly.
- Removed `callable` and `paymentRequired` from public API DTOs to satisfy the public-surface field restriction.
- Kept admin health route loader denied until real admin membership wiring exists; tests cover allowed readback through the shared security seam.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hardened copy claim scanner while adding registry UI**
- **Found during:** Task D
- **Issue:** UI contract verification needed future platform/payment claim guardrails to distinguish prohibited claims from negative planning copy.
- **Fix:** Expanded future-platform/payment claim patterns and tightened negative-context matching.
- **Files modified:** `src/lib/ui/contract-scans.ts`, `tests/copy/claims-register.test.ts`
- **Verification:** `npm run test:copy`, `npm run test:ui-contract`
- **Committed in:** `ce0b999`

**2. [Rule 1 - Bug] Fixed cursor pagination skip**
- **Found during:** Task F
- **Issue:** `nextCursor` pointed at the next item but cursor handling started after that item, skipping one record on multi-page results.
- **Fix:** Treated cursor as the next page start slug and added deterministic pagination coverage.
- **Files modified:** `src/modules/registry/internal/search.ts`, `tests/integration/registry-api.test.ts`
- **Verification:** `npm run test:integration`
- **Committed in:** `4a1aebe`

**3. [Rule 2 - Missing Critical] Removed callable/payment fields from public API DTO**
- **Found during:** Task F
- **Issue:** Public API DTO still exposed negative capability flags (`callable`, `paymentRequired`) despite plan stop conditions forbidding callable/payment fields.
- **Fix:** Omitted those fields from API DTO capabilities and added integration/SEO assertions.
- **Files modified:** `src/modules/registry/internal/search.ts`, `tests/integration/registry-api.test.ts`, `tests/seo/public-business-seo.test.ts`
- **Verification:** `npm run test:integration`, `npm run test:seo`
- **Committed in:** `4a1aebe`

**Total deviations:** 3 auto-fixed (Rule 1: 1, Rule 2: 1, Rule 3: 1)
**Impact on plan:** All fixes were required for correctness or guardrail compliance; no external systems or feature scope were added.

## Verification

- `npm run typecheck` - passed
- `npm run test:unit` - passed, 20 files / 55 tests
- `npm run test:integration` - passed, 2 files / 7 tests
- `npm run test:copy` - passed, 2 files / 19 tests
- `npm run test:ui-contract` - passed, 2 files / 2 tests
- `npm run test:seo` - passed, 1 file / 2 tests
- `npm run test:imports` - passed, 3 files / 3 tests
- `npm run build` - passed
- `npm run check:convex-codegen` - not run; blocked by missing `CLERK_JWT_ISSUER_DOMAIN` and no explicit approval for networked Convex CLI telemetry/external access.
- `npm run test:e2e` - failed: registry search passed in compact/wide and skip-link a11y passed in compact/wide; 12 pre-existing public-owner/claim/privacy assertions failed due duplicate text locators, claim form navigation/default-value behavior, missing claim-success heading, and focus expectations.
- `npm run test:a11y` - failed: skip-link tests passed in compact/wide; claim form keyboard validation failed in compact/wide because `Business name is required.` was not rendered after Enter navigation.

## Known Stubs

None. Stub scan found only truthful "not available yet" current-phase copy and normal empty initializers in tests/helpers.

## Auth Gates

- Convex codegen remains gated on real Clerk issuer configuration and explicit approval for networked Convex CLI access. This was treated as an environment/auth gate, not a product failure.

## Deferred Issues

- Full public-owner Playwright suite still has unrelated failures outside this plan's registry path:
  - strict duplicate text locators for home unavailable copy and `Parramatta, NSW`
  - claim form validation tests observe default Sam values/navigation instead of the filled custom values
  - claim success heading expectation does not match rendered route state
  - privacy removal focus expectation does not receive focus
- `.planning/ROADMAP.md` had pre-existing unrelated user changes before state updates; ROADMAP progress was not staged into the final docs commit to avoid mixing unrelated planning work.

## User Setup Required

None for local registry/API/UI operation. Real Convex codegen still requires `CLERK_JWT_ISSUER_DOMAIN` plus approval for networked Convex CLI access.

## Next Phase Readiness

Phase 02 can consume a strict public registry/search/API seam backed by source-owned catalog state. The remaining environment blocker is Convex/Clerk codegen; the remaining browser-test blockers are existing public-owner claim/privacy assertions rather than the new registry path.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/01-ten-star-spine-foundation/01-06-registry-search-api-repair-SUMMARY.md`.
- Task commits found: `58693a8`, `5a1d064`, `aa41a80`, `ce0b999`, `4f351c3`, `4a1aebe`.
- No unexpected tracked file deletions were introduced by task commits.

---
*Phase: 01-ten-star-spine-foundation*
*Completed: 2026-06-28*

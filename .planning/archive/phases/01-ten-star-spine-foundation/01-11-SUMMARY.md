---
phase: 01-ten-star-spine-foundation
plan: 11
subsystem: durable-owner-claim-readback
tags: [convex, clerk, tanstack-start, catalog, owner-readback, e2e]

requires:
  - phase: 01-10
    provides: "Convex auth/source-state bridge and runtime-standard-compliant mutation foundation"
provides:
  - "Durable route regression coverage for submitted owner catalog readbacks"
  - "Catalog-owned Convex readback queries for public slug and current owner status"
  - "Claim route server functions that keep browser input authority-free and production auth server-side"
  - "Claim success, owner status, and public slug loaders that read submitted durable catalog DTOs"
affects: [phase-01-verification, owner-claim, public-catalog, route-loaders]

tech-stack:
  added: []
  patterns:
    - "Routes submit facts through server functions; server-side auth selects Convex production path"
    - "Command-scoped local e2e bypass uses a durable in-process readback store only when explicitly enabled"
    - "Catalog module remains DTO owner for public readbacks"

key-files:
  created:
    - tests/integration/durable-claim-route.test.ts
    - src/modules/catalog/owner-claim.functions.ts
  modified:
    - convex/catalog.ts
    - src/modules/catalog/internal/owner-public-flow.ts
    - src/modules/catalog/public.ts
    - src/routes/claim.tsx
    - src/routes/claim.success.tsx
    - src/routes/owner.status.tsx
    - src/routes/$slug.tsx
    - tests/e2e/public-owner-ui.spec.ts

key-decisions:
  - "Adopted a claim-specific server helper instead of touching unrelated dirty src/lib/server work."
  - "Kept local e2e bypass command-scoped through VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E; production path requires Clerk and Convex."
  - "Used slug search params for success/status readbacks so submitted catalog identity survives navigation without browser authority."
  - "Skipped ROADMAP.md mutation/commit because it was already dirty with unrelated planning work before 01-11."

patterns-established:
  - "Owner claim forms submit validated catalog facts only; actor identity is resolved server-side."
  - "Route loaders consume public readback DTOs by slug or authenticated owner session."
  - "Fixture readbacks remain test/default scoped; submitted route data uses durable readback seams."

requirements-completed: [R3, R4, R10]

coverage:
  - id: D1
    description: "Durable claim route regression coverage proves submitted non-Sam catalog data is reused after publish."
    requirement: R4
    verification:
      - kind: integration
        ref: "npm run test:integration -- tests/integration/claim-publish.test.ts tests/integration/durable-claim-route.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Catalog-owned public/current-owner readback queries expose allowlisted DTOs from durable source rows."
    requirement: R3
    verification:
      - kind: integration
        ref: "npm run test:integration -- tests/integration/claim-publish.test.ts tests/integration/durable-claim-route.test.ts"
        status: pass
      - kind: other
        ref: "npm run check:convex-codegen"
        status: unknown
    human_judgment: true
    rationale: "Convex CLI verification is auth-gated in this environment: 401 MissingAccessToken."
  - id: D3
    description: "Claim success, owner status, and public slug routes display the submitted catalog through durable readback server functions."
    requirement: R4
    verification:
      - kind: e2e
        ref: "VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true ./node_modules/.bin/playwright test tests/e2e/public-owner-ui.spec.ts --grep \"claim submission readbacks\" --workers=1 --reporter=line"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
    human_judgment: false
  - id: D4
    description: "Local browser testing remains keyless and command-scoped while production keeps Clerk/Convex as the real authority path."
    requirement: R10
    verification:
      - kind: e2e
        ref: "Focused 01-11 Playwright regression, compact and wide Chromium projects"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-06-28
status: complete
---

# Phase 01 Plan 11: Durable Owner Claim Readback Summary

**Submitted owner catalog facts now survive claim success, owner status, and public slug readbacks through catalog-owned durable seams.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-06-28T08:43:08Z
- **Completed:** 2026-06-28T09:04:18Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Added a RED integration/browser regression for the R3/R4 hollow-readback gap: a non-Sam claim must display its submitted slug, name, service, area, and unavailable capability state after publish.
- Added durable catalog readback seams: Convex public-by-slug/current-owner queries plus module exports for submitted route readbacks.
- Wired `/claim`, `/claim/success`, `/owner/status`, and `/{slug}` through claim/readback server functions so browser input carries facts only, not owner authority.
- Preserved command-scoped local e2e bypass for R10 while keeping production on Clerk-authenticated Convex calls.

## Task Commits

1. **Task 1: Add failing durable-claim route coverage** - `0da8817` (`test`)
2. **Task 2: Implement durable claim and publish Convex handlers** - `e5a6397` (`feat`)
3. **Task 3: Wire owner route readbacks to durable catalog queries** - `fa75974` (`feat`)

## Files Created/Modified

- `tests/integration/durable-claim-route.test.ts` - Integration coverage for submitted catalog readbacks and failure cases.
- `tests/e2e/public-owner-ui.spec.ts` - Browser regression that submitted owner data replaces default Sam readbacks after claim.
- `convex/catalog.ts` - Public/current-owner durable catalog readback queries and active suppression filtering.
- `src/modules/catalog/internal/owner-public-flow.ts` - Local durable readback store for command-scoped e2e bypass.
- `src/modules/catalog/public.ts` - Public exports for durable route readback helpers.
- `src/modules/catalog/owner-claim.functions.ts` - Claim/readback server functions with production Clerk/Convex path and local test bypass.
- `src/routes/claim.tsx` - Claim form now submits through the server function and navigates with submitted slug.
- `src/routes/claim.success.tsx` - Success route reads durable status by slug.
- `src/routes/owner.status.tsx` - Owner status route reads durable status by slug or authenticated owner.
- `src/routes/$slug.tsx` - Public route reads public catalog DTO by slug through the server function.

## Decisions Made

- Adopted `src/modules/catalog/owner-claim.functions.ts` as a claim-specific server seam because `src/lib/server/**` was already dirty from unrelated work and should not be mixed into 01-11.
- Retained a local in-process readback store only behind `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`; the default production path resolves Clerk identity and calls Convex.
- Used slug search params for success/status readbacks. The slug identifies the public DTO to read; it does not grant owner/admin authority.
- Did not update or commit `.planning/ROADMAP.md` because it was dirty before 01-11 with unrelated planning changes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added a route-safe claim server seam**
- **Found during:** Task 2 and Task 3
- **Issue:** The plan needed production route submission/readback behavior, but the shared server directory was already dirty with unrelated work.
- **Fix:** Created `src/modules/catalog/owner-claim.functions.ts` with validated claim submission, public slug readback, current-owner readback, Convex HTTP calls, and command-scoped local e2e bypass.
- **Files modified:** `src/modules/catalog/owner-claim.functions.ts`
- **Verification:** Integration tests passed; focused claim readback Playwright regression passed; build passed.
- **Committed in:** `e5a6397`, `fa75974`

**2. [Rule 3 - Blocking] Removed a server-only request URL import from the route helper**
- **Found during:** Task 3 browser verification
- **Issue:** Importing `@tanstack/start-server-core` from the claim helper caused client dev hydration/module fetch failures.
- **Fix:** Replaced request-origin lookup with `SITE_URL`, `VITE_SITE_URL`, or a stable fallback origin for operation keys.
- **Files modified:** `src/modules/catalog/owner-claim.functions.ts`
- **Verification:** Focused claim readback Playwright regression passed in compact and wide Chromium.
- **Committed in:** `fa75974`

---

**Total deviations:** 2 auto-fixed (Rule 2: 1, Rule 3: 1)
**Impact on plan:** Both fixes were needed to complete 01-11 without staging unrelated dirty server work.

## Verification

| Command | Result | Notes |
|---|---:|---|
| `npm run test:integration -- tests/integration/durable-claim-route.test.ts` | PASS | RED failed before implementation on missing durable readback export; later green through full integration script. |
| `npm run test:integration -- tests/integration/claim-publish.test.ts tests/integration/durable-claim-route.test.ts` | PASS | 6 files, 15 tests passed. |
| `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true ./node_modules/.bin/playwright test tests/e2e/public-owner-ui.spec.ts --grep "claim submission readbacks" --workers=1 --reporter=line` | PASS | 2 tests passed across compact and wide Chromium projects. |
| `npm run test:copy` | PASS | 3 files, 28 tests passed. |
| `npm run test:seo` | PASS | 2 files, 7 tests passed. |
| `npm run build` | PASS | Client and SSR builds completed. |
| `npm run typecheck` | BLOCKED | Fails in unrelated dirty `src/modules/inquiries/**` and `src/modules/protected-action/**` files. |
| `npm run check:convex-codegen` | AUTH GATE | Convex CLI returned `401 Unauthorized: MissingAccessToken`; requires Convex authentication. |
| `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true ./node_modules/.bin/playwright test tests/e2e/public-owner-ui.spec.ts --reporter=line` | BLOCKED | Full spec hit an unrelated dirty `src/routes/owner.actions.tsx` TanStack route-generator overlay in parallel; focused 01-11 regression passed serially. |

## Auth Gates

- `npm run check:convex-codegen` could not complete because the local Convex CLI is not authenticated. The command reported `401 Unauthorized: MissingAccessToken` and suggested authenticating with `npx convex dev`.

## Known Stubs

None. Stub scan found only intentional "not available yet" product/status copy, null guards, and fixture-scoped arrays. The local e2e bypass is command-scoped and does not replace the production Clerk/Convex path.

## Deferred Issues

- `npm run typecheck` is blocked by unrelated dirty inquiry/protected-action work, not by 01-11 files.
- Full public-owner Playwright spec is blocked in this dirty worktree by unrelated untracked `src/routes/owner.actions.tsx` route-generation behavior; the 01-11 claim-readback regression passes when run directly.
- `.planning/ROADMAP.md` was already dirty before 01-11, so the ROADMAP progress update was not committed to avoid mixing unrelated planning work.

## Threat Flags

None. New server/Convex surfaces match the 01-11 threat model: browser facts are untrusted, authority is resolved server-side, and public routes receive allowlisted DTOs.

## User Setup Required

- Convex CLI authentication is required before `npm run check:convex-codegen` can be verified in this checkout.

## Next Phase Readiness

R3/R4 route readback gaps are closed for the focused claim-publish path. Future plans should keep owner authority out of browser payloads, reuse catalog-owned public DTOs, and avoid relying on default fixture readbacks for submitted owner flows.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/01-ten-star-spine-foundation/01-11-SUMMARY.md`.
- Task commits exist: `0da8817`, `e5a6397`, `fa75974`.
- Post-commit deletion checks found no tracked deletions in task commits.

---
*Phase: 01-ten-star-spine-foundation*
*Completed: 2026-06-28*

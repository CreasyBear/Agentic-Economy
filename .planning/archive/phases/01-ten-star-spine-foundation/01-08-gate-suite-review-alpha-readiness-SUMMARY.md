---
phase: 01-ten-star-spine-foundation
plan: 08
subsystem: gate-suite-review-alpha-readiness
tags: [verification, playwright, claims-register, source-mining, fable, matt-review, gtm, activation]
requires:
  - phase: 01-ten-star-spine-foundation
    provides: Phase 1 substrate, source-owned catalog, admin/recovery, public routes, registry/API, discovery, and prior summaries
provides:
  - full local gate-suite results with Convex codegen blocker recorded honestly
  - fixed public-owner e2e/a11y route behavior for claim, success, privacy, registry, and page states
  - claims register coverage for route, SEO/AEO, API, discovery, GTM, and optional product-marketing surfaces
  - source-mining ledger-to-seam/test traceability
  - queryable owner activation readback fields including friction and failure evidence
  - Fable 5 closeout mapping
  - Matt Pocock two-axis review context
  - internal-alpha readiness evidence marked not alpha-ready
affects: [phase-01-closeout, phase-02, gtm, review, verification]
tech-stack:
  added: []
  patterns:
    - local-only Clerk e2e bypass is command/env scoped and never written to .env.local
    - review artifacts keep evidence mapping separate from readiness claims
key-files:
  created:
    - .planning/phases/01-ten-star-spine-foundation/01-FABLE-CLOSEOUT.md
    - .planning/phases/01-ten-star-spine-foundation/01-MATT-REVIEW-CONTEXT.md
    - .planning/phases/01-ten-star-spine-foundation/01-INTERNAL-ALPHA-READINESS.md
  modified:
    - src/routes/__root.tsx
    - src/routes/claim.tsx
    - src/routes/privacy.remove-business.tsx
    - src/start.ts
    - src/modules/observability/public.ts
    - src/modules/observability/internal/funnel.ts
    - src/modules/observability/internal/schema.ts
    - tests/e2e/public-owner-ui.spec.ts
    - tests/e2e/a11y/public-owner-a11y.spec.ts
    - tests/copy/claims-register.test.ts
    - tests/imports/source-mining.test.ts
    - tests/unit/observability/funnel.test.ts
key-decisions:
  - "Browser gates use VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E only at command time because real Clerk keys are absent; fake keys were not written to .env.local."
  - "Internal alpha is explicitly not ready until five real friendly-owner activation rows exist."
  - "ROADMAP progress update was skipped to avoid modifying and staging pre-existing unrelated dirty planning work."
patterns-established:
  - "Closeout artifacts must distinguish implemented local evidence from deployment, Clerk/Convex, and friendly-owner evidence still missing."
requirements-completed: [R10]
coverage:
  - id: D1
    description: "Full local command suite ran without skipped/no-op gates; all local commands passed except Convex codegen, which is blocked by environment/network."
    requirement: R10
    verification:
      - kind: other
        ref: "npm run typecheck"
        status: pass
      - kind: other
        ref: "npm run check:convex-codegen"
        status: unknown
      - kind: other
        ref: "npm test"
        status: pass
    human_judgment: true
    rationale: "Convex codegen requires real Clerk issuer configuration and approved external network access."
  - id: D2
    description: "Claims register covers committed route, API, discovery, SEO, GTM, and optional product-marketing draft surfaces."
    requirement: R10
    verification:
      - kind: unit
        ref: "tests/copy/claims-register.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Source-mining ledger rows map to module seams and executable tests."
    requirement: R10
    verification:
      - kind: unit
        ref: "tests/imports/source-mining.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Owner activation readback can report publish, status readback, capability health, share/interest, attribution, friction, and failure."
    requirement: R10
    verification:
      - kind: unit
        ref: "tests/unit/observability/funnel.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Fable 5 accepted findings are mapped to implementation evidence and residual risk."
    requirement: R10
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/01-ten-star-spine-foundation/01-FABLE-CLOSEOUT.md"
        status: pass
    human_judgment: true
    rationale: "Review mapping is evidence judgment, not fully automatable."
  - id: D6
    description: "Matt Pocock review context keeps Standards and Spec axes separate."
    requirement: R10
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/01-ten-star-spine-foundation/01-MATT-REVIEW-CONTEXT.md"
        status: pass
    human_judgment: true
    rationale: "Actual Matt review is a separate judgment gate; this plan prepares the context."
  - id: D7
    description: "Internal-alpha readiness evidence is recorded without overclaiming."
    requirement: R10
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/01-ten-star-spine-foundation/01-INTERNAL-ALPHA-READINESS.md"
        status: pass
    human_judgment: true
    rationale: "Five friendly-owner evidence rows are intentionally absent, so alpha readiness remains human/evidence gated."
duration: 35min
completed: 2026-06-28
status: complete
---

# Phase 01 Plan 08: Gate Suite Review Alpha Readiness Summary

**Local Phase 1 gate suite hardened with claims/source-mining/activation evidence, Fable closeout mapping, Matt review context, and explicit not-alpha-ready GTM evidence.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-06-28T02:54:38Z
- **Completed:** 2026-06-28T03:28:29Z
- **Tasks:** 7
- **Files modified:** 15 task-owned files

## Accomplishments

- Fixed the public-owner browser blockers: claim form hydration/default behavior, nested claim success rendering, privacy form value/focus handling, duplicate locator expectations, and local route rendering without real Clerk credentials.
- Extended copy and source-mining gates so Phase 1 claims are traced to route/API/discovery/SEO/GTM source-owned evidence and mined invariants map to public seams plus tests.
- Added owner activation readback fields for friction/failure and documented Fable, Matt, and internal-alpha evidence without claiming launch or alpha readiness.

## Task Commits

1. **Task A: Run/fix full local command suite** - `acf447b` (fix)
2. **Task B: Complete claims register coverage** - `2421f85` (test)
3. **Task C: Complete source-mining/import gates** - `29753c3` (test)
4. **Task D: Complete activation/funnel readbacks** - `18440a2` (feat)
5. **Task E: Create Fable 5 closeout mapping** - `c5cb373` (docs)
6. **Task F: Prepare Matt Pocock review context** - `672791b` (docs)
7. **Task G: Record internal-alpha readiness evidence** - `94f95d9` (docs)

## Files Created/Modified

- `src/start.ts` - Adds TanStack Start CSRF middleware and command-scoped local Clerk bypass for e2e route rendering.
- `src/routes/__root.tsx` - Skips Clerk provider only when `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`.
- `src/routes/claim.tsx` - Starts claim form blank, renders nested success route, and preserves/focuses validation state after hydration.
- `src/routes/privacy.remove-business.tsx` - Fixes value capture and validation focus for removal request flow.
- `tests/e2e/public-owner-ui.spec.ts` and `tests/e2e/a11y/public-owner-a11y.spec.ts` - Tighten locators and hydration waits.
- `tests/copy/claims-register.test.ts` - Traces route/API/discovery/SEO/GTM claims to source-owned outputs.
- `tests/imports/source-mining.test.ts` - Maps Phase 1 ledger rows to public seams and tests.
- `src/modules/observability/*` and `tests/unit/observability/funnel.test.ts` - Add activation readback and friction/failure evidence.
- `01-FABLE-CLOSEOUT.md`, `01-MATT-REVIEW-CONTEXT.md`, `01-INTERNAL-ALPHA-READINESS.md` - Closeout/review/GTM evidence artifacts.

## Verification

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS | `tsc --noEmit`. |
| `npm run check:convex-codegen` | BLOCKED | Fails with `TypeError: fetch failed` / `getaddrinfo ENOTFOUND o1192621.ingest.sentry.io`; real Clerk issuer is still absent and no network approval was requested. |
| `npm run test:unit` | PASS | 22 files, 63 tests. |
| `npm run test:integration` | PASS | 5 files, 13 tests. |
| `npm run test:e2e` | PASS | 16 Playwright tests, compact and wide Chromium, using command-only local Clerk placeholders and `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`. |
| `npm run test:a11y` | PASS | 4 Playwright a11y tests with same command-only local Clerk context. |
| `npm run test:copy` | PASS | 3 files, 25 tests. |
| `npm run test:imports` | PASS | 3 files, 3 tests. |
| `npm run test:source-mining` | PASS | 1 file, 2 tests. |
| `npm run test:types` | PASS | 1 file, 3 tests. |
| `npm run test:ts-standards` | PASS | 1 file, 1 test. |
| `npm run test:seo` | PASS | 2 files, 7 tests. |
| `npm run test:ui-contract` | PASS | 2 files, 2 tests. |
| `npm run test:imports:fixtures` | PASS | 3 files, 3 tests. |
| `npm run test:source-mining:fixtures` | PASS | 1 file, 2 tests. |
| `npm run test:ts-standards:fixtures` | PASS | 1 file, 1 test. |
| `npm run test:copy:fixtures` | PASS | 3 files, 25 tests. |
| `npm run test:ui-contract:fixtures` | PASS | 2 files, 2 tests. |
| `npm run build` | PASS | Client and SSR bundles built. |
| `npm test` | PASS | 40 files, 119 tests. |

## Decisions Made

- Used a local-only Clerk bypass for browser route rendering because the backup/current repo has no real Clerk credentials; this is command scoped and not persisted.
- Recorded one-owner/local Sam rehearsal as not alpha-ready because five friendly-owner evidence rows do not exist.
- Kept Matt review prep as context only; the actual two-axis review remains a separate judgment gate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added CSRF middleware for server functions**
- **Found during:** Task A
- **Issue:** TanStack Start warned server functions had no CSRF middleware, which is a security correctness requirement for session-bearing POST paths.
- **Fix:** Added `createCsrfMiddleware` to `src/start.ts`.
- **Files modified:** `src/start.ts`
- **Verification:** `npm run typecheck`; `npm run build`; e2e/a11y gates
- **Committed in:** `acf447b`

**2. [Rule 3 - Blocking] Added command-scoped local Clerk bypass for browser route tests**
- **Found during:** Task A
- **Issue:** Syntactically valid fake Clerk placeholders still triggered external Clerk dev handshakes and DNS redirects, blocking local route-rendering tests.
- **Fix:** Added `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true` branch in root/start only for local e2e commands.
- **Files modified:** `src/routes/__root.tsx`, `src/start.ts`
- **Verification:** `npm run test:e2e`; `npm run test:a11y`
- **Committed in:** `acf447b`

**3. [Rule 1 - Bug] Fixed public-owner claim/privacy browser behavior**
- **Found during:** Task A
- **Issue:** Claim form defaults/navigation/focus, missing nested success rendering, strict duplicate locators, and privacy removal focus/value capture caused meaningful e2e/a11y failures.
- **Fix:** Rendered nested claim routes, blanked claim defaults, disabled forms until hydration, captured event values before async form updates, and focused validation errors after render.
- **Files modified:** `src/routes/claim.tsx`, `src/routes/privacy.remove-business.tsx`, browser specs
- **Verification:** `npm run test:e2e`; `npm run test:a11y`
- **Committed in:** `acf447b`

**4. [Rule 2 - Missing critical functionality] Added friction/failure activation readbacks**
- **Found during:** Task D
- **Issue:** Owner activation state was queryable for publish/status/capability/share/attribution but not friction/failure, which the internal-alpha gate requires.
- **Fix:** Added `frictionCode`, `failureCode`, and `OwnerActivationReadback` with tests for activated and blocked journeys.
- **Files modified:** `src/modules/observability/*`, `tests/unit/observability/funnel.test.ts`
- **Verification:** `npm run test:unit`; `npm run test:types`; `npm run test:ts-standards`
- **Committed in:** `18440a2`

**Total deviations:** 4 auto-fixed (Rule 1: 1, Rule 2: 2, Rule 3: 1)
**Impact on plan:** All fixes were required for security, local gate execution, or plan acceptance. No future product surface was added.

## Issues Encountered

- `npm run check:convex-codegen` remains blocked by external DNS/network access to Sentry/Convex telemetry and missing real Clerk issuer configuration. Per user instruction, no network approval was requested.
- Two uncommitted copy-guardrail changes appeared in `src/lib/ui/contract-scans.ts` and `tests/copy/claims-register.test.ts` after the task commits. They were left unstaged to avoid committing concurrent user work. The committed Task B coverage already passed before those changes appeared.
- `.planning/ROADMAP.md`, `.planning/GTM-READINESS.md`, `.planning/MANIFEST.md`, `.planning/SECURITY-SPEC.md`, later phase planning files, and `.agents/product-marketing.md` were already dirty/untracked and were not modified or staged by this plan.

## Known Stubs

None blocking plan completion. The local Clerk bypass is a test harness branch for route rendering only, not product behavior; real Clerk/Convex/deploy proof remains explicitly blocked in the readiness artifact.

## Auth Gates

- Convex codegen/deployment proof requires real `CLERK_JWT_ISSUER_DOMAIN` and explicit approval for networked Convex CLI/external telemetry access.

## Threat Flags

No unplanned new public trust boundary was introduced. This plan added CSRF middleware to existing server functions and added activation readback fields to existing observability state.

## Metadata Notes

- `roadmap.update-plan-progress` was intentionally not run because `.planning/ROADMAP.md` had pre-existing unrelated dirty user changes and the user explicitly asked not to mix planning work.
- `.planning/REQUIREMENTS.md` is absent, so `requirements.mark-complete R10` cannot update a requirements file.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/01-ten-star-spine-foundation/01-08-gate-suite-review-alpha-readiness-SUMMARY.md`.
- Closeout artifacts exist: `01-FABLE-CLOSEOUT.md`, `01-MATT-REVIEW-CONTEXT.md`, and `01-INTERNAL-ALPHA-READINESS.md`.
- Task commits found: `acf447b`, `2421f85`, `29753c3`, `18440a2`, `c5cb373`, `672791b`, `94f95d9`.
- No tracked files were deleted by task commits.

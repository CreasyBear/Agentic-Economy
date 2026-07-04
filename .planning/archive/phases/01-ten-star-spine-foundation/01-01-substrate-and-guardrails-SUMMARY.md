---
phase: 01-ten-star-spine-foundation
plan: 01
subsystem: infra
tags: [tanstack-start, convex, clerk, shadcn, vitest, playwright, guardrails]

requires:
  - phase: 01-ten-star-spine-foundation
    provides: Phase 1 specification, UI contract, source-mining rules, and validation strategy
provides:
  - Root TanStack Start runtime scaffold with Clerk and Convex auth configuration
  - AE tokenized UI substrate with shadcn primitives, public shell, status badge, and non-mutating proof route
  - Executable import, source-mining, TypeScript standards, copy, and UI contract scanners
  - Negative fixtures proving the scanners catch backup coupling and future-surface drift
affects: [phase-01, substrate, guardrails, ui-framework, validation]

tech-stack:
  added: [TanStack Start, TanStack Router, React, Clerk TanStack Start, Convex, shadcn, Tailwind, Vitest, Playwright]
  patterns:
    - Root-level TanStack Start scaffold around the existing Vite/TanStack shell
    - Scanner utility with clean-runtime targets and explicit fixture mode
    - AE-owned layout/status components layered over shadcn primitives

key-files:
  created:
    - package.json
    - package-lock.json
    - vite.config.ts
    - vitest.config.ts
    - playwright.config.ts
    - tsconfig.json
    - components.json
    - convex/auth.config.ts
    - src/routes/__root.tsx
    - src/routes/index.tsx
    - src/components/ae/layout/AePublicShell.tsx
    - src/components/ae/layout/AePageHeader.tsx
    - src/components/ae/status/AeStatusBadge.tsx
    - src/lib/ui/contract-scans.ts
    - src/lib/ui/status-presentation.ts
    - tests/imports/backup-imports.test.ts
    - tests/imports/private-imports.test.ts
    - tests/imports/route-boundary.test.ts
    - tests/imports/source-mining.test.ts
    - tests/imports/ts-standards.test.ts
    - tests/copy/phase1-banned-copy.test.ts
    - tests/ui-contract/class-scan.test.ts
  modified:
    - .gitignore

key-decisions:
  - "Kept the existing root-level TanStack/Vite scaffold instead of moving files into apps/web, because the workspace already had that substrate and the plan explicitly said to complete around existing state."
  - "Used Vite 8 native tsconfig path resolution instead of carrying the vite-tsconfig-paths plugin in config."
  - "Excluded src/lib/ui/contract-scans.ts from clean scanner targets because the scanner definition must contain the banned tokens it enforces; fixture mode proves those tokens are still detected."
  - "Made Convex auth fail closed when CLERK_JWT_ISSUER_DOMAIN is absent instead of using a placeholder issuer."

patterns-established:
  - "Clean-vs-fixture scanner mode: clean commands assert no violations; fixture commands assert each bad fixture is detected."
  - "AE shell route: route files compose AE layout/status components and shadcn primitives, with no claim/publish behavior."
  - "Status presentation map: UI state labels, tones, descriptions, and priorities are centralized in src/lib/ui/status-presentation.ts."

requirements-completed: [R1, R10]

coverage:
  - id: D1
    description: "Runtime substrate with real package scripts, strict TypeScript config, TanStack Start route shell, Clerk provider, Convex auth config, Tailwind tokens, shadcn primitives, and non-mutating home proof route."
    requirement: R10
    verification:
      - kind: other
        ref: "npm run typecheck"
        status: pass
      - kind: other
        ref: "npm run build"
        status: pass
      - kind: unit
        ref: "npm run test:unit"
        status: pass
    human_judgment: false
  - id: D2
    description: "Executable guardrail scanners for backup imports, private module boundaries, route boundaries, source-mining/future-surface symbols, TypeScript standards, copy claims, and UI contract drift."
    requirement: R1
    verification:
      - kind: unit
        ref: "npm run test:imports"
        status: pass
      - kind: unit
        ref: "npm run test:source-mining"
        status: pass
      - kind: unit
        ref: "npm run test:ts-standards"
        status: pass
      - kind: unit
        ref: "npm run test:copy"
        status: pass
      - kind: unit
        ref: "npm run test:ui-contract"
        status: pass
      - kind: unit
        ref: "npm run test:imports:fixtures"
        status: pass
      - kind: unit
        ref: "npm run test:source-mining:fixtures"
        status: pass
      - kind: unit
        ref: "npm run test:ts-standards:fixtures"
        status: pass
      - kind: unit
        ref: "npm run test:copy:fixtures"
        status: pass
      - kind: unit
        ref: "npm run test:ui-contract:fixtures"
        status: pass
    human_judgment: false
  - id: D3
    description: "Convex codegen command exists and invokes the real Convex CLI, but verification is blocked until a Convex deployment is configured."
    requirement: R10
    verification:
      - kind: other
        ref: "npm run check:convex-codegen"
        status: unknown
    human_judgment: true
    rationale: "The command failed with: No CONVEX_DEPLOYMENT set, run `npx convex dev` to configure a Convex project."
  - id: D4
    description: "Rendered shell evidence attempted for compact and wide viewport, but blocked by missing Playwright browser binary."
    requirement: R10
    verification:
      - kind: automated_ui
        ref: "npx playwright screenshot --viewport-size=375,812 http://127.0.0.1:3000 ..."
        status: unknown
    human_judgment: true
    rationale: "Playwright reported the Chromium headless executable is missing and requested `npx playwright install`."

duration: 14 min
completed: 2026-06-27
status: complete
---

# Phase 01 Plan 01: Substrate and Guardrails Summary

**TanStack Start + Convex + Clerk substrate with fail-first guardrails for imports, source-mining, TypeScript, copy, and UI drift.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-06-27T13:55:13Z
- **Completed:** 2026-06-27T14:09:16Z
- **Tasks:** 3 task commits
- **Files modified:** 54 tracked implementation/test files

## Accomplishments

- Created the root TanStack Start runtime substrate with strict TypeScript, Vite, Vitest, Playwright, Tailwind, shadcn components, Clerk provider wiring, and minimal Convex auth scaffold.
- Added AE design tokens, shadcn primitives, AE public shell/page header/status badge, centralized status presentation, and a non-mutating shell route.
- Added executable guardrail scanners and negative fixtures for backup imports, private route/module boundaries, source-mining/future-surface symbols, unsafe TypeScript, public copy overclaims, and UI class drift.
- Verified clean scans pass and fixture scans detect intentionally bad inputs.

## Task Commits

1. **Task A-D/H substrate and UI scaffold** - `8134856` (chore)
2. **Task E-H guardrail scanners and negative fixtures** - `d979133` (test)
3. **Rule 2 auth config hardening** - `1ab9c26` (fix)

## Files Created/Modified

- `package.json` - Real package scripts for typecheck, Convex codegen, scanner tests, fixture tests, build, and broader suite entry points.
- `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json` - Runtime, test, viewport, and strict TypeScript configuration.
- `convex/auth.config.ts` - Minimal Clerk issuer config that fails closed if `CLERK_JWT_ISSUER_DOMAIN` is absent.
- `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/router.tsx`, `src/start.ts` - TanStack Start shell and non-mutating proof route.
- `src/styles/tokens.css`, `src/styles/globals.css` - AE design tokens, shadcn/Tailwind theme bridge, root focus and reduced-motion rules.
- `src/components/ui/*` - Minimal shadcn primitives used by the shell.
- `src/components/ae/layout/*`, `src/components/ae/status/AeStatusBadge.tsx` - Product-owned shell, page header, and status badge layer.
- `src/lib/ui/status-presentation.ts`, `src/lib/ui/copy.ts`, `src/lib/ui/contract-scans.ts` - UI copy/status contracts and shared scanner utility.
- `tests/imports/*`, `tests/copy/*`, `tests/ui-contract/*`, `tests/fixtures/*` - Clean and fixture guardrail tests.

## Decisions Made

- Kept the existing root scaffold instead of moving to `apps/web`; this completed the current workspace state without restarting the scaffold.
- Used Vite 8 native `resolve.tsconfigPaths` instead of the `vite-tsconfig-paths` plugin in config.
- Excluded the scanner utility itself from clean scanner targets because it must contain banned-token regexes to enforce the rules.
- Treated Convex codegen as a real command but recorded the missing deployment as an environment blocker rather than replacing it with a no-op.

## Verification

| Command | Result | Notes |
|---|---:|---|
| `npm run typecheck` | PASS | Strict TypeScript completed. |
| `npm run check:convex-codegen` | BLOCKED | Convex CLI failed: `No CONVEX_DEPLOYMENT set, run npx convex dev to configure a Convex project`. |
| `npm run test:imports` | PASS | 3 tests passed. |
| `npm run test:source-mining` | PASS | 1 test passed. |
| `npm run test:ts-standards` | PASS | 1 test passed. |
| `npm run test:copy` | PASS | 2 tests passed. |
| `npm run test:ui-contract` | PASS | 2 tests passed. |
| `npm run build` | PASS | Client and SSR builds completed. |
| `npm run test:imports:fixtures` | PASS | 3 fixture tests passed. |
| `npm run test:source-mining:fixtures` | PASS | 1 fixture test passed. |
| `npm run test:ts-standards:fixtures` | PASS | 1 fixture test passed. |
| `npm run test:copy:fixtures` | PASS | 2 fixture tests passed. |
| `npm run test:ui-contract:fixtures` | PASS | 2 fixture tests passed. |
| `npm run test:unit` | PASS | 1 status presentation unit test passed. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added native TS path resolution to Vitest**
- **Found during:** Verification of scanner tests
- **Issue:** Vitest could not resolve `@/lib/ui/*` imports.
- **Fix:** Enabled Vite 8 native `resolve.tsconfigPaths` in Vitest and Vite config.
- **Files modified:** `vitest.config.ts`, `vite.config.ts`
- **Verification:** `npm run test:imports`, `npm run test:copy`, and `npm run test:ui-contract` pass.
- **Committed in:** `8134856`

**2. [Rule 3 - Blocking] Acknowledged TypeScript 6 baseUrl deprecation**
- **Found during:** `npm run typecheck`
- **Issue:** TypeScript 6 rejects deprecated `baseUrl` without an explicit migration acknowledgement.
- **Fix:** Added `ignoreDeprecations: "6.0"` while retaining path aliases for the scaffold.
- **Files modified:** `tsconfig.json`
- **Verification:** `npm run typecheck` passes.
- **Committed in:** `8134856`

**3. [Rule 1 - Bug] Fixed scanner self-matching**
- **Found during:** Clean guardrail scans
- **Issue:** The scanner utility contained the banned regex tokens it enforces, causing clean scans to flag itself.
- **Fix:** Excluded `src/lib/ui/contract-scans.ts` from clean runtime scanner targets while keeping fixture scans active.
- **Files modified:** `tests/imports/scan-targets.ts`
- **Verification:** Clean scanner commands pass and fixture scanner commands still detect bad fixtures.
- **Committed in:** `d979133`

**4. [Rule 1 - Bug] Completed unsafe TypeScript fixture coverage**
- **Found during:** `npm run test:ts-standards:fixtures`
- **Issue:** The bad fixture did not trigger the broad-status and line-end non-null assertion checks.
- **Fix:** Changed the fixture to use `status: string` and updated the non-null assertion regex for line-end assertions.
- **Files modified:** `tests/fixtures/bad-ts-standards/unsafe.fixture`, `src/lib/ui/contract-scans.ts`
- **Verification:** `npm run test:ts-standards:fixtures` passes.
- **Committed in:** `d979133`

**5. [Rule 2 - Missing Critical] Removed placeholder Convex issuer fallback**
- **Found during:** Stub/threat scan before summary
- **Issue:** A fake local Clerk issuer would hide missing auth configuration.
- **Fix:** Added a required env helper so Convex auth fails closed when `CLERK_JWT_ISSUER_DOMAIN` is absent.
- **Files modified:** `convex/auth.config.ts`
- **Verification:** `npm run typecheck`, `npm run test:ts-standards`, and `npm run build` pass.
- **Committed in:** `1ab9c26`

---

**Total deviations:** 5 auto-fixed (2 blocking, 2 bugs, 1 missing critical).
**Impact on plan:** All fixes strengthened the substrate or guardrails without adding public product behavior.

## Issues Encountered

- `npm run check:convex-codegen` could not complete because no Convex deployment is configured. Exact CLI error: `No CONVEX_DEPLOYMENT set, run npx convex dev to configure a Convex project`.
- `npx shadcn@latest info --json` attempted a registry lookup and failed offline with `ENOTFOUND registry.npmjs.org`; package names and versions were verified from local installed package metadata instead.
- Rendered screenshot evidence was attempted with the dev server running, but Playwright could not launch Chromium because the browser binary is missing from `/Users/skchan/Library/Caches/ms-playwright/...`.
- Existing untracked files outside this plan were left untouched: `.agents/product-marketing.md`, `.planning/config.json`, `.planning/phases/02-human-inquiry-owner-inbox/02-CONTEXT.md`, and `.planning/phases/02-human-inquiry-owner-inbox/02-DISCUSSION-LOG.md`.

## Known Stubs

None blocking the 01-01 goal. Empty `.gitkeep` files intentionally reserve future test directories; they do not feed UI rendering or public behavior.

## Threat Flags

None. The only new security-relevant surface is the planned Clerk/Convex auth scaffold, and it now fails closed when the issuer env var is absent.

## User Setup Required

- Configure Convex locally before expecting `npm run check:convex-codegen` to pass: the Convex CLI requires `CONVEX_DEPLOYMENT`.
- Install Playwright browsers before rendered screenshot evidence or E2E/a11y checks can run.

## Next Phase Readiness

The substrate and fail-first guardrails are in place for `01-02-contracts-schema-idempotency-admin-foundation`. Before relying on Convex generated contracts in 01-02, configure the Convex deployment/local dev environment and rerun `npm run check:convex-codegen`.

## Self-Check: PASSED

- Summary path exists: `.planning/phases/01-ten-star-spine-foundation/01-01-substrate-and-guardrails-SUMMARY.md`.
- Task commits exist: `8134856`, `d979133`, `1ab9c26`.
- Key created files exist: `package.json`, `convex/auth.config.ts`, `src/lib/ui/contract-scans.ts`, `tests/imports/source-mining.test.ts`, `tests/ui-contract/class-scan.test.ts`.

---
*Phase: 01-ten-star-spine-foundation*
*Completed: 2026-06-27*

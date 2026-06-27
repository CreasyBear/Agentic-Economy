---
phase: 01
plan: 04
slug: admin-dispute-operator-recovery
status: complete
subsystem: admin-security-recovery
tags: [admin, disputes, suppression, operator-controls, audit, readback]
requires: [01-01-substrate-and-guardrails, 01-02-contracts-schema-idempotency-admin-foundation, 01-03-business-claim-publish-suppress]
provides:
  - source-owned admin membership bootstrap/grant/revoke enforcement
  - protected admin readback shells for claims, audit events, and index health
  - removal dispute intake with abuse controls and hashed contacts
  - audited suppression and unsuppression recovery
  - audited operator controls with expiry and readback
affects:
  - src/modules/security
  - src/modules/business
  - src/modules/observability
  - convex
  - src/routes/admin
  - src/components/ae
tech_stack:
  added:
    - TanStack route shells under root src/routes
    - module-owned admin/dispute/operator seams
    - fail-closed Convex generic functions
  patterns:
    - source-owned authority checks
    - redacted audit events
    - idempotent operation keys
    - shadcn/AE protected shells
key_files:
  created:
    - src/modules/security/internal/admin-readbacks.ts
    - src/modules/security/internal/disputes.ts
    - src/modules/observability/internal/operator-controls.ts
    - src/components/ae/layout/AeAdminShell.tsx
    - src/components/ae/readback/AeAdminReadbackPanel.tsx
    - src/routes/admin.claims.tsx
    - src/routes/admin.audit-events.tsx
    - src/routes/admin.index-health.tsx
    - tests/unit/security/admin-readbacks.test.ts
    - tests/unit/security/disputes.test.ts
    - tests/unit/observability/operator-controls.test.ts
  modified:
    - convex/security.ts
    - convex/business.ts
    - convex/observability.ts
    - src/modules/security/internal/admin-authority.ts
    - src/modules/security/internal/schema.ts
    - src/modules/security/public.ts
    - src/modules/business/internal/visibility.ts
    - src/modules/business/public.ts
    - src/modules/observability/internal/schema.ts
    - src/modules/observability/public.ts
    - src/routeTree.gen.ts
    - tests/unit/security/admin-authority.test.ts
    - tests/unit/business/suppression.test.ts
decisions:
  - Admin route shells fail closed until source-owned membership can be resolved; route presence is not authority.
  - Convex admin/dispute/operator functions expose exact fail-closed boundaries until CONVEX_DEPLOYMENT enables generated auth and DB wiring.
  - Suppression rules store prior source state so unsuppression restores from durable evidence instead of guessing.
metrics:
  started_at: "2026-06-27T15:21:25Z"
  completed_at: "2026-06-27T22:17:34Z"
  duration: "6h 56m"
  tasks_completed: 6
  commits: 6
---

# Phase 01 Plan 04: Admin, Dispute, Operator Recovery Summary

Source-owned admin authority with dispute/removal intake, suppression recovery, operator controls, and protected admin readback shells.

## What Shipped

| Task | Result | Commit |
|---|---|---|
| 01-04-A | Added preauthorized owner-admin bootstrap plus grant/revoke/action-denial enforcement and audits. | 7ccd956 |
| 01-04-B | Added protected admin route shells, server/module readback enforcement, and fail-closed Convex readbacks. | b3f7507 |
| 01-04-C | Added removal dispute intake with CSRF, rate limits, contact hashes, evidence caps, idempotency, and audits. | b3f0126 |
| 01-04-D | Added evidence-required suppression and audited unsuppression with durable prior-state restoration. | c260a8e |
| 01-04-E | Added operator controls with authority, reason, evidence, expiry, audit, and readback behavior. | 7637318 |
| 01-04-F | Enriched admin claims/audit/index-health shells with safe source-state/readback/attempt/repair/correlation rows. | c527ead |

## Verification

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | Passed | `tsc --noEmit` completed. |
| `npm run check:convex-codegen` | Blocked | Convex CLI reported: `No CONVEX_DEPLOYMENT set, run \`npx convex dev\` to configure a Convex project`. |
| `npm run test:unit` | Passed | 17 files, 47 tests. |
| `npm run test:integration` | Passed | 1 file, 2 tests. |
| `npm run test:e2e` | Blocked | Sandboxed run could not bind `127.0.0.1:3000` (`listen EPERM`). Elevated rerun started Vite, then Playwright reported `No tests found` for `tests/e2e`. |
| `npm run test:a11y` | Blocked | Sandboxed run hit `listen EPERM`. Elevated rerun timed out waiting 120000ms for config.webServer; `tests/e2e/a11y` contains only `.gitkeep`. |
| `npm run test:copy` | Passed | 2 files, 18 tests. |
| `npm run test:ui-contract` | Passed | 2 files, 2 tests. |
| `npm run test:imports` | Passed | 3 files, 3 tests. |
| `npm run test:ts-standards` | Passed | 1 file, 1 test. |
| `npm run build` | Passed | Client and SSR bundles built. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added durable reconstruction fields**
- **Found during:** Tasks C, D, and E
- **Issue:** Dispute, suppression, and operator-control records needed operation/readback/reconstruction fields that were not fully present in the pre-existing schema.
- **Fix:** Added dispute operation keys and hashes, suppression prior-state/lift metadata, and operator-control operation keys.
- **Files modified:** `src/modules/security/internal/schema.ts`, `src/modules/observability/internal/schema.ts`, `src/modules/security/public.ts`
- **Commits:** b3f0126, c260a8e, 7637318

**2. [Rule 2 - Missing critical functionality] Required evidence for suppression recovery**
- **Found during:** Task D
- **Issue:** Suppression required a reason but did not reject missing evidence, and unsuppression did not exist.
- **Fix:** Added evidence validation, audited unsuppression, prior-state restoration, invalidation intents, and behavior tests.
- **Files modified:** `src/modules/business/internal/visibility.ts`, `src/modules/business/public.ts`, `tests/unit/business/suppression.test.ts`
- **Commit:** c260a8e

**3. [Rule 3 - Actual route layout] Adapted admin shells to root routes**
- **Found during:** Task B
- **Issue:** The plan referenced `apps/web`, but the repository uses root `src/routes`.
- **Fix:** Added TanStack route files under `src/routes` and regenerated `src/routeTree.gen.ts`.
- **Files modified:** `src/routes/admin.*.tsx`, `src/routeTree.gen.ts`
- **Commit:** b3f7507

## Auth Gates

None. Convex codegen remains an environment setup blocker, not an auth gate: `CONVEX_DEPLOYMENT` is not configured.

## Known Stubs

| Stub | File | Reason |
|---|---|---|
| Fail-closed Convex wrappers | `convex/security.ts`, `convex/business.ts`, `convex/observability.ts` | Generated Convex auth/DB wiring is unavailable until `CONVEX_DEPLOYMENT` is configured. Wrappers deny rather than pretending live authority exists. |
| Admin route membership resolver | `src/routes/admin.claims.tsx`, `src/routes/admin.audit-events.tsx`, `src/routes/admin.index-health.tsx` | Routes pass `membership: undefined` and use module readbacks to deny non-admins without exposing private rows. Source-owned admin resolution belongs in the deployment boundary once Convex wiring exists. |
| E2E/a11y suites | `tests/e2e`, `tests/e2e/a11y` | Directories have no executable Playwright specs yet; commands are wired but cannot validate browser behavior. |

## Threat Flags

None beyond planned PR04 surfaces. New admin, dispute, suppression, and operator-control paths are covered by source-owned authority, CSRF where session-bearing, rate limits for public writes, evidence caps, redacted audit payloads, and fail-closed deployment boundaries.

## Self-Check: PASSED

- Summary file created at `.planning/phases/01-ten-star-spine-foundation/01-04-admin-dispute-operator-recovery-SUMMARY.md`.
- Task commits found: 7ccd956, b3f7507, b3f0126, c260a8e, 7637318, c527ead.
- No tracked files were deleted by task commits.

---
phase: "02-human-inquiry-owner-inbox"
plan: "02-03"
status: complete
completed_at: "2026-06-29T03:06:01Z"
subsystem: "human inquiry owner inbox"
tags:
  - phase-2
  - operator-readback
  - route-isolation
  - e2e
dependency_graph:
  requires:
    - "02-02 source closeout gaps"
  provides:
    - "/admin/inquiries operator reconstruction route"
    - "Phase 4/5 future route parking outside active src/routes"
    - "Phase 2 public/owner/operator E2E and a11y coverage"
  affects:
    - "src/modules/inquiries"
    - "src/routes"
    - "src/future-phases"
    - "tests/e2e"
tech_stack:
  added:
    - "TanStack route /admin/inquiries"
    - "Parked future route helper for non-active Phase 4/5 route modules"
  patterns:
    - "source-owned readbacks"
    - "redacted operator reconstruction"
    - "local Clerk bypass for deterministic E2E"
key_files:
  created:
    - "src/routes/admin.inquiries.tsx"
    - "src/future-phases/route-helpers.ts"
    - "src/future-phases/04-owner-pending-protected-actions/routes/owner.actions.tsx"
    - "src/future-phases/05-paid-activation-money-rails/routes/api.billing.webhook.ts"
    - "src/future-phases/05-paid-activation-money-rails/routes/owner.billing.tsx"
    - "src/future-phases/05-paid-activation-money-rails/routes/owner.billing.activate.tsx"
    - "src/future-phases/05-paid-activation-money-rails/routes/owner.billing.cancel.tsx"
    - "src/future-phases/05-paid-activation-money-rails/routes/owner.billing.redirecting.tsx"
    - "src/future-phases/05-paid-activation-money-rails/routes/owner.billing.return.tsx"
    - "src/future-phases/05-paid-activation-money-rails/routes/owner.billing.receipts.$receiptId.tsx"
    - "output/playwright/phase2-ui/operator-reconstruction-compact.png"
    - "output/playwright/phase2-ui/operator-reconstruction-wide.png"
  modified:
    - "convex/inquiries.ts"
    - "src/modules/inquiries/internal/schema.ts"
    - "src/modules/inquiries/internal/commands.ts"
    - "src/modules/inquiries/public.ts"
    - "src/modules/inquiries/inquiry.functions.ts"
    - "src/routes/owner.inquiries.$threadId.tsx"
    - "src/components/ae/layout/AePublicShell.tsx"
    - "src/lib/ui/contract-scans.ts"
    - "src/routeTree.gen.ts"
    - "tests/unit/inquiries/inquiry-flow.test.ts"
    - "tests/unit/server/server-seams.test.ts"
    - "tests/unit/billing/owner-routes.test.ts"
    - "tests/e2e/public-owner-ui.spec.ts"
    - "tests/e2e/a11y/public-owner-a11y.spec.ts"
    - "output/playwright/phase2-ui/phase2-ui-proof.mjs"
decisions:
  - "Used the plan-required local Clerk bypass for deterministic Phase 2 UI/E2E coverage; Clerk credential smoke remains a separate auth integration concern."
  - "Preserved future Phase 4/5 route work under src/future-phases instead of deleting it or requesting an override."
  - "Did not update STATE.md, ROADMAP.md, stage, or commit because the executor was explicitly constrained not to mutate git state."
metrics:
  task_count: 3
  verification_status: passed
---

# Phase 02 Plan 03: Human Inquiry Owner Inbox UI Route Gaps Summary

Phase 2 UI/operator gaps are closed with a redacted source-backed operator reconstruction route, future route isolation, and browser evidence across public inquiry, owner controls, delivery readback, and operator reconstruction.

## Completed Tasks

| Task | Result |
| --- | --- |
| Task 1: Add Phase 2 operator reconstruction route and readback | Complete |
| Task 2: Isolate future Phase 4/5 routes from the Phase 2 route tree | Complete |
| Task 3: Add Phase 2 E2E, a11y, and rendered operator evidence | Complete |

## Implementation Summary

- Added `/admin/inquiries` using `AeAdminShell` with denied and allowed operator readbacks.
- Added inquiry operator reconstruction seams that assemble thread/message hashes, notification refs, dispatch bindings, audit refs, funnel refs, operation refs, source hashes, correlation IDs, and next action without exposing raw body/contact/provider payloads.
- Added Convex admin reconstruction query support and local-E2E operator readback support.
- Moved Phase 4/5 route files from active `src/routes` into `src/future-phases/.../routes`, preserving their helper tests through a parked route helper.
- Regenerated `src/routeTree.gen.ts`; `/admin/inquiries` is present and future `/owner/actions`, `/owner/billing*`, and `/api/billing/webhook` routes are absent.
- Added scanner gates so future routes fail clean scans if they return to active `src/routes` or `src/routeTree.gen.ts`.
- Added E2E/a11y coverage for public inquiry validation/submission, owner inbox/detail, mark-read, reply, close, delivery readback, and operator reconstruction.
- Captured operator reconstruction evidence:
  - `output/playwright/phase2-ui/operator-reconstruction-compact.png` (375x3532)
  - `output/playwright/phase2-ui/operator-reconstruction-wide.png` (1440x2147)

## Route Isolation

Route isolation completed without an override request artifact. Future work was preserved under:

- `src/future-phases/04-owner-pending-protected-actions/routes/`
- `src/future-phases/05-paid-activation-money-rails/routes/`

No owner-accepted override artifact was created.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added local-E2E owner action hydration gating**
- **Found during:** Task 3 browser verification
- **Issue:** SSR rendered owner action buttons before client hydration, allowing Playwright to click before handlers attached under parallel load.
- **Fix:** Disabled owner action controls until hydration, matching existing public form patterns.
- **Files modified:** `src/routes/owner.inquiries.$threadId.tsx`

**2. [Rule 1 - Bug] Fixed compact public header overflow**
- **Found during:** Task 3 a11y verification
- **Issue:** Public nav stayed in one row at 375px and caused horizontal overflow.
- **Fix:** Allowed public shell header/nav to wrap on compact widths.
- **Files modified:** `src/components/ae/layout/AePublicShell.tsx`

**3. [Rule 1 - Bug] Made claim E2E data unique per run**
- **Found during:** Full E2E verification
- **Issue:** Existing claim E2E reused the same slug across repeated local runs and correctly hit duplicate-claim rejection.
- **Fix:** Added a run-specific suffix to the test slug.
- **Files modified:** `tests/e2e/public-owner-ui.spec.ts`

## Verification

Passed:

- `npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts tests/unit/server/server-seams.test.ts`
- `npm run test:unit -- tests/unit/billing/owner-routes.test.ts tests/unit/billing/rail.test.ts`
- `npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts tests/unit/server/server-seams.test.ts tests/unit/billing/owner-routes.test.ts tests/unit/billing/rail.test.ts`
- `npm run test:source-mining`
- `npm run test:copy`
- `npm run test:ui-contract`
- `npm run typecheck`
- `npm run build -- --logLevel error`
- `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:e2e`
- `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true npm run test:a11y`
- `sips -g pixelWidth -g pixelHeight output/playwright/phase2-ui/operator-reconstruction-compact.png output/playwright/phase2-ui/operator-reconstruction-wide.png`
- `node -e "const fs=require('fs'); const s=fs.readFileSync('src/routeTree.gen.ts','utf8'); if (/\\/owner\\/actions|\\/owner\\/billing|\\/api\\/billing\\/webhook/.test(s)) process.exit(1)"`

Notes:

- The first sandboxed Playwright run could not bind `127.0.0.1` (`listen EPERM`). The same browser commands passed when rerun with local dev-server permissions.
- No remote/cloud/provider state was mutated.

## Known Stubs

None that prevent this plan's goal. The local-E2E bypass remains intentional deterministic test infrastructure for Phase 2 browser coverage.

## Threat Flags

None beyond the plan threat model. The new admin readback route is redacted and covered by unit/E2E assertions.

## Self-Check: PASSED

- `src/routes/admin.inquiries.tsx` exists.
- `/admin/inquiries` is present in `src/routeTree.gen.ts`.
- Future `/owner/actions`, `/owner/billing*`, and `/api/billing/webhook` routes are absent from `src/routeTree.gen.ts`.
- Future route implementation files exist under `src/future-phases/...`.
- Operator reconstruction compact and wide screenshots exist and are non-empty.
- No commits were made, matching the explicit execution constraint.

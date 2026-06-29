---
phase: 02-human-inquiry-owner-inbox
plan: 02
subsystem: inquiries-notifications-security
tags: [convex, inquiries, notification-outbox, csrf, audit, operation-keys]

requires:
  - phase: 02-01-human-inquiry-owner-inbox-production
    provides: inquiry source model, owner inbox mutations, notification outbox primitives, observability tables
provides:
  - Inquiry notification dispatch bindings for source-owned Resend and Novu outbox rows
  - Notification operation reconstruction across operation keys, audit events, and exact-scope funnel events
  - POST-backed owner mark-read route/server flow without GET mutation
  - CSRF/Origin admission for Phase 2 browser mutation paths
affects: [phase-02-ui-smoke, phase-02-provider-smoke, phase-02-closeout]

tech-stack:
  added: []
  patterns:
    - Deterministic inquiry-to-notification dispatch binding with replay-safe operation keys
    - Source-owned CSRF admission using existing Phase 1 assertCsrf semantics
    - Audit and operation-key reconstruction for notification outbox operator readback

key-files:
  created:
    - .planning/phases/02-human-inquiry-owner-inbox/02-02-SUMMARY.md
  modified:
    - src/modules/inquiries/internal/schema.ts
    - src/modules/inquiries/internal/commands.ts
    - src/modules/inquiries/public.ts
    - src/modules/inquiries/internal/convex-schema.ts
    - convex/inquiries.ts
    - convex/notificationOutbox.ts
    - src/modules/inquiries/inquiry.functions.ts
    - src/routes/owner.inquiries.$threadId.tsx
    - tests/unit/convex/inquiries-runtime.test.ts
    - tests/unit/convex/notification-outbox-runtime.test.ts
    - tests/unit/server/server-seams.test.ts

key-decisions:
  - "Bind inquiry notifications to provider dispatch rows with durable safe metadata instead of fabricating provider-smoke IDs."
  - "Keep webhook/readback reconstruction inside notificationOutbox and never let provider events mutate inquiry message truth."
  - "Expose mark-read through a POST-backed server function and keep the owner thread GET loader read-only."
  - "Use same-site Origin or token/cookie CSRF evidence for every Phase 2 browser mutation before source side effects."

patterns-established:
  - "Inquiry notification projections include safe dispatch IDs, provider families, statuses, payload hashes, and operator next action only."
  - "Notification enqueue, dispatch, webhook, retry, and no-repair operations write shared operation-key and audit reconstruction."
  - "Funnel scope is limited to notification_queued, notification_delivered, and notification_failed."

requirements-completed: [P2-R2, P2-R3, P2-R4, P2-R5, P2-R6, P2-R8]

coverage:
  - id: D1
    description: "Inquiry submit and owner reply create source-owned notificationOutbox dispatches bound to inquiryNotifications for Resend and Novu."
    requirement: P2-R5
    verification:
      - kind: unit
        ref: "npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts tests/unit/convex/inquiries-runtime.test.ts tests/unit/notification-outbox/readback.test.ts tests/unit/convex/notification-outbox-runtime.test.ts tests/unit/observability/operation-keys.test.ts tests/unit/observability/funnel.test.ts tests/unit/observability/audit-redaction.test.ts tests/unit/server/server-seams.test.ts tests/unit/security/csrf-rate-limit.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Notification enqueue, dispatch, webhook, retry, and no-repair write operation-key/audit reconstruction with exact funnel scope."
    requirement: P2-R8
    verification:
      - kind: unit
        ref: "tests/unit/convex/notification-outbox-runtime.test.ts"
        status: pass
      - kind: unit
        ref: "tests/unit/observability/operation-keys.test.ts tests/unit/observability/funnel.test.ts tests/unit/observability/audit-redaction.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "Owner mark-read is reachable through inquiry server functions and the owner thread route without mutating on GET."
    requirement: P2-R3
    verification:
      - kind: unit
        ref: "tests/unit/server/server-seams.test.ts"
        status: pass
      - kind: unit
        ref: "tests/unit/convex/inquiries-runtime.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Public submit, mark-read, reply, close, operator retry, and operator no-repair enforce CSRF/Origin admission before side effects."
    requirement: P2-R4
    verification:
      - kind: unit
        ref: "tests/unit/convex/inquiries-runtime.test.ts tests/unit/convex/notification-outbox-runtime.test.ts tests/unit/security/csrf-rate-limit.test.ts"
        status: pass
    human_judgment: false

duration: not recorded in resumed executor context
completed: 2026-06-29
status: complete
---

# Phase 02 Plan 02: Human Inquiry Owner Inbox Source Closeout Gaps Summary

**Inquiry-created notifications now own their provider dispatch bindings, notification readback reconstruction, owner mark-read routing, and CSRF-admitted browser mutations.**

## Performance

- **Duration:** Not recorded in resumed executor context
- **Started:** Not recorded in resumed executor context
- **Completed:** 2026-06-29T02:22:31Z
- **Tasks:** 2 source tasks completed
- **Files modified:** 11 source/test files plus this summary

## Accomplishments

- Bound inquiry submit and owner reply notifications to deterministic Resend and Novu `notificationDispatches` with replay-safe operation keys, provider idempotency keys, payload hashes, safe statuses, and operator next action metadata.
- Added notification outbox reconstruction for enqueue, dispatch, webhook, retry, and no-repair operations, including operation keys and audit rows; funnel rows are limited to queued, delivered, and failed journey states.
- Wired owner mark-read through `markCurrentOwnerInquiryReadServer` and the owner thread route with a POST-backed control while keeping the route loader read-only.
- Added CSRF/Origin admission to public submit, owner mark-read, owner reply, owner close, operator retry, and operator no-repair mutations before any source side effects.

## Task Commits

No task commits were created. The user/orchestrator explicitly prohibited staging and committing during this gap-closure execution.

## Files Created/Modified

- `src/modules/inquiries/internal/schema.ts` - Added inquiry notification dispatch binding schema and safe projection fields.
- `src/modules/inquiries/internal/commands.ts` - Added replay-safe binding helper and projection mapping for notification dispatch metadata.
- `src/modules/inquiries/public.ts` - Exported the new dispatch binding command and schema types.
- `src/modules/inquiries/internal/convex-schema.ts` - Added Convex persistence fields for dispatch bindings and projection indexes.
- `convex/inquiries.ts` - Persists inquiry rows and matching notification outbox dispatch rows in one logical mutation, adds CSRF admission, and reconstructs inquiry-created notification operations.
- `convex/notificationOutbox.ts` - Adds CSRF admission for operator mutations, webhook dispatch binding, and shared operation/audit/funnel reconstruction.
- `src/modules/inquiries/inquiry.functions.ts` - Adds mark-read server/source helpers and forwards browser mutation CSRF/Origin evidence.
- `src/routes/owner.inquiries.$threadId.tsx` - Adds explicit mark-read route flow and keeps read state mutation out of GET loading.
- `tests/unit/convex/inquiries-runtime.test.ts` - Covers inquiry-created dispatch bindings, replay behavior, owner reply dispatches, and CSRF/Origin branches.
- `tests/unit/convex/notification-outbox-runtime.test.ts` - Covers notification reconstruction, webhook binding, exact funnel scope, and operator CSRF/Origin branches.
- `tests/unit/server/server-seams.test.ts` - Covers mark-read through the route-facing server seam.

## Decisions Made

- Inquiry-created provider smoke IDs must come from dispatch bindings created by submit/reply effects, not from fabricated notification rows.
- Webhook readbacks bind to existing dispatches when source/provider refs match; otherwise they record held operator reconstruction without mutating inquiry thread or message truth.
- Owner mark-read remains a mutation path invoked through POST/server functions; GET loader readback stays side-effect free.
- CSRF checks run before owner/operator authorization and before source persistence so rejected browser mutations have no inquiry, notification, retry, audit, funnel, or operation-key side effects.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing persistence schema] Added Convex schema fields for inquiry notification dispatch bindings**
- **Found during:** Task 1
- **Issue:** The plan listed inquiry domain schema changes but durable Convex rows also needed fields for dispatch bindings and projection arrays.
- **Fix:** Added `dispatchBindingsJson`, `dispatchIds`, `providerFamilies`, and `dispatchStatuses` to `src/modules/inquiries/internal/convex-schema.ts`.
- **Files modified:** `src/modules/inquiries/internal/convex-schema.ts`
- **Verification:** `npm run typecheck` and targeted unit tests passed.
- **Committed in:** Not committed by user request.

**2. [Process Deviation] Skipped per-task and final commits**
- **Found during:** Execution protocol setup
- **Issue:** Standard GSD execution expects per-task commits, but the user/orchestrator explicitly prohibited staging and committing.
- **Fix:** Left all changes local and documented the commit skip here.
- **Files modified:** None
- **Verification:** `git status --short` confirms no commit/stage action was performed by this executor.
- **Committed in:** Not committed by user request.

**Total deviations:** 2 documented deviations
**Impact on plan:** Source scope stayed within the plan except for the adjacent Convex schema helper required to persist the planned dispatch bindings.

## Issues Encountered

- `npm run check:convex-codegen` could not complete under the no-remote/no-provider-mutation constraint. Initial execution attempted Sentry DNS and failed in the restricted sandbox. Retrying with `CI=1` disabled Sentry but Convex codegen still failed with `TypeError: fetch failed`, consistent with a required remote/network fetch. No escalation was requested because the user prohibited remote/cloud/provider mutation.

## Verification

- `npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts tests/unit/convex/inquiries-runtime.test.ts tests/unit/notification-outbox/readback.test.ts tests/unit/convex/notification-outbox-runtime.test.ts tests/unit/observability/operation-keys.test.ts tests/unit/observability/funnel.test.ts tests/unit/observability/audit-redaction.test.ts tests/unit/server/server-seams.test.ts tests/unit/security/csrf-rate-limit.test.ts` - PASS, 34 files, 156 tests.
- `npm run typecheck` - PASS.
- `npm run test:integration` - PASS, 8 files, 26 tests.
- `npm run test:imports` - PASS, 3 files, 3 tests.
- `npm run test:source-mining` - PASS, 1 file, 2 tests.
- `npm run test:copy` - PASS, 3 files, 29 tests.
- `npm run check:convex-codegen` - BLOCKED by restricted network/remote fetch under the explicit no-remote constraint.

## Known Stubs

None. Stub scan found only ordinary in-memory test defaults, null checks, and empty collection initialization.

## Threat Flags

None beyond the plan threat model. The new browser mutation and provider webhook trust-boundary work is covered by T-02-02-01 through T-02-02-05.

## User Setup Required

None for local source work. Convex codegen verification requires an environment where the Convex CLI can complete its remote fetches; this executor did not run remote/cloud/provider-mutating commands.

## Next Phase Readiness

Source-side gap closure is ready for the UI/provider-smoke phase to select provider smoke IDs from inquiry-created dispatch bindings and to verify operator readback against reconstructed notification operations. The only remaining verification gap is `npm run check:convex-codegen` in a network-enabled environment.

## Self-Check: PASSED

- Expected source and test files exist.
- Summary file exists at `.planning/phases/02-human-inquiry-owner-inbox/02-02-SUMMARY.md`.
- Commit checks are intentionally not applicable because staging/committing was explicitly prohibited.

---
*Phase: 02-human-inquiry-owner-inbox*
*Completed: 2026-06-29*

---
phase: 02-human-inquiry-owner-inbox
plan: 02
type: execute
wave: 2
depends_on:
  - 02-01-human-inquiry-owner-inbox-production
files_modified:
  - src/modules/inquiries/internal/commands.ts
  - src/modules/inquiries/internal/schema.ts
  - src/modules/inquiries/public.ts
  - src/modules/inquiries/inquiry.functions.ts
  - src/modules/notification-outbox/internal/commands.ts
  - src/modules/notification-outbox/internal/schema.ts
  - src/modules/notification-outbox/public.ts
  - src/modules/observability/public.ts
  - src/modules/observability/internal/audit.ts
  - src/modules/observability/internal/funnel.ts
  - src/modules/observability/internal/operation-keys.ts
  - convex/inquiries.ts
  - convex/notificationOutbox.ts
  - tests/unit/inquiries/inquiry-flow.test.ts
  - tests/unit/convex/inquiries-runtime.test.ts
  - tests/unit/notification-outbox/readback.test.ts
  - tests/unit/convex/notification-outbox-runtime.test.ts
  - tests/unit/server/server-seams.test.ts
requirements:
  - P2-R2
  - P2-R3
  - P2-R4
  - P2-R5
  - P2-R6
  - P2-R8
autonomous: true
gap_closure: true
must_haves:
  truths:
    - P2-R5 inquiry submit and owner reply create source-owned notificationOutbox dispatches bound to inquiryNotifications, so provider smoke IDs come from real inquiry effects.
    - P2-R3/P2-R4 owner mark-read is reachable through the server/route flow, not only through direct Convex tests.
    - P2-R8 notification enqueue, dispatch, webhook, retry, and no-repair operations write shared audit/operation-key reconstruction; funnel writes are defined for user journey events.
    - P2 browser mutation paths enforce CSRF/Origin admission for public submit, owner mark-read, owner reply, owner close, operator retry, and operator no-repair.
  prohibitions:
    - Do not fabricate notification dispatch IDs or provider-smoke fixtures disconnected from inquiry-created rows.
    - Do not let provider webhook readback create, delete, or downgrade inquiry/message truth.
    - Do not authorize owner or operator mutations from browser-supplied owner/admin/business IDs.
    - Do not write SUMMARY, UAT, or closeout artifacts from this source plan.
  artifacts:
    - src/modules/inquiries/internal/schema.ts exports inquiry notification dispatch-binding fields.
    - src/modules/inquiries/internal/commands.ts creates notification dispatch requests from inquiry submit and owner reply effects.
    - convex/inquiries.ts persists inquiry rows and matching notificationOutbox dispatch rows in the same logical mutation.
    - convex/notificationOutbox.ts writes shared audit, funnel, and operation-key records for notification operations.
    - src/modules/inquiries/inquiry.functions.ts exports markCurrentOwnerInquiryReadServer.
  key_links:
    - inquiryNotifications -> notificationDispatches via dispatch binding.
    - Resend/Novu provider readbacks -> notification dispatch binding or held-for-operator state.
    - Browser server functions -> Convex mutation CSRF/Origin args.
---

<objective>
Close Phase 2 source-side verifier gaps before UI, smoke, or closeout work.

Purpose: Provider smoke and operator reconstruction must follow source-owned inquiry effects, not manually fabricated notification IDs.
Output: Inquiry to outbox dispatch binding, notification audit/operation reconstruction, owner mark-read route wiring, and CSRF/Origin mutation coverage.
</objective>

<execution_context>
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/workflows/execute-plan.md
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/02-human-inquiry-owner-inbox/02-CONTEXT.md
@.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md
@.planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md
@.planning/phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md
@.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md
@.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md
@package.json
@src/modules/inquiries/internal/commands.ts
@src/modules/inquiries/internal/schema.ts
@src/modules/inquiries/inquiry.functions.ts
@src/modules/notification-outbox/internal/commands.ts
@src/modules/observability/internal/operation-keys.ts
@convex/inquiries.ts
@convex/notificationOutbox.ts
</context>

## Multi-Source Coverage Audit

| Source | ID | Feature/Requirement | Plan | Status | Notes |
|---|---|---|---|---|---|
| GOAL | - | One conservative customer inquiry path where message truth persists, owner can read/reply/close, and notification failure/readback is visible. | 02-02, 02-03, 02-04 | COVERED | Source binding in 02-02, rendered/operator coverage in 02-03, deployed smoke/closeout in 02-04. |
| REQ | P2-R1 | Inquiry availability gate. | 02-04 | COVERED | Deployed support smoke validates source readiness through public user path. |
| REQ | P2-R2 | Inquiry submit command. | 02-02, 02-03 | COVERED | Submit creates outbox dispatches and E2E covers public submit. |
| REQ | P2-R3 | Owner inbox projection. | 02-02, 02-03 | COVERED | Mark-read server flow plus equal timestamp/revoked owner tests and E2E. |
| REQ | P2-R4 | Owner reply state machine. | 02-02, 02-03 | COVERED | CSRF/Origin and route flow cover reply/close mutations. |
| REQ | P2-R5 | Notification outbox and readback. | 02-02, 02-04 | COVERED | Source dispatch binding and deployed provider smoke. |
| REQ | P2-R6 | Private content boundary. | 02-02, 02-03, 02-04 | COVERED | Redacted source records, UI/operator readback, and smoke evidence requirements. |
| REQ | P2-R7 | Inquiry and inbox UI states. | 02-03 | COVERED | E2E/a11y and operator screenshots. |
| REQ | P2-R8 | Phase 2 closeout proof. | 02-02, 02-03, 02-04 | COVERED | Source reconstruction, future-route isolation, deployed smoke, final artifacts. |
| CONTEXT | D-01 | Live inquiry behavior with configured notification dependency. | 02-02, 02-04 | COVERED | Dispatch rows are created from inquiry effects and provider smoke is tied to them. |
| CONTEXT | D-02 | Evidence replaces theatre. | 02-02, 02-03, 02-04 | COVERED | Tests, route smoke, provider readback, operator reconstruction, redaction scans, and deployment readback. |
| CONTEXT | D-03 | Exact Resend/Novu env/setup/failure readbacks. | 02-04 | COVERED | Smoke plan names exact env vars and evidence requirements. |
| CONTEXT | D-04 | inquiry_available false until all source-owned gates true. | 02-04 | COVERED | Support smoke uses published eligible service plus complete support record. |
| CONTEXT | D-05 | Public outputs degrade together. | 02-03, 02-04 | COVERED | E2E/copy/source scans and deploy support smoke. |
| CONTEXT | D-06 | Suppression disables new public inquiry entry. | 02-03 | COVERED | E2E state coverage includes suppressed/unavailable route states. |
| CONTEXT | D-07 | Small route-facing inquiry interface. | 02-02 | COVERED | Adds only markCurrentOwnerInquiryReadServer to expose existing mark-read seam. |
| CONTEXT | D-08 | Complexity inside modules, not routes. | 02-02 | COVERED | Dispatch binding, CSRF decisions, audit/funnel reconstruction remain module/Convex owned. |
| CONTEXT | D-09 | No generic messaging platform seam. | 02-02 | COVERED | Uses inquiry module plus existing notificationOutbox only. |
| CONTEXT | D-10 | Convex source of truth and no browser authority. | 02-02 | COVERED | Owner/operator authority remains Clerk plus source-owned rows. |
| CONTEXT | D-11 | Minimum state machines. | 02-02 | COVERED | Adds dispatch binding and operation reconstruction to existing state machines. |
| CONTEXT | D-12 | Owner inbox owner-only by default. | 02-02, 02-03 | COVERED | Tests include revoked/wrong-owner denial and no cross-owner leakage. |
| CONTEXT | D-13 | Resend + Novu email-only stack. | 02-02, 02-04 | COVERED | Dispatch bindings are providerFamily resend/novu only. |
| CONTEXT | D-14 | Provider setup and duplicate/idempotency handling. | 02-02, 02-04 | COVERED | Binding rules and smoke envs cover Resend/Novu refs. |
| CONTEXT | D-15 | Dispatch contract states and readbacks. | 02-02 | COVERED | Dispatch rows bind provider refs, retry/no-repair, held webhook states. |
| CONTEXT | D-16 | Notification is never message truth. | 02-02 | COVERED | Webhook/provider events update notification readback only. |
| CONTEXT | D-17 | Private content boundary. | 02-02, 02-03 | COVERED | Audit/funnel/smoke evidence uses hashes/redacted payloads. |
| CONTEXT | D-18 | Public copy must not overclaim. | 02-03, 02-04 | COVERED | E2E/copy/smoke checks keep copy inside Phase 2 truth. |
| CONTEXT | Deferred Ideas | AI replies, booking, payments, protected actions, request market, hosted agents, marketplace inboxes, multi-channel notifications. | none | EXCLUDED | Deferred items are not planned as work. |

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Bind inquiry notifications to notification outbox dispatches and reconstruction</name>
  <read_first>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md</item>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-EXECUTION-EVIDENCE.md</item>
    <item>src/modules/inquiries/internal/commands.ts</item>
    <item>src/modules/inquiries/internal/schema.ts</item>
    <item>src/modules/inquiries/public.ts</item>
    <item>src/modules/notification-outbox/internal/commands.ts</item>
    <item>src/modules/notification-outbox/internal/schema.ts</item>
    <item>src/modules/notification-outbox/public.ts</item>
    <item>src/modules/observability/public.ts</item>
    <item>src/modules/observability/internal/audit.ts</item>
    <item>src/modules/observability/internal/funnel.ts</item>
    <item>src/modules/observability/internal/operation-keys.ts</item>
    <item>convex/inquiries.ts</item>
    <item>convex/notificationOutbox.ts</item>
    <item>tests/unit/inquiries/inquiry-flow.test.ts</item>
    <item>tests/unit/convex/inquiries-runtime.test.ts</item>
    <item>tests/unit/notification-outbox/readback.test.ts</item>
    <item>tests/unit/convex/notification-outbox-runtime.test.ts</item>
  </read_first>
  <files>
    <item>src/modules/inquiries/internal/commands.ts</item>
    <item>src/modules/inquiries/internal/schema.ts</item>
    <item>src/modules/inquiries/public.ts</item>
    <item>src/modules/notification-outbox/internal/commands.ts</item>
    <item>src/modules/notification-outbox/internal/schema.ts</item>
    <item>src/modules/notification-outbox/public.ts</item>
    <item>src/modules/observability/public.ts</item>
    <item>src/modules/observability/internal/audit.ts</item>
    <item>src/modules/observability/internal/funnel.ts</item>
    <item>src/modules/observability/internal/operation-keys.ts</item>
    <item>convex/inquiries.ts</item>
    <item>convex/notificationOutbox.ts</item>
    <item>tests/unit/inquiries/inquiry-flow.test.ts</item>
    <item>tests/unit/convex/inquiries-runtime.test.ts</item>
    <item>tests/unit/notification-outbox/readback.test.ts</item>
    <item>tests/unit/convex/notification-outbox-runtime.test.ts</item>
  </files>
  <behavior>
    - Public inquiry submit creates durable inquiry thread/message/inquiryNotification plus owner notificationOutbox dispatch rows for `resend` and `novu` provider families, per D-13 through D-16.
    - Owner reply creates durable owner message/inquiryNotification plus customer dispatch/readback or an explicitly held customer-delivery readback when no deliverable customer channel exists; it must not invent provider proof.
    - Inquiry notification readbacks expose dispatch IDs/statuses as source bindings for operator/provider smoke, while public customer receipts expose only safe saved-message and delivery labels.
    - Resend webhooks bind by explicit AE dispatch ID, provider logical object key, stored Resend message ID, or provider idempotency key; Novu readback binds by transaction/workflow/message refs where available.
    - Verified provider events that cannot bind to a dispatch remain `notification_webhook_held` with operator reconstruction; they do not mutate inquiry thread/message rows.
  </behavior>
  <action>
    Implement the source bridge per D-07, D-08, D-11, D-15, and D-16. Extend inquiry notification schema/readbacks with dispatch-binding fields that connect each inquiry notification to one or more `notificationDispatches` without leaking provider payloads. Update inquiry submit and owner reply command results so Convex can derive deterministic outbox enqueue commands from the inquiry effect, using stable operation keys and payload hashes based on the inquiry notification/message refs.

    In `convex/inquiries.ts`, persist inquiry rows and matching notificationOutbox rows in the same mutation execution after a successful submit or reply. Reuse `enqueueInquiryNotification` from the notification outbox module; do not duplicate dispatch logic inside inquiry code. Keep same-key replay idempotent: replayed inquiry operations must return the original thread/message/inquiryNotification/dispatch refs rather than enqueueing additional dispatches.

    In `convex/notificationOutbox.ts`, add shared reconstruction writes for enqueue, dispatch, webhook, retry, and no-repair operations. Write `operationKeys` with effect refs to dispatch, attempt, webhook, inquiry thread, and inquiry message IDs. Write audit events for queued, triggered/sent, failed/provider missing/orchestrator missing, webhook received/duplicate/rejected/held, retry scheduled, and no-repair marked states. Write funnel events only for user-journey states `notification_queued`, `notification_delivered`, and `notification_failed`; webhook duplicate/rejected/held is intentionally audit/operation-key/operator readback only.
  </action>
  <acceptance_criteria>
    <item>Verifier gap 1 is closed: tests prove inquiry submit and owner reply create notificationOutbox dispatch rows tied to their inquiryNotifications.</item>
    <item>Provider smoke IDs can be selected from source-owned dispatch bindings that originate from an inquiry-created notification, not from manually fabricated dispatch records.</item>
    <item>Verifier gap 3 is closed: Resend webhook readback binds to an existing dispatch when source refs match, and otherwise records `notification_webhook_held` with operator next action and no inquiry/message mutation.</item>
    <item>Verifier gap 4 is closed: notification enqueue/dispatch/webhook/retry/no-repair operations write shared audit and operation-key reconstruction; funnel scope is exact and tested.</item>
    <item>Provider success/failure, duplicate event, unbound event, retry exhaustion, and no-repair never create, delete, or downgrade inquiry thread/message truth.</item>
    <item>Redaction tests prove dispatch bindings expose AE dispatch IDs, provider-safe IDs, hashes, statuses, and operator next action only; raw owner/customer contact, message body, provider payload, secrets, and raw errors stay private.</item>
  </acceptance_criteria>
  <verify>
    <automated>npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts tests/unit/convex/inquiries-runtime.test.ts tests/unit/notification-outbox/readback.test.ts tests/unit/convex/notification-outbox-runtime.test.ts tests/unit/observability/operation-keys.test.ts tests/unit/observability/funnel.test.ts tests/unit/observability/audit-redaction.test.ts</automated>
    <automated>npm run typecheck</automated>
    <automated>npm run check:convex-codegen</automated>
  </verify>
  <done>
    <criterion>Every inquiry-created notification has a reconstructable outbox dispatch binding or an explicit held/no-delivery readback with tests proving message truth is unchanged.</criterion>
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire owner mark-read and CSRF/Origin admission for Phase 2 browser mutations</name>
  <read_first>
    <item>.planning/phases/02-human-inquiry-owner-inbox/02-VERIFICATION.md</item>
    <item>src/modules/security/public.ts</item>
    <item>convex/business.ts</item>
    <item>convex/catalog.ts</item>
    <item>convex/observability.ts</item>
    <item>src/modules/inquiries/inquiry.functions.ts</item>
    <item>src/routes/$slug.inquiry.tsx</item>
    <item>src/routes/owner.inquiries.$threadId.tsx</item>
    <item>convex/inquiries.ts</item>
    <item>convex/notificationOutbox.ts</item>
    <item>tests/unit/security/csrf-rate-limit.test.ts</item>
    <item>tests/unit/server/server-seams.test.ts</item>
    <item>tests/unit/convex/inquiries-runtime.test.ts</item>
    <item>tests/unit/convex/notification-outbox-runtime.test.ts</item>
  </read_first>
  <files>
    <item>src/modules/inquiries/inquiry.functions.ts</item>
    <item>src/routes/$slug.inquiry.tsx</item>
    <item>src/routes/owner.inquiries.$threadId.tsx</item>
    <item>convex/inquiries.ts</item>
    <item>convex/notificationOutbox.ts</item>
    <item>tests/unit/server/server-seams.test.ts</item>
    <item>tests/unit/convex/inquiries-runtime.test.ts</item>
    <item>tests/unit/convex/notification-outbox-runtime.test.ts</item>
    <item>tests/unit/security/csrf-rate-limit.test.ts</item>
  </files>
  <behavior>
    - Browser mutation paths reject missing CSRF evidence and foreign Origin before domain side effects.
    - Same-site Origin and matching CSRF token/cookie modes reuse the existing `assertCsrf` semantics from Phase 1.
    - Owner thread route exposes a POST-backed mark-read flow so owner read state is reachable from the route, not only from direct Convex tests.
    - CSRF rejection returns typed errors and writes no inquiry, notification, retry, or no-repair effects.
  </behavior>
  <action>
    Reuse the Phase 1 `assertCsrf` pattern from `convex/business.ts`, `convex/catalog.ts`, and `convex/observability.ts`. Add optional `csrfToken`, `csrfCookie`, and `origin` args plus a shared `sourceAllowedOrigins()` helper to the Convex mutations for `submitPublicInquiry`, `markCurrentOwnerInquiryRead`, `replyToCurrentOwnerInquiry`, `closeCurrentOwnerInquiry`, `retryNotificationDispatchAsOperator`, and `markNotificationDispatchNoRepairAsOperator`. Return typed rejection codes for inquiry and notification CSRF failures before loading or persisting source effects.

    In `src/modules/inquiries/inquiry.functions.ts`, add `markCurrentOwnerInquiryReadServer` and route-through-source helpers that pass same-site Origin/CSRF evidence to Convex. Extend existing submit/reply/close server functions with the same admission data. Keep local E2E bypass command-scoped through `VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true`; do not write fake secrets or permanent bypass config.

    In `src/routes/owner.inquiries.$threadId.tsx`, add an explicit mark-read control or form path for unread threads that calls `markCurrentOwnerInquiryReadServer` and updates the visible thread status/result message. Do not mutate read state from a GET loader. Keep owner authority source-owned and server-derived per D-10 and D-12.
  </action>
  <acceptance_criteria>
    <item>Verifier gap 2 is closed: owner mark-read is callable through `src/modules/inquiries/inquiry.functions.ts` and reachable from `src/routes/owner.inquiries.$threadId.tsx`.</item>
    <item>Verifier gap 5 is closed: public submit, mark-read, reply, close, retry, and no-repair each reject missing CSRF evidence and foreign Origin before side effects.</item>
    <item>Tests prove same-site Origin acceptance and matching token/cookie acceptance for every Phase 2 browser mutation path.</item>
    <item>CSRF rejection paths do not create inquiry threads/messages/notifications, notification dispatches, audit/funnel events, operation keys, retry records, or no-repair records.</item>
    <item>Wrong-owner, revoked-owner, and missing-auth paths still fail closed after CSRF admission and do not expose cross-owner existence.</item>
  </acceptance_criteria>
  <verify>
    <automated>npm run test:unit -- tests/unit/security/csrf-rate-limit.test.ts tests/unit/server/server-seams.test.ts tests/unit/convex/inquiries-runtime.test.ts tests/unit/convex/notification-outbox-runtime.test.ts</automated>
    <automated>npm run test:integration</automated>
    <automated>npm run typecheck</automated>
  </verify>
  <done>
    <criterion>All Phase 2 browser mutations have source-owned CSRF/Origin tests, and owner mark-read is exercised through the server/route flow.</criterion>
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|---|---|
| browser -> TanStack server functions | Public inquiry and owner/operator mutation requests cross from untrusted browser input into server-side Convex calls. |
| server functions -> Convex mutations | Server code forwards mutation args, CSRF/Origin evidence, and source IDs to Convex source-of-truth functions. |
| provider webhook -> notificationOutbox | Resend/Novu readback data crosses from provider-originated payloads into source-owned notification state. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|---|---|---|---|---|---|
| T-02-02-01 | Spoofing | owner mark-read/reply/close mutation flow | high | mitigate | Derive owner authority only from Clerk identity plus source-owned owner rows; tests cover wrong/revoked owner denial. |
| T-02-02-02 | Tampering | browser mutation args | high | mitigate | Add `assertCsrf` Origin/token checks before source side effects for submit, mark-read, reply, close, retry, and no-repair. |
| T-02-02-03 | Repudiation | notification operations | medium | mitigate | Write operation keys and audit events for enqueue, dispatch, webhook, retry, and no-repair with correlation/effect refs. |
| T-02-02-04 | Information Disclosure | notification dispatch/readback payloads | high | mitigate | Store only redacted payloads, hashes, safe provider refs, dispatch IDs, statuses, and operator next action. |
| T-02-02-05 | Elevation of Privilege | retry/no-repair controls | high | mitigate | Require owner_admin or explicit source-owned operator authority after CSRF admission. |
| T-02-02-SC | Tampering | npm installs | high | mitigate | No package installs in this plan. If an executor adds one, stop for package legitimacy audit before install. |
</threat_model>

<verification>
Run source gates after both tasks:
<automated>npm run typecheck</automated>
<automated>npm run check:convex-codegen</automated>
<automated>npm run test:unit -- tests/unit/inquiries/inquiry-flow.test.ts tests/unit/convex/inquiries-runtime.test.ts tests/unit/notification-outbox/readback.test.ts tests/unit/convex/notification-outbox-runtime.test.ts tests/unit/server/server-seams.test.ts tests/unit/security/csrf-rate-limit.test.ts</automated>
<automated>npm run test:integration</automated>
<automated>npm run test:imports</automated>
<automated>npm run test:source-mining</automated>
<automated>npm run test:copy</automated>
</verification>

<success_criteria>
Phase 2 source closeout blockers are closed when inquiry-created notifications have dispatch bindings, provider webhook readback binds or is held with operator reconstruction, notification operations write shared audit/operation reconstruction, owner mark-read is routed, and every browser mutation has CSRF/Origin branch tests.
</success_criteria>

## Artifacts this phase produces

- `InquiryNotificationDispatchBinding` or equivalent exported dispatch-binding shape in `src/modules/inquiries/internal/schema.ts`.
- Inquiry notification fields for `dispatchIds`, `providerFamilies`, `dispatchStatuses`, and safe dispatch readback metadata.
- Convex persistence path from `inquiryNotifications` to `notificationDispatches`.
- Shared audit/operation-key rows for notification enqueue/dispatch/webhook/retry/no-repair.
- Funnel rows for `notification_queued`, `notification_delivered`, and `notification_failed`.
- `markCurrentOwnerInquiryReadServer` in `src/modules/inquiries/inquiry.functions.ts`.
- Typed CSRF rejection codes for Phase 2 inquiry and notification mutations.

<output>
Create `.planning/phases/02-human-inquiry-owner-inbox/02-02-SUMMARY.md` when done. Do not create Phase 2 closeout SUMMARY/UAT artifacts from this plan.
</output>

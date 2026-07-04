---
phase: 02
plan: 01
type: execution
slug: human-inquiry-owner-inbox-production
status: ready-for-execution-after-phase-1-closeout
wave: 1
autonomous: true
depends_on:
  - .planning/phases/01-ten-star-spine-foundation/01-09-deploy-readback-closeout-PLAN.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-CONTEXT.md
  - .planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md
  - .planning/SECURITY-SPEC.md
  - .planning/GTM-READINESS.md
requirements: [R1, R2, R3, R4, R5, R6, R7, R8]
review_findings_addressed: [H2, H3, H6, H7, H8, M1, M10, M12]
files_modified:
  - .env.example
  - convex/schema.ts
  - convex/observability.ts
  - convex/inquiries.ts
  - convex/notificationOutbox.ts
  - src/modules/common/ids.ts
  - src/modules/observability/public.ts
  - src/modules/observability/internal/schema.ts
  - src/modules/observability/internal/audit.ts
  - src/modules/observability/internal/funnel.ts
  - src/modules/observability/internal/operation-keys.ts
  - src/modules/observability/internal/operator-controls.ts
  - src/modules/inquiry/public.ts
  - src/modules/inquiry/internal/schema.ts
  - src/modules/inquiry/internal/eligibility.ts
  - src/modules/inquiry/internal/commands.ts
  - src/modules/inquiry/internal/privacy.ts
  - src/modules/inquiry/internal/projections.ts
  - src/modules/inquiry/internal/abuse.ts
  - src/modules/notificationOutbox/public.ts
  - src/modules/notificationOutbox/internal/schema.ts
  - src/modules/notificationOutbox/internal/dispatch.ts
  - src/modules/notificationOutbox/internal/webhooks.ts
  - src/modules/notificationOutbox/internal/readback.ts
  - src/modules/notificationOutbox/internal/privacy.ts
  - src/lib/ui/status-presentation.ts
  - src/lib/ui/copy.ts
  - src/lib/ui/contract-scans.ts
  - src/routes/$slug.tsx
  - src/routes/$slug.inquiry.tsx
  - src/routes/owner.inquiries.tsx
  - src/routes/owner.inquiries.$threadId.tsx
  - src/routes/admin.inquiries.tsx
  - src/routes/privacy.remove-business.tsx
  - tests/types/domain-contracts.test.ts
  - tests/unit/observability/operation-keys.test.ts
  - tests/unit/observability/funnel.test.ts
  - tests/unit/observability/audit-redaction.test.ts
  - tests/unit/observability/operator-controls.test.ts
  - tests/unit/ui-status-presentation.test.ts
  - tests/unit/catalog/public-catalog-dto.test.ts
  - tests/unit/seo-json-ld.test.ts
  - tests/unit/inquiry/inquiry-domain.test.ts
  - tests/unit/inquiry/inquiry-privacy.test.ts
  - tests/unit/notification-outbox/readback.test.ts
  - tests/unit/notification-outbox/webhooks.test.ts
  - tests/integration/inquiry-owner-inbox.test.ts
  - tests/e2e/public-owner-ui.spec.ts
  - tests/e2e/a11y/public-owner-a11y.spec.ts
  - tests/copy/phase1-banned-copy.test.ts
  - tests/copy/claims-register.test.ts
  - tests/seo/public-business-seo.test.ts
  - tests/ui-contract/status-copy.test.ts
  - tests/imports/route-boundary.test.ts
  - tests/imports/private-imports.test.ts
  - tests/imports/source-mining.test.ts
must_haves:
  truths:
    - statement: P2 ships one human inquiry to owner reply or close loop before any AI, booking, payment, or marketplace surface.
      status: resolved
      verification: Objective, non-goals, tasks P2-01 through P2-07, and closeout criteria keep the loop human-only and source-owned.
    - statement: P2 extends the existing observability substrate for inquiry, notification, operator control, and funnel events.
      status: resolved
      verification: P2-01 names the exact audit events, target types, controls, and canonical funnel events.
    - statement: Provider webhook readback is evidence only; it cannot create, delete, or downgrade inquiry/message truth.
      status: resolved
      verification: P2-03 acceptance criteria require duplicate/conflict handling and no inquiry/message mutation from provider outcomes.
  prohibitions:
    - statement: P2 must not add AI replies, booking, quote acceptance, payments, protected actions, request market, attachments, or multi-channel messaging.
      status: resolved
      verification: P2 non-goals and copy-scan fixtures keep future claims out of runtime and docs.
    - statement: P2 must not expose raw inquiry, owner/contact, provider, secret, or deleted private evidence through public projections or logs.
      status: resolved
      verification: P2-04 and P2-07 require privacy, retention, export/delete, and public/private boundary tests.
  artifacts:
    - path: src/modules/observability/public.ts
      provides: Shared public observability seam extended for P2 events and controls.
    - path: .planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md
      provides: Source-owned P2 product and boundary requirements that this plan executes.
  key_links:
    - from: .planning/SECURITY-SPEC.md
      to: notification.webhook_held
      via: P2 held webhook state is required by the security event union.
    - from: .planning/GTM-READINESS.md
      to: inquiry_available_seen
      via: P2 funnel events use the canonical GTM event vocabulary.
    - from: .planning/phases/02-human-inquiry-owner-inbox/02-01-human-inquiry-owner-inbox-production-PLAN.md
      to: CSRF/Origin branch
      via: P2 mutation tests must cover browser mutation protections.
created: 2026-06-28
---

# 02-01 — Human Inquiry + Owner Inbox Production Plan

## Objective

Ship one live, source-owned customer inquiry loop: an eligible public service exposes a human inquiry affordance, a customer submits one durable private inquiry, the source-owned owner reads/replies/closes from a private inbox, Resend/Novu dispatch is tracked through an AE notification outbox, operators can reconstruct failures without provider theatre, and public copy stays inside Phase 2 truth.

## Non-goals

No AI/autonomous replies, chat/SSE, booking, scheduling, quote acceptance, protected actions, provider attempts, payments, wallet, paid priority, request market, marketplace inbox, attachments, hosted agents, SDK/CLI/API-key platform, MCP/OpenAPI mutation surface, SMS, WhatsApp, Slack, Teams, RCS, voice, push, PWA offline outbox, or broad notification framework.

## Execution constraints

- This plan is a docs-only execution prompt. Implementers must read the listed files and current official Resend/Novu docs before touching source.
- Phase 1 closeout proof must be current before execution starts; if the runtime still lacks source-owned claim/publish/catalog/discovery/admin substrate, stop.
- Target the current TanStack Start `src/routes/*`, Convex, and `src/modules/*/public.ts` structure only. Do not write `apps/web/*`.
- Use Resend for email delivery and Novu for workflow/orchestration/readback behind AE state. If current provider docs invalidate signed webhook or idempotency assumptions, record a blocker instead of starting a provider bake-off.
- Keep owner inbox owner-only unless a source-owned manager/delegate access seam and denial tests are added in this phase.
- Owners get delivery readback. Retry and no-repair controls require `owner_admin` or explicit source-owned operator permission per `SECURITY-SPEC.md`.

  <task id="P2-01" title="Shared substrate repair for P2 observability and controls">
    <name>Shared substrate repair for P2 observability and controls</name>
    <read_first>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md</item>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-CONTEXT.md</item>
      <item>.planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md</item>
      <item>.planning/SECURITY-SPEC.md</item>
      <item>.planning/GTM-READINESS.md</item>
      <item>src/modules/observability/public.ts</item>
      <item>src/modules/observability/internal/schema.ts</item>
      <item>src/modules/observability/internal/audit.ts</item>
      <item>src/modules/observability/internal/funnel.ts</item>
      <item>src/modules/observability/internal/operation-keys.ts</item>
      <item>src/modules/observability/internal/operator-controls.ts</item>
      <item>convex/schema.ts</item>
      <item>convex/observability.ts</item>
      <item>tests/unit/observability/operation-keys.test.ts</item>
      <item>tests/unit/observability/funnel.test.ts</item>
      <item>tests/unit/observability/audit-redaction.test.ts</item>
      <item>tests/unit/observability/operator-controls.test.ts</item>
      <item>tests/types/domain-contracts.test.ts</item>
    </read_first>
    <files>
      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>
    </files>
    <action>
      Extend the existing observability substrate instead of creating a parallel inquiry log. Update `AuditEventTypeValues`, `AuditTargetTypeValues`, `stateChangingEvents`, `OperatorControlKeyValues`, `FunnelEventTypeValues`, operation-key records, Convex observability schema, and readbacks for the P2 events and controls used by this phase. Required P2 audit events are `inquiry.submitted`, `inquiry.rejected`, `inquiry.rate_limited`, `inquiry.viewed`, `inquiry.read_marked`, `inquiry.replied`, `inquiry.closed`, `notification.queued`, `notification.triggered`, `notification.sent`, `notification.delivered`, `notification.bounced`, `notification.complained`, `notification.delivery_delayed`, `notification.failed`, `notification.suppressed`, `notification.retry_scheduled`, `notification.retry_attempted`, `notification.retry_exhausted`, `notification.no_repair_marked`, `notification.webhook_received`, `notification.webhook_duplicate`, `notification.webhook_rejected`, and `notification.webhook_held`. Required P2 target types are `inquiry_thread`, `inquiry_message`, `notification_dispatch`, `notification_webhook_event`, and `capability_launch_support_record`. Required controls are `inquiries_enabled`, `inquiry_owner_replies_enabled`, `notification_dispatch_enabled`, and `notification_webhooks_enabled`. Required funnel events are `inquiry_available_seen`, `inquiry_started`, `inquiry_submitted`, `inquiry_rejected`, `owner_inbox_viewed`, `owner_inquiry_read`, `owner_inquiry_replied`, `inquiry_closed`, `notification_queued`, `notification_delivered`, and `notification_failed`. Extend operation keys with `operationScope`, body/request hash, correlation ID, same-key/same-body replay, same-key/different-body conflict, stale retry state, and typed replay result. Reuse `SourceHash` for inquiry body/contact fingerprints, outbox payload hashes, provider readback hashes, redacted audit payloads, and support-record evidence hashes.
    </action>
    <acceptance_criteria>
      <item>H2 is closed: one audit/control/funnel union can represent every P2 event/control named in this task, and no P2 task writes a second log system.</item>
      <item>H8 is closed at the substrate level: `notification.webhook_held` exists, is audit-valid, and has an operator-held readback state for signed provider events that cannot bind to a known dispatch/message.</item>
      <item>`src/modules/observability/public.ts` exports the new literal values as narrow const unions, not broad `string` types.</item>
      <item>Convex observability tables/indexes can persist operation scope, correlation ID, request/body hash, payload hash, retry/no-repair state, held webhook refs, and support-launch records without raw private payloads.</item>
      <item>Operation-key tests prove same key plus same body replays, same key plus changed body rejects as duplicate conflict, stale in-progress returns retryable state, and the replay result includes original effect refs.</item>
      <item>Audit/redaction tests prove inquiry body, claimant contact, owner notes, provider payloads, webhook secrets, and raw provider errors cannot enter audit/log payloads unredacted.</item>
      <item>Operator-control tests prove disabled `inquiries_enabled` blocks new public inquiry entry, disabled `inquiry_owner_replies_enabled` blocks new replies, disabled `notification_dispatch_enabled` blocks new dispatch/manual retry, and disabled `notification_webhooks_enabled` still permits signature rejection/holding audit.</item>
    </acceptance_criteria>
    <verify>
      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>
    </verify>
    <done>
      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>
    </done>
  </task>

  <task id="P2-02" title="Inquiry domain, source-owned owner authority, and private state">

    <name>Inquiry domain, source-owned owner authority, and private state</name>
    <read_first>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md</item>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-CONTEXT.md</item>
      <item>.planning/SECURITY-SPEC.md</item>
      <item>.planning/phases/01-ten-star-spine-foundation/01-SPEC.md</item>
      <item>.planning/phases/01-ten-star-spine-foundation/01-CONTEXT.md</item>
      <item>src/modules/common/ids.ts</item>
      <item>src/modules/business/public.ts</item>
      <item>src/modules/catalog/public.ts</item>
      <item>src/modules/security/public.ts</item>
      <item>src/modules/observability/public.ts</item>
      <item>convex/schema.ts</item>
      <item>convex/business.ts</item>
      <item>convex/catalog.ts</item>
      <item>convex/security.ts</item>
      <item>tests/unit/catalog/public-catalog-dto.test.ts</item>
      <item>tests/unit/business/suppression.test.ts</item>
      <item>tests/unit/security/admin-authority.test.ts</item>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add the `src/modules/inquiry/public.ts` seam with route-facing functions `submitInquiry`, `listOwnerInbox`, `readOwnerInquiry`, `markInquiryRead`, `replyToInquiry`, `closeInquiry`, `readInquiryDeliveryReadback`, `requestInquiryExport`, and `deleteInquiryPrivateContent`. Add branded IDs `InquiryThreadId`, `InquiryMessageId`, `NotificationDispatchId`, `NotificationWebhookEventId`, and `CapabilityLaunchSupportRecordId` only if the phase needs them. Add Convex inquiry state through `src/modules/inquiry/internal/schema.ts` and `convex/inquiries.ts`: `inquiryThreads`, `inquiryMessages`, `inquiryReadStates`, `inquiryAbuseBuckets`, and `inquiryPrivacyTombstones`. Implement source-owned eligibility so `inquiry_available` is true only when published non-suppressed business/service, contact or no-contact policy, consent, owner handling readiness, abuse readiness, inquiry module readiness, and notification readback readiness are all true. Implement typed failures `ineligible_service`, `suppressed_target`, `inquiry_not_ready`, `invalid_contact`, `invalid_body`, `rate_limited`, `duplicate_replay`, `duplicate_conflict`, `wrong_owner`, `not_found`, `terminal_thread`, `stale_version`, `owner_replies_disabled`, and `privacy_deleted`. Owner access must derive from Clerk/Convex principal plus source-owned owner membership; browser-supplied owner, admin, business-owner, manager, or delegate IDs are ignored or rejected.
    </action>
    <acceptance_criteria>
      <item>Valid `submitInquiry` persists exactly one thread, one first message, one audit event, one funnel event, one operation-key result, and one notification outbox enqueue request in one logical operation.</item>
      <item>Ineligible, suppressed, not-ready, malformed contact, empty body, too-long body, rate-limited, duplicate replay, and duplicate conflict paths return typed failures and do not create public projections.</item>
      <item>Owner inbox list/detail exposes only owner-authorized inquiry projections with stable equal-timestamp ordering, `Unread`, `Needs reply`, and `Resolved` buckets, and empty/sparse/populated readbacks.</item>
      <item>Wrong-owner and revoked-owner reads/replies fail closed with not-found by default unless legitimate object context allows forbidden; tests prove no cross-owner existence leakage.</item>
      <item>Owner reply, mark-read, and close transitions require source-owned owner access, non-terminal thread state, idempotency key, correlation ID, version or source hash, length-capped non-empty content where applicable, and audit events.</item>
      <item>Stale version, terminal thread, duplicate-different-body, empty reply, too-long reply, wrong owner, and disabled owner-reply control paths are covered by typed tests.</item>
      <item>Public catalog, registry, API, UCP, llms, sitemap, SEO schema, logs, and route loaders expose only safe inquiry availability/status fields, never raw inquiry content or contact fields.</item>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P2-03" title="Resend/Novu notification outbox, webhook readback, retry authority">

    <name>Resend/Novu notification outbox, webhook readback, retry authority</name>
    <read_first>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-CONTEXT.md</item>
      <item>.planning/SECURITY-SPEC.md</item>
      <item>.planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md</item>
      <item>../Agentic-Economy-Backup/convex/claimEmail.ts</item>
      <item>../Agentic-Economy-Backup/src/lib/notifications/novuClient.ts</item>
      <item>../Agentic-Economy-Backup/src/lib/notifications/novu/workflows.ts</item>
      <item>../Agentic-Economy-Backup/src/lib/notifications/novu/delivery.ts</item>
      <item>../Agentic-Economy-Backup/src/lib/notifications/novu/webhooks.ts</item>
      <item>https://resend.com/docs/webhooks/introduction</item>
      <item>https://resend.com/docs/dashboard/emails/idempotency-keys</item>
      <item>https://docs.novu.co/api-reference/authentication</item>
      <item>https://docs.novu.co/api-reference/events/trigger-event</item>
      <item>https://docs.novu.co/api-reference/idempotency</item>
      <item>src/modules/security/public.ts</item>
      <item>src/modules/observability/public.ts</item>
      <item>convex/schema.ts</item>
      <item>.env.example</item>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add exactly one AE-owned `notificationOutbox` seam behind source state. Do not add a generic notification platform, channel registry, plugin interface, or multi-channel abstraction. Required route-facing functions are `enqueueInquiryNotification`, `dispatchNotificationOutbox`, `ingestNotificationWebhook`, `readNotificationDispatchReadback`, `retryNotificationDispatch`, and `markNotificationNoRepair`. Required state is `notificationDispatches`, `notificationDispatchAttempts`, and `notificationWebhookEvents` with AE dispatch ID, inquiry thread/message refs, recipient role, provider family `resend` or `novu`, Resend message/event refs, Novu transaction/workflow/message/subscriber refs, provider idempotency key, dispatch status, retry count, retry-after, redacted payload, payload hash, last redacted error, provider missing/orchestrator missing flags, and held/unbound webhook state. Resend webhook admission must preserve raw body until Svix verification with `svix-id`, `svix-timestamp`, `svix-signature`, and `RESEND_WEBHOOK_SECRET`; duplicates dedupe by `svix-id`, logical object key, AE dispatch ID, and payload hash. Novu REST calls use server-only `NOVU_SECRET_KEY`, `transactionId`, and `Idempotency-Key`; public Novu webhooks ship only if current official docs provide a verifiable raw-body signature mechanism for the chosen path, otherwise use authenticated polling/API readback and record the blocker. Add `.env.example` placeholders and classification comments only when code first reads `RESEND_API_KEY`, `RESEND_FROM`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, Novu webhook secret if used, `NOVU_APPLICATION_ID` only for a deliberate client Inbox/readback surface, `NOVU_API_BASE` only for non-default region, and `NOVU_WORKFLOW_*` IDs. Retry/no-repair controls require `owner_admin` or explicit source-owned operator permission; normal owners receive read-only delivery readback.
    </action>
    <acceptance_criteria>
      <item>H3 is closed: normal owner attempts to retry or mark no-repair are denied; `owner_admin` or explicit operator permission is required and audited.</item>
      <item>H8 is closed in behavior: a valid signed but unbound Resend/Novu event becomes held-for-operator readback plus `notification.webhook_held` audit, and it does not mutate inquiry/message truth.</item>
      <item>Provider-missing, orchestrator-missing, queued, triggered, sent, delivered, bounced, complained, delivery-delayed, failed, suppressed, retry-scheduled, retry-attempted, retry-exhausted, and no-repair states are queryable through owner/admin/operator readback.</item>
      <item>Invalid, missing, expired, or malformed provider signatures are rejected before provider data is admitted and record only redacted rejection metadata.</item>
      <item>Duplicate provider event with the same payload hash returns the stored result; same provider key with a different payload hash is held for operator.</item>
      <item>Notification success, failure, duplicate, or unbound webhook never creates, deletes, or downgrades `inquiryThreads` or `inquiryMessages`.</item>
      <item>Server secrets have no `VITE_` prefix, are absent from logs/audit/public docs, and `.env.example` contains empty placeholders with secret/public-safe classification comments only for env vars actually read by source; `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NOVU_SECRET_KEY`, and any Novu webhook secret have named owners, rotation paths, local/dev/prod setup notes, and deploy/readback smoke before P2 closeout.</item>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P2-04" title="Privacy, retention, export, delete, and email reply posture">

    <name>Privacy, retention, export, delete, and email reply posture</name>
    <read_first>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md</item>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md</item>
      <item>.planning/SECURITY-SPEC.md</item>
      <item>src/routes/privacy.remove-business.tsx</item>
      <item>src/modules/observability/public.ts</item>
      <item>tests/unit/observability/audit-redaction.test.ts</item>
      <item>tests/imports/private-imports.test.ts</item>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Define P2 retention before raw private evidence exists. Inquiry body/contact and owner replies are `private_customer_owner_message` data; raw content is readable only through private owner/admin projections and export/delete flows. Notification payloads and provider readbacks are `operational_provider_evidence`; raw webhook bodies are discarded after signature verification, hashing, and normalization unless an explicit private evidence ref with TTL is created. Add export/delete/tombstone behavior through `requestInquiryExport`, `deleteInquiryPrivateContent`, `readInquiryPrivacyTombstone`, and privacy-safe support readbacks. Deletion removes or redacts raw inquiry body, contact, owner reply, owner notes, raw provider payload refs, and raw errors while preserving lawful audit hashes, reason codes, operation refs, redacted payload summaries, and tombstone metadata for reconstruction. Define raw-address visibility so owners can see customer-provided contact details only in private inquiry context; public/customer receipt gets a customer-safe support token, not provider refs or owner-private IDs. Define reply-to behavior, bounce/complaint suppression, transactional/consent rationale, unsubscribe handling when applicable, and complaint handling for claimant delivery failures or suppression.
    </action>
    <acceptance_criteria>
      <item>H6 and M1 are closed: the phase has source-owned retention class, export behavior, delete behavior, tombstone behavior, preserved audit-hash behavior, and private evidence access policy before launch.</item>
      <item>Privacy delete tests prove raw body/contact/reply/provider payload refs disappear from private projections after delete while audit hashes, tombstone reason, event refs, and non-sensitive reconstruction remain.</item>
      <item>Export tests prove only source-authorized owner/admin or verified requester paths can export private inquiry data and that public routes cannot infer deleted content.</item>
      <item>Complaint/bounce handling suppresses future delivery to the affected address or dispatch target while preserving the inquiry/message truth and operator readback.</item>
      <item>Customer-safe receipt/support token never contains raw contact, provider message IDs, Novu transaction IDs, owner IDs, internal business IDs, webhook IDs, or secrets.</item>
      <item>Redaction scans cover inquiry body, claimant contact, owner notes, notification IDs/payloads, provider error text, webhook secrets, and support snippets.</item>
      <item>Private inquiry content remains absent from public catalog, registry, API, UCP, llms, sitemap, SEO schema, logs, and marketing copy before and after deletion.</item>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P2-05" title="UI routes and shared status presentation">

    <name>UI routes and shared status presentation</name>
    <read_first>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md</item>
      <item>.planning/FRONTEND-DESIGN-FRAMEWORK.md</item>
      <item>DESIGN.md</item>
      <item>src/lib/ui/status-presentation.ts</item>
      <item>src/components/ae/status/AeStatusBadge.tsx</item>
      <item>src/components/ae/status/AeCapabilityList.tsx</item>
      <item>src/components/ae/layout/AePublicShell.tsx</item>
      <item>src/components/ae/layout/AeAdminShell.tsx</item>
      <item>src/routes/$slug.tsx</item>
      <item>src/routes/owner.status.tsx</item>
      <item>src/routes/admin.audit-events.tsx</item>
      <item>tests/unit/ui-status-presentation.test.ts</item>
      <item>tests/ui-contract/status-copy.test.ts</item>
      <item>tests/e2e/public-owner-ui.spec.ts</item>
      <item>tests/e2e/a11y/public-owner-a11y.spec.ts</item>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add shared status presentation before route-local UI. Extend `aeStatusValues` and `aeStatusPresentation` with P2 delivery/status values `inquiry_available`, `inquiry_unavailable`, `inquiry_submitted`, `needs_reply`, `resolved`, `triggered`, `delivered`, `bounced`, `complained`, `delivery_delayed`, `provider_missing`, `orchestrator_missing`, `retry_pending`, `retry_exhausted`, `no_repair`, and `held_for_operator`, plus P3-P5 shared future presentation values required by reviews such as `proof_gap`, `dispute_hold`, `action_required`, and `unbound` as inert labels only. Each presentation includes label, tone, description, next action where needed, priority, audience/publicness, and disabled reason when a control is unavailable. Build current routes `src/routes/$slug.tsx`, `src/routes/$slug.inquiry.tsx`, `src/routes/owner.inquiries.tsx`, `src/routes/owner.inquiries.$threadId.tsx`, and `src/routes/admin.inquiries.tsx` using AE shells, `AeStatusBadge`, shared form/list/feedback components, and inquiry module readbacks. Public route copy says `Send a human inquiry` only when source eligibility is true; otherwise it shows unavailable/not-ready/suppressed without a disabled future CTA. Owner/operator routes show read-only delivery readback for normal owners and permission-gated retry/no-repair controls with disabled reasons for non-authorized users.
    </action>
    <acceptance_criteria>
      <item>H7 is closed: P2-P5 expanded statuses do not render as raw provider enums; every added status maps to label, tone, description, priority, publicness/audience, and next action or disabled reason.</item>
      <item>Public service page shows inquiry availability only when source state proves eligibility; ineligible, suppressed, not-ready, and stale states show explicit unavailable copy and no future-surface theatre.</item>
      <item>Inquiry form covers empty, partially filled, invalid contact, invalid body, too-long body, submitting, submitted, duplicate replay, duplicate conflict, rate-limited, abuse blocked, ineligible, suppressed after entry, provider missing, orchestrator missing, and preserved input states.</item>
      <item>Owner inbox/detail covers unauthenticated or denied, empty, sparse, populated, unread, needs-reply, read, reply pending, reply failed, stale version, terminal/closed, close pending, wrong-owner/not-found, long customer text, long names, and redacted metadata states.</item>
      <item>Delivery readback covers queued, triggered, sent, delivered, delayed, bounced, complained, retryable failure, permanent failure, suppressed, provider missing, orchestrator missing, retry pending, retry exhausted, no-repair, webhook duplicate, webhook rejected, and webhook held states.</item>
      <item>Compact 375px and wide proofs cover public inquiry, owner inbox, thread detail, delivery readback, and operator reconstruction surfaces.</item>
      <item>Keyboard-only path covers opening inquiry, filling fields, submitting, focus to errors/receipt, selecting an inbox item, marking read, replying, closing, and reaching retry/no-repair controls only for `owner_admin` or explicit source-owned operator permission; normal owners see read-only delivery readback plus disabled reasons; focus is visible and not color-only.</item>
      <item>No route adds `Messages`, `Chat`, `Developers`, `Payments`, `Actions`, `Marketplace`, or disabled future nav items.</item>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P2-06" title="Copy, claims, and capability launch support record">

    <name>Copy, claims, and capability launch support record</name>
    <read_first>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md</item>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md</item>
      <item>.planning/GTM-READINESS.md</item>
      <item>.planning/phases/02-05-PRODUCTION-MATURITY-REVIEWS.md</item>
      <item>src/lib/ui/copy.ts</item>
      <item>src/lib/ui/contract-scans.ts</item>
      <item>tests/copy/phase1-banned-copy.test.ts</item>
      <item>tests/copy/claims-register.test.ts</item>
      <item>tests/ui-contract/status-copy.test.ts</item>
      <item>tests/imports/source-mining.test.ts</item>
      <item>src/modules/observability/public.ts</item>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add a `capabilityLaunchSupportRecord` source record for Phase 2 before any public inquiry claim can go live. Required fields are capability `human_inquiry_owner_inbox`, primary owner/admin/operator, backup owner/admin/operator, supported stage, supported channels, capacity threshold, backlog age threshold, phase incident counts, support escalation path, claim-disable path, per-channel kill rules, evidence refs, source hash, correlation ID, and last reviewed timestamp. Wire `inquiry_available` and public copy claims to this record plus live source readbacks. Expand copy scans and claims register coverage for route copy, SEO/AEO copy, email/customer receipt copy, owner/operator copy, support snippets, discovery files, and planning-owned launch claims. Allow Phase 2 positive claims only when tied to matching source readbacks; require explicit negative wording for future surfaces. P2 allowed public phrases include `human inquiry`, `owner reply`, `message saved`, `delivery status is tracked separately`, `bookings not live`, `payments not live`, and `automated actions not live`. P2 public/owner copy must not say or imply `chat`, `AI reply`, `agent handled`, `guaranteed response`, `book now`, `quote accepted`, `pay`, `provider dispatched`, `protected action`, `SMS`, `WhatsApp`, `Slack`, `Teams`, `RCS`, `voice`, `push`, `multi-channel`, `marketplace`, `request market`, `hosted agent`, or `developer platform`.
    </action>
    <acceptance_criteria>
      <item>M10 is closed: launch cannot mark `inquiry_available` true unless `capabilityLaunchSupportRecord` has primary and backup owners, supported stage/channels, capacity/backlog thresholds, incident counts, claim-disable path, and kill rules.</item>
      <item>Support-load rollups include notification retry exhausted and notification no-repair signals or source those exact SECURITY-SPEC audit events.</item>
      <item>Copy tests reject guaranteed response, booking, quote acceptance, payment, provider execution, protected action, AI/autonomous reply, chat, request market, hosted agent, marketplace, and multi-channel claims.</item>
      <item>Copy tests prove broad negative words such as `without` or `unless` do not accidentally allow a positive future-capability claim; negation must be tied to the matched capability.</item>
      <item>Claims register ties `human inquiry available` to source-owned eligibility, live inquiry module, owner handling readiness, notification readback readiness, support record, and operator controls.</item>
      <item>Customer/owner/operator copy says notification failure does not lose the saved message and does not imply provider execution, booking, payment, or guaranteed response.</item>
      <item>Source-mining/import scans prove backup notification code was mined for lessons only and no backup path imports ship.</item>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P2-07" title="Tests, smoke evidence, and closeout proof">

    <name>Tests, smoke evidence, and closeout proof</name>
    <read_first>
      <item>package.json</item>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-SPEC.md</item>
      <item>.planning/phases/02-human-inquiry-owner-inbox/02-UI-SPEC.md</item>
      <item>.planning/SECURITY-SPEC.md</item>
      <item>.planning/GTM-READINESS.md</item>
      <item>tests/e2e/public-owner-ui.spec.ts</item>
      <item>tests/e2e/a11y/public-owner-a11y.spec.ts</item>
      <item>tests/copy/claims-register.test.ts</item>
      <item>tests/seo/public-business-seo.test.ts</item>
      <item>tests/imports/private-imports.test.ts</item>
      <item>tests/imports/route-boundary.test.ts</item>
      <item>tests/imports/ts-standards.test.ts</item>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      Add the narrow tests and smoke fixtures that prove the complete P2 loop rather than module plumbing. Required happy path is seeded published eligible service plus customer inquiry plus owner inbox read plus owner reply/close plus Resend/Novu dispatch/readback plus audit/operator reconstruction. Required failure paths are ineligible service, suppressed target, inquiry not ready, invalid contact, invalid body, rate-limited submit, duplicate replay, duplicate conflict, wrong owner, revoked owner, terminal thread, stale version, owner replies disabled, notification provider missing, orchestrator missing, invalid webhook signature, duplicate webhook, signed unbound webhook held for operator, bounced, complained, delayed, retry exhaustion, no-repair, privacy delete, and support-record kill switch. Add smoke evidence instructions for configured Resend/Novu sandbox or live-provider readback with redacted provider refs, timestamp, payload hash, AE dispatch ID, and operator next action. Do not add mocks for provider authority; use source-owned fixtures for unit tests and real/sandbox provider readback for smoke.
    </action>
    <acceptance_criteria>
      <item>Valid submit-to-owner-reply-to-notification-readback-to-operator-reconstruction E2E is covered, including copy that separates saved message truth from delivery state.</item>
      <item>Unit and integration tests cover every typed inquiry failure, owner authorization denial, CSRF/Origin branch for `submitInquiry`, `markInquiryRead`, `replyToInquiry`, `closeInquiry`, `retryNotificationDispatch`, and `markNotificationNoRepair`, idempotency branch, notification webhook branch, retention/delete branch, and support kill branch listed in this task.</item>
      <item>Public/private boundary tests prove raw inquiry body, contact, owner notes, notification IDs/payloads, provider error text, webhook secrets, and deleted private content do not appear in public page, registry, API, UCP, llms, sitemap, SEO schema, logs, copy, or support snippets.</item>
      <item>Rendered UI evidence exists for compact 375px and wide public inquiry, owner inbox, thread detail, delivery readback, and operator reconstruction surfaces.</item>
      <item>Closeout evidence includes one seeded published service, one customer inquiry, one owner reply or close, one notification success or failure readback, privacy-safe funnel events, audit reconstruction, copy scans, source-mining/import scans, and provider/deploy readback smoke.</item>
      <item>M12 is closed: the closeout command block includes `npm run test:types`, `npm run test:ts-standards`, and `npm run test:seo` in addition to the existing P2 commands.</item>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

## Verification

<verification>
  <commands>
    <command>npm run check:convex-codegen</command>
    <command>npm run typecheck</command>
    <command>npm run test:unit</command>
    <command>npm run test:integration</command>
    <command>npm run test:e2e</command>
    <command>npm run test:a11y</command>
    <command>npm run test:types</command>
    <command>npm run test:imports</command>
    <command>npm run test:source-mining</command>
    <command>npm run test:ts-standards</command>
    <command>npm run test:copy</command>
    <command>npm run test:seo</command>
    <command>npm run test:ui-contract</command>
    <command>npm run build</command>
  </commands>
  <provider_smoke>
    A closeout record must include a configured Resend/Novu sandbox or live-provider dispatch/readback with AE dispatch ID, redacted provider refs, timestamp, payload hash, final readback state, and operator next action. If current official Novu docs do not support verifiable public webhooks for the chosen path, the closeout record must name the blocker and show authenticated polling/API readback instead.
  </provider_smoke>
  <deploy_smoke>
    A deployed route smoke must prove public service inquiry availability, inquiry submit, owner inbox/detail, owner reply or close, delivery readback, operator reconstruction, and disabled-control behavior under current env configuration.
  </deploy_smoke>
</verification>

## must_haves.truths

- `edge-R2-boundary-empty-encoding-precision`: Submit acceptance covers target eligibility, empty/invalid input, length caps, redacted encoded contact/text, exact typed failures, duplicate replay/conflict, correlation ID, and rate-limit behavior.
- `edge-R3-adjacency-empty-ordering`: Owner inbox acceptance covers adjacent owner scopes, wrong-owner/revoked-owner denial, empty/sparse/populated buckets, and stable ordering for equal timestamps.
- `edge-R4-empty-encoding`: Owner reply/read/close acceptance covers empty and too-long owner replies, safe content handling, stale versions, terminal state, and duplicate-different-body idempotency.
- `edge-R6-concurrency`: Privacy acceptance covers private/public projection behavior under notification dispatch, suppression, logging, deletion, and public-generation races; provider events never mutate message truth.
- `edge-R7-empty-encoding`: UI acceptance covers empty/loading/error states, long and invalid text, persistent labels, connected errors, focus movement, accessible names, 375px layout, and preserved input after recoverable validation errors.
- `inquiry-availability-truth`: `inquiry_available` appears only when published service eligibility, contact or no-contact policy, consent, inquiry readiness, owner handling readiness, abuse readiness, notification readback readiness, support launch record, and operator controls are true.
- `notification-failure-truth`: Notification failure, duplicate, unbound webhook, retry exhaustion, complaint, bounce, or no-repair never loses or creates inquiry/message truth.
- `retention-truth`: P2 defines retention class, export behavior, delete behavior, tombstone behavior, private evidence access, raw webhook discard behavior, and preserved redacted audit-hash behavior before launch.
- `support-truth`: `capabilityLaunchSupportRecord` exists before positive public inquiry claims and records primary/backup owners, support channels/stage, capacity threshold, backlog age threshold, incidents, claim-disable path, and kill rules.
- `authority-truth`: Retry/no-repair controls require `owner_admin` or explicit source-owned operator permission; normal owners have read-only delivery readback.

## must_haves.prohibitions

- statement: MUST NOT generate or send autonomous, AI-drafted, or agent-authored replies as the owner.
  status: resolved
  verification: Runtime/copy/source scans plus owner-reply E2E require a human owner action and reject AI/autonomous reply surfaces.
- statement: MUST NOT expose private inquiry content, contact data, owner notes, or notification payloads in public catalog, registry, API, UCP, llms, sitemap, SEO/schema, logs, or marketing copy.
  status: resolved
  verification: Projection allowlist, redaction, log, discovery, SEO, copy, privacy-delete, and private-import tests.
- statement: MUST NOT imply booking, payment, provider execution, protected actions, guaranteed response, or marketplace liquidity from an inquiry being available.
  status: resolved
  verification: Copy scans, claims register, UI copy proof, and product review of public/customer/owner/operator strings.
- statement: MUST NOT add multi-channel notification topology before one adapter has source-owned readback and failure handling.
  status: resolved
  verification: Source-mining/import scans reject SMS, WhatsApp, Slack, Teams, RCS, voice, push, channel registries, and provider sprawl; only the AE Resend/Novu outbox ships.
- statement: MUST NOT allow browser-supplied owner IDs, business owner IDs, admin IDs, or route-local membership checks to authorize inbox reads or replies.
  status: resolved
  verification: Wrong-owner, revoked-owner, non-admin, cross-owner leakage, route-boundary, and authority tests.
- statement: MUST NOT let notification success or failure become the source of truth for inquiry/message persistence.
  status: resolved
  verification: Notification failure/readback/webhook tests prove provider events never create, delete, or downgrade inquiry messages.

## Artifacts this phase produces

- New branded ID types in `src/modules/common/ids.ts`: `InquiryThreadId`, `InquiryMessageId`, `NotificationDispatchId`, `NotificationWebhookEventId`, `CapabilityLaunchSupportRecordId`.
- New observability literals: P2 audit events, P2 target types, P2 operator controls, P2 funnel events, and `capabilityLaunchSupportRecord` readback fields listed in task P2-01 and task P2-06.
- New inquiry module files: `src/modules/inquiry/public.ts`, `src/modules/inquiry/internal/schema.ts`, `src/modules/inquiry/internal/eligibility.ts`, `src/modules/inquiry/internal/commands.ts`, `src/modules/inquiry/internal/privacy.ts`, `src/modules/inquiry/internal/projections.ts`, `src/modules/inquiry/internal/abuse.ts`.
- New inquiry route-facing functions: `submitInquiry`, `listOwnerInbox`, `readOwnerInquiry`, `markInquiryRead`, `replyToInquiry`, `closeInquiry`, `readInquiryDeliveryReadback`, `requestInquiryExport`, `deleteInquiryPrivateContent`, `readInquiryPrivacyTombstone`.
- New inquiry state/tables: `inquiryThreads`, `inquiryMessages`, `inquiryReadStates`, `inquiryAbuseBuckets`, `inquiryPrivacyTombstones`.
- New notification outbox module files: `src/modules/notificationOutbox/public.ts`, `src/modules/notificationOutbox/internal/schema.ts`, `src/modules/notificationOutbox/internal/dispatch.ts`, `src/modules/notificationOutbox/internal/webhooks.ts`, `src/modules/notificationOutbox/internal/readback.ts`, `src/modules/notificationOutbox/internal/privacy.ts`.
- New notification route-facing functions: `enqueueInquiryNotification`, `dispatchNotificationOutbox`, `ingestNotificationWebhook`, `readNotificationDispatchReadback`, `retryNotificationDispatch`, `markNotificationNoRepair`.
- New notification state/tables: `notificationDispatches`, `notificationDispatchAttempts`, `notificationWebhookEvents`.
- New or extended status presentation values: `inquiry_available`, `inquiry_unavailable`, `inquiry_submitted`, `needs_reply`, `resolved`, `triggered`, `delivered`, `bounced`, `complained`, `delivery_delayed`, `provider_missing`, `orchestrator_missing`, `retry_pending`, `retry_exhausted`, `no_repair`, `held_for_operator`, `proof_gap`, `dispute_hold`, `action_required`, `unbound`.
- New routes: `src/routes/$slug.inquiry.tsx`, `src/routes/owner.inquiries.tsx`, `src/routes/owner.inquiries.$threadId.tsx`, `src/routes/admin.inquiries.tsx`; extended `src/routes/$slug.tsx` and `src/routes/privacy.remove-business.tsx`.
- New tests: `tests/unit/inquiry/inquiry-domain.test.ts`, `tests/unit/inquiry/inquiry-privacy.test.ts`, `tests/unit/notification-outbox/readback.test.ts`, `tests/unit/notification-outbox/webhooks.test.ts`, `tests/integration/inquiry-owner-inbox.test.ts`, plus extended existing copy, SEO, UI-contract, route-boundary, private-import, source-mining, type, observability, and E2E/a11y tests named in frontmatter.

## Stop conditions

- Phase 1 closeout proof is absent, stale, or source substrate still uses stubs for claim/catalog/discovery/admin authority.
- Current official Resend or Novu docs invalidate the selected webhook, idempotency, authentication, or readback posture.
- Owner authority depends on browser-supplied IDs, route-local membership checks, Clerk org alone, or public route params.
- Private inquiry/contact/owner/provider payload can appear in public projections, logs, SEO/schema, protocol files, copy, or support snippets.
- Notification success/failure, duplicate provider event, or unbound webhook can create, delete, or downgrade inquiry/message state.
- Retry/no-repair can be invoked by a normal owner without `owner_admin` or explicit source-owned operator permission.
- Support launch record or kill rules are missing while public copy claims human inquiry is live.

## Acceptance

Phase 2 is complete only when the customer inquiry to owner read/reply/close to Resend/Novu dispatch/readback to audit/operator reconstruction path is live, source-owned, privacy-safe, support-gated, status-presented, tested with current package scripts, smoke-proven against configured provider readback, and copy-clean without future-surface claims.

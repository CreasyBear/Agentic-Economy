---
phase: "05"
plan: "05-01"
type: execution
slug: autumn-stripe-paid-activation
status: ready_for_execution_after_money_decision_record
wave: 1
autonomous: false
depends_on:
  - .planning/phases/04-owner-pending-protected-actions/04-01-one-owner-approved-protected-action-PLAN.md
  - .planning/phases/05-paid-activation-money-rails/05-SPEC.md
  - .planning/phases/05-paid-activation-money-rails/05-CONTEXT.md
  - .planning/phases/05-paid-activation-money-rails/05-UI-SPEC.md
  - .planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md
  - .planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md
  - .planning/SECURITY-SPEC.md
  - .planning/GTM-READINESS.md
requirements:
  - R1
  - R2
  - R3
  - R4
  - R5
  - R6
  - R7
  - R8
files_modified:
  - .planning/phases/05-paid-activation-money-rails/05-SPEC.md
  - .planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md
  - .planning/SECURITY-SPEC.md
  - .planning/GTM-READINESS.md
  - .env.example
  - convex/schema.ts
  - convex/billing.ts
  - src/modules/common/ids.ts
  - src/modules/observability/public.ts
  - src/modules/observability/internal/schema.ts
  - src/modules/billing/public.ts
  - src/modules/billing/internal/schema.ts
  - src/modules/billing/internal/authority.ts
  - src/modules/billing/internal/provider-readback.ts
  - src/modules/billing/internal/operations.ts
  - src/modules/billing/internal/reconciliation.ts
  - src/modules/billing/internal/projections.ts
  - src/lib/ui/status-presentation.ts
  - src/lib/ui/contract-scans.ts
  - src/components/ae/readback/AeBillingEvidenceChain.tsx
  - src/routes/owner.billing.activate.tsx
  - src/routes/owner.billing.redirecting.tsx
  - src/routes/owner.billing.return.tsx
  - src/routes/owner.billing.cancel.tsx
  - src/routes/owner.billing.tsx
  - src/routes/owner.billing.receipts.$receiptId.tsx
  - src/routes/admin.monetization.tsx
  - src/routes/admin.monetization.$operationId.tsx
  - src/routes/api.billing.autumn-webhook.ts
  - src/routes/api.billing.stripe-webhook.ts
  - tests/unit/billing/rail.test.ts
  - tests/unit/billing/projections.test.ts
  - tests/unit/observability/billing-events.test.ts
  - tests/unit/ui-status-presentation.test.ts
  - tests/integration/billing/autumn-stripe-paid-activation.test.ts
  - tests/integration/billing/webhook-reconciliation.test.ts
  - tests/e2e/paid-activation.spec.ts
  - tests/e2e/a11y/paid-activation.a11y.spec.ts
  - tests/copy/phase1-banned-copy.test.ts
  - tests/copy/claims-register.test.ts
  - tests/fixtures/bad-copy/overclaim.fixture
  - tests/types/billing-projections.test-d.ts
  - tests/seo/paid-activation-claims.test.ts
review_findings:
  covered_here:
    - H1
    - H2
    - H4
    - H5
    - H7
    - H9
    - H11
    - H12
    - M1
    - M2
    - M6
    - M7
    - M8
    - M10
    - M12
    - M13
    - M14
  deferred_to_other_phase_plans:
    - H3
    - H6
    - H8
    - H10
    - M3
    - M4
    - M5
    - M9
    - M11
must_haves:
  truths:
    - statement: P5 ships one Autumn Cloud plus Stripe PSP paid-activation rail selected by a money decision record.
      status: resolved
      verification: Objective, 05-SPEC, 05-MONEY-RAIL-DECISION, and tasks P5-T01 through P5-T08 keep one selected rail.
    - statement: Autumn owns generic billing/product-ops authority while Stripe is PSP evidence underneath unless a later blocker decision selects direct Stripe fallback.
      status: resolved
      verification: P5 spec and plan state Autumn Cloud + Stripe PSP as default and quarantine direct Stripe authority.
    - statement: Paid state changes require source-owned checkout/billing operations, provider evidence, receipt, reconciliation, rollback, and operator readback.
      status: resolved
      verification: P5-T03 through P5-T08 require source operation binding, append-only receipts, redacted provider evidence, and no-repair controls.
  prohibitions:
    - statement: P5 must not add wallet, credits/balance, custody, x402/crypto, Stripe Connect, split payouts, marketplace payout, request-market settlement, direct Stripe subscription authority, or multi-rail picker.
      status: resolved
      verification: P5 non-goals, money-rail quarantine, and copy/source scans reject those surfaces.
    - statement: P5 must not grant paid activation or entitlement from unsigned, unbound, unread, or raw provider webhooks.
      status: resolved
      verification: P5-T06 webhook and reconciliation tests require signature, binding, retrieval, dedupe, admission, invalid signature, unbound object, and direct-webhook-entitlement rejection.
  artifacts:
    - path: .planning/phases/05-paid-activation-money-rails/05-SPEC.md
      provides: P5 Autumn Cloud plus Stripe PSP paid-activation product and boundary requirements.
    - path: .planning/phases/05-paid-activation-money-rails/05-UI-SPEC.md
      provides: P5 owner/admin/operator billing surface contract.
  key_links:
    - from: .planning/SECURITY-SPEC.md
      to: billing.provider_event_held
      via: P5 held provider event is required by the security event union.
    - from: .planning/GTM-READINESS.md
      to: paid_activation_started
      via: P5 funnel events use canonical GTM money-rail event names.
    - from: .planning/phases/05-paid-activation-money-rails/05-SPEC.md
      to: Autumn Cloud + Stripe PSP
      via: P5 spec selects the billing provider posture.
---

# Phase 5 Plan — Autumn Cloud and Stripe PSP Paid Activation

## Objective

Ship one production paid-activation rail: Autumn Cloud is AE's billing and product-ops authority, Stripe is the payment service provider underneath Autumn, and AE owns owner authority, source-owned billing mirrors, receipts, provider readbacks, reconciliation, support records, redaction, and public claims. Direct Stripe subscription authority is allowed only after an evidence-backed Autumn blocker record is written; Connect, x402, wallet, credits, balances, custody, split payouts, request-market settlement, marketplace payout rails, and multi-rail selection stay out of scope.

## Execution boundary

- This plan is ready for execution prep because local/source P1-P4 authority/readback posture exists and `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md` records the selected Autumn Cloud plus Stripe PSP rail. Deployed/provider proof remains a Phase 5 closeout requirement, not a pre-execution claim.
- Phase 5 starts no runtime work from provider screenshots, dashboard state, deployment env vars, or status labels. Proof is source-owned provider readback with timestamp, stable provider refs, payload hash, route/readback evidence, and operator next action.
- Owner checkout and customer portal starts are owner-only. Admin/operator roles may reconcile, disable/rollback, and read support evidence; they do not initiate checkout or customer portal unless a future source-owned billing delegate model is explicitly designed and tested.
- Public projections may expose selected paid activation availability and approved public offer/pricing copy only after evidence. Owner billing status, billing center links, portal links, receipts, invoices, provider refs, reconciliation, and private support evidence are owner/admin/operator-only.
- Sprint hardening added on 2026-06-29: before any active provider-ingest or public-claim work, the executor must preserve the retention/private-evidence rules in `05-MONEY-RAIL-DECISION.md`, store Phase 5 support rows with capability `paid_activation_money_rails`, and keep `npm run test:provider-smoke:autumn-stripe` as the deployed provider/readback smoke gate. This command is expected to fail loudly until real deployed source-owned operation, receipt, provider-event, reconciliation, support/kill-rule, and public-claim evidence exists.

## Review findings covered or explicitly deferred

| Finding | Phase 5 disposition |
|---|---|
| H1 | This file uses real YAML frontmatter, standalone XML `<task>` blocks, per-task read/accept/verify/done blocks, `must_haves`, and artifacts. |
| H4 | P5-T04 keeps checkout and customer portal starts owner-only; admin/operator roles only reconcile, disable/rollback, and read support evidence. |
| H5 | Public projection criteria split selected paid-activation availability and approved public offer/pricing from owner-private billing links/status/receipts/provider refs. |
| H7 | P5-T02 extends shared status presentation before user-facing billing UI. |
| H12 | P5-T01 and `05-MONEY-RAIL-DECISION.md` lock one Autumn Cloud plus Stripe PSP rail; direct Stripe subscription authority requires an evidence-backed Autumn blocker record. |
| M2 | Provider proof must be source-owned provider readback/smoke evidence; env-var presence, dashboard status, return URL arrival, and webhook arrival are not paid-state proof. |
| M8-M9 | P5-T08 expands direct-money and negative-context copy scans before public claims can ship. |
| M10 | P5-T07 requires support owner, capacity threshold, claim-disable path, and kill/rollback evidence. |
| M13-M14 | P5-T01 quarantines Autumn/provider refs and bans usage-credit/balance language outside the approved billing module and decision record. |

  <task id="P5-T01" title="Lock money decision record and rail boundary">
    <name>Lock money decision record and rail boundary</name>
    <read_first>
      <path>.planning/phases/05-paid-activation-money-rails/05-SPEC.md</path>
      <path>.planning/phases/05-paid-activation-money-rails/05-CONTEXT.md</path>
      <path>.planning/phases/05-paid-activation-money-rails/05-UI-SPEC.md</path>
      <path>.planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md</path>
      <path>.planning/SECURITY-SPEC.md</path>
      <path>.planning/GTM-READINESS.md</path>
      <path>.planning/ROADMAP.md</path>
    </read_first>
    <files>
      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>
    </files>
    <action>
      <item>Create `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md` before runtime changes.</item>
      <item>Amend `.planning/phases/05-paid-activation-money-rails/05-SPEC.md` so in-scope rail language says exactly: one Autumn Cloud and Stripe PSP paid-activation rail; direct Stripe subscription authority only after an evidence-backed Autumn blocker record; no other rail may be selected in Phase 5.</item>
      <item>The decision record must name the selected offer/product/pricing object, what paid activation buys, what remains free, subscription or one-time paid-activation posture, AUD/GST/tax/legal/terms/refund/dispute posture, Autumn project/org/environment, Stripe PSP responsibility split under Autumn, provider credential owner and rotation cadence, incident/rollback owner, support owner, sandbox/live-readiness evidence rows, public claim wording allowed after smoke, and rollback/disable plan.</item>
      <item>The decision record must explicitly reject direct Stripe subscription authority unless an Autumn blocker record exists, and must explicitly reject Connect, x402, wallet, credits, balances, custody, split payouts, request-market settlement, marketplace payouts, multi-rail selection, payment handlers, client-created provider values, and direct webhook entitlements.</item>
      <item>The Autumn blocker record, if ever needed, must include official-doc citation, account/provider evidence, blocked Autumn capability, attempted workaround, operational risk, owner approval, and why direct Stripe subscription authority is the smallest safe fallback. It does not approve Connect, x402, wallet, credits, balances, custody, split payouts, request-market settlement, marketplace payouts, or a multi-rail system.</item>
    </action>
    <acceptance_criteria>
      <criterion>`05-MONEY-RAIL-DECISION.md` exists and contains the exact headings `Selected rail`, `Offer and free boundary`, `Subscription or one-time posture`, `Tax legal and refund posture`, `Provider responsibility split`, `Credential owner and rotation`, `Evidence rows`, `Support and rollback`, `Public claims`, and `Rejected rails`.</criterion>
      <criterion>`05-MONEY-RAIL-DECISION.md` contains `Autumn Cloud is the billing/product-ops authority` and `Stripe is PSP underneath Autumn`.</criterion>
      <criterion>`05-MONEY-RAIL-DECISION.md` contains `Direct Stripe subscription authority requires an evidence-backed Autumn blocker record`.</criterion>
      <criterion>`05-MONEY-RAIL-DECISION.md` contains `usage credits and balances are out of scope` and contains no old credit-posture wording.</criterion>
      <criterion>`05-SPEC.md` no longer permits another selected rail through broad decision-record language; any fallback language is limited to direct Stripe subscription authority after an Autumn blocker record.</criterion>
      <criterion>No task, doc, source file, or copy uses env var presence, provider screenshots, provider dashboards, return URL arrival, or webhook arrival as proof of paid state.</criterion>
    </acceptance_criteria>
    <verify>
      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>
    </verify>
    <done>
      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>
    </done>
  </task>

  <task id="P5-T02" title="Extend shared observability, status, and support substrate for billing">

    <name>Extend shared observability, status, and support substrate for billing</name>
    <read_first>
      <path>src/modules/observability/public.ts</path>
      <path>src/modules/observability/internal/schema.ts</path>
      <path>convex/schema.ts</path>
      <path>src/modules/common/ids.ts</path>
      <path>src/lib/ui/status-presentation.ts</path>
      <path>tests/unit/observability/funnel.test.ts</path>
      <path>tests/unit/observability/operator-controls.test.ts</path>
      <path>tests/unit/ui-status-presentation.test.ts</path>
      <path>.planning/SECURITY-SPEC.md</path>
      <path>.planning/GTM-READINESS.md</path>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      <item>Add branded IDs in `src/modules/common/ids.ts`: `BillingOperationId`, `BillingReceiptId`, `BillingProviderEventId`, `BillingReconciliationId`, `BillingOfferId`, and `BillingSupportRecordId`.</item>
      <item>Extend `AuditTargetTypeValues` with `billing_offer`, `billing_operation`, `billing_provider_event`, `billing_receipt`, `billing_reconciliation`, and `billing_support_record`.</item>
      <item>Extend `AuditEventTypeValues` with `billing.checkout_started`, `billing.portal_started`, `billing.return_recorded`, `billing.cancel_returned`, `billing.provider_event_ingested`, `billing.provider_event_duplicate`, `billing.provider_event_rejected`, `billing.provider_event_held`, `billing.receipt_recorded`, `billing.paid_state_changed`, `billing.refund_recorded`, `billing.dispute_recorded`, `billing.chargeback_recorded`, `billing.cancelled`, `billing.past_due_recorded`, `billing.reconciliation_started`, `billing.reconciliation_mismatch`, `billing.reconciliation_failed`, `billing.reconciliation_repaired`, and `billing.no_repair_marked`.</item>
      <item>Extend `OperatorControlKeyValues` with `paid_activation_enabled`, `billing_webhooks_enabled`, and `billing_reconciliation_enabled`.</item>
      <item>Extend `FunnelEventTypeValues` with `paid_activation_started`, `checkout_returned`, `checkout_cancelled`, `billing_provider_event_ingested`, `receipt_viewed`, `refund_or_dispute_recorded`, `billing_reconciliation_failed`, and `billing_reconciliation_repaired`. Do not add `api_key_created` or `api_key_revoked` for P5.</item>
      <item>Add paid billing statuses to `src/lib/ui/status-presentation.ts`: `paid_active`, `payment_failed`, `past_due`, `required_action`, `refunded`, `reversal_recorded`, `dispute_hold`, `chargeback_recorded`, `billing_cancelled`, `provider_unavailable`, `provider_event_held`, `reconciliation_stale`, `reconciliation_missing`, `reconciliation_duplicate`, `reconciliation_mismatched`, `retry_exhausted`, `no_repair`, and `paid_activation_disabled`.</item>
      <item>Add tests that prove every new audit, funnel, operator-control, and status literal is accepted by its validator and Convex schema composition, and that support-load rollups can source `billing.provider_event_held`, `billing.reconciliation_failed`, and `billing.no_repair_marked`.</item>
    </action>
    <acceptance_criteria>
      <criterion>`src/modules/observability/public.ts` exports the P5 billing audit event names from SECURITY-SPEC and the P5 funnel event names from GTM-READINESS.</criterion>
      <criterion>`src/modules/observability/internal/schema.ts` consumes the extended literal unions without creating a parallel billing audit log.</criterion>
      <criterion>`src/lib/ui/status-presentation.ts` maps every P5 status listed above to label, tone, description, next action, and audience/publicness where the type requires it.</criterion>
      <criterion>`tests/unit/observability/billing-events.test.ts` proves P5 billing audit and funnel values validate, and proves `api_key_created` and `api_key_revoked` remain conditional outside P5.</criterion>
      <criterion>`tests/unit/ui-status-presentation.test.ts` proves P5 states render text-first labels and do not surface raw provider enum names.</criterion>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P5-T03" title="Create billing rail module and provider readback posture">

    <name>Create billing rail module and provider readback posture</name>
    <read_first>
      <path>src/modules/business/public.ts</path>
      <path>src/modules/catalog/public.ts</path>
      <path>src/modules/security/public.ts</path>
      <path>src/modules/observability/public.ts</path>
      <path>src/modules/observability/internal/schema.ts</path>
      <path>convex/schema.ts</path>
      <path>.env.example</path>
      <path>.planning/SECURITY-SPEC.md</path>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      <item>Create `src/modules/billing/public.ts` as the only route-facing billing seam. Export `startPaidActivation`, `startCustomerPortal`, `ingestBillingProviderEvent`, `recordBillingEvidence`, `readBillingStatus`, `readReceipt`, `readBillingReconciliation`, `retryBillingReconciliation`, `markBillingNoRepair`, `disablePaidActivation`, `readPublicPaidActivationProjection`, `readOwnerBillingProjection`, and `readAdminBillingProjection`.</item>
      <item>Create billing internals under `src/modules/billing/internal/` for authority, operations, provider readback, reconciliation, projections, and Convex schema. Keep routes importing only `src/modules/billing/public.ts`.</item>
      <item>Add Convex tables `billingOffers`, `billingOperations`, `billingProviderEvents`, `billingReceipts`, `billingReconciliations`, and `capabilityLaunchSupportRecords` to `src/modules/billing/internal/schema.ts`, then include `billingTables` in `convex/schema.ts`.</item>
      <item>Billing operation rows must store owner ID, business ID, offer ID, source plan/quote hash, idempotency key, correlation ID, checkout or portal operation kind, status, provider family, source-controlled return URL key, and timestamps.</item>
      <item>Provider event rows must store provider family, provider event ID, logical provider object key, AE billing operation ID when bound, signature status, normalized allowed fields, payload hash, redacted payload, duplicate or held status, retrieval status, and correlation ID. Raw provider bodies are discarded after verification, hash, and normalization unless the decision record names a private evidence-ref TTL.</item>
      <item>Receipts and paid-state rows must be append-only and must link operation ID, provider evidence refs, internal receipt ID, paid-state transition, refund/reversal/dispute/cancellation/chargeback refs, and correlation ID.</item>
      <item>Reconciliation rows must store stale, missing, duplicate, mismatched, disputed, unbound, provider-unavailable, retry-exhausted, and no-repair states with retry count, retry-after, actor, reason, evidence refs, and operator next action.</item>
      <item>`AUTUMN_SECRET_KEY`, `AUTUMN_WEBHOOK_SECRET`, `AUTUMN_ENVIRONMENT`, `AUTUMN_PROJECT_ID`, `AUTUMN_API_BASE_URL`, `AUTUMN_PORTAL_RETURN_BASE_URL`, `STRIPE_SECRET_KEY`, and `STRIPE_WEBHOOK_SECRET` may be added to `.env.example` only in the implementation PR that first reads them. No server secret may use a `VITE_` prefix.</item>
      <item>Do not add any environment variable or deploy setting that represents Autumn/Stripe connection status as proof. Provider connection status must be represented by source-owned readback rows with timestamp, stable provider refs, payload hash, route or smoke evidence, and operator next action.</item>
    </action>
    <acceptance_criteria>
      <criterion>`src/modules/billing/public.ts` exports exactly the public functions named in this task and no route imports from `src/modules/billing/internal/`.</criterion>
      <criterion>`convex/schema.ts` includes `billingTables`, and billing table names match `billingOffers`, `billingOperations`, `billingProviderEvents`, `billingReceipts`, `billingReconciliations`, and `capabilityLaunchSupportRecords`.</criterion>
      <criterion>`billingProviderEvents` stores `payloadHash` and `redactedPayload` but no raw PAN, CVC, payment credential, raw provider body, unredacted owner contact, or provider secret fields.</criterion>
      <criterion>`.env.example` contains no provider-connection-status proof variable and no `VITE_AUTUMN`, `VITE_STRIPE_SECRET`, `VITE_STRIPE_WEBHOOK`, or other server-secret public prefix.</criterion>
      <criterion>`tests/unit/billing/rail.test.ts` proves provider connection status cannot be marked ready from env vars alone.</criterion>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P5-T04" title="Implement owner-only checkout and customer portal starts">

    <name>Implement owner-only checkout and customer portal starts</name>
    <read_first>
      <path>src/modules/security/public.ts</path>
      <path>src/modules/business/public.ts</path>
      <path>src/components/ae/layout/AePageHeader.tsx</path>
      <path>src/routes/owner.status.tsx</path>
      <path>.planning/phases/05-paid-activation-money-rails/05-UI-SPEC.md</path>
      <path>.planning/SECURITY-SPEC.md</path>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      <item>Create owner route surfaces `src/routes/owner.billing.activate.tsx`, `src/routes/owner.billing.redirecting.tsx`, `src/routes/owner.billing.return.tsx`, `src/routes/owner.billing.cancel.tsx`, `src/routes/owner.billing.tsx`, and `src/routes/owner.billing.receipts.$receiptId.tsx` using `AeOwnerShell`, `AePageHeader`, existing button/form/status primitives, and source-owned billing readbacks.</item>
      <item>`startPaidActivation` and `startCustomerPortal` must require authenticated owner access to the exact source-owned business and approved offer. They must not accept admin/operator global role as sufficient start authority.</item>
      <item>Admin/operator users may see reconciliation, disable/rollback, and support readbacks through admin routes only; they must receive a typed denial from owner checkout/customer portal start unless a future source-owned billing delegate table exists and has tests.</item>
      <item>Server-created starts must bind owner ID, business ID, offer ID, source plan/quote hash, idempotency key, correlation ID, and source-controlled return/cancel URL key before redirect or portal handoff.</item>
      <item>Reject or ignore client-supplied amount, currency, provider customer ID, provider object ID, entitlement, paid state, return URL, cancel URL, business authority, and plan authority.</item>
      <item>Return and cancel routes must read source billing state. Return URL arrival alone must render `pending provider readback` unless admitted readback already changed paid state.</item>
    </action>
    <acceptance_criteria>
      <criterion>`startPaidActivation` and `startCustomerPortal` denial tests cover anonymous actor, wrong owner, suppressed business, invalid plan, and non-owner admin/operator.</criterion>
      <criterion>Client-tamper tests cover amount, currency, provider customer ID, provider object ID, entitlement, paid state, business authority, return URL, and cancel URL.</criterion>
      <criterion>Duplicate replay with the same idempotency key and same body returns the stored operation; same key with a different body is held or rejected with a typed conflict.</criterion>
      <criterion>Owner routes render unavailable, valid plan, invalid plan, unauthorized/wrong-owner, checkout creating, redirecting, canceled return, pending readback, paid active, provider unavailable, and duplicate replay states.</criterion>
      <criterion>No checkout or customer portal route renders a raw provider URL from browser input.</criterion>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P5-T05" title="Split public and owner-private billing projections">

    <name>Split public and owner-private billing projections</name>
    <read_first>
      <path>src/modules/catalog/public.ts</path>
      <path>src/modules/discovery/public.ts</path>
      <path>src/routes/$slug.tsx</path>
      <path>src/routes/index.tsx</path>
      <path>.planning/SECURITY-SPEC.md</path>
      <path>.planning/GTM-READINESS.md</path>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      <item>Amend `.planning/SECURITY-SPEC.md` P5 public projection allowlist so public fields are limited to selected paid activation availability and approved public offer/pricing copy. Move billing center links, customer portal links, owner billing status, receipts, invoices, provider refs, reconciliation, and support evidence to owner/admin/operator-only projections.</item>
      <item>Create projection functions in `src/modules/billing/internal/projections.ts`: `readPublicPaidActivationProjection`, `readOwnerBillingProjection`, and `readAdminBillingProjection`.</item>
      <item>`readPublicPaidActivationProjection` may expose only approved public offer/pricing copy, selected paid activation availability, stale/degraded/unavailable public-safe reason, and claim evidence ID after P5 smoke/readback passes.</item>
      <item>`readOwnerBillingProjection` may expose billing status, customer portal start availability, receipt list, receipt detail refs, refund/dispute/cancellation notices, provider-safe refs, and owner next actions.</item>
      <item>`readAdminBillingProjection` may expose reconciliation queues, provider posture, incident/rollback controls, redacted provider evidence, retry/no-repair controls, disable state, support next action, and no raw provider/payment secrets.</item>
    </action>
    <acceptance_criteria>
      <criterion>Public catalog, registry, discovery, SEO, UCP, llms, schema, API-doc, and route DTO tests reject `customerPortal`, `billingCenter`, `billingStatus`, `receipt`, `invoice`, `providerCustomerId`, `subscriptionId`, `paymentIntent`, `checkoutSession`, `reconciliation`, and provider error fields.</criterion>
      <criterion>Owner projection tests prove source-owned owner access can read billing status, receipts, and portal availability for only the owned business.</criterion>
      <criterion>Admin projection tests prove admin/operator readback is redacted and cannot start checkout/customer portal.</criterion>
      <criterion>Public P5 paid claims are absent before selected-rail smoke/readback and claim evidence rows exist.</criterion>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P5-T06" title="Ingest provider evidence, receipts, reversals, and reconciliation">

    <name>Ingest provider evidence, receipts, reversals, and reconciliation</name>
    <read_first>
      <path>src/modules/observability/public.ts</path>
      <path>.planning/SECURITY-SPEC.md</path>
      <path>.planning/phases/05-paid-activation-money-rails/05-CONTEXT.md</path>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      <item>Create provider webhook/readback routes for Autumn and only the Stripe PSP evidence required under Autumn. Stripe webhook/readback code is PSP evidence only; it must not become direct Stripe subscription authority.</item>
      <item>Preserve exact raw request body bytes before JSON parsing. Verify Autumn webhook signatures using current Autumn official docs and verify Stripe PSP webhooks using `Stripe-Signature` and the exact raw body if a Stripe endpoint ships.</item>
      <item>Dedupe by provider event ID, logical provider object key, payload hash, and AE billing operation ID when present. Same valid duplicate returns stored result; same key with different body hash becomes held for operator.</item>
      <item>Bind every provider event to a pending source billing operation or known source-owned provider object before it can affect readbacks. Signed but unbound events become `held_for_operator`, emit `billing.provider_event_held`, and do not mutate paid state.</item>
      <item>Retrieve provider state where the decision record or provider docs require readback before admitting paid, refund, reversal, dispute, chargeback, cancellation, past-due, or required-action transitions.</item>
      <item>Record receipts and paid-state transitions append-only. Refund, reversal, dispute, chargeback, cancellation, failed payment, past due, 3DS/required action, provider unavailable, missing evidence, duplicate, stale, mismatched, retry-exhausted, and manual no-repair states must preserve original receipts and expose owner/operator next actions.</item>
      <item>Create admin routes `src/routes/admin.monetization.tsx` and `src/routes/admin.monetization.$operationId.tsx` for reconciliation queues, redacted evidence chains, retry/no-repair, disable/rollback, incident readback, and support next action.</item>
      <item>`retryBillingReconciliation` and `markBillingNoRepair` require `owner_admin` or explicit source-owned billing operator permission, CSRF or same-site Origin for browser actions, bounded retry count, retry-after, same-body idempotency hash, actor, reason, evidence refs, audit event, and preserved history.</item>
    </action>
    <acceptance_criteria>
      <criterion>Webhook tests cover invalid signature, raw-body mismatch, missing signature, expired replay window where supported, duplicate event, same-key/different-body conflict, unbound provider event, provider retrieval mismatch, provider unavailable, and direct webhook entitlement rejection.</criterion>
      <criterion>Receipt tests prove successful paid activation creates one receipt/readback/entitlement transition, replay returns stored result, and duplicate provider evidence does not duplicate receipt rows.</criterion>
      <criterion>Failure tests prove failed payment, cancellation, refund, reversal, dispute, chargeback, past due, required action, partial evidence, missing evidence, retry-exhausted, and manual no-repair preserve original receipt history.</criterion>
      <criterion>Reconciliation tests cover stale, missing, duplicate, disputed, mismatched, unbound, provider-unavailable, retry available, retry exhausted, and no-repair records with redacted evidence.</criterion>
      <criterion>Admin/operator tests prove reconciliation retry/no-repair works for authorized operator/admin roles and denies normal owner/support/reviewer roles where the permission matrix says read-only.</criterion>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P5-T07" title="Close retention, legal, tax, and support readiness">

    <name>Close retention, legal, tax, and support readiness</name>
    <read_first>
      <path>.planning/SECURITY-SPEC.md</path>
      <path>.planning/GTM-READINESS.md</path>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      <item>Record billing/payment retention class, export/delete/tombstone behavior, lawful audit hash preservation, raw webhook body disposal rule, private evidence TTL if any, and private evidence access policy before storing private provider/payment evidence.</item>
      <item>Record AUD/GST/tax/legal/terms/refund/dispute posture and support escalation path in the money decision record and in source-owned billing support readback.</item>
      <item>Create `capabilityLaunchSupportRecord` source state for P5 with primary owner, backup owner, admin/operator coverage, supported channels, launch stage, capacity threshold, maximum backlog age, phase incident list, claim-disable path, per-channel kill rules, and support next action.</item>
      <item>Support kill rules must disable public paid claims and paid-channel copy when checkout failures, cancelled returns, duplicate webhook incidents, unbound provider events, receipt mismatches, refund/dispute/cancellation backlog, reconciliation no-repair, or support capacity breaches exceed the recorded threshold.</item>
      <item>Deletion/export behavior must remove or redact private provider/payment evidence refs where legally allowed while preserving long-lived audit hashes, reason codes, receipt/reversal reconstruction, and financial/legal retention requirements named in the decision record.</item>
    </action>
    <acceptance_criteria>
      <criterion>`05-MONEY-RAIL-DECISION.md` names retention class, export behavior, delete/tombstone behavior, lawful audit hash preservation, private evidence access policy, AUD/GST/tax/legal/terms/refund/dispute posture, and support escalation path.</criterion>
      <criterion>`capabilityLaunchSupportRecords` can store capability `paid_activation_money_rails`, primary owner, backup owner, admin/operator coverage, supported channels, launch stage, capacity threshold, maximum backlog age, incident count, claim-disable path, channel kill rules, and support next action.</criterion>
      <criterion>Tests prove public paid claims are disabled when a support kill rule trips and re-enabled only after source-owned support/readback conditions recover.</criterion>
      <criterion>Redaction/export/delete tests prove raw payment payloads, provider secrets, unredacted provider errors, PAN/CVC/payment credentials, and raw private owner/contact data never appear in public projections, logs, audit payloads, or support views.</criterion>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

  <task id="P5-T08" title="Harden copy, claims, source scans, tests, and smoke proof">

    <name>Harden copy, claims, source scans, tests, and smoke proof</name>
    <read_first>
      <path>src/lib/ui/contract-scans.ts</path>
      <path>tests/copy/phase1-banned-copy.test.ts</path>
      <path>tests/copy/claims-register.test.ts</path>
      <path>tests/fixtures/bad-copy/overclaim.fixture</path>
      <path>tests/imports/scan-targets.ts</path>
      <path>src/lib/ui/copy.ts</path>
      <path>.planning/GTM-READINESS.md</path>
      <path>.planning/SEO-AEO-SPEC.md</path>
      <path>.planning/AI-SPEC.md</path>
    </read_first>

    <files>

      <item>Use phase frontmatter `files_modified` plus task-local action paths; do not edit files outside those lists.</item>

    </files>
    <action>
      <item>Expand `scanCopyClaims` P5 money patterns to catch standalone `wallet`, `credits`, `balance`, `stored value`, `custody`, `crypto`, `x402`, `Connect`, `marketplace payout`, `split payout`, `settlement`, `payment handler`, `paymentRequired`, `direct Stripe rail`, `direct Stripe subscription`, `Stripe subscription authority`, and live/ready/available variants.</item>
      <item>Add Autumn/provider-ref quarantine patterns before P5 evidence: `autumn`, `AUTUMN_`, `useautumn`, `Stripe Checkout`, `Stripe Billing`, `providerCustomerId`, `providerSubscriptionId`, `checkoutSession`, `paymentIntent`, `invoiceId`, and `billingPortal` are allowed only in `.planning/phases/05-paid-activation-money-rails/`, `src/modules/billing/`, `src/routes/owner.billing*`, `src/routes/admin.monetization*`, `src/routes/api.billing*`, `.env.example`, and P5 tests/fixtures after the money decision record exists.</item>
      <item>Expand clean copy scan targets to cover public route copy, `src/components/ae`, `src/lib/ui/copy.ts`, SEO/AEO files, AI/discovery planning docs that generate public assets, llms/UCP/discovery/API-doc artifacts when present, and email/social/partner/launch-copy asset directories when present. Keep phase-owned planning allowances separate from public asset scans.</item>
      <item>Add claim evidence register behavior for P5 paid claims. Each allowed public paid claim must have `claimId`, phase, exact copy, public asset, route/readback evidence, funnel event, evidence status, support owner, valid launch stage, and kill rule.</item>
      <item>Add fixtures proving public positive claims fail without matching readback/support evidence, selected-rail Phase 5 planning/test copy passes in the Phase 5 context, direct-money standalone wording fails, and explicit negative wording tied to the matched capability passes only when it says the capability is unavailable, deferred, rejected, or out of scope.</item>
      <item>Create unit, integration, e2e, a11y, type, SEO, copy, import/source-mining, and UI-contract tests named in `files_modified`. Provider smoke closeout must record checkout start, return, cancel, signed webhook, receipt, refund/dispute, reconciliation mismatch, retry/no-repair, disable/rollback, and selected public claim evidence from source-owned readback.</item>
    </action>
    <acceptance_criteria>
      <criterion>`tests/fixtures/bad-copy/overclaim.fixture` includes standalone wallet, credits, balance, custody, x402, Connect marketplace, split payout, settlement, direct Stripe rail, and direct Stripe subscription authority examples that fail scans.</criterion>
      <criterion>`tests/copy/claims-register.test.ts` rejects P5 public paid claims without route/readback/funnel/support evidence and accepts Phase 5 planning/test context only when unsupported rails are explicitly negative.</criterion>
      <criterion>`tests/copy/phase1-banned-copy.test.ts` scans public route copy, AE components, UI copy, SEO/AEO/discovery/API-doc/launch asset locations that exist in the repo, and keeps `.planning/phases/05-paid-activation-money-rails/` allowances phase-owned.</criterion>
      <criterion>`tests/types/billing-projections.test-d.ts` proves public projection types cannot include owner-private billing fields.</criterion>
      <criterion>`tests/seo/paid-activation-claims.test.ts` proves payment/custody/settlement/paymentRequired/direct-Stripe claims do not appear in public SEO output before selected-rail smoke evidence.</criterion>
      <criterion>Provider smoke evidence includes timestamp, environment, provider family, stable provider refs, payload hash, route/readback evidence, redacted error if any, and operator next action; env var presence is not accepted as smoke proof.</criterion>
    </acceptance_criteria>

    <verify>

      <command>Run the plan closeout command block entries that cover this task and record exact output in closeout evidence.</command>

    </verify>

    <done>

      <criterion>Every acceptance criterion in this task is source-proven, tested, and free of stop-condition violations.</criterion>

    </done>
  </task>

<verification>
  <commands>
    <command>npm run check:convex-codegen</command>
    <command>npm run typecheck</command>
    <command>npm run test</command>
    <command>npm run test:unit</command>
    <command>npm run test:integration</command>
    <command>npm run test:e2e</command>
    <command>npm run test:e2e:a11y</command>
    <command>npm run test:a11y</command>
    <command>npm run test:types</command>
    <command>npm run test:imports</command>
    <command>npm run test:source-mining</command>
    <command>npm run test:ts-standards</command>
    <command>npm run test:copy</command>
    <command>npm run test:seo</command>
    <command>npm run test:ui-contract</command>
    <command>npm run test:provider-smoke:autumn-stripe</command>
    <command>npm run build</command>
    <command>npm run test:all</command>
  </commands>
  <provider_smoke>
    <item>Autumn sandbox or live-readiness checkout start stores a pending `billingOperations` row before redirect.</item>
    <item>Checkout return and cancel routes render source-owned state and never treat the return URL as proof.</item>
    <item>Signed Autumn webhook/readback admits a bound provider event, creates append-only receipt/readback state, and emits audit/funnel events.</item>
    <item>Stripe PSP evidence is ingested only as PSP evidence under Autumn, or direct Stripe subscription authority is blocked until an Autumn blocker record exists.</item>
    <item>Refund, dispute, chargeback, cancellation, provider-unavailable, unbound event, reconciliation mismatch, retry, no-repair, and disable/rollback evidence is visible in admin readback with redacted payloads.</item>
    <item>Public paid-activation claim evidence row includes claim ID, exact copy, public asset, route/readback evidence, funnel event, support owner, valid launch stage, and kill rule.</item>
  </provider_smoke>
</verification>

## must_haves.truths and must_haves.prohibitions

```yaml
must_haves:
  truths:
    - id: p5-rail-lock
      statement: "Phase 5 implements one Autumn Cloud plus Stripe PSP paid-activation rail. Direct Stripe subscription authority is unavailable unless an evidence-backed Autumn blocker record exists; all other rails are out of scope."
      verification: "05-MONEY-RAIL-DECISION.md plus copy/source scans; no Connect, x402, wallet, credits, balances, custody, split payout, marketplace payout, request-market settlement, or multi-rail code path ships."
    - id: p5-edge-r2-owner-business-plan-boundary
      statement: "Server-created checkout and customer-portal start bind authenticated owner, source-owned business, approved offer/plan, idempotency key, correlation ID, and pending operation; client-supplied amount, currency, customer ID, provider IDs, entitlement, paid state, return URL, cancel URL, and business authority are ignored or rejected."
      verification: "Unit and integration tests cover valid creation, anonymous, wrong-owner, non-owner admin, suppressed business, invalid plan, duplicate replay, same-key/different-body, and every client tamper field."
    - id: p5-edge-r5-negative-money-outcomes-preserve-history
      statement: "Failed payment, refund, reversal, dispute, chargeback, cancellation, partial provider evidence, missing evidence, retry-exhausted, and manual no-repair states preserve original receipts and update readbacks with owner/operator next actions."
      verification: "Receipt/reconciliation tests prove append-only lineage and no false entitlement after negative provider outcomes."
    - id: p5-edge-r6-reconciliation-concurrency
      statement: "Operator reconciliation surfaces stale, missing, duplicate, disputed, mismatched, unbound, provider-unavailable, retryable, retry-exhausted, and no-repair states with bounded retry/no-repair actions and redacted evidence, including concurrent retry/replay paths."
      verification: "Integration tests cover forced mismatch, stale webhook, missing provider object, duplicate event, dispute hold, same-key/different-body conflict, concurrent retry, retry-after, no-repair, and redacted-secret fixtures."
    - id: p5-edge-r8-closeout-paths
      statement: "Closeout proves successful checkout, duplicate replay, webhook retry, invalid signature, unbound object, failed payment, refund/reversal, dispute, reconciliation mismatch, wrong-owner and non-owner-admin denial, redaction, and no leaked rail fields in core catalog/discovery."
      verification: "Closeout commands plus provider smoke evidence and public/private projection tests."
    - id: p5-public-private-split
      statement: "Public projections expose only selected paid activation availability and approved public offer/pricing copy after evidence; owner/admin projections own billing links/status/receipts/invoices/provider refs/reconciliation/support evidence."
      verification: "Projection type tests, public DTO tests, SEO/copy scans, and owner/admin route tests."
    - id: p5-retention-support-legal-tax
      statement: "Billing/payment retention, export/delete/tombstone, private evidence access, AUD/GST/tax/legal/terms/refund/dispute, support owner, support capacity, claim-disable path, and channel kill rules are recorded before public paid claims."
      verification: "05-MONEY-RAIL-DECISION.md, capabilityLaunchSupportRecord tests, redaction/export/delete tests, and GTM claim gate tests."
  prohibitions:
    - statement: "MUST NOT grant paid activation or entitlement directly from an unsigned/unbound/unread provider webhook."
      status: resolved
      verification: "Webhook signature, binding, retrieval, dedupe, admission, invalid signature, unbound object, and direct-webhook-entitlement tests."
    - statement: "MUST NOT let client input supply amount, currency, provider customer ID, entitlement, business authority, or billing state."
      status: resolved
      verification: "Server-created checkout/customer portal tests, wrong-owner tests, non-owner-admin denial tests, and client-tamper tests."
    - statement: "MUST NOT introduce wallet/credits/balance/request-market settlement as the default Phase 5 domain model."
      status: resolved
      verification: "Money decision record, contract scans, source-mining scans, and fixture tests for standalone wallet, credits, balance, and request-market settlement wording."
    - statement: "MUST NOT leak stripe*, x402, wallet, credits, balance, paymentHandler, or provider IDs into core business/registry/discovery state without explicit decision-record approval."
      status: resolved
      verification: "Schema/import/discovery/public projection scans and type tests proving core DTOs exclude rail-specific fields."
    - statement: "MUST NOT claim payment, custody, settlement, Connect, x402, or paymentRequired capability in public/discovery/GTM copy before the selected rail enforces and reads it back."
      status: resolved
      verification: "Copy/discovery/GTM scans, claim evidence register tests, route/readback/funnel evidence rows, and paid-launch kill rules."
    - statement: "MUST NOT log or expose provider secrets, raw payment payloads, card data, tokens, raw private owner/contact data, or unredacted provider errors."
      status: resolved
      verification: "Redaction, log/readback, projection, support-view, and provider-error fixture tests."
```

## Artifacts this phase produces

### New or amended file paths

- `.planning/phases/05-paid-activation-money-rails/05-MONEY-RAIL-DECISION.md`
- `.planning/phases/05-paid-activation-money-rails/05-SPEC.md` amended rail boundary
- `.planning/SECURITY-SPEC.md` amended P5 public/private projection split
- `.planning/GTM-READINESS.md` amended P5 claim/support/kill proof where source-owned records require it
- `src/modules/billing/public.ts`
- `src/modules/billing/internal/schema.ts`
- `src/modules/billing/internal/authority.ts`
- `src/modules/billing/internal/provider-readback.ts`
- `src/modules/billing/internal/operations.ts`
- `src/modules/billing/internal/reconciliation.ts`
- `src/modules/billing/internal/projections.ts`
- `convex/billing.ts`
- Owner billing routes: `owner.billing.activate`, `owner.billing.redirecting`, `owner.billing.return`, `owner.billing.cancel`, `owner.billing`, `owner.billing.receipts.$receiptId`
- Admin monetization routes: `admin.monetization`, `admin.monetization.$operationId`
- Provider evidence routes: `api.billing.autumn-webhook`, `api.billing.stripe-webhook` only for PSP evidence under Autumn
- Billing tests named in `files_modified`

### Public module symbols

- `startPaidActivation`
- `startCustomerPortal`
- `ingestBillingProviderEvent`
- `recordBillingEvidence`
- `readBillingStatus`
- `readReceipt`
- `readBillingReconciliation`
- `retryBillingReconciliation`
- `markBillingNoRepair`
- `disablePaidActivation`
- `readPublicPaidActivationProjection`
- `readOwnerBillingProjection`
- `readAdminBillingProjection`

### Branded IDs and source state

- `BillingOperationId`
- `BillingReceiptId`
- `BillingProviderEventId`
- `BillingReconciliationId`
- `BillingOfferId`
- `BillingSupportRecordId`
- Convex tables: `billingOffers`, `billingOperations`, `billingProviderEvents`, `billingReceipts`, `billingReconciliations`, `capabilityLaunchSupportRecords`

### Literal unions and status values

- Audit targets: `billing_offer`, `billing_operation`, `billing_provider_event`, `billing_receipt`, `billing_reconciliation`, `billing_support_record`
- Audit events: `billing.checkout_started`, `billing.portal_started`, `billing.return_recorded`, `billing.cancel_returned`, `billing.provider_event_ingested`, `billing.provider_event_duplicate`, `billing.provider_event_rejected`, `billing.provider_event_held`, `billing.receipt_recorded`, `billing.paid_state_changed`, `billing.refund_recorded`, `billing.dispute_recorded`, `billing.chargeback_recorded`, `billing.cancelled`, `billing.past_due_recorded`, `billing.reconciliation_started`, `billing.reconciliation_mismatch`, `billing.reconciliation_failed`, `billing.reconciliation_repaired`, `billing.no_repair_marked`
- Operator controls: `paid_activation_enabled`, `billing_webhooks_enabled`, `billing_reconciliation_enabled`
- Funnel events: `paid_activation_started`, `checkout_returned`, `checkout_cancelled`, `billing_provider_event_ingested`, `receipt_viewed`, `refund_or_dispute_recorded`, `billing_reconciliation_failed`, `billing_reconciliation_repaired`
- UI statuses: `paid_active`, `payment_failed`, `past_due`, `required_action`, `refunded`, `reversal_recorded`, `dispute_hold`, `chargeback_recorded`, `billing_cancelled`, `provider_unavailable`, `provider_event_held`, `reconciliation_stale`, `reconciliation_missing`, `reconciliation_duplicate`, `reconciliation_mismatched`, `retry_exhausted`, `no_repair`, `paid_activation_disabled`

## Stop conditions

- P1-P4 source-owned authority/readback substrate is not closed out.
- Money decision record is missing, selects more than one rail, or selects any rail other than Autumn Cloud plus Stripe PSP without an Autumn blocker record.
- Autumn official docs or account posture block production use and the blocker record is not written.
- Implementation starts direct Stripe subscription authority without an Autumn blocker record.
- Client can supply amount, currency, customer/provider IDs, entitlement, paid state, return/cancel URL, or business authority.
- Admin/operator can initiate checkout/customer portal without source-owned billing delegate authority and tests.
- Webhook grants paid state without signature, binding, dedupe, provider readback where required, and reconciliation admission.
- Provider/payment data leaks into public catalog/discovery/SEO/API/logs/support views.
- Public claims mention payments, custody, settlement, Connect, x402, paymentRequired, wallet, credits, balances, direct Stripe authority, or selected paid activation without source-owned readback/support/kill evidence.

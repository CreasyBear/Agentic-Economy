---
phase: 05
slug: paid-activation-money-rails
status: planning-contract-blocked-on-p1-p4-authority-and-money-decision-record
created: 2026-06-27
mode: shape-harden
---

# Phase 05 — UI Design Contract

UI appendix for one paid-activation production rail. Phase 5 uses Autumn Cloud as billing/product-ops authority with Stripe as PSP underneath. AE renders owner checkout/customer-portal handoff, billing status, receipts, reversals, and operator reconciliation from source-owned readback. It must not imply wallet, credits, x402, Connect, multi-rail settlement, or direct Stripe subscription authority unless a separate Autumn-blocker decision record exists.

## Design Authorities

- `.planning/phases/05-paid-activation-money-rails/05-SPEC.md` owns locked P5 money requirements, reachable states, and must-nots.
- `.planning/phases/05-paid-activation-money-rails/05-CONTEXT.md` owns Autumn+Stripe default rail, provider/readback posture, redaction, and deferred money scope.
- `.planning/phases/05-paid-activation-money-rails/05-01-autumn-stripe-paid-activation-PLAN.md` owns the execution package, money decision record, provider/env posture, UI/admin surfaces, and closeout proof.
- `.planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md` and `.planning/phases/02-05-PRODUCTION-MATURITY-PLAN.md` own the cross-phase production spine and bloat cuts.
- `.planning/FRONTEND-DESIGN-FRAMEWORK.md`, `DESIGN.md`, and `.impeccable/design.json` own AE shells, tokens, component seams, state-as-brand rules, Geist typography, command-ink/cool-field/signal-cobalt palette, focus, spacing, and no-default-shadcn discipline.

## Scope and Mode

| Field | Value |
|---|---|
| Mode | Shape + Harden for future implementation |
| Primary product job | An authorized owner starts paid activation, returns from hosted checkout/customer portal, and can understand paid, failed, refunded, disputed, canceled, or unreconciled state. |
| Primary users | Authorized owner starts/manages billing; owner_admin or explicit billing-operator permission reconciles provider/internal money evidence and support/rollback state without starting owner payment flows; reviewer is readback-only. |
| Product object | Money decision record, source-owned offer/plan, billing operation, Autumn/Stripe provider evidence, receipt, paid-state mirror, reversal/dispute/cancellation, and reconciliation record. |
| Entry condition | P1-P4 authority/readback substrate exists and the money decision record selects one offer/product/pricing object under Autumn Cloud + Stripe PSP. |
| Non-goals | No wallet, credits/balance settlement, custody, x402/crypto, Stripe Connect, split payouts, request-market settlement, multi-rail picker, direct Stripe subscription engine, client-created amount/customer/provider/entitlement, or raw payment collection in AE. |

## Information Architecture and Route Map

Route names are planning handles. Implementation may mount them under the existing owner/admin shell, but the jobs, states, and copy below must remain intact.

| Surface | Primary user | Job | Surface contract |
|---|---|---|---|
| `/owner/billing/activate` | Owner | Confirm selected paid activation before hosted provider handoff. | Shows source-owned plan/offer, price/currency/tax/refund posture from decision record, current free/paid boundary, and server-created checkout CTA. |
| `/owner/billing/redirecting` | Owner | Understand that AE is creating a hosted session. | Stable loading label; no amount/customer/provider values from client; safe cancel/back path where supported. |
| `/owner/billing/return` | Owner | Re-enter AE after checkout/customer portal. | Shows pending provider readback, paid active, failed, or needs action from source-owned billing status; never treats return URL alone as proof. |
| `/owner/billing/cancel` | Owner | Understand canceled checkout. | Shows nothing was activated unless source readback says otherwise and offers retry/start-over. |
| `/owner/billing` | Owner | Manage billing status and receipts. | Billing Center with paid state, receipts, refund/dispute/cancellation notices, provider-safe refs, and Customer Portal link where allowed. |
| `/owner/billing/receipts/:receiptId` | Owner | Inspect one receipt/readback. | Append-only receipt view with operation/evidence refs, provider-safe IDs, and reversal/dispute lineage. |
| `/admin/monetization` | Operator | See money go/no-go, incidents, and reconciliation queues. | Control center grouped by provider posture, stale/missing/duplicate/mismatched/unbound/disputed/provider-unavailable records, rollback/disable controls. |
| `/admin/monetization/:operationId` | Operator | Reconstruct a billing operation. | Redacted provider evidence chain with signature/readback/admission results, retry/no-repair controls, and support next action. |
| Autumn/Stripe webhooks | Provider | Deliver signed readback evidence. | Not a styled UI. Any human debug surface is redacted operator-only readback. |

Navigation: owner nav may show `Billing` only after the selected rail exists. Public nav must not advertise payments before provider readback, receipts, reversal/dispute, reconciliation, and smoke evidence pass.

## Key Flows

### Flow A — Start paid activation through Autumn/Stripe

1. Owner opens paid activation for a source-owned business and approved plan/offer.
2. UI shows what paid activation buys, what remains free, price/currency/tax/refund/legal posture from the decision record, and that hosted checkout is provider-managed.
3. Owner chooses `Continue to secure checkout`.
4. Server creates and persists the billing operation before redirect. UI never sends amount, currency, customer ID, provider ID, entitlement, paid state, or business authority.
5. Redirecting surface uses a stable loading label and source-controlled return/cancel URLs.

### Flow B — Return, receipt, and Billing Center

1. Owner returns from checkout or portal.
2. UI shows `Pending provider readback` until signed Autumn/Stripe evidence is admitted and source-owned billing state updates.
3. Billing Center renders paid active, failed payment, refund, reversal, dispute hold, cancellation, past due, required action, or provider unavailable states from source readback.
4. Receipts are append-only and link to operation/evidence refs. Reversals/disputes/cancellations add lineage; they do not erase the original receipt.
5. Customer Portal link is available only when Autumn/selected rail supports it and server creates the session.

### Flow C — Operator reconciliation and rollback

1. Operator opens Monetization Control Center and sees provider posture, webhook health, unbound events, mismatches, disputed records, and rollback/disable state.
2. Detail reconstructs operation -> hosted session/customer portal -> provider event/readback -> admitted evidence -> receipt/paid-state change -> reconciliation result.
3. Retry is available only for source-safe records. No-repair requires a reason. Disable paid activation stops new starts while preserving receipts/readbacks.

## Reachable UI States

| Surface | Required states |
|---|---|
| Activation entry | unavailable before money decision, plan unavailable, unauthorized/wrong-owner, suppressed business, valid plan confirmation, invalid plan, long plan/legal/tax text, mobile 375px. |
| Checkout handoff | creating session, redirecting, provider unavailable, duplicate replay, same-key/different-body, open-redirect rejected, client-tampered amount/currency/customer/provider/entitlement rejected. |
| Return/cancel | canceled return, pending provider readback, paid active, failed payment, required action/3DS, provider unavailable, duplicate return, stale readback. |
| Billing Center | empty/no paid activation, active, past due, failed payment, refunded, reversal, dispute hold, chargeback, canceled, portal available/unavailable, receipts loading/empty/populated, provider-safe refs. |
| Receipt detail | original receipt, refund lineage, reversal/dispute lineage, missing evidence, redacted provider error, append-only history, correlation/operation/evidence refs. |
| Operator reconciliation | stale, missing, duplicate, mismatched, unbound provider event, invalid signature held, disputed, provider unavailable, retry available, retry exhausted, no-repair, disable/rollback active. |
| Public/discovery/GTM copy | absent before proof, selected paid-state readback only after smoke, stale/degraded, no unsupported payment/custody/settlement claims. |

Every money state must be text-first. Color is secondary and never the only signal.

## Copy Table

| Element | Copy |
|---|---|
| Activation heading | Activate the selected paid plan |
| Plan summary label | What paid activation changes |
| Free boundary label | What remains free |
| Checkout CTA | Continue to secure checkout |
| Redirecting | Creating your secure checkout session. No payment details are stored by AE. |
| Cancel return | Checkout was canceled. Paid activation has not changed unless provider readback says otherwise. |
| Pending readback | Waiting for signed billing readback before updating paid status. |
| Paid active | Paid activation is active from source-owned billing readback. |
| Portal CTA | Manage billing in the customer portal |
| Failed payment | Payment failed. Review the provider readback and retry or update billing details. |
| Refunded | A refund was recorded. The original receipt remains in history. |
| Dispute hold | This payment is disputed. Paid status may be limited until reconciliation completes. |
| Canceled | Paid activation was canceled. Receipts remain available for audit. |
| Provider unavailable | Billing provider readback is unavailable. AE is holding the state for reconciliation. |
| Reconciliation needed | Internal billing state and provider evidence do not match. Review before taking action. |
| No-repair | Mark no-repair and record the support reason. |
| Unsupported rail | Wallets, credits, x402, Connect, and marketplace settlement are out of scope for this paid activation rail. |

Copy rules:
- Say `paid activation`, `secure checkout`, `customer portal`, `signed readback`, `receipt`, `refund`, `dispute`, `cancellation`, `reconciliation`, and `provider evidence`.
- Say `Autumn` and `Stripe` only in owner/operator context where provider identity clarifies support or readback. Public marketing claims require smoke/readback proof.
- Do not say `wallet`, `credits`, `balance`, `stored value`, `custody`, `x402`, `crypto`, `Connect`, `marketplace payout`, `settlement`, `multi-rail`, `direct Stripe subscription`, or `payment required` as available capability unless a later decision record and implementation explicitly approve it.
- Never imply return URL, env vars, screenshots, provider dashboard status, or webhook arrival alone grants paid state.

## Component Contract

| Pattern | Required component / behavior |
|---|---|
| Shells | Use `AeOwnerShell` for activation/Billing Center and `AeAdminShell` for monetization/reconciliation. |
| Page headers | `AePageHeader` with source-owned plan/status subtitle and one primary action area only. |
| Plan confirmation | Full `Card` composition: plan, price/currency/tax/refund posture, free/paid boundary, support/legal links, and warning/disabled state. |
| Checkout actions | `Button`; loading uses spinner plus stable label and disabled state. Hosted checkout/customer portal starts are actions, not links. |
| Billing status | `AeStatusBadge` plus description from `getStatusPresentation`; no raw provider event label without plain-language copy. |
| Receipts | Card/list rows with operation ID, receipt ID, provider-safe refs, timestamp, status, and lineage; IDs use Geist Mono/tabular numbers. |
| Evidence chain | Ordered operation/evidence/receipt/reconciliation chain; promote to shared `AeEvidenceChain` only if reused by P4/operator surfaces. |
| Reconciliation queues | `AeQueueList` grouped by next action; `Table` only for dense operator comparison. |
| Feedback | `AeAlert`, `AeEmptyState`, `AeLoadingState`, and `AeErrorState`; no raw spinners or provider-error dumps. |
| Forms | Retry/no-repair/disable reason fields use persistent labels, descriptions, `aria-invalid`, preserved values, and field-connected errors. |
| Destructive controls | Disable paid activation, rollback, and no-repair require inline consequence first; use `AlertDialog` only when the outcome cannot be safely undone. |

Visual rules: use DESIGN.md tokens only; reserve signal cobalt for the current primary checkout/portal/retry action; command-ink panels are allowed for high-stakes receipts and reconciliation; no payment-themed gradients, card-brand mimicry, or provider dashboard screenshots as proof.

## Accessibility and Responsive Contract

- 375px width is required for activation, redirect/return/cancel, Billing Center, receipt, and reconciliation surfaces.
- Critical mobile order: status, selected plan/paid boundary, price/refund/tax summary, primary action, provider-readback state, receipts/reconciliation next action.
- Checkout/portal/retry/disable controls have at least 44px hit area where practical and never below 40px.
- Keyboard order follows visual order; focus moves to the changed status/error after checkout start, return readback, portal start, retry, disable, or no-repair.
- Disabled controls include visible reason text and `aria-describedby` linkage.
- Money forms preserve input after recoverable errors and announce errors accessibly.
- Refund/dispute/cancellation and disable/rollback copy names object, scope, consequence, reversibility, support next action, and audit impact before confirmation.
- Long plan names, legal/refund text, provider refs, error summaries, and correlation IDs wrap safely; IDs use Geist Mono/tabular numbers.
- Reduced motion disables non-essential transitions; loading labels remain stable.
- No raw card/PAN/CVC/payment credentials are collected, displayed, logged, or hinted at in AE UI.

## Rendered Verification Matrix

Implementation closeout must attach compact 375px and wide viewport evidence for these surfaces. Source inspection alone is not visual verification.

| Surface | Compact evidence | Wide evidence | States to show | Interaction proof |
|---|---|---|---|---|
| Activation entry | Required | Required | unavailable, valid plan, invalid plan, wrong-owner, disabled reason | keyboard to checkout, focus visible, client-tamper error copy |
| Checkout redirect/return/cancel | Required | Required | creating, redirecting, canceled, pending readback, provider unavailable, paid active | loading label stability, focus after return |
| Billing Center | Required | Required | no paid activation, active, failed payment, refunded, dispute hold, canceled, portal unavailable | portal start keyboard path, receipt link order |
| Receipt detail | Required | Required | original receipt, refund/reversal/dispute lineage, missing evidence, redacted error | evidence landmarks, no raw payload/payment data |
| Operator reconciliation | Required | Required | stale, missing, duplicate, mismatched, unbound, provider unavailable, retry/no-repair, disable active | retry/no-repair/disable keyboard path and reason validation |
| Public/discovery/GTM copy | If rendered | If rendered | absent before proof, selected rail readback, degraded/stale | no wallet/credits/x402/Connect/settlement/direct-Stripe claims |

## Bloat and Prohibition Clauses

- Autumn Cloud is billing/product-ops authority and Stripe is PSP underneath. Do not design a direct Stripe subscription engine unless an explicit evidence-backed Autumn blocker decision record exists.
- No wallet, credits/balance as cash-like settlement, custody, x402/crypto, Stripe Connect, split payouts, marketplace settlement, request-market settlement, or multi-rail chooser.
- No client-entered amount, currency, provider customer ID, provider object ID, entitlement, paid state, return URL, or business authority.
- No payment fields in core business/catalog/registry/discovery UI before the money decision and selected-rail readback allow exact paid-state facts.
- No public `pay now`, `paymentRequired`, custody, settlement, Connect, x402, wallet, or credit claims before provider readback, receipts, reversal/dispute, reconciliation, and smoke evidence pass.
- No provider dashboard screenshots, env var presence, return URLs, or webhook arrival presented as proof.
- No future nav placeholders, disabled tabs, teaser banners, or dashboard theatre for additional rails.

## Next Implementation Handoff

Before implementation, create the money decision record and review current official Autumn and Stripe docs. The first UI task should compose activation, return/cancel, Billing Center, receipt, and admin reconciliation from existing AE shells and status/form/feedback primitives, install only imported official shadcn components, and keep every paid claim tied to source-owned readback.
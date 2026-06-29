# Phase 5 Money Rail Decision

**Status:** accepted for Phase 5 execution prep
**Created:** 2026-06-29
**Phase:** 05-paid-activation-money-rails
**Applies to:** one paid activation rail for Agentic Economy

This decision record exists so Phase 5 execution can start without re-litigating the rail, offer boundary, provider responsibilities, evidence standard, and rejected money surfaces. It does not by itself claim live paid activation. Live claims still require source-owned provider readback, receipts, reversal/dispute posture, reconciliation, support capacity, and deployed smoke evidence.

## Selected rail

Autumn Cloud is the billing/product-ops authority. Stripe is PSP underneath Autumn.

AE will implement one selected paid activation rail through Autumn Cloud, with Stripe used only as the payment service provider underneath Autumn for hosted checkout/payment collection, invoices, refunds, disputes, and payment method handling.

Official-doc grounding checked on 2026-06-29:
- Autumn describes itself as the billing and entitlement source of truth between the application and Stripe, with subscription state, entitlements, and billing logic managed outside the app codebase: https://docs.useautumn.com/welcome
- Autumn payment flow defaults to `billing.attach` returning a hosted `paymentUrl`, sending new customers to Stripe Checkout and existing customers through Autumn Checkout as needed: https://docs.useautumn.com/documentation/customers/payment-flow
- Autumn webhooks use Svix headers (`svix-id`, `svix-timestamp`, `svix-signature`) and retry failed delivery attempts: https://docs.useautumn.com/documentation/webhooks
- Stripe Billing remains the PSP/invoicing substrate under this decision, not AE's direct subscription engine: https://docs.stripe.com/billing
- Stripe webhook signature verification requires raw request body handling when Stripe evidence is ever read directly: https://docs.stripe.com/webhooks/signature

Direct Stripe subscription authority requires an evidence-backed Autumn blocker record. That blocker must cite current official docs, provider/account evidence, attempted Autumn workaround, operational risk, owner approval, and why direct Stripe subscription authority is the smallest safe fallback. It does not approve Connect, x402, wallet, credits, balances, custody, split payouts, request-market settlement, marketplace payouts, or a multi-rail system.

## Offer and free boundary

Selected execution offer:
- Source offer ID: `billing_offer:basic`
- Autumn plan/product key: `autumn-plan-basic`
- Public offer name: `Paid activation`
- Public CTA: `Activate`
- Price summary for execution scaffold: `AUD 99 monthly`
- Provider: `autumn_cloud`
- Terms summary: `Monthly subscription`

The source-owned offer must be written and read back from AE state before a hosted provider session is created. Provider dashboard configuration must match the source-owned offer before any live or public claim is made.

Paid activation buys:
- Owner-authorized paid activation for a claimed business profile.
- Source-owned billing operation, provider evidence, receipt, and paid-state readback.
- Eligibility for selected paid activation public copy only after provider smoke/readback evidence passes.
- Billing Center, receipt history, customer-portal handoff, reversal/dispute/cancellation readbacks, and operator reconciliation.

What remains free:
- Public reading of published, non-suppressed catalog/discovery pages.
- Owner claim and source-owned profile publication flows already allowed by earlier phases.
- Human inquiry and protected-action surfaces where their own phase gates allow them.
- No wallet, credits, balances, stored value, custody, settlement, or paid API/action marketplace is included in this offer.

usage credits and balances are out of scope.

## Subscription or one-time posture

Default posture is a monthly subscription for paid activation.

One-time paid activation, prepaid packages, credits, balances, wallet-like value, usage-metered billing, Connect payouts, and request-market settlement are not part of Phase 5. Autumn can still own product/pricing configuration, subscription lifecycle, entitlement/readback, customer portal, and billing-log workflows for the monthly paid activation plan.

No client-supplied amount, currency, customer ID, provider object ID, entitlement, return URL, or business authority may influence the operation. The client selects an approved source-owned offer; the server reads the offer and creates the provider operation.

## Tax legal and refund posture

Currency posture:
- Execution default is AUD.
- Provider/customer-facing totals, taxes, and invoices must come from Autumn/Stripe readback rather than client copy.
- GST/tax treatment must be configured in the selected provider environment before live charges or public paid claims.

Legal and terms posture:
- AE will not collect or store raw card data.
- Hosted checkout/customer portal keeps card/payment detail handling with Autumn/Stripe.
- Legal terms, cancellation terms, refund language, and support contact must be visible before live paid claims and must match provider receipt/portal behavior.

Refund and dispute posture:
- Refunds, reversals, disputes, chargebacks, failed payments, past-due state, cancellation, and no-repair are source-owned readback states.
- Negative money outcomes preserve the original receipt and add append-only lineage rather than deleting history.
- Paid activation must not be granted from a return URL, dashboard status, env var presence, screenshot, or webhook arrival alone.

## Provider responsibility split

Autumn responsibilities:
- Product/plan and billing/product-ops authority.
- Hosted attach/checkout/customer-portal operation where applicable.
- Customer/subscription/purchase/readback state.
- Webhook delivery for billing events.
- Provider-side billing lifecycle metadata that AE mirrors only after admission.

Stripe responsibilities underneath Autumn:
- Payment collection through Stripe-hosted surfaces where Autumn routes the customer there.
- Invoices, hosted invoice URLs, receipts, refunds, disputes, chargebacks, and payment method handling as PSP evidence.
- Stripe webhook or API evidence only if Autumn readback is insufficient for a specific accepted Phase 5 test path.

AE responsibilities:
- Owner/business authority through Clerk/Convex/server functions.
- Source-owned offer, operation, idempotency key, correlation ID, receipt ID, provider evidence refs, reconciliation ID, and support records.
- Raw-body signature verification before provider event admission.
- Provider retrieval where configured.
- Dedupe, binding to existing operations, append-only billing/receipt state, redaction, retry/no-repair, and operator reconstruction.
- Public/discovery/GTM claim gates.

## Credential owner and rotation

Initial credential owner: project owner/operator for Agentic Economy.

Credential surfaces:
- `AUTUMN_SECRET_KEY`
- `AUTUMN_API_BASE_URL` when non-default provider URL is required
- `AUTUMN_API_VERSION` when an explicit provider version is required
- `AUTUMN_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY` only for approved Stripe PSP evidence paths
- `STRIPE_WEBHOOK_SECRET` only for approved Stripe PSP webhook evidence paths

Rules:
- Secrets live only in local/deployed secret storage, never in source docs or tests.
- `.env.example` may name keys but must never contain live values.
- Rotate before live launch, after any exposure suspicion, after provider environment migration, and on operator handoff.
- Provider readiness is never inferred from secret presence.

## Evidence rows

Required source-owned evidence before Phase 5 closeout:
- Money decision record exists and rejects unsupported rails.
- Server-created checkout/attach operation persists before redirect.
- Duplicate replay returns the stored result.
- Same idempotency key with a different body fails safely.
- Wrong-owner, anonymous, suppressed business, invalid offer, and client-tampered amount/currency/customer/provider/entitlement fail safely.
- Autumn webhook or provider readback is signature-verified from raw body before event admission.
- Provider event binds to an existing operation or is held for operator reconciliation.
- Duplicate provider events dedupe by logical provider object key.
- Provider readback or retrieval confirms paid state where configured.
- Paid activation creates one append-only receipt and paid-state transition.
- Failed payment, refund, reversal, dispute, chargeback, cancellation, provider unavailable, retry exhausted, and no-repair preserve history.
- Operator reconciliation surfaces stale, missing, duplicate, disputed, mismatched, unbound, provider-unavailable, retry, and no-repair rows.
- Public/discovery/GTM paid claims pass only after checkout, webhook/readback, receipt, reversal/dispute, reconciliation, redaction, and smoke evidence pass.

Evidence that does not count:
- Provider dashboard screenshots.
- Env var presence.
- Deployed env configuration alone.
- Return/cancel URL arrival.
- Webhook arrival without signature, binding, dedupe, and readback admission.
- Copy claiming paid activation before behavior and readback exist.

## Support and rollback

Support owner: AE owner/admin/operator.

Support must handle:
- Checkout failure.
- Canceled return.
- Duplicate webhook.
- Unbound provider event.
- Receipt mismatch.
- Refund, dispute, chargeback, reversal, and cancellation.
- Provider outage.
- Reconciliation mismatch.
- Retry exhausted.
- No-repair decision with reason.

Rollback and disable plan:
- `paid_activation_enabled` disables new paid activation starts.
- `billing_webhooks_enabled` disables or holds provider event admission while preserving raw receipt discipline.
- `billing_reconciliation_enabled` disables automated repair/retry while keeping operator readback visible.
- Existing receipts, provider evidence, and reconciliation rows remain append-only and queryable.
- Public paid claims are removed or downgraded before disabling source behavior.

## Public claims

Before smoke/readback evidence passes, public copy may not claim paid activation is live.

After Phase 5 closeout, allowed public claim shape:
- `Paid activation is available through secure checkout for eligible owner-claimed businesses.`
- `Paid status is updated from source-owned billing readback, not from return URLs or provider dashboards.`

Owner/operator copy may name Autumn and Stripe when it clarifies support or readback. Broad public marketing must avoid provider implementation details unless the claim evidence register explicitly allows the exact copy.

Public, discovery, GTM, SEO, llms, UCP, API schema, email, and launch copy must keep payment/custody/settlement claims absent unless Phase 5 evidence explicitly supports the selected rail claim.

## Rejected rails

Rejected for Phase 5:
- Direct Stripe subscription authority without an evidence-backed Autumn blocker record.
- Stripe Connect.
- x402.
- Crypto or USDC payments.
- Wallets.
- Credits or balances as cash-like stored value.
- Custody.
- Split payouts.
- Marketplace settlement.
- Request-market settlement.
- Multi-rail selector.
- Payment handlers.
- Client-created provider customer IDs, provider object IDs, amount, currency, entitlement, return URL, paid state, or business authority.
- Provider-dashboard proof, screenshot proof, env-var proof, return-url proof, or webhook-arrival proof.

usage credits and balances are out of scope.

## Execution readiness

Phase 5 can now start execution with task P5-T01 verification and then proceed to P5-T02/P5-T03 only if the executor preserves this record.

Execution must still verify current official Autumn and Stripe docs at implementation time, because money-provider APIs and webhook requirements can change. Any direct Stripe fallback, new provider package, customer-portal behavior change, tax/legal change, public paid claim, or rail-specific field in core catalog/registry/discovery state requires an explicit update to this decision record before code lands.

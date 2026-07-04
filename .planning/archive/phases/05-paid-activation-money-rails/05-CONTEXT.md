# Phase 5: Paid Activation + Money Rails - Context

**Gathered:** 2026-06-27
**Status:** Ready for production planning after P1-P4 authority/readback posture exists

<domain>
## Phase Boundary

Phase 5 ships one production Autumn+Stripe paid-activation rail for AE: owner-authorized subscription/checkout/customer-portal start through Autumn, Stripe PSP payment/invoice/refund/dispute evidence beneath Autumn, signed Autumn/Stripe webhook/readback ingest, append-only billing/receipt/entitlement mirror, failed-payment/refund/reversal/dispute/cancellation handling, operator reconciliation, redaction, selected-rail public/GTM/discovery claims, and deploy/readback smoke with real provider keys/dependencies set up.

Default rail is Autumn Cloud + Stripe PSP. Autumn owns generic billing product-ops, product/price configuration, subscription lifecycle, entitlement/readback, customer portal, and billing-log workflows. Stripe handles payment collection, Checkout, invoices/receipts, refunds, and disputes beneath Autumn. AE owns endpoint-live posture, owner authority, protected-action controls, source-owned provider refs, Convex billing mirrors/readbacks, receipts, reconciliation, redaction, and public claims. Direct Stripe Billing + Checkout as AE's subscription engine is fallback only after an explicit evidence-backed Autumn blocker decision record. This phase does not turn AE into a wallet, credits, balance, settlement, Connect/x402, custody, or request-market platform.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `05-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `05-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- One money-rail decision record and one selected Autumn Cloud + Stripe PSP paid-activation rail.
- Server-created Autumn attach/checkout/customer-portal or equivalent selected-rail start flow.
- Provider webhook/readback ingest with signature, retrieval, normalization, binding, dedupe, and admission checks.
- Append-only billing/receipt/readback state with idempotent replay and stable refs.
- Refund/reversal/dispute/failed-payment/cancellation posture and owner/operator next actions.
- Operator reconciliation and repair/no-repair readbacks.
- Copy/discovery/GTM claims for payment capabilities only after selected-rail evidence.
- Sandbox/local/live-ready tests for success, failure, duplicate, retry, refund/reversal, dispute, reconciliation, permissions, and redaction.

**Out of scope (from SPEC.md):**
- Wallet/credits/balance/request-market settlement as the default domain model.
- Direct Stripe Billing/Checkout subscription authority, Stripe Connect Accounts v2, marketplace payouts, split charges, or controller responsibilities unless an evidence-backed Autumn blocker decision explicitly selects direct Stripe fallback for this paid-activation slice.
- x402/crypto/USDC/custody/payment-handler rails except as quarantined adapter candidates with explicit approval.
- Client-created amounts, currencies, customer IDs, entitlements, or direct webhook entitlement grants.
- Payment fields in core business/catalog/registry/discovery state unless approved by the money decision record.
- Provider-proof theatre from screenshots/env/config without server readback and reconciliation.
- Public payment/custody/settlement claims before provider readback, receipts, reversal/dispute, reconciliation, and smoke tests pass.

</spec_lock>

<decisions>
## Implementation Decisions

### Production posture
- **D-01:** Completed Phase 5 means AE can charge through the selected rail in a deployed environment with provider keys/dependencies configured, webhook/readback verified, receipts generated, reconciliation visible, and rollback/disable posture documented.
- **D-02:** Autumn Cloud + Stripe PSP is the default rail. Autumn must beat bespoke/direct Stripe subscription work on production maturity, risk, and time-to-live-payment; direct Stripe Billing + Checkout is fallback only after an evidence-backed Autumn blocker.
- **D-03:** Provider screenshots, env variables, dashboards, or copy are not proof. Server-created sessions, signed webhook/readback ingest, provider retrieval where required, internal receipt state, and reconciliation are proof.

### Deep module seams
- **D-04:** External interface is small: `startPaidActivation`, `startCustomerPortal`, `ingestBillingProviderEvent`, `recordBillingEvidence`, `readBillingStatus`, `readReceipt`, `readBillingReconciliation`, `retryBillingReconciliation`, `markBillingNoRepair`.
- **D-05:** Implementation owns owner/business authority, plan/price source, checkout operation, idempotency, provider event binding, append-only billing state, entitlement/readback, receipts, reversal/dispute/cancellation, reconciliation, redaction, and selected-rail claims.
- **D-06:** No rail-specific fields enter core business/catalog/registry/discovery state except selected source-owned paid-state facts explicitly approved by the money decision record.

### Checkout/subscription start
- **D-07:** Paid-activation start is server-side only and binds authenticated owner/business authority, source-owned plan/quote, Autumn customer/subscription/portal operation where applicable, Stripe PSP evidence where applicable, idempotency key, correlation ID, and pending operation.
- **D-08:** Client-supplied amount, currency, customer ID, entitlement, provider IDs, and business authority are ignored or rejected.
- **D-09:** Suppressed businesses, wrong-owner, invalid plan, duplicate replay, and same-key/different-body paths fail safely with typed results and audit/readback.

### Provider ingest and billing state
- **D-10:** Provider events are untrusted evidence until signed raw payload, binding, dedupe, and readback admission pass.
- **D-11:** Webhooks alone never grant entitlement. Internal source-owned billing state grants paid activation after admitted evidence and reconciliation rules.
- **D-12:** Billing state is append-only and idempotent with stable operation/evidence/receipt refs. Replay returns stored results without duplicate side effects.

### Reversals and reconciliation
- **D-13:** Failed payment, cancellation, refund, reversal, dispute, partial evidence, missing evidence, and manual no-repair are first-class readback states.
- **D-14:** Operator reconciliation compares internal rows to provider state, surfaces stale/missing/duplicate/disputed/mismatched/provider-unavailable records, and supports retry/no-repair actions.
- **D-15:** Provider secrets, raw payloads, card data, tokens, raw owner/contact data, and unredacted provider errors never appear in logs, public output, audit, or operator UI.

### Product/GTM/discovery claims
- **D-16:** Public copy may claim only the selected rail capabilities that have route/webhook/reconciliation smoke evidence.
- **D-17:** Discovery/payment descriptors remain absent unless selected-rail behavior actually implements quote/authorize/settle/reverse/reconcile/readback.
- **D-18:** Connect/x402/wallet/credits/request-market/custody/settlement copy fails scans unless a separate decision record approves and implements those surfaces.

### the agent's Discretion
- The planner may choose exact Autumn product/plan/feature modeling, Stripe PSP mapping, billing event/ledger shape, and reconciliation UI if they preserve the Autumn+Stripe decision, source-owned billing mirrors/readbacks, redaction, and no-core-rail-leak constraints.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Production spine
- `.planning/phases/02-05-PRODUCTION-MATURITY-CONTEXT.md` — cross-phase production posture, module seams, and evidence standard.

### Phase requirements
- `.planning/phases/05-paid-activation-money-rails/05-SPEC.md` — locked Phase 5 requirements, boundaries, acceptance, prohibitions.
- `.planning/ROADMAP.md` — Phase 5 objective, default rail, quarantine, bloat relapse detector.
- `.planning/STATE.md` — current Phase 1 execution state.

### Upstream authority
- `.planning/phases/04-owner-pending-protected-actions/04-SPEC.md` and `.planning/phases/04-owner-pending-protected-actions/04-CONTEXT.md` — authority, receipt/proof-gap, and reconstruction posture before money.
- `.planning/PROJECT.md` — future money-safe invariants, durable model, public interfaces.
- `.planning/SECURITY-SPEC.md` — redaction, auth, CSRF, audit, provider URL/secret rules.
- `.planning/AI-SPEC.md` — payment descriptors only when server-enforced behavior/readback exists.
- `.planning/GTM-READINESS.md` — claims register and payment/custody copy restrictions.
- `.planning/ENGINEERING-STANDARDS.md` — TypeScript/Convex/test standards.
- `.planning/SOURCE-MINING.md` and `.planning/source-mining/phase-1-ledger.md` — source-mining discipline and banned backup imports/symbols.
- `../Agentic-Economy-Backup/.planning/retro/FULL-MATURITY-GAP-REGISTER.md` — alpha maturity failures around receipts, provider proof, launch/deploy evidence, observability, and runtime phase-name leaks.

### Autumn/Stripe source evidence
- `../Agentic-Economy-Backup/.planning/phases/22-monetization-pricing-authority/22-00-SUMMARY.md` and `22-CONTEXT.md` — Autumn Cloud selected as managed billing/product-ops authority; Stripe remains PSP, not AE's direct subscription engine; AE fail-closed Convex mirror/readbacks remain product authority.
- `../Agentic-Economy-Backup/.planning/phases/22.1-billing-provider-activation-production-readiness/22.1-SPEC.md` and `.planning/codebase/INTEGRATIONS.md` — Autumn/Stripe provider activation, env posture, webhook signatures, customer portal readiness, product/plan mapping, and direct Stripe subscription rejection.
- `https://docs.useautumn.com/welcome`, `https://docs.useautumn.com/documentation/concepts/stripe.md`, `https://docs.useautumn.com/documentation/fail-open.md`, and `https://docs.useautumn.com/llms.txt` — official Autumn positioning, Stripe responsibility split, SDK fail-open default, and current API/documentation index.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Phase 1 supplies source-owned owner/admin authority, idempotency, audit, redaction, operator controls, and public projection posture.
- Phase 4 supplies the protected-action authority and receipt/proof-gap posture that money must not bypass.
- Backup evidence includes Autumn API-only billing integration plus Stripe PSP; fresh repo dependency choice must be current when implementing, and API-only remains the default until a package is explicitly approved with fail-closed/package-boundary tests.

### Established Patterns
- Provider integrations are adapters only when a real external dependency varies now.
- Provider evidence never becomes public/domain truth without source-owned admission and readback.
- Payment/public/discovery/GTM copy follows selected-rail behavior only.

### Integration Points
- Owner/admin UI for paid activation, billing status, receipts, failed payment/refund/dispute/cancellation, reconciliation, retry/no-repair.
- Autumn webhook route/action must preserve raw body for Svix/signature verification; any direct Stripe PSP/readback webhook must preserve raw body for Stripe signature verification.
- Public catalog/discovery may expose selected paid-state facts only after money decision and behavior exist.

</code_context>

<specifics>
## Specific Ideas

The narrow mature version is Autumn Cloud + Stripe PSP with real webhook/readback/reconciliation. Direct Stripe subscriptions, Connect, x402, wallet, credits-as-wallet, and custody are not maturity; they are separate products or fallback decisions.

</specifics>

<deferred>
## Deferred Ideas

- Direct Stripe Billing subscription engine, Stripe Connect, split payouts, marketplace settlement, wallet/credits/balance as a cash-like domain model, x402/crypto/USDC/custody/payment handlers, request-market settlement, and multi-rail billing stay out unless an evidence-backed Autumn blocker decision explicitly selects direct Stripe fallback for this paid-activation slice; that fallback still does not approve the other rails.

</deferred>

---

*Phase: 05-paid-activation-money-rails*
*Context gathered: 2026-06-27*

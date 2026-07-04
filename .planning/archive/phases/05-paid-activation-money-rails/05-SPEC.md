# Phase 5: Paid Activation + Money Rails — Specification

**Created:** 2026-06-27
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 8 locked

## Goal

AE can charge for paid activation through one selected Autumn+Stripe rail with provider readback, idempotent billing state, receipts, reversal/dispute handling, reconciliation, and operator reconstruction without leaking rail concepts into core catalog/discovery state.

## Background

Current repo state is planning-only and Phase 5 does not yet have a GSD phase directory. ROADMAP.md quarantines money until Phase 5 and now sets Autumn Cloud + Stripe PSP as the default: Autumn owns generic billing/product-ops, product/price configuration, subscription lifecycle, entitlement/readback, and customer portal workflows; Stripe handles payment collection, Checkout, invoices/receipts, refunds, and disputes beneath Autumn. The payment scout found useful backup invariants in Autumn-backed provider mapping, server-created billing operations, signed raw-body webhook verification, provider evidence normalization, idempotent ledger/receipt state, refund/reversal readbacks, and operator reconciliation; it also found wallet/credits/request-market/crypto/provider-console topology that…

## Requirements

1. **Money-rail decision record**: Phase 5 begins with a money-rail decision record that selects the default paid-activation rail: Autumn Cloud owns billing/product-ops authority and Stripe PSP handles checkout, invoices/receipts, refunds, disputes, and payment collection underneath.
   - Current: Phase 1-4 must not contain money rail fields; only future-money-safe IDs, audit, idempotency, and receipts are planned.
   - Target: A decision record fixes the Autumn+Stripe rail, product/pricing object, charge model, controller responsibilities, non-goals, data boundaries, and rollback/disable plan before code. Direct Stripe subscription authority is allowed only as a fallback after an evidence-backed Autumn blocker decision; Connect, x402, wallet, credits, custody, split payout, marketplace settlement, provider-specific billing IDs, and rail-specific fields stay out of core business/catalog/registry/discovery state.
   - Acceptance: Verifier can locate the decision record and prove core business/catalog/registry/discovery schemas do not contain rail-specific IDs or wallet/credit/balance fields.

2. **Server-created billing start**: Autumn attach/checkout/customer-portal or equivalent selected-rail start is server-side only, binds authenticated owner/business authority, plan or quote source state, idempotency key, correlation ID, and pending billing operation, and never trusts client-supplied amount, currency, customer ID, provider IDs, or entitlement.
   - Current: No checkout, subscription, billing, or payment state exists.
   - Target: One paid activation flow starts from source-owned pricing/plan state through the selected Autumn+Stripe rail and stores pending operation/readback before redirecting or opening provider-managed billing UI.
   - Acceptance: Tests prove valid creation stores pending operation; anonymous, wrong-owner, suppressed business, invalid plan, client-supplied amount/currency/customer/entitlement, duplicate replay, and same-key/different-body paths fail safely.

3. **Provider webhook and readback ingest**: Autumn webhook/readback ingest and any Stripe PSP readback verify signed raw payloads, retrieve provider state when required, normalize allowed paid/refunded/disputed events, deduplicate logical object keys, bind to pending operations, and never grant entitlement directly from a webhook alone.
   - Current: No provider webhook/readback adapter exists.
   - Target: Autumn/Stripe evidence rows become candidates for billing state transitions only after signature, binding, dedupe, and admission checks pass.
   - Acceptance: Tests prove invalid signature/raw-body mismatch fails closed, duplicate webhook is idempotent, unbound object is held for operator readback, direct subscription event does not grant entitlement, and retrieved provider state is required where configured.

4. **Append-only billing state and receipts**: Billing state, receipts, and paid activation are append-only and idempotent, with stable operation IDs, provider evidence refs, internal receipt IDs, running entitlement/readback state, and replay returning the stored result without duplicate side effects.
   - Current: Phase 1 audit/idempotency exists only as planned future-money-safe substrate.
   - Target: A billing/receipt module records paid activation and entitlement/readback state through append-only events or ledger entries, not mutable provider truth.
   - Acceptance: Tests prove successful paid activation creates one receipt/readback/entitlement transition, replay returns stored result, duplicate provider evidence does not duplicate rows, and every state links to correlation/operation/evidence refs.

5. **Refund, reversal, dispute, failed-payment, and cancellation posture**: Refund, reversal, dispute, failed-payment, and cancellation flows preserve history, require provider evidence or explicit operator reason, update billing/readback state through reversible ledger or receipt entries, and expose owner/operator next actions.
   - Current: No billing failure/reversal/dispute model exists.
   - Target: Negative money outcomes become first-class readbacks with typed states, reasons, and repair or no-repair action.
   - Acceptance: Tests prove failed payment, cancellation, refund, dispute, reversal, partial provider evidence, and manual no-repair states update readbacks without deleting original receipts or granting false entitlements.

6. **Operator reconciliation**: Operator reconciliation compares internal billing/receipt/readback rows with provider state, surfaces stale, missing, duplicate, disputed, or mismatched records, supports retry/no-repair decisions, and redacts provider secrets and raw private payloads.
   - Current: No money operator surface exists; Phase 1 operator controls cover only catalog/discovery/admin.
   - Target: Admin/operator readback can reconstruct money state and repair provider/internal mismatches without exposing secrets.
   - Acceptance: Forced mismatch, stale webhook, missing provider object, duplicate event, dispute hold, and redacted-secret fixtures appear in reconciliation readback with dispatchable retry/no-repair actions.

7. **Payment public/discovery/GTM claims gate**: Public, discovery, and GTM copy may claim payments or paid activation only after provider readback, idempotency, receipt, reversal/dispute, reconciliation, and smoke tests pass; payment handlers, x402, Connect, or paymentRequired descriptors remain absent unless the chosen rail enforces them.
   - Current: Phase 1 explicitly bans payment-ready copy and payment descriptors.
   - Target: Copy/schema/discovery/GTM claims are upgraded only for the selected rail and only where server-enforced behavior/readback exists.
   - Acceptance: Copy/discovery scans fail on unsupported payment handlers, x402, Connect, wallet, credits, paymentRequired, custody, settlement, or paid claims; selected rail claims pass only after route/webhook/reconciliation smoke evidence.

8. **Phase 5 closeout proof**: Phase 5 closeout proves successful checkout or subscription, duplicate replay, failed payment, webhook retry, refund/reversal, dispute, reconciliation mismatch, permission denial, and redaction paths while preserving Phase 1 to 4 truth and authority boundaries.
   - Current: No Phase 5 runtime or directory exists.
   - Target: A cold clone can run checkout/subscription, webhook/readback, receipt, reversal/dispute, reconciliation, redaction, and copy-scan tests for the selected rail.
   - Acceptance: Closeout evidence includes decision record, provider sandbox/readback, signed webhook tests, idempotent billing/receipt tests, refund/reversal/dispute tests, reconciliation readback, permission denial, redaction scan, and no leaked rail fields in core catalog/discovery.

## Boundaries

**In scope:**
- One money-rail decision record and one selected Autumn Cloud + Stripe PSP paid-activation rail; direct Stripe subscription authority is fallback only after the decision record names an evidence-backed Autumn blocker.
- Server-created Autumn attach/checkout/customer-portal or equivalent selected-rail start flow.
- Autumn webhook/readback ingest plus Stripe PSP evidence where applicable with signature, retrieval, normalization, binding, dedupe, and admission checks.
- Append-only billing/receipt/readback state with idempotent replay and stable refs.
- Refund/reversal/dispute/failed-payment/cancellation posture and owner/operator next actions.
- Operator reconciliation and repair/no-repair readbacks.
- Copy/discovery/GTM gates for payment claims and selected-rail evidence.
- Sandbox/local tests for success, failure, duplicate, retry, refund/reversal, dispute, reconciliation, permissions, and redaction.

**Out of scope:**
- Wallet/credits/balance/request-market settlement as the default domain model.
- Direct Stripe Billing/Checkout subscription authority, Stripe Connect Accounts v2, marketplace payouts, split charges, or controller responsibilities unless an evidence-backed Autumn blocker decision explicitly selects direct Stripe fallback for this paid-activation slice.
- x402/crypto/USDC/custody/payment-handler rails except as quarantined adapter candidates with explicit approval.
- Client-created amounts, currencies, customer IDs, provider IDs, entitlements, or direct webhook entitlement grants.
- Payment fields in core business/catalog/registry/discovery state unless approved by the money decision record.
- Provider-proof theatre from screenshots/env/config without server readback and reconciliation.
- Public payment/custody/settlement claims before provider readback, receipts, reversal/dispute, reconciliation, and smoke tests pass.

## Constraints

- Use current official Autumn and Stripe docs before implementing or reviewing money code.
- Default rail is Autumn Cloud + Stripe PSP; direct Stripe subscription authority is fallback only after an evidence-backed Autumn blocker, and all other rails remain out of scope.
- Autumn/Stripe hosted payment flows keep AE out of raw card handling; do not expand PCI/custody scope without explicit decision.
- Every provider event is untrusted until signature, binding, dedupe, and readback admission pass.
- Entitlement/paid activation derives from internal source-owned billing state, not provider webhooks alone.
- Provider secrets, raw payloads, PII, and payment details are redacted from logs/audit/readbacks.
- Core catalog/discovery public DTOs expose only selected, source-owned paid-state facts after gates; they do not become provider schemas.

## Acceptance Criteria

- [ ] Money-rail decision record selects one Autumn Cloud + Stripe PSP rail, product/pricing object, charge model, controller responsibilities, data boundaries, rollback/disable plan, and non-goals; direct Stripe subscription authority is selected only if the record proves an evidence-backed Autumn blocker.
- [ ] Core business/catalog/registry/discovery schemas remain free of unapproved Autumn refs, stripe*, x402, wallet, credits, balance, paymentHandler, provider IDs, and rail-specific fields.
- [ ] Server billing start binds owner/business authority, source-owned plan/quote, idempotency, correlation, pending operation, and selected Autumn+Stripe provider refs; client-supplied amount/currency/customer/provider/entitlement is ignored or rejected.
- [ ] Provider webhook/readback verifies signed raw payloads, retrieves provider state when required, normalizes allowed events, dedupes logical objects, binds pending operations, and does not grant direct entitlement.
- [ ] Paid activation creates append-only billing/receipt/readback state with stable operation/evidence/receipt refs and idempotent replay.
- [ ] Failed payment, refund, reversal, dispute, cancellation, missing evidence, and manual no-repair states preserve history and expose next actions.
- [ ] Operator reconciliation surfaces stale, missing, duplicate, disputed, mismatched, and provider-unavailable records with retry/no-repair actions and redacted evidence.
- [ ] Public/discovery/GTM copy claims only selected-rail capabilities that passed provider readback, idempotency, receipt, reversal/dispute, reconciliation, and smoke tests.
- [ ] Sandbox/local tests cover success, duplicate replay, webhook retry, invalid signature, unbound object, failed payment, refund/reversal, dispute, reconciliation mismatch, wrong-owner/permission denial, and redaction.
- [ ] Phase 1-4 truth boundaries remain intact: catalog/discovery still derive public facts from source-owned catalog/action state, not provider payloads.

## Product Design Pass

**Mode:** Shape/Harden for future implementation. Paid activation is a high-consequence owner/operator flow; copy, state, permission, and reversibility clarity are part of the payment contract.

**Primary user/job/object/outcome:**
- User: authorized owner starts and manages paid activation; hosted checkout/customer portal is a redirect destination, not an AE user role; admin/operator reconciles provider/internal state without initiating owner payment flows.
- Job: choose or confirm paid activation, complete server-created checkout/subscription, understand paid/failed/refunded/disputed state, and recover provider/internal mismatches.
- Object: money-rail decision, plan/quote, checkout/subscription operation, provider event/readback, receipt, entitlement/readback, reversal/dispute, and reconciliation record.
- Outcome: the owner sees exactly what they are paying for and what happened, while AE grants paid state only from source-owned, idempotent, reconciled evidence.

**User-visible surfaces to design:** paid activation entry/plan confirmation, checkout redirect handoff and return/cancel states, billing status/receipt readback, failed-payment/refund/reversal/dispute/cancellation notices, entitlement/readback state, operator reconciliation dashboard, retry/no-repair controls, and redacted provider-error display.

**Product decisions locked:**
- One selected rail starts paid activation; provider/rail choice and controller responsibilities are decision-recorded before UI copy claims capability.
- Client UI never supplies amount, currency, customer ID, provider ID, entitlement, or business authority.
- Entitlement copy follows internal billing/readback state, not raw Autumn/Stripe webhook arrival.
- Refunds, disputes, reversals, and failed payments preserve history and expose next action instead of erasing receipts.

**Reachable states that implementation must render:** paid activation unavailable, plan unavailable, owner unauthorized, valid plan confirmation, checkout creating, redirecting, canceled return, pending provider readback, paid/active, duplicate replay, failed payment, refund, reversal, dispute hold, cancellation, provider unavailable, invalid signature/unbound object held, reconciliation stale/missing/duplicate/mismatched, retry/no-repair, redacted provider error, mobile 375px, keyboard/focus path, and long plan/provider text.

**Product-design acceptance:** Closeout must include rendered paid activation, receipt/status, failure/dispute, and reconciliation evidence at compact and wide widths, keyboard/focus proof for owner/operator controls, copy scans proving no unsupported custody/settlement/x402/Connect/paymentRequired claims, and redaction evidence for provider errors and sensitive payment data.

## Edge Coverage

**Coverage:** 12/12 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | R1 | ⛔ dismissed | Decision-record requirement is verified by explicit acceptance; money data-operation edges are covered by R2-R8. |
| boundary, precision | R2 | ✅ covered | Acceptance covers owner/business/plan boundaries and exact rejection of client-supplied amount/currency/customer/entitlement. |
| unclassified | R3 | ⛔ dismissed | Webhook/readback requirement enumerates signature, retrieval, normalization, dedupe, binding, and no-direct-entitlement checks. |
| unclassified | R4 | ⛔ dismissed | Append-only billing state is covered by idempotent replay and duplicate evidence acceptance. |
| idempotency, concurrency | R5 | ✅ covered | Acceptance covers failed/refund/reversal/dispute/cancellation races and history-preserving idempotent state updates. |
| idempotency, concurrency | R6 | ✅ covered | Acceptance covers retry/no-repair, stale/missing/duplicate/mismatched records, and concurrent reconciliation. |
| unclassified | R7 | ⛔ dismissed | Claims gate is enforced by copy/discovery/GTM scans and selected-rail smoke evidence. |
| idempotency, concurrency | R8 | ✅ covered | Closeout explicitly covers duplicate replay, webhook retry, reconciliation mismatch, and permission/race paths. |

## Prohibitions (must-NOT)

**Coverage:** 6/6 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT grant paid activation or entitlement directly from an unsigned/unbound/unread provider webhook. | R3, R4 | resolved | test: webhook signature, binding, retrieval, dedupe, and admission tests. |
| MUST NOT let client input supply amount, currency, provider customer ID, entitlement, business authority, or billing state. | R2 | resolved | test: server-created checkout/subscription and wrong-owner/client-tamper tests. |
| MUST NOT introduce wallet/credits/balance/request-market settlement as the default Phase 5 domain model. | R1, R8 | resolved | test + judgment: decision record and source-mining scans. |
| MUST NOT leak stripe*, x402, wallet, credits, balance, paymentHandler, or provider IDs into core business/registry/discovery state without explicit decision-record approval. | R1, R7, R8 | resolved | test: schema/import/discovery scans. |
| MUST NOT claim payment, custody, settlement, Connect, x402, or paymentRequired capability in public/discovery/GTM copy before the selected rail enforces and reads it back. | R7 | resolved | test + judgment: copy/discovery/GTM scans and launch gate. |
| MUST NOT log or expose provider secrets, raw payment payloads, card data, tokens, raw private owner/contact data, or unredacted provider errors. | R3, R6, R8 | resolved | test: redaction/log/readback scans. |

Canon security/compliance items such as CSRF, injection, SSRF, generic OWASP controls, cookie/session handling, provider-secret hygiene, and privacy law baselines remain owned by SECURITY-SPEC.md, secure-phase/code review, and implementation tests. This section records only phase-specific product and architecture prohibitions.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes |
|--------------------|-------|------|--------|-------|
| Goal Clarity       | 0.84  | 0.75 | ✓      | Paid activation through one selected rail is measurable. |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | Default rail, quarantines, and out-of-scope money bloat are explicit. |
| Constraint Clarity | 0.84  | 0.65 | ✓      | Provider readback, idempotency, receipt, reversal, reconciliation, and redaction constraints are locked. |
| Acceptance Criteria| 0.86  | 0.70 | ✓      | Criteria cover checkout, webhook, ledger/receipt, disputes, reconciliation, copy, and redaction. |
| **Ambiguity**      | 0.15  | ≤0.20| ✓      | Gate passed from roadmap, Phase 1 context, and phase-specific source-mining scouts. |

Status: ✓ = met minimum, ⚠ = below minimum.

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 0 | Researcher | Current state scout | P5 is roadmap-only; Phase 1-4 must keep money fields quarantined while building authority/audit/idempotency. |
| 1 | Simplifier | What is the safest default money rail? | Autumn Cloud + Stripe PSP unless an evidence-backed Autumn blocker decision explicitly selects direct Stripe fallback for this paid-activation slice. |
| 1 | Boundary Keeper | What must stay out? | No direct Stripe subscription engine without an Autumn blocker decision, wallet/credits/request-market settlement, Connect/x402/custody, direct webhook entitlements, or rail fields in core without decision approval. |
| 2 | Edge Probe | Resolve 12 applicable edge probes | Boundary/precision/idempotency/concurrency cases are specified; non-data decision/claims rows dismissed with reasons. |
| 3 | Prohibition Probe | Resolve Phase 5 must-NOTs | Six money-specific prohibitions are resolved into tests or judgment review. |

---

*Phase: 05-paid-activation-money-rails*
*Spec created: 2026-06-27*
*Next step: /gsd:discuss-phase 5 — implementation decisions (how to build what is specified above)*

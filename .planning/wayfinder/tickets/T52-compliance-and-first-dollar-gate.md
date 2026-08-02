# T52 — Compliance and first-dollar gate

Labels: `wayfinder:task`, `tdd:red`, `counsel`, `money`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source tickets: T34, T40.
Status: landed + verified at the source/local-smoke evidence boundary — the counsel pack records **LIVE MONEY: REFUSED** in `.planning/research/2026-08-01-compliance-first-dollar-counsel-pack.md:5,59`; source gate/binding, Convex admission guards and the corrected top-up copy are landed in `src/modules/money/internal/live-money-gate.ts`, `src/modules/money/public.ts`, `convex/moneyLedger.ts` and `src/components/ae/console/AeCreditTopUpPanel.tsx`, with source verification in `output/release/final-gate-2.log`; open: counsel sign-offs, so executable live payment/reconciliation remains refused.

Blocked by: T49 for executable authority/receipt semantics. Counsel/research can proceed in parallel.

## Outcome

AE can state its role, charge/refund/reconcile, issue required records and honor privacy/complaint rights without presenting unsettled legal conclusions as product claims. Until then, live money refuses safely.

## Public seam

Human paid Lock/repeat permission, agent paid invocation, receipt/invoice/readback, privacy/terms/complaint/access/correction/deletion surfaces.

## Red

Top-up currently refuses when Stripe is unavailable, which is safe. Public supply copy claims a price/5% fee/share before role/tax counsel. Privacy/terms are descriptive and do not define operational retention, access, correction, complaint or deletion behavior. No counsel pack exists.

## Minimal green

1. Produce a counsel decision pack, clearly separating source facts, founder commercial choices and questions requiring Australian counsel/accountant advice.
2. Decide and encode AE's role for buyer/provider transactions, GST registration/tax-invoice responsibilities, provider payout/refund/dispute/chargeback handling and record retention.
3. Remove or qualify any fee/share/role claim not supported by the accepted decision.
4. Add explicit consent/notice and operational access, correction, complaint and deletion request flows over public receipts while preserving legally required evidence.
5. Bind paid authorization to exact amount/currency/provider/action/version, expiry and idempotency; material widening requires fresh approval.
6. Keep no-charge refusal as the default until live Stripe/Connect admission, reconciliation and invoice behavior pass.
7. Use the same semantics for human and agent hosts.

## TDD tracer bullets

- paid Lock without accepted gate or Stripe readiness → no-charge refusal;
- exact approved payment → one debit/settlement receipt and required invoice record;
- retry/refund/provider failure → no duplicate debit, explicit reconciliation disposition;
- widened amount/provider/action → fresh approval required;
- privacy access/correction/complaint/deletion request → attributable receipt and lawful preservation/redaction behavior;
- human/agent paid calls → same authority and receipt semantics.

## Adopted seams

Existing Stripe/ledger/reconciliation modules, Action Invocation authority, Clerk identity, notification outbox and public policy routes. Legal conclusions require Australian counsel/accountant sign-off; implementation never invents them.

## Acceptance

- Counsel pack cites current primary sources and records named decisions/sign-offs.
- No live charge occurs while any required role/tax/refund/privacy decision is open.
- Invoice, refund, dispute and reconciliation evidence is durable and customer-safe.
- Public copy matches executable behavior.
- Secrets/payment data remain bounded and excluded from evidence artifacts.

## End condition

Either the gate is accepted and one supervised real payment is reconciled end-to-end, or live money remains explicitly refused while T53 uses signed paid pilots only.

## Primary external grounds

ATO GST registration and tax invoices; OAIC Australian Privacy Principles; ACCC selling-online obligations; ASIC company/role records. Revalidate current official guidance during counsel-pack execution.

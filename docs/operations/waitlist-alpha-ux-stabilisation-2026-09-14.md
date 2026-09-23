# Waitlist alpha UX stabilisation

## Goal

Make Balance, Provider Tools, and Calls understandable and reliable without changing payment pricing, tax treatment, ledger semantics, publication guarantees, or production-money controls.

## Behaviour contracts

- A top-up preview is read-only and uses the same current commercial-policy controls as server admission. Policy drift refuses before Stripe creates a payment.
- One logical top-up keeps one idempotency key until success or failure. Pending or unknown outcomes offer status refresh, never a new payment.
- One funding transaction appears as one customer Balance-history event. Its funding receipt and fee/GST document remain separate supporting records linked by the stored transaction reference.
- Balance, documents, and administrative reads fail independently. Unknown balance is never displayed as zero, and secondary failures do not hide a known balance.
- Balance history covers credited top-ups and paid/refunded Calls. Calls remains the usage surface.
- One Tool state owns buyer availability and the next action. Draft source and connection facts come from the saved draft; no draft is made public by presentation changes.
- Calls remain visible when usage or spend summaries fail. One error and one retry describe the partial state.

## Finding tracker

| Finding | Intended resolution | Status |
| --- | --- | --- |
| Split top-up documents and six-decimal amounts | Group by source transaction and use the buyer-facing money formatter | Done |
| Misleading/fixed funding preview | Read authoritative constraints through the authenticated server boundary and bind the policy digest into admission | Done |
| Calls-only activity on Balance | Present Balance history; keep full usage on Calls | Done |
| Internal payment-return copy and unsafe retry cues | Outcome/next-action copy with retained idempotency locator | Done |
| Accounting administration on everyday Balance | Collapse details; surface only active exceptions | Done |
| All-or-nothing reads and zero fallback | Independent read results; explicit unknown state | Done |
| Draft status contradictions | Derive saved source/connection facts; reuse integration-owned Draft continuation fix | Data facts done; continuation dependency |
| Operations/Public status clutter | Tools vocabulary, one status presentation, collapsed administration | Done |
| Duplicated Calls errors without retry | Partial loader contract and one retry | Done |

## External dependency

The Draft continuation change in integration task `01a095c6-46d5-7401-a7ab-b1725ead5fe3` remains the source of truth and is not duplicated here. Hosted acceptance remains unproven until the resulting changes are integrated and deployed.

## Verification record

- Focused contract and integration tests: 79 passed.
- TypeScript typecheck: passed.
- Lint: passed with warnings denied.
- React Doctor: concrete loading/export findings fixed; four maintainability-only complexity warnings remain.
- Convex generated-code dry run: blocked because this checkout does not have access to its selected Convex project; the selected environment was not changed.
- Hosted report-only QA: auth routing and public runtime passed; authenticated feature acceptance blocked by the absence of a browser session. See `.gstack/qa-reports/qa-report-waitlist-alpha-2026-09-14.md`.

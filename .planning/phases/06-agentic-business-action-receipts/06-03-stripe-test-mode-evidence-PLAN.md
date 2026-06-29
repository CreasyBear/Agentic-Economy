---
phase: 06-agentic-business-action-receipts
plan: "06-03"
type: execute
wave: 3
depends_on: ["06-02"]
files_modified:
  - src/modules/business-action/internal/stripe-checkout.ts
  - src/routes/api.business-actions.stripe-webhook.ts
  - tests/unit/business-action/stripe-checkout-evidence.test.ts
autonomous: true
requirements: [P6-R5, P6-R6, P6-R8, P6-R9, P6-R12, P6-R13]
user_setup: []
execution_scope: source_local_hackathon_spike
production_executable: false
must_haves:
  truths:
    - id: p6-stripe-decision-record
      statement: "Direct Stripe test-mode evidence obeys 06-MONEY-EVIDENCE-DECISION.md and cannot create paid activation, subscription authority, live money, Connect, x402, wallet, custody, settlement, or public payment claims."
    - id: p6-stripe-checkout-session
      statement: "The only first-plan Stripe object is a server-created Checkout Session in payment mode."
    - id: p6-stripe-webhooks
      statement: "checkout.session.completed is the only accepted success event; expired, failed, unknown, unbound, wrong amount/currency/checkpoint, duplicate-conflicting, and invalid signature events are held, ignored, or rejected."
  artifacts:
    - path: src/modules/business-action/internal/stripe-checkout.ts
      provides: "Server-only Stripe Checkout Session evidence adapter."
    - path: src/routes/api.business-actions.stripe-webhook.ts
      provides: "Raw-body Stripe webhook admission adapter."
    - path: tests/unit/business-action/stripe-checkout-evidence.test.ts
      provides: "Stripe binding, signature, event, dedupe, and proof-gap tests."
  key_links:
    - from: 06-MONEY-EVIDENCE-DECISION.md
      to: stripe-checkout adapter
      via: "test-mode Checkout Session object and exact webhook event handling."
    - from: checkout.session.completed
      to: ActionReceipt
      via: "accepted checkpoint, amount/currency, request/checkpoint refs, idempotency key, and payload hash."
---

<objective>
Implement server-owned Stripe Checkout Session test-mode evidence as downstream evidence for accepted Phase 6 requests.

Purpose: prove the money-evidence boundary without using Phase 5 paid activation as paid-intake authority.
Output: Stripe test-mode adapter, webhook route, and unit tests. Closeout must state `source/local proof only` and `production proof not claimed`.
</objective>

<execution_context>
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/workflows/execute-plan.md
@/Users/skchan/Jcsyc_Projects/agentic-economy/.codex/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/SECURITY-SPEC.md
@.planning/phases/06-agentic-business-action-receipts/06-MONEY-EVIDENCE-DECISION.md
@.planning/phases/06-agentic-business-action-receipts/06-02-SUMMARY.md
@src/modules/business-action/public.ts
@src/modules/business-action/business-action.functions.ts
@src/lib/server/billing-provider.ts
</context>

<preflight_gates>
- Requires 06-02 source persistence summary.
- `06-MONEY-EVIDENCE-DECISION.md` is accepted and controls this plan.
- Production/deployed Stripe proof remains BLOCKED until provider smoke passes with configured evidence.
</preflight_gates>

<hackathon_spike_exception>
This plan may implement test-mode evidence and fail-loud local smoke prerequisites. It may not claim live money, deployed provider proof, paid activation, or production payment support.
</hackathon_spike_exception>

<money_evidence_decision>
- Object type: server-created Checkout Session in `payment` mode.
- Accepted webhook event: `checkout.session.completed`.
- Held/ignored events: `checkout.session.expired`, `payment_intent.payment_failed`, unknown event types, unbound events, duplicate-conflicting events, wrong amount/currency/checkpoint/request events.
- Rejected events: invalid signature, malformed body, expired timestamp, missing required object refs, raw-body mismatch.
</money_evidence_decision>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Implement server-owned Checkout Session evidence binding</name>
  <files>src/modules/business-action/internal/stripe-checkout.ts, tests/unit/business-action/stripe-checkout-evidence.test.ts</files>
  <read_first>.planning/phases/06-agentic-business-action-receipts/06-MONEY-EVIDENCE-DECISION.md, .planning/SECURITY-SPEC.md, src/modules/business-action/public.ts</read_first>
  <action>Implement a server-only Stripe Checkout Session evidence adapter using existing dependencies and official REST semantics. Bind `client_reference_id` and metadata to business action request ID, authorization checkpoint ID, action slug `provision-paid-intake-endpoint`, mandate hash, request hash, card hash, amount, currency, idempotency key, and correlation ID. Reject caller-supplied amount, currency, customer ID, provider object ID, success URL, cancel URL, paid state, entitlement, and receipt status.</action>
  <verify>npx vitest run tests/unit/business-action/stripe-checkout-evidence.test.ts</verify>
  <acceptance_criteria>
    - Tests prove Checkout Session binding includes all required AE refs and hashes.
    - Tests prove client-supplied money/provider/URL/authority fields are rejected.
    - No new package is installed; if needed, stop for package legitimacy audit.
  </acceptance_criteria>
  <done>Checkout Session creation is source-bound and test-mode only.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Implement Stripe webhook event admission rules</name>
  <files>src/routes/api.business-actions.stripe-webhook.ts, src/modules/business-action/internal/stripe-checkout.ts, tests/unit/business-action/stripe-checkout-evidence.test.ts</files>
  <read_first>.planning/phases/06-agentic-business-action-receipts/06-MONEY-EVIDENCE-DECISION.md, src/modules/business-action/business-action.functions.ts, src/lib/server/billing-provider.ts</read_first>
  <action>Implement a webhook adapter that preserves raw body for `Stripe-Signature` verification before parsing/admission. Admit `checkout.session.completed` only when signature, request, checkpoint, amount, currency, object refs, and payload hash match source state. Dedupe by Stripe event ID plus Checkout Session/PaymentIntent refs plus request/checkpoint refs. Hold unbound, wrong-request, wrong-checkpoint, wrong-amount, wrong-currency, duplicate-conflicting, expired, failed, and unknown events. Reject invalid signatures, malformed bodies, expired timestamps, missing refs, and raw-body mismatch.</action>
  <verify>npx vitest run tests/unit/business-action/stripe-checkout-evidence.test.ts</verify>
  <acceptance_criteria>
    - `checkout.session.completed` is the only accepted success event.
    - Tests cover invalid signature, duplicate, unbound, wrong amount/currency, wrong checkpoint, expired, failed, and unknown events.
    - Raw Stripe payload is discarded or represented only by private evidence refs.
  </acceptance_criteria>
  <done>Webhook event handling cannot create false paid-intake proof.</done>
</task>

</tasks>

<verification>
- [ ] npx vitest run tests/unit/business-action/stripe-checkout-evidence.test.ts
- [ ] npm run typecheck
</verification>

<success_criteria>
- All tasks completed.
- Stripe evidence remains test-mode, source-bound, and non-authoritative.
- Provider smoke absence is not external proof.
- Closeout states `source/local proof only` and `production proof not claimed`.
</success_criteria>

<output>
After completion, create `.planning/phases/06-agentic-business-action-receipts/06-03-SUMMARY.md`.
</output>

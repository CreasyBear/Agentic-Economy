# CustomerRequest mechanism inversion premortem

**Date:** 2026-07-12  
**Decision:** Stop the current linear build after `PreparedAction`. Do not begin approval until the preparation, customer-decision, and external-agent boundaries below are proven.

## Customer job

An external AI or human asks AE to compare real connected businesses and safely complete one bounded business action. AE must create an intelligible decision before commitment, bind exact delegated authority, and return evidence-qualified progress, recovery, and a usable result. The neutral routing kernel is hidden infrastructure.

The shipping tracer expresses the job concretely:

> Compare real courier options for this parcel and buy the label I approve.

## Inversion

Assume AE shipped the current plan and failed twelve months later. The causes were:

1. **AE started after the hard work.** Callers had to translate intent into capability IDs, actions, and typed inputs before AE could help. External agents continued browsing or calling providers directly.
2. **A technically exact quote became permanently stale.** One prepared or refused state could not be superseded when a quote expired, supply changed, or terms changed.
3. **Private quote data escaped through asserted authority.** `PreparationGrant` was accepted as command data rather than verified authority, and recipient exposure was not durably budgeted across retries and generations.
4. **The reference action could not use the real kernel.** Structured preparation data was refused, while real shipping, booking, and purchasing quotes require bounded data disclosure.
5. **The recommendation was theatre.** Cost or routing latency was presented as customer value without normalized comparability, coverage, customer-fit dimensions, actual tradeoffs, or ranking-integrity rules.
6. **One-provider success proved an adapter, not routing.** AE purchased one label but did not prove that its graph improved choice, control, or recovery.
7. **Approval hardened protocol before comprehension.** The plan implemented approval and dispatch before proving customers could understand the decision and post-action state.
8. **Safe execution still produced an unusable result.** Kernel completion did not guarantee a typed label, booking, order, or other customer outcome.
9. **The external AI became a protocol operator.** The agent had to manage revisions, digests, polling, and recovery instead of receiving stable customer-semantic states and next actions.
10. **A failed transaction had no support object.** Signed evidence existed, but customers could not report a problem, identify decision authority, or understand the next safe action.

## Engineering gates before approval

- A Request revision mutation uses compare-and-swap, preserves history, and invalidates stale Plans, PreparedActions, and grants.
- A `PreparationRevision` can supersede expired, refused, supply-changed, customer-changed, and terms-changed preparation without deleting history. Idempotency is scoped to one generation.
- Preparation authority is verified independently. Field, recipient, purpose, expiry, and cumulative exposure budgets are claimed durably before any provider call.
- The kernel accepts typed, recipient-bounded quote preparation; never smuggle private values into a query string or bypass kernel authority in an outer adapter.
- `PreparedAction` binds Request, PlanRevision, capability-contract, provider, quote, input, cost, disclosure, term, cancellation, expiry, fallback, and ranking-evidence digests.
- Provider affinity is enforced for offer-bound purchase or booking actions.
- Recommendation reasons and commercial terms are evidence-qualified. Consequential preparation refuses incomplete decision material.
- Upstream action outputs are resolved by the server from typed attempt evidence, never accepted as authoritative caller input.
- Durable concurrent/restart tests exercise Convex plus the real kernel adapter. In-memory fixtures are not release proof.

## Product and customer gates

- Natural-language intent plus known facts compiles only into registered capabilities and typed inputs.
- Clarification asks only for decision-changing missing information and distinguishes hard constraints, preferences, substitutions, and completion criteria.
- The decision surface discloses eligible, quoted, and excluded coverage; one option is never called “best.”
- At least two real overlapping offers prove normalized comparison and the graph's value for the tracer.
- The customer can identify the business, service, total or strict maximum, data recipients and purposes, commitment, expiry, cancellation posture, and decisive tradeoffs.
- Human and agent surfaces project the same semantic state and next action without internal protocol vocabulary.
- One material boundary produces one confirmation. The caller agent and AE do not double-prompt for the same digest.
- A cold external client completes create, clarify, review, approve, resume, and result without repo knowledge or AE-specific prompt engineering.
- The tracer beats a declared direct baseline on at least one dimension: integration work, option coverage, decision time, authority control, or recovery—without losing hard-constraint accuracy.
- When AE has no advantage or connected supply, it returns an honest unsupported or direct-path handoff.

## Measurable end conditions

1. **Intent fidelity:** every hard constraint is represented or explicitly rejected; no consequential field is silently inferred.
2. **Clarification efficiency:** median no more than one clarification for the tracer when required facts exist in caller context.
3. **Supply truth:** coverage and freshness are disclosed; at least two real comparable quotes prove routing value.
4. **Decision quality:** the selected option satisfies every hard constraint and cites two to four customer-relevant reasons or tradeoffs.
5. **Comprehension:** at least 90% of representative reviewers correctly identify business, amount or bound, data recipient/purpose, commitment, expiry, and cancellation consequence.
6. **Authority integrity:** every tamper, replay, substitution, widening, stale, forged, and expired case refuses before release.
7. **Effect integrity:** exactly one provider effect survives retries, crashes, and reconnects; `outcome_unknown` never causes blind retry.
8. **State truth:** requested, provider-accepted, completed, cancellation-pending, and unknown remain distinct.
9. **Result utility:** the customer receives a typed, usable artifact/reference/status without inspecting protocol evidence.
10. **Agent interoperability:** a cold external agent finishes the canonical journey through HTTP/JSON and can resume asynchronously.
11. **Differentiated utility:** AE proves a declared advantage over the direct path, or the closeout fails.

## Corrected route

```text
CustomerRequest contracts
  -> compile and revise Request into registered PlanRevision
  -> verify preparation authority and cumulative disclosure budgets
  -> kernel-native structured quote preparation and provider affinity
  -> persist supersedable evidence-complete PreparedAction
  -> define ranking integrity and comparable options
  -> prove the customer decision experience
  -> bind exact authenticated approval
  -> dispatch and recover without duplicate effects
  -> build activity, support, and recovery projections

In parallel after preparation:
  -> qualify two real overlapping provider bindings
  -> publish the external CustomerRequest HTTP/JSON contract

All converge on:
  -> one real hosted customer action
  -> problem reporting and evidence export
  -> product-value and canonical closeout
```

## Primary-source convergence

- OpenAI distinguishes confirmation before consequential external actions and evaluates whether agents remember to confirm: [ChatGPT agent user confirmations](https://deploymentsafety.openai.com/chatgpt-agent/user-confirmations).
- OpenAI's agentic checkout binds confirmation to a transaction while the merchant remains merchant of record and handles fulfillment/support: [Buy it in ChatGPT](https://openai.com/index/buy-it-in-chatgpt/).
- Anthropic reports that repeated approval prompts create fatigue and argues for bounded permissions and containment: [How we contain Claude](https://www.anthropic.com/engineering/how-we-contain-claude).
- MCP elicitation separates review, edit, decline, cancellation, and out-of-band completion: [MCP elicitation specification](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation).
- Stripe models payment as a durable lifecycle with action-required, processing, succeeded, and canceled states: [PaymentIntent lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle).
- Uber presents upfront terms and requires a new decision when materially repriced: [Uber upfront fares](https://www.uber.com/us/en/blog/upfront-fares/).
- Airbnb distinguishes pending, declined, expired, and confirmed states and presents fee-inclusive booking totals: [Reservation status](https://www.airbnb.com/help/article/2810), [total price display](https://www.airbnb.com/help/article/3610).
- ChatGPT shopping research asks decision-changing follow-ups, provides a small comparison with tradeoffs, and requires final price/availability verification: [Shopping research](https://help.openai.com/en/articles/12911370-using-shopping-research-in-chatgpt).
- SAP Ariba separates request, approval, supplier order, confirmation, receipt, change, and cancellation: [Purchase orders](https://learning.sap.com/courses/sap-ariba-procurement-buying/defining-purchase-orders).

## Go / no-go

**Go:** re-chart the Wayfinder dependencies and work next on Request-to-Plan compilation, verified preparation authority, and kernel-native structured preparation.

**No-go:** close the current PreparedAction ticket, begin exact approval, implement dispatch, or treat one in-memory/one-provider tracer as product validation.

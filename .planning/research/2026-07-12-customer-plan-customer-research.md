# Customer Plan customer research and inverse premortem

**Date:** 2026-07-12  
**Question:** Does the proposed `CustomerPlan` mechanism create an intelligible, trustworthy experience for a customer delegating business work to an external AI?  
**Method:** Source audit plus primary-source comparison across payments, transport, booking, shopping/research, and procurement.

## Verdict

Do not build the customer UI on the current Plan contract unchanged.

The existing source is a strong technical tracer for composing atomic kernel runs: it binds dependent outputs, prevents the proposing agent from authorizing its own consequential action, expires approval, and holds an unknown outcome instead of releasing a duplicate action. It does not yet represent the commercial decision a customer must understand.

The decisive flaw is the order of operations. The customer approves a purchase before the kernel selects its executing provider and creates the executable quote. The approval therefore binds a ceiling and raw inputs, not the actual business, final price, or commercial terms. The later purchase route is also not constrained to the business that issued the earlier provider quote.

Preserve the planning concept above the neutral kernel, but make the durable customer contract a `CustomerRequest` and add an immutable prepared-action boundary:

1. Understand the request and constraints.
2. Find and prepare viable options without releasing a consequential effect.
3. Show a small decision set and recommendation.
4. Bind approval to one exact prepared action.
5. Execute that exact still-valid action without rerouting.
6. Maintain a customer-readable activity, recovery, cancellation, and evidence record.

## Current source evidence

### What is already sound

- A Plan has a stable proposal digest and immutable action graph (`src/modules/customer-plan/public.ts:114-126`).
- Action outputs can supply later action inputs, giving the system a real composition seam (`src/modules/customer-plan/public.ts:208-223`).
- Consequential approval is bound to plan, proposal, action, capability, resolved input, spend ceiling, currency, and data-field names (`src/modules/customer-plan/public.ts:217-223`).
- The proposing agent cannot approve in place of the principal, and expired approvals cannot release an action (`src/modules/customer-plan/public.ts:177-190`).
- Running and outcome-unknown are distinct in the reducer (`src/modules/customer-plan/public.ts:129-165`). The adapter still needs different recovery commands: kernel dispatch-pending recovery replays the exact execute command, while outcome-unknown recovery reconciles and must never create a second release.
- The adapter enforces capability, currency, spend, and data-budget compatibility before release (`src/modules/customer-plan/kernel-adapter.ts:90-125`).

These are kernel-facing safety properties. They are necessary and should remain.

### P0: approval occurs before the real commercial action is prepared

`decideCustomerPlan` returns `approval_required` for a consequential action while the action is still only a proposal (`src/modules/customer-plan/public.ts:129-160`). Only after that approval does `executeNextCustomerPlanAction` call `kernel.operations.route`, receive a selected graph, and inspect its cost, provider bindings, and data fields (`src/modules/customer-plan/kernel-adapter.ts:74-125`).

Consequences:

- The customer cannot see the selected business before approving.
- The customer sees a maximum spend, not the selected quote's actual or maximum total.
- The customer cannot see why this provider was selected or compare it with alternatives.
- The approval cannot bind cancellation/refund terms, timing, availability, or the commercial commitment being formed.
- If routing changes after approval but remains under the broad limits, the release still proceeds.

**Required correction:** add a `prepared` action state containing an immutable route/quote digest, selected business, exact and maximum cost, expiry, data recipients and purposes, expected timing, commitment and cancellation terms, and decision evidence. Approval binds that digest. Execution consumes that exact quote. Expiry or material change forces a human-readable reapproval diff.

### P0: quote issuer and purchase provider are not bound

The shipping tracer passes a `providerQuoteRef` from a quote action into the purchase action. The purchase action nevertheless performs a fresh route. The adapter validates only capability-contract equality, not that the selected purchase binding belongs to the business that issued the quote (`src/modules/customer-plan/kernel-adapter.ts:79-103`).

**Required correction:** normalized capability contracts must express offer/provider affinity. A purchase based on a provider offer must be constrained to the offer issuer unless a brokered transfer is explicitly modeled and disclosed. An opaque string reference is insufficient.

### P0: data disclosure is incorrectly coupled to effect type

Only `consequential` actions require approval (`src/modules/customer-plan/public.ts:144-160`). An `observation` can therefore route and execute automatically while disclosing customer data. The shipping quote tracer sends a destination postcode.

Reading information and disclosing information are different customer consequences. Approval/checkpoint policy must be independently derived from:

- money movement or reservation of funds;
- disclosure sensitivity, recipient, purpose, retention, and onward use;
- creation of a legal or operational commitment;
- reversibility and cancellation cost;
- organizational policy.

### P1: the Plan cannot express a decision

The Plan represents actions and one selected route, but not:

- viable options;
- recommendation and rationale;
- meaningful tradeoffs;
- customer selection;
- excluded options and decisive constraints;
- confidence, freshness, or coverage limitations.

The adapter discards route-selection evidence after choosing a quote. A customer-facing Plan would therefore be opaque automation rather than assisted decision-making.

### P1: the lifecycle is incomplete

Current action states are only `pending`, `approved`, `running`, `completed`, and `outcome_unknown` (`src/modules/customer-plan/public.ts:24-36`). Refusal is returned by the adapter but not persisted into the Plan (`src/modules/customer-plan/kernel-adapter.ts:17-54`, `260-265`). There are no events for decline, edit, reprepare, failure, block, cancel, partial completion, dispute, refund, or recovery.

The Plan also lacks a durable activity/evidence timeline. A latest-state snapshot cannot answer what changed, what the user approved, what was disclosed, what the business accepted, or what evidence supports a dispute.

### P1: raw generic records cannot support a mature customer UI

The approval exposes maximum spend, raw data-field names, and resolved input (`src/modules/customer-plan/public.ts:61-70`). Completed output is a nested `Record<string, string>` (`src/modules/customer-plan/public.ts:73`). These contracts cannot reliably render:

- a price breakdown;
- named provider and recipient;
- delivery promise;
- cancellation deadline and consequence;
- booking/order status;
- result artifact;
- support and dispute evidence.

Capability contracts need typed customer summaries and typed result projections while retaining raw machine evidence below them.

## Primary-source comparison

### Stripe: lifecycle and action-required boundaries

Stripe's PaymentIntent persists the payment lifecycle rather than treating a payment as one request/response. Its public states distinguish `requires_payment_method`, `requires_confirmation`, `requires_action`, `processing`, `succeeded`, and `canceled`. Cancellation is explicitly state-dependent and can fail for some processing methods. A failed attempt can return to a recoverable state rather than collapsing into generic failure. This supports a durable Plan with honest pending, intervention, retry, success, and cancelability semantics.

Source: [Stripe, How PaymentIntents and SetupIntents work](https://docs.stripe.com/payments/paymentintents/lifecycle)

Stripe also models disputes as a separate lifecycle with claim, evidence, deadline, review, and outcome. Stripe explicitly says it facilitates the case but does not control the bank's decision. AE should make the same authority distinction: preserve evidence and route the issue without claiming it adjudicates external reality.

Source: [Stripe, How disputes work](https://docs.stripe.com/disputes/how-disputes-work)

### Uber: exact decision before request and reapproval after change

Uber asks for pickup/destination, shows an upfront fare, and lets the rider choose before requesting. It does not expose dispatch mechanics as the primary decision. Uber also says that changing trip details can trigger a revised price that the rider must approve. Cancellation remains available but may carry a fee, which is visible on the receipt.

Sources:

- [Uber, Upfront fares: no math, no surprises](https://www.uber.com/us/en/blog/upfront-fares/)
- [Uber Help, How does Upfront Pricing work?](https://help.uber.com/driving-and-delivering/article/how-does-upfront-pricing-work?nodeId=d692561d-debe-4f25-9a23-9e482d859326)
- [Uber Help, Review my cancellation fee](https://help.uber.com/en/riders/article/problem-with-cancellation-fee?nodeId=bb8fbdfd-30dd-42b3-b53f-d4a201d63a6a)

AE implication: prepare first, approve the actual commercial offer, and invalidate/re-request approval when a material field changes.

### Airbnb: total, contract formation, and bounded pending states

Airbnb exposes a fee-inclusive total before booking and retains a price breakdown at checkout. Its terms identify booking confirmation as the point at which a contract with the host is formed. Pending, declined, expired, and confirmed are distinct; pending states have a reason, time bound, refund consequence, and available cancellation path.

Sources:

- [Airbnb, Pricing display in the United States](https://www.airbnb.com/help/article/3610)
- [Airbnb, Terms of Service, searching and booking](https://www.airbnb.com/help/article/2908)
- [Airbnb, What is the pending status for a reservation?](https://www.airbnb.com/help/article/2810)

AE implication: the approval screen must say exactly what commercial commitment will form, with whom, for how much, under what cancellation terms. `Waiting` must name who or what is pending and until when.

### OpenAI shopping: clarify, compare, refine, then verify the consequential edge

ChatGPT shopping research asks follow-up questions about decision-changing preferences, allows constraints and candidates to be refined while research runs, and returns a small set of recommendations with reasons, tradeoffs, and side-by-side comparisons. It also tells customers to verify final price, availability, and return terms before purchase because research data can be stale.

Source: [OpenAI, Using shopping research in ChatGPT](https://help.openai.com/en/articles/12911370-using-shopping-research-in-chatgpt)

AE implication: AE's value is not silently picking one route. It should turn connected-business evidence into a small intelligible decision set and revalidate volatile terms at the approval boundary.

### Perplexity: answer first, sources available for inspection

Perplexity describes its experience as accepting a question, gathering relevant sources, distilling them into a concise answer, and attaching citations for verification. Model selection and retrieval are subordinate to the answer.

Source: [Perplexity, How does Perplexity work?](https://www.perplexity.ai/help-center/en/articles/10352895-how-does-perplexity-work)

AE implication: lead with what the customer asked, what AE recommends, and what happens next. Route graphs and protocol evidence belong in inspection, not in the primary narrative.

### SAP Ariba: request, approval, order, receipt, change, cancel

SAP Ariba separates an approvable purchase requisition from supplier purchase orders. A denied request can be edited and resubmitted. After approval, one or more supplier orders are generated, then confirmed, fulfilled, and received. Changes and cancellations are created from the original request and approved rather than silently mutating the legal order.

Source: [SAP Learning, Defining Purchase Orders](https://learning.sap.com/courses/sap-ariba-procurement-buying/defining-purchase-orders)

AE implication: keep customer request, approval, provider commitment, fulfillment, receipt, and amendment as related but distinct records. This works for consumers and procurement operators; organizational policy can add approvers without changing the base lifecycle.

## Inverse premortem

Assume the engine works technically, never duplicates a consequential call, and produces signed evidence—but customers reject it.

| Failure | Why customers reject it | Earliest observable signal | Required prevention |
|---|---|---|---|
| AE makes customers supervise an action graph | The interface transfers orchestration work to the customer | Users cannot answer “what happens if I approve?” | Present one customer decision and a plain-language phase; keep graph in inspection |
| Approval theatre | Maximum spend and field names do not explain the actual deal | Users approve, then dispute provider, total, or disclosure | Prepare exact provider/quote/terms first; bind approval to them |
| Opaque route feels self-serving | No alternatives or rationale means AE looks like a lead broker | “Why this business?” and abandonment at approval | Show a small viable set, recommendation rationale, tradeoffs, and ranking disclosures |
| Data leaves before customer understands | `observation` auto-executes with personal data | Complaints that “I only asked you to look” | Separate read/search authority from disclosure authority and checkpoint sensitive disclosure |
| Completed means the wrong thing | Kernel completion is mistaken for real-world delivery | “It says complete but I have no booking/label/item” | Capability-specific completion criteria and customer result projection |
| Waiting becomes a black hole | No actor, deadline, next check, or cancelability | Repeated refresh/support contacts | Name who is pending, expected response time, next automatic check, and exit path |
| Recovery creates fear of duplicate action | Unknown outcome uses technical language or appears failed | Customers retry manually and get duplicates | Say “We are checking; we will not try again,” expose evidence and safe next action |
| No exit erodes trust | Customer cannot decline, edit, withdraw, or cancel | Users abandon before approval or contact provider directly | First-class decline/edit/cancel with state-dependent consequences |
| Material changes slip through broad authority | Ceiling-based approval permits a different deal | “That isn't what I approved” | Human-readable material diff and reapproval of immutable prepared action |
| Business workflow infects consumer UX | Cost centers and policy gates overwhelm ordinary users | Consumer comprehension and conversion fall | Same lifecycle, separate projections: consumer summary vs organization policy/audit |

## Cross-journey convergence

### Shared by consumer, operator/procurement, and agent developer

All three need the same semantic spine:

1. A durable request with explicit constraints.
2. A small set of viable prepared options.
3. An explanation of recommendation and tradeoffs.
4. Exact authority at every material boundary.
5. Immutable approval bound to the selected terms.
6. Honest accepted, pending, confirmed, failed, and unknown states.
7. Safe amendment, cancellation, and recovery.
8. A durable event/evidence record.

The projection differs:

- **Consumer:** need, recommendation, total, business, timing, data, terms, one decision.
- **Operator/procurement:** the same plus policy, approvers, cost center, supplier/order/receipt, audit.
- **Agent developer:** stable machine-readable request, option, checkpoint, execution, recovery, and evidence objects.

Do not create separate lifecycle engines for these audiences.

## Required customer-visible states

Use customer language; retain protocol states internally.

| Customer state | Customer must understand |
|---|---|
| Understanding your request | What is missing and why it changes the decision |
| Finding options | What AE is looking for and whether any data has left AE |
| Ready for your review | The recommended option, alternatives, price, timing, terms, and evidence freshness |
| Waiting for approval | Who must decide and exactly what approval permits |
| Changes need approval | What changed from the last approved terms and why execution stopped |
| Requested from *business* | A request has been released but the business has not committed yet |
| Confirmed | The business has accepted and the binding commercial reference is available |
| In progress | Who is acting, expected completion, and whether cancellation remains possible |
| We're checking what happened | The external result is uncertain; AE will not release a duplicate |
| Needs your attention | The specific safe action available and its consequence |
| Completed | Customer outcome/artifact, final total, business, time, terms, and receipt |
| Couldn't complete | What failed, what definitely did not happen, and recovery choices |
| Cancellation requested | Cancellation is not yet confirmed and original commitment may still stand |
| Canceled | Financial/data/fulfillment consequence and refund status |
| Couldn't cancel | Why, current obligation, and escalation path |
| Issue reported / Under review / Resolved | Claim, evidence, decision authority, deadline, and result |

## Disclosure hierarchy

### Show by default

- The customer's request as understood.
- The next meaningful step.
- Recommended option and decisive reason.
- Named business.
- Actual total or plainly bounded uncertainty.
- Expected timing.
- What approval will cause.
- Current status, cancelability, and next action.
- Final artifact/result.

### Progressively disclose when it helps a decision

- Other viable options and tradeoffs.
- Price breakdown.
- Reliability, incidents, and evidence freshness.
- Data being shared, named recipient, purpose, retention, and onward use.
- Cancellation/refund/change terms.
- Why an option was excluded.
- Material changes since approval.

### Inspection only

- Capability-contract IDs.
- Route graph and binding IDs.
- Quote and approval digests.
- Root run IDs.
- HTTP/MCP/transport details.
- Raw data-field keys.
- Signed authority and low-level run evidence.

Inspection must remain accessible and exportable, but it is not the product's primary narrative.

## Plain-language customer success criteria

1. Within ten seconds, the customer can state what AE understood, what happens next, and whether anything has been shared, spent, reserved, or committed.
2. Before each material boundary, the customer sees the exact business, actual total or explicit bound, data and recipient, purpose, timing, commitment, and cancellation consequence.
3. Approval binds an immutable prepared action. No provider, total, recipient, purpose, or material term can change without an explicit, plain-language reapproval diff.
4. The customer can decline or edit without reconstructing the request.
5. The customer can always tell whether cancellation is possible now, what it costs, and whether cancellation has been confirmed.
6. A pending state always names the waiting party, expected time, next automatic action, and available exit.
7. An unknown outcome never appears as ordinary failure and never invites a duplicate retry.
8. Completion is defined by a capability-specific customer result, not merely a successful provider call.
9. Failure states say what happened, what definitely did not happen, and the safe recovery choices.
10. The completed Plan provides the result plus named business, final amount, timestamps, governing terms, and inspectable receipt/evidence.
11. A customer can report an issue against the completed action, attach evidence, see who decides it, and track deadlines/status.
12. Consumer, procurement, and machine-agent surfaces project the same underlying lifecycle semantics.

## Mechanism success gate before broader implementation

The Plan mechanism is ready for customer UI only when an executable tracer proves all of the following:

- multiple prepared options can be represented without releasing an effect;
- the customer approval binds one actual provider quote and its commercial/data terms;
- execution cannot reroute away from the approved provider/quote;
- any material change invalidates approval and produces a readable diff;
- read-only retrieval and third-party disclosure have independent authority policy;
- decline, edit, expiry, failure, cancel, cancellation-pending, and unknown-outcome paths are durable;
- completion uses a typed capability result;
- the event/evidence log can reconstruct what the customer saw and approved;
- UI and agent API render equivalent customer semantics while hiding protocol detail by default.

Until this gate is met, additional public UI would harden the wrong abstraction.

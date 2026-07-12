# Official Comparable Patterns for the AE CustomerRequest Mechanism

**Question:** Which first-party product and API patterns constrain AE's customer-facing Request mechanism without turning those products into loose analogies?  
**Source standard:** Official product, help-center, and API documentation only. Accessed 2026-07-12.

## Bounded findings

| Comparable | First-party pattern | Bounded AE mechanism rule |
|---|---|---|
| Uber | The rider enters a destination, reviews ride options, selects one, and confirms pickup. Only then does Uber match the request to a nearby driver. Uber describes matching as a batched marketplace optimization intended to reduce wait across riders and drivers, not as the rider's primary interaction. Upfront price is shown before the trip request, and changed trip details can change the price. ([How Uber works](https://www.uber.com/us/en/about/how-does-uber-work/), [Uber Marketplace Matching](https://www.uber.com/us/en/marketplace/matching/), [Accepting a trip price](https://help.uber.com/riders/article/accepting-a-trip-price/?nodeId=4efa31c0-1123-48a7-b9b1-6e968a62fd6e&valueOf=b80c8b)) | Lead with the customer's job, viable choices, price and confirmation. Keep candidate batching and optimization inside the neutral kernel. A material change to the selected offer must create a new PreparedAction and require a new decision; AE must not silently substitute a materially different offer under an old approval. |
| Stripe | A PaymentIntent persists one payment objective through explicit lifecycle states such as `requires_payment_method`, `requires_confirmation`, `requires_action`, `processing`, `succeeded`, and `canceled`. Stripe recommends creating it once the amount is known so attempts are recorded. Stripe's API idempotency stores the first begun request's result for a key, rejects reuse with different parameters, and allows safe retry without creating a second operation. ([PaymentIntent lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle), [Idempotent requests](https://docs.stripe.com/api/idempotent_requests)) | Make `CustomerRequest` the durable customer objective and keep Plan revisions, PreparedActions, approvals, and attempts beneath it. Persist attempt identity before provider release. Replay may resume the exact same command; changed parameters require a new generation/key. `dispatch_pending`, provider processing, customer action required, completed evidence, definitely failed, and canceled must remain distinct. |
| Google Routes API | `computeRouteMatrix` evaluates multiple origin-destination pairs. Each returned element is identified by its own origin and destination indexes and has its own status and route condition; a subset can fail without making every element fail. Streamed elements are not guaranteed to arrive in order. Google also requires callers to request `status` explicitly or failures can appear successful. ([Get a route matrix](https://developers.google.com/maps/documentation/routes/compute_route_matrix), [ComputeRouteMatrix reference](https://developers.google.com/maps/documentation/routes/reference/rest/v2/TopLevel/computeRouteMatrix)) | Treat each candidate-provider preparation call as an independently identified element with recipient, input digest, release receipt, status, evidence and refusal. Do not infer success from absence of a global error or response order. Preserve successful candidates when another candidate fails, but never rank a candidate whose own quote/status evidence is incomplete. |
| Airbnb | At booking, the guest agrees to the displayed total price, including identified fees and taxes. Cancellation consequences come from the policy attached to that reservation. Booking modifications can add amounts, fees or taxes, which Airbnb says are notified before the user proceeds. Host cancellation or a reservation issue can enter a separate rebooking/refund path; Airbnb's service refund policy requires timely claims and supporting evidence for covered issues. ([Airbnb Terms for guests](https://www.airbnb.com/help/article/2857), [Refund Policy for Services and Experiences](https://www.airbnb.com/help/article/2278)) | Approval must bind the selected business, all-in bound, material terms, cancellation posture and expiry. A modification that changes those facts requires a readable diff and reapproval. Cancellation requested, cancellation confirmed, refund/rebooking eligibility, issue reported, evidence submitted and issue resolved are separate records; provider fulfillment evidence must not be collapsed into generic AE completion. |

## Resulting AE product contract

The comparable pattern is not “copy rides, payments, maps, or accommodation.” It is this ordering:

```text
plain-language customer objective
→ independently evaluated real candidates
→ intelligible options and material terms
→ exact confirmation
→ one durable attempt identity
→ evidence-qualified progress
→ bounded cancellation, issue and recovery states
```

The neutral kernel owns candidate allocation, typed release, routing, authorization, idempotency and run evidence. The customer surface owns the request, the decision, the commitment boundary, progress and the next safe action. Kernel vocabulary is inspection material, not the product proposition.

## Non-claims

- Uber's model does not prove AE should dispatch physical-world services or copy Uber's marketplace objective.
- Stripe's idempotency does not prove a downstream provider is exactly-once; AE still needs provider idempotency and outcome reconciliation.
- A route-matrix analogy does not make providers interchangeable; capability conformance and comparable commercial fields remain prerequisites.
- Airbnb's recovery policies do not authorize AE to adjudicate provider disputes, refunds or real-world outcome validity. AE may preserve and route evidence only where its registered contract and actual authority permit it.

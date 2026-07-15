# First-party request lifecycle patterns: Airbnb, Uber, Stripe, and Meta

**Question.** How do mature products keep matching, allocation, orchestration, and policy machinery backstage while giving customers a simple path from need to decision, commitment, progress, and recovery?

**Source standard.** Current public first-party product, help, API, and engineering documentation only, reviewed 15 July 2026. Product observations and AE implications are separated below. These patterns inform AE's **target** Request journey; they do not establish that AE currently books, charges, dispatches, executes composite routes, or fulfils real-world work.

## Executive finding

The strongest shared pattern is not a universal chat or wizard. It is a **durable customer job with progressive disclosure**:

```text
state the job
→ supply only decision-changing context
→ compare a small set of valid options
→ confirm one exact option and its boundaries
→ follow a durable status
→ preserve the job through change, failure, and recovery
```

The infrastructure may rank thousands of listings, allocate a driver, coordinate payment methods, or propagate data-use policy across many systems. The customer sees the smallest semantic object that lets them decide and act safely: a reservation, ride, payment, or privacy choice. For AE, that object is the **Request**; recommendations, confirmations, progress, and recovery are projections of it.

## Decisive patterns

### 1. Start with the customer's job; request structure only as it becomes useful

**Observed.** Airbnb starts a stay search with destination, dates, and guests, then offers progressively narrower filters. Recommended filters can depend on the person's past filter use and what similar guests found useful. Uber starts with “Where to?”, asks for pickup confirmation only when needed, and shows vehicle choices only after the trip endpoints are known. ([Airbnb, “Using search filters”](https://www.airbnb.com/help/article/479); [Uber, “How to request a ride / get a price estimate”](https://help.uber.com/en/riders/article/eine-fahrt-bestellen?nodeId=67f41961-e0aa-4670-af32-58be02c7c492))

**Transfer to AE.** Accept ordinary language as a legitimate first Request state. Compile it backstage. Ask for one missing fact only when it changes eligibility, comparison, authority, or a material term. Defaults and inferred context must remain visible and editable; a contract field is not, by itself, a reason to question the customer.

### 2. Let the platform own ranking and allocation; expose the reasons needed to choose

**Observed.** Airbnb's search order combines the guest's criteria with price, availability, location, quality and popularity signals, host requirements, and guest history, but the customer interaction remains filters, listing details, and a results view—not construction of the ranking system. Uber presents the available vehicle options and, after confirmation, sends one request to eligible nearby drivers; if that ride type has no supply, it can suggest another available type. ([Airbnb Terms, “Searching and Recommendations” and “Search Ranking”](https://www.airbnb.com/help/article/2908); [Uber, “How to request a ride / get a price estimate”](https://help.uber.com/en/riders/article/eine-fahrt-bestellen?nodeId=67f41961-e0aa-4670-af32-58be02c7c492))

**Transfer to AE.** The customer should receive a recommendation, credible alternatives, and the few differences that change the decision. AE owns graph compilation, eligibility, ranking, bindings, and fallback order. Do not ask a person or calling agent to assemble an internal route graph or choose infrastructure primitives.

### 3. Selection is reversible; commitment is an explicit boundary-crossing event

**Observed.** In Uber, tapping a vehicle option selects it, while “Confirm Pickup” or the equivalent confirmation sends the request to drivers. Airbnb exposes the applicable cancellation terms before payment, and booking means agreeing to the displayed total charges and reservation terms. ([Uber, “How to request a ride / get a price estimate”](https://help.uber.com/en/riders/article/eine-fahrt-bestellen?nodeId=67f41961-e0aa-4670-af32-58be02c7c492); [Airbnb, “Find the cancellation policy”](https://www.airbnb.com/help/article/149); [Airbnb Terms, “Booking”](https://www.airbnb.com/help/article/2908))

**Transfer to AE.** Browsing, comparing, pinning, or selecting an option grants no authority. The confirmation view must restate the current option in customer language: businesses involved, expected outcome, maximum cost, timing, important assumptions, data recipients and purposes, expiry, cancellation posture, fallback, and next event. Confirmation must bind that exact current option rather than a mutable Request in general.

### 4. Give the commitment one durable identity and truthful intermediate states

**Observed.** An Airbnb reservation can remain `Pending` while a host responds or identity verification completes; the page explains the deadline, who must act, and what happens on decline or expiry. Stripe's PaymentIntent is one object for one payment objective and carries explicit states such as `requires_payment_method`, `requires_confirmation`, `requires_action`, `processing`, `succeeded`, and `canceled`. Stripe recommends reusing the same PaymentIntent after interruption so its state and failed attempts remain attached to the same cart or session. At the command boundary, an idempotency key makes an exact retry return the original result while rejecting reuse with different parameters. ([Airbnb, “What is the pending status for a reservation?”](https://www.airbnb.com/help/article/2810); [Stripe, “How PaymentIntents and SetupIntents work”](https://docs.stripe.com/payments/paymentintents/lifecycle); [Stripe, “The Payment Intents API”](https://docs.stripe.com/payments/payment-intents); [Stripe, “Idempotent requests”](https://docs.stripe.com/api/idempotent_requests))

**Transfer to AE.** Confirmation should return a stable receipt immediately, not a premature success claim. Resume the same Request and confirmation record across refreshes, devices, human UI, and agent API; an exact retry returns the same receipt, while a changed Request revision or option under the same retry key fails. Public states should answer: what is happening, who or what must act, by when, and what the customer can safely do next. Internal precision can remain in typed machine states.

### 5. Progress changes its information hierarchy as the job advances

**Observed.** Uber first shows an estimated time to be matched. Once a driver accepts, the primary information changes to driver identity, live location, and ETA; arrival notifications follow. Airbnb places status in the existing reservation message thread and sends confirmation through email, push, and optionally SMS. ([Uber, “How to request a ride / get a price estimate”](https://help.uber.com/en/riders/article/eine-fahrt-bestellen?nodeId=67f41961-e0aa-4670-af32-58be02c7c492); [Airbnb, “Find your reservation status as a guest”](https://www.airbnb.com/help/article/234))

**Transfer to AE.** Do not make one static technical timeline carry the whole journey. Each phase should promote the next decision-relevant fact: matching and expected wait; business acceptance or action needed; work released; observable result; evidence or uncertainty; recovery choice. Keep the full record inspectable, but let the dominant customer surface change with state.

### 6. Material change requires a visible delta and a fresh decision

**Observed.** Airbnb shows the original and new total before a guest accepts a trip-change request; if the request is declined or unanswered, the existing reservation stays unchanged. Uber says an upfront fare can change after material changes such as pickup, destination, stops, route, or duration, and the receipt explains a final charge that differs from the agreed upfront price. ([Airbnb, “Modifying a home reservation as a host”](https://www.airbnb.com/help/article/50); [Uber, “How is the price of a trip determined?”](https://help.uber.com/riders/article/how-are-fares-calculated/?nodeId=d2d43bbc-f4bb-4882-b8bb-4bd8acf03a9d))

**Transfer to AE.** A stale or materially changed option cannot inherit prior confirmation. Preserve the Request, show a before/after delta in ordinary language, and require a fresh decision. If the person declines or does nothing, the last valid commitment remains authoritative unless its own expiry or failure rules say otherwise.

### 7. Recovery preserves the underlying job and offers bounded alternatives

**Observed.** When an Airbnb host cancels, Airbnb can help the guest find a similar place using location, amenities, availability, and comparable pricing, or provide a refund; the customer does not restart the trip search from an empty screen. When Uber has no drivers, it can suggest another ride type or let the rider request notification when supply becomes available. ([Airbnb, “If your host cancels your home reservation”](https://www.airbnb.com/help/article/170); [Uber, “Can't request a ride”](https://help.uber.com/riders/article/cant-request-a-ride?nodeId=fba886b7-34e9-4781-9d21-e4380c6f9649))

**Transfer to AE.** Failure should return to the same Request with confirmed facts, decision criteria, prior selection, receipts, and changed conditions intact. Offer only reachable next steps: refresh equivalent options, choose a named fallback, repair a missing fact, retry when proven safe, wait for supply, cancel what remains cancellable, use a disclosed handoff, or stop.

### 8. Customer controls describe consequences; infrastructure enforces the hidden scope

**Observed.** Meta's Accounts Center groups connected-experience and account-setting jobs across products, while Privacy Center groups controls by understandable concerns such as collection, use, ads, activity, and audience. Disconnecting past off-Meta activity explains residual effects before action: history is disconnected, some apps may log the person out, ads remain, and future activity is controlled separately. Underneath those surfaces, Meta describes Privacy Aware Infrastructure that propagates allowed-purpose constraints through complex data flows and blocks disallowed flows at runtime. ([Meta, “About Accounts Center”](https://www.facebook.com/help/943858526073065); [Meta Privacy Center](https://www.facebook.com/privacy/center/); [Meta, “Disconnect your past activity off Meta technologies”](https://www.facebook.com/help/287199741901674); [Meta Engineering, “How Meta enforces purpose limitation via Privacy Aware Infrastructure at scale”](https://engineering.fb.com/2024/08/27/security/privacy-aware-infrastructure-purpose-limitation-meta/))

**Transfer to AE.** Show named recipients, purposes, disclosed information, consequences, and customer controls—not policy graphs or enforcement choreography. Enforce those disclosed limits across every downstream step. Cancellation and recovery must name what can still be stopped, what has already been disclosed or released, and what residual effects remain; never promise generic rollback.

## Product architecture for the target AE lifecycle

| Customer phase | Customer-owned meaning | AE-owned machinery kept backstage |
| --- | --- | --- |
| **Request** | “What I need,” in the person's words | interpretation, registered-contract matching, durable revision |
| **Clarify** | one question or editable assumption that changes the choice | missing-fact analysis, eligibility and comparability checks |
| **Options** | recommendation, alternatives, price, timing, tradeoffs, why each fits | graph compilation, admission, ranking, provider bindings, fallback order |
| **Confirm** | exact businesses, spend, information sharing, effects, expiry, ways out | immutable option reference, bounded authority, idempotent command |
| **Progress** | what is happening, what needs attention, what happens next | orchestration, attempt state, evidence collection, reconciliation |
| **Result / recovery** | outcome record or preserved Request plus safe next choices | receipts, failure typing, retry safety, equivalent rerouting, incident inputs |

## Guardrails

1. Do not expose the graph as the primary customer object; expose its decision advantage.
2. Do not turn clarification into schema completion or ask for non-decision-changing facts.
3. Do not equate option selection, confirmation, execution, and success.
4. Do not lose the Request when an option expires, supply disappears, a dependency fails, or the browser disconnects.
5. Do not claim cancellation can reverse an already released action or disclosure.
6. Do not copy the operational powers of these comparables into current AE claims. Their patterns guide the target product contract; AE's current evidenced surface remains narrower.

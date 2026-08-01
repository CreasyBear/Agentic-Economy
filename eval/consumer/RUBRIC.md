# AE consumer-experience rubric (fixed — do not edit mid-round)

The critic judges the live product at the given origin with fresh eyes, as a harsh consumer-product reviewer calibrated on Airbnb/Uber-grade flows. Two tracks; a track PASSES only when EVERY item on it passes. The overall verdict PASSES only when both tracks pass.

## Rider track (consumer finds and engages a service)

Persona: a non-technical person who needs a local service (e.g. a dental check-up). They start at `/` and get no help.

- R1 **Unaided completion**: starting at `/`, reach a concrete priced outcome (a quote or a clear request-sent state) without any instruction, in one sitting.
- R2 **≤3 steps to first value**: at most three user interactions (search, select, act) from landing to seeing a real price or quote.
- R3 **Zero internal jargon on screen**: no words like offering, projection, capability, sandbox provenance codes, RoutePlan, mandate, DTO, revision, slug on any consumer-visible surface. Plain-language labels only. ("Sandbox"/"sample" as an honest data label is allowed but must read as plain language, e.g. "demo provider".)
- R4 **Mobile usable at 390px**: the full R1 journey works in a 390×844 viewport with no horizontal scroll, no overlapping/clipped controls, tap targets ≥40px.
- R5 **Trust & honesty**: prices show what they include (unit, tax); demo/sample supply is visibly labelled; no claim of booking, payment, or fulfilment anywhere on the consumer path.
- R6 **Obvious next step**: at every screen state (empty, results, quote shown, error/refusal) exactly one primary action is visually dominant and correctly labelled.

## Driver track (business lists itself / publishes a service)

Persona: a small-business owner who heard "your business can be found by AI assistants" and wants in. Reference bar: agentic.market's "add your service" / Soar's supply entry.

- D1 **Discoverable entry**: from `/`, the path to "list your business" is findable within one glance at the primary navigation.
- D2 **Unaided start**: the owner reaches a form or guided flow that clearly begins listing/claiming their business without an account wall that dead-ends (an auth step is fine only if the page states what happens after).
- D3 **Value proposition stated**: before any form field, one plain sentence states what listing gets them (found and quoted by AI assistants and people).
- D4 **Effort transparency**: the flow states what information is needed (business facts, services, price) before asking for it.
- D5 **Zero internal jargon** (same word list as R3).
- D6 **Mobile usable at 390px** for the entry page and first step.
- D7 **Honest claims**: nothing promises bookings, payments, dispatch, or customer volume.

## Verdict file format (one per critic, required)

```
critic: <name>
round: <N>
rider: PASS|FAIL
driver: PASS|FAIL
overall: PASS|FAIL
failures:
- <item id> <one-line evidence with the exact screen/text observed>
wow: <one line — would this wow you next to Airbnb/Uber? blunt answer>
```

A track with zero listed failures must be PASS; any listed failure forces FAIL. Screenshots go next to the verdict file.

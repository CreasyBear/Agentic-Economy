# T9 — Plan-first consumer surface (decompose → compare → act)

Labels: `wayfinder:task` (AFK-capable after T8 copy system settles). Status: open. Raised by founder 2026-07-30: "people appreciate an abstract task being decomposed into a plan and then that plan allowing them to compare actions, options, and what to do."

## Question

Grow the round-6 answer view into a genuine plan surface: an abstract ask ("my tooth hurts", "renovating the bathroom") decomposes into steps, each step offering comparable options (price, availability, next action) sourced from the same supply projection. AE's source already owns this spine — Customer Request compilation (ask → understand → choose → authorize → act) — the work is projecting it consumer-plainly (a plan, never RoutePlan machinery) and deciding when a single-service ask short-circuits to one step. Competitive slot: agentic.market sells APIs, Soar sells journey management; AE sells "an ask becomes a plan you can compare and act on" across local businesses. Boundary: no booking claims until T10 lands.

**Trust framing (founder, 2026-07-30):** the mental model is /plan mode. Users implicitly trust the agent to (1) produce a competent plan and (2) execute it under their gate. AE is the same contract aimed at the real world — execution is a business action or a plain API query, gated by the existing authority modes (`inspect_only` → `approve_each` → `bounded_mandate` → `full_yolo`). Candidate line: "Plan mode for the real world."

**Productised wayfinding (founder, 2026-07-30):** "it's like me asking you to use wayfinder — if we could productise wayfinder." The mapping is 1:1 and should shape the surface: destination = the customer's outcome; the map = the consumer-legible plan; tickets = steps, each holding comparable options; HITL tickets = approve-each actions (the person decides); AFK tickets = bounded-mandate lookups the agent just runs (API hits, availability checks); the frontier = what can be decided right now; decisions-so-far = the auditable trail of what was chosen and why. The plan surface should make progress feel like a map clearing fog, and every executed step must leave a readable decision record.

## Resolution

Implemented locally: the one-view now projects a bounded ConsumerPlan from the read-only Customer Request preview and public service rows, with inspect-only frontier actions, comparable options, dependency-aware steps, freshness/unmatched refusals, readable decision records, and the shared answer artifact seam. Development evidence is local/dev only; hosted reachability, independent supply, provider fulfilment, booking, payment, and dispatch remain HITL/T10 work.

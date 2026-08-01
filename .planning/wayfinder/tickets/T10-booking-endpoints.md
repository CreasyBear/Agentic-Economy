# T10 — Booking endpoints for supply (10-star build target)

Labels: `wayfinder:task` (AFK design, HITL scope sign-off). Status: open. Raised by founder 2026-07-30: "if we need to onboard booking endpoints for supply then we will. don't discount AE just because we can't do something."

## Question

Extend the AE-hosted capability shape beyond quotes to bookings: a business publishes availability + a bookable slot capability the same way the checkup-quote endpoint works today (offering-declared access path → AE-hosted or provider-hosted endpoint → readiness-proven → routeable). Soar's booking handoff (search public, OAuth to book, provider fulfils) is the shape reference. Dependencies: T5 (no-credential adapter), T3 (agent credential issuance — a booking is an effectful `approve_each`+ action), T2 (payment rail if deposits are in scope). Claims stay at evidence: "booked" may only be said when a real booking round-trips. Deliverable for this ticket: the capability contract (slots, holds, confirmation, cancellation semantics), which side hosts it for no-API businesses (AE-hosted booking inbox vs calendar integrations), and the smallest honest pilot (one business, labelled).

## Resolution

(pending)

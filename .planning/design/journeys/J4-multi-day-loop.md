# J4 · The multi-day loop

## Identity

- **ID:** J4
- **Name:** The multi-day loop
- **Customer story:** “The reply found me and I could act on it.”

## Status

**designed.** Clocks, notification envelopes, owner triage, bounded replies and honest closure are specified; no cross-device/day ship-test or persona clearance is recorded.

## Persona proof

- **Blind critic:** ReturningUser — Priya, returning four days later on a new device, scored 3★.
- **Walkout:** Activity remembered the thread but could not open the reply record; the trustworthy record was split across two dining rooms (G3).
- **Blind critic:** OwnerPlumber — Tony, receiving owner, scored 3★.
- **Walkout:** a second deep-link sign-in with unspecified re-entry made the channel feel too expensive (G8).

## Ship test

Across two devices and at least one simulated day boundary:

1. customer send creates owned dispatch/readback/no-reply clocks with visible basis and deadline;
2. owner receives a purpose-bound notification and re-enters through durable session/biometric continuity or reply-by-email without losing the target request;
3. the queue row exposes suburb, scope, urgency and current need in 10 seconds;
4. owner sends a reply or typed clarification; customer notification opens the exact item in `/t/:threadId?k=#item-{id}` within `Your record`; <!-- stupid-shit: S1 -->
5. customer submits one text-only bounded answer and the same item identity requeues the owner row to `Needs attention`;
6. every state transition, timeout and disposition remains distinct and inspectable; and
7. customer can close with `I handled this another way`, producing a customer-asserted terminal event and stopping future purpose-bound notifications.

## Pages & views

- `pages/owner-inbox.md` — queue triage; detail document spine; notification/email entry; participant messaging; five dispositions and decline taxonomy.
- `pages/owner-settings.md` — notification channels/deep-link receiver; cessation policy; request availability and verified destination.
- `pages/private-record.md` — normative key-granted record projection within `/t/:threadId`; return orientation; current update; bounded customer reply; waiting action; notification preference; handled-another-way terminal action. <!-- stupid-shit: S1 -->
- `pages/activity.md` — session-local record handles, `Needs attention`, safe record opening without making handles authority.

## Stage map

- **Stage 7 — Send:** persisted operation and delivery start the loop.
- **Stage 8 — Pending / wait:** dispatch/readback/retry/no-reply clocks, record and return channel.
- **Stage 9 — Responses arrive:** attributable owner reply/clarification, customer notification and exact-item focus.
- **Stage 10 — Evaluate:** customer inspects reply, missing facts and bounded next turn.
- **Stage 11 — Decide / handoff:** close, contact another way, or customer-asserted out-of-band resolution without outcome inflation.

## Kernel dependencies

- **K4:** temporal orchestration with named clock/terminal owners, leases, idempotent sweeps and cessation.
- **K3:** append-only evidence for original request, participant messages, delivery and dispositions.
- **K9:** bearer-key access posture, non-secret Activity handles, signed in-thread focus targets and durable owner/customer re-entry.
- **K10:** customer-asserted terminal event distinct from observed or business-authored evidence.
- **K2:** bounded-message and owner-action authority cannot expand the original scope.
- **CS1 kernel addition:** inbound reply-by-email recorded as an attested event source.

## Open items

- **G3 — partial:** Activity has record handles/needs-attention contract but is session-local and CS9 still questions whether the route ships in V1.
- **G8 — specified, persona re-run open:** owner row content, durable sign-in return and decline taxonomy need end-to-end proof.
- **G10 — specified, ship proof open:** `I handled this another way` must append K10 evidence and terminalize honestly.
- **CS1 — required, ship proof open:** owner notification contains the request; reply-by-email must ingest, attribute and record the message.
- **CS5 — open for proof:** `Contact AE` must be visible on record and owner surfaces.
- **K4 scheduler — engineering hard stop:** the build map says the repo has no actual scheduler; design alone cannot satisfy clock ownership.
- <!-- stupid-shit: S1 --> **A2 — resolved:** the reply record no longer lives on a second customer route; notifications, Activity, and send completion converge on anchored `/t/:threadId?k=` record projection.

## Hedge & common-sense checklist

- **Facts before hedges:** PASS only when the record leads with exact state, timestamp, clock basis and latest message; boundary text follows those facts.
- **Useful status:** `Delivery recorded`, `Business replied`, `Waiting for customer`, `No reply received` and `Closed` stay distinct; never collapse them into ambient caution.
- **Obvious transitions:** FAIL until owner reply-by-email and durable deep-link re-entry remove the sign-in cliff; the former two-URL split is resolved by Activity and notifications targeting the same key-granted thread record projection. <!-- stupid-shit: S1 -->
- **Pricing posture:** a reply shows the business’s actual price/conditions when provided; missing fields say `Not provided`. Do not substitute `Business will quote` for the missing fact.

## Re-run gate

Re-run ReturningUser from a four-day-later notification on a new device through `/t/:threadId?k=#item-{id}`, bounded answer and honest close. Re-run OwnerPlumber from notification through durable re-entry and reply-by-email/portal triage. J4 is `persona-cleared` only if Priya can open the reply record without a route split, Tony avoids repeated unexplained sign-in, every waiting state names its clock owner/basis, and out-of-band resolution closes without implying AE confirmed the real-world outcome.

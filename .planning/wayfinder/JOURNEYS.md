> **SUPERSESSION BANNER — 2026-08-08.** This file is retained for historical
> mechanics and evidence provenance only. It is **not current authority** for
> AE's product category, ICP, wedge, supplier model, or roadmap.
>
> Current authority is [`PROJECT.md`](../PROJECT.md),
> [`VISION-conceptual-map.md`](../VISION-conceptual-map.md),
> [`wayfinder/MAP.md`](MAP.md), [`D-013`](../records/PROJECT-RECORDS.md), and
> the [Agent Services Market category thesis](../research/2026-08-08-agent-services-market-category-thesis.md).
> Do not infer from this historical map that local trades, Australian SMBs, BAS,
> or a one-human-work wedge is the current category or default product frame.

# Framework journeys — every user journey, step by step

Companion to [MAP-framework](MAP-framework.md); expresses `.planning/VISION-conceptual-map.md` and the
locked interaction model as executable journeys. Each step names: **actor → behavior → surface →
journaled event**, and the ticket that owns any gap. Status legend: LIVE (works today), SPIKED
(semantics proven, not wired), GAP(T-n) (owned by ticket).

Binding invariants across every journey: cooperative grammar (assume → show → correct; never
interrogate); effect classes decide consent (thinking is free, spending asks); momentum SLO — 75% of
non-terminal locks produce the next decision-ready item ≤24h; decision inbox ≤3, one ≤10-min daily
ritual, no batch-approve; instances are furniture; PM vocabulary never in copy.

---


## J0 — Arrival: how anyone reaches a door (gate finding #1)

No journey may assume arrival. Every entry (J1 person, J9 owner, J10 agent) begins with an attributed
channel step and an explicit loss state:

1. Channel → person/owner/agent encounters the promise (search, referral, memo forward, assistant
   directory, content) → landing carries `?src=` attribution → arrival event with channel
2. Loss state: bounced-without-ask is a journey outcome, measured per channel — product failure and
   traffic failure must be distinguishable (kill gate requires channel-attributed acquisition)
3. GAP: acquisition channels are a T27 decision input (wedge choice includes WHERE its customers come
   from); no build ticket owns growth surfaces yet — flagged, not hidden.
## J1 — The wall: first ask → drafted project

Persona: anonymous person, life-sized or monumental ask. Trigger: types the big thing on `/`.

1. Person → types "We're getting married next October — 120 people, no idea where to start" → ask box → —
2. Kernel → creates project keyed to thread identity; instantiates playbook top level (packages named,
   ONE branch elaborated, rest fog) → — → `plan_authored` (LIVE for flat plans; tree shape GAP(T26),
   playbooks GAP(T35))
3. Agent → drafts charter from ask + defaults; assumptions rendered as tappable chips ("~$45k",
   "flexible ±2wk", "near Adelaide") → dialog (v3 voice: "here's what I heard") → charter revision
   (GAP(T26) charter fields)
4. System → starts first study immediately (venue) — no permission needed (observation class) →
   plan card shows "finding real options now…" → `step_started` (LIVE via engine; study artifact GAP(T29))
5. Person → corrects 0–2 chips or walks away → chips → charter amendment event
6. Exit state: project exists, one study running, fog honest, person spent ≤2 minutes.
   *No account demanded — identity binds later (GAP(T36): at first lock or spend).*

## J2 — The one blocking question (grill-lite)

Trigger: a fork the kernel cannot default (hard constraint absent, e.g. no date at all).

1. Agent → asks exactly ONE question, recommended answer attached, at the moment it blocks → dialog
   ("Accept / edit / I'm unsure") → `clarifying_question` (LIVE single-question path)
2. Person → taps accept (default path) → decision recorded, dependent branch unblocks →
   `decision_received` (SPIKED — spine event; wiring GAP(T28))
3. Rule: never two questions in a row; unanswered questions don't stall observation-class work.

## J3 — The decision inbox (event-triggered, never an obligation)

Trigger: a study completes → node becomes decision-ready → ONE digest when inbox goes 0→1. There is
**no imposed daily ritual** (gate finding #5): the report comes to the person (J5); interruption is
event-triggered only (inbox 0→1, expiring hold, deadline, recovery). Inbox cap 3 (global). A pass,
when the person chooses to take one, is designed to fit in ≤10 minutes — a design bound, not a
customer obligation.

1. System → ranks ready decisions by irreversibility × constraint-power × lead time; renders top ≤3 →
   decision inbox → — (GAP(T30); ranking algebra GAP(T26))
2. Card shows: recommendation first, "why now" (what it unlocks), exact consequence, evidence one tap
   deep → inbox card (consultant voice, `picked: Glen Ewin · why ›`)
3. Person → Lock | Adjust | Park (Park gets a system-chosen revisit trigger — no settings) →
   `decision_locked` (SPIKED semantics)
4. Kernel → collapses branch, wakes dependent fog (rolling wave), starts next studies; momentum clock
   starts → tree updates live (Convex reactive) → `generation` unchanged, frontier events
5. Money/effect decisions: same session allowed, but each carries its own digest-bound yes — never a
   batch-approve control.
6. **Non-participation is a first-class path:** ignored digest → observation-class work continues,
   fog keeps clearing; time-sensitive holds get ONE escalation before honest expiry ("the Oct 9 hold
   lapses Friday — keep it?"); prolonged silence → project parks itself gracefully (nothing lost,
   re-entry via J11/J13); it never nags daily.

## J4 — First dollar: the trust ramp

Trigger: first consequential lock needs a deposit/hold. Persona: person who has never paid through AE.

1. System → presents the smallest possible money-yes (refundable hold, exact amount, refund window
   stated, provider named) → amber card → prepared action + digest (LIVE seams: approve_each,
   digests; UX GAP(T34))
2. Person → explicit yes → `Approval Grant` bound to exact digest (LIVE contract). **Split transition
   (gate finding #3):** money-yes and account-claim are TWO measured steps — the yes is captured
   first (funded intent recorded, hold prepared-but-unreleased), THEN identity claim runs (GAP(T36));
   claim abandoned/failed → approved intent persists in a resumable state, one-tap resume from the
   memo link, never re-asked from scratch. Abandonment here is attributable: price vs provider-trust
   vs identity-friction are separate funnel steps.
3. System → executes with idempotency key; receipt renders immediately; undo/refund path visible →
   receipts view → Action Attempt + receipt (commerce journey GAP: quote→hold→commit→receipt end-to-end)
4. Ramp: after N clean receipts, offer bounded mandate ("handle under $X like this") — scoped,
   expiring, revocable, usage-visible → `StandingMandate` (LIVE substrate; ratchet UX GAP(T34))
5. `full_yolo` never ships person-facing (locked rule).

## J5 — The return visit / the report arrives

Trigger: weekly memo, or exception digest (inbox 0→1, expiring hold, recovery). NOT the person
"checking in" — the report comes to them.

1. System → renders memo: what moved (with picks + why links), what's next, the ≤3 decisions waiting,
   burn vs envelope, `Next decision: Nh` scalar → email/notification via outbox (react-email)
   → report projection event (GAP(T30); outbox rail LIVE for inquiries)
2. Person → opens one link → lands on decision inbox (J3), not a dashboard → —
3. Optional: "see the whole plan" disclosure → tree view (v4; circle-pattern components; behind
   disclosure ONLY) → — (GAP(T30))
4. Days-later resume is event-driven, no polling; project generation intact (SPIKED — proven in
   projectSpine tests).

## J6 — Recovery: a vendor falls through

Trigger: provider withdraws / quote expires / step fails.

1. Kernel → marks branch failed; activates plan-B (next-best already held where study kept seconds
   warm) → `step_failed` + recovery events (route-level LIVE; plan-B branches GAP(T29/T33 lineage — the
   T24 obligation))
2. Agent → informs, doesn't panic: "Celebrant fell through — I've held the next-best. Undo if you'd
   rather" → dialog/inbox card with `undo ›` → decision event (auto-proceed only if within existing
   mandate scope; else it's an inbox item)
3. If no plan-B exists → recovery becomes a study (widen radius/adjacent category — executable, not
   prose) → `study` verb (GAP(T28/T29))
4. Honest cancellation: if the person kills the branch, show exactly what's refundable and when →
   cancellation timeline (GAP(T34/T40 constraints)).

## J7 — The change ripple: "actually, 150 guests"

Trigger: person amends a charter fact mid-project.

1. Person → says it in the dialog (problem-phrased, any time) → dialog → charter amendment
2. Kernel → computes the diff blast radius across five dimensions: which locked decisions survive,
   which studies go stale, cost/timing deltas → generation++ with stale-generation refusal on all
   in-flight work (SPIKED — generation fences proven) → `generation_advanced`
3. Agent → presents the ripple as ONE card: "150 changes 3 things: venue still fits; catering re-quote
   (~+$2.1k); invites reprint. Proceed?" → inbox → decisions re-enter J3
4. Quote-freshness split: stale quotes refresh on wake without breaking continuity (SPIKED).

## J8 — Done: closeout

1. Terminal node locks → goal predicate evaluates → `goal_evaluated`, `outcome_recorded` (LIVE)
2. Receipts trail renders as the project's story (dates, choices, why, spend vs envelope) → closeout
   view (GAP(T30 evidence view))
3. Closeout feeds preference memory (consent-gated) and the playbook improvement queue → memory
   (GAP — fog: memory consent), playbook delta (GAP(T35))

## J9 — Business door: publish once → earn (with the earnings clock)

Persona: business owner. Trigger: `/claim` via an attributed channel (J0).

1. Owner → claims/publishes services + prices once → supply funnel (describe→endpoint→readiness→
   pricing→test→publish) → published capability (LIVE e2e-proven)
2. **Earnings clock starts at publish** (gate finding #4): time-to-first-qualified-request is a
   measured, per-provider metric with a stay-published gate (threshold frozen at T27); demand
   acquisition for a cohort is AE's obligation, not the owner's hope
3. Agent demand arrives as qualified, decided work: quote requests carry exact scope from charters →
   provider surface / API → quote events (mock cohorts LIVE; category-generic quote seam GAP(T29))
4. Owner → responds WITHOUT AE intervention (concierge touches are counted and gated) → quote/
   commitment events; earns; receipts visible; payout timing stated up front (metering/payout seams
   LIVE dev; console maturity GAP)
5. **No-demand path:** if the clock breaches threshold — AE tells the owner honestly, offers category/
   coverage fixes, or the listing parks (no silent zombie supply); unpublish is one tap, data exits
   cleanly
6. Boundary: imported/web-discovered businesses render as Imported Claims with invite-to-list —
   never as bookable supply (LIVE).

## J10 — Agent door: someone else's assistant drives AE

Persona: external agent (ChatGPT/Claude/custom) on behalf of its person. Trigger: `/SKILL.md`, `/mcp`,
`/llms.txt`.

1. Agent → discovers capabilities and journey contract → llms.txt/SKILL (LIVE)
2. Agent → opens a project, receives draft tree + assumptions as structured fields (assumption-first
   beats question-ping-pong) → project API (GAP — agent project-API; today only registry/search tools
   via MCP)
3. Agent → runs studies, receives interrupt payloads for its person's decisions, resumes with typed
   answers → interrupt/resume shape (SPIKED semantics via events; API GAP)
4. Authority: agent identity ≠ person authority — approvals/mandates always bind to the person
   (LIVE contract; surface GAP).

## J11 — Continuity: new device, week 3

Trigger: person returns on another device / after weeks.

1. Person → opens memo link or signs in → identity resolves project ownership → GAP(T36 — the
   blocking decision: account model, claim flow, household sharing)
2. System → re-entry view: "since you were here: 2 done, 1 waiting on you" → re-entry projection
   (GAP(T30); Linear health/latest-update pattern)
3. Nothing was lost; no re-explaining (durable charter + journal — SPIKED/LIVE).

## J12 — The mundane wedge: "My BAS is overdue" (the measured first-value journey)

Same engine, dial fully to "handle it": J0 (attributed arrival) → J1 (charter tiny, one package) →
J3 (one decision: pick the bookkeeper from the study) → J4 (one yes: engagement fee) → J8 (lodged,
receipt). Two moments total.

**Gate ruling (finding #2): this is the acquisition-to-paid-outcome slice the kill gate measures** —
time-to-first-decision-ready (bounded from J1.1, not from first lock), completion, blind win vs a
frontier assistant on the same ask, payment, manual-touch count, margin, and repeat/retention —
thresholds frozen at T27 BEFORE build. Whether it also LEADS the wedge is the founder's T27 call;
the gate's recommendation (lead with it) is recorded as input. Playbook selects the dial default
(GAP(T35)).

## J13 — Abandonment and re-entry (the journey nobody wrote)

Trigger: person ignores digests / stops mid-project.

1. Silence ≠ churn: observation work completes, then the project self-parks (holds honestly expired
   per J3.6, nothing charged, state durable) → `project parked` event (GAP(T26 status))
2. Re-entry any time via memo link/sign-in → J11 view ("since you were here…"), one decision to
   resume or close → resume = generation-safe wake (SPIKED)
3. Explicit close → J8 closeout with honest cancellation of anything held; person leaves with the
   receipt trail, not guilt.

## J14 — Dispute: "that's not what I approved" / refund contest

Trigger: post-J4 charge contested, or provider delivered wrong/late (post-J6).

1. Person → contests from the receipt itself → dispute intake bound to the exact Approval Grant
   digest + Action Attempt evidence (the journal IS the case file) → dispute event (GAP — no owner
   ticket; feeds T40 liability + T34 UX)
2. System → freezes related branch, states refund path/timeline from the provider terms captured at
   quote time → honest timeline (GAP(T40))
3. Resolution recorded on the ledger; provider reliability feeds future study scoring (GAP(T29)).

## J15 — The second project (retention nobody wrote)

Trigger: J8 closeout of project #1.

1. Closeout offers the next concrete thing from context, never generic upsell ("BAS is quarterly —
   want me to handle Q2 automatically under the same mandate?") → memory + mandate reuse (fog:
   memory consent; T34 mandates)
2. Second project starts smarter: charter pre-filled from preferences, trust ramp remembers receipts
   (mandate offer arrives earlier) → measured as repeat-rate for the kill gate (T27 threshold).

---

## Journey × gap matrix (what must exist for each journey to be fully live)

| Journey | Blocking tickets |
| --- | --- |
| J1 draft | T26 (tree/charter), T35 (playbooks) |
| J2 grill-lite | T28 (verbs) |
| J3 inbox | T26, T30 |
| J4 first dollar | T34, T36, commerce journey (T33 lineage) |
| J5 report | T30 |
| J6 recovery | T28, T29 |
| J7 ripple | T26 (diff algebra); fences SPIKED |
| J8 closeout | T30, T35; memory fog |
| J9 business | T29 (quote seam) |
| J10 agent door | agent project-API (fog → ticket after T28) |
| J11 continuity | T36, T30 |
| J12 mundane | same as J1/J3/J4 |
| J0 arrival | T27 (channels are part of the wedge decision) |
| J13 abandonment | T26 (parked status), T30 (re-entry) |
| J14 dispute | T40 (liability), T34 (UX), T29 (reliability scoring) |
| J15 second project | T34 (mandate reuse), memory fog, T27 (repeat threshold) |

## Critic gate record

2026-08-01 `/plan-ceo-review` (`history://JourneysCeoGate`): **NO-SHIP on v1** — five findings, all
applied above: J0 arrival journeys added (acquisition attributable, loss states explicit); J12
promoted to the measured acquisition-to-paid slice with thresholds frozen at T27 (whether it LEADS
the wedge = founder's T27 call); J4.2 split into money-yes then identity-claim with resumable
approved-intent; J9 got the earnings clock, concierge-touch gating, and the no-demand path; J3's
daily ritual cut — event-triggered interruption with non-participation as a first-class path.
Missing journeys written: J13 abandonment/re-entry, J14 dispute/refund, J15 second project.

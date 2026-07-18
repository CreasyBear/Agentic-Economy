# Travel and event-management task grammar

**Owner:** Product
**Status:** Active
**Maturity:** Target research
**Question:** Which recurring pieces of human commercial work survive in a concrete travel case and a concrete event-management case, and which apparent similarities to procurement or supplier work disappear when authority, evidence, failure, repair, and completion are examined?
**Decision affected:** D-006 / ADR-009
**Evidence cutoff:** 2026-07-18
**Review by:** 2026-08-18
**Supersedes:** None
**Superseded by:** None

## Executive finding

The two official cases preserve the same small control grammar without sharing a
lifecycle schema:

> objective and constraints → sourced facts and unknowns → candidate rules →
> attributable comparison → bounded consequential decision → external effect →
> evidence → explicit next owner → exception → referenced repair → honest
> completion or unresolved residue

The repetition is real, but the nouns and decision rights are not
interchangeable. In the travel case, one purchased itinerary became unusable
after an airline-controlled mechanical cancellation and the disputed repair was
a consumer remedy. In the event case, a government accepted a multi-party host
obligation, progressively discovered that the regional delivery model was not
acceptable at the authorised budget, terminated the host contract, and settled
the resulting liabilities.

**INFERRED:** The transferable unit is a referenced, authority-bounded
interaction with attributable evidence, an explicit next owner, and
effect-sensitive repair. It is not a universal “task,” “order,” “project,” or
“procurement” record.

This is desk research. The travel source is an anonymised regulator case and the
event source is an official audit of a singular mega-event. They are useful
falsification cases, not proof of AE demand, representative burden, provider
participation, independently operated supply, customer value, real fulfilment,
production readiness, or permission to implement Action Invocation.

## Method and evidence boundary

- **OBSERVED:** Sources are first-party or official: the Australian Competition
  and Consumer Commission (ACCC), International Air Transport Association
  (IATA), Qantas, the Victorian Auditor-General’s Office (VAGO), and the
  Victorian Government.
- **OBSERVED:** The travel case is the ACCC’s anonymised example of a same-day
  Sydney–Canberra return flight cancelled because of a mechanical fault. The
  regulator did not publish the airline, itinerary, fare, purchase channel,
  communications, or final remedy.
- **OBSERVED:** The event case is VAGO’s reconstruction of Victoria’s bid,
  planning, withdrawal, and settlement for the 2026 Commonwealth Games.
- **INFERRED:** “Next owner” and “retry class” below are control interpretations
  of the official records. They are not claims that either domain uses AE’s
  internal concepts.
- **UNKNOWN:** Neither source measures the human effort of maintaining context,
  the number of manual contacts, willingness to delegate, or whether an agent
  would reduce that work.

## Case 1 — same-day Sydney–Canberra air trip cancelled after purchase

### Source-owned case facts

**OBSERVED:** The ACCC recorded that a consumer bought a same-day return flight
from Sydney to Canberra. A mechanical fault caused a cancellation, the delay
extended beyond the departure time of the return flight, the consumer requested
a refund, and the airline supplied only a flight credit. The ACCC stated that
the consumer should have been entitled to a refund under the Australian Consumer
Law. The regulator also advised consumers to retain travel documents and airline
communications. [ACCC case](https://www.accc.gov.au/media-release/airlines-need-to-comply-with-consumer-law)

**OBSERVED:** Current ACCC guidance says the remedy for delay or cancellation
depends on the length and cause of the disruption, the offered alternative, and
when that alternative operates. If a replacement is not within a reasonable
time, the provider must offer a different replacement or refund; “reasonable
time” is context-dependent and ultimately a matter for a court or tribunal.
[ACCC travel guidance](https://www.accc.gov.au/consumers/specific-products-and-activities/travel-delays-and-cancellations)

### Concrete reconstruction

| Frame                           | Case reconstruction                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Durable record or evidence                                                                                                                          | Next owner                                                                                                        | Retry or repair class                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Objective and constraints       | **OBSERVED:** Travel Sydney → Canberra → Sydney on the same day. **UNKNOWN:** purpose, acceptable arrival window, traveller needs, budget, and why the same-day boundary mattered.                                                                                                                                                                                                                                                                                                        | Purchased itinerary or ticket, not published in the case                                                                                            | Traveller until purchase; airline for contracted carriage                                                         | Re-plan safely before purchase using fresh offers                                                    |
| Actors and ownership            | **OBSERVED:** Consumer and unnamed airline. ACCC supplied regulatory guidance but does not resolve individual disputes. **UNKNOWN:** travel agent, employer, payer, operating carrier, airport, or insurer involvement.                                                                                                                                                                                                                                                                   | Ticket/contract, payment record, airline communications                                                                                             | Carrier owns carriage and its remedy response; consumer owns acceptance or escalation                             | Identity and purchase-channel ownership must be reconciled before any change                         |
| Facts and unknowns              | **OBSERVED:** Same-day return; outbound cancellation; mechanical fault; delay extended beyond return departure. **UNKNOWN:** exact flight numbers, times, fare rules, payment, check-in state, alternative offered, and whether any segment was flown.                                                                                                                                                                                                                                    | Schedule, operating-status observation, cancellation reason, ticket state                                                                           | Airline supplies current operational facts; consumer confirms whether the revised trip still serves the objective | Read/status queries are repeatable but must be fresh                                                 |
| Candidate rules                 | **UNKNOWN:** The actual search criteria and rejected itineraries were not published. Official industry material shows airline distribution distinguishes offers from accepted orders; airline fare types can carry different change and cancellation rules. These are context, not facts about the unnamed booking. [IATA NDC](https://www.iata.org/en/programs/airline-distribution/retailing/ndc) [Qantas conditions](https://www.qantas.com/en-au/book/flights/conditions-of-carriage) | Attributed offer, price, fare conditions, expiry, operating carrier                                                                                 | Traveller or authorised travel arranger selects an offer                                                          | Repeat search; never treat an expired offer as current                                               |
| Information gathering           | **UNKNOWN:** No search, advice, agent interaction, or disclosure sequence is published. A safe reconstruction would require current schedule, total price, fare restrictions, operating carrier, baggage, accessibility, and connection risk from their owning sources.                                                                                                                                                                                                                   | Source and timestamp for each material fact                                                                                                         | Traveller/agent gathers; airline owns offer and operating terms                                                   | Repeatable until a consequential acceptance; stale facts require refresh                             |
| Comparison                      | **UNKNOWN:** No pre-purchase comparison survives in the public case. **INFERRED:** For a same-day return, a valid comparison must retain both outbound and return feasibility; comparing the outbound segment alone would be incomplete.                                                                                                                                                                                                                                                  | Comparison record, objective, unresolved differences                                                                                                | Traveller retains preference-sensitive judgement                                                                  | Deterministic comparison can repeat when inputs are unchanged                                        |
| Consequential decision          | **OBSERVED:** The consumer purchased the return flights. Current ACCC guidance treats buying a flight as entering a contract with the airline; conditions vary by carrier and fare. [ACCC travel guidance](https://www.accc.gov.au/consumers/specific-products-and-activities/travel-delays-and-cancellations)                                                                                                                                                                            | Confirmed booking, ticket, payment receipt                                                                                                          | Airline must provide or lawfully repair the purchased service                                                     | If confirmation or payment effect is uncertain, reconcile before another purchase                    |
| Communication / external effect | **OBSERVED:** The airline cancelled the flight, the consumer sought a refund, and the airline supplied a credit instead. **UNKNOWN:** notification channel, acknowledgement, timing, and reasons given.                                                                                                                                                                                                                                                                                   | Cancellation notice, refund request, credit record, correspondence                                                                                  | Airline decides the first remedy response; consumer accepts or disputes it                                        | Communication may be repeated with a new attributable contact; do not duplicate a refund or purchase |
| Evidence                        | **OBSERVED:** ACCC told consumers to retain travel documents and records of communications. A named airline example shows that booking reference, electronic ticket, boarding pass, and baggage receipt are different records with different meanings. [Qantas conditions](https://www.qantas.com/en-au/book/flights/conditions-of-carriage)                                                                                                                                              | Booking reference, electronic ticket, payment record, cancellation/status record, boarding pass or baggage receipt if issued, remedy correspondence | Each issuer owns its assertion; traveller preserves the packet                                                    | Missing evidence is requested or escalated, not invented                                             |
| Exception                       | **OBSERVED:** Mechanical cancellation made the outward leg late enough that the return leg’s departure passed. One segment failure therefore invalidated the utility of the coupled itinerary.                                                                                                                                                                                                                                                                                            | Cancellation cause and revised schedule                                                                                                             | Airline for disruption handling; traveller for objective impact                                                   | Reconcile the whole itinerary before changing one segment                                            |
| Repair                          | **OBSERVED:** Consumer requested refund; airline gave credit; ACCC said refund should have been available. Current ACCC guidance distinguishes replacement, refund, and possible reimbursement depending on circumstances.                                                                                                                                                                                                                                                                | Refund request, provider disposition, refund or replacement confirmation                                                                            | Airline remedy team; consumer or authorised payer accepts; fair-trading or tribunal path if disputed              | A refund or replacement is a new consequential disposition; reconcile prior status before retry      |
| Completion                      | **UNKNOWN:** The public record does not say whether the airline ultimately paid the refund or whether the consumer travelled another way. The honest terminal state is “refund considered due by regulator; final remedy not evidenced.”                                                                                                                                                                                                                                                  | Refund settlement, completed replacement carriage, or dispute outcome                                                                               | Airline, consumer, or external dispute body depending on state                                                    | Do not infer closure from a credit record or regulator statement                                     |

### Travel-specific human and unsupported work

- **INFERRED:** The traveller must decide whether time, flexibility, cost, a new
  route, or abandonment best serves the trip. The case supplies no objective
  that permits AE to make that trade-off.
- **OBSERVED:** The ACCC says “reasonable time” has no single definition and is
  ultimately decided by a court or tribunal when disputed. AE must not present a
  generated legal conclusion as the authoritative remedy.
- **INFERRED:** Airline operations, safety decisions, physical carriage,
  airport handling, and final consumer dispute resolution remain outside a
  comparison or coordination system.
- **INFERRED:** A second booking after an uncertain first purchase or refund is
  unsafe without reconciling the earlier effect.

### Travel record residue

Official airline and industry sources expose domain records that must not be
collapsed merely because they share a reference:

- **OBSERVED:** IATA distinguishes an offer, an accepted order, delivery, and
  settlement; ONE Order is intended to combine legacy booking, e-ticket, and
  miscellaneous-document records into one customer-focused order, but it does
  not erase the business meanings of shopping, delivery, or accounting.
  [IATA NDC](https://www.iata.org/en/programs/airline-distribution/retailing/ndc)
  [IATA ONE Order](https://www.iata.org/en/programs/airline-distribution/retailing/one-order/)
- **OBSERVED:** In Qantas’s current contract, an electronic ticket is the
  airline-held ticket record, a boarding pass evidences check-in, and a baggage
  receipt evidences checked baggage. Fare rules determine permitted voluntary
  change or cancellation; flight schedules are not guaranteed.
  [Qantas conditions](https://www.qantas.com/en-au/book/flights/conditions-of-carriage)
- **OBSERVED:** Qantas’s current Manage Booking surface uses a six-character
  booking reference and separates checking in, changing, cancelling, itinerary
  access, baggage, contact updates, and third-party hotel/car/activity ownership.
  [Qantas Manage Booking](https://www.qantas.com/en-au/manage-booking)

**INFERRED:** AE may preserve and project these references, but must not treat
ticketing, check-in, boarding, baggage custody, operational delivery, and refund
settlement as one generic “completed” state.

## Case 2 — Victoria 2026 Commonwealth Games commitment and withdrawal

### Source-owned case facts

**OBSERVED:** Victoria signed the host contract in April 2022 with four years to
deliver a multi-hub regional Commonwealth Games, whereas hosts typically have
seven or eight years. The state withdrew in July 2023. VAGO found that the
business case underestimated cost and overstated benefits, and that the bid,
planning, and withdrawal cost Victoria more than $589 million.
[VAGO audit](https://www.audit.vic.gov.au/report/withdrawal-2026-commonwealth-games)

**OBSERVED:** The August 2023 joint statement says the State, Commonwealth Games
Federation, Commonwealth Games Federation Partnerships, and Commonwealth Games
Australia settled all disputes over cancellation; Victoria agreed to pay
$380 million and the undisclosed settlement finalised matters between those
parties. [Victorian Government joint statement](https://www.premier.vic.gov.au/joint-statement-victoria-2026-commonwealth-games)

### Concrete reconstruction

| Frame                           | Case reconstruction                                                                                                                                                                                                                                                                                                                                                                                  | Durable record or evidence                                                                                | Next owner                                                                                  | Retry or repair class                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Objective and constraints       | **OBSERVED:** Deliver a regional, multi-hub Games in March 2026 with venues, villages, transport, event operations, and legacy benefits. The host contract required accommodation for 7,000 athletes, para-athletes, and team officials; the runway was four years.                                                                                                                                  | Regional concept, business case, heads of agreement, host contract, authorised budget                     | Government for host commitment; delivery bodies after commitment                            | Pre-contract options are revisable; signed obligations are not ordinary retries                       |
| Actors and ownership            | **OBSERVED:** Federation owned Games rights and direction; CGA endorsement was required; DJSIR/Games Office coordinated planning and budget; the Organising Committee owned event delivery; Development Victoria owned villages and major venues; DTP owned spectator/workforce transport and roads; DPC/DTF advised government; councils supported local delivery.                                  | Mandates, governance terms, agency plans, contract                                                        | Named body for each workstream; government for cross-system decisions                       | A handoff is valid only with an accepted owner and exact scope                                        |
| Facts and unknowns              | **OBSERVED:** Risks included short time, supply and labour limits, regional accommodation, and insufficient due diligence. Funding from the Australian Government and councils was assumed without firm commitments; councils controlling most venues were not consulted for the business case.                                                                                                      | Assumptions register, funding evidence, consultations, risk register, cost model                          | Source-owning agency; DJSIR assembles; DPC/DTF challenge                                    | Analysis may repeat only against current, reconciled facts                                            |
| Candidate rules                 | **OBSERVED:** The initial business case compared host versus not host and omitted lower-cost delivery configurations. Later sports expressions of interest were assessed against Federation requirements, competition quality, values, economic/community impact, cost, timeline, and athlete numbers, then endorsed by government and the Federation board.                                         | Option analysis; EOI submissions; panel assessment; endorsements                                          | Government owns host configuration; panel recommends sports; Federation co-controls program | Candidate comparison is revisable before endorsement; scope changes require downstream reconciliation |
| Information gathering           | **OBSERVED:** Early costing relied on desktop research and previous Games. Later work included due diligence, market work, delivery cases, designs, site investigation, procurement, cost models, and governance review. VAGO found material consultation and advice gaps.                                                                                                                           | Business-case versions, briefings, market soundings, designs, delivery cases, minutes                     | Specialist agency gathers; DJSIR coordinates; DPC/DTF review                                | New evidence invalidates dependent estimates; history remains immutable                               |
| Comparison                      | **OBSERVED:** The consequential comparison was not cheapest supplier. It joined net public cost, external funding, benefit–cost ranges, deliverability, legacy, deadline, regional topology, scope, and risk. By July 2023 officials advised that the Games could not meet the $3.6 billion target without abandoning the wholly regional model or materially reducing sports, venues, and villages. | Cost/benefit model, scenarios, risk-adjusted delivery options, unresolved assumptions                     | DTF/DPC advise; government decides                                                          | Computation is repeatable; decision changes require current whole-system inputs                       |
| Consequential decision          | **OBSERVED:** Victoria entered exclusive negotiation, signed heads of agreement, approved the budget/proposal, accepted the award, and signed the binding host contract. Later it added sports and disciplines, changed scope, and ultimately authorised termination.                                                                                                                                | MOU, heads of agreement, Cabinet decisions, host contract, scope decisions, termination authority         | Government and contract parties according to each decision                                  | Post-contract changes are new authorised effects, not mutation or replay                              |
| Communication / external effect | **OBSERVED:** The host contract created obligations across many bodies. Withdrawal was communicated to the Games parties and the public, procurement was paused, and settlement negotiation began.                                                                                                                                                                                                   | Contract notices, public announcement, procurement status, settlement correspondence                      | DPC led settlement; agencies paused and wound down their work                               | Public notice is non-idempotent; correction needs a new attributable record                           |
| Evidence                        | **OBSERVED:** VAGO examined business cases, budgets, contracts, briefings, delivery and cost records, agency roles, and settlement costs. It also recorded missing or inadequate consultation/advice as material negative evidence.                                                                                                                                                                  | Versioned business cases, host contract, budgets, plans, risk register, procurement records, audit record | Record owner; auditor independently evaluates public-sector evidence                        | Missing evidence remains missing; it cannot be filled with narrative confidence                       |
| Exception                       | **OBSERVED:** Detailed planning exposed higher operating, village, venue, transport, security, and temporary-infrastructure costs. A private village model was not viable in time; additional sports and a new hub increased coupled cost and delivery pressure; the authorised target could not preserve the original topology and scope.                                                           | Revised delivery cases, cost models, risk and scope records                                               | Workstream owner reports; government decides tolerance                                      | Reconcile every linked obligation before scope repair                                                 |
| Repair                          | **OBSERVED:** Government sought a $3.6 billion configuration and accepted $134.5 million of operating scope reductions. When no acceptable configuration emerged, it authorised termination; DPC negotiated/mediated settlement; Victoria agreed to pay $380 million; a regional package carried some residual initiatives and wind-up.                                                              | Scope-reduction decision, termination decision, settlement, payment, residual-program records             | DPC for settlement, DTF for payment, DJSIR and delivery agencies for wind-up/residue        | Termination and settlement are dedicated consequential actions; neither is an ordinary retry          |
| Completion                      | **OBSERVED:** The settlement finalised disputes between the named Games parties. **OBSERVED:** At VAGO’s March 2024 report, Games wind-up processes and final whole-of-government costs were still being finalised. The exact completion claim is therefore “host-contract disputes settled,” not “event lifecycle fully closed.”                                                                    | Executed settlement; final agency closeout and residual-project records still required                    | DJSIR and relevant agencies after settlement                                                | Settlement is terminal for covered disputes; operational residue continues under named owners         |

### Event-specific human and unsupported work

- **INFERRED:** A system may expose assumptions, ownership, changed scope,
  coupled cost, approvals, and unresolved evidence. It cannot legitimately
  replace elected-government authority to host or withdraw, public officials’
  duty to advise, or contract-party negotiation and settlement authority.
- **INFERRED:** Physical site investigation, venue and village design,
  transport/security planning, live safety control, market soundings, and event
  operations require accountable specialists and delivery organisations.
- **OBSERVED:** The event never occurred. The case therefore supplies no
  evidence of participant fulfilment, competition delivery, on-the-day incident
  recovery, or successful customer value.
- **INFERRED:** Choosing controlled withdrawal can be the correct repair. A
  workflow system that treats fulfilment as the only success state would conceal
  the actual decision.

### Event record residue

The event’s durable records do not collapse into one project or order:

| Record family                                            | Domain meaning that must survive                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Concept, MOU, heads of agreement, host contract          | Progressive legal and political commitment with different authorities        |
| Business-case and budget versions                        | Decision inputs with assumptions, ranges, benefit claims, and review history |
| Sport EOI and panel assessment                           | Program-content selection under Federation and government criteria           |
| Village, venue, transport, security, and operating plans | Coupled but separately owned delivery obligations                            |
| Procurement records                                      | Subordinate supplier engagements at different effect states                  |
| Public announcements and notices                         | Attributable external communications with stakeholder effects                |
| Termination and settlement                               | Repair of binding host obligations, not deletion of the failed plan          |
| Wind-up and residual initiatives                         | Continuing work after the headline contract dispute ended                    |

## Rejected false equivalences with procurement and supplier work

| Apparent equivalence                                                | Why it fails                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Airline offer = supplier quote                                      | **INFERRED:** An airline offer is inventory-, itinerary-, fare-rule-, and time-sensitive. The accepted result becomes passenger-specific carriage entitlement. A supplier quote may invite a later order and supplier response; the authority and expiry semantics differ. |
| Ticket or airline order = purchase order                            | **INFERRED:** A ticket evidences a specific passenger’s carriage contract. It is not a generic buyer instruction awaiting order acceptance, and its check-in, operating-carrier, disruption, and consumer-remedy states are travel-specific.                               |
| Check-in = goods receipt or acceptance                              | **OBSERVED/INFERRED:** A boarding pass evidences check-in, not completed carriage or acceptance of satisfactory delivery. A baggage receipt evidences custody of a bag, not its arrival or condition.                                                                      |
| Rebooking = order change                                            | **INFERRED:** Airline schedule change may be initiated operationally by the carrier and repaired through a replacement/refund choice. It is not necessarily a mutually negotiated commercial variation.                                                                    |
| Event = procurement program                                         | **OBSERVED/INFERRED:** Procurement was one subordinate workstream in Victoria 2026. Sports, venues, villages, transport, security, ceremonies, broadcast, ticketing, public funding, legal rights, and legacy decisions were separately owned and coupled.                 |
| Sport, venue, village model, and contractor = comparable candidates | **OBSERVED/INFERRED:** These candidates have different decision owners, evidence, effects, and completion tests. Putting them in one ranked supplier list would destroy business meaning.                                                                                  |
| Lowest price = event decision objective                             | **OBSERVED:** Victoria’s decision material included public cost, external funding, benefit–cost ranges, deliverability, deadline, topology, program requirements, risk, and legacy. A supplier-price comparison could not answer whether to host, rescope, or withdraw.    |
| Event permit/host right = supplier qualification                    | **INFERRED:** Permission or host rights bound the event to authority conditions. They do not attest that a particular delivery supplier is available, capable, current, or good value.                                                                                     |
| Cancellation = one universal effect                                 | **INFERRED:** A passenger refund request, airline operational cancellation, government host-contract termination, paused procurement, and mediated settlement all end or alter different obligations. They cannot share one unqualified “cancelled” meaning.               |
| Completion = planned outcome fulfilled                              | **OBSERVED/INFERRED:** The travel case’s remedy completion is unknown. The Games were not delivered, yet the named contract disputes were settled while wind-up continued. Honest completion attaches to the exact obligation, not the original ambition.                  |

## Smallest repeating trust properties

The cases support a minimum trust-property set, not a shared domain schema:

1. **Stable reference and exact object:** which itinerary, offer, ticket,
   contract, budget version, scope decision, or dispute is being acted on.
2. **Actor, principal, authority, and next owner:** who communicates, who bears
   the consequence, what they may decide, and who must act next.
3. **Sourced facts, freshness, and explicit unknowns:** current schedule and fare
   state in travel; current cost, scope, funding, and delivery evidence in the
   event.
4. **Decision rule and unresolved judgement:** what was mechanically compared
   and what remains preference-sensitive, professional, legal, political, or
   physical judgement.
5. **Attempt and external-effect identity:** whether a purchase, refund,
   contract, scope change, public notice, termination, or settlement took effect.
6. **Attributable evidence and honest resolution:** who asserted the status,
   which record proves it, and whether the outcome is confirmed, refused,
   disputed, or unknown.
7. **Referenced exception and repair:** the failure’s effect on coupled work,
   the prior state being repaired, and whether retry is safe, requires
   reconciliation, requires human judgement, or is terminal.
8. **Completion boundary and residue:** the exact obligation that ended, the
   work that remains, and its next accountable owner.

**INFERRED:** These properties could be evaluated consistently across cases.
They do not justify identical payload fields, lifecycle states, user interfaces,
provider adapters, legal meanings, or persistence tables.

## Retry classes evidenced by the cases

| Class                             | Travel example                                                                                              | Event example                                                                               |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Safe repeat with fresh inputs     | Search, status retrieval, deterministic comparison                                                          | Recalculate a scenario from the same reconciled evidence                                    |
| New attributable communication    | Ask airline for terms/status or send a remedy request                                                       | Request evidence, circulate revised advice, publish a corrective notice                     |
| Reconcile before retry            | Purchase when confirmation/payment is uncertain; refund when prior disposition is unclear                   | Procurement at mixed award stages; scope change after linked work has begun                 |
| Human judgement required          | Accept replacement versus refund; determine whether timing still serves the trip; dispute “reasonable time” | Balance public cost, benefit, topology, scope, deadline, risk, and legacy; host or withdraw |
| Terminal for the named obligation | Completed carriage, paid refund, or final dispute outcome                                                   | Executed settlement for covered disputes; separate wind-up remains                          |

## Inferences

- **INFERRED:** “Compare” is not one operation. Travel comparison can be
  deterministic against a person’s explicit timing, cost, and flexibility
  constraints; the Games comparison required public-value, delivery, risk, and
  authority judgements that cannot be inferred from price.
- **INFERRED:** The next owner is part of the result, not presentation metadata.
  Both cases became unsafe or stalled when different parties owned operating
  facts, decisions, remedies, or residual work.
- **INFERRED:** Repair is obligation-specific. A safe system must know whether
  it is retrying computation, repeating communication, creating a new
  consequential effect, reconciling an uncertain effect, escalating judgement,
  or closing a terminal obligation.
- **INFERRED:** Negative evidence is durable evidence. Missing consultation,
  unconfirmed funding, an unproven refund, or incomplete wind-up must remain
  visible rather than being converted to a confident narrative.
- **INFERRED:** The event case falsifies the idea that supplier automation is
  enough. Most difficult work was cross-owner truth production, coupled scope,
  authority, and recovery.

## Unknowns

- **UNKNOWN:** Whether the travel case is representative of current airline
  remedy handling; the ACCC example was published in 2017 and anonymised.
- **UNKNOWN:** Whether customers would permit an agent to purchase, change, or
  seek remedies for travel, and which exact authority evidence providers would
  accept.
- **UNKNOWN:** Whether a low-risk local event shares enough failure and
  continuation semantics with the Victoria 2026 mega-event to retain the same
  task boundaries without importing government-project complexity.
- **UNKNOWN:** Which event facts and provider evidence can remain current without
  shifting maintenance and reconciliation work to AE operators.
- **UNKNOWN:** Whether the eight trust properties survive a cheaper,
  independently operated transfer case without a parallel lifecycle.

## Hypotheses and falsifiers

| ID         | Hypothesis                                                                                                                      | Baseline                             | Measurement                                                                                            | Falsifier                                                                                               | Owner                 | Review by  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | --------------------- | ---------- |
| H-TG-TE-01 | A cold reviewer can identify the next safe action in both cases from the eight trust properties without the original transcript | Current narrative reconstruction     | Two independently reviewed projections, with authority and retry classification agreement              | Reviewer needs hidden history, selects the wrong owner, or treats an unknown effect as safely retryable | Product + Engineering | 2026-08-31 |
| H-TG-TE-02 | A low-risk local event and one direct travel repair can use the same trust-property rubric without sharing domain states        | Current desk cases                   | Field-derived case traces and rubric calibration by one travel practitioner and one event practitioner | Shared wording forces loss of fare/remedy, permit/safety, contract, or closeout meaning                 | Product               | 2026-09-30 |
| H-TG-TE-03 | Supplier matching is not the dominant burden in the selected event cohort                                                       | Email/forms/direct-provider baseline | Time and touches by search, evidence gathering, authority, coupled change, status, and repair          | Search/selection dominates and the direct supplier path is cheaper than AE coordination                 | Product               | 2026-09-30 |

## Decision impact

This record can contribute the travel and event cases required by Wayfinder
#183. It supports retaining a small cross-industry trust rubric while rejecting
a universal task or lifecycle schema.

It does not resolve the full ticket by itself: procurement and supplier cases
must be reconciled with these cases, remaining residue must be reviewed, and the
decision owner must determine whether the final grammar is sufficient. No
`PROJECT-RECORDS.md`, ADR, product-authority, source, or tracker update is
authorised by this artifact alone.

## Current-versus-target check

- **Current evidenced behavior:** AE can expose published business information,
  comparison, qualified inquiry, and exact authenticated Customer Request states
  proven through their intended surfaces. It does not currently book flights,
  issue tickets, operate events, award suppliers, terminate contracts, settle
  disputes, or fulfil travel or event services.
- **Target behavior informed by this research:** An agent may carry exact
  references, facts, authority, evidence, effect state, repair posture, and next
  owner across one independently useful interaction without pretending to own
  the whole travel or event lifecycle.
- **Claims this research does not authorize:** No independently operated supply,
  booking, payment, dispatch, fulfilment, permit approval, contract authority,
  legal remedy, customer value, provider value, production behavior, public
  market claim, or Action Invocation implementation is established here.

## Sources

- [ACCC — Airlines need to comply with consumer law](https://www.accc.gov.au/media-release/airlines-need-to-comply-with-consumer-law)
- [ACCC — Travel delays and cancellations](https://www.accc.gov.au/consumers/specific-products-and-activities/travel-delays-and-cancellations)
- [IATA — Distribution with Offers and Orders (NDC)](https://www.iata.org/en/programs/airline-distribution/retailing/ndc)
- [IATA — Fulfilment with Orders (ONE Order)](https://www.iata.org/en/programs/airline-distribution/retailing/one-order/)
- [Qantas — Conditions of Carriage](https://www.qantas.com/en-au/book/flights/conditions-of-carriage)
- [Qantas — Manage Booking](https://www.qantas.com/en-au/manage-booking)
- [Qantas — Flight changes by Qantas](https://www.qantas.com/en-au/manage-booking/flight-changes-by-qantas)
- [Victorian Auditor-General’s Office — Withdrawal from 2026 Commonwealth Games](https://www.audit.vic.gov.au/report/withdrawal-2026-commonwealth-games)
- [Victorian Government — Commonwealth Games costs too high at over $6 billion](https://www.premier.vic.gov.au/commonwealth-games-costs-too-high-over-6-billion)
- [Victorian Government and Games parties — Joint statement on Victoria 2026 Commonwealth Games](https://www.premier.vic.gov.au/joint-statement-victoria-2026-commonwealth-games)

# Synthetic public-event business rehearsal

**Tracker:** Wayfinder #182  
**Status:** Approved for labelled development simulation only  
**Supply class:** Synthetic mock businesses using the existing sandbox adapter  
**Environment:** Local/development only  
**Real-world effects:** None permitted  
**Field-evidence status:** None  
**Purpose:** Rehearse the business behavior AE would need to onboard before
approaching real businesses.

**Implementation note:** The existing workflow contract carries one
semantic string between steps. Each fictional provider therefore returns a
canonical JSON evidence envelope inside that source-owned field, and each
downstream provider parses and binds the exact upstream `packetRef` and
`version`. This is deliberately not a new universal task object or lifecycle.

## Decision supported

Determine whether a low-risk Perth public event/market activation can be
expressed as one independently useful task with three bounded business
contributions, without inventing a new lifecycle or treating a directory,
fixture, or shared adapter as independently operated supply.

The rehearsal may:

- expose missing inputs, unclear completion boundaries, hidden operator work,
  unsafe inferences, and weak refusal/recovery semantics;
- produce an onboarding interview and evidence checklist;
- identify the earliest source transition that fails in development; and
- show how idealized businesses would behave inside the target operating model.

It may not select the task, validate the cohort, satisfy the five-case field
gate, count the mock businesses as recruitable supply, or prove customer or
provider value.

## Ordinary-language customer job

> Turn my outline for a small weekend market in Perth into a current,
> approval-ready requirements and participating-business evidence packet. Show
> what is known, what needs confirmation, who owns each next step, and stop
> before any permit application, booking, payment, dispatch, certification, or
> approval.

## Completion boundary

The customer receives:

1. a sourced requirements packet;
2. a site and safety evidence packet; and
3. a participating-business readiness packet with explicit unknowns, refusal,
   freshness, and next ownership.

No mock business submits to an authority, certifies compliance, books a site or
supplier, charges money, dispatches staff/equipment, or represents an event as
approved or ready to operate.

## Mock cohort

All names below are fictional. Each is registered as a separate labelled
sandbox business but uses the same deterministic AE sandbox adapter. Within the
role-play they act as separate businesses; outside it they are not
independently operated supply.

### Mock business 1 — Ideal Event Requirements Adviser

**Contribution:** Convert the event outline and locality into a sourced
requirements packet.

**Inputs it should require**

- event type and public/private status;
- exact locality and proposed site;
- operating dates/times;
- expected attendance;
- food, alcohol, amplified sound, structures, road/footpath use, animals, and
  other declared activities;
- evidence-source cutoff date.

**How it should act**

- cite the named authority or official source for every requirement;
- attach a checked-at time and next review trigger;
- distinguish requirement, guidance, unknown, and professional/statutory
  judgement;
- refuse to infer approval, eligibility, site permission, or a missing
  regulated activity;
- return missing facts and the named person/authority who can resolve them;
- issue a new attributable version when a material fact or source changes; and
- never submit an application or speak for an authority.

**Completion evidence:** versioned requirements packet, source references,
freshness window, unresolved questions, and next owners.

**Retry/recovery:** safe to recompute before external use; if a source or prior
packet may have been relied on, reconcile the version and recipient first.

### Mock business 2 — Ideal Site and Safety Evidence Planner

**Contribution:** Turn the requirements packet into a site-specific evidence
and responsibility packet.

**Inputs it should require**

- exact requirements-packet reference and version;
- site plan or attributable site facts;
- access/egress and accessibility facts;
- structures, utilities, waste, security, first aid, traffic, weather, and
  emergency assumptions;
- named responsible people and evidence owners.

**How it should act**

- bind its response to the exact upstream packet and site facts;
- distinguish supplied evidence from its own planning work;
- show every missing document, inspection, professional sign-off, and authority
  decision;
- refuse when the site or event facts materially differ, evidence is stale, or
  professional judgement is required outside its scope;
- preserve customer decisions rather than silently choosing risk tolerances;
- identify the next owner for every unresolved item; and
- never certify safety, approve the site, or claim physical readiness.

**Completion evidence:** versioned evidence checklist, responsibility matrix,
known gaps, freshness/expiry, and explicit next owners.

**Retry/recovery:** exact replay returns the same packet; changed upstream
evidence creates a new version and invalidates dependent readiness claims.

### Mock business 3 — Ideal Event Business Readiness Desk

**Contribution:** Obtain and normalize bounded readiness responses from the
participating business roles needed for the event.

**Inputs it should require**

- exact site/safety packet reference and version;
- required business roles and comparable response fields;
- event dates/times, access conditions, and service boundaries;
- disclosure authority for each recipient and purpose;
- response deadline and freshness window.

**How it should act**

- disclose only the fields authorized for each named recipient and purpose;
- preserve each business response, refusal, non-response, condition, evidence,
  checked-at time, and expiry without converting them into an AE assertion;
- distinguish “can respond,” “conditionally suitable,” “needs confirmation,”
  “declined,” and “unknown”;
- expose any AE operator translation, chasing, or correction minutes;
- refuse a comparison when responses are materially unlike or stale;
- never infer availability, make a booking, accept a quote, or commit a
  business; and
- return a usable packet even when one business refuses or does not respond.

**Completion evidence:** attributable response matrix, evidence links,
freshness, conditions, unresolved items, operator interventions, and next
owners.

**Retry/recovery:** a safe retry is allowed only before a consequential inquiry
is sent; after an uncertain send, reconcile receipt/non-response before retry.

## Mock customer facts

These facts are fictional and exist only for the development run:

| Fact                     | Synthetic value                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| Event                    | Riverside Makers Market                                                                         |
| Locality                 | Perth, Western Australia                                                                        |
| Proposed site            | Fictional Riverside Community Forecourt                                                         |
| Date/time                | Saturday 17 October 2026, 08:00–16:00                                                           |
| Attendance               | 350 expected visitors                                                                           |
| Activities               | 24 stalls, packaged food, two hot-food stalls, acoustic music, temporary marquees               |
| Excluded activities      | No alcohol, road closure, animals, fireworks, or amplified stage                                |
| Customer role            | Fictional volunteer market coordinator                                                          |
| Maximum preparation cost | AUD 18.00 synthetic fixed total                                                                 |
| Authority                | Compare and prepare only; no submission, commitment, spend, or disclosure beyond mock providers |

The proposed date, site, actors, businesses, facts, prices, evidence, and
responses are fabricated. They must never be copied into a field workbook as
observations.

## Predeclared direct baseline

A cold agent goes directly to the three mock provider origins, discovers each
schema, maps the upstream output into the next input, supplies the same frozen
customer facts, and returns the final packet.

## Predeclared AE gain

For the declared development class, AE should:

- ask the customer only for facts that materially change the prepared packet;
- preserve one resumable Request rather than three disconnected calls;
- show maximum synthetic cost, recipients, purposes, effects, evidence,
  freshness, unknowns, and recovery before authority;
- bind each downstream step to the attributable upstream result;
- stop at exact confirmation;
- preserve progress and evidence after interruption; and
- avoid creating a parallel tracker or hidden operator transition.

No reduction in real customer/provider minutes can be claimed from this run.

## Failure scenarios

Run at least these scenarios through the same source-owned path:

1. **Happy preparation:** all three mock businesses return schema-valid packets.
2. **Missing material fact:** attendance or hot-food activity is absent; AE asks
   rather than infers.
3. **Stale upstream evidence:** the requirements packet changes before the site
   packet is used; dependent work is invalidated or refreshed.
4. **Business refusal:** the final mock business declines because disclosure
   authority is insufficient.
5. **Outcome unknown:** the final response may have been released; AE reconciles
   rather than automatically retrying.
6. **Direct control:** a single-provider direct task bypasses this three-step
   lifecycle when no continuity or safety benefit exists.

## Onboarding evidence to request from a real business later

The simulation becomes an interview aid, not a questionnaire to force-fit:

| Topic                | Evidence or behavior to observe                                                     |
| -------------------- | ----------------------------------------------------------------------------------- |
| Supported request    | A recent real request the business answers consistently                             |
| Required inputs      | Fields genuinely needed before it can answer or act                                 |
| Source and freshness | Owner, authoritative source, checked-at time, change trigger, expiry                |
| Refusal              | Real reasons to decline, redirect, or ask for clarification                         |
| Response             | Exact output, conditions, unknowns, and evidence the business can return            |
| Authority            | What the business may decide and what remains customer/professional/authority-owned |
| Attempt identity     | How receipt, duplicate, uncertain send, and replay are distinguished                |
| Recovery             | What is safely retryable and what must be reconciled                                |
| Maintenance          | Who updates material facts, how often, and observed effort                          |
| Operator burden      | Translation, normalization, chasing, correction, and support AE would add           |
| Completion           | Evidence that the business's bounded contribution is complete                       |
| Independence         | Whether it can perform and maintain the behavior without an AE employee             |

If real businesses cannot or will not behave this way, the simulation is
falsified. AE must refine, narrow, operate the human work deliberately as a
service, or stop; it must not replace the missing behavior with fixtures.

## Evidence and claim boundary

The strongest permitted conclusion is:

> At exact revision [REVISION], three explicitly fictional businesses exercised
> the canonical Customer Request development lifecycle through labelled
> sandbox registrations and a deterministic shared adapter. The run identified
> onboarding questions and source-contract gaps for a possible public-event
> task. It did not demonstrate independently operated supply, real business
> behavior, field freshness, customer/provider value, fulfilment, production
> reachability, or market selection.

## Development execution record — 2026-07-19

**Latest exact source revision:** `77ec35ac8c22c869a237fbc184d2af139f87af34`

**Named development deployment:** `loyal-peacock-107`

**Production deployment:** Not attempted

**Supply:** Three fictional labelled-sandbox registrations using one shared
deterministic adapter

The source loop produced structured, attributable JSON evidence envelopes and
passed the focused workflow, provider, registration, Request integration, and
lint gates. The development backend was updated with deploy-time TypeScript
checking disabled because the shared tree had 37 pre-existing type failures
outside this slice; this is not release evidence.

The cold development journey found and moved through these earliest failures:

1. local `/llms.txt` advertised a configured non-local canonical origin;
2. the ordinary dev seed omitted workflow capability supply;
3. the all-workflow acceptance seed was blocked by a historical contract
   identity conflict;
4. the runner required facts keyed by opaque post-response identifiers;
5. the six-question v2 contract exceeded the stable clarification path and its
   superseded binding remained eligible after v3 registration; and
6. after those source transitions were corrected, scheduled readiness probes
   repeatedly changed `capabilityPublications` while Request compilation tried
   to commit its registry snapshot, exhausting Convex transaction retries and
   returning `503 request_unavailable` from the public `/facts` transition.

**Verdict:** `FAIL_RECOVERY_OR_EVIDENCE` for the declared development journey.
The current earliest failing transition is clarification answer → durable
Request revision under concurrent publication-readiness writes. No completed
packet, direct-path advantage, customer value, independently operated supply,
production reachability, booking, approval, certification, dispatch, payment,
or fulfilment is claimed.

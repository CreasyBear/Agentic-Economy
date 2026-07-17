# Workflow substitution candidate review

**Owner:** Product
**Status:** Active
**Maturity:** Target research
**Question:** Which existing multi-party workflows are credible candidates for AE to transpose or partially replace, what work do they currently impose, and where could AE measurably remove coordination burden rather than merely add governance?
**Decision affected:** D-005
**Evidence cutoff:** 2026-07-17
**Review by:** 2026-08-17
**Supersedes:** None
**Superseded by:** None

## Executive finding

**INFERRED:** AE should not initially attempt to replace a profession, regulated
decision-maker, permit authority, or provider-specific operating system. Its credible
substitution target is the unpaid coordination layer between a requester, several
independent businesses, and an authority: eliciting the same facts once, determining
which participants and documents are required, finding eligible businesses, sequencing
requests, carrying conditions forward, recording decisions, and showing what is still
blocked.

The strongest first workflow candidates in this desk review are:

1. planning and gaining approval for a small public event or market activation;
2. triaging and completing common-property strata repairs;
3. coordinating the pre-lodgement path for a small commercial fit-out;
4. preparing a routine SME export consignment; and
5. coordinating an employer-led return-to-work case, but only as a tightly supervised
   support workflow because medical information and statutory responsibilities make it
   unsuitable for early autonomous action.

**INFERRED:** Event approval is the best first substitution experiment. It combines
conditional requirements, several independent suppliers and authorities, expiring
evidence, deadlines, and meaningful recovery, yet it can be bounded to low-risk events
where the user retains every submission and purchasing decision. The City of Perth's
own terms enumerate a variable bundle that may include event, site, risk, waste, noise,
traffic, structure, liquor, food, WorkSafe, and insurance material. That is a real
coordination burden rather than an architecture invented by AE.

**OBSERVED:** Current AE does not book, charge, dispatch, or automatically fulfil. Its
assistant-facing write is a qualified inquiry; the authenticated Request path can
interpret and prepare bounded proposals, while customer-visible multi-business choice
and execution remain unproven (`AGENTS.md`).

**UNKNOWN:** No primary field observation in this review measures how much time,
repetition, delay, or error people actually experience in any candidate workflow.
Official instructions establish required work and role boundaries, not willingness to
delegate it to AE or the size of the burden.

**HYPOTHESIS:** AE creates utility only if it removes requester or coordinator work on a
real case while preserving or improving correctness. A workflow is not validated merely
because AE can represent its steps.

## Review protocol

### Scope and definitions

- **Workflow replacement** means AE takes responsibility for a bounded unit of work
  currently performed manually across organisations: facts are collected, eligible next
  participants are identified, requests are sequenced, status is reconciled, and
  exceptions are returned to the right decision-maker.
- **Tool replacement** means replacing a form, directory, inbox, project board, booking
  site, or case-management application. This review does not recommend that. Those tools
  are often authoritative endpoints AE should interoperate with.
- **Transposition** means expressing an incumbent workflow as a durable Request with
  conditional stages, explicit decisions, evidence, authority limits, and recovery,
  without changing who legally or professionally owns each decision.
- **Coordination burden** is work the requester or an intermediary performs to preserve
  context and progress across parties. It includes repeated fact entry, provider search,
  eligibility checking, document chasing, hand-offs, status chasing, appointment
  alignment, deadline tracking, and recovery from rejection or non-response.

### Inclusion criteria

A candidate was retained when official workflow-owner material showed at least four of:

1. three or more independent roles or organisations;
2. a conditional path rather than a single transaction;
3. facts or evidence that must cross organisational boundaries;
4. a human approval or authority boundary;
5. sequencing or dependency between steps;
6. expiry, deadline, or state change;
7. meaningful partial failure or recovery;
8. an observable completed outcome.

### Exclusion and penalty criteria

Candidates were penalised when:

- the dominant work is expert judgment rather than coordination;
- incorrect routing can cause material health, safety, housing, employment, legal, or
  financial harm;
- a single incumbent already owns the complete workflow and exposes reliable status;
- supply cannot publish sufficiently exact eligibility and readiness facts;
- the workflow is mostly one provider booking or price comparison;
- AE would require the requester to model more facts or make more decisions than the
  incumbent path;
- completion cannot be independently observed; or
- a platform, insurer, authority, or professional cannot accept delegated interaction.

### Evidence method and limitations

**OBSERVED:** Sources were restricted to official government, regulator, scheme-owner,
and workflow-owner instructions available by the evidence cutoff. They describe current
roles, required evidence, and process structure.

**INFERRED:** Candidate ranking weighs burden-removal potential, boundedness, supply
recruitability, consequence of error, and fit with AE's target Request lifecycle.

**UNKNOWN:** This was not a systematic academic literature review, time-and-motion study,
legal opinion, user interview program, or implementation proof. Search coverage was
Australia-first and intentionally biased toward Western Australian workflows that could
be observed locally.

## Candidate longlist

| Candidate | Officially evidenced multi-party structure | Potential substitution unit | Initial disposition |
|---|---|---|---|
| Small public event / market activation | Organiser, venue/local government, food vendors, traffic/structure specialists, insurer, licensing bodies | Requirements discovery through approval-ready packet and vendor readiness board | **Shortlist 1** |
| Strata common-property repair | Occupier/owner, strata company/council, manager, contractors, sometimes insurer | Issue intake through authorised scope, quotes, access, work evidence, and closure | **Shortlist 2** |
| Small commercial fit-out pre-lodgement | Tenant/owner, designer, building surveyor, builder, local government, specialist consultants | Dependency map and approval-ready hand-offs, not certification | **Shortlist 3** |
| Routine SME export consignment | Exporter, buyer, freight forwarder, customs broker, carrier, insurer, ABF and sometimes commodity regulator | Shipment facts through compliant document and hand-off readiness | **Shortlist 4** |
| Employer-led return to work | Employee, employer/case manager, practitioner, rehabilitation provider, claims manager | Consent-aware case coordination and action tracking | **Shortlist 5; supervised only** |
| NDIS home modification | Participant, planner, qualified assessor, construction practitioner, project manager, builder and sometimes architect/engineer/surveyor | Provider and evidence coordination | **Do not start:** high consequence, funding and clinical boundaries |
| Generic business licensing | Business, local/state/federal authorities, professional advisers | Requirement discovery and application tracking | **Research later:** too heterogeneous without one activity and locality |
| Ordinary single-provider service booking | Customer and one provider | Search, compare, book | **Reject:** insufficient cross-business coordination; direct path likely easier |

## Ranked workflow decompositions

### 1. Small public event or market activation

#### Incumbent baseline

**OBSERVED:** The City of Perth states that an event organiser first discusses site
availability and supplies an overview, then must submit an Event Application within ten
business days to secure a tentative booking. Depending on risk, scale, and complexity, a
medium event may require an Event Management Plan, scaled site plan, risk, waste, noise,
and traffic plans; temporary-structure engineering; liquor, food-vendor and WorkSafe
approvals; and public-liability evidence. Major events may require a deed. [City of Perth,
Event Application General Terms and Conditions](https://perth.wa.gov.au/-/media/Project/COP/COP/COP/Documents-and-Forms/Live-and-Work/Forms/Hire-and-Bookings/Event-Application-General-Terms-and-Conditions-V2.pdf)

**OBSERVED:** A temporary food outlet must be a registered food business approved to
trade at temporary events and provide its registration, stall layout, and public-liability
insurance with the City application. [City of Perth, Special Events Permit — Food
Vehicles and Temporary Food Outlets](https://perth.wa.gov.au/-/media/Project/COP/COP/COP/Documents-and-Forms/Live-and-Work/Forms/Residents-and-Businesses-Forms/Special-Events-Permit-Form---Food-Vehicles-and-Temporary-Food-Outlets.pdf)

**OBSERVED:** Australian government guidance says event operators may need separate
permissions for public land or roads, food or alcohol, amusement equipment, music, and
heritage sites; requirements vary by activity and jurisdiction. [business.gov.au, Arts
and recreation services industry](https://business.gov.au/planning/industry-information/arts-and-recreation-services-industry)

#### Friction and user work

**INFERRED:** The organiser currently acts as requirements analyst, document router,
vendor-evidence collector, deadline keeper, and exception manager. The same event facts
must be translated into different applications, while supplier selection is constrained
by permit, insurance, timing, site, and risk requirements.

#### AE transposition

**INFERRED:** One Event Request could collect the event facts once; derive a conditional
requirements checklist; show which permissions and specialists are required; request
evidence from selected vendors; preserve site and date constraints across inquiries;
assemble an approval-ready packet; and surface missing, rejected, or expiring items.
The organiser must approve submissions, contracts, spend, and material scope changes.

#### Prerequisites

- One locality and a narrow event class, such as a non-alcohol, daylight market of a
  bounded attendance and footprint.
- Authority-owned requirement rules with effective dates and human review of ambiguity.
- Participating vendors that publish service area, dates, insurance and registration
  evidence, event constraints, response time, and supported next step.
- Intake and evidence-sharing consent; document redaction; immutable submission copies.
- Status readback from the authority or an explicit manual-confirmation fallback.

#### Disqualifiers

- Events requiring emergency services, road closures, large crowds, high-risk structures,
  liquor, pyrotechnics, animals, or contested public-space impacts in the first cohort.
- Any path where AE presents approval as guaranteed or treats vendor documents as current
  without source and expiry evidence.
- A council's own guided application already completes the same cohort with less work.

#### Measurement and falsifier

**HYPOTHESIS H-WF-01:** For 20 low-risk Perth event applications, AE-assisted organisers
will reduce median organiser active coordination time by at least 30% and repeated fact
entries by at least 50% versus the current council-and-email path, without increasing
incomplete submissions, authority clarification requests, or elapsed time to acceptance.

**Falsifier:** The threshold is missed; any serious requirement is omitted; users must
maintain a parallel tracker; or authority clarification/rejection rises by more than 5
percentage points.

### 2. Strata common-property repair

#### Incumbent baseline

**OBSERVED:** A strata company must control, manage, maintain, renew, and replace common
property. Budget and resolution boundaries constrain spending, and larger schemes must
maintain a ten-year maintenance plan and reserve fund. A strata manager exercises only
the powers given in its written contract; the council must instruct and monitor it.
[Landgate, Resources for strata companies](https://www.strata.wa.gov.au/strata-and-community-titles/strata-titles/learn-about-strata/resources-for-strata-companies/)

**OBSERVED:** Lot owners can arrange work within their lot subject to by-laws, but work
affecting common property may need strata-company permission. Common-property problems
should be raised with the strata manager or council. Whether the company can proceed
depends partly on budget or resolution authority. [Landgate, Resources for strata
tenants](https://www.landgate.wa.gov.au/strata-and-community-titles/strata-titles/learn-about-strata/resources-for-strata-tenants/)

#### Friction and user work

**INFERRED:** The burden lies in classifying responsibility, documenting the defect,
deciding urgency, checking by-laws and spending authority, obtaining comparable scopes
and quotes, coordinating property access, notifying affected people, tracking work, and
retaining evidence for payment and future disputes.

#### AE transposition

**INFERRED:** One Repair Request could preserve photos, location, impact, access windows,
and prior work; route responsibility to owner or strata company; obtain like-for-like
scopes from eligible contractors; show the council the decision and spending boundary;
coordinate notices and access after approval; and close only with completion evidence and
resident confirmation. It must not decide legal responsibility or exercise a resolution.

#### Prerequisites

- One strata company's by-laws, delegation schedule, preferred-vendor rules, emergency
  policy, budget authority, and notice requirements encoded and reviewed.
- Contractor licence, insurance, service-area, trade, availability, access and evidence
  fields kept current.
- Separate urgent-safety escalation from ordinary repair coordination.
- Council/manager approval and a recoverable audit trail for every instruction.

#### Disqualifiers

- Disputed lot/common-property boundaries, structural defects, litigation, major insurance
  claims, unsafe premises, or repairs requiring a formal general-meeting resolution.
- A strata-management platform already provides complete intake-to-closure coordination
  for the participating scheme at lower requester effort.

#### Measurement and falsifier

**HYPOTHESIS H-WF-02:** Across 30 ordinary repairs in 3–5 schemes, AE will reduce median
resident follow-ups and manager manual touches by 30%, and reduce requests lacking the
minimum diagnostic evidence by 50%, without increasing time to make-safe, rework, cost
variance, complaints, or unauthorised instructions.

**Falsifier:** Managers duplicate the case in email or their incumbent system; scope
comparability is poor; authority must be re-established manually; or any contractor is
instructed beyond the recorded approval.

### 3. Small commercial fit-out pre-lodgement

#### Incumbent baseline

**OBSERVED:** For WA commercial buildings, a certified building-permit application is
mandatory. The applicant engages a registered building surveyor, who issues the
Certificate of Design Compliance; the applicant then sends that certificate, the BA1,
and referenced plans and specifications to the permit authority. The legislated permit
processing period after lodgement is ten business days. [City of Perth, Permits,
licences and approvals](https://www.perth.wa.gov.au/building-and-planning/planning-and-building-applications/building-permits-licenses-and-approvals)

**OBSERVED:** The state workflow includes distinct application, compliance-certificate,
permit, completion, occupancy, amendment, and extension forms; the local government owns
assessment and local requirements. [WA Building and Energy, Building
approvals](https://www.wa.gov.au/organisation/building-and-energy/building-approvals)

**OBSERVED:** Some local-government guidance requires planning approval before the
building-permit application and requires all plans referenced by the compliance
certificate. [Shire of Harvey, BA1 certified application
checklist](https://www.harvey.wa.gov.au/build-and-develop/building/building-applications-and-forms/ba1-application-for-building-permit-certified-%282%29)

#### Friction and user work

**INFERRED:** A small business must discover the dependency order, find and brief a
designer and surveyor, reconcile owner/tenant/builder signatures, ensure planning
conditions are reflected in drawings, manage revisions across consultants, and only then
submit a complete permit packet.

#### AE transposition

**INFERRED:** AE could replace the tenant's ad hoc coordination from a fit-out goal to an
approval-ready packet: identify which professionals are needed, preserve site and use
facts, request proposals against one scope, track predecessor approvals and drawing
versions, and prevent premature lodgement. Surveyors, designers, builders, owners, and
the permit authority retain all certification, design, construction, consent, and
approval decisions.

#### Prerequisites

- One municipality, building class, use type, and low-complexity alteration cohort.
- Registered-professional and contractor sources, exact service scope, document-version
  control, signatures, and condition traceability.
- Professional review of requirement rules; no automated compliance claim.

#### Disqualifiers

- Heritage, change of use, major structural/fire engineering, contaminated land,
  neighbour consent, performance solutions, or uncertain planning status.
- Any representation that AE certifies compliance or guarantees approval.

#### Measurement and falsifier

**HYPOTHESIS H-WF-03:** For 15 bounded fit-outs, AE will reduce coordinator active hours
and document-chasing contacts by 25%, and cut preventable pre-lodgement completeness
defects by 40%, without increasing professional fees, revision cycles, or approval delay.

**Falsifier:** Professionals cannot use the shared packet, version conflicts increase,
local exceptions dominate reusable rules, or applicants still hire a coordinator for the
same work.

### 4. Routine SME export consignment

#### Incumbent baseline

**OBSERVED:** Australian exporters must comply with Australian and destination-country
rules; most goods valued above AUD 2,000 require an export declaration, and some goods
require permits. Government guidance explicitly warns of paperwork, compliance, hidden
costs, delayed payment, and cross-border legal differences. [business.gov.au, Exporting
and your business](https://business.gov.au/products-and-services/exporting/exporting-and-your-business)

**OBSERVED:** Austrade describes the export journey as sequencing freight choices,
working with freight forwarders, customs brokers and logistics providers, managing
documentation and insurance, and responding to delay, damage, and disruption.
[business.gov.au / Austrade, Export essentials: Coordinating freight and
logistics](https://business.gov.au/events-and-training/export-essentials-coordinating-freight-and-logistics)

#### Friction and user work

**INFERRED:** The exporter translates product, destination, value, delivery term, timing,
and risk facts into carrier, broker, forwarder, insurer, buyer, and regulator hand-offs;
checks whether permits apply; reconciles document versions; and responds when a carrier
or authority cannot proceed.

#### AE transposition

**INFERRED:** A Shipment Request could collect shipment facts once; identify the required
professional and regulatory hand-offs; solicit comparable forwarder/broker options;
preserve selected service levels and insurance constraints; assemble the document pack;
and show holds, deadlines, and accountable next parties. AE must not provide customs or
destination-country legal advice, lodge without authority, or treat carriage as fulfilled
without carrier and border evidence.

#### Prerequisites

- A narrow lane and commodity with no controlled, dangerous, perishable, dual-use, or
  biosecurity-sensitive goods.
- Broker/forwarder participation, authoritative tariff/permit checks, buyer data-sharing
  consent, document integrity, and event/status feeds.

#### Disqualifiers

- Controlled goods, uncertain classification or origin, sanctions exposure, letters of
  credit, unusual Incoterms, cold chain, live cargo, or multi-country transshipment.
- A forwarder already provides a single intake and end-to-end status for the cohort.

#### Measurement and falsifier

**HYPOTHESIS H-WF-04:** For 20 repeat shipments on one lane, AE will reduce exporter
active administration time and repeated data entry by 30%, with no rise in customs holds,
document corrections, landed-cost variance, or missed cut-offs versus the forwarder-led
baseline.

**Falsifier:** Broker re-entry remains necessary, data cannot be kept authoritative,
exception rate overwhelms the standard path, or forwarder integration costs exceed the
saved exporter work.

### 5. Employer-led return-to-work coordination — supervised candidate

#### Incumbent baseline

**OBSERVED:** Comcare describes eight employer-led steps: notification, appointment of a
rehabilitation case manager, assessment of need, rehabilitation assessment, program
arrangement, monitoring, suitable employment, and closure. The process may involve the
employee, supervisor, case manager, treating practitioner, approved rehabilitation
provider, assessor, and claims manager. [Comcare, Return to work process for
employers](https://www.comcare.gov.au/claims/employer-information/return-to-work-employers)

**OBSERVED:** Even when a rehabilitation provider is engaged, the employer remains
responsible for the overall process. Comcare calls for timely and clear referrals,
relevant information, documented communication expectations, timeframes, outcomes, and
collaboration across the employee, practitioner, provider, case manager, and work area.
[Comcare, Working with workplace rehabilitation
providers](https://www.comcare.gov.au/claims/employer-information/working-with-workplace-rehabilitation-providers)

**OBSERVED:** Case conferences are used when several providers are involved, progress
stalls, circumstances change, advice conflicts, or barriers persist; they allocate
actions and consider work capacity and adjustments. [Comcare, Case
conferences](https://www.comcare.gov.au/claims/getting-you-back-to-work/case-conferences)

#### Friction and user work

**INFERRED:** The case manager coordinates consented medical information, referrals,
provider selection, appointments, capacity changes, suitable duties, actions, milestones,
and conflicting advice while maintaining privacy and statutory responsibility.

#### AE transposition

**INFERRED:** AE could support—not replace—the case manager by maintaining a consent-aware
action plan, requesting missing information from the accountable party, matching approved
providers against explicit needs, scheduling review points, and presenting conflicts or
changes for human resolution. It must not interpret medical capacity, determine benefits,
select duties, compel assessment, or close a rehabilitation program.

#### Prerequisites

- Scheme-owner and employer legal/privacy review; explicit purpose-limited consent;
  medical-data minimisation; role-based access; correction and revocation handling.
- Employer case manager remains owner of every determination and communication.
- An approved-provider directory is necessary but insufficient; current capacity,
  speciality, responsiveness, location, and service acceptance must be confirmed.

#### Disqualifiers

- Psychological injury, dispute, conflicting medical advice, adverse employment action,
  claim rejection, litigation, coercion risk, or any request to automate a determination.
- Inability to prevent disclosure of unrelated medical information.

#### Measurement and falsifier

**HYPOTHESIS H-WF-05:** In a supervised pilot of uncomplicated accepted cases, AE will
reduce case-manager administrative touches by 20% and overdue agreed actions by 30%, with
no privacy incident, inappropriate disclosure, missed statutory action, lower worker
trust, or worse durable return-to-work outcome.

**Falsifier:** Any privacy or authority breach; workers report reduced agency; clinicians
must duplicate communication; or administrative savings do not exceed governance and
review overhead.

## Important rejected or deferred candidate

### NDIS home modification

**OBSERVED:** Home modification involves a qualified occupational-therapy assessor and,
for complex cases, may involve an independent construction practitioner, project manager,
builder, architect, engineer, and building surveyor. Complex modifications require two
itemised quotes or a cost estimate, and the assessment informs an NDIA funding decision.
[NDIS, Guide to providing home
modifications](https://ndis.gov.au/providers/home-and-living-providers/home-modifications/guide-providing-home-modifications)

**OBSERVED:** The assessor recommends modifications against disability support needs and
goals; construction and project-management roles have independence requirements. [NDIS,
What is a home modification
assessor](https://www.ndis.gov.au/participants/home-and-living/modifying-your-home/what-home-modification-assessor)

**INFERRED:** This is structurally an excellent match for durable multi-party
coordination, but a poor first substitution target. Errors can affect safety, housing,
clinical needs, public funding, and participant autonomy. The coordination problem should
be studied, but only after AE proves lower-consequence workflows and with participant,
assessor, NDIA, and disability-advocacy co-design.

## Cross-candidate comparison

Scores are directional inferences from official process structure, not market evidence.
Five is favourable; consequence score five means low consequence of coordination error.

| Candidate | Repeated coordination | Conditional structure | Observable completion | Recruitable independent supply | Low consequence | Incumbent consolidation gap | Total / 30 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Small public event | 5 | 5 | 5 | 4 | 4 | 5 | **28** |
| Strata ordinary repair | 5 | 4 | 5 | 5 | 3 | 4 | **26** |
| Small commercial fit-out | 5 | 5 | 4 | 4 | 2 | 4 | **24** |
| Routine export consignment | 5 | 5 | 5 | 3 | 2 | 3 | **23** |
| Return to work | 5 | 5 | 4 | 3 | 1 | 3 | **21** |
| NDIS home modification | 5 | 5 | 4 | 3 | 1 | 3 | **21; deferred** |

**INFERRED:** The ranking favours events because the workflow is legible, bounded, and
measurable without AE making the underlying regulatory or professional judgments.
Strata repair may yield the most frequent operational cases, but responsibility and
approval rules are scheme-specific. Commercial fit-out and export have larger potential
value per case but stronger professional integration and liability barriers. Return to
work and home modification are coordination-rich precisely because they are sensitive;
that makes them later-stage, supervised opportunities rather than first proofs.

## What AE must actually remove

Across candidates, AE should be evaluated on whether it removes these units of work:

| Incumbent work | AE target | Evidence of removal |
|---|---|---|
| Explain the same request to each party | One canonical fact set with purpose-specific views | Count requester fact restatements and corrections |
| Discover who is needed | Conditional participant and requirement identification | Time and contacts before complete participant set |
| Find an eligible and available business | Exact fit plus live acceptance, not directory search alone | Search contacts, false referrals, response/acceptance rate |
| Reconcile incomparable proposals | One scope and explicit variants/exclusions | Human reconciliation time; scope defects |
| Chase documents and expiry | Accountable evidence request and freshness state | Chasing contacts; expired/missing items |
| Preserve dependencies and deadlines | Visible predecessor, owner, due date and blocker | Missed dependencies/cut-offs; overdue actions |
| Re-brief after failure | Resume from durable state with unchanged constraints | Facts re-entered; recovery time; duplicated effects |
| Determine whether work is done | Source-specific completion evidence and requester confirmation | False-completion rate; unresolved reopenings |

**HYPOTHESIS H-WF-00:** In the selected first workflow, AE must reduce at least one
primary burden metric by 30% and not worsen correctness, elapsed completion, total cost,
user control, or serious-incident rate. If it only improves auditability while increasing
active work, it has added governance rather than utility.

## Current-versus-target check

- **Current evidenced behavior:** AE can publish business-supplied pages for reading and
  comparison, send a qualified inquiry, and expose exact authenticated Request states
  proven through intended surfaces. It does not currently book, charge, dispatch, or
  automatically fulfil. This research adds no implementation or production proof.
- **Target behavior informed by this research:** A durable Request should preserve facts
  and conditions across businesses, identify conditional participants and evidence,
  prepare comparable options, obtain explicit human authority, coordinate bounded
  hand-offs, and recover from partial failure.
- **Claims this research does not authorize:** That AE can currently run any reviewed
  workflow; that official authorities or businesses accept AE-mediated submissions; that
  people will trust or pay for it; that the ranked workflow is selected; that AE improves
  time, cost, correctness, safety, or outcomes; or that any regulated/professional
  decision can be automated.

## Fieldwork required before selection

1. Shadow at least five recent cases in each of the top two workflows and reconstruct the
   actual message, call, form, document, wait, correction, and decision sequence.
2. Measure requester/coordinator active time, number of parties, repeated facts, manual
   touches, elapsed time, corrections, rejection reasons, and recovery events.
3. Ask workflow owners which steps they would delegate, which evidence they accept, and
   which communications must remain direct.
4. Recruit at least three independent providers per required role and test whether their
   eligibility, readiness, evidence, response, and status can remain current.
5. Run the same bounded cases through incumbent and AE-assisted paths. Preserve human
   submission and approval until the safety and correctness bar is met.
6. Reject the candidate if users need a parallel tracker, providers must re-key all facts,
   or integration/governance work exceeds the coordination removed.

## Hypotheses and falsifiers

| ID | Hypothesis | Baseline | Measurement | Falsifier | Owner | Review by |
|---|---|---|---|---|---|---|
| H-WF-00 | Selected workflow removes material coordination rather than adding governance | Observed incumbent cases | Primary burden -30%; non-inferior correctness, time, cost, control | Burden threshold missed or any serious authority/safety failure | Product | 2026-08-17 |
| H-WF-01 | Low-risk event coordination is the strongest first substitution unit | Council forms, email, organiser tracker | Active time, repetition, completeness, clarification and acceptance | Thresholds in candidate section missed | Product | 2026-08-17 |
| H-WF-02 | Ordinary strata repair can reduce resident and manager touches | Current scheme process | Follow-ups, manual touches, evidence completeness, repair outcome | Parallel tracking, poor scopes, authority error | Product | 2026-08-17 |
| H-WF-03 | Bounded fit-out pre-lodgement can reduce document chasing and defects | Current applicant/professional coordination | Active hours, contacts, defects, revisions, approval delay | Professional duplication or local exceptions dominate | Product | 2026-08-17 |
| H-WF-04 | One-lane routine export coordination can reduce SME administration | Forwarder-led shipment | Active time, re-entry, holds, corrections, cost variance | Broker duplication or exception/integration cost dominates | Product | 2026-08-17 |
| H-WF-05 | Supervised return-to-work support can reduce administrative touches safely | Employer case-management process | Touches, overdue actions, trust, privacy, durable outcome | Any privacy/authority incident or no net saving | Product | 2026-08-17 |

## Decision impact

- **INFERRED:** Recommend field observation and a paired-baseline prototype for low-risk
  public events before selecting a request family. Keep strata ordinary repair as the
  second field cohort.
- No decision is adopted by this record. D-005 remains open.
- If the project selects a workflow, add or update the relevant project record and
  research queue item. No authority or ADR change is warranted by this desk review.
- A later decision to let AE submit, contract, spend, or make a regulated determination
  would require explicit authority work and likely an ADR.

## Sources

- [City of Perth — Event Application General Terms and Conditions](https://perth.wa.gov.au/-/media/Project/COP/COP/COP/Documents-and-Forms/Live-and-Work/Forms/Hire-and-Bookings/Event-Application-General-Terms-and-Conditions-V2.pdf)
- [City of Perth — Special Events Permit: Food Vehicles and Temporary Food Outlets](https://perth.wa.gov.au/-/media/Project/COP/COP/COP/Documents-and-Forms/Live-and-Work/Forms/Residents-and-Businesses-Forms/Special-Events-Permit-Form---Food-Vehicles-and-Temporary-Food-Outlets.pdf)
- [business.gov.au — Arts and recreation services industry](https://business.gov.au/planning/industry-information/arts-and-recreation-services-industry)
- [Landgate — Resources for strata companies](https://www.strata.wa.gov.au/strata-and-community-titles/strata-titles/learn-about-strata/resources-for-strata-companies/)
- [Landgate — Resources for strata tenants](https://www.landgate.wa.gov.au/strata-and-community-titles/strata-titles/learn-about-strata/resources-for-strata-tenants/)
- [WA Building and Energy — Building approvals](https://www.wa.gov.au/organisation/building-and-energy/building-approvals)
- [City of Perth — Permits, licences and approvals](https://www.perth.wa.gov.au/building-and-planning/planning-and-building-applications/building-permits-licenses-and-approvals)
- [Shire of Harvey — BA1 certified application checklist](https://www.harvey.wa.gov.au/build-and-develop/building/building-applications-and-forms/ba1-application-for-building-permit-certified-%282%29)
- [business.gov.au — Exporting and your business](https://business.gov.au/products-and-services/exporting/exporting-and-your-business)
- [business.gov.au / Austrade — Export essentials: Coordinating freight and logistics](https://business.gov.au/events-and-training/export-essentials-coordinating-freight-and-logistics)
- [Comcare — Return to work process for employers](https://www.comcare.gov.au/claims/employer-information/return-to-work-employers)
- [Comcare — Working with workplace rehabilitation providers](https://www.comcare.gov.au/claims/employer-information/working-with-workplace-rehabilitation-providers)
- [Comcare — Case conferences](https://www.comcare.gov.au/claims/getting-you-back-to-work/case-conferences)
- [NDIS — Guide to providing home modifications](https://ndis.gov.au/providers/home-and-living-providers/home-modifications/guide-providing-home-modifications)
- [NDIS — What is a home modification assessor](https://www.ndis.gov.au/participants/home-and-living/modifying-your-home/what-home-modification-assessor)

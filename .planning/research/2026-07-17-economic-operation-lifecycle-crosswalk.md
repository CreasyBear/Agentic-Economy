# Economic-operation lifecycle crosswalk

**Owner:** Engineering  
**Status:** Active  
**Maturity:** Target research  
**Question:** Which recurring human tasks and durable records appear across established order, procurement, and contract-administration lifecycles, and what do they imply for AE Economic Operations and bundles?  
**Decision affected:** [ADR-009: Make Economic Operation the reusable unit beneath Customer Request](../adr/ADR-009-economic-operation-beneath-customer-request.md)  
**Evidence cutoff:** 2026-07-17  
**Review by:** 2026-10-17  
**Supersedes:** None  
**Superseded by:** None

## Executive finding

Established procurement and contract standards do not support the idea that one system must own an entire commercial lifecycle. They model separately meaningful interactions—catalogue publication, qualification, solicitation, quotation, order, response, change, cancellation, despatch, receipt, inspection, acceptance, invoice review, dispute, payment, and closeout—joined by references and role-specific records.

The high-confidence architectural lesson for AE is therefore not to reproduce a procurement suite. It is to make each consequential interaction independently admissible, inspectable, attributable, and resumable, while allowing bundles and full routes to compose those interactions.

The recurring unit of work has five parts:

> prior state → authorized task → attributable attempt → durable result → explicit next owner

This research supports an eval-first Economic Operation design. It does not prove demand, provider adoption, endpoint shape, pricing, or that every task should be automated.

## Observations

### Processes are joined records, not one indivisible transaction

- **OBSERVED:** The Open Contracting Data Standard (OCDS) represents tender, award, contract, and implementation as stages of one contracting process, linked by a common contracting-process identifier. Its records include specifications, enquiries, bidders, bid evaluation, signed contracts, amendments, payments, progress updates, and completion or termination information. [OCDS primer](https://standard.open-contracting.org/latest/en/primer/how/)
- **OBSERVED:** OCDS distinguishes open, selective, limited, and direct procurement. In a selective process, suppliers first request participation and only qualified suppliers proceed to tender. [OCDS pre-qualification guidance](https://standard.open-contracting.org/latest/en/guidance/map/pre-qualification/)
- **OBSERVED:** OASIS UBL defines distinct business documents for sourcing and ordering, including Catalogue Request, Catalogue, Request for Quotation, Quotation, Order, Order Response, Order Change, and Order Cancellation. UBL describes ordering as the collaboration that creates a contractual obligation between buyer and seller. [OASIS UBL 2.3](https://docs.oasis-open.org/ubl/UBL-2.3.html)
- **OBSERVED:** Peppol Advanced Ordering treats the initial order, seller response, buyer or seller change, and cancellation as separate referenced messages. An order response can accept, reject, or propose changes at order and line level; the resulting accepted order is ready for delivery. [Peppol BIS Advanced Ordering](https://docs.peppol.eu/poacc/upgrade-3/2025-Q4/profiles/65-advanced-ordering/)
- **OBSERVED:** Peppol Order Agreement permits several entry points. A purchase can originate in a web shop, phone call, physical visit, or framework arrangement; the seller then sends a structured agreement that the buyer records in its purchasing system. [Peppol BIS Order Agreement](https://docs.peppol.eu/poacc/upgrade-3/2025-Q4/profiles/42-orderagreement/)

### State, business meaning, and transport acknowledgement are different

- **OBSERVED:** Peppol distinguishes transport acknowledgements from business processing responses. An Invoice Response reports one business status at a time for a referenced invoice and can include clarification and expected corrective action. [Peppol BIS Invoice Response](https://docs.peppol.eu/poacc/upgrade-3/profiles/63-invoiceresponse/)
- **OBSERVED:** The invoice-response process may begin at any supported status and may omit intermediate statuses. It does not prescribe the buyer's internal workflow. Rejection and dispute can require an external process rather than another message in the same profile. [Peppol BIS Invoice Response](https://docs.peppol.eu/poacc/upgrade-3/profiles/63-invoiceresponse/)
- **OBSERVED:** Peppol requires references from responses, changes, and cancellations back to the relevant order, including line references where applicable. Order changes also carry a sequence number to preserve ordering of revisions. [Peppol BIS Advanced Ordering](https://docs.peppol.eu/poacc/upgrade-3/2025-Q4/profiles/65-advanced-ordering/)
- **OBSERVED:** OCDS uses releases to describe a contracting process at particular points in time and joins them with a stable process identifier. [OCDS primer](https://standard.open-contracting.org/latest/en/primer/how/)

### Authority and acceptance are assigned, bounded acts

- **OBSERVED:** Under the US Federal Acquisition Regulation (FAR), contract-administration functions can be delegated or retained; functions not delegated remain with the contracting office. Relevant functions include reviewing proposals, negotiating price adjustments, issuing changes, evaluating contractor performance, and maintaining correspondence. [FAR Part 42](https://www.acquisition.gov/far/part-42)
- **OBSERVED:** FAR acceptance is an acknowledgement that goods or services conform to contract quality and quantity requirements. It is performed by an authorized role and ordinarily evidenced by an acceptance certificate, receiving report, or commercial shipping document. [FAR Subpart 46.5](https://www.acquisition.gov/far/subpart-46.5)
- **OBSERVED:** Construction inspection rules require the contractor to retain inspection records, permit inspection before acceptance, correct or replace nonconforming work, and support termination or third-party correction when defects are not repaired. [FAR 52.246-12](https://www.acquisition.gov/far/52.246-12)
- **OBSERVED:** FAR termination creates its own notices, status reports, settlement activities, case file, funds release, and closeout duties. [FAR Part 49](https://www.acquisition.gov/far/part-49)

### Commercial procurement systems preserve the same handoffs

- **OBSERVED:** SAP's purchasing documentation describes a purchase requisition that is submitted for approval, followed by supplier identification and purchase-order creation; suppliers then receive orders, ship, wait for receipt, and request payment. [SAP purchase-requisition workflow](https://help.sap.com/docs/buying-invoicing/purchasing-guide-for-procurement-professionals/about-workflow-of-purchase-requisitions-8b3f5dbe7a7b4427a1039a46dfe475d3)
- **OBSERVED:** SAP documents purchase-order generation after requisition approval and receipt entry when goods arrive. [SAP purchase-order process](https://help.sap.com/docs/buying-invoicing/purchasing-guide-for-procurement-professionals/purchase-order-process-6b32ab8fc1da1014bbcef40b7787d981)

## Cross-lifecycle task map

This table decomposes the standards into recurring human work. “Candidate AE treatment” is an inference, not an adopted contract.

| Human task | Typical actor | Entry state | Durable output / evidence | Authority or consequence | Repair, retry, or next owner | Candidate AE treatment |
|---|---|---|---|---|---|---|
| Define need and constraints | Requester, buyer, specialist | Goal, budget, timing, policy | Requisition, specification, line items, unknowns | May reserve budget or disclose data | Return for missing facts; specialist validates | Request/fact operation; bundle input |
| Discover suppliers or offerings | Buyer, researcher, agent | Requirement or category | Candidate set with source and timestamp | Usually read-only | Broaden, narrow, or hand off | Independently callable discovery |
| Inspect catalogue or product terms | Buyer, requester | Supplier or candidate set | Selected items, terms, prices, identifiers | Usually read-only until selection | Query stale or missing terms | Catalogue/query operation |
| Qualify supplier | Procurement, risk, technical owner | Candidate plus requirements | Eligibility decision and supporting evidence | Excludes or admits supplier | Ask for missing credentials; re-evaluate on expiry | Qualification operation with policy/evidence |
| Solicit information | Buyer, procurement | Need plus questions | RFI response or explicit non-response | Disclosure boundary | Clarify, remind, redirect, or close unknown | Query operation |
| Solicit quotation or proposal | Buyer, procurement | Specification, candidate scope, deadline | Attributable quote/bid/proposal | Commercial disclosure; may bind supplier for a period | Clarify, extend, retry safely, or record refusal | Quote-preparation operation |
| Compare offers | Buyer, evaluator, specialist | Comparable offers and objective | Evaluation record, ranking, unresolved differences | Recommendation, not necessarily authority | Request clarification or revise objective | Deterministic comparison/projection |
| Negotiate or clarify | Authorized buyer and supplier | Proposal plus permitted change scope | Revised proposal, agreed clarifications, negotiation record | Can alter price, quantity, timing, terms | Counter, reject, expire, or escalate | Repeated operations linked by revision lineage |
| Approve spend or terms | Budget owner, contracting officer | Selected proposal and evidence | Approval, rejection, conditions, scope and expiry | Grants bounded authority | Return with conditions; reapprove after material change | Authority operation, not conversational consent |
| Award, order, or accept offer | Authorized buyer | Approved proposal or order | Award, order, mandate, commitment reference | Creates or seeks legal/commercial obligation | Provider accepts, changes, rejects, or remains unknown | Consequential effect operation |
| Acknowledge or respond | Supplier or buyer | Referenced order/document | Acceptance, rejection, proposed change, reason | Confirms processing or commercial position | Counter, cancel, retry only if effect known | Observation/result operation |
| Amend or change | Authorized party | Current accepted version | Sequenced change and response | Changes an existing obligation | Accept, reject, preserve prior agreement, or cancel | New operation referencing prior resolution |
| Cancel or terminate | Authorized party | Current order/contract and cancellation rights | Cancellation request, response, notice, settlement file | May end obligation and create liabilities | Reconcile if rejected or uncertain; escalate dispute | Separate consequential operation |
| Fulfil or despatch | Supplier, carrier | Accepted order/contract | Despatch advice, delivery/progress record | Physical or service effect | Partial fulfilment, substitution, delay notice | Provider action plus evidence observation |
| Receive and inspect | Receiver, technical inspector | Delivery plus acceptance criteria | Receipt, inspection report, nonconformance | Receipt is not necessarily acceptance | Reject, quarantine, request correction, reinspect | Inspection operation with attributed evidence |
| Accept outcome | Authorized acceptor | Inspection and contract criteria | Acceptance certificate or explicit rejection | Binding acknowledgement of conformity | Correct, price-adjust, dispute, or terminate | Human/agent projection over authority-bound operation |
| Invoice | Supplier | Fulfilment or contractual billing event | Invoice/credit note referencing order or contract | Payment claim | Reject malformed invoice; request correction | Document admission operation |
| Reconcile invoice | Accounts payable, buyer | Invoice, order, receipt, acceptance | Match result, query, conditional approval, approval | Can release or withhold payment | Request data, credit note, correction, dispute | Reconciliation operation |
| Pay or record settlement | Authorized payer | Approved obligation | Payment instruction and settlement evidence | Financial effect | Reconcile unknown payment; reverse only through explicit process | Consequential payment operation outside initial wedge |
| Dispute and correct | Buyer, seller, specialist | Contradiction or nonconformance | Issue, response, correction, credit, settlement | Rights may be affected | External process, escalation, reinspection | Incident/recovery operation; preserve honest unknown |
| Renew, extend, or close | Contract owner | Current agreement and performance record | Extension, renewal, completion, termination, closeout | Continues or ends obligations | Recompete, settle residue, retain archive | New operation; never silent state mutation |

## Inferences

- **INFERRED:** The stable reusable abstraction is not a universal lifecycle stage. It is a referenced economic interaction with typed entry state, authorized actor, attributable attempt, durable outcome, and continuation. This follows because OCDS, UBL, Peppol, and FAR divide work differently while preserving those elements.
- **INFERRED:** AE should separate document admission, business-state observation, and external effect. Peppol explicitly separates message acknowledgement from business response, while inspection and acceptance in FAR are distinct consequential acts.
- **INFERRED:** Partial entry is normal commerce, not an edge case. Peppol Order Agreement accepts purchases initiated outside the buyer's purchasing system, and Peppol Invoice Response can begin at a later status without replaying earlier statuses.
- **INFERRED:** Repair should normally create a new referenced attempt, revision, clarification, correction, or cancellation rather than mutate the historical result. Peppol sequences changes and preserves references; FAR requires records for correspondence, inspection, correction, and termination.
- **INFERRED:** A bundle should describe composition and handoffs, not claim ownership of all stages. Its nodes can be independently meaningful Operations; edges declare prerequisites, passed records, authority boundaries, failure branches, and next owners.
- **INFERRED:** An agent's durable working memory should be projection over records, not an unverified narrative. At minimum it needs stable references, actor/principal, source and freshness, operation type, requested effect, authority scope, attempt/idempotency identity, observations, honest resolution, unresolved contradictions, and allowed continuations.
- **INFERRED:** Retry safety depends on operation semantics. Read-only discovery and deterministic comparison can usually repeat; a quote query might repeat with a new attempt and deadline; an order, cancellation, or payment must reconcile the prior attempt before retrying when the effect is uncertain.
- **INFERRED:** Human responsibility remains explicit where professional judgement, statutory authority, negotiated discretion, physical inspection, or legal acceptance cannot safely be inferred from provider data.

## Candidate composition model

The crosswalk supports this target grammar for evaluation:

```text
Economic Operation
  accepts:
    caller-owned facts and references
    declared business capability
    actor, principal, authority, scope, freshness

  performs:
    zero or more attributable attempts

  returns:
    observation, proposal, effect receipt, refusal, contradiction, or unknown
    evidence and provenance
    portable continuation state
    explicit next owner and allowed operations
```

A full route is then a graph of Operations. A bundle is a versioned recipe for a recurring subset of that graph. Neither changes the semantics of its constituent Operations.

Three composition patterns recur:

1. **Parallel fan-out:** discover or solicit across multiple suppliers, then compare.
2. **Negotiated loop:** proposal → counter/change → response until agreement, refusal, expiry, or cancellation.
3. **Evidence gate:** fulfilment → receipt → inspection → authorized acceptance, correction, or dispute.

## Agent tracking, repair, and retry requirements

The standards suggest a minimum durable record rather than a single agent-owned checklist:

| Requirement | Why it exists | Failure if omitted |
|---|---|---|
| Stable operation and referenced-object IDs | Join responses, changes, evidence, and status | Duplicate or orphaned work |
| Actor, principal, and delegated authority | Separate who acted from who bears consequence | Unauthorized commitment |
| Entry-state provenance and freshness | Admit externally supplied state honestly | Stale or fabricated certainty |
| Version and sequence | Order changes and preserve prior agreement | Lost updates and ambiguous terms |
| Attempt and idempotency identity | Distinguish replay from a new action | Duplicate external effects |
| Attributed observations | Preserve who asserted delivery, status, or completion | AE falsely claims physical truth |
| Resolution including `unknown` | Handle timeouts after possible effects | Unsafe automatic retry |
| Expected evidence and acceptance owner | Distinguish delivery from conformity | Premature completion |
| Allowed continuation and next owner | Permit agents and humans to enter or leave | Lifecycle lock-in |
| Incident, contradiction, and repair links | Preserve why work changed or resumed | Irreproducible recovery |

The resulting retry rule is:

> Retry computation freely; retry communication with a new attributable attempt; retry a consequential external effect only after the previous attempt is known not to have taken effect or the provider supports a safe idempotent replay.

## Unknowns

- **UNKNOWN:** Which of these tasks providers will expose as machine-callable operations rather than human inbox work.
- **UNKNOWN:** Whether qualification, quote, commitment, and inspection share enough semantics across events, strata, and fit-out to justify one stable Operation interface.
- **UNKNOWN:** Which external identifiers and evidence AE can verify rather than merely preserve as caller-supplied claims.
- **UNKNOWN:** Whether one portable continuation envelope can remain comprehensible to agents without exposing internal kernel concepts.
- **UNKNOWN:** The legal meaning of orders, quotes, acceptance, cancellation, and agency authority across AE's first operating jurisdictions.
- **UNKNOWN:** Whether customers value individual invocations, predefined bundles, a managed service, or a mixture.

## Hypotheses and falsifiers

| ID | Hypothesis | Baseline | Measurement | Falsifier | Owner | Review by |
|---|---|---|---|---|---|---|
| H-EO-01 | Qualification, quote preparation, and external-state inspection can share one Operation envelope without sharing one lifecycle state machine | Current Customer Request-owned paths | Compile three partial-entry cases and compare required fields, authority, evidence, and recovery | Two cases require conflicting meanings for the same required field or duplicated trust logic | Engineering | 2026-08-31 |
| H-EO-02 | A calling agent can resume work from an Operation projection without reconstructing the original Request | Current requestRef/revision lineage | Cold agent completes the next safe task from portable projection in eval | Agent needs hidden Request history or misstates authority/effect | Product + Engineering | 2026-08-31 |
| H-EO-03 | Event and strata bundles can compose independently callable Operations while preserving identical action semantics | Current full-lifecycle orchestration | Compare operation contracts and traces across both workflows | Bundle nodes acquire wedge-specific lifecycle meanings or duplicate recovery | Product | 2026-09-30 |
| H-EO-04 | Provider participation supports at least one step beyond discovery without equal backstage operator burden | Current registry plus qualified inquiry | Measure provider completion and operator handling in field cases | Provider work remains unstructured or operator work offsets customer saving | Product | 2026-10-17 |

## Decision impact

This research supports documenting the proposed Economic Operation dependency inversion in an ADR, with status proposed rather than accepted until compilation evals pass.

The ADR should preserve:

- Customer Request as one orchestrator, not the universal trust parent;
- one neutral operation lineage with direct, request-owned, bundle-step, and externally observed origins;
- separate facts, authority, attempts, observations, and resolution;
- `unknown` as a first-class result;
- repair through referenced records rather than history mutation;
- bundles as compositions of independently meaningful Operations;
- current RouteMandate and production surfaces until migration evidence exists.

It does not yet justify endpoint names, schema changes, source work, kernel promotion, or public product claims. A project-record update is required only when the architecture decision is adopted.

## Current-versus-target check

- **Current evidenced behavior:** AE's current assistant-safe surface supports published-business discovery, comparison, and qualified inquiry. Richer quote, authority, execution, inspection, and recovery behavior remains owned by the canonical Customer Request or internal machinery.
- **Target behavior informed by this research:** Agents can invoke or resume bounded Economic Operations from portable entry state; Customer Requests and bundles compose the same Operations without duplicating authority, evidence, or recovery semantics.
- **Claims this research does not authorize:** AE does not presently provide open quotation, ordering, contracting, payment, fulfilment, acceptance, or cross-provider recovery through independently callable network operations.

## Sources

- [Open Contracting Data Standard: How does OCDS work?](https://standard.open-contracting.org/latest/en/primer/how/)
- [Open Contracting Data Standard: Pre-qualification and pre-selection](https://standard.open-contracting.org/latest/en/guidance/map/pre-qualification/)
- [OASIS Universal Business Language 2.3](https://docs.oasis-open.org/ubl/UBL-2.3.html)
- [Peppol BIS Advanced Ordering 3.0](https://docs.peppol.eu/poacc/upgrade-3/2025-Q4/profiles/65-advanced-ordering/)
- [Peppol BIS Order Agreement 3.0](https://docs.peppol.eu/poacc/upgrade-3/2025-Q4/profiles/42-orderagreement/)
- [Peppol BIS Invoice Response 3.2](https://docs.peppol.eu/poacc/upgrade-3/profiles/63-invoiceresponse/)
- [US FAR Part 42: Contract Administration and Audit Services](https://www.acquisition.gov/far/part-42)
- [US FAR Subpart 46.5: Acceptance](https://www.acquisition.gov/far/subpart-46.5)
- [US FAR 52.246-12: Inspection of Construction](https://www.acquisition.gov/far/52.246-12)
- [US FAR Part 49: Termination of Contracts](https://www.acquisition.gov/far/part-49)
- [SAP: Workflow of Purchase Requisitions](https://help.sap.com/docs/buying-invoicing/purchasing-guide-for-procurement-professionals/about-workflow-of-purchase-requisitions-8b3f5dbe7a7b4427a1039a46dfe475d3)
- [SAP: Purchase Order Process](https://help.sap.com/docs/buying-invoicing/purchasing-guide-for-procurement-professionals/purchase-order-process-6b32ab8fc1da1014bbcef40b7787d981)

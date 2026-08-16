# Agentic Economy

Agentic Economy is the market and controlled transaction layer where authorized agents discover, buy and invoke admitted third-party Market Operations, and suppliers are paid after contract-valid delivery.
Developers host implementations wherever they choose; AE owns admission, invocation identity, authority and policy, evidence, Qualified Use metering, and payment reconciliation—not runtime hosting. The existing ask → Customer Request → authority → execution → evidence product remains a first-party demand application and proving ground, not the category definition.
**Category guardrail:** Trades, Australian small businesses, BAS and human-service coordination may be future suppliers/use cases; they are not the category, ICP, wedge or default product frame.

**Creator/UGC analogy guardrail:** Instagram/YouTube-style creator/UGC vocabulary describes the supplier economy's operating-model analogy only; it never replaces canonical terms. Map creator → Supplier/Provider; post/asset → immutable, versioned Market Operation; feed/search/recommendation → agent discovery and distribution; passive view/impression/exposure → distribution observation, not invocation; active use → invocation; qualifying engagement/conversion → Qualified Use only when it is a non-owner, contract-valid production invocation with required evidence and exclusions. Qualified Use is independent of payment settlement; creator earnings → supplier accrual/settlement only after Qualified Use plus separately authoritative reconciled economic settlement. Admission/publication/eligibility use the exact contract, provenance, authorization/ownership, license/derivation rights and immutable lineage; readiness is a later independent routeability gate, and Principal/execution authority is a later independent invocation gate. Authorized licensed or materially derived supply is allowed and distinguished from unauthorized copy/republication; anti-copy/unauthorized-republication controls do not ban authorized source use; provenance/validity never proves semantic truth. Supplier-generated Operations are consumed by agents; AE does not host content or supplier runtimes. Agent runtimes are not Principals, and owner traffic, invalid/refused/failed/unknown calls, stars, likes, rankings or popularity are not Qualified Use. This destination analogy is not proof of independent supply, production settlement, recommendation quality or a functioning flywheel.


## Language
**Agent Service**:
The market-facing representation of one admitted third-party Market Operation that an authorized Consuming Agent can discover, buy and invoke under a typed contract, declared price and evidence policy. Its implementation is supplier-hosted anywhere; AE owns the market and controlled transaction boundary, not runtime hosting.
_Avoid_: Skill, repository, whole Supplier portfolio, agent-as-principal framing, local-business/trades category framing

**Principal**:
The human or organization that owns budget and authority for a transaction and delegates bounded authority to a Consuming Agent. The Principal remains accountable for spend, data use and effects.
_Avoid_: Consuming Agent as principal, ambient or unbounded authority, Supplier

**Consuming Agent**:
The software agent acting as the Principal's delegated shopper and distribution interface: it discovers, compares, buys and invokes admitted Market Operations only within the Principal's authority and policy. It cannot make itself the Principal, expand spend, or authorize its own effects.
_Avoid_: Agent as Principal, budget owner, supplier-hosted implementation, autonomous authority

**Agent Runtime Microservice**:
A supplier-hosted, remotely callable implementation behind one registered Capability’s Operation: bounded typed input, bounded work, and a typed result/evidence. It becomes market supply only through an admitted callable Operation and evidence path.
_Avoid_: Skill as supply, repository as service, AE-hosted by default

**Market Operation**:
The competitive unit of the market: one admitted third-party Operation under an immutable contract, existing Capability and Provider identities, keyed by the existing opaque `operationRef`. An authorized Consuming Agent discovers, compares, buys and invokes it through AE; contract-valid delivery is the boundary for supplier payment.
_Avoid_: New operation identity, capability slug, provider rollup, schema conformance as semantic correctness

**Supplier**:
A market-facing portfolio rollup for one existing Provider (the registered Business) and its Market Operations. Supplier metrics aggregate member Market Operations; Supplier does not replace Provider identity or attribute individual execution.
_Avoid_: Operation, endpoint identity, marketplace-wide provider


**Customer Request**:
The durable statement of the outcome a Principal wants, including known facts, hard constraints, preferences, substitution boundaries, completion requirements, and revision history.
_Avoid_: Prompt, household intent, job post

**Imported Claim**:
A fact, offer, commitment, status or other assertion supplied by a caller about work that may have occurred outside AE. AE preserves its source, observation time and freshness without upgrading it to AE-verified truth.
_Avoid_: Imported fact, confirmed external state

**Publisher**:
The authenticated AE identity authorized to submit a capability Publication. A Publisher may be the Provider's authorized owner or an AE curator preserving an external source; publication authority is not execution authority.
_Avoid_: Provider by inference, catalog operator, endpoint owner

**Provider**:
The registered Business that can fulfil an Operation. Provider identity is the existing Business identity and is independent of who published the source record.
_Avoid_: Publisher, marketplace listing, transport host

**Capability**:
A stable customer/domain ability represented by one or more registered Operations. It is not a service page, endpoint, provider, adapter, or model label.
_Avoid_: API, listing category, provider feature

**Operation**:
One executable member of a Capability, identified independently of its Provider and bound to one immutable contract version. Engines resolve registered Operation identity and typed semantics, never provider-specific routing logic.
_Avoid_: Endpoint, tool name, provider branch

**Capability Contract**:
The immutable semantic version of an Operation: strict input/output schemas, customer annotations, data use, effects, evidence requirements, and lifecycle semantics, identified by an exact digest.
_Avoid_: OpenAPI document, prompt schema, mutable descriptor

**Capability Offering**:
An execution-grade registration of one exact catalog Offering revision against one exact Capability Contract. Catalog owns the commercial facts; capability supply binds their source reference and derived hashes for execution without copying or upgrading them.
_Avoid_: Second commercial record, operation contract, transport binding

**Capability Binding**:
One admitted private transport target for a Capability Offering and exact contract, including adapter/config digest, endpoint or resource, credential reference, continuation/cancellation posture, and evidence.
_Avoid_: Public endpoint, authority, provider-specific engine

**Capability Publication**:
A revisioned assertion that an exact Capability Contract, catalog Offering revision, execution Offering, and Binding were admitted from one exact source revision and digest. Publication is independent of eligibility, current readiness, and execution authority.
_Avoid_: Ready operation, verified provider, route permission

**Capability Eligibility**:
A durable policy and admission result for an exact Business, Capability Offering, or Capability Binding. Eligibility is independent of publication, current readiness, and route authority.
_Avoid_: Readiness probe, publication status, ranking

**Capability Qualification**:
A deterministic evaluation of one exact candidate tuple against its current contract, publication, eligibility, Binding integrity, credentials, and Readiness. Its digest records evaluated facts; its validity cannot outlive the included Readiness observation.
_Avoid_: Fourth lifecycle, permanent approval, provider score

**Capability Source Revision**:
The source-owned immutable revision label plus canonical digest of the descriptor material admitted for one Capability Publication revision. Changed source material cannot replay under the same admission operation key.
_Avoid_: Fetch timestamp, mutable URL, marketplace row ID

**Capability Readiness**:
An expiring observation that one exact current Capability Binding may be considered for routing. Expiry removes routeability without withdrawing history.
_Avoid_: Publication, permanent availability, successful fulfilment

**Capability Withdrawal**:
The terminal disposition of one Capability Publication revision. It removes current routeability and projection while preserving historical plans, attempts, receipts, and evidence.
_Avoid_: Delete provider, revoke prior evidence, readiness failure

**Bundle**:
A versioned composition of independently meaningful tasks, their declared dependencies, branches and completion conditions. A Principal or Consuming Agent may complete one task, continue progressively, or ask AE to coordinate the remaining Bundle. A Bundle does not own a separate authority, attempt, evidence or recovery lifecycle.
_Avoid_: Wedge-specific engine, mandatory end-to-end journey

**Action Invocation**:
The durable reference for one independently resumable use of one registered action and action version. It may stand alone or belong to a Customer Request or Bundle. It preserves control and continuity while the action-specific record remains authoritative for business facts and results. An Action Invocation is not authority.
_Avoid_: Universal task, Economic Operation, synthetic Customer Request

**Workflow Cohort**:
A labelled set of Customer Requests that exercise the same economic job and completion boundary across varied customers, businesses, capability chains, authority decisions, and recovery conditions. A cohort is an evaluation class, not a kernel or product branch.
_Avoid_: Vertical mode, hard-coded journey, persona

**Request Understanding**:
AE's untrusted, revisable interpretation of a Customer Request. It is decision material, never authority.
_Avoid_: Final intent, approved plan

**Plan Revision**:
An untrusted proposal composed only from registered capability contracts and typed inputs, bound to one Customer Request revision.
_Avoid_: Execution plan, authorization

**RoutePlan**:
An exact, immutable proposal for one or more ordered registered capability steps that can satisfy a Customer Request revision. It binds the selected businesses, capability contracts, costs, data use, effects, evidence, cancellation posture, recovery, expiry, and fallback choices. A RoutePlan is never authority.
_Avoid_: Execution permission, provider-specific workflow, approved route

**RouteMandate**:
Independently authenticated, expiring authority bound to one exact selected RoutePlan and its material limits. A different route, fallback, generation, recipient, purpose, effect, price ceiling, or expiry requires a new RouteMandate.
_Avoid_: Signed identity, blanket consent, reusable approval

**Decision-Changing Information**:
Missing information whose answer changes which registered options are viable or comparable at the current decision point.
_Avoid_: Required form field, collect everything upfront

**Commitment-Only Information**:
Information required only after viable options exist and the customer is approaching commitment. It remains deferred until that boundary.
_Avoid_: Missing planning data

**Completion Requirement**:
The registered evidence role and value type that must be produced for AE to claim the requested outcome reached its defined completion point.
_Avoid_: Tool success, run completed

**Action Preparation**:
The durable pre-route state for one exact Plan Revision action. It binds current Request and capability semantics, missing commitment information, disclosure review, and reserved preparation authority before any concrete business release or option exists.
_Avoid_: Prepared Action, quote, provider option

**Prepared Action**:
An exact, expiring business option with bound provider, cost, data use, terms, cancellation posture, evidence, and comparison context, ready for a customer decision.
_Avoid_: Plan, quote preview

**Preparation Authority**:
Independently verified, expiring customer permission for AE to share named data categories with bounded connected businesses for a declared comparison purpose. It may be single-use or standing, but always has cumulative recipient, exposure, and operation limits.
_Avoid_: Caller grant, consent flag, signed identity

**Preparation Disclosure Allocation**:
A durable, value-redacted reservation binding one preparation release to a concrete business, field set, purpose, Request revision, and idempotent operation before protected values cross the provider boundary.
_Avoid_: Post-call disclosure record, provider log

**Approval Grant**:
Legacy single-action authority bound to one exact Prepared Action and its material consequences. It does not authorize a composite RoutePlan; new route authority uses a RouteMandate.
_Avoid_: Confirmation flag, model approval

**Action Attempt**:
The durable lifecycle of releasing one approved action to a provider, including uncertainty, reconciliation, cancellation, and outcome evidence.
_Avoid_: API call, execution result

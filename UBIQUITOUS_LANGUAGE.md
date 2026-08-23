# Agentic Economy

Agentic Economy is the market and controlled transaction layer where authorized agents discover,
buy, and invoke admitted third-party Market Operations, and suppliers are paid after contract-valid
delivery.

Developers host implementations wherever they choose. AE discovers supply from official x402
facilitator/Bazaar sources and direct publication, then owns Operation admission, pinned payment
terms, invocation identity, bounded agent access, evidence, Qualified Use metering, and payment
reconciliation—not runtime hosting or the consuming agent's plan.

The current product is the **Atomic Operation Market**. Consuming agents own planning and
orchestration. Historical Customer Request, WorkTree, demand, project-spine, study, inquiry,
Bundle, RoutePlan, workflow-gate, and mission language does not describe the active product.

## Market language

**Agent Service**:
The familiar market-facing class for one admitted third-party Market Operation that an authorized
Consuming Agent can discover, compare, buy, and invoke under a typed contract, declared price, and
evidence policy.
_Avoid_: Skill, repository, whole Supplier portfolio, mission, workflow

**Market Operation**:
The competitive unit of the market: one admitted third-party Operation under an immutable contract,
existing Capability and Provider identities, and an opaque `operationRef`.
_Avoid_: New operation identity, provider rollup, endpoint listing, schema conformance as semantic truth

**Operation**:
One executable member of a Capability, identified independently of its Provider and bound to one
immutable contract version. Engines resolve registered Operation identity and typed semantics,
never provider-specific routing logic.
_Avoid_: Endpoint, tool name, provider branch, task, mission

**Capability**:
A stable domain ability represented by one or more registered Operations. It is not a page,
endpoint, provider, adapter, model label, or orchestration plan.
_Avoid_: API listing, category, provider feature

**Supplier**:
The market-facing portfolio rollup for one existing Provider and its Market Operations. Supplier
metrics may aggregate member Operations; Supplier never replaces Provider identity or attributes
individual execution.
_Avoid_: Operation, publisher, endpoint identity

**Provider**:
The registered Business that can fulfil an Operation. Provider identity is independent of who
published the source record.
_Avoid_: Publisher, marketplace listing, transport host

**Publisher**:
The authenticated AE identity authorized to submit a Capability Publication. Publication authority
is not Provider identity or execution authority.
_Avoid_: Provider by inference, endpoint owner

## Authority and consumption

**Principal**:
The human or organization that owns budget and authority for a transaction and delegates bounded
authority to a Consuming Agent. This is an internal policy and money term, not the public market
proposition.
_Avoid_: Agent as budget owner, ambient authority, marketplace persona

**Consuming Agent**:
Software acting within a Principal's bounded authority to discover, compare, buy, and invoke
admitted Market Operations. It owns its planning and orchestration; AE does not.
_Avoid_: Principal, Supplier, AE-hosted orchestrator

**Agent Runtime Microservice**:
A supplier-hosted, remotely callable implementation behind a registered Operation: bounded typed
input, bounded work, and a typed result or evidence. It becomes market supply only through an
admitted callable Operation.
_Avoid_: Skill as supply, repository as service, AE-hosted runtime

**Agent Access Key**:
A revocable AE caller credential issued through the device flow after owner approval. It identifies
one Consuming Agent and carries a narrower grant than the owning account's aggregate authority and
funds. It never contains or replaces supplier credentials.
_Avoid_: Provider credential, wallet private key, ambient account authority

**Brokered x402 Invocation**:
An authenticated Operation invocation in which AE enforces the caller grant and credit boundary,
pins the exact x402 terms before release, signs through configured server-side custody, records
payment and delivery evidence separately, and reconciles uncertain outcomes.
_Avoid_: Direct wallet call, proof of useful delivery, safe blind retry

## Supply lifecycle

**Capability Contract**:
The immutable semantic version of an Operation: strict input/output schemas, annotations, data use,
effects, evidence requirements, and lifecycle semantics, identified by an exact digest.
_Avoid_: OpenAPI document, prompt schema, mutable descriptor

**Capability Offering**:
An execution-grade registration of one exact catalog Offering revision against one exact Capability
Contract. Catalog owns commercial facts; capability supply binds their source reference and hashes.
_Avoid_: Second commercial record, Operation contract, transport binding

**Capability Binding**:
One admitted private transport target for a Capability Offering and exact contract, including its
adapter/config digest, endpoint or resource, credential reference, recovery posture, and evidence.
_Avoid_: Public endpoint, authority, provider-specific engine

**Capability Publication**:
A revisioned assertion that an exact Capability Contract, Offering revision, execution Offering,
and Binding were admitted from one exact source revision and digest. Publication is independent of
eligibility, readiness, and invocation authority.
_Avoid_: Ready Operation, verified Provider, route permission

**Facilitator-Discovered Publication**:
A bootstrap Capability Publication imported from an official x402 facilitator/Bazaar discovery
source under a system publisher. Its source provenance, schemas, and payment terms are input to AE
admission; discovery presence alone does not confer identity, readiness, route authority, or
semantic quality.
_Avoid_: Verified listing, passive catalog mirror, supplier ownership proof

**Capability Eligibility**:
A durable policy and admission result for an exact Business, Capability Offering, or Capability
Binding. Eligibility is independent of publication, current readiness, and invocation authority.
_Avoid_: Readiness probe, publication status, ranking

**Capability Qualification**:
A deterministic evaluation of one exact candidate tuple against its contract, publication,
eligibility, Binding integrity, credentials, and Readiness. It is bounded by the included readiness
observation.
_Avoid_: Permanent approval, provider score, semantic quality judgment

**Capability Source Revision**:
The source-owned immutable revision label plus canonical digest of descriptor material admitted for
one Capability Publication revision.
_Avoid_: Fetch timestamp, mutable URL, marketplace row ID

**Registry Entry**:
An Agentic Economy discovery record normalized from public API metadata. It is browseable and
inspectable but is not an admitted Operation and carries no AE routeability, delivery, settlement,
Qualified Use, or verification claim. Its origin is provenance, not product taxonomy.
_Avoid_: Operation, verified listing, executable service, Capability Publication

**Registry Origin**:
The internal provenance record for metadata imported into a Registry Entry. Agentic Economy retains
its upstream identifier, URL, timestamps, and refresh state for traceability, but does not expose the
origin as a marketplace category or co-brand.
_Avoid_: Provider, Publisher, public filter, AE admission authority

**Capability Readiness**:
An expiring observation that one exact current Capability Binding may be considered for invocation.
Expiry removes routeability without withdrawing history.
_Avoid_: Publication, permanent availability, successful fulfilment

**Capability Withdrawal**:
The terminal disposition of one Capability Publication revision. It removes current routeability
and projection while preserving historical invocations, receipts, and evidence.
_Avoid_: Delete Provider, revoke prior evidence, readiness failure

## Invocation and evidence

**Action Invocation**:
The durable reference for one independently resumable use of one registered action and version. It
preserves exactly-once control and continuity while the action-specific record remains authoritative
for business facts and results. It is not authority or an orchestration task.
_Avoid_: Universal task, Customer Request, workflow step

**Action Attempt**:
The durable lifecycle of releasing one authorized invocation to a Provider, including uncertainty,
reconciliation, cancellation, and outcome evidence.
_Avoid_: API call, execution result

**Imported Claim**:
A fact, offer, commitment, status, or assertion supplied by a caller about activity outside AE. AE
preserves source, observation time, and freshness without upgrading it to AE-verified truth.
_Avoid_: Confirmed external state, verified fact

**Qualified Use**:
A non-owner, contract-valid production invocation with its required evidence and exclusions. It is
independent of payment settlement and is never inferred from a view, search, refusal, failure, or
external x402 transfer.
_Avoid_: Popularity, traffic, payment, verification

## Discovery evidence

**Operation Category**:
A canonical editorial grouping used to browse published Operations. It may be explicitly assigned;
otherwise the market domain derives a conservative fallback from the Capability identifier.
_Avoid_: Free-form tag, component label

**Operation Rating**:
An authenticated one-to-five evaluation of one exact published Operation version. It does not
transfer automatically to a later revision.
_Avoid_: Verification, trust score

**Operation Popularity**:
Completed AE invocations for one published Operation within an explicitly named window.
_Avoid_: Trending, best, total demand

**Operation Latency**:
Admitted-to-completed elapsed time for one published Operation within an explicitly named window.
Public summaries require a bounded minimum sample.
_Avoid_: Provider SLA, response-time promise

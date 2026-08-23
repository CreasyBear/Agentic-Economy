---
# ADR-030: Registry-to-engine machine contract
Status: Accepted for the registry-to-invocation contract; general engine destination superseded by ADR-036
Date: 2026-08-03
Depends on: ADR-026, ADR-028, ADR-029
Issues: #202, #203, #204

## Decision

AE extends the existing registered-action registry and its catalog/UCP projections with one redacted, versioned executable-operation discovery contract. It does not expose the private capability graph, create a second provider registry, or add an Answer-to-Agent transfer DTO.

Answer Engine may search, compare, explain, and propose only opaque currently published Operation references. Agent Engine may propose only registered operation/version references and typed inputs/mappings. The deterministic Customer Request compiler/kernel reloads the current graph, validates every contract and mapping, aggregates consequences, creates RoutePlans, and resolves private transport material only after authority.

Exa `search -> contents` is a conformance case expressed entirely through registered contracts and deterministic mappings. No Exa branch exists in either engine or the kernel.

## Canonical surfaces

### Public machine discovery

The canonical public contract is a new version of the existing action-backed registry surface:

- registered actions remain declared in `src/modules/actions/index.ts` and `src/modules/registry/registry.actions.ts`;
- HTTP, MCP, UCP, assistant setup, and catalog pages project from those descriptors;
- `capability-contract` owns strict schemas and semantic policy;
- `capability-supply` owns current neutral operation resolution;
- catalog remains the public Business/Offering owner.

The versioned surface exposes four read-only registered actions:

```ts
registry.operations.search(input): OperationSearchResult
registry.operations.detail({ operationRef }): OperationDetailResult
registry.operations.compare({ operationRefs }): OperationComparisonResult
registry.operations.inspectPlan(input): InspectPlanResult
```

Legacy `/api/businesses`, services, and UCP Offering manifests remain catalog projections and advertise navigation to this contract; they are not executable-operation authority. Clean cutover means every executable discovery caller uses the operation actions, while catalog callers keep catalog semantics.

### Public operation descriptor

```ts
type PublicOperationDescriptor = Readonly<{
  operationRef: string              // opaque current revision reference
  operationId: string               // stable semantic member
  contract: {
    capabilityId: string
    version: number
    inputJsonSchema: JsonSchema202012
    outputJsonSchema: JsonSchema202012
    customerAnnotations: readonly CustomerAnnotation[]
  }
  business: PublicBusinessRef
  offering: PublicOfferingRef
  summary: string
  commercial: PublicCommercialTerms
  dataUse: PublicDataUsePolicy
  effects: PublicEffectPolicy
  evidence: PublicEvidencePolicy
  cancellation: PublicCancellationPolicy
  recovery: PublicRecoveryPolicy
  provenance: {
    publisher: 'provider_owned' | 'ae_curated_external'
    sourceKind: PublicSourceKind
  }
  availability: {
    posture: 'integrated' | 'routeable' | 'unavailable'
    observedAt?: number
    validUntil?: number
    reason?: PublicCapabilityUnavailableReason
  }
  navigation: readonly PermittedTransition[]
}>
```

`operationRef` is opaque and addresses the exact current publication and contract version. Public JSON Schemas are separately projected through a bounded allowlist: size/depth/property/ref limits, no source extensions/comments/examples/private defaults, and only supported JSON Schema 2020-12 keywords. No hashes or digests enter the public DTO. Publisher actor IDs, source/material/binding hashes, endpoint, adapter/config, credential, payee/challenge, private evidence, raw source/provider payloads, and internal diagnostics remain private under ADR-029.

## Bounded search, comparison, and ranking

- Search input: `query <= 200` characters, `limit 1..20` by default/max on the public operation surface, opaque cursor `<= 512`, allowlisted network/location/price/effect/data-use/availability filters only.
- The source query may inspect at most the existing bounded graph ceiling of 256 eligible records. It pages by stable `operationRef`; no unbounded fan-out or client-side full-table ranking.
- Cursor binds query, filters, ordering, snapshot/version, and last key. A cursor from changed input refuses.
- Default ordering is deterministic public relevance under the named query/filter semantics, then stable `operationRef`. Prose, traffic, source ranking, popularity, call/payer count, `verified`, `enriched`, probe success, payment, and prior fulfilment never become authority or an implicit quality score.
- Any objective ordering such as lowest known price applies only when explicitly requested by the customer and comparable under one currency/price basis. Unknown/dynamic prices sort as incomparable, not zero.
- Compare accepts `1..4` exact refs, reloads their current revisions, and returns field-wise facts with provenance/freshness. It does not choose or authorize.
- No candidate returns `{ kind: 'no_candidates', appliedFilters, navigation }`; engines may ask a bounded clarification, relax only customer-approved soft preferences, or advertise a human/catalog path. They never fabricate an Operation.
- Stale/incompatible/suspended/withdrawn Operations are excluded from route candidates. Detail may return `unavailable` with ADR-029's customer-safe reason. Historical refs are inspectable only when policy permits and are never executable.

## Inspect-only cold boundary

Public/keyless callers may search, detail, compare, and request a deterministic, ephemeral `inspectPlan`. InspectPlan validates schemas/mappings and summarizes possible cost/data/effects/expiry but creates no Customer Request, RoutePlan, mandate, reservation, invocation, or durable authority. It carries only an opaque expiring `inspectPlanRef`; private snapshot digests never enter the public DTO, and the ref cannot be upgraded into authority.

Authentication is required before durable Customer Request creation. The advertised handoff accepts only:

```ts
type CustomerRequestHandoff = Readonly<{
  intent: CustomerRequestIntentInput
  networkId: string
  idempotencyKey: string
  expectedAnonymousSession?: string
}>
```

The authenticated host supplies the verified principal. Customer Request creates its own request/revision and reloads current registry supply. Candidate/provider/endpoint/credential/payee/effect/price fields from the cold caller are rejected; selected cold references may be retained only as non-authoritative context and must be re-resolved.

The response advertises the next permissible relation and exact input schema. A caller never constructs a later URL, copies an inspect plan into confirmation, or transfers anonymous state into authority.

## Engine proposal boundary

Answer Engine consumes only redacted current descriptors. It may search, compare, explain availability/provenance/consequences, and propose a Customer Request handoff. It cannot select private Bindings or author execution material.

Agent Engine receives a source-owned `RequestGraph` assembled from strict routeable supply and may emit only:

```ts
type EnginePlanProposal = Readonly<{
  requestId: string
  requestRevision: number
  registrySnapshotDigest: string
  steps: readonly {
    selectionKey: string
    operationRef: string
    contractRef: CapabilityContractRef
    typedInput: JsonValue
    mappings: readonly RegisteredInputMappingRef[]
  }[]
}>
```

The model cannot emit endpoints, URLs, methods, schemas, transforms, adapters/config, credentials, recipients/payees, prices, effects, data-use rules, evidence rules, cancellation/recovery semantics, readiness, or authority. Unknown fields and unknown IDs refuse. `selectionKey` is opaque and resolves only inside the same graph snapshot.

## Deterministic mappings and compatibility

Inter-step data flow deepens the existing source-owned `RequestActionInputMapping`; it does not add a parallel mapping engine. Each stored registration is identified by opaque `mappingRef`, carries authority `registered_contract_semantics`, binds exact contract/schema identities privately, and is one of:

```ts
type RegisteredInputMapping =
  | Readonly<{
      kind: 'identity' | 'field'
      sourceOutputPointer: JsonPointer
      targetInputPointer: JsonPointer
    }>
  | Readonly<{
      kind: 'array_project'
      sourceArrayPointer: JsonPointer
      sourceItemPointer: JsonPointer
      targetArrayPointer: JsonPointer
      minItems: number
      maxItems: number
    }>
  | Readonly<{
      kind: 'registered_transform'
      transformRef: string
      transformVersion: number
      sourceOutputPointer: JsonPointer
      targetInputPointer: JsonPointer
      inputCardinalityMax: number
      outputCardinalityMax: number
    }>
```

The model emits only `mappingRef`; it cannot emit pointers, bounds, transform code, JSONPath, or transform arguments. `identity` and `field` copy exact compatible values. `array_project` deterministically maps the declared field from each source item, preserves order, refuses below `minItems`, truncates only when the contract explicitly declares truncation semantics, and otherwise refuses above `maxItems`. `registered_transform` resolves an installed deterministic implementation/version/digest under the mapping registry.

The compiler checks pointer existence, JSON Schema 2020-12 compatibility, required/optional/nullability, bounded cardinality, and acyclic dependencies. Lossy coercion, ambiguous union choice, dynamic key/path, undeclared truncation, unbounded array fan-out, schema mismatch, or missing required source refuses.

Exa `search -> contents` uses a generic registered `array_project` mapping from the bounded search result array's declared URL field to the contents input URL array. Its `maxItems` is the lower of the search contract's output maximum and contents contract's input maximum. This mapping contains no Exa/provider identity and works for any two compatible registered Operations.

Partial output may continue only when the contract declares the field optional or supplies a registered fallback/evidence rule that still satisfies the target schema. Missing required data yields an uncertainty/clarification or terminal refusal; it is never invented.

## Deterministic RoutePlan aggregation

The compiler, never the model, derives from registered contracts and current supply:

- exact Provider/Operation/contract/publication/Offering/Binding tuple;
- canonical input and mapping digests;
- maximum cost by currency and price basis;
- all data fields, purposes, recipients, retention/deletion commitments;
- all effects, consequence classes, reversibility and recovery;
- evidence and completion requirements;
- cancellation capabilities and limits;
- route expiry as the minimum request/contract/publication/readiness/quote validity;
- dependency graph and fallback choices.

Composition is bounded to 256 candidate RoutePlans and deterministic topological order. Cost aggregates only exact compatible currencies/bases; unknown or preparation-required price stays `requires_preparation`. A dynamic/unbounded cost, recipient, disclosure, effect, output cardinality, expiry, or transform that cannot fit explicit RoutePlan ceilings refuses before customer confirmation.

Alternate providers are alternatives, not automatic retries. A fallback requires an explicit RoutePlan branch and its own bounded consequences; changed provider, recipient, price, effect, disclosure, or expiry requires fresh authority.

## Same-Customer-Request lineage

The durable path preserves, without copying into a second request:

```text
verified principal
-> Customer Request id + exact revision
-> registrySnapshotDigest
-> Plan Revision / semantic proposal
-> RoutePlan generation ref + digest
-> selected RoutePlan ref + digest
-> canonical step input/mapping digests
-> RouteMandate ref + digest + expiry
-> per-step grant/reservation refs + digests
-> operationId + exact AdmittedOperationRef
-> Action Invocation / attempt / transport observation
```

Confirmation is bound to the exact request revision, generation, route, current decision, and idempotency identity. It creates authority but starts no work. Release occurs only through the existing mandate/grant/reservation/journal/Workpool seams.

Immediately before provider effect, the kernel reloads and compares the exact current Operation/Binding tuple under ADR-029. Any stale, unavailable, expired, suspended, incompatible, superseded, withdrawn, credential-unready, integrity-invalid, or changed tuple refuses before dispatch, even if an older plan was confirmed.

## Idempotency, uncertainty, retry, and cancellation

- **Duplicate before release:** same authenticated principal, request/revision, operation key, and command digest replays the stored result without a second effect.
- **Changed command:** same idempotency key with changed request, route, input, mapping, authority, or material digest conflicts with no effect.
- **Post-release unknown:** once release may have crossed the provider boundary, timeout/lease loss/malformed response becomes `outcome_unknown`, not failure or success. No automatic retry.
- **Reconcile before retry:** the Action's registered retry class and evidence/reconciliation adapter determine whether the first attempt completed. Only a proven-not-released or proven-safe idempotent retry may issue another attempt.
- **Cancellation:** queued/unreleased work cancels locally. Released work uses only the registered cancellation capability and records pending/accepted/rejected/unknown/too-late. AE never claims reversal or provider interruption without evidence.
- **Workpool:** scheduling/retry provides delivery mechanics, not business idempotency, authority, readiness, or fulfilment truth.

## Navigation

Every response contains allowlisted relations such as `search`, `detail`, `compare`, `inspect_plan`, `authenticate`, `create_customer_request`, `review_route`, `confirm_route`, `start_route`, `read_status`, `reconcile`, or `cancel`, each with method, href/action ID, input schema, authentication requirement, and precondition.

Only transitions valid for the current state are advertised. URLs are host-generated; callers use the relation/action descriptor and never guess later routes. Inspect-only responses advertise authentication/create-request, never confirm/start. Review advertises confirm only for the exact current decision. Confirmation advertises start only after mandate issuance. Unknown outcomes advertise status/reconcile before retry.

## Standards and AE-owned gaps

- Registered action descriptors/Zod/JSON Schema remain the single machine contract source.
- JSON Schema 2020-12 provides structural compatibility; existing capability-contract semantics own data/effect/evidence meaning that schema alone cannot express.
- AI SDK structured generation may produce only the bounded proposal type; it does not validate or execute it.
- Convex transactions, Workpool, and existing Customer Request/RouteMandate/Invocation machines provide durable orchestration.
- MCP/UCP/OpenAPI/x402 libraries provide wire/protocol mechanics, not registry identity, mapping authority, consequence aggregation, route authority, or recovery truth.

AE-owned handwritten code is limited to redacted projection, bounded query/cursor semantics, deterministic semantic compatibility/mapping validation, consequence aggregation, exact lineage/current-tuple checks, public navigation, and uncertainty/reconciliation policy. These are AE domain invariants with no suitable protocol primitive.

## Implementation proof owned by #203/#204

The two-provider slice must prove the same actions/graph/compiler with Exa `search -> contents` and Frankfurter v2 latest single-pair GET without provider branches: current discovery, exact typed composition, mapping compatibility, bounded aggregation, stale refusal, duplicate replay, changed-command conflict, and no model-authored execution material. The hosted journey must prove cold discovery through authenticated same-Customer-Request release/readback. This ADR claims the contract, not that future proof.

## Consequences

Positive: one source-owned machine contract; provider-neutral engines; deterministic typed composition; exact authority lineage; truthful cold handoff; explicit uncertainty and navigation.

Cost: operation discovery requires a new redacted projection/action version; strict mapping rejects convenient but unbounded transforms; inspect plans are deliberately non-transferable; stale supply can invalidate confirmed plans before release.

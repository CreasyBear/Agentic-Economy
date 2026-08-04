---
# ADR-028: One executable-capability registry and admission boundary
Status: Accepted
Date: 2026-08-03
Supersedes: none
Depends on: ADR-026
Issues: #200, #205

## Decision

AE deepens the existing `capability-contract` and `capability-supply` modules. It does not create a provider registry, marketplace registry, importer lifecycle, resolver, or engine-specific supply model.

`capability-contract` owns the immutable semantic contract for one Operation: stable capability and operation identity, contract version and digest, strict input/output JSON Schemas, customer annotations, data use, effects, evidence requirements, and contract lifecycle.

`capability-supply` owns execution admission into AE's one business supply graph: publisher authority and provenance, exact source revision/digest, execution-grade Offering registration and eligibility hashes, transport Binding and admitted configuration digest, Publication revision, readiness, withdrawal, qualification, and the private executable snapshot.

`catalog` remains the sole owner of the customer-recognisable Business Profile, revisioned catalog Offering facts, and declared access paths. The execution-grade Capability Offering is not a second commercial record: it must reference one exact catalog `offeringRef` and revision, derives its commercial presentation from that source revision, and binds the source digest without copying or upgrading its claims. Promotion refuses if the catalog revision or derived digest disagrees. This preserves ADR-026.

Exa is one conformance record. Agentic Market is a discovery source, never runtime authority.

## Owning concepts

| Concept | Canonical meaning and owner |
|---|---|
| Publisher | The authenticated AE principal that submits a publication. For `provider_owned`, it is authorized for the Business; for `ae_curated_external`, it is an AE curator. `capability-supply` owns the provenance record. |
| Provider | The Business that can fulfil the Operation. Existing `businessId` is canonical; no provider table or provider-specific identity field is added. Publisher and Provider may differ only for curated external publication. |
| Capability | Stable customer/domain meaning in `capability-contract`; not a service page, endpoint, provider, or model label. |
| Operation | One executable member of a Capability with stable operation ID and one exact contract version. Engines resolve this ID, never a provider name or catalog URL. |
| Contract version | Immutable strict semantic document owned by `capability-contract`, identified by `capabilityId`, `version`, and `contractDigest`. Changed semantics require a new version. |
| Offering | An execution-grade registration of one exact catalog Offering revision against one exact contract. `catalog` owns the commercial facts; `capability-supply` owns only the exact source reference, derived registration hash, and eligibility hash used for execution. |
| Binding | One admitted transport target for an Offering and exact contract: adapter, endpoint/resource, opaque config digest, credential reference, continuation/cancellation posture, and evidence. Secrets and provider-bearing material remain private. |
| Publication | Revisioned assertion that an exact contract, catalog Offering revision, execution Offering, and Binding are admitted from one exact source revision/digest. Publication is not readiness or execution authority. |
| Eligibility | Durable policy/admission result for Business, Offering, and Binding. It is independent of publication, qualification, and readiness. |
| Qualification | Deterministic evaluation of one exact candidate tuple against current publication, eligibility, contract, Binding integrity, credentials, and readiness. Its digest records the evaluated facts; its validity cannot outlive Readiness. |
| Readiness | Expiring observation that the exact current Binding can be considered now. Staleness removes routeability without withdrawing history. |
| Withdrawal | Terminal disposition for a Publication revision. It removes routeability and current projection, not historical evidence or the Business's other access paths. |

## One admission interface

The module exposes one source-owned command shape; protocol importers remain private strategy functions.

```ts
type CapabilityPublicationAuthorityMode =
  | 'provider_owned'
  | 'ae_curated_external'

type AdmitCapabilityPublicationInput = Readonly<
  RegistrationContext & {
    businessId: string
    catalogOfferingRef: string
    catalogOfferingRevision: number
    source: CapabilityPublicationImport & {
      sourceRevision: string
    }
    authorityMode: CapabilityPublicationAuthorityMode
    actor: SupplyCommandActor
    now: number
  }
>

type AdmitCapabilityPublicationResult =
  | Readonly<{
      kind: 'published' | 'replayed'
      operationId: string
      publisherRef: string
      provenanceDigest: string
      publicationRef: string
      publicationRevision: number
      contractRef: CapabilityContractRef
      catalogOfferingRef: string
      catalogOfferingRevision: number
      offeringId: string
      bindingId: string
      sourceRevision: string
      sourceDigest: string
      authorityMode: CapabilityPublicationAuthorityMode
      lifecycle: PublicationLifecycle
    }>
  | Readonly<{
      kind: 'refused'
      reason: CapabilityPublicationAdmissionRefusal
    }>
```

The facade composes existing seams in order:

1. authenticate `actor` and authorize `authorityMode` for `businessId`;
2. validate the bounded `RegistrationContext` and operation key;
3. normalize exactly one selected Operation through the existing OpenAPI HTTP, MCP, x402, or AE-envelope importer;
4. define/register the strict contract with `capability-contract` and its registry;
5. admit transport material through the registered adapter seam;
6. register exact Offering and Binding hashes;
7. publish through the existing publication command and operation ledger;
8. return inactive publication state until independent eligibility, credential, and readiness gates pass.

Every failure is a typed refusal. No partial publication is visible. The durable operation ledger makes the command atomic, idempotent, and replayable.

## Authority and provenance

- The host authenticates the actor. Descriptor bytes, model output, Agentic Market metadata, rankings, traffic, `verified`/`enriched` labels, and a 402 challenge never establish identity or authority.
- `provider_owned` requires an authenticated owner authorized for the exact Business.
- `ae_curated_external` requires AE curator authority and retains source-linked evidence. It never projects third-party facts as provider-authored claims.
- Authority mode, publisher identity, source revision/digest, and evidence bind the admission operation. Replay cannot switch provenance mode or publisher.
- Publication grants no spend, disclosure, effect, or route authority. RouteMandate and per-step grants remain the consequential authority boundary.

## Immutable resolution tuple

A confirmed plan resolves one provider-neutral `AdmittedOperationRef`:

```ts
type AdmittedOperationRef = Readonly<{
  operationId: string
  publisherRef: string
  provenanceDigest: string
  businessId: string
  publicationRef: string
  publicationRevision: number
  sourceRevision: string
  sourceDigest: string
  contractRef: CapabilityContractRef
  catalogOfferingRef: string
  catalogOfferingRevision: number
  offeringId: string
  offeringRegistrationHash: string
  offeringEligibilityHash: string
  bindingId: string
  bindingRegistrationHash: string
  bindingEligibilityHash: string
  bindingConfigDigest: string
  qualificationDigest: string
  readinessValidUntil: number
  commercialDigest: string
  effectDigest: string
}>
```

`RouteStepAuthority` remains the authority-bearing form of this selection. Endpoint URL, credential reference, adapter ID/config, payment recipient/challenge, and private evidence are deliberately absent. They are rehydrated only after mandate/grant verification by the existing private execution/egress seam. Both Answer Engine and Customer Request consume the neutral tuple; neither imports provider or transport logic.

`registrySnapshotDigest` must cover the complete neutral tuple, including publisher/provenance, catalog Offering revision, publication revision, source revision/digest, qualification, and readiness. Existing contract, offering, binding, route, mandate, grant, and operation-key digests remain authoritative; no second combined registry identity is introduced.

## Admission invariants

1. **Bounded source:** limits apply before parse: bytes, document depth, operation count, schema depth, reference count, and exact selector length. Remote or unsupported references refuse; admission never crawls arbitrary URLs.
2. **Strict schemas:** one exact input and output contract is required. Unsupported keywords/profiles, unresolved references, ambiguous unions, missing output shape, or lossy conversion refuse.
3. **Stable identity:** `operationId` identifies the semantic Capability member across revisions; it derives from stable capability/operation identity, never display name, rank, URL alone, or source catalog row ID. `contractRef`, Publication revision, and material digests select an immutable revision.
4. **Operation key:** `RegistrationContext.operationKey` identifies one admission attempt, not the Operation. It is unique to one intended source/material revision and is the idempotency key.
5. **Identical replay:** the same operation key plus publisher/provenance, source revision/digest, contract, catalog Offering revision, execution Offering, and Binding material returns the prior receipt without writes.
6. **Changed-source conflict:** the same operation key with any changed authority, provenance, source revision/digest, or material digest refuses. A deliberate revision preserves the stable `operationId`, uses a new operation key, and creates a new immutable contract version and/or Publication revision as the changed material requires.
7. **Compatibility:** additive source changes are compatible only when the canonical strict contract and material commercial/effect/binding semantics remain identical. Any input/output, effect, data-use, price, recipient, network, credential posture, or transport change creates a new material revision and requires qualification.
8. **Qualification is derived:** qualification evaluates durable Eligibility plus current contract, publication, Binding, credentials, and Readiness. It is not a fourth lifecycle and cannot outlive the readiness observation it includes.
9. **Readiness is ephemeral:** route generation filters on current readiness; dispatch requalifies the exact tuple.
10. **Withdrawal preserves history:** withdrawal removes routeability/current projection but never rewrites receipts, attempts, evidence, or prior RoutePlans.
11. **No provider leakage:** engines and the kernel receive registered contract semantics and neutral refs only. Provider-bearing transport material stays behind the capability-supply execution seam.
12. **Two-shape proof:** the selected pair is Exa POST/JSON+x402 and Frankfurter v2 GET/query over keyless ordinary HTTPS. Both must pass the same facade before the seam is credited as real.

## Standards and AE-owned gaps

| Concern | Reuse | AE-owned gap that justifies handwritten code |
|---|---|---|
| OpenAPI | Installed parser/validator and OpenAPI 3.1/JSON Schema primitives | bounded document admission, exact operation selection, supported-profile refusal, AE contract mapping |
| JSON Schema | JSON Schema 2020-12 plus existing Zod/Convex validators | deterministic subset admission, canonical digest, validator parity, data/effect policy |
| MCP | Official MCP SDK types/protocol | server/resource/tool allowlisting, AE identity, authority, contract, readiness, and evidence |
| x402/CDP | Official x402 message/challenge/sign/retry primitives | registered-resource validation, exact network/asset/payee/atomic ceiling, mandate/ledger authorization, output/evidence reconciliation |
| AI SDK | Structured generation and provider transport only | deterministic proposal validation; no model controls admission, identity, authority, dispatch, or persistence |

Unknown or unsupported protocol behavior refuses. A generic HTTP client, URL allowlist, JSON parser, or x402 library is not an admission policy.

## Agentic Market classification

**Adopt**
- service prose and heterogeneous operation inventory as discovery inputs;
- endpoint-level method/path and parameter visibility;
- explicit payment challenges as transport observations;
- source-linked factual metadata.

**Adapt**
- service/endpoint groupings into AE Capability/Operation plus exact Business/Offering/Binding refs;
- catalog network and price hints into untrusted import material checked against descriptor and live challenge;
- call/payer counters into discovery evidence only, never quality or readiness;
- x402 retry mechanics behind AE mandate, spend, recipient, and receipt controls.

**Improve**
- immutable strict input/output schemas and canonical digests;
- authenticated publisher authority and curated provenance;
- explicit revision, readiness expiry, withdrawal, compatibility, and replay/conflict semantics;
- customer-safe projections and private transport/credential separation;
- deterministic output validation, durable evidence, uncertainty, recovery, and reconciliation.

**Reject**
- Agentic Market, Bazaar, ranking, `verified`, `enriched`, traffic, or catalog presence as runtime authority;
- blank/decimal/advertised price as spend truth;
- arbitrary endpoint invocation, dynamic provider branches, or provider-specific engine code;
- catalog prose as contract, source service labels as provider identity, or 402 as proof of fulfilment/readiness;
- importing private marketplace lifecycle or building a second executable registry.

## Conformance examples

- **Exa search:** OpenAPI/HTTP source; strict JSON request/response; x402 Binding with exact Base/Solana network, USDC asset, atomic amount/payee, and `/search` selector. Exa-specific names remain source evidence only.
- **Frankfurter v2 latest single-pair rates (selected second shape):** `GET /v2/rates?providers=ECB&base={base}&quotes={quote}` is normalized through the generic HTTP/`ae_envelope` import into a strict input (`base`, `quote`, pinned provider) and singleton-array output (`date`, `base`, `quote`, finite positive `rate`) contract. It has no credential or payment fields. Query placement is registered Binding material, not an engine branch.
- **Alchemy JSON-RPC (future shape):** one named JSON-RPC method can use the same generic envelope and admitted HTTP Binding, but #206 rejected it for the current slice because its reachable route requires x402 and legal/provisioning gates remain open.

These examples prove interface expressiveness only. #203 owns runnable two-provider admission/resolution and negative proof; #200 does not claim that implementation evidence.

## Consequences

Positive: one source of truth; stable operation resolution; explicit publisher/provider distinction; protocol reuse without outsourcing AE authority; engines remain provider-neutral; revisions and withdrawal preserve historical proof.

Cost: admission remains deliberately strict; unsupported schemas/protocols refuse; readiness and credential custody require separate evidence; the full tuple must be propagated into registry snapshot hashing before execution proof is complete.

## Rejected alternatives

- **Import Agentic Market/Bazaar as the registry:** external mutable discovery cannot own AE identity, authority, readiness, or lifecycle.
- **Provider table plus provider-specific adapters in engines:** duplicates Business identity and leaks transport into planning/kernel code.
- **One giant PublishedOperation DTO everywhere:** exposes credentials/provider transport and collapses proposal, authority, and execution boundaries.
- **Infer compatible revisions from names or URLs:** ambiguous and unsafe; canonical strict material decides compatibility.
- **Publish on successful import:** admission is not readiness; routeability requires independent current qualification.

## Verification contract

Issue #203 must prove the same admission facade and neutral resolver with two materially different providers/adapters, including: positive admission and resolution; malformed/oversized/unsupported-source refusal with no writes; identical replay; changed-source conflict; incompatible revision refusal; readiness expiry; withdrawal; and no provider-specific field reaching either engine or the kernel.

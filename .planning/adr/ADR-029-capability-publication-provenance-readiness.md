---
# ADR-029: Capability publication provenance, readiness, and withdrawal
Status: Accepted
Date: 2026-08-03
Depends on: ADR-026, ADR-028
Issues: #201, #203

## Decision

`capability-supply` owns one revisioned Publication record and derives routeability from independent facets. Publication, eligibility, readiness, moderation, trust, and execution evidence do not collapse into a maturity enum.

A listed external Operation proves only that AE admitted one exact source revision, contract, catalog Offering revision, and transport Binding under an attributed Publisher authority. It does not prove provider authorship, provider endorsement, current availability, quality, successful fulfilment, payment, customer authority, or permission to invoke.

The existing publication command/lifecycle is deepened; no second lifecycle, authority system, readiness registry, or public trust table is introduced.

## Evidence classes

| Class | Examples | Mutability | Public treatment |
|---|---|---|---|
| Provider-authored facts | authenticated Business identity, Provider-submitted descriptor, and an AE catalog Offering revision only when authenticated ownership evidence binds it | Immutable per admitted source revision | Attribute to Provider only when authenticated ownership evidence binds that exact revision; otherwise the fact remains AE-curated/catalog-owned |
| AE-curated assertions | AE curator's mapping of an external source to a Business/Capability/Operation, including catalog facts not authenticated as Provider-authored | New revision to change | Label `AE-curated`; never imply Provider authored or endorsed it |
| External observations | fetched descriptor, HTTP/x402 challenge, protocol/version, observed endpoint response | Append-only observation with time and source digest | Project only allowlisted factual summaries and observation time; never raw payload |
| Immutable source evidence | source kind, source revision, canonical digest, selected operation/resource, evidence refs | Never rewritten | Private refs/digests; public source kind and attribution only when safe |
| External-market commercial hints | source-marketplace price/network/payee/call counts, distinct from AE catalog Offering facts | Mutable and untrusted until exact admission/live comparison | Discovery hint only; never spend truth, rank, readiness, or fulfilment |
| Readiness observations | credential accessible, health outcome, target digest, observedAt/validUntil | Append-only; current value expires | Customer-safe availability plus bounded freshness only |
| Moderation decisions | suspend reason, actor, operation key, evidence, time | Append-only audit; current decision may be superseded | Generic unavailable reason; no private allegation/evidence |
| Execution-authority records | RouteMandate, Approval Grant, per-step grant/reservation | Append-only under their authority owners | Prove only issuance of named bounded permission; never provider effect, fulfilment, payment, or publication authority |
| Execution evidence | release, provider response, receipt, settlement, reconciliation | Append-only under Action Invocation/route owners | Separate customer-safe result/receipt surface; never used to retroactively authorize publication |

Popularity, ranking, catalog prose, an HTTP probe, a 402 challenge, a payment receipt, or prior success never grants authority or proves fulfilment of the current request.

## Durable identity and provenance

Every Publication revision binds:

- stable `operationId`;
- `publicationRef` plus monotonically increasing `publicationRevision`;
- `publisherRef`, `authorityMode: provider_owned | ae_curated_external`, and `provenanceDigest`;
- Provider `businessId`;
- `sourceKind`, immutable `sourceRevision`, `sourceDigest`, observation time, and private evidence refs;
- exact contract, catalog Offering revision, execution Offering hashes, Binding hashes/config digest, and commercial/effect digests;
- creation operation key, actor, reason, correlation, and audit event.

`provider_owned` requires the existing authenticated Business-owner authority. `ae_curated_external` requires the existing AE curator/admin/system authority and carries explicit curator attribution. Source metadata cannot establish either authority.

The same operation key and identical material replays the receipt. Any changed actor, authority mode, source revision/digest, contract, Offering, Binding, commercial/effect material, or target identity conflicts without writes.

## Faceted state model

The source model uses four independent facets rather than one omnibus enum.

The issue's lifecycle terms map to these facets exactly:

- **draft** is an ephemeral, bounded admission candidate; it has no durable Publication row and no public projection;
- **admission/publication** is the atomic `admit/publish` transition that creates a current revision with readiness unobserved;
- **activation** is the derived `routeable` result, not a write transition or durable disposition;
- **staleness** is deterministic read-time expiry of Readiness, producing `unavailable` without changing Publication disposition;
- **suspension/moderation** is the independent moderation facet; public executable projection is suppressed while suspended;
- **suppression** is the projection consequence of moderation, revoked eligibility, source/integrity failure, incompatibility, or withdrawal, not another lifecycle;
- **restoration** is either clearing a suspension under fresh audit/qualification or creating a new revision after withdrawal; terminal rows are never toggled.

### Publication disposition

```ts
type PublicationDisposition =
  | 'current'
  | 'superseded'
  | 'incompatible'
  | 'withdrawn'
```

Only one revision per `publicationRef` may be `current`. `superseded`, `incompatible`, and `withdrawn` are terminal historical dispositions. Restoration never mutates a terminal revision; it creates a new revision after fresh authority, admission, and readiness.

### Moderation disposition

```ts
type ModerationDisposition = 'clear' | 'suspended'
```

Suspension is an AE moderation decision over the current Publication. It immediately removes routeability and public executable projection while preserving the Publication revision and history. Clearing suspension requires an authorized AE moderator, a new audit operation, current source integrity, and fresh qualification; it is not a replay of the original publish.

### Eligibility

Business, Offering, and Binding eligibility remain durable policy/admission records with integrity hashes. Revocation removes routeability. Re-enabling requires the owner/admin authority already defined by capability-supply and a new audit operation.

### Readiness

Credential and health observations are time-bounded facts over the exact Binding target digest. Readiness never changes Publication disposition. The derived lifecycle is:

- `routeable`: current + moderation clear + exact eligibility/admission/conformance + credential ready + health healthy + unexpired readiness;
- `unavailable`: current but one or more routeability facts missing, unhealthy, stale, suspended, or integrity-invalid;
- `historical`: superseded, incompatible, or withdrawn.

The current source's `active | inactive | incompatible | withdrawn` projection may remain as a compatibility-free internal derived value only if it is computed from these facets; it is not the durable authority model.

## Commands, principals, and transitions

All commands use the existing `SupplyCommandActor`, bounded `RegistrationContext`, operation ledger, and audit rows. Models, descriptors, providers, and external marketplaces cannot invoke transitions directly.

| Command | From | To/effect | Allowed principal | Required checks |
|---|---|---|---|---|
| admit/publish | none | revision 1 `current`, moderation `clear`, readiness unobserved | authenticated Business owner for provider-owned; AE curator/admin/system for curated external | exact authority/provenance/source/contract/catalog Offering/Binding material; atomic no-partial write |
| observe readiness | current | append observation; derived availability may change | internal registered probe or authorized owner/admin observation writer | exact revision and target digest; bounded evidence; `observedAt < validUntil`; TTL ceiling |
| compatible refresh | current | old `superseded`; new revision `current`, readiness unobserved | same publication authority class; owner or curator/admin as appropriate | stable operation/provider identity; canonical source/material compatibility; new operation key; atomic replacement |
| incompatible refresh | current | prior current becomes `superseded`; the rejected proposed revision is recorded `incompatible` for durable readback; no current replacement exists and no routeable projection remains | same publication authority class | any strict schema/effect/data-use/commercial/recipient/network/credential/transport incompatibility; explicit refusal/readback |
| rotate credential | current | new Binding/config/credential revision; old current Publication superseded; readiness unobserved | authorized Business owner or credential custodian; AE operator only under an existing custody grant | no secret in audit/projection; new binding digest; fresh probe before routeability |
| suspend | current, clear | moderation `suspended`; routeability removed | AE moderator/admin/system only | operation key, reason code, evidence, actor/correlation; idempotent replay/conflict |
| restore suspension | current, suspended | moderation `clear`; still unavailable until fresh qualification/readiness | AE moderator/admin/system only | new operation; current source/binding integrity; fresh observation required |
| withdraw | current | current revision `withdrawn`; eligibility revoked; routeability/projection removed | authorized Business owner for provider-owned; AE curator/admin for curated external; AE moderator may emergency-suspend but not impersonate provider withdrawal | exact revision, actor/provenance, operation key, audit; preserve history |
| restore withdrawal | withdrawn | new revision `current`, old stays withdrawn, readiness unobserved | same authority required for a new publication | complete re-admission and source readback; never toggle old row |

Old-version, non-current, mismatched-target, wrong-principal, changed-replay, and stale-readiness transitions refuse with no provider effect and durable customer-safe/operator readback.

## Refresh compatibility

A refresh is compatible only when stable `operationId` and Provider remain unchanged and the canonical strict contract, data-use/effect semantics, catalog Offering commercial material, payment recipient/network/asset/atomic amount, Binding transport semantics, credential custody posture, and cancellation/continuation semantics are identical.

Source-only metadata changes may create a compatible Publication revision when canonical material remains identical. Any input/output schema or semantic change creates a new contract version. Any material commercial, effect, recipient, credential, or transport change is incompatible with an already confirmed plan and requires a new selectable revision and customer authority.

No name, URL, ranking, source row ID, or marketplace version string determines compatibility.

## Readiness policy

- Every routeable Publication has `readinessObservedAt`, `readinessValidUntil`, exact target/qualification digest, outcome, and bounded evidence refs.
- Missing `readinessValidUntil` is stale, never indefinitely ready.
- Default successful probe TTL is five minutes, matching the current implementation; provider/adapter policy may shorten it but may not exceed the global 24-hour observation ceiling without a new decision.
- Failed/unhealthy observations use a maximum one-minute retry horizon. Repeated failures use bounded exponential backoff with jitter, capped at five minutes; one Publication has at most one pending refresh job and one in-flight probe.
- Scheduling processes bounded batches/cursors, records attempt/outcome/backoff, and never performs unbounded table scans or retries.
- Scheduler absence or failure does not preserve availability: TTL expiry deterministically removes routeability on read.
- Probe redirects, egress, credentials, response bytes, parsing, and time are bounded by the registered adapter policy. A probe proves only that its named check passed at `observedAt`.

Before provider release, the existing route execution seam must re-read and compare the exact `AdmittedOperationRef`: current Publication revision/source, moderation clear, eligibility and integrity hashes, active contract, Binding/config digest, credential readiness, healthy unexpired observation, and qualification digest. Any stale, unhealthy, expired, suspended, incompatible, superseded, withdrawn, or mismatched fact refuses before transport dispatch—even when an older RoutePlan or RouteMandate was valid when issued.

## Public discovery contract

### Inclusion

Public Business/Offering discovery remains catalog-owned. Machine-readable executable support is included only for a current, unsuspended, integrity-valid Publication. Routeable support requires current qualification/readiness. Integrated but unavailable support may remain attached to an otherwise published catalog Offering only with a customer-safe reason and freshness; it must not appear in route candidates.

Withdrawal, incompatibility, suppression, or moderation suspension removes the executable support projection immediately. It does not delete the Business, catalog Offering, human access path, declared external operation, or historical evidence.

### Allowlist

Public projections may expose only:

- stable public Business/Offering/Operation identity and human-readable name/description;
- strict public input/output summaries and customer annotations;
- public price/material terms, effect/data-use/cancellation summaries;
- publisher attribution as `provider-owned` or `AE-curated external` without private actor IDs;
- source kind and source-linked attribution when legally permitted;
- support posture `integrated | routeable | unavailable`;
- `observedAt`, `validUntil`, and bounded customer-safe unavailable reasons;
- trust tier already owned by the Business projection, with its named meaning.

Never expose credential refs or values, endpoint/config internals, raw source/provider payloads, evidence refs or private evidence, hashes/digests, target diagnostics, internal moderation allegations, operator IDs, payment challenges/signatures, private receipts, or unverified endorsements.

### Customer-safe unavailable reasons

```ts
type PublicCapabilityUnavailableReason =
  | 'setup_required'
  | 'temporarily_unavailable'
  | 'readiness_expired'
  | 'publisher_withdrew'
  | 'under_review'
  | 'updated_terms_require_review'
  | 'not_supported_by_ae'
```

Internal reasons map many-to-one. Credential/admission/conformance missing maps to `setup_required`; unhealthy/probe failure to `temporarily_unavailable`; stale/missing expiry to `readiness_expired`; withdrawal to `publisher_withdrew` only for authenticated provider withdrawal, otherwise `not_supported_by_ae`; suspension to `under_review`; incompatibility/material refresh to `updated_terms_require_review`; integrity failures and unsupported source/transport to `not_supported_by_ae`.

These are availability explanations, not blame or quality judgments.

## Trust and ranking

Business trust tier retains its existing named provenance/ownership meaning. It is not capability readiness, quality, popularity, ranking, fulfilment, or authorization. A curated external Publication cannot increase Provider trust tier.

AE does not rank route candidates by Agentic Market ranking, traffic, call/payer counts, `verified`, `enriched`, prior payment, or probe success. Those may be source-attributed discovery observations only. Any future ranking requires a separate customer-visible objective, evidence contract, gaming analysis, and decision.

## What publication proves

A current Publication proves that AE:

1. authenticated/authorized the Publisher under the recorded authority mode;
2. admitted one bounded source revision and exact selected Operation;
3. bound it to exact AE Business, contract, catalog Offering revision, execution Offering, and Binding identities;
4. recorded provenance and an immutable revision under idempotent audit.

It does not prove Provider authorship for curated external records, endorsement, current routeability, quality, popularity, successful output, fulfilment, payment/settlement, ownership of the external endpoint, customer authority, or permission to release data/effects/spend.

A Readiness observation additionally proves only that one named bounded check over one exact Binding target produced its recorded outcome during its validity window. An execution receipt proves only the event named by that receipt.

## Standards and AE-owned gaps

Official OpenAPI/JSON Schema/MCP/x402 libraries continue to own protocol parsing and wire mechanics. Existing Clerk/Convex identity and capability-supply actor/operation-ledger primitives own authentication, authorization inputs, idempotency, transactions, and audit persistence.

AE-owned handwritten policy is limited to: publisher/provider attribution; curated-vs-provider provenance; canonical material compatibility; lifecycle transition authorization; bounded scheduler/backoff; exact pre-release requalification; evidence-class redaction; public reason mapping; and no-endorsement/trust semantics. No external standard can decide those AE domain invariants.

## Implementation deltas for #203

The generic slice must deepen the existing commands/tables rather than add peers:

- bind publisher/provenance/source revision and actor/audit to publish, refresh, rotate, suspend, withdraw, and restore operations;
- make refresh/withdraw ledger-backed and atomic;
- compare the complete ADR-028 material tuple, not contract semantics alone;
- treat missing readiness expiry as stale;
- add moderation suspension as a facet and restoration as new audited transition/revision;
- add bounded recurring refresh/backoff bookkeeping;
- enforce exact pre-release requalification;
- project only the allowlist and customer-safe reasons;
- prove compatible refresh, incompatible refusal/readback, stale/old-version refusal, suspension, withdrawal, restoration, and no-effect negatives with both selected provider shapes.

## Consequences

Positive: truthful publication without false endorsement; deterministic stale/offline refusal; attributed authority/provenance; history-preserving withdrawal/restoration; no credential/evidence leakage; one lifecycle for both engines and provider shapes.

Cost: routeability is conservative and can disappear when probes/schedulers fail; every material update requires a revision and potentially renewed customer authority; curated records require explicit attribution.

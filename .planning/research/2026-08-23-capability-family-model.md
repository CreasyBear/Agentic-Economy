# Capability families without contract dilution — resolution for #208

**Date:** 2026-08-23
**Scope:** research decision only; no product code changed
**Issue:** [#208 — Define normalized capability families without weakening exact contracts](https://github.com/CreasyBear/Agentic-Economy/issues/208)

## Resolution

Add a small, registry-owned **market taxonomy** beside the executable Operation registry. A Capability Family is a curated browse-and-compare classification for Operations that address the same broad customer outcome. It is not a contract, executable target, compatibility assertion, routing key, fallback set, or authority source.

In v1, each exact current `operationRef` may have zero or one active primary family. A family may contain many Operations. Membership is created only by an explicit curator decision against the exact `operationRef`; it is never inferred from provider name, URL, `capabilityId`, search terms, prose, tags, embeddings, or observed traffic.

Use the phrase **candidate alternatives** in product and code. Do not call family members interchangeable or contract-equivalent. Any actual selection, composition, or substitution still reloads the exact Operation and validates its contract, schemas, effects, data use, authority, price, readiness, provenance, and version through the existing registry and inspection seams.

This resolves the ticket without weakening ADR-028 or ADR-030.

## Why this fits the current model

The repository already has the exact identity and comparison boundary that a family must not cross:

- [`CapabilityContractRef`](../../src/modules/capability-contract/internal/define-contract.ts#L98) is the tuple `capabilityId + version + contractDigest`. Its contract includes strict input/output schemas, data use, effects/authority, evidence, and lifecycle; validation is fail-closed ([definition](../../src/modules/capability-contract/internal/define-contract.ts#L77), [validation](../../src/modules/capability-contract/internal/define-contract.ts#L109)).
- [`createPublicOperationRef`](../../src/modules/capability-supply/public.ts#L51) derives the public exact reference from `operationId + publicationRef + publicationRevision + contractRef`. A changed publication revision or contract creates a different `operationRef`.
- [`PublicOperationDescriptor`](../../src/modules/capability-supply/internal/operation-projection-types.ts#L192) keeps business, Offering, price, data use, effects, authentication, transport posture, provenance, availability, and navigation on each Operation. There is no safe family-level value for any of them.
- Search ranking currently draws from Operation IDs, `capabilityId`, summaries, Business names, Offering text, annotations, and supplier-authored search terms ([search text projection](../../src/modules/capability-supply/internal/operation-search.ts#L398)). That is appropriate for recall, but explicitly unsuitable as membership authority.
- Compare accepts exact `operationRef` values and returns price, effects, data use, availability, provenance, and recovery per Operation ([comparison contract](../../src/modules/capability-supply/internal/operation-detail-compare.ts#L42), [exact reload](../../src/modules/capability-supply/internal/operation-detail-compare.ts#L131)). A family page should feed this seam rather than create a family contract.
- ADR-028 says Capability is stable customer/domain meaning, Operation is an executable member with an exact contract version, and changed semantics require a new version ([ADR-028](../adr/ADR-028-executable-capability-registry-admission.md#L21)). ADR-030 says `operationRef` addresses the exact current publication and contract version and that compare does not choose or authorize ([ADR-030](../adr/ADR-030-registry-engine-machine-contract.md#L39)).

The live evidence corpus also contains several separately identified search Operations (`exa-search-x402`, `tavily-search-x402`, `tavily.search`, and `exa.search`). Their similar labels are useful evidence that a browse family is needed; they are not evidence that their contracts are equivalent.

## Primary-source marketplace patterns

| Source | Observable pattern | Boundary to preserve in AE |
|---|---|---|
| [OpenAPI 3.0, Operation Object](https://spec.openapis.org/oas/v3.0.0.html#operation-object) | `tags` logically group operations for documentation while `operationId` uniquely identifies one Operation Object; parameters, request body, responses, callbacks, security, and servers remain operation-specific. | Family membership can organize Operations but cannot replace exact Operation identity or contract material. |
| [RapidAPI Hub listing — General](https://docs.rapidapi.com/docs/hub-listing-general-tab#change-an-apis-category) | Each API has one primary category created by Rapid administrators for browsing; tags are separate. | Use one curated primary family in v1; do not treat free-form search terms or tags as normalized membership. |
| [RapidAPI Hub listing — Definitions](https://docs.rapidapi.com/docs/hub-listing-definitions-tab) | Endpoints are unique to an API version and may be arranged into documentation groups. The listing exposes API ID and API Version ID separately. | Category/grouping stays presentation metadata; versions and endpoint definitions remain exact. |
| [RapidAPI security](https://docs.rapidapi.com/docs/configuring-api-security) and [plans](https://docs.rapidapi.com/docs/hub-listing-monetize-tab) | Security schemes and paid-plan access can apply to individual endpoints or subsets of endpoints. | A family cannot supply a common authority requirement, authentication posture, or price. |
| [AWS Marketplace Category API](https://docs.aws.amazon.com/marketplace/latest/APIReference/API_marketplace-discovery_Category.html) | A category has a machine-readable `categoryId` and human display name and classifies listings/products into a logical group. | Give the family its own stable machine identity and display copy; do not derive it from a supplier or listing label. |
| [AWS Marketplace Catalog API](https://docs.aws.amazon.com/marketplace/latest/developerguide/catalog-apis.html#catalog-api-entities) | Marketplace entities have a type/version, unique `EntityId`, and published `RevisionId`; product versions, delivery options, compatibility, and category facts are distinct facets. | Classification must not collapse product/Operation revision, delivery, compatibility, or commercial identity. |
| [GitHub Marketplace listing guidance](https://docs.github.com/en/apps/github-marketplace/listing-an-app-on-github-marketplace/writing-a-listing-description-for-your-app#categories) | A listing has a primary category and optional secondary category chosen for its main functionality. Listing identity, supported languages, URLs, screenshots, and pricing remain listing facts. | Start with one primary family; add secondary families only after demonstrated browse need and a separate decision. |
| [GitHub Actions publishing](https://docs.github.com/en/actions/how-tos/create-and-publish-actions/publish-in-github-marketplace) | Marketplace category is selected for findability, while the action keeps a unique metadata name and each release keeps a visible version. | Browse classification does not stand in for callable identity or release/version. |
| [x402 v2 specification — Discovery API](https://github.com/x402-foundation/x402/blob/main/specs/x402-specification-v2.md#8-discovery-api) | Bazaar discovery can filter by resource type/payment facts, but every item retains exact resource identifier, x402 version, accepted payment requirements, update time, and extension payloads. | x402 tags/category/provider metadata must never replace AE admission, exact contract, price, payee, network, or version identity. |
| [Coinbase CDP — List x402 resources](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/list-x402-resources) | `serviceName` and `tags` aid discovery, while each item still carries `resource`, method/schema extension, x402 version, and explicit payment requirements. | Provider/service labels and tags are discovery evidence only, not normalized family authority or equivalence proof. |

The mature pattern is not “normalize the callable unit.” It is “add navigational classification beside a separately identified and versioned callable/listing unit.”

## Smallest explicit schema

Ownership should stay in `registry`, because it already owns public Operation search/detail/compare. Do not add family fields to `capability-contract`, `capability-supply` admission rows, publication material digests, executable snapshots, bindings, RoutePlans, or invocation authority.

```ts
type CapabilityFamily = Readonly<{
  familyId: string                    // opaque stable ID; never provider-derived
  definitionVersion: number          // positive integer
  slug: string                        // public route key; unique among active families
  label: string                       // e.g. "Web search"
  description: string                 // broad customer outcome, not a contract promise
  inclusionCriteria: string           // curator rule, outcome-oriented and provider-neutral
  exclusionCriteria: string           // explicit neighboring capabilities not included
  disposition: 'active' | 'retired'
  createdAt: number
  updatedAt: number
}>

type CapabilityFamilyMembership = Readonly<{
  familyId: string
  definitionVersion: number
  operationRef: PublicOperationRef    // exact publication + exact contract version
  disposition: 'current' | 'withdrawn'
  rationale: string                   // bounded curator decision note
  decidedBy: string                   // authenticated AE curator principal
  decidedAt: number
  withdrawnAt?: number
}>
```

Required indexes and constraints:

- family unique by `familyId + definitionVersion`;
- one active definition revision per `familyId`;
- active slug unique;
- membership unique by `familyId + definitionVersion + operationRef + disposition`;
- at most one `current` membership for an `operationRef` in v1;
- indexed bounded read by `familyId + definitionVersion + disposition + operationRef`;
- indexed exact lookup by `operationRef + disposition`;
- family list and member list are paginated and capped; no `.collect()` catalogue scan.

`definitionVersion` is intentional. A copy edit may keep the version; a changed inclusion/exclusion meaning creates a new definition version and requires explicit member review. Memberships do not auto-roll forward.

No family object may contain:

- input or output schema;
- effects, authority, data-use, evidence, cancellation, or recovery policy;
- price, currency, payment rail, payee, or settlement terms;
- authentication, endpoint, transport, environment, or readiness;
- provider, Business, Offering, publication, contract, or version defaults;
- a “verified,” “compatible,” “equivalent,” “best,” or automatic-fallback flag.

## Public projection and UI contract

Keep the existing `PublicOperationDescriptor` unchanged. Add a market wrapper, not a merged family descriptor:

```ts
type PublicCapabilityFamily = Readonly<{
  familyId: string
  definitionVersion: number
  slug: string
  label: string
  description: string
}>

type CapabilityFamilyPageProjection = Readonly<{
  family: PublicCapabilityFamily
  members: readonly Readonly<{
    operation: PublicOperationDescriptor
  }>[]
  pagination: { nextCursor?: string; hasMore: boolean }
}>
```

The page anatomy should be:

1. family label and plain-language description;
2. “Compare Operations” as the primary action;
3. member rows/cards that always show supplier, exact price, availability, version, effect/authority summary, and any other material difference from the Operation descriptor;
4. exact Operation detail/invocation actions keyed by `operationRef`;
5. the existing exact comparison projection for side-by-side evaluation.

Required copy: **“Grouped by intended outcome. Operations may differ in inputs, outputs, price, authority, effects, and availability.”**

Do not show family-level price, common schema, common authority, combined quality, or “N interchangeable providers.” A family count means only current classified members.

## Governance boundary

1. **Curator-owned taxonomy.** Authenticated AE curators create definitions and decide membership. Suppliers may submit a proposal later, but cannot self-assert normalized membership in v1. This follows RapidAPI’s administrator-created category boundary.
2. **Exact-member admission.** The decision input is `{ familyId, definitionVersion, operationRef, rationale }`. The mutation reloads the exact current Operation and refuses malformed, unavailable, historical, withdrawn, or already-classified refs.
3. **No inference.** Provider names, domains, endpoints, `capabilityId`, display labels, descriptions, searchTerms, tags, embeddings, traffic, payment history, and model output can help a human investigate but cannot create or renew membership.
4. **No inheritance.** A new publication revision or contract version creates a new `operationRef` and has no family membership until explicitly reviewed. Same supplier, name, endpoint, or `capabilityId` does not change this.
5. **No execution semantics.** `familyId` is accepted only by browse/filter routes. Execution, inspect-plan, compare, mapping, route, authority, and invocation inputs continue to accept exact `operationRef`/contract refs. Family membership never broadens grants or fallback scope.
6. **No equivalence claim.** Members are candidate alternatives for human/agent comparison. Actual suitability is decided from exact descriptors and typed inputs. Automatic substitution requires a separate, exact compatibility and consequence decision; it cannot be inferred from family membership.
7. **Audited change.** Create, reclassify, withdraw, retire, and definition-revision decisions record curator, timestamp, and rationale. Retiring a family affects navigation only; it never withdraws, edits, or deletes an Operation.

## Example: Web search

Definition:

- **Label:** Web search
- **Description:** Finds ranked public-web results for a supplied textual query.
- **Include:** Operations whose primary customer outcome is discovering public-web resources from a text query.
- **Exclude:** page-content retrieval, private-dataset search, site crawling, vector-store retrieval, summarization, and search-result enrichment when those are the primary outcome.

`exa-search-x402`, `tavily-search-x402`, `tavily.search`, or `exa.search` can be reviewed against that definition. Admitting two or more does **not** assert that they accept the same query fields, return the same result shape, cover the same sources, have the same price, disclose data to the same recipients, need the same authority, or are safe fallbacks. Those facts remain visible and independently validated on the exact Operations.

## Rejected alternatives

- **Reuse `capabilityId` as the family key:** rejected. It is already part of the exact immutable contract reference and feeds `operationId`; overloading it would entangle browse taxonomy with execution identity and would not group existing provider-shaped IDs safely.
- **Family on `capabilityPublications` or `CapabilityContract`:** rejected. It would make editorial taxonomy appear admission- or contract-authoritative and risk changing exact material identity for a browse-only edit.
- **Infer from provider/name/URL/tags/searchTerms:** rejected. These are mutable, provider-shaped discovery strings and the current search surface deliberately uses them for recall, not authority.
- **Embedding or model classifier:** rejected. It is fuzzy, non-replayable without extra model/version state, and cannot establish exact membership.
- **Family-level normalized input/output schema:** rejected. That creates a second weakened contract. Mapping/compatibility already requires exact schema identities and registered semantics.
- **Membership by stable `operationId` or `capabilityId`:** rejected for v1. It silently carries classification across new publication or contract revisions without review.
- **Multiple active families per Operation in v1:** rejected as unnecessary complexity. Use one primary family like RapidAPI; retain search terms/tags for secondary recall. Revisit only with observed browse evidence.
- **Family as fallback pool or routing key:** rejected. Changed provider, price, effect, disclosure, recipient, or expiry requires exact re-resolution and authority; ADR-030 already treats alternatives as non-automatic.

## Acceptance criteria for #208

The issue can be closed when the decision is accepted with these implementation invariants:

- [ ] `registry` owns family definitions and explicit membership; `capability-contract` and `capability-supply` exact models remain unchanged.
- [ ] Membership binds an exact `operationRef` and one exact family definition revision.
- [ ] One Operation has at most one current primary family in v1.
- [ ] Family membership is curator-authored, bounded, auditable, and cannot be inferred or auto-inherited.
- [ ] Public family projection wraps full exact Operation descriptors; it does not synthesize family-level schema, effects, authority, price, readiness, or trust.
- [ ] Family pages use “Compare Operations” and candidate-alternative language, with the non-equivalence disclosure.
- [ ] Compare/inspect/invoke continue to receive exact Operation refs; `familyId` cannot authorize, route, map, invoke, or grant fallback.
- [ ] Tests prove a new publication revision or contract version has no membership until reviewed.
- [ ] Tests prove provider/name/search-term similarity creates no membership.
- [ ] Tests prove family create/reclassify/retire changes no Operation reference, contract digest, publication, readiness, authority, or invocation behavior.
- [ ] Tests prove every material difference remains visible per member and unavailable members do not become routeable through family membership.

## Issue-ready close note

**Decision:** represent a Capability Family as a registry-owned, curator-versioned browse taxonomy with explicit memberships bound to exact `operationRef` values. In v1, an Operation has zero or one active primary family. A family groups candidate alternatives for browsing and comparison only; it has no schema, price, effect, authority, compatibility, quality, routing, or fallback semantics. Membership is never inferred from provider identity, labels, URLs, tags, search terms, embeddings, or traffic, and never carries forward to a new Operation revision automatically. Every detail, compare, inspect, selection, and invocation continues through the exact Operation descriptor and contract reference. This preserves ADR-028/030 while enabling familiar marketplace family pages such as Web search.

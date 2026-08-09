# AE data model — current-state documentation + compare/contrast vs agentic.market

**Date:** 2026-08-07
**Status:** Analysis only — no code changed. Foundation for the "make the business registry + capability schema watertight" work (goal #1) before building engine/tool-call smarts (goal #2).
**Method:** Read-only mapping of AE source (three parallel scout maps, key seam claims re-verified directly) + existing agentic.market reference study `.planning/research/2026-08-03-agentic-market-observable-registry-contract.md`.
**Evidence:** File:line citations, verbatim schema snippets. Inferences marked `[INFERENCE]`.

---

## PART A — AE current data model (as it exists on disk)

### A.1 Two separate, loosely-coupled surfaces

AE models a capability along two surfaces that are **only optionally linked**:

```text
LISTING SURFACE (business registry / catalog)          EXECUTION SURFACE (capability supply / operations)

Business                                                 CapabilityContract (transport-agnostic)
 └─ Offering                                              └─ capabilityOffering (origin: catalog_offering|standalone)
     └─ OfferingRevision                                     └─ capabilityTransportBinding (adapter: http-json:v1|mcp-jsonrpc:v1|x402-fetch:v2)
         └─ OfferingAccessPath                                   └─ capabilityPublication (provenance 4-mode + lifecycle)
                                                                     └─ Operation (operation:v1:<64-hex>)
```

**Listing surface** — `src/modules/business/internal/schema.ts` (owners, businesses, businessContexts, claims) + `src/modules/catalog/internal/schema.ts` (businessOfferings, businessOfferingRevisions, offeringAccessPaths, snapshot tables). Projected via `BusinessSupplyProjection` → `PublicBusinessCatalogApiV2Dto`, served live by `convex/registry.ts` (`/api/businesses`, `/search`, `/{slug}`). The registry is a **derived projection over Convex tables**, not a hardcoded list.

**Execution surface** — `src/modules/capability-supply/internal/convex-schema.ts` (capabilityPublications, capabilityOfferings, capabilityTransportBindings, Mappings, CallEvents). Queryable via `searchCapabilityOperations`/`detailCapabilityOperation`; executable via `operation.execute` → `executeOperation` (`src/modules/capability-execution/operation-execute.functions.ts`).

### A.2 The load-bearing seam (the core gap)

The two surfaces couple **only** through optional linkage fields:

- Each capability offering has `origin` = `capability_offering | standalone` (**`.optional()`**, `src/modules/capability-supply/public.ts:408-428`).
- Each admitted operation carries `catalogOfferingRef: string` + `catalogOfferingRevision: number` (`public.ts:111-112`).

`convex/capabilitySupplyProjection.ts::deriveBusinessOfferingSupportFromCapabilitySupply` is the **only** place a catalog offering's `support.integrated/routeable` becomes true, and it keys on `catalogOfferingOrigin(supply.origin).offeringRef` — returning `[]` when origin is undefined (`capabilitySupplyProjection.ts:178-179`); otherwise `integrated:true, routeable` gated on readiness (`:205-213`).

**The curated seed does not populate `origin`** (`[INFERENCE]` — seed offers are keyed by `businessSlug` in `curated-cluster-*-publications.ts`, origin not set in the seed imports; `convex/curatedProviders.ts` bootstraps supply directly). Consequence: **listed businesses are not wired to their executable capabilities.** A listed business's tool surface is `submitInquiryAction` — a human-inquiry tool, not a capability-execution tool (`src/modules/business-tools/discovery.ts`). This is the central watertight gap for "turn a business into an API."

### A.3 Capability Contract (transport-agnostic, digest-bound — watertight anchors)

`src/modules/capability-contract/public.ts`:
- Format `ae.capability-contract:v2`; ref = `{capabilityId, version, contractDigest}` with `contractDigest = canonicalDigest(document)` deep-frozen (`:262-339`).
- Document (transport-agnostic — **no** method/path/server/provider): contractFormat, capabilityId, version, name, description, inputSchema, outputSchema, customerAnnotations (≥1), dataUse, effects, evidence (≥1), lifecycle, inputExamples.
- Invariants: closed-object input schema; every top-level input prop covered by a `dataUse.inputPointer`; completion evidence mandatory with guaranteed output pointer; JSON Schema must be self-contained draft 2020-12, no remote `$ref`.
- **Anchors that are already watertight:** self-contained schemas, guaranteed completion evidence, dataUse⇄effects parity, digest-bound refs recomputed and mismatch-checked.

### A.4 Publication / Binding / Offering

- `CapabilityPublicationImport` is a 4-arm union `ae_envelope | openapi_http | mcp | x402` (`publication-importers.ts:81-117`); each normalizes to `defineCapabilityContract` + commercial `{offering, bindingId, credentialRef, registrationEvidenceRefs, requestTimeoutMs}`.
- Adapters per transport: `openapi_http → http-json:v1` (requires OpenAPI 3.1.x, **exactly one server**, **exactly one 2xx**); `mcp → mcp-jsonrpc:v1`; `x402 → x402-fetch:v2` (requires price kind `fixed` byte-equal to resource price + scheme exact).
- `priceSchema` = `fixed {currency,amountMinor} | range {currency,min,max} | on_request` with **integer** `amountMinor` (`public.ts:393-407`).
- `validateCapabilityPublication` = side-effect-free pre-flight running the same normalize.

### A.5 Provenance (FOUR modes, not tri-state)

`CAPABILITY_PUBLICATION_AUTHORITY_MODES = ['provider_owned','ae_curated_external','third_party_gateway','observed_external']` (`internal/publication/provenance.ts:8-11`). Actor gate: provider_owned→owner; ae_curated_external/third_party_gateway→admin/system; observed_external→system only. `observed→real` promotion via `observedPromotionLifecycle` (`lifecycle.ts:96-131`): observed starts `inactive + admission_unproven` (discoverable, never executable), promotes on verified proof-of-first-execution + conformance/credential/health gates. Note: promotion is lifecycle-state only; `authorityMode` is **not** rewritten, so an executable observed op still carries `observed_external`.

### A.6 Business ↔ provider, and the two operationRef dialects

- **Business** = registry entity owning offerings (`offering.businessId`). **Provider** = admission actor (`provenance.publisherRef`). Separate keys. Curated seed aligns them by construction (`CLUSTER_A_PUBLICATIONS` keyed by `businessSlug`; `DEV_SEED_BUSINESS_FIXTURES` seeds 20 Business rows).
- **Operation refs:** canonical `operation:v1:<canonicalDigest({operationId, publicationRef, publicationRevision, contractRef})>` (`public.ts:34-44`), enforced `isPublicOperationRef` `/^operation:v1:[0-9a-f]{64}$/` `(:51-53)`.
- **Dialect split:** `registry.operations.search` returns real DB hash refs (`operation:v1:<64-hex>`); the seeded keyless toolset + `matchKeylessDataAsk` (seed-supply.ts / `keyless-data-ask.ts`) emit seed-form `operation:v1:<capabilityId>` that **fails** `isPublicOperationRef` and the action-seam regex. See Part B gap 7.

### A.7 Confirmed / remaining gaps for "watertight"

| # | Gap | Evidence |
|---|---|---|
| W1 | **Business↔capability linkage is optional + unpopulated** — the core Gap A.2. Real businesses won't surface executable capabilities unless `origin.catalog_offering` is created and the support projection flips. | `capability-supply/public.ts:408-428`; `capabilitySupplyProjection.ts:178-179,205-213` |
| W2 | **Pricing divergence between surfaces.** Catalog `OfferingPrice` kinds `fixed/from/range/quote_only` + unit + taxTreatment; execution `PublicOperationPrice` = `fixed/range/on_request` integer `amountMinor`. Decimal truncates ($0.007→1 minor); x402 importer forbids range/on_request. | `catalog/internal/offering-price.ts:14-35`; `capability-contract/public.ts:393-407`; `publication-importers.ts:327-332` |
| W3 | **x402 version drift.** Adapter `x402-fetch:v2` vs readiness `protocolVersion 'ae-capability:v1'`; source selector captures no protocolVersion. | `transport-adapters.ts:85`; `readiness-probe.ts:134` |
| W4 | **`materialTerms` are prose, not enforced.** `ae-execution-boundary` / `shape-note` not read by any schema gate; non-executability enforced only via lifecycle + routeable gate. | `capability-contract/public.ts:396`; `curated-cluster-*.ts` |
| W5 | **Rigid admission.** openapi exactly one server + one 2xx + closed-input; real multi-server/multi-success/dynamic-keyed bounce. | `publication-importers.ts:148-185,191` |
| W6 | **Identity couplings/defaults.** publicationRevision/catalogOfferingRevision default 1 on admit; `admitCapabilityPublicationCommand` requires `origin.kind==='catalog_offering'` matching an offering → standalone may be dead in the command path. | `internal/publication/admit.ts:51-54,154-156` |
| W7 | **Two operationRef dialects** collide (DB hash vs seed-form capabilityId). | `public.ts:51-53`; `seed-supply.ts`; `operation-execute.functions.ts` `OPERATION_REF` |
| W8 | **Tool-call symptom (downstream of W1/W7):** the general `execute_operation` LLM tool is non-strict (no top-level `additionalProperties:false`, `input` open record) → rejected/dropped under OpenRouter strict mode; the force-execute path pins `toolChoice` to it. | `answer/internal/answer-tool-use-agent.ts` (buildAnswerAgentTools); `harness/strict-schema.ts` |

---

## PART B — Compare/contrast: existing AE vs agentic.market

Reference model (agentic.market, observably — see `2026-08-03-agentic-market-observable-registry-contract.md`):

```text
ServiceProjection { id, name, description, domain, provider, category, networks[], tags[],
                    integrationType, enriched, isNew, priceSummary, endpoints[] }
EndpointProjection { url, method, description, providerName, serviceName, tags[], parameters[], pricing, quality }
ParameterProjection { group, name, type, description, example, enumValues, default, required }
PricingHint { amount, currency, network, scheme, minAmount, maxAmount }
QualityHint { l30DaysTotalCalls, l30DaysUniquePayers }
```

AE's observable public registry (Part A) projects `Business → Offering(→ access paths) → capability → operation` with exact schemas, digest-bound identity, provenance, lifecycle, and a plan/readiness gate.

| Dimension | Agentic Market (observable) | AE (current) | Verdict / gap |
|---|---|---|---|
| **Identity unit** | `ServiceProjection` @ `service.id`. Explicitly **not** a stable provider/operation identity ("service pages group endpoints from different gateways"). | `Business` (offering owner) + `CapabilityContract{capabilityId,version,contractDigest}` + `operation:v1:<64-hex>` (stable, digest-bound). | **AE is stronger** — exact immutable operation material vs mutable display grouping. |
| **Registry derivation** | Mutable projection; counts/rows differ between snapshots; no version/revision/withdrawal. | Derived over Convex tables; revisioned offerings; publications with lifecycle. | **AE is stronger** for revision/identity; registry itself is not hardcoded. |
| **Business ↔ capability (the decisive one)** | A service *is* the grouping; endpoint is loosely attached; no owner↔authority binding visible. | Business ↔ capability linked **only** via optional `origin.catalog_offering`; **seed leaves it unpopulated** → listing not wired to execution. | **Neither is watertight; this is W1.** AE's optional seam is the exact place agentic.market obscures. To make AE "turn a business into an API," this link must be first-class and populated. |
| **Link to human inquiry / execution** | Buyer calls provider endpoint directly; service projection offers no per-call execution surface. | Listed business exposes `submitInquiryAction` (human inquiry); capability execution is a separate surface. | Split matches agentic.market's split, but AE's execution surface is not reached **from** the listing. W1 again. |
| **Pricing** | `PricingHint` decimal/min-max/network/scheme — frequently blank, `upto`, decimal (0.007), or contradictory with live challenge. | Catalog `OfferingPrice` `fixed/from/range/quote_only` + unit + tax; execution `PublicOperationPrice` `fixed/range/on_request` **integer** minor. | **AE catalog is richer and honest; execution side can't express it (W2).** Decimal truncates ($0.007→1 minor). Neither can mint an exact spend from real decimal supply. |
| **Provenance / authority** | Not observable (no provider authorization, no payout identity). | 4-mode provenance + actor gates + observed→real promotion. | **AE is far stronger.** Watertight anchor. |
| **Readiness** | Ranking/traffic/enriched `isNew`/call-count → treated as proxy; catalog row ≠ currently callable. | Readiness probes + `readinessValidUntil` + routeable-only plan gate; observed tier non-routeable until verified. | **AE is stronger.** Watertight anchor. |
| **Schema/contract** | Flat `ParameterProjection`; usually no output schema; often contradicts live. | Self-contained draft 2020-12 input/output schemas, digest-bound, closed-object. | **AE is stronger** for schema + evidence parity. |
| **Publication & lifecycle** | Index presence; no version/withdrawal/stale-TTL. | Publish/refresh/withdraw lifecycle + provenance digest + readiness TTL. | **AE is stronger.** |
| **Tool-call surface** | External agent calls service endpoint directly; no native AE tool. | per-op `capability_*` tools + a broken non-strict general `execute_operation` tool. | **AE has the native-tool idea but it's immature (W8).** engine/tool-call smarts should build on top of a sealed W1/W7 route, not now. |
| **x402 / protocol** | Live v1 vs v2 mixed; descriptor contradictions. | `x402-fetch:v2` adapter, but readiness speaks `ae-capability:v1` (W3). | **AE has the same drift risk** (W3). Must pin protocolVersion at import. |

### Takeaway of the comparison

Agentic.market is a **merchandising projection** over heterogeneous payable endpoints; AE is a **governed, exact, provenanced capability platform**. AE is already stronger on identity, provenance, readiness, schema, lifecycle, and evidence — those are watertight anchors to keep. The gap is not "import agentic.market's shape"; it is that AE's **business↔capability linkage (W1) is optional and unpopulated**, so the "business as an API" property does not actually hold for a real business, and the pricing (W2), protocol (W3), and tool-routing (W7/W8) seams can't carry it until W1 is sealed.

**Sequencing (matches goal #1 before #2):** seal W1 (make `origin.catalog_offering` a first-class, populated, admitted relationship and gate support on it), unify pricing W2, pin protocol W3, then W7 (one operationRef dialect) + W8 (strict tool) become the engine/tool-call build.

### Sources
- AE source maps: `src/modules/capability-supply/public.ts`, `capability-contract/public.ts`, `internal/publication/*`, `internal/publication-importers.ts`, `internal/transport-adapters.ts`, `convex/capabilitySupplyProjection.ts`, `src/modules/catalog/internal/offering-price.ts`, `src/modules/business/internal/schema.ts`, `src/modules/registry/*`, `convex/registry.ts`, `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/harness/strict-schema.ts`.
- Reference: `.planning/research/2026-08-03-agentic-market-observable-registry-contract.md`.

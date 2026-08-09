# agentic.market ↔ AE — like-for-like schema comparison + blast radius

**Date:** 2026-08-07
**Status:** Analysis only. Agreement: clone agentic.market's `Business.endpoints[]` representation into AE first, build engine/tool-call smarts on top. This memo fixes the like-for-like gap and the blast radius so the clone can proceed.
**Method:** agentic.market side from live primary source (`.planning/research/2026-08-07-agentic-market-representation-and-ae-mirror.md`). AE side from source extraction (DTO wire shapes, file:line). All AE cites verbatim from source.

---

## 0. The three AE public DTO layers we compare against

AE exposes **three** wire projections; agentic.market exposes **one** Service shape. The compare is AE's layers vs agentic.market's one.

- **OPERATION** — `PublicOperationDescriptor` (`src/modules/capability-supply/operation-projection.ts:35`): `{operationRef, operationId, contract{capabilityId,version,inputJsonSchema,outputJsonSchema,customerAnnotations}, business, offering, summary, commercial{price,materialTerms,relationship}, dataUse, effects, evidence, cancellation, recovery, provenance{publisher,sourceKind}, availability{posture,observedAt?,validUntil?,reason?}, navigation[]}`. Served by `capabilitySupplyOperations` search/detail/compare/inspectPlan → `registry.operations.*` + per-op answer tools.
- **BUSINESS** — `PublicBusinessCatalogApiV2Dto` (`src/modules/registry/internal/offering-api-projection.ts:34`): `{businessId,slug,name,category,suburb,stateTerritory,publishedPhone?,postcode?,publicUrl,trustTier,responseTimeMinutes?,photos[],observedAt,disposition,offerings[],accessSummary}`. Served by `convex/registry.ts` → `registry.list/search/detail` + `/api/businesses*`.
- **SERVICE** — `ServiceDto` + `EndpointDto` (`src/modules/registry/internal/services-api-projection.ts:15,13`): `ServiceDto{id,revision,business,source,name,category,summary,pricingSummary?,price?,availabilitySummary?,observedAt?,endpoints[],links}`, `EndpointDto{url,method?,name,summary,pricingSummary?,authenticationSummary?,provenance,access:'open'|'external'}`. Served by `registry.services_list/search` + `/api/v1/services*`. **Closest existing analogue**, but per-offering (one ServiceDto per offering), not per-business.

---

## 1. Like-for-like — Service (business) level

Target (agentic.market Service) vs AE BUSINESS DTO and AE SERVICE DTO.

| agentic.market | AE BUSINESS DTO | AE SERVICE DTO | Status |
|---|---|---|---|
| `id` / slug | `businessId`, `slug` ✓ | `id` ✓ | match |
| `name` | `name` ✓ | `business.name` / `name` ✓ | match |
| `description` | **(no description field)** | `summary` | **missing** on business |
| `domain` | NO | NO | **missing** |
| `provider` | `ownerId` (ref, not provider object) | NO | **missing** |
| `providerUrl` | `publicUrl` (AE listing url, ≠ provider site) | `links` | partial |
| `category` | `category` ✓ | `category` ✓ | match |
| `networks[]` | NO | NO | **missing** (networks live on endpoint/provenance only) |
| `enriched` | NO | NO | **missing** (could map from provenance sourceKind) |
| `integrationType` 1P/3P | NO | NO | **missing** (map from 4-mode authorityMode: provider_owned→1P; third_party_gateway/observed_external→3P) |
| `isNew` | NO | NO | **missing** |
| `endpoints[]` | NO — only `accessSummary{humanRequest,externalOperation,aeSupportedAction}` bool + `offerings[].accessPaths[external_operation]` | `endpoints[]` ✓ **but per-offering** | **partial** (needs promoting to business scope) |
| `priceSummary{min,max,avg,basis,currency}` | NO | `price?`/`pricingSummary?` (offering-level) | **missing at business level** |
| `serviceName` | `name` ✓ | `name` ✓ | match |
| `tags[]` | NO (registry doc has `keywords[]`/`searchText`, not public DTO) | NO | **missing** |
| `iconUrl` | `photos[]` (different shape) | NO | partial |
| *(trust/geo)* | `trustTier,suburb,stateTerritory,postcode,responseTimeMinutes,disposition` | — | AE-extra (not in target; keep) |

**Business-level gap:** agentic.market's merchandising fields (`description,domain,provider,providerUrl,networks,enriched,integrationType,isNew,priceSummary,tags,iconUrl`) are **all missing** at AE's business level. The agent-native `endpoints[]` exists but is buried per-offering and lacks target fields.

---

## 2. Like-for-like — Endpoint level

Target (agentic.market Endpoint) vs AE `external_operation` access path, AE `EndpointDto`, AE operation descriptor.

| agentic.market | external_operation accessPath | AE EndpointDto | AE operation (PublicOperationDescriptor) | Status |
|---|---|---|---|---|
| `url` | `url` ✓ | `url` ✓ | endpointUrl in binding (not public op DTO) | match at access/svc; hidden at op |
| `description` | `summary` ✓ | `summary` ✓ | `summary` ✓ | match |
| `method` | `method?` ☐ | `method?` ☐ | method in adapter (not public DTO) | partial |
| `pricing{amount,currency,network,scheme,min,max}` | `pricingSummary?` prose ✗ | `pricingSummary?` prose ✗ | `commercial.price` fixed/range/on_request **integer minor**, no network/scheme | **gap** |
| `parameters[]{group,name,type,example,enumValues,default,required}` | NO | NO | `contract.inputJsonSchema` (JSON-Schema **object**) | **gap** (see §4) |
| `quality{l30DaysTotalCalls,l30DaysUniquePayers}` | NO | NO | `availability` readiness posture (different semantic) | gap |
| `providerName` | `provenance:'business_declared'\|'publicly_observed'` | `provenance` | `provenance.publisher/sourceKind` | partial (semantic differs) |
| `tags[]` | NO | NO | NO | missing |

**Endpoint-level gap:** the self-describing flat `parameters[]` (group body/path/query, type, example, required) and decimal `pricing{scheme:exact/upto}` are the two agent-native vocabulary pieces AE doesn't project — AE has them as a closed JSON-Schema object (inputs) and integer-minor price (execution). Also `group:"path"` params are hidden behind the `shape-note` advisory rather than explicit.

---

## 3. Blast radius — what cloning touches

### 3.1 Additive (safe — new fields appear, no existing consumer breaks)

Adding agentic-group merchandising + endpoint fields at **business/service level**:

- `src/modules/registry/internal/services-api-projection.ts` — **promote `ServiceDto` to business scope** (one Service per business carrying ALL its offerings' `external_operation` endpoints), add `parameters[]`, decimal `pricing{scheme,amount,min,max,currency,network}`, `networks[]`, `tags[]`, `domain`, `provider`, `providerUrl`, `integrationType`, `priceSummary`, `enriched`, `iconUrl`. This file is the natural home; it already emits `endpoints[]`.
- `src/modules/registry/internal/offering-api-projection.ts` — add the same agentic vocabulary to `PublicBusinessCatalogApiV2Dto` (+ optional `endpoints[]`/`networks[]`/`priceSummary`) for `/api/businesses` parity, or keep ServiceDto as the mirrored surface and leave business DTO as-is.
- `src/modules/capability-supply/operation-projection.ts` — **add a flat `parameters[]` projection** (group/name/type/example/required) derived from `contract.inputJsonSchema` + query/path mapping, as an ADDITIVE field on `PublicOperationDescriptor`. Do NOT replace `inputJsonSchema`.
- `src/modules/registry/registry.actions.ts` — mirror new DTO fields in the zod output schemas (`:115-262` duplicate the DTOs).
- `convex/registry.ts` / `convex/capabilitySupplyOperations.ts` — adjacent projections if business/service DTOs gain fields.
- `tools/ae` (`search`, `business`, `journey`) + `tests/*` — additive fields are backward compatible.

**Consumers that keep working unchanged (additive):** operation consumers (`operation-source.ts`, `capabilitySupplyOperations` queries, `registry.operations.*`, answer per-op tools, `keyless-data-ask.ts`, `customer-request` semantic-interpreter/graph, `tools/ae/lib/feeds`), business consumers (`projectBusinessSupplyToPublicApi`, `convex/registry.ts`, `public-inquiry-projection.ts`, `/api/businesses*`, `tests/integration/registry-api.test.ts`, `tests/deploy-smoke/*`, `tests/seo/agent-skill.test.ts`), service consumers (`toConsumerSupplyOption(ServiceDto)`, `registry.services_list/search`, `/api/v1/services*`).

### 3.2 Breaking (the ONE axis to avoid)

- **Re-modeling `contract.inputJsonSchema` (JSON-Schema object → flat `parameters[]`)** — this is the only real breaking change. It ripples through: `operation-projection.ts` serializer (`:289/:349`), the capability contract schema, `customer-request` `ServerCapabilityDescriptor`/`bindCustomerCapabilityDescriptor` (`semantic-interpreter.ts:616,644`), per-op answer tool input schemas (`answer-tool-use-agent.ts`), and `tools/ae/lib/feeds` schema derivation. **Decision: keep JSON-Schema as the execution contract; add flat `parameters[]` as a parallel catalog projection.** No break.

### 3.3 Untouched (the safety rail)

- **Ledger/money**: integer-minor `amountMinor` stays for settlement; only the *catalog* exposes decimal-string `scheme:exact/upto`. AE still pins the exact challenge/lease at execution.
- **Provenance/authority**: 4-mode `authorityMode` stays; `integrationType` 1P/3P is a *derived display* of it.
- **Readiness/evidence**: unchanged.
- **Existing `/api/businesses` + `/api/v1/services` + operation search** remain; mirror is additive on top.

---

## 4. Decision record for the clone

1. **Mirrored surface = promote `ServiceDto` to business scope** (one Service per business, flat `endpoints[]` across its offerings) — the existing `services-api-projection.ts` is the home; add the missing agentic vocabulary. This is the "Business.endpoints[]" native shape.
2. **Add flat `parameters[]` (group/name/type/example/required) + decimal `pricing{scheme}`** as additive projections derived from the existing JSON-Schema contract and integer-minor price — never a replacement.
3. **Map `integrationType` 1P/3P from `authorityMode`**; `networks[]`/`priceSummary`/`tags`/`domain`/`provider`/`enriched` added at business level.
4. **Ledger + provenance + readiness + JSON-Schema execution contract stay untouched** (the watertight rails).
5. **Build smarts (engine NL→endpoint selection, tool calls) on top of the mirrored `Service.endpoints[]` shape** — a later step; not this memo.

Blast radius is therefore **contained and additive**: two projection files (`services-api-projection.ts`, `operation-projection.ts`) carry the change; every existing consumer is backward-compatible; the one breaking axis (`inputJsonSchema`→`parameters`) is deliberately avoided.

## 5. Sources
- agentic.market representation study: `.planning/research/2026-08-07-agentic-market-representation-and-ae-mirror.md`
- AE DTO source extraction: `src/modules/registry/internal/offering-api-projection.ts`, `src/modules/registry/internal/services-api-projection.ts`, `src/modules/capability-supply/operation-projection.ts`, `src/modules/registry/registry.actions.ts`, `convex/registry.ts`, `convex/capabilitySupplyOperations.ts`, `src/modules/registry/public.ts`, consumers as listed in §3.

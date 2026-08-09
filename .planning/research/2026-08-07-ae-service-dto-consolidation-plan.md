# AE → agentic.market schema alignment — Service DTO roll-up + consolidation plan

**Date:** 2026-08-07
**Status:** Implementation PLAN (not yet executed). Goal #1 (data model watertight) → mirrors agentic.market's `Service.endpoints[]`, rationalizing AE's three hand-duplicated public DTO layers down to **one canonical Service projection** with thin derived wire views + a kept execution read. Build smarts (engine/tool-calls) afterward.
**Precedent:** downstream of `.planning/research/2026-08-07-agentic-market-representation-and-ae-mirror.md` and `...-vs-ae-schema-comparison-and-blast-radius.md`. The repo already consolidated redundant DTO facades/mappers in prior waves — this continues that direction.

---

## 1. Target: one canonical Service model (the roll-up)

Everything AE currently splits across `PublicBusinessCatalogApiV2Dto` (/api/businesses), `ServiceDto` (/api/v1/services), and `PublicOperationDescriptor` (registry.operations.*) rolls up into **one canonical `Service`**:

```jsonc
Service {                                    // one business = one Service
  // identity + merchandising (agentic.market Service)
  "id": "api-exa-ai",                       // business.slug
  "name": "...",
  "description": "...",                     // ADD (source elsewhere)
  "domain": "...",                          // ADD (source needed, see §4)
  "provider": "...",
  "providerUrl": "...",
  "category": "...",
  "networks": [ "Base" ],                   // ADD (aggregate from bindings/offerings)
  "integrationType": "1P" | "3P",           // derived from authorityMode
  "enriched": boolean,                      // derived from provenance sourceKind
  "isNew": boolean,                         // derived from createdAt recency
  "priceSummary": {                         // aggregate from offerings' OfferingPrice
    "minAmount": "0.001", "maxAmount": "0.007",
    "avgCostPerTransaction": "0.004",
    "avgCostBasis": "exact" | "varies", "currency": "USDC"
  },
  "tags": [ "search" ],                     // derived from offering categories/keywords
  "iconUrl": "...",                         // from photo / omit

  // AE local merchandising (kept — the differentiator, derived view enriches)
  "suburb": "...", "stateTerritory": "...", "postcode": "...",
  "trustTier": "...", "responseTimeMinutes": 5, "publicUrl": "...",
  "photos": [ {url,alt} ],

  // offerings[] — local listing view (merchandising + inquiry/pricing), derived
  "offerings": [ {
    "offeringRef": "...", "revision": 1, "name": "...", "category": "...",
    "summary": "...", "serviceAreaSummary": "...", "availabilitySummary": "...",
    "pricingSummary": "...", "price": { /* catalog OfferingPrice */ },
    "support": { "integrated": bool, "routeable": bool, "aeSupportedAction": bool },
    "accessPaths": [ /* human_request | external_operation */ ]
  } ],

  // endpoints[] — flat, agent-native, across ALL offerings (the mirror target)
  "endpoints": [ {
    "operationRef": "operation:v1:<64-hex>",   // link to execution read (the kept rail)
    "url": "https://...", "method": "POST",
    "name": "...", "summary": "...",
    "pricing": { "scheme": "exact"|"upto", "amount": "0.007",
                 "currency": "USDC", "network": "...",
                 "minAmount": "", "maxAmount": "" },      // decimal-string catalog
    "parameters": [ { "group": "body"|"path"|"query", "name": "...",
                      "type": "string", "description": "...",
                      "example": "...", "enumValues": [], "default": null,
                      "required": false } ],               // flat, self-describing
    "provenance": "business_declared"|"publicly_observed", // or providerName/authorityMode
    "tags": [ ]
  } ]
}
```

**Kept out of the discovery wire (the engine rail):** full execution material
(input/output JSON-Schema, `dataUse`/`effects`/`evidence`, `availability` posture,
adapter/binding internals) — resolved on demand via the endpoint's `operationRef`
(`registry.operations.detail`), never inlined into discovery.

---

## 2. Field/entity mapping (what rolls up where)

| Current source | Rolls into canonical | Action |
|---|---|---|
| `PublicBusinessCatalogApiV2Dto` identity (businessId,slug,name,category,suburb,stateTerritory,postcode,publicUrl) | Service identity + local fields | merge (keep) |
| `BusinessRecord`/`BusinessContextRecord` (photos, responseTimeMinutes, trustTier, ownerMessage, sourceRefs) | Service local fields | keep/project |
| `PublicOfferingDto` + `PublicOfferingAccessPathDto` | Service.offerings[] | keep, nested under canonical |
| `ServiceDto` + `EndpointDto` (services-api-projection) | Service.endpoints[] — **promote to business scope** | **base of the roll-up** |
| `PublicOperationDescriptor` (operation-projection) | NOT on the wire; endpoint carries only `operationRef` | **keep as execution read**; add flat `parameters[]` + decimal pricing as additive catalog fields |
| `OfferingPrice` (catalog) | Service.offerings[].price + aggregated priceSummary | keep; aggregate min/max/avg/basis |
| provenance `authorityMode` | `integrationType` + endpoint `provenance` | derive (1P/3P) |
| provenance `sourceKind` | `enriched` | derive |
| binding `network` / endpoint network | Service.networks[] | aggregate (ADD) |
| missing `domain`, `providerUrl` | Service.domain/provider | **needs a small schema addition** (§4) |
| `tags`/keywords/searchText | Service.tags[] | derive |

---

## 3. File-level consolidation

**New / canonical:**
- `src/modules/registry/internal/service-projection.ts` — **one** `projectService(businessGraph): Service` + `projectEndpoint`. The single source of truth for the public shape.

**Merged / retired (their code folds in or is deleted):**
- `src/modules/registry/internal/services-api-projection.ts` — promoted to business scope; logic absorbed by `service-projection.ts`; standalone per-offering paths deleted.
- `src/modules/registry/internal/offering-api-projection.ts` — reduced to the **thin local-business view** derived from the canonical Service (or folded in); no stand-alone hand map.

**Kept (semantics unchanged):**
- `src/modules/capability-supply/operation-projection.ts` — `PublicOperationDescriptor` stays as the `operationRef → detail` execution read. **Additive** flat `parameters[]` + decimal `pricing{scheme}` projections added here (already decided: never replace `inputJsonSchema` / integer-minor price).
- `convex/registry.ts` (business read), `convex/capabilitySupplyOperations.ts` (operation read), `src/modules/capability-supply/operation-source.ts` — read facades, minimally touched.

**Consolidated surface wiring:**
- `src/modules/registry/public.ts` — single re-export of canonical `Service` + derived views + `PublicOperationDescriptor`; `toConsumerSupplyOption` derived from canonical.
- `src/modules/registry/registry.actions.ts` — deputize `list/search/detail` (business view), `services_list/search` (canonical Service), `operations.search/detail` (execution read) all from the canonical source; **kill the hand-duplicated zod output schemas (`:115-262`)** in favor of one canonical zod schema + thin view schemas.
- Routes `/api/businesses*` + `/api/v1/services*` unchanged (paths stay), only their projection source changes.

---

## 4. Schema additions required to fully mirror (small, additive)

To emit the merchandising fields without guessing, add (business/offering graph):
1. `domain` + `provider` + `providerUrl` on the business source (declared or from provenance publisher), so `Service.domain/provider` are real, not invented.
2. `networks[]` sourced from the transport bindings' network fields (x402 binding has `network`) + offering categories — aggregate at business level.
3. `priceSummary.avgCostBasis` = `exact` when all endpoint prices are `exact`, else `varies` (derive from the integer-minor prices: `fixed`→exact, `range`/`on_request`→varies).

These are **additive** fields; no existing consumer breaks.

---

## 5. Phased order (each phase compiles + passes gates)

**Phase 1 — Canonical projection exists (additive).**
Create `service-projection.ts` (`projectService` → canonical Service with merchandising + offerings[] + endpoints[] promoted to business scope + `operationRef` links). Add the §4 schema fields. No routing change. Existing wire views unchanged. → gates: tsc, unit, imports.

**Phase 2 — Derive, don't duplicate.**
Points `services_list/search` at `projectService`; fold `offering-api-projection` into a thin business-view derivation from canonical. Consolidate `registry.actions.ts` zod schemas to the single canonical schema + thin view schemas. Delete now-unused per-offering mapping code. `operation-projection.ts` gains additive flat `parameters[]` + decimal `pricing{scheme}` on `PublicOperationDescriptor`. → gates: full (`test:all`).

**Phase 3 — Execution read confirmed.**
`registry.operations.detail(operationRef)` returns the full descriptor (schema/evidence/provenance) unchanged in semantics; verify the engine/answer/CLI execution paths (operation refs, feed derivation) still resolve. → gates: unit + integration + eval.

**Phase 4 — Retire dead surface.**
Remove the hand-duplicated DTO re-exports and any orphaned projection helpers. Confirm `src/modules/registry/public.ts` exposes one canonical type + derived views. → gates: lint, typecheck, imports (route/kernel boundaries).

**Phase 5 — Tests/contracts update.**
Update `tests/integration/registry-api.test.ts` (assert canonical Service + derived business view), `tests/deploy-smoke/answer-runtime-production-smoke-selection.ts` (subject selection from canonical), `tests/seo/agent-skill.test.ts` (advertised surface ids). Add a negative: `Service.endpoints[]` never inlines full execution schema (leans on `operationRef`). Verify `tools/ae search/business` (reads /api/businesses) and `tools/ae feeds/run` (reads operation projection) still pass. → gates: full gate + `smoke:customer-request:*`.

---

## 6. Risks / guardrails

- **Do not flatten the execution material onto discovery.** `endpoints[]` carries `operationRef` only; schema/evidence/provenance stay behind `registry.operations.detail`. This is the line that makes the roll-up safe.
- **Do not drop the local-business merchandising.** `suburb/state/trust/inquiry/phone` are AE's differentiator; they derive from the same canonical Service, not deleted.
- **`inputJsonSchema` and integer-minor price stay the execution contract.** Flat `parameters[]` + decimal `pricing{scheme}` are additive catalog projections (§ blast-radius decision).
- **Merchandising fields (domain/providerUrl/networks) need real sources (§4)** — don't fabricate; add the small schema fields or leave absent/honest.
- **Test-contract churn is expected** at Phases 2 + 5 (three DTO shapes collapse to one canonical + derived views). Budget for it; it's the point.

## 7. Result

One canonical `Service` (business → offerings[] + flat endpoints[]), agentic.market-aligned, with a local-business view and an `operationRef` execution read derived from the **same** source. Three hand-duplicated DTO paths become **one projection + two thin derivations**. Then engine/tool-call smarts build on `Service.endpoints[]`.

# agentic.market business+endpoint representation — primary-source study + AE mirror spec

**Date:** 2026-08-07
**Status:** Study of the KNOWN pattern + the mirror to clone into AE. Analysis only, no code. We are pattern-matching: clone the proven representation, then build smarts on top.
**Method:** Live read-only observations of `https://api.agentic.market/v1/services` (list, limit=5, total 2031), `/v1/services/api-exa-ai` (detail), and `https://agentic.market/SKILL.md`. Verbatim shapes below.
**Evidence class:** Public source + live observation (mutable, non-authoritative). This is the representation to MIRROR, not a contract to trust for authority.

---

## 1. The representation (verbatim, observed)

A **Service** (the "business" in agentic.market) is a merchandising grouping with a flat, self-describing, agent-native `endpoints[]`. An agent discovers a Service, then picks an Endpoint by category/network/pricing/method and **calls `endpoint.url` directly** with its `parameters`.

```jsonc
// Service (business)
{
  "id": "api-exa-ai",                 // slug id
  "name": "Exa",
  "description": "AI-powered web search + content retrieval",
  "domain": "api.exa.ai",
  "provider": "api.exa.ai",
  "providerUrl": "https://exa.ai",
  "category": "Search",               // Search | Inference | Data | Media | Infra | ...
  "networks": ["Base", "solana:5eykt..."],
  "enriched": true,
  "integrationType": "1P",            // "1P" first-party | "3P" third-party grouping
  "isNew": false,
  "endpoints": [ /* Endpoint[] */ ],
  "priceSummary": {
    "minAmount": "0.001",             // decimal-as-string (USD)
    "maxAmount": "0.007",
    "avgCostPerTransaction": "0.004",
    "avgCostBasis": "exact",          // "exact" | "varies"
    "currency": "USDC"
  },
  "serviceName": "Exa",
  "tags": ["search","ai","web","research"],
  "iconUrl": "..."
}

// Endpoint (the callable agent-native unit)
{
  "url": "https://api.exa.ai/search",
  "description": "Search the web and return ranked results",
  "method": "POST",                   // GET | POST
  "pricing": {
    "amount": "0.007",                // decimal-as-string; "" when upto/unpriced
    "currency": "USDC",
    "network": "eip155:8453",
    "scheme": "exact",                // "exact" single amount | "upto" min/max range
    "maxAmount": "",
    "minAmount": ""
  },
  "providerName": "Venice",           // actual gateway provider (can differ from service)
  "serviceName": "",
  "tags": [],
  "parameters": [                     // flat, grouped input shape
    { "group": "body",                // "body" | "path" | "query"
      "name": "query",
      "type": "string",               // string | number | boolean | array
      "description": "",
      "example": "example search query",
      "enumValues": [],
      "default": null,
      "required": false }
  ],
  "quality": {                        // traffic signal, NOT authority
    "l30DaysTotalCalls": "3785",
    "l30DaysUniquePayers": "88"
  }
}
```

### 1.1 Structural facts that matter for the mirror

1. **The Service is a merchandising grouping, not a single identity.** Observed: the `Claude` service (`docs-anthropic-com`) groups Venice, Bankr + BlockRun endpoints; the `ChatGPT` service (`platform-openai-com`) groups Venice + BlockRun. The real gateway is disambiguated **per endpoint** by `endpoint.providerName`. `integrationType` `1P` (provider exposes its own endpoints, e.g. Exa) vs `3P` (one page groups many gateways). — This is the flag that maps to AE's provenance authority modes.
2. **Endpoints are the agent-native surface.** Everything an agent needs to call is on the endpoint: url, method, pricing, parameters. No output schema is projected (Seller Tools / Bazaar declare it, but the catalog serves only input shape + examples).
3. **Path parameters are templates.** Both `:locationId` and `{subgraph_id}` forms appear; the parameter group is `path`. Query params are `group: "query"`; body params `group: "body"`. The same field name re-declared per endpoint.
4. **Pricing is decimal-as-string + scheme.** `exact` = single `amount`; `upto` = `minAmount`/`maxAmount` range. Strings, not integer minor units. `priceSummary.avgCostBasis` = `exact` | `varies`. Blank `amount` means unpriced/unknown — and the reference study's live probes showed **blank/`upto`/decimal hints frequently contradict the live 402 challenge**.
5. **`quality` is a traffic proxy** (call/payer counts) — explicitly a discovery hint, never readiness/authority/fulfilment.

---

## 2. The mirror: how AE should represent the same, field-for-field

The point of "pattern matching" is: an agent should discover an AE **Business** and get its self-describing, callable **`endpoints[]`** — the exact shape above — so discover → pick endpoint → call works identically to agentic.market. AE currently splits this across Business → Offering → Capability → Binding → Operation with an optional `origin` link. That over-nesting is why "the feel" is missing. The mirror makes `Business.endpoints[]` the native public representation.

### 2.1 Service ↔ Business

| agentic.market Service | AE mirror (current field) | Action |
|---|---|---|
| `id` / `slug` | `business.slug` / `BusinessIdentity` | keep |
| `name`, `description` | `BusinessRecord` name/description | keep |
| `category` | business category / offering category | ensure exposed |
| `domain`, `provider`, `providerUrl` | business domain/url + provenance publisher | keep |
| `networks[]` | **(missing as business-level primary)** — networks live per-endpoint in AE | **add** business-level `networks[]` for the mirror |
| `integrationType` `1P`/`3P` | provenance `authorityMode`: `provider_owned`→1P; `third_party_gateway`/`observed_external`→3P | **map** 1P/3P onto the 4-mode provenance; expose in projection |
| `priceSummary {min,max,avg,basis,currency}` | offering pricing (range) | **project** a business-level `priceSummary` from offerings |
| `tags[]`, `iconUrl`, `enriched`, `isNew` | searchTerms / marketing fields | keep / expose |
| **`endpoints[]`** | **execution surface (operation)** | **emit per business** — this is the core mirror |

### 2.2 Endpoint ↔ AE operation

| agentic.market Endpoint | AE mirror | Action |
|---|---|---|
| `url` | `binding.endpointUrl` | keep |
| `method` | binding adapter GET/POST | keep (GET/POST; AE currently GET-only for keyless exec) |
| `pricing {amount,currency,network,scheme,min,max}` decimal-string | AE `PublicOperationPrice` is `fixed/range/on_request` **integer minor** | **re-align to decimal-string + exact/upto/varies** to clone the shape; see 2.3 |
| `parameters[] {group,name,type,example,enumValues,default,required}` | AE closed-object input schema + `dataUse.inputPointer` | **mirror as flat grouped parameters** so an agent fills them the way they do agentic.market; keep the strict closed-object schema as the *execution* contract, emit the flat list as the *catalog* shape |
| output schema | AE guaranteed completion evidence (stronger) | keep AE's, don't regress to catalog's absent output |
| `quality {calls,payers}` | AE readiness probe + routeable gate (stronger) | keep AE's; treat any traffic hint as discovery-only |
| path templates `:id` / `{id}` | AE shape-note advisory (path-segment non-executable gate) | **represent path params explicitly** as `group:"path"` instead of hiding in prose |
| `providerName` | AE provenance publisherRef | keep per-endpoint |

### 2.3 Pricing mirror (the sharpest change)

agentic.market prices in **decimal dollars as strings** with a `scheme`:
- `exact` → `amount`
- `upto` → `minAmount`/`maxAmount` (range), basis `varies`

AE execution-side pricing is `fixed/range/on_request` with **integer `amountMinor`**, and real decimal supply truncates (`~0.007` → `1` minor). To mirror the pattern directly, AE's public business/endpoint representation should carry the same **decimal-string + scheme (`exact`/`upto`/`varies`)** shape, while AE's own money/ledger path continues to use exact minor units for *actual settlement*. (The catalog says decimal + scheme; the ledger settles exact. Mirror the representation, keep the safety rail.)

### 2.4 The "business as API" native shape (what we clone)

The mirror target is that AE's public registry emits, per Business:

```jsonc
Business {
  id, name, description, domain, category, networks[],
  integrationType /* 1P|3P ← provenance */, priceSummary,
  endpoints[]  /* url, method, pricing{scheme,amount,min,max,currency,network},
                  parameters[]{group,name,type,example,required} */
}
```

An agent: **discover business → read endpoints[] → pick one (method/pricing) → call its url with the listed parameters.** Every AE concept we already have (identity, provenance, readiness, evidence, schema, ledger) stays underneath as the hardening layer; the *representation* and the *agent flow* pattern-match agentic.market. Then build smarts (engine NL→endpoint selection, tool calls) on top of exactly that shape.

---

## 3. What the mirror keeps vs replaces

**Keep (AE watertight anchors, don't regress):** digest-bound `operation:v1:<64-hex>` identity; 4-mode provenance; readiness/TTL + routeable gate; self-contained closed-object input schema + guaranteed completion evidence; ledger/exact settlement.

**Mirror/replace (the representation + agent flow):** expose `Business.endpoints[]` as the primary public shape; flat grouped parameters; decimal-string `scheme: exact/upto` pricing on the catalog; explicit `group:"path"` params (no prose-hidden path segments); business-level `networks[]` and `priceSummary`; map `1P/3P` onto provenance.

**Deliberately NOT cloned:** catalog traffic/`quality`/`isNew` as any authority; blank-or-`upto` price hints as spend authorization (AE still pins the exact challenge/ledger at execution); the service-grouping-as-identity ambiguity (AE keeps business identity exact).

## 4. Sources (primary, observed)
- `https://api.agentic.market/v1/services?limit=5` (list; 5 services, total 2031)
- `https://api.agentic.market/v1/services/api-exa-ai` (detail)
- `https://agentic.market/SKILL.md` (machine schema + agent flow)
- Companion reference: `.planning/research/2026-08-03-agentic-market-observable-registry-contract.md`

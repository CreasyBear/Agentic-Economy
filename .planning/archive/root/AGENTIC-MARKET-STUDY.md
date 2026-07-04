# Agentic.Market Study — Phase 1 Translation

**Status:** research artifact for Phase 1 planning.
**Snapshot:** 2026-06-27.
**Sources:** live `agentic.market`, `api.agentic.market`, `/llms.txt`, `/SKILL.md`, x402/Bazaar docs/GitHub, Coinbase launch material, Parallel service listing, advisor findings.

## What Agentic.Market actually is

Agentic.Market is a public registry for x402-payable HTTP services.

It is not only a directory page. It has one mirrored data model:

```text
service/provider
  -> endpoints
      -> method/path/parameters
      -> pricing/network/payment requirements
  -> quality/activity metrics
  -> public business service catalog page
  -> JSON API list/search/detail
  -> llms/SKILL agent instructions
  -> sitemap/robots/schema
  -> seller validation/onboarding
```

No public repository for Agentic.Market itself was found under obvious GitHub/source names. Treat its site/API as observed product behavior, and treat `x402-foundation/x402` plus Bazaar docs/source as the open-source protocol evidence.

Observed live surfaces:

```text
/                              human + markdown directory
/services/{id}                  service detail page
/llms.txt                       agent-facing discovery guide
/SKILL.md                       agent setup/use guide
/validate                       seller validator
/validate/setup/*               endpoint setup wizard
https://api.agentic.market/v1/services
https://api.agentic.market/v1/services/search?q=
https://api.agentic.market/v1/services/{id}
```


Observed API snapshot:

```text
total services: 1364
sample page size cap observed: 200 results
observed categories include: Search, Data, Inference, Media, Social, Infra, Travel, Storage, Other
observed networks include: eip155:8453, base, solana, ethereum
observed endpoint methods include: GET, POST, DELETE, PATCH, PUT
```
Observed service object fields include:

```text
id, name, description, domain, provider, providerUrl, category, networks,
enriched, endpoints, integrationType, isNew, priceSummary, tags, iconUrl
```

Observed endpoint fields include:

```text
url, description, method, parameters, pricing, providerName, serviceName, tags, quality
```

Parallel example:

```text
Service: Parallel
Category: Data
Average request: $0.01-$0.30
Endpoints: 3
POST /api/search   AI-powered web search           $0.01
POST /api/extract  Extract content from URLs       $0.01
POST /api/task     Run an AI research task         $0.30
```

## Bazaar pattern worth copying as shape, not payment rail

Bazaar indexes resources that declare discovery metadata through x402 payment-required responses and facilitator discovery endpoints.

Useful engineering patterns:

1. Source declares machine-readable capability metadata.
2. Discovery output is structured, not scraped marketing copy.
3. Validation/readback exists before a listing is trusted.
4. Dynamic routes collapse many concrete endpoints into one catalog entry.
5. Indexing failures are diagnosable via explicit status/reason headers.
6. Search result quality depends on freshness, metadata completeness, and successful recent use.


Seller/listing flow observed from Coinbase/Bazaar docs: a provider does not fill a marketplace listing form first. They expose Bazaar metadata in the x402 `PAYMENT-REQUIRED` challenge, complete at least one successful CDP-facilitated settlement, then appear through asynchronous discovery/indexing. This is useful as a **readback pattern**, not as Phase 1 AE scope.
Reject for Phase 1 AE:

```text
x402, USDC, wallets, payTo, settlement, purl, facilitator payment flows,
402-as-onboarding, API keys, MCP tools, OpenAPI action descriptors,
callable endpoints, price fields, usage/volume ranking claims
```

## Translation to Agentic Economy

AE's Phase 1 equivalent is not "an API marketplace".

AE's Phase 1 equivalent is:

```text
business
  -> services
      -> service area / suburb intent
      -> first-request capability status
      -> contact/no-contact reason
      -> hours/unknown
  -> public business service page
  -> registry/search row
  -> read-only public JSON list/search/detail
  -> AE-hosted discovery manifest
  -> llms/sitemap/robots/schema
  -> owner/admin health and repair
```

The core registry question is:

```text
Can a customer or AI assistant discover which Australian business can handle this service in this place, what safe first request can start, and what is unavailable?
```

## Phase 1 copy/adapt/reject

### Copy conceptually

- Provider/business plus service rows as the primary mental model.
- One public detail page per registry item, generated from source state.
- Public JSON list/search/detail endpoints with stable slugs and pagination.
- Agent-readable docs that mirror the same facts as human pages.
- Validation/readback before indexing is treated as real.
- Sitemap/robots/schema are first-class deliverables.
- Search results show category, description, status, and health signals.

### Adapt to AE

- `service` becomes an AU local-business service row.
- `endpoint` becomes a non-callable first-request capability/status, not an executable API.
- `quality` becomes freshness/completeness/verification/readback health, not volume or payer counts.
- `validate endpoint` becomes owner/admin publish + projection diagnostics.
- `priceSummary` is absent until money rails exist.
- `network` is absent; locality/service area matters instead.

### Reject

- Payment/protocol model in core tables.
- Huge uncurated category dump.
- Same-host docs pointing to dead API routes.
- One generic markdown alternate for every route.
- Empty strings as data defaults.
- Generic FAQ that does not answer the specific service/business.
- Opaque featured/ranking claims.
- Callable endpoint language before protected actions exist.

## Required Phase 1 shape changes

Public read model:

```text
BusinessPublicCatalog
  business: slug, name, category, suburb, trustTier, publicStatus
  services[]: slug, name, category, serviceArea, hoursOrUnknown, publicStatus
  capabilities[] per service: kind, status, callable=false, paymentRequired=false, firstRequestDisclosure, reason
  indexStatus
  discoveryStatus
  sourceHash
  updatedAt
```

Public no-auth JSON routes:

```text
GET /api/businesses
GET /api/businesses/search?q=
GET /api/businesses/{slug}
```

Rules:

- These are registry projections, not a developer platform.
- No API keys, SDK, MCP, OpenAPI, or action invocation in Phase 1.
- HTML, JSON, `llms.txt`, sitemap, schema, and UCP fallback use the same source-owned DTO.
- Docs and live route hosts must match; a documented route returning 404 fails launch.
- Search/list/detail schemas must be compatible and tested.

## Acceptance story

Use this story to judge Phase 1:

```text
Sam runs Parramatta Emergency Plumbing.
Sam claims without ABN.
Sam publishes emergency plumbing + service area + safe first-request disclosure.
AE shows a public business service catalog page and registry row.
/api/businesses/search?q=emergency+plumber+parramatta returns Sam's service row.
/{slug}/ucp and /llms.txt expose the same service facts as data, with callable=false and paymentRequired=false.
Sam can see publicStatus, indexStatus, discoveryStatus, and per-service capability health.
If indexing fails, an operator sees the failed attempt and can retry from source state.
If the claim is wrong or abusive, suppression removes the business/service from page, registry, sitemap, llms, API, and UCP.
```

If this story fails, Phase 1 is not ready even if tests pass.

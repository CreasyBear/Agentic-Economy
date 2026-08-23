# Agentic Market full-registry source and import contract

**Date:** 2026-08-23
**Observation window:** 16:28–16:35 AWST (08:28–08:35 UTC)
**Status:** Primary-source research; no authentication, payment, listed-service invocation, or external write was performed.
**Decision:** Agentic Market can be read as a public, discovery-only source. Its catalogue rows are not AE admissions and must not become executable supply without independent admission evidence.

## Primary sources

- The official [Agentic Market skill](https://agentic.market/SKILL.md) names the public collection API, describes discovery and payment as separate steps, and documents a simplified service/endpoint schema.
- The live, first-party [services collection](https://api.agentic.market/v1/services) is the authoritative enumeration response used here. Parameterized reads used the same route with `limit` and `offset`, for example [the first maximum-size page](https://api.agentic.market/v1/services?limit=200&offset=0).
- The first-party [Exa detail response](https://api.agentic.market/v1/services/api-exa-ai) demonstrates the richer live record returned by `GET /v1/services/{id}`. Its corresponding [public service page](https://agentic.market/services/api-exa-ai) shows the same service ID in the URL and presents the endpoint, method, parameters, traffic hints, network, and price to users.
- The official [About page](https://agentic.market/about) defines Agentic Market as a place where agents discover paid APIs and settle in USDC. It separates “discover” from “call” and says payment occurs when the service is called.
- The official [Seller Tools page](https://agentic.market/validate) says the validator checks whether an x402 endpoint is correctly configured and indexed on the Bazaar, and that Bazaar-indexed services automatically appear on Agentic Market.
- The official [robots policy](https://agentic.market/robots.txt) and [sitemap](https://agentic.market/sitemap.xml) were checked for crawl and enumeration constraints. The sitemap exposed 1,003 URLs at observation time—three non-service pages and only 1,000 service pages—so it is not a full registry source.

Only official `agentic.market` pages and `api.agentic.market` responses were used. The counts below are live observations, not a timeless promise by the operator.

## Enumeration

The canonical full enumeration request is:

```http
GET https://api.agentic.market/v1/services
```

Use the **slashless** route. At observation time the slashless route returned `200`, while `GET /v1/services/` returned `404`, even though one discovery example in the official skill includes a trailing slash. The official skill's schema section and the live Agentic Market web client use the slashless form.

The collection response is:

```json
{
  "services": ["...service objects..."],
  "total": 2343,
  "limit": 50,
  "offset": 0
}
```

Related routes are useful but are not the canonical full enumerator:

- `GET /v1/services/{id}` returns one service object directly, with no `{ service: ... }` wrapper.
- Both `GET /v1/services/search?q=...` (the official skill spelling) and `GET /v1/search/services?q=...` (the current site-client spelling) worked during the observation. They are filtered search routes, default to 10 results, and clamp a requested limit above 50 to 50.
- The sitemap is capped/incomplete relative to the API-reported total and must not drive full ingestion.

No authorization header, API key, login, or cookie was required for the collection, search, or detail reads. The successful unauthenticated response is evidence only about catalogue access; it says nothing about authorization to call a listed endpoint.

## Pagination

Pagination is offset-based:

| Property | Observed contract |
|---|---|
| Default `limit` | `50` |
| Maximum effective `limit` | `200`; requests for `500`, `1000`, and `5000` all returned `limit: 200` and 200 records |
| Default `offset` | `0` |
| Advance | `offset += response.limit` |
| End | `services.length < limit`; `offset=2343` returned an empty array |
| Invalid values | Non-integer/non-numeric values return `400` (`invalid limit` or `invalid offset`); zero/negative values fall back to defaults (`limit: 50`, `offset: 0`) |
| Cursor/snapshot | None exposed |
| Ordering | No sort key or stability guarantee exposed; observed order changed between reads |

At the current total, the default page size requires 47 requests and the maximum page size requires 12 requests (11 × 200 plus 143).

The critical finding is that a single offset walk is not complete even when the raw row count sums to `total`. Re-reading offset 0 returned the same 200 IDs in a different order; re-reading offset 600 shared only 164 of 200 IDs with the earlier page. Each of four complete traversals summed to 2,343 rows, but each included duplicate IDs across page boundaries and therefore omitted other IDs.

The collection response supplied `Cache-Control: no-store` but no `ETag`, `Last-Modified`, `Link`, cursor, snapshot token, `RateLimit-*`, or `Retry-After` header. No public request-rate quota or response-byte ceiling was found in the first-party material. That absence is not a promise of unlimited access. The only demonstrated size control is the 200-record page cap. Maximum-size full traversals were approximately 23.7–25.1 MB of uncompressed JSON; an individual 200-record page reached approximately 3.41 MB because services embed all endpoints.

An importer must therefore use sequential or low-concurrency reads, exponential backoff with jitter on `429`/`5xx`, a bounded response-size guard comfortably above the observed 3.41 MB page, and multiple de-duplicating passes. It must not delete a previously observed record merely because one unstable traversal omitted it.

## Stable identity

`services[].id` is the catalogue's best available stable identifier:

- it is always a non-empty string in the 2,343-record observation;
- it is the lookup key for `GET /v1/services/{id}`;
- it is also the public page slug at `https://agentic.market/services/{id}`;
- the four-pass union contained exactly 2,343 distinct IDs, matching the source-reported `total`.

Treat `id` as an **opaque, source-scoped identifier**, not as a documented slug algorithm or a global provider identity. The operator does not publish an immutability guarantee. Do not derive identity from `name`, `domain`, `provider`, or `serviceName`, and do not assume `integrationType: "1P"` proves provider ownership.

Recommended keys:

```text
source_service_key = "agentic-market:" + service.id
source_endpoint_key = "agentic-market-endpoint:" + service.id + ":" +
                      hash(upper(method) + "\n" + canonical_https_url)
```

Preserve the original URL and method alongside the normalized key. A URL can change while the service ID remains; endpoint additions/removals should be versioned observations rather than mutations of an AE operation identity. Blank or compound methods such as `"GET, POST"` are not executable identities and must remain discovery-only until split and independently admitted.

## Fields

The official skill documents a simplified subset. The complete live collection/detail wire observed across all 2,343 IDs was:

| Level | Fields | Normalization rule |
|---|---|---|
| Service | `id`, `name`, `description`, `domain`, `provider`, `providerUrl`, `category`, `networks[]`, `enriched`, `endpoints[]`, `integrationType`, `isNew`, `priceSummary`, `serviceName`, `tags[]`, `iconUrl` | Preserve raw values. Convert empty descriptive strings to nullable values only in the normalized projection. Keep `enriched`, `isNew`, and `integrationType` as source display metadata, never readiness/authority. |
| Endpoint | `url`, `description`, `pricing`, `method`, `providerName`, `parameters[]`, `serviceName`, `tags[]`, `quality` | Parse URL and method defensively. Every observed URL was HTTPS, but 3,516 methods were blank and two were `GET, POST`; those are not routeable without new evidence. |
| Pricing | `amount`, `currency`, `network`, `scheme`, `maxAmount`, `minAmount` | Keep decimal amounts as strings. Never use IEEE-754 numbers for authorization or settlement. Preserve the raw network and scheme; normalize only through an explicit mapping. |
| Price summary | `minAmount`, `maxAmount`, `avgCostPerTransaction`, `avgCostBasis`, `currency` or `null` | Display/analytics only. Never authorize a call from an aggregate summary. |
| Parameter | `group`, `name`, `type`, `description`, `example`, `enumValues[]`, `default`, `required` | Candidate invocation hints, not a complete JSON Schema. `example` is polymorphic. Do not forward `header` parameters blindly or infer secrets. |
| Quality | `l30DaysTotalCalls`, `l30DaysUniquePayers` or `null` | Nullable decimal strings representing source-reported activity hints. Parse to bounded integer types for display; do not treat them as health, delivery, reputation, or verification. |

Observed completeness and contradictions matter to the adapter:

- All 2,343 service objects contained all top-level keys, but `priceSummary` was `null` for six services. There were 29,711 endpoint objects; one service had no endpoints.
- `description`, `category`, and `integrationType` were empty on 2,269 services. `integrationType` was otherwise `1P` (45) or `3P` (29). `serviceName`, `providerUrl`, and `iconUrl` were also frequently empty.
- All 29,711 endpoint URLs were HTTPS. Methods were `GET` (14,378), `POST` (11,740), blank (3,516), and small numbers of `DELETE`, `HEAD`, `PUT`, `PATCH`, or compound `GET, POST`.
- All observed endpoint currencies were `USDC`, but `pricing.amount` was blank on 669 endpoints, including 666 marked `scheme: "exact"`.
- Schemes were `exact` (29,232), `upto` (475), `batch-settlement` (3), and `nvm:erc4337` (1). Unknown or unsupported schemes must fail closed. For `upto`, 473 had `maxAmount`, only 161 had `minAmount`, and two had blank `amount`.
- Network strings are heterogeneous. Service-level networks mix labels such as `Base`/`Solana` with CAIP-like identifiers. Endpoint pricing used both `eip155:8453` and `Base`, plus many other raw names. Preserve first; map explicitly later.
- `quality` was an object on 14,995 endpoints and `null` on 14,716.
- No service or endpoint field supplied an explicit auth scheme, asset contract, `payTo`, current 402 challenge, output schema, response media type, timeout, idempotency rule, settlement receipt, delivery evidence, or verification result.

The transport claim supported by the catalogue is limited to a candidate HTTPS URL plus a claimed HTTP method and x402-oriented price/network metadata. The official [service page](https://agentic.market/services/api-exa-ai) says services are payable per request through x402 without API keys or accounts, but AE must confirm a live 402 challenge before treating any endpoint as x402-callable.

## Current count

At 2026-08-23 16:28–16:35 AWST, every page reported:

```text
total = 2,343 services
effective maximum page size = 200
pages per traversal = 12
union endpoint records = 29,711
```

Four complete maximum-size traversals produced:

| Pass | Raw rows | Distinct service IDs in that pass |
|---:|---:|---:|
| 1 | 2,343 | 2,223 |
| 2 | 2,343 | 2,229 |
| 3 | 2,343 | 2,217 |
| 4 | 2,343 | 2,219 |
| Four-pass union | 9,372 | **2,343** |

Thus the current source-reported count and the current reachable distinct-ID count both equal **2,343**, but only after de-duplicating retry passes. The pass-level gap is pagination instability, not evidence that duplicate catalogue identities exist: duplicate IDs within the first pass had identical objects, while the four-pass union resolved to 2,343 source-scoped IDs.

This is a measurement, not a guaranteed fixed cardinality. A production importer must record `observedAt`, the pass's reported `total`, effective page size, raw row count, unique count, and payload hash. If `total` changes during a pass, finish the observation but start a new epoch; do not claim a snapshot the API does not provide.

## Terms and constraints

The first-party legal/crawl evidence does **not** establish a licence for unrestricted full mirroring or republication.

- The [robots policy](https://agentic.market/robots.txt) says `Content-Signal: search=yes, ai-input=no, ai-train=no`. Its own definition limits `search` to building a search index and returning hyperlinks and short excerpts; it expressly excludes AI-generated search summaries. It also disallows `/api/` and `/_next/` on the `agentic.market` host.
- Robots rules are host-specific. `https://api.agentic.market/robots.txt` returned `404`; that is absence of a rule, not affirmative reuse permission. The official skill intentionally directs agents to the API, so ordinary public discovery reads are clearly an intended use.
- The sitemap, About, Seller Tools, service pages, skill, and API responses expose no catalogue licence or bulk-redistribution grant. Common first-party legal paths (`/terms`, `/terms-of-service`, `/privacy`, `/privacy-policy`, `/legal`, `/license`, `/licence`) returned `404` at observation time, and no terms/licence link appeared in the site footer.
- The [About page](https://agentic.market/about) footer says the marketplace is operated by Coinbase, is not an official x402 Foundation product, and that its content is informational and provides no guarantees. That disclaimer is not a data licence.
- Catalogue descriptions, icons, provider names, and endpoint metadata may contain provider-supplied or third-party material. Agentic Market's public availability does not establish downstream rights in every field.

**Conclusion:** a conservative, rate-limited, minimal **internal discovery index** is consistent with the intended public API use, but permission to store and republish the complete raw catalogue is not established. Do not expose a wholesale mirror, train on it, feed site content into generative AI, or reuse icons/descriptions beyond short search-result excerpts without written permission from the operator and, where relevant, the provider. Keep provenance and source links, minimize retained fields, honor removals after robust confirmation, and make the mirror disableable. This is an engineering interpretation of the published constraints, not legal advice.

## Admission boundary

Agentic Market indexing is not AE admission. The [Seller Tools FAQ](https://agentic.market/validate) says Bazaar-indexed services automatically appear on Agentic Market; the validator checks x402 configuration and Bazaar indexing. This establishes a discovery/indexing boundary, not AE's authority, safety, delivery, or evidence boundary.

| Stage | What Agentic Market supplies | What AE must require separately |
|---|---|---|
| Indexed observation | Service grouping, source ID, names/descriptions, endpoint URL/method/parameter hints, price/network claims, 1P/3P/enriched/new labels, optional traffic counts | Record as `observed_external`; preserve source and timestamp. No provider authority or availability inference. |
| AE admission | Nothing in the catalogue proves AE admission | Publisher/owner authority; URL/SSRF controls; current unauthenticated 402 preflight without payment; supported scheme; exact asset, network, amount and `payTo`; input and output schemas; data-use/effect policy; risk and compliance checks. |
| AE execution | The catalogue points to a provider URL and explains a separate paid call flow | Explicit principal grant and budget; supported payment lane; idempotency/retry policy; secret isolation; execution through AE's governed route. Import and refresh must never call or pay the endpoint. |
| Delivery | Optional traffic counts and marketing examples | Contract-valid provider response bound to the invocation, with status and failure semantics. A payment or HTTP 2xx alone is not delivery. |
| Verification | No AE evidence or verifier result | Settlement/delivery evidence, provenance, hashes/receipts as applicable, and an AE verification verdict. `quality`, `enriched`, `1P`, and `isNew` are not verification. |

Until every admission requirement passes, an imported row may be searchable but must be labelled **external catalogue observation / not admitted / not executable**. A later admission creates or links an AE Market Operation; it does not mutate the external catalogue row into authority.

## Implementation contract

The importer should implement the following fail-closed contract.

1. **Enumerate only from the slashless collection route.** Request `limit=200&offset=N`; validate `{services,total,limit,offset}` and enforce `0 < limit <= 200`. Never use the sitemap or search endpoint as the completeness source.
2. **Converge by source ID across passes.** Within an observation epoch, upsert raw records by `service.id`, continue complete 12-page passes while the union is below the maximum stable `total`, and stop when the union reaches that total. Cap attempts and report `partial` rather than looping forever. A confirmation pass is desirable. Never infer deletion from one pass.
3. **Store provenance before normalization.** Retain `source="agentic_market"`, opaque `sourceId`, source detail/page URLs, `observedAt`, raw-payload hash, source-reported total, and adapter version. Retain raw payload only if the approved licence/retention policy permits it; otherwise retain the minimum normalized search fields and hashes.
4. **Normalize without strengthening claims.** Empty strings become nullable display fields. Preserve raw networks, schemes, currency and decimal strings. `integrationType`, `enriched`, `isNew`, `quality`, category and tags remain source metadata. They must not map to AE authority, readiness, trust, availability, delivery, or verification.
5. **Separate service and endpoint identity.** Use `agentic-market:{id}` for the observed service. Derive a candidate endpoint key from source service ID plus normalized method and canonical HTTPS URL. Do not use provider/domain as the primary key and do not expose the source endpoint key as an AE operation reference.
6. **Fail closed on callability.** Blank/compound/unknown methods, blank amounts, unsupported pricing schemes, unmapped networks, missing asset/`payTo`, absent output schemas, or any failed live preflight stay discovery-only. `priceSummary` is never executable pricing. Decimal strings must convert to AE's exact-money representation with explicit asset decimals; no silent USDC→USD coercion.
7. **Create admission candidates, not operations.** The registry adapter emits an `ExternalCapabilityObservation`. A separate, auditable admission workflow may produce an AE Market Operation after authority, schema, payment, policy, and evidence checks. Refreshing the mirror must have no execution credentials and no payment capability.
8. **Respect legal and operational limits.** Default to internal search, source links, short excerpts, no icon copying, no generative-AI use of site content, conservative concurrency, conditional backoff, response/time limits, and a kill switch. Public full-catalogue republication requires an affirmative licence or written permission.
9. **Expose completeness honestly.** Publish `sourceReportedTotal`, `uniqueObserved`, `passes`, `partial`, `lastObservedAt`, and any drift/errors. For this observation those values are `2343`, `2343`, `4`, `false`, and the timestamp above.

Suggested normalized boundary:

```ts
type AgenticMarketObservation = {
  source: "agentic_market";
  sourceId: string;                 // opaque services[].id
  sourceDetailUrl: string;
  observedAt: string;
  rawHash: string;
  display: {
    name: string;
    description: string | null;
    domain: string;
    provider: string | null;
    providerUrl: string | null;
    category: string | null;
    tags: string[];
    iconUrl: string | null;         // link only unless reuse rights exist
  };
  sourceFlags: {
    enriched: boolean;
    isNew: boolean;
    integrationType: "1P" | "3P" | null;
  };
  endpoints: Array<{
    sourceEndpointKey: string;
    url: string;
    methodRaw: string;
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | null;
    parameters: unknown[];          // source hints, not AE execution schema
    pricing: {
      schemeRaw: string;
      amount: string | null;
      minAmount: string | null;
      maxAmount: string | null;
      currencyRaw: string;
      networkRaw: string;
    };
    quality: {
      l30DaysTotalCalls: string;
      l30DaysUniquePayers: string;
    } | null;
    admission: "observed_external"; // the adapter cannot promote this state
  }>;
};
```

This boundary preserves complete source fidelity needed for discovery while preventing the central category error: **an indexed x402 catalogue endpoint is evidence that a service was observed, not evidence that AE may execute it, that it will deliver, or that its result has been verified.**

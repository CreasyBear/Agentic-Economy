# Agentic Market observable registry and marketplace contract

**Date:** 2026-08-03  
**Issue:** [#205](https://github.com/CreasyBear/Agentic-Economy/issues/205)  
**Evidence boundary:** public source, official protocol/library documentation, and fresh unpaid read-only observations. No payment, authentication, catalog write, provider write, or production-source implementation occurred.

## Decision-use verdict

Agentic Market is observably a discovery and merchandising projection over heterogeneous payable endpoints. Its public catalog is useful for finding candidates and traffic/price hints, but it is not an executable contract, provider-identity authority, readiness proof, revision log, settlement receipt, or fulfilment record.

AE should:

- **adopt** official x402, Bazaar, OpenAPI, MCP, and A2A primitives at the protocol boundaries where providers actually publish them;
- **adapt** external service/endpoint records into AE's existing contract → offering/binding → publication/readiness → routeable graph chain, retaining source digest and provenance;
- **improve** the observable market model with exact schemas, immutable operation material, provider authorization, revisions/withdrawal, readiness TTL, effects/data-use/evidence, mandate/grant authority, exact spend, reconciliation, and redacted readback;
- **reject** catalog prose, traffic, ranking, blank/decimal price hints, service labels, or a successful 402 challenge as authority to invoke, pay, publish, or claim fulfilment.

This report is decision input for #200 and #206. It is not executable marketplace progress.

## Proof classes

| Label | Meaning |
|---|---|
| **Public source** | Public Agentic Market page, deployed client bundle, API, SKILL.md, or public profile. Mutable and not necessarily authoritative. |
| **Official docs/source** | Protocol specification, official package source/metadata, or provider documentation. Authoritative only for its named boundary/version. |
| **Live unpaid** | Fresh request without payment credentials/signature. Proves only the observed HTTP response/challenge. |
| **Inference** | Architectural conclusion from evidence; never a claim about unavailable private implementation. |

## Observable architecture map

```text
Provider endpoint
  -> HTTP 402 + x402/Bazaar declaration (when implemented)
  -> CDP facilitator verification + first successful settlement
  -> Bazaar indexing
  -> Agentic Market ingestion/enrichment [private mechanism unknown]
  -> service grouping + endpoint catalog projection
  -> search/filter/sort/leaderboard UI
  -> buyer calls provider endpoint directly
  -> provider/facilitator returns response/payment evidence [not exposed per-call by catalog]
```

The Seller Tools flow publicly describes: configure method/path/description/price/network/payee → declare input/output JSON Schema in the x402 v2 Bazaar extension → deploy HTTPS → validate → complete the first successful CDP-facilitated payment → become eligible for Bazaar appearance. There is no observed Agentic Market publisher account or explicit publish mutation. Sources: [Seller Tools](https://agentic.market/validate), [setup](https://agentic.market/validate/setup/endpoint), [metadata](https://agentic.market/validate/metadata), [prompt](https://agentic.market/validate/prompt), [deploy](https://agentic.market/validate/deploy), [launch](https://agentic.market/validate/launch), [official Bazaar docs](https://docs.cdp.coinbase.com/x402/bazaar).

**Inference:** Agentic Market ingests and enriches Bazaar/other endpoint observations into a separate display catalog. Crawler schedule, deduplication, curation, storage, and anti-fraud behavior are not public.

## Reconstructed public domain model

```text
ServiceProjection
  id, name, description, domain
  provider, providerUrl
  category, networks[], tags[]
  integrationType, enriched, isNew
  priceSummary
  endpoints[]

EndpointProjection
  url, method, description
  providerName, serviceName, tags[]
  parameters[]
  pricing
  quality

ParameterProjection
  group, name, type, description
  example, enumValues, default, required

PricingHint
  amount, currency, network, scheme
  minAmount, maxAmount

QualityHint
  l30DaysTotalCalls
  l30DaysUniquePayers
```

Fresh `GET https://api.agentic.market/v1/services` returned `{ limit, offset, total, services }`, with `total: 2011`. The first public response contained the fields above. It exposed no public `version`, `revision`, `status`, `withdrawnAt`, effect, recovery, invocation receipt, input/output schema, OpenAPI URL, or provider authorization proof.

A service is not reliably a provider or operation identity. Some service pages group endpoints from materially different gateways/providers. AE must preserve exact endpoint/descriptor material rather than adopting the display grouping as its canonical identity.

## Public API and UX inventory

| Surface | Observation | Evidence class |
|---|---|---|
| `GET https://api.agentic.market/v1/services?limit=&offset=` | Paginated service projections. Live total 2011. | Public source + live unpaid |
| `GET https://api.agentic.market/v1/services/{id}` | Direct service detail using the same general projection. | Public source + live unpaid |
| `GET https://api.agentic.market/v1/services/search?q=` | Legacy documented search. Worked, but returned an incomplete Exa projection compared with direct detail. | Public source + live unpaid |
| `GET https://api.agentic.market/v1/search/services?q=&limit=&offset=` | Route used by the deployed website bundle. | Public deployed source |
| [Homepage](https://agentic.market/) | Search, Services/Endpoints/Bundles, category/network/verified filters, featured sorting, leaderboard, mutable transaction/volume counters. | Public source |
| `/services/{id}` | Human profile with grouped routes, prices, examples, network and provider/domain links. | Public source |
| [SKILL.md](https://agentic.market/SKILL.md) | Machine instructions and older API examples. Claims no accounts/API keys/rate limits and that every listed service is callable. | Catalog prose only |
| Seller Tools `/validate/*` | Endpoint/Bazaar declaration and launch guidance. | Public source |
| Public backend/source repository | No official backend/catalog repository found in public GitHub search. | Search absence, not proof of nonexistence |

The deployed UI derives an apparent volume from call count × average price and marks an endpoint active when `lastCalledAt` is recent. Public API records expose quality call/payer counts, `enriched`, `integrationType`, and `isNew`; the site exposes Featured/Top and a Verified filter. No public definition establishes Verified, enrichment, integration type, anti-fraud, rank tie-breaks, or whether quality represents verified settlements.

## Publication, readiness, revision, and withdrawal lifecycle

### Observable

1. Provider deploys a payable HTTPS endpoint.
2. Endpoint returns an x402 v2 `402 Payment Required` with Bazaar declaration.
3. Seller validates method, route, price, network/payee and declared schemas.
4. A CDP-facilitated payment successfully verifies and settles.
5. Bazaar indexes the route; Agentic Market later projects it.
6. Mutable traffic, price, network, enrichment, and UI ranking signals may appear.

Official Bazaar documentation states indexing follows successful settlement, not verification alone, and catalog behavior is facilitator-defined. A declaration or catalog row therefore does not prove current callability.

### Not observable

- provider ownership/authorization and payout identity verification;
- descriptor/service/operation version semantics;
- update and supersession history;
- withdrawal, deletion, stale TTL, or tombstone behavior;
- readiness probe cadence or failure thresholds;
- schema compatibility enforcement after publication;
- payment failure/refund/non-2xx semantics;
- whether a catalog entry remains callable now.

AE must retain its own revisioned publication, withdrawal, readiness, and qualification state rather than inferring these from `enriched`, `isNew`, quality counters, ranking, or the presence of a row.

## Discovery and trust model

Observable discovery inputs include service prose, endpoint URL/method, parameters, category/tags, networks, price summary, recent call/payer counts, `enriched`, `integrationType`, and `isNew`. The website provides search, client-side filters, featured/top views, and leaderboards.

These support candidate discovery only:

- a call count is not a successful or correct result;
- a payer count is not provider identity or customer satisfaction;
- ranking is not readiness, authorization, quality certification, or AE endorsement;
- catalog price/payee/network values are mutable hints until checked against a pinned descriptor and live challenge;
- a 402 challenge proves a payment boundary responded, not that payment, settlement, output, or fulfilment works.

## Invocation sequence

```text
1. Discover candidate from catalog/Bazaar.
2. Fetch/pin authoritative provider descriptor/schema where available.
3. Send unsigned request to exact registered resource.
4. Receive and decode PaymentRequired.
5. Validate version, scheme, network, asset, payee, atomic amount,
   timeout, full resource/query, Bazaar schema, and AE ceiling.
6. Confirm caller authority and reserve/authorize spend.
7. Use official x402 client/signer to create PAYMENT-SIGNATURE.
8. Retry exact request once.
9. Validate HTTP/provider output and PAYMENT-RESPONSE/receipt separately.
10. Persist unknown/possibly-submitted outcome for reconciliation before retry.
```

Official x402 libraries standardize decoding/encoding the v2 payment messages and creating the signature/retry in steps 4 and 7–8. AE must still perform step 5's registered-resource, protocol, recipient, atomic-amount, schema, and ceiling checks; step 6's authority/ledger decision; and all admission, output validation, persistence, reconciliation, and public projection. The library never authorizes the call.

## Representative service-shape matrix

All live requests below stopped before payment and prove no provider output or settlement.

| Service / operation | Source / live route | Shape | Commercial/transport observation | Contradiction or limit |
|---|---|---|---|---|
| Exa `/search` | [catalog detail](https://api.agentic.market/v1/services/api-exa-ai); [route](https://api.exa.ai/search) | POST JSON; advertised search results | Catalog $0.007 USDC; live x402 v2 Base/Solana amount `7000` atomic | One Exa row only; official Exa report owns details; no output observed here. |
| Venice chat via Claude group | [catalog detail](https://api.agentic.market/v1/services/docs-anthropic-com); [route](https://api.venice.ai/api/v1/chat/completions) | POST OpenAI-style JSON | Catalog dynamic `upto` $0.001–$10; live 402 Base/Solana amount `10000`, sign-in-with-x extension | Catalog service grouping is not provider identity; no output observed. |
| Tripadvisor location search | [route](https://tripadvisor.x402.paysponge.com/api/v1/location/search?searchQuery=Melbourne) | GET query | Catalog exact $0.01 Base; live x402 v2 Base/Solana `10000` | Live challenge resource omitted the submitted query; AE must reject resource/query mismatch. |
| The Graph subgraph query | [route template](https://gateway.thegraph.com/api/x402/subgraphs/id/0000000000000000000000000000000000000000000000000000000000000000) | POST GraphQL | Catalog `upto`, blank amount; live x402 v2 Base `10000` | Challenge resource rewrote host; placeholder subgraph, no output schema or result observed. |
| Deepgram `/v1/speak` | [route](https://deepgram.x402.paysponge.com/v1/speak) | POST JSON; advertised audio | Catalog dynamic `upto` $0.01; live Base/Solana `10000` | Non-JSON output; no audio observed. |
| Alchemy JSON-RPC | [official agents docs](https://www.alchemy.com/docs/alchemy-for-agents); [route](https://x402.alchemy.com/base-mainnet/v2) | POST JSON-RPC, multi-method | Catalog blank price; live route says $0.001 and challenge `1000`; SIWE/SIWS documented | Blank is not free; no paid output was observed; a deterministic response is a proposed test, not evidence. |
| Parallel `/api/task` | [route](https://parallelmpp.dev/api/task) | POST research task | Catalog exact $0.30; live x402 v2 `300000` plus MPP challenge | Long-running/task semantics and output unknown. |
| Tavily `/search` | [route](https://x402.tavily.com/search) | POST JSON | Catalog exact $0.01/Base; live x402 `agent-pay`, `aws:base`, USD 0.008 quote token | Material protocol/network/price contradiction; catalog cannot authorize payment. |
| CoinGecko pools search | [route](https://pro-api.coingecko.com/api/v3/x402/onchain/search/pools?query=weth&network=eth&page=1&include=base_token) | GET query | Catalog exact $0.01; live Base/Solana `10000` | Structured output not observed. |
| Heurist Yahoo Finance quote | [route](https://mesh.heurist.xyz/x402/agents/YahooFinanceAgent/quote_snapshot) | POST JSON; challenge advertises structured market data | Catalog method/params empty, $0.002; live x402 **v1**, `X-PAYMENT`, amount `2000`, embedded input/output schema | Strong v1/v2 and descriptor contradiction; no quote output observed; reject silent compatibility. |
| Messari networks | [route](https://api.messari.io/metrics/v2/networks/) | GET | Catalog advertises amount `0` | Live request returned 403 invalid auth; advertised free is unavailable. |
| Bankr models | [route](https://llm.bankr.bot/v1/models) | GET | Catalog amount blank | Live request returned 401 API key required; unpriced is not free. |

Coverage: GET/query and POST/JSON; GraphQL, JSON-RPC, audio, search, chat, research task and structured financial data; single and multi-operation services; fixed, dynamic, blank and advertised-free terms; Base, Solana, CAIP and `aws:base`; x402 v1/v2, MPP and agent-pay; wallet sign-in and API-key contradictions.

## Contradiction register

1. `SKILL.md` documents `/v1/services/search`; deployed UI calls `/v1/search/services`. The legacy route worked but projected incomplete detail.
2. Homepage/API/service counts differed during the same snapshot; counts are mutable observations.
3. Query parameters such as category/network/sort appeared ignored by `/v1/services`; the UI may filter client-side.
4. Catalog flat parameters can disagree with authoritative/live schemas about requiredness.
5. Catalog blank, fixed, or Base-only terms conflicted with live Alchemy, Tavily, Graph, Heurist, and multi-network challenges.
6. Heurist exposed x402 v1 while much of the market and official libraries use v2.
7. Tripadvisor challenge omitted the query from resource identity; Graph rewrote the resource host.
8. Messari's advertised-free route returned 403; Bankr's unpriced route required an API key.
9. “No rate limits,” “every service callable,” and generic FAQ claims lack executable proof.
10. No public version, withdrawal, readiness, provider-authorization, effect, recovery, or receipt semantics were found.

## Existing standards and libraries

| Boundary | Use | Version/source observed | License / caveat |
|---|---|---|---|
| x402 core/payment HTTP | `PaymentRequired`, `PaymentPayload`, settlement response, payment headers | `@x402/core`, `@x402/fetch`, `@x402/extensions` 2.20.0; [source](https://github.com/x402-foundation/x402) | Apache-2.0; v1→v2 headers/network IDs are breaking. |
| Bazaar declarations | HTTP/MCP discovery schema, validation, facilitator catalog | `declareDiscoveryExtension`, `bazaarResourceServerExtension`, `withBazaar`; [spec](https://github.com/x402-foundation/x402/blob/main/specs/extensions/bazaar.md) | Facilitator-defined indexing; declaration is not publication/readiness proof. |
| x402 receipts | Signed offer/receipt extension | [Official offer/receipt docs](https://docs.x402.org/extensions/offer-receipt) | Provider receipt is not an AE customer completion receipt. |
| OpenAPI | HTTP interface and JSON Schema | OAS 3.1.2; `@openapitools/openapi-generator-cli` 2.40.1 | Apache-2.0 tool; no payment/authority semantics. |
| MCP | tool schema/list/call and transports | `@modelcontextprotocol/sdk` 1.30.0; official Registry `server.json`/OpenAPI | SDK MIT; Registry preview and license transition. |
| A2A | Agent Card, skills, messages/tasks/artifacts | A2A 1.0; `@a2a-js/sdk` 1.0.1 | Apache-2.0; no A2A card observed in Agentic Market. |

Do not hand-roll x402 header/base64/payment schemas/signing, Bazaar declarations, OpenAPI clients, MCP JSON-RPC, or A2A task/card mapping. No cited standard owns AE's provider authorization, stable registered operation identity, deterministic schema/effect policy, mandate/grant, money ledger, durable journal, replay, reconciliation, or customer-safe projection.

## Agentic Market ↔ AE seam comparison

| Concern | Agentic Market observable | Existing AE owner | Decision |
|---|---|---|---|
| Provider/service identity | Display provider/domain/service grouping | `capability-supply` offering/binding + business provenance | Adapt as advisory provenance; never canonical identity. |
| Operation identity | Endpoint URL/method, often incomplete | `published-operation.ts::materializePublishedOperation` material digest | Keep exact admitted operation material. |
| Contract/schema | Flat parameter hints, usually no output schema | `capability-contract/public.ts`, durable contract registry | Require pinned provider schema; refuse catalog-only executable import. |
| Publication/revision | Row/index presence; no version history | publication publish/refresh/withdraw lifecycle | AE remains authoritative. |
| Readiness | Traffic/quality/enrichment hints | readiness probes + validity and qualification | Hints may prioritize probes, never establish eligibility. |
| Discovery/ranking | Search, tags, price/traffic, Featured/Top | routeable capability graph and exact eligibility | External ranking is candidate input only. |
| Pricing/payment | Decimal/blank/fixed/upto hints | exact price/transport challenge + mandate/ledger | Live pinned challenge and AE policy control spend. |
| Invocation | Buyer calls endpoint directly | registered `http-json`, `mcp-jsonrpc`, `x402-fetch` runtime | Use official clients inside the existing adapter seam. |
| Authority | Not visible | Customer Request, RouteMandate, step grant | Never delegate to marketplace/model. |
| Evidence/receipt | Aggregate quality; no catalog per-call receipt | route transport observation, audit, reconciliation/readback | Link provider evidence to exact AE attempt; preserve unknown outcomes. |
| Human catalog | Service merchandising | business offering/public API projection | Do not project third-party indexed supply as provider-authored business claims. |

Highest current AE drift risk: `convex/capabilitySupply.ts::publishOwnerCapability` still hardcodes a demo quote contract instead of routing a generic imported descriptor through the canonical normalize → admit → publish seam. Fix that seam rather than creating an Agentic Market registry module or promoting descriptive catalog access paths into executable authority.

## Adopt / adapt / improve / reject

### Adopt

- Official x402 v2 types, HTTP clients, scheme packages, Bazaar helpers, and optional signed offer/receipt extension.
- OpenAPI 3.1, MCP SDK/Registry, and A2A SDK only where the provider publishes those formats.
- Exact public source URL, source digest, and evidence class.

### Adapt

- Service grouping, tags, categories, networks, price/quality hints as a non-authoritative candidate projection.
- Bazaar input/output declarations into the existing AE contract importer after strict validation.
- Traffic/recency hints only to order bounded readiness probes.

### Improve

- Authenticated provider/business provenance and commercial relationship.
- Immutable operation/material identity and schema digests.
- Explicit compatible/incompatible revisions, supersession, withdrawal and stale TTL.
- Effects, recipients, data purpose, evidence, recovery/cancellation and authority mode.
- Exact atomic money, aggregate ceilings, ledger authorization and ambiguous-settlement reconciliation.
- Customer-safe route preview and durable receipt/readback without overstating fulfilment.

### Reject

- Catalog prose/FAQ as executable truth.
- Marketplace service IDs or names as stable provider/operation identity.
- Rankings, call/payer counts, Verified/enriched flags as authority, readiness, fulfilment, or endorsement.
- Blank/decimal/`upto` price hints as payment authorization.
- Arbitrary model-selected URLs, methods, payees, schemas, transformations, or protocol versions.
- Compatibility shims that silently mix x402 v1/v2.
- A second registry, lifecycle, transport runtime, or marketplace-specific execution branch.

## Second-provider shortlist for #206

**2026-08-03 #206 feasibility update:** #206 requires a stable production-callable path with no x402/MPP payment. The original marketplace-derived shortlist below therefore cannot supply the selected provider: every viable row requires x402/MPP, unavailable credentials, unverified terms, or an unsupported transport. A fresh official-source screen added Frankfurter because it preserves the heterogeneous public-provider test while satisfying that stricter downstream constraint.

| Candidate | Dimensions proved beyond Exa | Contract/client and license evidence | Credential/provisioning path | Cost, readiness, and hosted feasibility | Decision |
|---|---|---|---|---|---|
| **Frankfurter v2 latest single-pair rates** | GET/query parameters instead of Exa POST/JSON; one operation with deterministic singleton-array output; keyless ordinary HTTPS; no payment/retry handshake | [Official v2 docs](https://frankfurter.dev/), [official source](https://github.com/lineofflight/frankfurter) (MIT), and [ECB reuse terms](https://www.ecb.europa.eu/services/disclaimer/html/index.en.html#c) for the pinned ECB source | Public `api.frankfurter.dev` requires no API key. Exact operation: `GET /v2/rates?providers=ECB&base={base}&quotes={quote}`. | Provider says free for commercial use, no quotas, abuse rate limiting only. Fresh query-form read returned HTTP 200 singleton-array JSON for EUR/USD after an initial bounded timeout; malformed path-form currency returned documented HTTP 422 JSON and query-form refusal remains #203 proof. Platform cost $0; bound at 10 s and 4 KiB. | **Selected by #206**: production-callable now, no x402/MPP/custody, materially heterogeneous, and directly expressible through existing generic HTTP GET query mappings without provider engine/kernel fields. |
| **Alchemy JSON-RPC** | Multi-operation JSON-RPC, exact method allowlisting, wallet sign-in, deterministic chain-state response shape | [Alchemy agents docs](https://www.alchemy.com/docs/alchemy-for-agents) plus official x402 packages (Apache-2.0). Provider API/content licensing and republication terms remain unverified. | Public docs advertise wallet SIWE/SIWS and x402 without an Alchemy API key. AE would still need an approved low-balance signer, money authorization, and exact method/chain binding. | Live unpaid 402 observed at $0.001. The existing `x402-fetch:v2` transport makes a hosted call technically plausible only after #199's hosted runtime/configuration and AE's first-dollar/custody gates pass; no paid output was observed. | **Recommended first**: cheapest materially different contract. Refuse broad JSON-RPC or catalog-group execution. |
| **Timezone Converter** | GET/query identity, required query schema, full-resource matching, deterministic scalar/JSON canary | Live Bazaar Draft-2020-12 declaration and official x402 packages (Apache-2.0). Endpoint implementation/license and provider content terms are unverified. | No provider account/API key advertised; requires an x402 wallet signature. AE must pin the exact query and payee from the challenge. | Live unpaid 402 at $0.001 with the strongest observed schema declaration. Hosted feasibility is high after the same #199/custody/money gates; no paid output observed. | Safest fallback canary; proves less marketplace breadth than Alchemy. |
| **Heurist Yahoo Finance** | Structured financial schema plus an explicit x402 v1 incompatibility boundary | Public challenge embedded schema; official historical x402 semantics. Provider/output licensing and market-data reuse terms are unverified. | Wallet payment via v1 `X-PAYMENT`; no provider API key observed. | Live unpaid 402 at $0.002. Current AE adapter is v2, so hosted execution is **not feasible without a separately approved v1 adapter**; do not add a silent shim. | Retain as compatibility-negative, not the production second provider. |
| **Deepgram Speak** | Binary/audio output validation, content-type/evidence handling, dynamic ceiling | Provider public route/challenge plus official x402 libraries; provider audio/API terms and generated-content licensing require legal review. | Wallet x402 path observed; any separate Deepgram account/key path was not verified for this route. | Live unpaid 402 up to $0.01. Hosted feasibility is low until AE has a bounded binary-output contract and storage/redaction policy. | Defer. |
| **The Graph** | GraphQL request, path-selected resource, schema pinning, resource-host integrity | GraphQL/provider documentation and official x402 libraries; subgraph-specific license/data terms must be checked. | Wallet x402 challenge; a real approved subgraph ID/schema is still required. | Live unpaid 402 at $0.01, but the resource host rewrote and no real subgraph output was observed. Hosted call is not ready. | Defer until exact host/subgraph/schema agreement. |
| **Tavily** | Quote-token pricing and a nonstandard `agent-pay`/`aws:base` commercial path | Only the observed provider quote/challenge; no admitted AE client/protocol or verified licensing terms. | Ephemeral quote token and agent-pay provisioning are not integrated or approved. | Live unpaid quote at $0.008. Not hosted-call feasible through AE's current registered adapters. | Reject for this slice unless that protocol is independently standardized and admitted. |

The final selection is **Frankfurter v2 latest single-pair rates**, not Alchemy. Alchemy remains the broader future JSON-RPC conformance candidate, but it fails #206's no-x402/MPP and presently reachable legal/provisioning gates. Frankfurter is the boring executable choice: keyless HTTPS, zero platform cost, explicit commercial-use statement, MIT server source, attributable ECB data, deterministic bounded JSON, and fresh success/timeout observations plus a documented invalid-currency refusal.

## Evidence ceiling and unresolved questions

Established:

- public service/endpoint projection shape and API/UX inventory;
- heterogeneous protocol, method, schema, output and commercial shapes;
- multiple live unpaid 402/auth/failure observations;
- catalog/live contradictions;
- official reusable standards/libraries and AE-owned gaps;
- exact comparison to AE's existing authoritative seams.

Not established:

- any paid invocation, settlement, provider output, receipt, refund, retry, or fulfilment;
- private Agentic Market implementation or operator controls;
- provider ownership, Verified criteria, ranking integrity, anti-fraud, update/withdrawal behavior, or readiness SLA;
- legal right to republish individual provider content beyond source-linked factual metadata;
- hosted AE import/invocation/customer journey.

## Primary sources

- [Agentic Market](https://agentic.market/)
- [Agentic Market public API](https://api.agentic.market/v1/services)
- [Agentic Market machine instructions](https://agentic.market/SKILL.md)
- [Agentic Market Seller Tools](https://agentic.market/validate)
- [x402 Bazaar](https://docs.cdp.coinbase.com/x402/bazaar)
- [x402 source/specification](https://github.com/x402-foundation/x402)
- [x402 offer/receipt extension](https://docs.x402.org/extensions/offer-receipt)
- [OpenAPI 3.1.2](https://spec.openapis.org/oas/v3.1.2.html)
- [MCP tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP Registry](https://modelcontextprotocol.io/registry/about)
- [A2A 1.0 specification](https://a2a-protocol.org/v1.0.0/specification/)
- [Alchemy for agents](https://www.alchemy.com/docs/alchemy-for-agents)
- Existing AE companion research: `2026-08-02-agentic-market-executable-capability-evaluation.md`, `2026-08-03-agentic-market-exa-source-port.md`, and `2026-08-03-official-exa-x402-contracts.md`.

# Official Exa API and x402 contracts

**Date:** 2026-08-03  
**Research ticket:** [#198 — Pin the official Exa API and x402 reference contracts](https://github.com/CreasyBear/Agentic-Economy/issues/198)  
**Evidence class:** Official source/docs plus fresh unpaid challenge and invalid-key observations. No signing, payment, settlement, or provider-changing call was made.

## Decision

Use two explicit, noninterchangeable Exa execution modes:

- **API-key mode:** official `exa-js` client and official OpenAPI contract.
- **x402 mode:** direct `/search` or `/contents` request using one coordinated official `@x402/*` package release behind AE's authority, custody, ledger, and reconciliation seams.

Never combine API-key/Bearer credentials with x402 on one request. Exa documents API-key auth as bypassing x402. Never interpret Exa's MPP `WWW-Authenticate: Payment` challenge as x402.

## Pinned sources and versions

| Surface | Pinned source/fact | Adoption rule |
|---|---|---|
| Exa API | [OpenAPI 3.1 / API version 2.0.0](https://exa.ai/docs/exa-spec.yaml), server `https://api.exa.ai` | Generate/validate from the official contract; do not maintain a competing handwritten provider schema |
| JavaScript SDK | [`exa-js` 2.16.3](https://github.com/exa-labs/exa-js), MIT | API-key path and shape reference; not an x402 payer |
| Python SDK | [`exa-py` 2.16.2](https://github.com/exa-labs/exa-py), MIT, Python >=3.9 | Reference only for Python/API-key semantics |
| x402 | [`x402-foundation/x402`](https://github.com/x402-foundation/x402), inspected packages 2.20.0, Apache-2.0 | Pin one coordinated package set; AE currently has 2.18.0 and must resolve the version drift before implementation |
| Buyer flow | [CDP x402 buyer quickstart](https://docs.cdp.coinbase.com/x402/quickstart-for-buyers) | Use official wrapper/client behavior for challenge parsing, payload construction, signing, and paid retry |
| Discovery | [CDP Bazaar](https://docs.cdp.coinbase.com/x402/bazaar), [endpoint validation](https://docs.cdp.coinbase.com/x402/validate-endpoint) | Candidate discovery and read-only readiness only; never authority or payment proof |

## `POST /search`

### Request

- `query`: required nonempty string; the only required `SearchRequest` field.
- `numResults`: OpenAPI minimum 1, maximum 100, default 10. The x402 path separately caps at 10 and silently clamps larger requests.
- Current modes: `instant`, `fast`, `auto`, `deep-lite`, `deep`, `deep-reasoning`; `auto` is default.
- `includeDomains` and `excludeDomains`: at most 1,200 entries; values may be hosts, path prefixes, or wildcard subdomains.
- Published-date filters are ISO-8601 date-times. Crawl-date fields are deprecated and ignored.
- `additionalQueries`: OpenAPI permits 1–10, while current SDK comments say maximum 5. Use the stricter maximum 5 until the provider resolves the contradiction.
- `userLocation`: two-letter ISO country code.
- `contents`: text, highlights, summary, extras, freshness, and subpages. Make selection explicit for paid execution rather than inheriting SDK defaults.
- `outputSchema`: root `text` or `object`; synthesized output remains untrusted and must be validated.

### Response

`SearchResponse` always has `results`; it may include `requestId`, `costDollars`, deprecated context/type fields, and synthesized `output`. Preserve URL, title, provider document ID, and citation provenance. Exa document IDs are temporary request targets, not durable AE capability/provider identities.

## `POST /contents`

### Request

- Exactly one of `ids` or `urls` (`oneOf`), each with 1–100 nonempty strings, each at most 2,048 characters.
- Text/highlights `maxCharacters`: 1–10,000.
- Text verbosity: `compact`, `standard`, or `full`.
- `summary` may include a query and JSON schema and is separately billable.
- Extras counters: 0–1,000; `subpages`: 0–100; `maxAgeHours`: -1–720 (`0` fresh, `-1` cache-only).
- `livecrawl`, `numSentences`, and `highlightsPerUrl` are deprecated/ignored compatibility fields.

### Response

`ContentsResponse` includes `results` and may include `requestId`, `statuses`, `costDollars`, and deprecated context. HTTP 200 does not imply every target succeeded. Inspect each status (`success|error`), source (`cached|crawled`), and error tag/status. Partial retrieval must not become complete evidence.

## Auth and error semantics

- OpenAPI accepts `x-api-key` or `Authorization: Bearer <key>`.
- Official JS/Python clients set `x-api-key`; secrets remain server-side and outside model/public state.
- Fresh unauthenticated requests returned HTTP 402 with payment challenges.
- Fresh invalid API-key and invalid Bearer requests returned HTTP 401 with `INVALID_API_KEY`.
- In API-key mode, HTTP 402 can mean exhausted credits or account/team key budget. Never convert that response into an x402 attempt on the same request.
- Preserve provider status, tag, and request ID internally. Do not expose raw provider bodies or credentials publicly.
- Official SDKs make one request and surface errors. Any retry is AE-owned, bounded, status-aware, and limited to safe transient 429/5xx cases.

## Pricing and limits

These are current documentation facts, not values to hardcode as payment authority.

| Path | Current documented price/limit |
|---|---|
| API-key standard search | $0.007/request up to 10 results; extra-result and content charges apply |
| Deep-lite/deep search | $0.012 |
| Deep-reasoning search | $0.015 |
| Contents | $0.001 per URL/page per requested content type |
| API-key QPS | `/search` 10 QPS; `/contents` 100 QPS; `/answer` 10 QPS |
| x402 search | Current examples: 7,000/12,000/15,000 atomic USDC by mode; maximum 10 results |
| x402 discovery | 5 unpaid requests per IP per 60 seconds |
| x402 paid | 10 requests per wallet per second |

Use a fresh `PAYMENT-REQUIRED` challenge for exact amount, recipient, network, asset, and timeout. `costDollars` is post-response evidence, not spend authority.

## x402 v2 contract

Official `PaymentRequired` contains:

- `x402Version`;
- required `resource.url` plus optional resource description/metadata;
- nonempty `accepts` entries containing `scheme`, CAIP-2 `network`, `asset`, atomic-unit string `amount`, `payTo`, `maxTimeoutSeconds`, and `extra`;
- optional extensions.

### Required AE validation before signing

1. Decode and schema-validate `PAYMENT-REQUIRED` using official x402 HTTP/core primitives.
2. Require the expected version, supported scheme/network, syntactically valid asset/recipient, bounded timeout, and amount within the exact route-step ceiling.
3. Match `resource.url` to the intended Exa endpoint.
4. Bind the challenge to AE's request body digest; x402 core binds the resource URL but not the Exa query body.
5. Select and sign the exact advertised accept entry—never reconstruct it from a price table.
6. Preserve server-advertised extension information through official helpers.
7. Persist authorization before submission and treat post-signature timeout/failure as outcome-unknown pending reconciliation.

The official facilitator—not AE code—must verify signature, balance, exact amount, time window, parameter matching, and transaction simulation before settlement.

### Current Exa x402 parity

- Supported endpoints: only `/search` and `/contents`.
- Current Base entry: `eip155:8453`, USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Current Solana entry: `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp`, USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
- Payment request header: `PAYMENT-SIGNATURE` (legacy `x-payment` exists).
- Challenge header: `PAYMENT-REQUIRED`.
- Settlement response header: `PAYMENT-RESPONSE`.
- Exa says settlement begins in parallel with processing and results are withheld until settlement confirms. Failed settlement returns 402 with payment evidence and no result.

A receipt proves only its named settlement fact; it does not prove that Exa output is correct or that customer work succeeded.

## MPP is a distinct protocol

Fresh unauthenticated Exa responses contained both:

- x402 `PAYMENT-REQUIRED`; and
- MPP `WWW-Authenticate: Payment`.

[Exa's MPP guide](https://exa.ai/docs/reference/mpp-guide) uses Tempo `eip155:4217`, `Authorization: Payment`, `Payment-Receipt`, and `mppx`. Classify by header/protocol and select exactly one client. MPP is outside this x402 parity scope.

## Bazaar boundary

Bazaar is candidate discovery. It indexes declared route metadata and traffic/liveness-derived signals. Ranking and metadata can change, and fresh settlement may take hours to affect results. The unauthenticated `POST /platform/v2/x402/validate` preflight probes readiness without payment or indexing.

AE must always re-fetch the selected endpoint's live challenge and validate resource, scheme, network, asset, recipient, amount, timeout, and request digest. Bazaar prose, ranking, `skillUrl`, curation, liveness, or price hints cannot grant authority or release funds.

## No-handroll boundary

Use official primitives for:

- payment-header parsing/encoding;
- `PaymentRequired`/`PaymentPayload` schemas;
- EIP-712 or SPL signing;
- scheme/network selection;
- extension echo/merge;
- settlement-response decoding;
- 402 paid retry;
- Bazaar metadata validation;
- Exa API-key request/result mapping.

AE owns only caller/mandate authority, exact route and request binding, credential custody, admission, spend ceilings, durable journal/ledger, reconciliation, redaction, and customer-visible outcome classification.

## Licensing and content

- Exa SDKs: MIT. Preserve notices when copying/redistributing source.
- x402 packages: Apache-2.0. Preserve license/notices and mark material source modifications.
- Exa API terms grant a revocable API-use right subject to documentation, usage, and call-volume limits.
- Third-party content rights remain with their owners. Preserve URLs, titles, IDs, citations, and proprietary notices; review rights before redistributing retrieved text.
- Reviewed Exa sources prescribe no single mandatory visible attribution string. Do not invent one.

Primary legal source: [Exa Terms of Service](https://exa.ai/assets/Exa_Labs_Terms_of_Service.pdf).

## Acceptance checklist

- Pin OpenAPI/API version and one coherent x402 package release.
- Publish only `/search` and `/contents` as Exa x402 capabilities.
- Keep API-key, x402, and MPP authentication/payment modes distinct.
- Require a fresh x402 challenge and exact AE validation before signing.
- Enforce separate API-key and x402 throughput limits.
- Inspect every `/contents` item status.
- Preserve citation/provenance and required source-license notices.
- Treat Bazaar as advisory discovery.
- Reconcile any possible-payment unknown before retry.

## Evidence ceiling

This research established official source/documentation contracts and fresh unpaid challenge behavior. It did not prove wallet custody, signature acceptance, facilitator verification, settlement, paid Exa result delivery, hosted AE execution, or customer-visible recovery.

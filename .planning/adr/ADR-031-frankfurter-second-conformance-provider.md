---
# ADR-031: Frankfurter v2 as the second conformance provider
Status: Accepted
Date: 2026-08-03
Depends on: ADR-028, ADR-029, ADR-030
Issue: #206

## Decision

Select **Frankfurter v2 latest single-pair rates**, exact operation:

```http
GET https://api.frankfurter.dev/v2/rates?providers=ECB&base={base}&quotes={quote}
Accept: application/json
```

Initial hosted conformance input is `{ "base": "EUR", "quote": "USD" }`; the contract permits only uppercase ISO 4217 codes from a bounded admitted currency set and pins `providers=ECB` in the registered endpoint/config, not model input.

Frankfurter accompanies Exa because it is callable now without x402, MPP, an account, a credential, custody, or platform spend. It is materially heterogeneous: GET/query input, keyless ordinary HTTPS, one idempotent read operation, deterministic singleton-array JSON, no payment handshake, and no multi-operation search/content topology.

Alchemy JSON-RPC is rejected for this slice. Its reachable candidate requires x402 and unresolved legal/provisioning gates, violating #206's explicit no-x402/MPP and current-readiness requirements.

## Official contract and no-handroll primitive

- Official v2 documentation and examples: https://frankfurter.dev/
- Public API: https://api.frankfurter.dev/
- Official source: https://github.com/lineofflight/frankfurter (MIT)
- Server implementation license: https://github.com/lineofflight/frankfurter/blob/main/LICENSE
- ECB source reuse terms: https://www.ecb.europa.eu/services/disclaimer/html/index.en.html#c

Frankfurter publishes no required official language client because the operation is ordinary HTTP GET. AE uses the platform's standard `fetch` through the existing registered `http-json:v1` adapter and `credentialRef: public:none`. Adding an SDK would be dependency smuggling.

AE-written code owns only the registered strict schema, admitted query mapping, byte/time bounds, output validation, attribution, evidence, and generic outcome mapping. Those are AE contract/safety invariants, not missing provider wire primitives.

## Exact input and output contract

```ts
type FrankfurterSingleRateInput = Readonly<{
  base: Iso4217Code
  quote: Iso4217Code
}>

type FrankfurterSingleRateOutput = readonly [
  Readonly<{
    date: string       // strict YYYY-MM-DD and valid calendar date
    base: Iso4217Code
    quote: Iso4217Code
    rate: number       // finite and > 0
  }>,
]
```

Invariants:

- `base !== quote`;
- both codes are admitted uppercase ISO codes, maximum length 3;
- provider query is exactly `ECB` and not caller/model controlled;
- response is a singleton array whose row `base` and `quote` equal the canonical request;
- the row is strict: no missing required fields; unknown fields refuse until deliberately versioned;
- body is JSON and at most 4 KiB;
- request timeout is 10 seconds; redirects are bounded to the registered HTTPS origin policy;
- no response is treated as financial advice, conversion execution, quote guarantee, or current tradable price.

The Operation version is AE contract version 1 over Frankfurter API v2. A provider API version, endpoint/query schema, output schema, attribution, or semantic change requires source refresh under ADR-029; incompatible changes produce a new contract/publication revision.

## Authentication and provisioning

The official public endpoint requires no API key. No secret or hosted environment variable is needed. The existing `http-json:v1` adapter explicitly supports the public credential reference.

This is a keyless public-data Provider path, not authenticated provider-owned publication. AE publishes it as `ae_curated_external` with source-linked Frankfurter and ECB attribution. Neither Frankfurter nor ECB is represented as having registered, endorsed, or fulfilled work for AE.

## Cost and rate/size policy

Frankfurter states:

- free for commercial use;
- no monthly or daily quota;
- abuse rate limiting applies;
- high-volume callers should cache, self-host, or query datasets directly.

Platform-funded provider cost is exactly zero. AE still bounds internal cost and abuse:

- one request per invocation;
- no multi-pair or time-series operation in this conformance slice;
- 10-second timeout, 4-KiB response ceiling;
- normal AE admission/rate limits and one in-flight attempt per Action Invocation;
- cache/readiness does not replace fresh execution evidence;
- HTTP 429 maps to provider refusal/temporary unavailability and honors bounded `Retry-After` only through existing scheduling policy.

## Terms, license, and attribution

Frankfurter's server source is MIT. Its official FAQ says the API is free for commercial use and directs users to each underlying provider's terms. This operation pins ECB as the data provider.

ECB permits free use subject to accurate reproduction, citing ECB as source, disclosure that ECB information is freely available when incorporated into sold material, and explicit notice of modifications. AE must project: `Source: European Central Bank via Frankfurter`; preserve the observation date; state any derived calculation; and never present the rate as authentic ECB text, a tradable quote, advice, or warranty.

This decision permits factual single-rate retrieval and customer-safe display with attribution. It does not authorize bulk republication, resale of a rate database, logo use, or financial execution.

## Readiness and hosted feasibility

Readiness probe and execution both use the exact registered GET target with a bounded pair. A healthy readiness observation requires:

- HTTPS 200;
- `application/json`;
- body <= 4 KiB;
- strict singleton-array output schema and request/response currency match;
- `date` not in the future and not older than the latest expected ECB business-day window;
- observed target digest equal to the current Binding/config digest.

ADR-029's five-minute readiness TTL applies. Readiness proves only that the named check passed during the window, not that a later rate will be returned or is tradable.

Fresh observations on 2026-08-03:

- `GET /v2/rates?base=EUR&quotes=USD&providers=ECB` returned HTTP 200 JSON `[{ date: "2026-08-03", base: "EUR", quote: "USD", rate: 1.1535 }]` after one bounded retry; the first 5-second attempt timed out, establishing the required unknown/timeout case;
- `GET /v2/rate/INVALID/USD` returned documented HTTP 422 JSON `{ status: 422, message: "invalid currency: INVALID" }`; #203 must use the exact query-form malformed input and preserve the same generic refusal class.

[INFERENCE] The production Vercel runtime can reach the provider through ordinary outbound HTTPS because the same Node/fetch runtime and `http-json:v1` transport already support external HTTPS. #203 must convert this feasibility into fresh hosted adapter evidence before claiming hosted completion.

## Outcome, refusal, timeout, cancellation, and reconciliation

Positive live result:

```ts
{
  kind: 'succeeded',
  output: { date, base, quote, rate },
  evidence: { provider: 'Frankfurter', dataSource: 'ECB', observedAt }
}
```

Provider-specific negatives preserved by the generic outcome contract:

- malformed/unknown currency: provider HTTP 400/404/422 -> `refused`, `released: true`, stable redacted code `provider_input_rejected`; no automatic retry;
- HTTP 429/5xx before a valid result -> `outcome_unknown` when release occurred, reconcile policy below;
- timeout/network loss after request release -> `outcome_unknown`, never success/failure fabrication;
- non-JSON, oversized, schema-invalid, mismatched currencies, non-finite/non-positive rate, or implausible date -> `outcome_unknown` with redacted output-validation evidence;
- stale/unready Publication or changed Binding -> pre-release refusal with `released: false`.

Cancellation is unsupported after release because GET is expected to complete within the bound and Frankfurter exposes no cancellation API. Before release, queued work cancels locally.

Reconciliation uses the operation's read-only/idempotent semantics: after an unknown result, AE records the first attempt and may issue a new retrieval only as a new reconciled attempt under the existing retry class. The second response is a new observation, not proof of what the first request returned. No duplicated external effect is possible beyond another bounded read, but abuse/rate limits still apply.

## Generic interface fit

No provider-specific field reaches Answer Engine, Agent Engine, Customer Request, compiler, RouteMandate, Workpool, or the neutral transport kernel.

- Admission: generic HTTP/`ae_envelope` -> strict Capability Contract -> catalog Offering ref -> `http-json:v1` Binding -> Publication.
- Discovery: ADR-030 `PublicOperationDescriptor` with ordinary typed input/output, zero price, read-only/no-data-release effect, attribution, freshness, and navigation.
- Planning: opaque operation/contract refs and typed `{base, quote}` only.
- Resolution: ADR-028 neutral tuple; private Binding rehydration after mandate/grant.
- Execution: unchanged `http-json:v1` adapter; registered GET query mappings encode validated `base` and `quote`, while `providers=ECB` is pinned in the admitted endpoint/config.
- Validation/recovery/readback: unchanged generic transport observation, strict output validation, `outcome_unknown`, and reconciliation seams.

No transport deepening is required for this provider: the existing generic HTTP importer and runtime already admit GET query mappings and the public credential reference. #203 must prove this with the exact Binding; it must not add a Frankfurter adapter, branch, or path-template feature.

## Provider-swap acceptance

Replacing Frankfurter with another conforming provider must require only new admitted source/contract/Offering/Binding/Publication records. It must not change:

- Answer Engine or Agent Engine prompts/types;
- Customer Request graph/compiler;
- RoutePlan/RouteMandate/grants;
- Workpool/journal/uncertainty/cancellation machines;
- neutral transport outcome types;
- public registry action schemas except ordinary new contract data.

#203/#204 must prove positive output, malformed refusal, timeout/unknown preservation, current readiness, exact hosted readback, and unchanged engine/kernel code. This ADR records feasibility and choice; it does not claim downstream runnable completion.

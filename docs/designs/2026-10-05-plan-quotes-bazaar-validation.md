# Real CDP Bazaar listings against Plan Quotes

**Observed 2026-10-05.** Read-only study; no payment headers, signatures, or payments. The mock plans below are schema/pricing dry-runs, not executed plans: this study did not verify that the selected listings have current AE publications/toolRefs. Any `toolRef` / Mercator `serviceId` marker is intentionally unresolved, not a fabricated identifier.

## Endpoint, sample, and repository ingestion

CDP's Bazaar discovery guide says discovery is public and documents `listX402DiscoveryResources`; the REST list endpoint is `GET https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources`, with `type`, `limit` (default 100), and `offset` (default 0). Source: [Discover services (Bazaar)](https://docs.cdp.coinbase.com/x402/buyer/discover-services) and [List x402 resources](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/list-x402-resources). The live API reported `pagination.total=34,844`; sampled 10 pages (`type=http&limit=100`, offsets 0–900): **1,000 unique resources**, 1,000 accepted-payment-bearing listings. No paging failure; this is a first-1,000 offset sample, not a random sample or full-catalog census.

Repo source check: `convex/x402DirectoryIndexSource.ts:15-17,72-78` sets page size 100, requests the SDK list at each offset, validates returned offset/limit/total, then projects each item. `convex/lib/market/directoryIndex/ingestion.ts:168-177` stores the exact `item.resource` as `endpointUrl`/`upstreamEndpointId`, provider, optional method, and raw Bazaar JSON. `src/modules/market/x402-directory-projection.ts:150-177` derives provider as URL hostname, gets method from `extensions.bazaar.info.input.method`, and projects declared Bazaar input/output schemas separately from examples. `src/modules/market/x402-directory-projection.ts:34-48` formats `upto` using `maxAmountRequired ?? amount`; other schemes use `amount ?? maxAmountRequired`. Thus `maxAmountRequired` is not a universal fixed-price field.

## Sample measurements

Listing denominator = 1,000; accepts denominator = 2,120. Schema counts mean a schema object was declared under `extensions.bazaar.schema.properties`; “non-empty payload fields” is the stricter count with named output properties under `output.properties.example.properties` (examples are not schema).

| Measure | Result |
|---|---:|
| Input schema object present | 1,000/1,000 = **100.0%** |
| Input schema with at least one body/query/path parameter | 722/1,000 = **72.2%** |
| Output schema object present | 985/1,000 = **98.5%** |
| Output schema with at least one named payload property | 426/1,000 = **42.6%** |
| `info.input.method` + parseable HTTP(S) resource URL with path | 1,000/1,000 = **100.0%** |
| `accepts` rows with `scheme=exact` | 2,063/2,120 = **97.31%** |
| `accepts` rows with `scheme=upto` | 25/2,120 = **1.18%** |
| `accepts` rows with `scheme=batch-settlement` | 30/2,120 = **1.42%** |
| Other schemes (`agent-pay`, `aggr_deferred`) | 2/2,120 = **0.09%** |
| `maxAmountRequired` field present | 116/2,120 = **5.47%** (91 exact, 25 upto) |
| Exact rows with `maxAmountRequired` | 91/2,063 = **4.41%**; the other **1,972 exact rows omit it** |
| Exact rows with a numeric `amount` | 2,049/2,120 = **96.65% of all accepts** |

`scheme=exact` indicates an exact amount for the specific payment requirement; it does **not** prove that a provider returns the same amount for every possible input. The live BlockRun probes below demonstrate this distinction. Most exact listings provide `amount`, not `maxAmountRequired`; the repo projection's `amount` fallback agrees with that observed shape.

**Network split** (accept rows, top 8; all 26 network strings observed):

| Network | Rows |
|---|---:|
| `eip155:8453` | 1,064 (50.19%) |
| `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` | 435 (20.52%) |
| `eip155:137` | 135 (6.37%) |
| `eip155:42161` | 126 (5.94%) |
| `eip155:56` | 85 (4.01%) |
| `eip155:143` | 51 (2.41%) |
| `algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=` | 36 (1.70%) |
| `eip155:196` | 30 (1.42%) |
| Other 18 networks | 158 (7.45%) |

**Asset split** (accept rows, top 8; 44 distinct literal identifiers, preserving source casing):

| Asset identifier | Rows |
|---|---:|
| Base USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` | 1,051 (49.58%) |
| Solana USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 434 (20.47%) |
| `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | 126 (5.94%) |
| `0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359` | 118 (5.57%) |
| `31566704` | 51 (2.41%) |
| `0x754704Bc059F8C67012fEd69BC8A327a5aafb603` | 51 (2.41%) |
| `0xcE24439F2D9C6a2289F741120FE202248B666666` | 20 (0.94%) |
| `0x55d398326f99059fF775485246999027B3197955` | 18 (0.85%) |
| Other 36 literal identifiers | 251 (11.84%) |


## Pricing basis, rate, and rounding

All three plans use listings whose payment requirement is Base USDC (`asset=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`, `network=eip155:8453`), six atomic decimals. For conversion, assume 1 USDC = 1 USD; [ExchangeRate-API public USD latest response](https://open.er-api.com/v6/latest/USD) observed `rates.AUD=1.439269`, last updated **2026-10-05 00:02:31 UTC**. Apply the requested 50 bps: `AUD ceiling = atomicUSDC / 1,000,000 × 1.439269 × 1.005`. For illustration, round each node **up** to 0.000001 AUD (AUD micro-units), then sum node ceilings; never round the aggregate down.

| Plan / node | Atomic USDC | USD at 1:1 | Raw AUD × 1.005 | Per-node ceiling (AUD, micro-rounded up) |
|---|---:|---:|---:|---:|
| P1 resolve ENS | 5,000 | 0.005 | 0.007232326725 | 0.007233 |
| P1 read ERC-20 balance | 3,000 | 0.003 | 0.004339396035 | 0.004340 |
| **P1 total** | **8,000** | **0.008** | — | **0.011573** |
| P2 resolve ENS | 5,000 | 0.005 | 0.007232326725 | 0.007233 |
| P2 read ERC-20 balance | 3,000 | 0.003 | 0.004339396035 | 0.004340 |
| P2 read ERC-20 transfers | 5,000 | 0.005 | 0.007232326725 | 0.007233 |
| **P2 indicative total** | **13,000** | **0.013** | — | **0.018806** |
| P3 resolve ENS | 5,000 | 0.005 | 0.007232326725 | 0.007233 |
| P3 web search (this input's observed 402) | 50,000 | 0.050 | 0.072323267250 | 0.072324 |
| P3 contents, observed 5-URL request | 11,000 | 0.011 | 0.015911118795 | 0.015912 |
| **P3 5-URL illustrative total** | **66,000** | **0.066** | — | **0.095469** |

P1 is a fixed-input illustration; P2 total is hypothetical because the strict per-provider-host count limit would reject it. P3's total is **not a safe approved total**: it assumes exactly the observed 5-URL result bound, but the Bazaar search output schema does not declare an array-size bound, and the contents price is input-dependent. The calculation demonstrates the currency conversion only. A safe P3 ceiling requires a provider-declared finite maximum (or a smaller, strictly enforced input/cardinality cap) before quoting.

## Unpaid 402 observations

Eight plain requests were sent (six across the final plans plus two exploratory tx/receipt candidates); **all returned HTTP 402** with x402Version 2/requirements, and none included `X-PAYMENT` or `PAYMENT-SIGNATURE`. No authorization headers were sent. The two exploratory tx/receipt probes were not retained as final plan nodes. Per final plan, no more than three probes were used; the P3 ENS response was reused from P1 rather than re-probed.

| Probe | Result vs CDP listing |
|---|---|
| OneSource `/api/chain/ens/vitalik.eth?network=ethereum` | 402; exact, Base USDC, `amount=maxAmountRequired=5000`; matches listing. |
| OneSource `/api/chain/erc20-balance?...&network=ethereum` | 402; exact, Base USDC, `amount=maxAmountRequired=3000`; matches listing. |
| OneSource `/api/chain/erc20-transfers?...&from_block=0x133da1e&network=ethereum` | 402; exact, Base USDC, 5,000; matches listing. |
| Kadec `/v1/serp?q=...&num_results=5` | 402; exact, Base USDC, 50,000; matches listing for this query. |
| BlockRun `/api/v1/exa/contents`, body `{"urls":["https://example.com"]}` | 402; exact, Base USDC, 3,000; body quoted USD `0.0030`. Matches listing amount 3,000. |
| Same BlockRun resource, body with 5 example URLs | 402; exact, Base USDC, **11,000**; body quoted USD `0.0110`. Listing still advertises amount 3,000. The endpoint's listing prose says `$0.002/URL`, but the five-URL observed challenge totals `$0.011`; use the actual per-input challenge/declared maximum, not a static listing number. |
| Exploratory OneSource `/api/chain/tx/<example-hash>?network=ethereum` | 402; exact, Base USDC, 8,000; matches listing. Candidate discarded from final plans. |
| Exploratory OneSource `/api/chain/receipt/<example-hash>?network=ethereum` | 402; exact, Base USDC, 5,000; matches listing. Candidate discarded from final plans. |

## Three mock plans from sampled resources

Design contract under test: the Plan Quotes decisions as folded into `docs/designs/2026-10-05-plan-quotes-rfc.md` §1–§9 (FlowPlan/Mercator syntax, refusal union, typed pointers, deferred prices, 50 bps ceilings, and provider limits).

All schema fragments below come from each resource's `extensions.bazaar.schema`; where explicitly called an “example,” that is `extensions.bazaar.info.output.example`, not a declared schema. The normalised response examples for OneSource wrap endpoint data in `{data, meta}`. `flow://…/output#/…` pointers target that observed output envelope. Payment network is Base; the provider data network parameter `ethereum` is separate.

### P1 — ENS name → token balance (2 nodes; OneSource)

Real listing records: [ENS resolve](https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?type=http&limit=100&offset=0) at resource `https://api.onesource.io/api/chain/ens/:input` and [ERC20 balance](https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources?type=http&limit=100&offset=0) at `https://api.onesource.io/api/chain/erc20-balance`. Both are in the sampled first page. `providerHost=api.onesource.io`, `method=GET`.

| Node | Price (atomic / asset / network) | Input schema excerpt | Output schema excerpt |
|---|---|---|---|
| `ens` | `5000 / Base USDC / eip155:8453`, exact; live 402 match | `pathParams.input`: string, `oneOf` address or ENS-name regex; `queryParams.network`: string enum `ethereum\|sepolia\|robinhood`. Sample input `vitalik.eth`, `ethereum`. | `output.example.data.address: string`; also `data.name: string`. |
| `balance` | `3000 / Base USDC / eip155:8453`, exact; live 402 match | `queryParams.address` and `.contract`: string pattern `^0x[a-fA-F0-9]{40}$`, both required; `.network`: enum above. | `output.example.data.account`, `.balance`, `.contract_address`, `.name`, `.symbol`: string; `.decimals`: integer. |

**FlowPlan shape** (toolRef deliberately means “resolve this listing to a current admitted AE toolRef”; it is not an ID):

```json
{"nodes":[
 {"id":"ens","toolRef":"<lookup api.onesource.io + /api/chain/ens/:input + GET>","input":{"type":"http","method":"GET","pathParams":{"input":"vitalik.eth"},"queryParams":{"network":"ethereum"}},"dependsOn":[]},
 {"id":"balance","toolRef":"<lookup api.onesource.io + /api/chain/erc20-balance + GET>","input":{"type":"http","method":"GET","queryParams":{"address":"flow://ens/output#/data/address","contract":"0xdac17f958d2ee523a2206206994597c13d831ec7","network":"ethereum"}},"dependsOn":["ens"]}
]}
```

**Mercator shape** (CDP has no `serviceId`; bracketed value is not presented as a Mercator ID):

```json
{"nodes":[
 {"id":"ens","serviceId":"<not supplied by CDP; resolve host/path>","method":"GET","path":"/api/chain/ens/:input","input":{"pathParams":{"input":"vitalik.eth"},"queryParams":{"network":"ethereum"}},"dependsOn":[]},
 {"id":"balance","serviceId":"<not supplied by CDP; resolve host/path>","method":"GET","path":"/api/chain/erc20-balance","input":{"queryParams":{"address":"flow://ens/output#/data/address","contract":"0xdac17f958d2ee523a2206206994597c13d831ec7","network":"ethereum"}},"dependsOn":["ens"]}
]}
```

**Dry run:** Kahn stages `[[ens],[balance]]`; 2 nodes, depth 2, provider count 2. `/data/address` is declared `string` and target `address` is `string` with an address regex: static JSON-type check passes, but source schema does not prove the regex, so resolved-input validation must check it before payment. Pointers are declared dependencies. **Refusals assuming both tools are admitted:** none. If either listing has no current AE publication, `tool_not_admitted` is the appropriate real-world outcome; admission was not live-checked here.

### P2 — ENS name → token balance → transfers (3 nodes; OneSource)

P2 reuses the exact P1 `ens` and `balance` listings and adds the real listing `https://api.onesource.io/api/chain/erc20-transfers` (GET). Input schema: query `address` and `contract` are string/address-pattern fields; `from_block`/`to_block` are integer-or-string unions including hex-block strings; `network` is the same enum. Output schema: `output.example.data.count: integer`, `from_block`/`to_block: string`, `logs: array<object>` with `address`, `blockNumber`, `data`, `logIndex`, `transactionHash: string` and `topics: array<string>`. Listing and unpaid 402 amount are 5,000 atomic Base USDC.

**FlowPlan shape** (same real input literals as P1; added node filters transfer history by the resolved wallet and token):

```json
{"nodes":[
 {"id":"ens","toolRef":"<lookup api.onesource.io + /api/chain/ens/:input + GET>","input":{"type":"http","method":"GET","pathParams":{"input":"vitalik.eth"},"queryParams":{"network":"ethereum"}},"dependsOn":[]},
 {"id":"balance","toolRef":"<lookup api.onesource.io + /api/chain/erc20-balance + GET>","input":{"type":"http","method":"GET","queryParams":{"address":"flow://ens/output#/data/address","contract":"0xdac17f958d2ee523a2206206994597c13d831ec7","network":"ethereum"}},"dependsOn":["ens"]},
 {"id":"transfers","toolRef":"<lookup api.onesource.io + /api/chain/erc20-transfers + GET>","input":{"type":"http","method":"GET","queryParams":{"address":"flow://balance/output#/data/account","contract":"flow://balance/output#/data/contract_address","network":"ethereum"}},"dependsOn":["balance"]}
]}
```

**Mercator shape:** same nodes/inputs, with `serviceId:"<not supplied by CDP>"`, `method:"GET"`, and paths `/api/chain/ens/:input`, `/api/chain/erc20-balance`, `/api/chain/erc20-transfers`; `dependsOn` respectively `[]`, `['ens']`, and `['balance']`. For the `transfers` input, `address` and `contract` hold the same two flow refs shown in FlowPlan. `api.onesource.io` is the real provider host for all three.

**Dry run:** Kahn stages `[[ens],[balance],[transfers]]`; 3 nodes, depth 3, maximum concurrency 1, provider count 3. `ens.data.address:string → balance.queryParams.address:string`; `balance.data.account:string → transfers.queryParams.address:string`; `balance.data.contract_address:string → transfers.queryParams.contract:string`. All pointer paths exist in declared output schemas; string types match. Output strings do not carry the destination's address regex, so runtime input validation is still essential. Costs: 5,000 + 3,000 + 5,000; indicative rounded ceiling **AUD 0.018806**.

The design states `≤2 per providerHost` without saying whether this is a *total node count* or *concurrent calls*. If total count, this realistic 3-step OneSource chain violates it. The refusal enum in `plan-quote-decisions.md:15-16` has no provider-host-limit refusal code. If the cap means concurrency, this sequential chain is within the limit. **No unlisted refusal is invented here:** total-count interpretation has a policy violation without a declared code; add one or clarify the cap as concurrency (see A5).

### P3 — ENS name → web search → extract URLs (3 nodes; 3 hosts)

Listings: reuse P1 ENS; Kadec `https://api.kadec0.xyz/v1/serp` (GET, `providerHost=api.kadec0.xyz`) and BlockRun `https://blockrun.ai/api/v1/exa/contents` (POST, `providerHost=blockrun.ai`). The sampled Kadec input schema has `queryParams.q:string` required and `num_results:string` (description says max 25); live 402 for this query required 50,000 atomic Base USDC. Its output **example** is `{count, items:[{rank, snippet, title, type, url}]}`, but its declared output schema is only `example: object` with no named properties. BlockRun input schema requires `body.urls: array`, but declares no `items`, `minItems`, or `maxItems`; output schema declares `example.results: array` without item schema. BlockRun's listed exact amount is 3,000 atomic USDC.

**FlowPlan shape** (the `$concat` array spelling is a manual interpretation of the decision file's operator name; the RFC does not define its operand grammar):

```json
{"nodes":[
 {"id":"ens","toolRef":"<lookup api.onesource.io + /api/chain/ens/:input + GET>","input":{"type":"http","method":"GET","pathParams":{"input":"vitalik.eth"},"queryParams":{"network":"ethereum"}},"dependsOn":[]},
 {"id":"search","toolRef":"<lookup api.kadec0.xyz + /v1/serp + GET>","input":{"type":"http","method":"GET","queryParams":{"q":{"$concat":["flow://ens/output#/data/name"," Ethereum wallet profile"]},"num_results":"5"}},"dependsOn":["ens"]},
 {"id":"contents","toolRef":"<lookup blockrun.ai + /api/v1/exa/contents + POST>","input":{"body":{"urls":{"$map":{"from":"flow://search/output#/items","path":"/url"}}}},"dependsOn":["search"]}
]}
```

**Mercator shape:** same node IDs/dependencies; `ens`: `method=GET`, path `/api/chain/ens/:input`, input `{pathParams:{input:"vitalik.eth"},queryParams:{network:"ethereum"}}`; `search`: `method=GET`, path `/v1/serp`, input `{queryParams:{q:{$concat:["flow://ens/output#/data/name"," Ethereum wallet profile"]},num_results:"5"}}`; `contents`: `method=POST`, path `/api/v1/exa/contents`, input `{body:{urls:{$map:{from:"flow://search/output#/items",path:"/url"}}}}`. Each `serviceId` remains unavailable from CDP; use host/path/method resolution, not fabricated Mercator IDs.

**Dry run:** Kahn stages `[[ens],[search],[contents]]`; 3 nodes, depth 3, one node per host. `ens.output.data.name:string → search.input.queryParams.q:string` through `$concat`; type-compatible. For `$map`, the pointer `/items` appears in Kadec's *example* but not its declared output schema, and `/url` is not declared as a property; the target only declares `urls: array` and no item type. Therefore this is **untyped**, not statically proven. Decision text says untyped outputs are allowed but must carry `untyped_ref` and runtime input validation before payment. `$map` returns an array, but the source schema cannot establish that every member is a URL string or that the result has 1–5 items.

Price probe: one URL required exact amount 3,000 (`$0.0030`), five URLs required exact amount **11,000** (`$0.0110`) on the same resource. This is input-dependent despite scheme `exact`; listing prose says `$0.002/URL`, and listing accepts amount remained 3,000. Treat contents as deferred/dynamic and refuse it under the stated rules: **`deferred_node_dynamic_price`**. Kadec's single exact-price probe does not prove that its price is input-independent for every query; conservative classification is unknown/dynamic until a fixed-price contract or bound is declared, yielding the same refusal code if that assurance is required. `untyped_ref` is a diagnostic, not a code in the refusal union. Conditional 5-result ceiling is 11,000 atomic USDC = **AUD 0.015912** rounded per node, but it is not safe to approve unless the result count is strictly capped and a price maximum is bound. The illustrative three-node total (AUD 0.095469) is not an approvable quote.

## A1–A6 verdicts and minimal changes

| Assumption | Verdict | Evidence | Minimal design adjustment |
|---|---|---|---|
| **A1 — Deferred nodes need input-independent prices** | **PARTIAL** | The guard is justified: BlockRun returns exact-scheme 3,000 for one URL and 11,000 for five; exact in a single 402 is not a price-independence guarantee. But CDP listing scheme/amount alone does not encode that distinction. | Model price basis explicitly (`fixed`, `input-dependent`, `unknown`) and any maximum/cost function in admitted pricing metadata. Treat unknown as dynamic and refuse deferred input with `deferred_node_dynamic_price`; do not infer independence from `scheme=exact`. |
| **A2 — Static pointer type-check needs upstream outputSchema + downstream inputSchema** | **PARTIAL** | P1/P2 edges have both declared schemas and string-type matches. In the sample 98.5% have an output-schema object, but only 42.6% declare any named payload fields; Kadec's example output is not a schema. | Resolve pointers only from declared schema; carry `untyped_ref` when absent/incomplete; continue validating every resolved input against the target schema before any payment. Never promote examples into schema. |
| **A3 — `flow://` refs + `$map`/`$concat` can wire real outputs to real inputs** | **PARTIAL** | Direct refs wire ENS→balance/transfers. A string `$concat` edge can type-check. Search→contents `$map` uses real example fields but has no declared source item schema or target array-item type. Transform grammar (`$concat` operands) is also not written down. | Specify deterministic transform grammar and type rules. Require typed pointer/source and target item types for static guarantees; preserve `untyped_ref` and block payment on runtime mismatch. |
| **A4 — Ceilings from USDC→AUD with 50 bps tolerance** | **HOLDS** for bounded fixed requirements | OneSource 5k/3k/5k and Kadec 50k probes match listings; Base USDC converts using the cited rate and upward per-node rounding. BlockRun shows the input amount must first be bounded: listing 3k is not its 5-URL requirement (11k). | Continue converting the actual exact amount (or `maxAmountRequired` for `upto`), not assuming the max field always exists. Store the FX source/time with the quote and require a finite input-independent amount/max before approving a deferred node. |
| **A5 — ≤10 nodes / ≤2 per providerHost fits real chains** | **BREAKS** if “per host” means total plan nodes | The ENS→balance→transfers chain is three real OneSource listings, within 10 nodes and depth 5, but has 3 nodes at `api.onesource.io`. It is sequential, so only one is concurrent. | Specify `≤2 concurrent Calls per providerHost` (which this chain meets) rather than a total-node cap; if another hard cap is intended, add a named refusal such as `provider_host_limit_exceeded` to the closed union. |
| **A6 — Mercator `{serviceId,method,path}` resolves via providerHost + resource path** | **PARTIAL** | CDP records contain `resource` absolute URL and `method`, not Mercator `serviceId` (OneSource samples have neither serviceName nor serviceId). Repo projection derives `provider=URL.hostname`, preserves method/resource (`x402-directory-projection.ts:150-177`; `ingestion.ts:168-177`). Current `toolRef` is a live join from exact `sourceRouteRef` to a current publication (`convex/lib/market/directoryIndex/browse.ts:25-32`; resource lookup `lookup.ts:10-23`), not automatic host admission. | Ignore external `serviceId` for local identity; resolve exact `(normalized host, route/resource path, method)` to the indexed resource, then require its current `sourceRouteRef` publication. If absent/not admitted, return existing `tool_not_admitted`; never synthesize a ToolRef. |

**Declared-refusal caveat:** The refusal union is `plan-quote-decisions.md:15-16`; it contains `deferred_node_dynamic_price`, `tool_not_admitted`, and the type/pointer errors, but has no provider-host-limit code. Node/host limits are described at `:41`. For P1/P2/P3, all statements of “no other refusal” are conditional on every directory match being currently admitted; that live state was outside this unpaid listing/probe check.

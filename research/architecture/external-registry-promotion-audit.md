# External-registry promotion audit

**Evidence date:** 2026-08-25  
**Checkout:** `1dfece75fba4bc2e56158ad3f8b70795581ed168`  
**Production read target:** `formal-jaguar-441`  
**Authority:** `PRODUCT.md`, current source and tests, live first-party Agentic Market and treg APIs, and a read-only Convex query against the production deployment.

This is a source-and-production-state audit, not an authorization to write production data. No registry refresh, graduation probe, publication, payment, deployment, credential change, or other external mutation was performed.

## Executive answer

The founder's recollection is directionally right: the repository contains a maintained external-registry importer for both [Agentic Market](https://agentic.market/llms.txt) and [treg](https://treg.to/llms.txt), and production is configured to run it every 24 hours. Those upstream catalogues are populated.

They are not, however, canonical Operations merely because they exist upstream:

- both sources first enter `marketExternalRegistryEntries` as `source_metadata_only`/`registry_metadata_only`;
- only Agentic Market entries have a current graduation path;
- an Agentic Market candidate becomes a canonical Operation only after an SSRF-guarded request returns HTTP 402 with a valid `payment-required` document carrying the admitted Bazaar contract, followed by capability-supply reconciliation/publication;
- treg entries are deliberately `provider_account` metadata and are excluded from the current admission-candidate query. There is no current treg-to-Operation promotion path.

Production currently contains neither imported registry entries nor canonical Operations. The first post-reset registry cron attempted a refresh at **2026-08-25T03:16:38.730Z**, failed with `external_registry_batch_invalid`, and preserved no active generation. A replay of the current adapters against the current live APIs found the exact incompatibility: **8,716** otherwise-admitted Agentic Market entries have a concrete example probe URL different from the template/base `endpointUrl`, while the persistence validator requires exact equality. One invalid entry rejects its whole 50-or-smaller write batch; the refresh then fails atomically and the failed generation is cleaned up.

Therefore a plain rerun is not the safe next action. The smallest maintained path is: fix that bounded adapter/persistence invariant with regression coverage, deploy the focused fix, then invoke the existing production refresh action once and allow its existing graduation sweep to admit only candidates that prove a live conforming 402 contract. Do not seed fake Operations, bulk-copy upstream metadata into capability-supply, or promote treg rows as executable truth.

## Live upstream supply

The counts below are a point-in-time read at the evidence date. Agentic Market is a changing offset-paginated catalogue and treg exposes both visible platform totals and hidden-inclusive shelf rows, so these numbers should be recorded with their timestamp rather than treated as permanent constants.

| Source | First-party endpoints | Current live source facts | What the checked-in adapter accepted | Example identities |
|---|---|---:|---:|---|
| Agentic Market | [`GET /v1/services`](https://api.agentic.market/v1/services?limit=200&offset=0), [first-party discovery contract](https://agentic.market/llms.txt) | 2,374 reported services; 29,933 endpoint rows across the full page traversal | 24,556 metadata candidates across 2,109 services and 2,102 provider labels; 5,377 endpoint rows refused by the adapter's method/price/input-contract requirements | `api-exa-ai` / `POST https://api.exa.ai/search` (`USDC 0.007`); `coinmarketcap-com` / `GET https://pro-api.coinmarketcap.com/x402/v3/cryptocurrency/quotes/latest` (`USDC 0.01`); `x402-tavily-com` / Tavily |
| treg | [`GET /catalog/platforms`](https://treg.to/catalog/platforms), [first-party catalogue contract](https://treg.to/llms.txt) | 81 platform shelves, 2,523 visible endpoints and 986 capabilities in the index | 2,757 unique hidden-inclusive metadata rows across 81 shelves and 57 provider labels; the count exceeds 2,523 because the adapter deliberately requests each shelf with `include_hidden=1` and also consumes its `extended` rows | `tikhub.x.douyin-app-v3-fetch-brand-hot-search-list`; `companies` shelf; `stocks` shelf |

Representative concentration in the adapter output:

| Source | Largest current groups |
|---|---|
| Agentic Market | `api-m2mcent-com` 965; `agent402-tools` 532; `proxy-suverse-io` 510; `api-x402node-dev` 481; `x402-forgemesh-io` 456 |
| treg | `douyin` 303; `x` 197; `tiktok` 178; `companies` 170; `instagram` 153; `youtube` 153 |

The top 100 Agentic Market service IDs account for **14,140 / 24,556 candidates (57.58%)**; the top 100 provider labels account for **14,168 / 24,556 (57.70%)**. This is concentration, not admission quality: a large service can still fail the 402/Bazaar proof. treg has only 81 platform shelves and 57 provider labels, so a “top 100” cut contains its entire 2,757-row adapter output and provides no useful bound.

Agentic Market's first-party contract says its listings are x402-callable and exposes the service API with endpoint method, URL, USDC pricing, networks and quality metadata. That statement is upstream metadata, not sufficient Operation authority for this product. The local adapter additionally requires a standard GET/POST method, an exact positive price, safe non-credential parameters, a buildable JSON input schema, and usable examples ([adapter](../../src/modules/market/registry-source-adapters.ts#L180-L290), [entry normalization](../../src/modules/market/registry-source-adapters.ts#L411-L489)).

treg's first-party contract describes a single authenticated `/call/` surface using `X-Treg-Token`, server-side credential injection, a prepaid balance for treg-owned provider credentials, and provider-account/BYO-key routing. The local adapter consequently represents treg as `provider_account` metadata, not keyless x402 authority ([treg normalization](../../src/modules/market/registry-source-adapters.ts#L492-L558)).

## Implemented import and promotion flow

```text
Agentic Market /v1/services ─┐
                             ├─ marketExternalRegistryRefresh.run
treg /catalog/platforms ─────┘          │
                                        ▼
                     atomic metadata generation (lower authority)
                                        │
                       Agentic Market candidates only
                                        ▼
                    guarded live request must return HTTP 402
                                        │
               valid payment-required + Bazaar admission contract
                                        ▼
              facilitatorDiscovery.reconcile / capability-supply
                                        │
                                        ▼
                         canonical published Operation

treg metadata ──X── no current graduation adapter
```

### Import

`convex/crons.ts` schedules `marketExternalRegistryRefresh.run` every 24 hours ([cron](../../convex/crons.ts#L28-L33)). The action fetches Agentic Market and treg concurrently, streams Agentic Market entries to bounded writes, retains treg in memory, rejects incomplete source traversals, finalizes a complete generation atomically, and only then schedules graduation ([refresh action](../../convex/marketExternalRegistryRefresh.ts#L17-L106)).

The generation layer intentionally does not expose source identity, source digests, or probe requests through its public read. Public rows are projected with `authority: "registry_metadata_only"`; a failed/incomplete refresh preserves the previous complete generation ([generation store](../../convex/marketExternalRegistry.ts#L195-L360), [public projection](../../convex/marketExternalRegistry.ts#L577-L623)).

### Admission and publication

`admissionCandidates` filters out every row whose source is not `agentic_market` or which lacks a probe request ([candidate query](../../convex/marketExternalRegistry.ts#L546-L574)). The graduation action re-reads the candidate by document ID plus expected source digest, validates the target with the network guard, and sends the request through guarded HTTP. It refuses every outcome except a 402 response with a bounded, decodable `payment-required` header and one admitted Bazaar draft ([graduation probe](../../src/modules/market/registry-graduation.ts#L38-L77), [guarded action](../../convex/marketRegistryGraduation.ts#L35-L68)).

The draft then enters the existing capability-supply reconciliation path. That path creates or refreshes system-owned, `observed_external` publication state, provider connection, exact pricing, and the current Operation projection; it does not turn the registry row itself into execution authority ([reconciliation](../../convex/facilitatorDiscovery.ts#L181-L301)).

The sweep processes four candidates per page, schedules the next page after one second, and counts a graduation only when reconciliation reports a publication ([sweep](../../convex/marketRegistryGraduation.ts#L71-L130)). With the current live snapshot, the potential Agentic Market probe population is 24,556, subject to the persistence fix and any source churn. The final published count is unknowable without performing those guarded live probes; upstream catalogue membership is not a substitute for the 402/Bazaar proof.

## Why production is empty

A read-only production query returned:

| Table/state | Current value |
|---|---:|
| `marketExternalRegistryEntries` | 0 |
| `marketExternalRegistryGenerations` | 0 |
| `capabilityOfferings` | 0 |
| `capabilityPublications` | 0 |
| `capabilitySupplyOperations` | 0 |
| `marketExternalRegistryState.lastAttemptStatus` | `failed` |
| `marketExternalRegistryState.lastError` | `external_registry_batch_invalid` at `marketExternalRegistry.ts:211` |

The public production registry agrees: [`/api/v1/registry`](https://agentic-economy-phi.vercel.app/api/v1/registry?query=&access=all&limit=5) returns HTTP 200 with `{"schemaVersion":"api-registry:v1","query":"","access":"all","kind":"unavailable"}` because no complete generation is active.

The defect is an internal contract contradiction:

1. the adapter keeps the upstream template/base URL as `endpointUrl` and route identity ([lines 420-479](../../src/modules/market/registry-source-adapters.ts#L420-L479));
2. the input-contract builder substitutes path examples and adds query examples to produce the concrete `probeRequest.url` ([lines 675-735](../../src/modules/market/registry-source-adapters.ts#L675-L735));
3. the persistence validator requires `probeRequest.url === endpointUrl` ([validator](../../convex/marketExternalRegistry.ts#L640-L718)).

Replaying those exact source functions against the live catalogue produced:

- 24,556 adapter-admitted Agentic Market entries;
- 15,840 with identical endpoint and probe URLs;
- 8,716 with an intentionally concrete probe URL and therefore rejected by `validEntry`;
- zero other violations of the validator's tested size, tag/network, JSON-schema, example, header, body, method, or route conditions in this snapshot.

One representative mismatch is Tripadvisor:

```text
endpointUrl:  https://tripadvisor.x402.paysponge.com/api/v1/location/:locationId/details
probe URL:    https://tripadvisor.x402.paysponge.com/api/v1/location/154943/details
```

A query-parameter example is CoinMarketCap, where the base quote URL becomes a concrete probe with `?convert=USD&id=1%2C1027`. These are generated by the repository itself from upstream parameter examples. Because the write mutation rejects a batch when any member fails validation ([write guard](../../convex/marketExternalRegistry.ts#L204-L215)), the current live ordering reaches an invalid batch and aborts the entire refresh. The failed generation is subsequently cleaned, explaining why production has a failure record but zero generation/entry rows.

## Smallest maintained production-safe action

1. **Repair only the generated-probe/persisted-route invariant.** Preserve stable source identity and the actual guarded probe target; do not weaken HTTPS/credential/SSRF checks or equate metadata with readiness. Add a regression fixture containing both a substituted path parameter and appended query parameters, plus a write-batch test proving the adapter output satisfies the persistence contract.
2. Run the focused external-registry adapter, generation, graduation and facilitator-discovery tests. Deploy that focused source revision through the official Convex deployment path.
3. Invoke the maintained action once on the exact production deployment:

   ```sh
   npx convex run \
     --deployment formal-jaguar-441 \
     marketExternalRegistryRefresh:run '{}' \
     --codegen disable \
     --typecheck disable
   ```

   This is preferable to direct table imports or bespoke promotion: the action enforces complete-source coverage, atomic generation activation, stale-source digest checks, guarded HTTP admission and the existing canonical publication path.
4. Observe the returned refresh generation, registry coverage, graduation/refusal outcomes, canonical publication/current-Operation counts, readiness, and `/market`. Do not call or pay any Operation merely to populate the catalogue.

The refresh action automatically schedules the Agentic Market graduation sweep. At the present catalogue size this means up to 24,556 guarded network probes, four candidates per scheduled page. That is maintained behavior but a material operational consequence; production execution should monitor rate, duration and refusal outcomes rather than assume the headline count will publish.

There is no equivalent smallest action for treg today. Promoting treg requires a deliberately designed capability-supply admission adapter that proves exact callable route, authenticated authority, pricing, effects and readiness for treg's tokenized `/call/` contract. Directly converting the 2,757 treg metadata rows into Operations would violate `PRODUCT.md` and current source contracts.

### Smallest bounded seed recommendation

Do not seed the top 100 by upstream volume. The smallest useful product-shaped seed is **three exact search Operations from independent suppliers**, admitted one candidate at a time through the existing `marketRegistryGraduation.run` primitive after a complete metadata generation exists:

| Supplier | Exact current upstream candidate | Declared upstream price |
|---|---|---:|
| Exa | `api-exa-ai` — `POST https://api.exa.ai/search` | USDC 0.007 |
| Tavily | `x402-tavily-com` — `POST https://x402.tavily.com/search` | USDC 0.01 |
| Parallel | `parallel-ai` — `POST https://parallelmpp.dev/api/search` | USDC 0.01 |

This set is small enough to inspect and supplies actual comparison inside one narrow category. It is only a candidate set: each row must independently pass the live 402/Bazaar probe, capability-supply preparation, publication and readiness before appearing in `/market`; no call or payment is part of seeding.

There is one operational caveat: the current refresh action unconditionally schedules the full Agentic Market sweep when it activates a generation. The existing per-candidate action is the smallest maintained promotion primitive, but the current orchestration cannot import a generation and then stop at three. A genuinely bounded production seed therefore needs the same focused fix to expose an operational “metadata refresh without bulk sweep” mode (or equivalent exact-candidate bound) while leaving the per-candidate admission contract unchanged. Until that exists, the honest maintained action is the full observed refresh/sweep described above, not a hand-written table import.

## Residual unknowns and evidence gaps

- The exact number of Agentic Market entries that currently return a conforming 402/Bazaar document is unknown until the guarded graduation probes run. This audit did not send those requests.
- The final number of canonical Operations may be lower than the number of admitted 402 documents because capability-supply can still refuse preparation, connection or publication.
- The sweep records only per-page attempted/graduated counts in its action result; there is no durable aggregate graduation ledger in this path. Production observation must therefore use current publication/projection counts and logs.
- Agentic Market and treg first-party headline text is not perfectly synchronized with their live catalogue APIs. This audit uses the live structured APIs for counts and records the evidence date.
- treg's current source contract needs an account token and provider/balance authority to call; the external-registry row carries none of that authority. Whether Agentic Economy should integrate treg as an authenticated supplier is a future product/admission decision, not an import toggle.

## Primary sources

- [Agentic Market first-party agent contract](https://agentic.market/llms.txt)
- [Agentic Market live services API](https://api.agentic.market/v1/services?limit=200&offset=0)
- [treg first-party agent contract](https://treg.to/llms.txt)
- [treg live platform index](https://treg.to/catalog/platforms)
- [Product authority](../../PRODUCT.md)
- [Registry source adapters](../../src/modules/market/registry-source-adapters.ts)
- [Registry refresh action](../../convex/marketExternalRegistryRefresh.ts)
- [Registry generation store and candidate selection](../../convex/marketExternalRegistry.ts)
- [Graduation probe](../../src/modules/market/registry-graduation.ts)
- [Guarded graduation action and sweep](../../convex/marketRegistryGraduation.ts)
- [Canonical capability-supply reconciliation](../../convex/facilitatorDiscovery.ts)
- [External-registry source tests](../../tests/unit/market/external-registry-adapters.test.ts)
- [Generation and authority-boundary tests](../../convex/externalRegistry.test.ts)

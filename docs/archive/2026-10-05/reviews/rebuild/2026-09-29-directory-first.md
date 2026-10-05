> **Archived 5 October 2026.** Dated evidence or proposal; not a current work queue or approval. See the [archive index](../../../README.md) for its successor and remaining limits.

# Directory-first: findings and plan (29 September 2026)

Decision (Joel): Bazaar is the product. Every listing is callable by default. Safety comes from real rankings, filtering and a limited-liability statement. The curated catalogue comes later, for aecon's own services.

## Why Bazaar listings are not callable today
- Quote accepts only a catalogue `operation:v1` toolRef (`src/modules/capability-execution/quote.ts:22-25`). The resolver needs a current publication, offering, binding, contract, transport and pricing (`convex/lib/capabilitySupply/currentTool/reads.ts:58-112`).
- A search row is `ae_callable` only when a current publication exists for its sourceRouteRef. Otherwise it is `external_listing` and has no toolRef (`convex/lib/market/directoryIndex/choices.ts:13-24`, `compact-directory-search.ts:82-97`).
- Publications are created in only two places. After the weekly scan, only the top 24 rows by payers get one (`lookup.ts:84-89`, `x402DirectoryIndexRefresh.ts:53-65`). The 6-hourly discovery cron admits at most 4 pages × 20 (`facilitator-discovery-client.ts:21,177-180`). A ≥2-payer eligibility gate applies on top (`x402Directory.ts:18-30`, `facilitator-discovery-ingest.ts:169-178`, `projection/support.ts:72-74`). Local index: 20,603 rows.

## Already built and reusable
- Building a publication from a Bazaar resource: `convex/lib/capabilitySupply/facilitatorDiscovery/publication.ts:110-133`, reached through `convex/x402Directory.ts:67-100` (resolve).
- At Quote time, a live unpaid 402 check reads price, payTo, network and asset (`quoteAction.ts:92-101`, `live-x402-requirement.ts:67-149`). At Call time, the fresh 402 must match the Quote (`route-transport-x402-payment.ts:93-190`).
- Replay returns the original Call (`readForCall.ts:40-51`). A timeout after possible payment goes to reconciliation (`runRelease.ts:173-188,488-491`).

## x402 recovery (primary sources)
- In the default `exact` flow the seller verifies, runs the handler, settles, then releases the response. The reference Express and Hono middleware skip settlement when the status is ≥400 ([exact](https://docs.x402.org/schemes/exact)). An error response usually means no charge.
- A 200 with a useless body is paid, and x402 has no refund or dispute mechanism. `upto` and `batch-settlement` depend on the seller offering them ([upto](https://github.com/x402-foundation/x402/blob/main/specs/schemes/upto/scheme_upto_evm.md), [batch](https://docs.x402.org/schemes/batch-settlement)).
- A settlement failure returns 402 plus `PAYMENT-RESPONSE`. After a timeout, reconcile the transaction hash before charging or retrying ([CDP settle](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/settle-payment)).
- Industry practice matches the limited-liability approach:
  - x402scan: "We do not verify Providers or the quality of their APIs"; "refunds are not guaranteed" ([tos](https://www.x402scan.com/tos)).
  - the402: "does not guarantee any outcome" ([terms](https://the402.ai/terms/)).
  - Bazaar down-ranks failing sellers and does not compensate buyers ([discovery](https://docs.cdp.coinbase.com/x402/seller/get-discovered)).

## treg (github.com/superdesigndev/treg, "OpenRouter for Tools")
- Every catalogue endpoint can be called directly. Curated adapters are an optional composition layer, never an admission gate (`domain/catalog/routing/plan.py:150-181`).
- Ranking works as follows (`domain/catalog/stats.py:149-321`, `store.py:1330-1392`):
  - Relevance comes first, then live evidence, then curation, then price.
  - Evidence is success, latency, recency and sample size over 30 days.
  - Thin evidence is suppressed, and caller-caused 4xx is excluded.
  - The UI labels this "live traffic, not a benchmark".
  - The buyer chooses the provider. There is no silent rerouting.
- Billing:
  - 5xx, 3xx and network failures are not billed, and holds are released.
  - The funds hold is placed before any network I/O.
  - Unknown price is refused, never treated as free.
  - (`application/call/settle.py:57-82,904-955`, `docs/context/architecture/money.md:74-86`)
- The agent surface is generic: search → inspect → call. MCP exposes 10-13 tools, not one schema per endpoint. Call results return actual cost, call ID, upstream status and `whose_error` (`mcp.py:678-1535`).
- Testing uses a call matrix: 30 cases against a fake upstream. Each case asserts HTTP, ledger/holds, audit and the upstream hit count (`tests/callmatrix/CASES.md`). Rejected calls must hit upstream zero times.
- One money owner, integer micro-USD, reserve/settle/release, and database-enforced idempotency with 24-hour replay (`domain/money/__init__.py`, `application/call/idempotency.py`).

## Inversion: what breaks directory-first
1. Listings with no input schema are refused by contract validation (`issueQuote.ts:104-105`). No input schema is synthesised from the directory row.
2. The ≥2-payer gate hides new sellers.
3. Wash trading inflates call counts (x402scan: roughly 48% of transactions are self-traded). Rank on unique payers and outcomes, not calls.
4. A 200 with a garbage body is paid. Remedy: the liability statement plus an outcome signal that feeds ranking.
5. Unsupported networks and assets. Show only what aecon can pay.
6. Arbitrary seller URLs create SSRF and huge-response risk. Re-resolve at Call time and cap response size.
7. Quote-time resolution adds latency. The live 402 check is already on the Quote path.
8. Price gouging. The Quote shows the price and the buyer's spend caps apply.

## Incremental steps (one at a time, each proven before the next)
1. **Quote accepts a directory row.** Resolve it through `x402Directory.resolve`, then use the unchanged Quote path. Proof: a Quote issued on a top Bazaar row.
2. **Search stops saying "listed only"** for rows on a supported network and asset. They become callable, with the publication built at Quote time.
3. **Limited-liability statement** at the Quote, on the receipt and in the terms.
4. **Ranking and filters from live outcomes:** unique payers, success rate, a sample floor and freshness.
5. **Schema-less input:** accept a JSON object when the listing declares no schema.
6. **Call matrix** covering money and outcome invariants.

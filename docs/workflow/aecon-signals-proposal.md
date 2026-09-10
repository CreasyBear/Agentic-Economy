# AEcon Signals: from directory analytics to an x402 data house

Drafted 2026-09-09 against market analytics v2 (`market-analytics-v2-design.md`). Proposal only; nothing here is implemented or approved.

## Where v2 leaves us

v2 derives payer depth, recency, momentum and category concentration from what Coinbase Bazaar declares per resource (`calls30d`, `payers30d`, `lastCalledAt`, prices). Every number is declared-source or derived-from-declared, labelled as such, and no synthetic time series is drawn. That discipline is the asset. The gap is that AE currently knows nothing anyone else cannot read off Bazaar.

Three facts in the current schema make the next steps cheap:

1. `marketDirectorySearchEntries` is keyed by `(generation, resource)` and every generation is retained. That is already a per-Tool observation series; v2 uses exactly two points of it (current vs previous).
2. `marketExternalRegistryEntries.directorySourceJson` retains the raw upstream record per generation, so any signal we define later can be recomputed over history without re-scanning.
3. Every managed Call AE executes produces facts (latency, outcome, settled amount, schema conformance) that Bazaar does not have and cannot have.

## The thesis

Unusual Whales became indispensable by (a) watching a public data stream nobody else packaged, (b) surfacing *unusual* movement rather than totals, (c) attributing it to identifiable actors, and (d) selling the result. The x402 economy has the same shape: public directory metadata, public on-chain USDC settlement to declared `payTo` addresses, and no one packaging either. AE additionally holds a private stream, real execution outcomes, because it is a buyer.

Provenance stays load-bearing throughout. Each layer below names its evidence class in DESIGN.md terms: **declared**, **derived**, **AE-observed**, **chain-observed**. No layer may present one class as another.

## Layers, in build order

### 1. Real history (declared, observed by AE at each scan)

Turn the retained generations into an explicit series. A Tool's `calls30d` / `payers30d` / minimum USDC price across N completed generations is N actual observations, each stamped with the generation's `completedAt`. Rendered as a sparkline captioned "N observations since <date>, declared by Coinbase Bazaar". This is not a synthetic series: every point was read.

Required: a bounded retention policy (today generations are retained without limit; propose 120 completed generations, then archive the raw source JSON out of hot tables), a `resourceHistory` query keyed by resource over `by_generation_and_resource`, and a bounded, accessible history panel on Tool detail. Momentum then generalises from "delta vs previous" to "delta vs the Tool's own trailing window".

### 2. Movers (derived from declared, across observations)

The unusual-activity layer. Over each Tool's own history (minimum five observations), flag: payer or call count outside its own trailing band; new entrants; Tools that disappeared from the directory; declared price changes between generations; Provider hostnames arriving or leaving. Surface as a Movers feed and as per-Provider events. Everything is a comparison of declared observations, so it stays derived; the caption says so and shows the observation count behind it.

### 3. AE-observed execution facts (the private stream)

AE is the only party that both lists these Tools and pays to call them. Aggregate per Tool, across AE's own Calls only: attempt count, success and failure classes, observed latency distribution, settled USDC versus quoted, response-schema conformance. Publish counts only above a k-anonymity floor so no Customer's usage is inferable. This yields the first verifiable reliability signal in the x402 directory ("AE completed 41 paid Calls, 39 delivered, p95 2.1s") and a badge that means something because AE bore the cost of earning it. Existing `sourceMedianLatencyMs` / `sourceP95LatencyMs` / `sourceSampleSize` fields already hold the declared equivalents; the AE-observed values sit beside them, never merged.

### 4. Chain-observed settlement (public, unpackaged)

Every x402 resource declares a `payTo` address and network. USDC transfers to those addresses are public on Base and the other declared chains. Observing them gives real settlement volume per Provider address and per payer address, independent of what Bazaar declares. This is the literal whale-watching layer: which Provider addresses receive the most, which payer addresses spend the most, and where declared `calls30d` and observed settlement disagree. Use an established indexer API rather than a custom chain reader; `viem` is already a dependency and stays quarantined to capability-supply adapters per the existing rule.

### 5. Distribution: the data is itself a Tool

Publish AEcon Signals as x402 endpoints and list them in AE's own directory: `/signals/movers`, `/signals/tool/{resource}/history`, `/signals/provider/{host}`. Agents buy AE's market intelligence the same way they buy any other Tool, paid per call in USDC. AE becomes a Provider on its own marketplace, exercising the same Quote/Call path its customers use. Human subscribers read the same data through the existing analytics pages. Selling data is not payments activity, so this sits outside the Australian production money boundary that currently gates funding and settlement.

## What this is not

- No synthetic series, growth arrows, or "trending" copy without an observation count behind it.
- No merging of declared and AE-observed values into one number.
- No per-Customer usage exposed, ever.
- No custom chain indexer.

## First discrete step

Layer 1, bounded: retention constant plus archival of aged `directorySourceJson`; a `resourceHistory` internal query; one sparkline on Tool detail with the observation-count caption; a unit test that a two-generation history renders two points and a one-generation history renders none. Everything else builds on that series.

# Market concepts: ideation grounded in the data model

Owner's direction (2026-09-12, verbatim in substance): aecon.ai should feel like Airbnb, but "more along the lines of here's what people are using and what they're using it for; this is the experience you could be having." No price tickers or movers. Help guide people into using agentic tools. Be creative, use familiar interfaces, the schema and analysis can be cut and reshaped. Human technology, nature, architecture; editorial art, not screenshots.

Lens: the primary user of the market is an Agent, arriving over MCP, the `ae` CLI, or HTTP. Every human-facing section below must be a legible rendering of something an agent actually does or is told, or a hand-off into an agent surface; no section exists only for a human to admire a number. Each concept states the exact MCP action id / CLI command / HTTP route it renders or hands off to.

Vocabulary: Tool, Call, Quote, Provider, Customer, Agent, Qualified Use. Tables cited as `table.field`.

## A. "What agents are doing" feed

Borrows: App Store Today editorial cards meets Airbnb Experiences.

```
+-----------------------------------------------+
| AGENTS ARE DOING THIS THIS WEEK                |
| [editorial photo: hands, architecture]         |
| "Agents verified 1,200 ABNs for accountants    |
|  this week using ABN Lookup"                   |
| $0.02 per Call · Qualified 41 times this week   |
| [ Have your agent do this -> ]                 |
+-----------------------------------------------+
```

Agent surface: renders an aggregate over `tool.call` outcomes; the CTA hands off to `tool.quote` then `tool.call` (CLI `ae quote` / `ae call <toolRef>`).

Powered today by: `capabilityCallProjections` (toolRef, providerRef, state, createdAt, indexed `by_toolRef_and_createdAt`), `qualifiedUseReceipts` (toolRef, qualifiedAt) for the trust line, `capabilityQuotes.decisionAudUnits` or `marketDirectorySearchEntries.minimumUsdPrice` for price per Call.

Needs: a new Convex scheduled function aggregating `capabilityCallProjections` by toolRef over a trailing 7-day window, counting distinct `accountRef`/`ownerId`; a card copy template (not free-text LLM output) filling "Agents verified N ABNs using Tool"; and an audience tag ("for accountants") from a model-gateway classification job (`openRouterModel` with `structuredOutputs: true`) writing into the existing `marketToolCategories` table (`assignedBy` already distinguishes human vs automated assignment).

Replaces/cuts: `DirectoryMarketOverview.tsx` "Understand the landscape" price/adoption charts and "On the radar" rising/falling tabs; `AeMarketPage.tsx` window ticker.

Privacy: k-anonymity floor of 5 distinct paying accounts per Tool per 7-day window before a card is generated, matching the existing precedent (`MARKET_MIN_LATENCY_SAMPLE_SIZE = 5` in `listing-evidence.ts`, and the `5_9`/`10_49`/`50_plus` adoption bands already in `marketDirectorySearchEntries`).

Size: M.

## B. "Made for your business" rows

Borrows: Spotify/Netflix horizontal shelves.

```
FOR ACCOUNTANTS
[Tool] [Tool] [Tool] [Tool] ->
FOR PROPERTY MANAGERS
[Tool] [Tool] [Tool] ->
START FREE: KEYLESS READS
[Tool] [Tool] ->
```

Agent surface: each row is a saved `registry.tools.search` query; selecting a card hands off to `tool.quote`/`tool.call` exactly as concept D does.

Powered today by: `X402_MARKETPLACE_COLLECTIONS` in `x402-marketplace-home.ts`, six hand-authored editorial rails (id, title, query, category), already rendered through `readX402MarketplaceHomeServer` on the "discover" view; `CategoryShelfViewModel`/`groupCapabilitiesByCategory` in `tool-view-model.ts` already group `ToolCardViewModel`s by the fixed `marketCategories` enum (7 categories); `marketToolCategories` (toolRef, categoryId, assignedBy, assignedAt) already supports per-Tool tagging distinct from that enum.

Needs: more rows authored by hand first (no schema change), then a model-gateway classification run writing JTBD tags ("for accountants") into `marketToolCategories` at `assignedBy: 'model-gateway:v1'`.

Replaces/cuts: the flat "categories" accordion section inside `DirectoryAnalyticsCharts`.

Privacy: none, no per-customer data.

Size: S (hand-authored rows) to M (classified rows).

## C. "Recipes"

Borrows: Zapier template gallery, Notion gallery.

```
RECIPE: Bill a client in one shot
1. Quote a job -> 2. Verify ABN -> 3. Invoice
[ Copy MCP snippet ]  [ Copy SKILL.md ]
------------------------------------------
REQUESTED BY BUSINESSES
"something that reconciles Xero + Stripe" (7 asked)
```

Agent surface: the copy targets are literally an MCP tool-call sequence and a SKILL.md; "requested by businesses" renders a redacted rollup of `marketDemand.record` calls, not a human forum post.

Powered today by: nothing for the sequence itself, AE has no multi-Tool recipe table. `marketDemandSignals` (requestRef, query, principalId, credentialId, queryDigest, createdAt) is the closest signal, but `market-demand.actions.ts` states raw requests "remain private to the exact credential profile" and explicitly must not expose other buyers.

Needs: a new table for editorially authored Recipes (Tool sequence plus MCP/SKILL.md snippet); a new k-anonymous aggregate over `marketDemandSignals.queryDigest` (count distinct `principalId` per digest, publish digest, representative query and count only above the k=5 floor, never the raw per-request query or requester identity).

Replaces/cuts: nothing existing; net new.

Privacy: k=5 floor on any public demand rollup; this is a boundary change from the current private-by-design table, needing explicit owner sign-off.

Size: L.

## D. "Tell us the job" front door

Borrows: Airbnb search-as-intent.

```
+-----------------------------------------------+
| "Describe the job. We'll find the Tool."       |
| [ ................................ ] [Search]  |
| Others used <ToolA> for "reconcile invoices"   |
+-----------------------------------------------+
```

Agent surface: this section *is* `/t/new` (the existing chat), which already calls `registry.tools.search` (CLI `ae search`) and, on a miss, `marketDemand.record`; `marketRequestStatusAction` (`marketDemand.status`) re-checks a stored miss against `registry.tools.search` later.

Powered today by: `registryToolsSearchAction` (registry.tools.search), `marketRequestCreateAction`/`marketRequestStatusAction` in `market-demand.actions.ts`, all already wired end to end.

Needs: front-end composition only, promote `/t/new` chat to the primary hero on `/market`, demote `AeMarketToolbar`'s text field and category filters to secondary/advanced.

Replaces/cuts: `AeMarketToolbar`'s search-and-filter bar as the *primary* entry; the 24h/7d/30d `MarketWindow` tab row atop `market.tsx`.

Privacy: none new.

Size: S.

## E. "The agent's-eye view"

Not a marketplace grid: the human sees exactly what an agent sees and does.

```
[a] TOOL, AS AN AGENT READS IT
    name / description / parameters   (calm 3-col spec)
[b] WATCH AN AGENT DO IT
    Quote -> Call -> Result   0.4s     $0.02
    [a transcript-style replay, not a screenshot]
[c] HAND THIS TO YOUR AGENT
    [ Copy MCP config ]  [ Copy SKILL.md link ]  [ Copy `ae call ...` ]
```

Agent surface: (a) renders the same `PublicToolDescriptor` an MCP client reads via `registry.tools.describe`; (b) replays a real `tool.quote` -> `tool.call` pair; (c) hands off via CLI `ae call <toolRef> --input '<json>'` or an MCP client config.

Powered today by: (a) `PublicToolDescriptor` already rendered by `AeToolContractSections`/`AeToolTechnicalContract` on `tools.$toolRef.tsx`, just needs a plainer, Stripe-docs-style layout, not new data; (b) `capabilityQuotes` (quoteRef, toolRef, decisionAudUnits, createdAt, expiresAt) joined to `capabilityCalls` (callRef, quoteRef, toolRef, environment, state, result, usage, createdAt, updatedAt) gives quote-to-call-to-result with price and elapsed time (`updatedAt - createdAt`) already; (c) the exact copy-paste primitive already exists as `AeAgentInstructionCard.tsx` (`AGENT_INSTRUCTION` in `brand-copy.ts`), just not yet parameterised per Tool.

Needs: (a) presentation-only rework, no new data; (b) a new read-only Convex query selecting `environment: 'sandbox'` rows from `capabilityCalls` joined to `capabilityQuotes`, stripping `principalId`/`credentialId`/`applicationRef` and replacing them with "an agent"; (c) a per-Tool variant of `AeAgentInstructionCard` templating `ae call <toolRef>`.

Replaces/cuts: nothing directly; sits beside the Tool listing and can absorb `AeToolTrackRecord`'s current numeric framing into a narrative replay.

Privacy: sandbox-only replays (`environment: 'sandbox'`, no real settlement) sidestep k-anonymity entirely for (b); no threshold needed since no real Customer or spend is shown. (a) and (c) carry no customer data.

Size: S to M (a and c are S; b is M for the query plus redaction pass).

## Cut list

- `src/components/ae/market/DirectoryMarketOverview.tsx` (price bands, median ticker, curated/adoption "on the radar" tabs)
- `src/components/ae/market/AeMarketPage.tsx` as the primary market view (24h/7d/30d window ticker, comparison table)
- The rising/falling "movers" section of `src/components/ae/market/DirectoryAnalyticsCharts.tsx`
- `AeMarketToolbar`'s filter bar as the primary entry point (demoted, not deleted)

## Recommended first build

Weighing E against A: A needs a new scheduled aggregate, a k-anonymity floor, and a fresh model-gateway classification pass before it can show a single card; E's three sections mostly assemble data and components that already exist (`PublicToolDescriptor`, `capabilityQuotes`/`capabilityCalls`, `AeAgentInstructionCard`), and sandbox scope removes the privacy question entirely for the hardest sub-section. E changes the feel most per unit of new work: it is the most concrete proof that this is a market *for agents*, not a dashboard about them. Recommended first build: **E**, then **D** (already fully wired server-side), with A as the second wave once the classification job exists.

1. Reference: `docs/workflow/aecon-signals-proposal.md` layer 3 (AE-observed execution facts) for the evidence-class discipline to reuse on the replay.
2. Primitive: a new Convex query (not a mutation or scheduled job) joining `capabilityCalls` to `capabilityQuotes` by `quoteRef`, filtered to `environment: 'sandbox'` and `state: 'completed'`.
3. Files: new query beside `src/modules/market/tool-view-model.ts`; new `AeToolReplay` component in `src/components/ae/market/tool-detail/`; extend `AeAgentInstructionCard.tsx` to accept a `toolRef` prop; reuse `AeToolContractSections`/`AeToolTechnicalContract` for (a) with restyled copy only.
4. Blast radius: additive only, one new query and one new component; no schema migration; `tools.$toolRef.tsx` gains a section, nothing removed from it.
5. Real-use proof: run a real sandbox Quote and Call through the `ae` CLI, confirm the new query returns that exact `callRef` with correct elapsed time and price, and confirm no `principalId`/`credentialId` field reaches the client payload.

## Decisions for the owner

1. Approve breaking the market-demand privacy boundary (currently "private to the exact credential profile") to publish a k=5-anonymous "requested by businesses" rollup for concept C. Yes/No.
2. Approve concept E as the first build over concept A, given A needs new aggregation and classification work E does not. Yes/No.
3. Approve retiring `AeMarketPage.tsx`'s window ticker and `DirectoryMarketOverview.tsx`'s movers tabs outright (no compatibility layer), per the no-tickers-no-movers direction. Yes/No.
4. Approve k=5 as the standing k-anonymity floor across concepts A and C, reusing the existing `MARKET_MIN_LATENCY_SAMPLE_SIZE` precedent rather than choosing a new number. Yes/No.

# Market feel audit: trading desk vs Airbnb

Purpose: the owner wants aecon.ai to feel like the Airbnb of the agentic economy, not a trading desk. Tools are listings, Providers are hosts, trust is Qualified Use and provenance, and the brand kit calls for editorial imagery of human technology, nature and architecture rather than product screenshots or dense data. This audit reads the current market surfaces against that brief: where do trading-desk idioms (tickers, time windows, movers, sparklines, red/green deltas, dense tables) survive, what is the Airbnb analogue for each surface, and which shadcn/ui primitives already in `src/components/ui/` can carry the rebuild. No code is changed here.

## Surface 1: `/market` search-results mode (`src/routes/market.tsx`, `AeMarketPage.tsx`)

This is the "tools" branch of the loader, reached once `capability`, `compare`, `cursor`, `availability` or `category` is set.

Trading-desk idioms found:
- `window: marketWindowSchema... : "30d"` default and the nav static data `search: { window: '30d' }` — `src/routes/market.tsx:60,141`, `market.tsx:118` (staticData.nav.search).
- `AeMarketToolbar` has no window selector UI, but every navigate call threads `window` through the URL — `src/components/ae/market/AeMarketPage.tsx:181-186`, `AeMarketToolbar.tsx:56-73`.
- Dense numeric table with Rating, Calls, Latency, Access columns — `src/components/ae/market/AeToolTable.tsx:35-118`.
- "Calls" and "Rating" fact chips on the card row — `AeToolCard.tsx:79-121`.

Airbnb analogue: search results grid. A buyer scans listing cards (name, host, what it does, price per Call, a trust line), not a spreadsheet.
Should show: `AeToolCard` already does most of this (title, provider-as-host, summary, price-first). `AeToolTable` is the trading-desk holdout — it belongs on an internal/admin surface, not the public buyer flow.

shadcn reuse: `Card`, `Badge` (`src/components/ui/badge.tsx`), `Separator`, `Item`/`ItemContent` (`src/components/ui/item.tsx`) already carry the card; `Table` (`src/components/ui/table.tsx`) is the one being used for the trading-desk table and should be dropped from customer-facing rows.

## Surface 2: `/market` directory mode, Overview tab (`AeX402Directory.tsx`, `DirectoryMarketOverview.tsx`)

This is the default landing when no filters are set (`view=undefined` -> `overview`), i.e. what most first-time visitors see.

Trading-desk idioms found:
- Tab literally called "Overview" with a `ChartNoAxesCombinedIcon` (a stock-chart glyph) — `AeX402Directory.tsx:160`.
- Four-up KPI tile row: "Median listed price", price quantiles, adoption counts — `DirectoryMarketOverview.tsx:236-239`.
- `DirectoryAnalyticsCharts` renders bar-chart "Distribution" cards for price and adoption bands, plus a coverage "Gauge" grid — `DirectoryAnalyticsCharts.tsx:66-83`.
- `DirectoryLeaderboard`-style ranking with Trophy/Medal icons, a proportion meter bar, and momentum chips `▲ Rising` / `▼ Falling` in `success`/`destructive` colour variants — `DirectoryLeaderboard.tsx:296-301, 361-369` — this is a mover/gainer list with red/green deltas in all but name.
- `DirectoryAnalyticsCharts` "Momentum" card with `▲`/`▼` payer deltas — `DirectoryAnalyticsCharts.tsx:475-481`, `MomentumList` — `DirectoryAnalyticsCharts.tsx:127-144`.
- `DirectoryConcentration`: Herfindahl-index "concentration" gauge, "Low/Moderate/High concentration · HHI 0.xx" badge, top-3-share horizontal bar chart — `DirectoryConcentration.tsx:571-598` — this is unambiguous trading-desk vocabulary (market concentration analysis) on a customer-facing tab.
- "Last 30 days" reported-calls sparkline-adjacent meter and payer-delta arrows on the tool-detail aside — `DirectoryToolDetails.tsx:131` (activity section), `DirectoryLeaderboard.tsx:359-366` (proportion meter, `role="meter"`).

Airbnb analogue: none — Airbnb has no market-overview/analytics tab at all. The nearest honest analogue is a curated "Categories" or "Popular now" rail with no numbers attached, or this tab should not exist on the public surface.
Should show: replace with a plain curated rail (categories, a small number of editorially-picked Tools) with no charts, no deltas, no HHI. Keep adoption facts (if any) as a single quiet sentence, not a chart.

shadcn reuse: none of the chart/gauge pieces are shadcn — `Gauge` (`src/components/charts/gauge`) and `EvilBarChart` (`src/components/evilcharts/...`) are bespoke chart libraries, not shadcn/ui. `Card`, `Badge`, `Accordion` (`src/components/ui/accordion.tsx`) are shadcn and could hold a simplified, chart-free version.

## Surface 3: Directory tool card and grid (`DirectoryToolCard.tsx`, `AeX402Directory.tsx` toolGrid)

Trading-desk idioms found:
- "X Calls in 30 days" activity line with an `ActivityIcon` — `DirectoryToolCard.tsx:689` (line ref within file, `Returns…`/`Calls in 30 days` block).
- Grid default is a table (`layout ?? 'table'`) for indexed search results, with grid as the secondary option — `AeX402Directory.tsx:198`.

Airbnb analogue: listing card. Photo/icon, host name, one-line description, price per night (here: per Call), and a light trust cue.
Should show: `DirectoryToolCard` is close — icon, provider, description, price, tags. Drop the raw "Calls in 30 days" counter or fold it into a qualitative trust line ("Used recently" / Qualified Use count) rather than a bare number with an activity icon.

shadcn reuse: `Card`, `CardContent`, `CardFooter` (`src/components/ui/card.tsx`), `Badge`, `Button` — already the full basis of this card.

## Surface 4: Tool detail dialog (`DirectoryToolDetails.tsx`)

Trading-desk idioms found:
- "Last 30 days" Calls/Payers stat block reported inline — `DirectoryToolDetails.tsx:131`.
- Price shown as a bare "PROVIDER PRICE" figure with a payment-options `<details>` disclosure — `DirectoryToolDetails.tsx:120-124` — functionally fine, but no host/provenance framing above the fold.
- Opens as a `Dialog` (modal) rather than a distinct page/route — `DirectoryToolDetails.tsx:33-38`.

Airbnb analogue: listing page. Description, host, price, how to book, trust signals (reviews/verification), similar listings.
Should show: keep description, provider identity, price, "Use with your agent" call instructions (already present — `DirectoryToolDetails.tsx:105-106`), and add a visible trust line (Qualified Use count, provenance/last-verified) above the tabs, not buried in a Contract tab. Consider a real route (`/tools/$toolRef`-style) instead of a dialog so it can carry its own head/SEO and feel like a page, not a data drill-down. `AeToolCard`'s sibling route `src/components/ae/market/DirectoryToolDetails.tsx` and the separate `readPublicToolDetailRouteServer`-backed `/tools/$toolRef` route already exist and read more like a listing page — worth reconciling the two Tool-detail surfaces into one.

shadcn reuse: `Dialog`, `DialogHeader`, `DialogTitle`, `Tabs`, `Badge`, `Button` (all in `src/components/ui/`) already carry the current structure; a page version would reuse `Card`/`Tabs` instead of `Dialog`.

## Surface 5: `/for-providers` (host landing) (`for-providers.tsx`, `AeSupplyLanding.tsx`)

Trading-desk idioms found: none. This is already the closest surface to Airbnb's "become a host" page — plain numbered steps, a requirements list, source-fit cards, no charts or deltas.

Airbnb analogue: host onboarding / "become a host" landing.
Should show: no change needed; this is the model the other surfaces should be pulled toward.

shadcn reuse: none directly (uses `AeSite*` primitives), `Alert`/`Button` from `src/components/ui/`.

## Surface 6: `/` root redirect (`src/routes/index.tsx`)

Trading-desk idiom found: redirect always injects `window: '30d'` into the target search — `src/routes/index.tsx:9-13` — meaning every fresh visitor lands on a URL carrying a trading-desk time-window parameter even though the visible UI (in overview/directory mode) has no window selector control for it.

## docs/workflow/aecon-signals-proposal.md (headings only)

Confirms the trading-desk direction is intentional and roadmapped, not accidental: headings include "Real history", "Movers (derived from declared, across observations)", "AE-observed execution facts", "Chain-observed settlement", "Distribution: the data is itself a Tool". This proposal explicitly plans a "Movers" layer, which is the idiom the owner's brief asks the customer-facing surface to avoid — it may be intended as a separate paid data product, not the market UI.

## Decisions needed

1. Remove the `window` search param and its `30d` default from `/market` and the `/` redirect entirely, since no public control sets it?
2. Retire the customer-facing "Overview" analytics tab (KPI tiles, distribution charts, momentum, concentration/HHI) from `/market`, replacing it with a plain curated rail?
3. Remove the `▲ Rising` / `▼ Falling` momentum chips and red/green (`success`/`destructive`) colour coding from `DirectoryLeaderboard` and `DirectoryAnalyticsCharts` entirely, rather than restyling them?
4. Drop `AeToolTable`'s dense multi-column table from public search results, keeping only the `AeToolCard` grid for buyers (table reserved for owner/operator surfaces)?
5. Convert the Tool detail `Dialog` (`DirectoryToolDetails.tsx`) into a real listing page, and reconcile it with the existing `/tools/$toolRef` route so there is one Tool detail surface, not two?
6. Should `aecon-signals-proposal.md`'s "Movers" layer be explicitly scoped as an internal/paid data product, out of the customer-facing market UI, to avoid future re-introduction of this idiom?

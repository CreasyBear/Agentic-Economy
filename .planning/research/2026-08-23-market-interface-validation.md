# Market interface validation: familiar donors for `/market`

**Observed:** 2026-08-23
**Scope:** public, first-party marketplace and product interfaces; no signed-in screens, paid calls, or secondary UX commentary
**Decision target:** a familiar, trading-market-first front door for Agentic Economy without inventing a new marketplace grammar

## Verdict

The external evidence does **not** support an abstract prompt-led marketplace.

Across Coinbase, x402scan, Agentic Market, RapidAPI, GitHub Marketplace, Shopify App Store, AWS Marketplace, and the app stores, the repeatable pattern is:

1. Say what the market contains.
2. Expose inventory immediately.
3. Make price, activity or adoption, provider, and availability comparable.
4. Give every item one literal action: **Trade**, **Install**, **Try it**, **Test Endpoint**, or **View purchase options**.
5. Put conversational or agent-assisted discovery beside this structure, not in place of it.

The current question **“What should an agent get done?”** has no analogue in the validated marketplace donors. It describes the system's abstraction rather than the buyer's action. The closest live patterns use **“Search for an asset,” “Search APIs,” “Search apps, guides, and more,” “Describe the solution you're looking for,”** and **“find weather APIs… under $0.05.”**

The recommended `/market` grammar is therefore:

> **Browse and run APIs for agents.**
> Search by API, provider, or capability. Compare price, activity, and availability before you run one.

Use a trading-market layout for evidence and comparison, an app/API marketplace layout for catalog discovery, and a Perplexity-like input only as an optional search mode.

## What the live products actually do

### 1. x402-native market and explorer products

#### Agentic Market

The [Agentic Market home page](https://agentic.market/) opens with a market proposition (“Thousands of services. Zero API keys. Powered by x402”), then places payment evidence before inventory: payment volume, transactions, buyers/sellers, and a live “Payments Race.” It follows with a **Services Leaderboard**, featured bundles, three browse modes (**Services / Endpoints / Bundles**), filters, and the literal search label **“Search by service, domain, or capability…”**.

The [Exa service page](https://agentic.market/services/api-exa-ai) uses a conventional product-detail sequence:

- breadcrumb, service name, provider domain;
- category, network, average price per request, endpoint count;
- “What is Exa?” with a one-sentence outcome;
- Quickstart and **Make a Call**;
- example request and example response;
- endpoints with method, route, description, tags, 30-day calls and payers, price, and parameter table;
- similar services.

This is strong evidence for pairing market activity with executable inventory. It is also a warning: its homepage currently mixes an all-time headline with session chart scope, uses a decorative ticker/race, and labels a list “Leaderboard.” Those are source-specific choices, not necessary marketplace conventions.

#### x402scan

The live [x402scan overview](https://www.x402scan.com/) is the clearest current trading-market donor. Its global navigation is **Discover / All / Marketplace / Facilitators / Networks**, with an **All Chains** selector and command palette. The first data region is a compact 30-day market summary: **Transactions, Volume, Buyers, Sellers**. “Featured Services” is a dense table with **Server, Activity, Volume, Txns, Buyers, Latest, Chain**, and a per-row **Try it** action.

The [x402scan Marketplace](https://www.x402scan.com/resources) adds a 24-hour summary (**Active Merchants, New Merchants, Active Registered Merchants, Unique Buyers**) and inventory groups such as **Most Used**, **Search Servers**, **Crypto Servers**, **AI Servers**, and **Trading Servers**. “Most Used” is explicitly defined as “Ranked by number of successful requests.”

The [StableEnrich server detail](https://www.x402scan.com/server/b8a06bde-b6e8-4a10-b4e0-cc6a25fb9efb) presents:

- identity, version, one-sentence proposition, tags, and resource count;
- a literal **Try with AgentCash** action;
- 30-day transactions, volume, and buyers;
- a compact resource list with method, path, category, version, outcome, and price.

Safe donor: dense metrics, source scope, ranked inventory backed by a stated measure, concise resource rows, and a literal try action. Do not borrow its unlabeled numeric columns; Agentic Economy must name every measure.

#### x402all

[x402all](https://x402all.com/) makes its inventory explicit: **“Everything agents can buy.”** Search is concrete and supports intent plus price: **“find weather APIs, polymarket data, image generation under $0.05…”**. It exposes category chips, curated intent shelves (**Trading, Research, Media, Automation**), per-call prices, and category counts.

It also models evidence honesty unusually well. “Start here” is labeled **“Curated, not ranked,”** and “Hand-picked endpoints” says **“Not a live ranking — we don't track volume yet.”** Its stated detail anatomy is price, network, pay-to address, request/response hints, and use-case summary, followed by **Run on AXON**.

Safe donor: natural-language search over structured results, intent shelves, visible unit price, and explicit editorial-versus-ranked labels.

#### Coinbase x402 Bazaar

The official [Bazaar search API](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-resources) returns a service description, request schema, accepted payment details, last update, 30-day calls, unique payers, and last-called time; results are sorted by relevance and quality. The official [Agentic Wallet quickstart](https://docs.cdp.coinbase.com/agentic-wallet/mcp/quickstart) says its visual **Discover** tab browses services, filters by **category, price, or quality**, and lets the user copy a ready-to-use prompt for an agent. The [Bazaar MCP server](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/bazaar-mcp-server) exposes the same catalog through `search_resources` and `proxy_tool_call`.

This validates one catalog with both human and agent entry points. It does not validate a giant prompt as the sole public navigation model.

### 2. Trading and market-data donors

#### Coinbase

The public [Coinbase Explore](https://www.coinbase.com/explore) page says **“Explore crypto”** and uses the literal input **“Search for an asset.”** It then shows:

- a directional market statement;
- four compact market stats;
- a paginated, sortable table with asset, price, small chart, change, market cap, volume, and **Trade**;
- “Top movers” and “New on Coinbase.”

The public [Bitcoin detail](https://www.coinbase.com/price/bitcoin) keeps identity and **Buy Bitcoin** near the top, then adds chart state, trading insights, market stats, performance, history, news, explanations, and related assets.

Safe donor: compact comparison table, a small number of market-wide facts, time-windowed performance, item detail anchored by one action, and secondary discovery shelves. Do not borrow price-change coloration for metrics that are not gains/losses.

#### Robinhood

Robinhood's official [crypto detail guide](https://robinhood.com/us/en/support/articles/viewing-crypto/) documents the detail anatomy: chart with day/week/month/quarter/year intervals, position facts, recurring investments, news, and history. Its [buy/sell guide](https://robinhood.com/us/en/support/articles/360001339423/) starts from search, selects the asset, then offers **Buy / Sell**, amount, order type, review, and submit.

Safe donor: one focal chart, plain time ranges, one clear action panel, and supporting history/news below. Agentic Economy has no portfolio position or asset-return concept, so “holdings,” gains, and trading controls are invalid analogues. The closest valid equivalents are selected-operation activity, exact unit price, successful calls, Qualified Uses, and **Run**.

### 3. API and software marketplaces

#### RapidAPI Hub

The live [RapidAPI Hub](https://rapidapi.com/hub) header leads with **Search APIs**. Discovery is divided into **Collections** and **Categories**. The catalog cards expose category, API name, a concrete one-line outcome, provider, recency, rating, latency, and success percentage. The home page also separates **Top Categories**, a paginated API shelf, and curated collections such as **Recommended APIs**, **Popular APIs**, and **Free Public APIs**.

RapidAPI's official [consumer quickstart](https://docs.rapidapi.com/docs/consumer-quick-start-guide) defines the purchase journey:

1. search or browse categories/collections;
2. compare popularity score, average latency, and average success rate;
3. open the listing's **Endpoints** tab;
4. review endpoint documentation and code snippets;
5. choose pricing if required;
6. **Test Endpoint** and inspect the response in the browser;
7. copy an integration snippet.

Safe donor: search-first catalog, concrete comparison facts, try-before-integrate, and technical details inside the listing rather than on the catalog card.

#### AWS Marketplace

The public [AWS Marketplace search](https://aws.amazon.com/marketplace/search/results) uses **“Describe the solution you're looking for…”** but keeps **Agent Mode** as an adjacent mode. Its [feature documentation](https://aws.amazon.com/marketplace/features/) explicitly describes conventional search and product pages alongside agent mode, comparison, free trials, demos, and custom pricing.

The [Datadog listing](https://aws.amazon.com/marketplace/pp/prodview-7tlwraipohxq6/) places product name, seller, deployment context, rating, and actions (**View purchase options / Request private offer / Request demo**) before stable detail sections: **Overview, Features, Pricing, Legal, Usage, Resources, Support, Product comparison, Reviews**.

Safe donor: conversational discovery as a mode, not the whole IA; transparent seller/delivery facts; stable detail tabs; and actions matched to commercial readiness.

#### GitHub Marketplace

The public [GitHub Marketplace app catalog](https://github.com/marketplace?type=apps) opens with **“Enhance your workflow with extensions”**, search, type/category navigation, creator filters, and popularity sorting. Results show app name, object type, and a one-sentence workflow outcome.

The [CircleCI listing](https://github.com/marketplace/circleci) makes the buying facts explicit: product, outcome, publisher, installation count, **Add**, tags, a precisely defined **Verified** publisher badge, pricing, README/Transparency, setup instructions, supported languages, resources, plan details, and **Install it for free**.

GitHub's [installation documentation](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-github-marketplace-for-your-personal-account) confirms the action sequence: select a plan, choose **Install it for free / Buy with GitHub / Try free for 14 days**, review the order, choose the installation location and repository access, review permissions, then install.

Safe donor: outcome-oriented listings, adoption count, explicit publisher verification semantics, and a staged commitment flow. Never use “Verified” without publishing the exact verification claim.

#### Shopify App Store

The [Shopify App Store](https://apps.shopify.com/) uses **“Search apps, guides, and more”**, task-shaped categories, curated shelves, and cards with app name, rating and review count, price/free-trial status, one-line merchant outcome, and a **Built for Shopify** quality mark.

The [Custom Price Calculator listing](https://apps.shopify.com/custom-price-calculator) puts the familiar decision block above the fold: app name, quality badge, pricing, rating, developer, **Install**, **View demo store**, media gallery, and a concrete result statement (“Instant, accurate prices…”).

Safe donor: task-shaped categories, concise outcome copy, decision facts before description, screenshots/demo, and standards-backed quality badges.

### 4. Consumer app stores and evaluation products

The [Google Maps Play listing](https://play.google.com/store/apps/details?id=com.google.android.apps.maps) places icon, name, publisher, monetization note, rating/reviews, age rating, downloads, and **Install** before screenshots. It then presents **About this app, Data safety, Ratings and reviews, What's new, App support, More by this developer, Similar apps**.

The [Apple App Store listing](https://apps.apple.com/us/app/google-maps/id585027354) similarly leads with identity, a concrete subtitle, price, rating count, age rating, category rank, developer, language, size, and media before description, reviews, version history, privacy, and related apps.

[G2's Postman page](https://www.g2.com/products/postman/reviews) is an evaluation—not execution—donor. It leads with product/publisher, rating and review volume, then uses stable sections for **Product Information, Reviews, Discussions, Pricing, Features, Implementation**. It surfaces pricing, alternatives, integrations, media, review summaries, pros/cons, and review filters.

Safe donor: front-load decision facts, show media before long prose, separate trust/privacy/support, and provide alternatives/related inventory. Do not reproduce consumer-star ratings until Agentic Economy has a defensible review contract and moderation model.

### 5. Perplexity: useful, but only for the optional search mode

Perplexity's own [product page](https://www.perplexity.ai/hub) describes the loop as: ask a first question, receive a concise cited answer, drill in with follow-up questions, and save the thread. The [getting-started guide](https://www.perplexity.ai/help-center/en/articles/10354975-getting-started-with-perplexity) says simple two- or three-keyword searches work and distinguishes quick answers from a conversational Pro Search that asks for details.

This supports a plain-language search shortcut and follow-up refinement. It does **not** support replacing catalog browse, comparison, prices, provider identity, or availability with an open-ended prompt.

## Convergent patterns to borrow

| User question | Familiar pattern | Valid Agentic Economy rendering |
|---|---|---|
| What is here? | Coinbase table; RapidAPI/Shopify/GitHub catalogs | Inventory visible in first viewport |
| Can I find my use case? | Literal search + category chips | “Search APIs, tools, or providers” plus capability categories |
| Which one should I choose? | Price, activity/adoption, provider, quality/availability | Unit price, successful calls, Qualified Uses, supplier, current routeability |
| Can I trust it? | Defined verified/quality badge; reviews; privacy/support | Only real facts: admitted, routeable, last successful call, reconciliation state |
| What happens next? | Trade / Install / Try it / Test Endpoint | **Run** or **Try API**, depending on whether execution is real |
| How does it work? | Detail tabs/sections; example request/response | Outcome first; contract and schema collapsed below |
| Can an assistant help? | AWS Agent Mode and Perplexity follow-ups | Optional “Ask the market” mode returning the same structured results |

## Draft: trading-market-first `/market`

This draft uses only patterns observed above.

### Global header

- Product mark
- **Market**
- **Activity**
- **For suppliers**
- Search/command shortcut

Do not introduce both “providers” and “suppliers.” Use one public label everywhere.

### First viewport

```text
Market
APIs and tools agents can run

[ Search APIs, tools, or providers                              ]

[ All ] [ Data ] [ Search ] [ AI ] [ Trading ] [ Automation ]

x402 activity                                      [24H] [7D] [30D]
Transactions        Payment volume        Buyers        Sellers
source + indexed-through time

Available now
Service / Provider       Price       Successful calls       Last active       Status      Action
```

Why this is grounded:

- the literal noun + search pattern comes from Coinbase, RapidAPI, Shopify, and GitHub;
- compact market facts and time windows come from Coinbase, Robinhood, x402scan, and Agentic Market;
- the dense comparison list comes from Coinbase and x402scan;
- capability categories come from RapidAPI, Shopify, x402scan, and x402all;
- the row action comes from **Trade / Try it / Test Endpoint / Install**.

The first viewport should not contain a grand explanatory hero, a demand-posting form, an architecture glossary, or a raw DTO.

### Catalog behavior

- Default list: **Available now**, meaning currently routeable first-party Operations.
- Category, provider, price model, readiness/environment, and search filters.
- Sort only by facts the projection can answer without scanning: recency, exact unit price, successful-call count, or Qualified Uses.
- Use **Most used** only when it is explicitly backed by successful per-operation call counts, as x402scan does.
- Use **Featured** only for a visibly editorial collection, as x402all does. Never imply a ranking.
- Keep external Agentic Market services in a separately labeled panel. They must not be mixed into native search results.
- After an unsuccessful search, offer **Can't find it? Request an API.** Demand creation is the fallback, not the page's first instruction.

### Operation detail

```text
Breadcrumb

Name                                              $0.01 / call
One concrete outcome sentence                     Live
By Supplier                                       [ Run API ]

Calls     Qualified Uses     Completion rate     Last active
[ selected evidence chart: 24H / 7D / 30D ]

What it does
Expected result
Example input → example output

Usage and evidence
Related APIs

Technical details  [collapsed]
```

This combines Coinbase/Robinhood's focal chart and action, x402scan's resource facts, Agentic Market/RapidAPI's request-response examples, and the app stores' identity/provider/trust anatomy.

### Optional assisted search

Offer **Ask the market** as a mode or command—not the page title. A query such as “Find a web research API under $0.05” should return the same catalog rows, with filters applied and the interpretation made visible. This follows AWS Agent Mode, Perplexity follow-ups, x402all's intent search, and Coinbase Bazaar's human/agent dual interface.

## Evidence boundaries: what not to fake

- **No combined economy total.** External x402 payments and native Agentic Economy execution are different evidence classes.
- **No “trending.”** Coinbase can calculate price movement; Agentic Economy currently cannot infer demand from freshness or editor choice.
- **No “popular” or “most used” without a defined count and time window.**
- **No “verified.”** GitHub and Shopify publish the standard behind their marks; Agentic Economy must use exact operational facts instead.
- **No star ratings yet.** There is no observed AE review and moderation contract comparable to Shopify, Google Play, Apple, or G2.
- **No public uptime percentage unless the measurement window and probe semantics are real.** RapidAPI can expose latency/success because it operates that measurement system.
- **No Buy/Sell/portfolio metaphors.** The valid action is a bounded API run, not investment exposure.
- **No public wallet counterparties.** A payment explorer pattern does not require exposing addresses.
- **No agent prompt as a substitute for browse.** Every validated marketplace maintains inventory navigation even when it adds an agent mode.

## Copy recommendation

Use:

- **Market**
- **APIs and tools agents can run**
- **Search APIs, tools, or providers**
- **Available now**
- **Run API**
- **View details**
- **List an API**
- **Can't find it? Request an API**
- **x402 activity via Agentic Market**
- **Agentic Economy activity**

Avoid:

- “What should an agent get done?”
- “Describe the job”
- “Find Operations” as the primary public search instruction
- “Route through current supply”
- “Guided demand path”
- “Admitted catalog”
- “Total agent economy”

The internal domain can keep `Operation`; the public market needs a familiar class noun. The strongest external evidence favors **API**, **tool**, or **service**. If the team keeps “Operation” public for ubiquitous-language consistency, pair it with a concrete class label—**“API operation”**—and never ask a new visitor to infer what an Operation is.

## Sources

### x402 and agent markets

- [Agentic Market](https://agentic.market/)
- [Agentic Market — Exa service](https://agentic.market/services/api-exa-ai)
- [x402scan overview](https://www.x402scan.com/)
- [x402scan marketplace](https://www.x402scan.com/resources)
- [x402scan — StableEnrich](https://www.x402scan.com/server/b8a06bde-b6e8-4a10-b4e0-cc6a25fb9efb)
- [x402all](https://x402all.com/)
- [Coinbase Bazaar search resources](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-resources)
- [Coinbase Bazaar MCP server](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/bazaar-mcp-server)
- [Coinbase Agentic Wallet quickstart](https://docs.cdp.coinbase.com/agentic-wallet/mcp/quickstart)

### Trading and answer engines

- [Coinbase Explore](https://www.coinbase.com/explore)
- [Coinbase — Bitcoin detail](https://www.coinbase.com/price/bitcoin)
- [Robinhood — Viewing crypto details](https://robinhood.com/us/en/support/articles/viewing-crypto/)
- [Robinhood — Buy or sell crypto](https://robinhood.com/us/en/support/articles/360001339423/)
- [Perplexity product page](https://www.perplexity.ai/hub)
- [Perplexity getting started](https://www.perplexity.ai/help-center/en/articles/10354975-getting-started-with-perplexity)

### General marketplaces

- [RapidAPI Hub](https://rapidapi.com/hub)
- [RapidAPI consumer quickstart](https://docs.rapidapi.com/docs/consumer-quick-start-guide)
- [AWS Marketplace search](https://aws.amazon.com/marketplace/search/results)
- [AWS Marketplace features](https://aws.amazon.com/marketplace/features/)
- [AWS Marketplace — Datadog](https://aws.amazon.com/marketplace/pp/prodview-7tlwraipohxq6/)
- [GitHub Marketplace apps](https://github.com/marketplace?type=apps)
- [GitHub Marketplace — CircleCI](https://github.com/marketplace/circleci)
- [GitHub app installation flow](https://docs.github.com/en/apps/using-github-apps/installing-a-github-app-from-github-marketplace-for-your-personal-account)
- [Shopify App Store](https://apps.shopify.com/)
- [Shopify App Store — Custom Price Calculator](https://apps.shopify.com/custom-price-calculator)
- [Google Play — Google Maps](https://play.google.com/store/apps/details?id=com.google.android.apps.maps)
- [Apple App Store — Google Maps](https://apps.apple.com/us/app/google-maps/id585027354)
- [G2 — Postman](https://www.g2.com/products/postman/reviews)

## Method and limitations

- Public HTML was read directly where possible; client-rendered RapidAPI and x402scan surfaces were inspected in a live browser.
- No account was used and no purchase, install, API call, wallet connection, or form submission was made.
- Page labels and inventory can change after the observation date.
- Marketplace telemetry is reported as source-owned evidence; this note does not independently reconcile transaction or adoption counts.
- G2 is included as a direct observation of G2's evaluation interface, not as an authoritative source for Postman's product claims.

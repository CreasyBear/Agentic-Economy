# Who pays for bounded data and answers today?

**Status:** Research complete  
**Decision affected:** Whether AE pursues the latent-capacity formation-layer wedge  
**Evidence cutoff:** 2026-07-22

## Executive verdict

**Demand for the thesis's unit of exchange is partially proven, specifically:** businesses demonstrably pay for bounded, machine-consumable facts, identity/risk determinations, records and API calls when the result enters a recurring, high-value workflow and the seller accepts accountability for provenance, freshness or compliance. Demand is strongest in underwriting, fraud/KYC, investment research, sales enrichment and asset history. It is **not** proven that buyers want a horizontal market of newly exposed small-business knowledge, that autonomous agents rather than developers or procurement teams are the economic buyer, or that one-off micropayments can replace subscriptions and negotiated licences. The observed market is mostly existing demand delivered through contracts, subscriptions or committed-volume API plans; x402 and agent-commerce announcements prove rail availability more than durable demand.

Labels used below: **OBSERVED** means the cited source was inspected; **INFERRED** is analysis from observed facts; **UNKNOWN** means the requested number was not publicly disclosed. Prices are vendor list prices unless stated; enterprise buyers commonly negotiate.

## What the marketplace numbers actually show

|Surface|Observed supply/demand evidence|Revenue or transaction disclosure|Interpretation|
|---|---|---|---|
|AWS Data Exchange|**OBSERVED (2026):** AWS advertises 3,500+ third-party datasets, 300+ providers, and 1,000+ free datasets ([AWS](https://aws.amazon.com/data-exchange/)).|**UNKNOWN:** Amazon does not separately report Data Exchange GMV, paid subscribers or revenue in its annual report ([Amazon 2025 10-K](https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm)).|A large catalogue exists, but 29%+ of listed supply is free and catalogue size is not transaction proof.
|Snowflake Marketplace|**OBSERVED:** Snowflake describes paid listings and usage-based pricing, private offers, and direct access without copying data ([paid listings docs](https://docs.snowflake.com/en/collaboration/provider-listings-about), [pricing models](https://docs.snowflake.com/en/collaboration/provider-listings-pricing-model)).|**UNKNOWN:** Snowflake reports total product revenue and customers, but does not isolate Marketplace GMV, buyers or seller revenue in its FY2025 10-K ([SEC](https://www.sec.gov/Archives/edgar/data/1640147/000164014725000052/snow-20250131.htm)).|The channel is real; marketplace-specific demand remains opaque.
|Databricks Marketplace|**OBSERVED:** Databricks supports free listings and private exchanges; its documentation says public Marketplace listings are free and paid monetisation can occur through private exchanges ([docs](https://docs.databricks.com/aws/en/marketplace/)).|**UNKNOWN:** no audited Marketplace GMV, buyer count or seller revenue found.|More distribution surface than transparent exchange.
|Dawex|**OBSERVED:** Dawex sells data-exchange software and explicitly supports private/corporate ecosystems ([Dawex](https://www.dawex.com/)).|**UNKNOWN:** no public transaction volume or GMV.|Evidence that organisations pay for exchange infrastructure, not that an open marketplace clears.
|Datarade|**OBSERVED:** Datarade presents a discovery platform and supplier catalogue ([Datarade](https://datarade.ai/)).|**UNKNOWN:** no audited buyer count, GMV or seller revenue found.|Lead generation/catalogue evidence only.

**INFERRED:** The absence of marketplace GMV across five prominent operators is itself material. Public-cloud vendors disclose catalogue breadth because it is favourable, but not the paid/free mix or marketplace take. The defensible conclusion is “channels exist,” not “horizontal data marketplaces exhibit strong liquidity.”

### The graveyard and pivots

- **OBSERVED (stale, 2017):** Microsoft instructed Translator API customers to move subscriptions from Azure DataMarket to Azure by 30 April 2017 ([Microsoft](https://www.microsoft.com/en-us/translator/blog/2017/04/10/reminder-move-translator-api-subscriptions-from-datamarket-to-azure-before-april-30-2017/)). The 2010 launch positioned DataMarket as a broad data discovery and purchasing layer ([Microsoft Learn archive](https://learn.microsoft.com/en-us/archive/msdn-magazine/2010/november/msdn-magazine-microsoft-azure-marketplace-datamarket-introducing-datamarket)). **INFERRED:** a general marketplace did not remain the preferred product boundary; valuable APIs migrated into first-party Azure products.
- **OBSERVED (possibly stale):** Xignite now sells a managed financial-data cloud/API platform, not a broad third-party marketplace ([Xignite](https://www.xignite.com/)). **INFERRED:** vertical expertise and service-level accountability won over generic exchange mechanics.
- **OBSERVED:** DataMarket.com is no longer an operating independent data marketplace. **UNKNOWN:** no primary shutdown post or transaction history was found; causal claims would be speculation.
- **OBSERVED:** Banjo’s public-sector surveillance contracts collapsed after Utah suspended the contract in 2020; the Utah Attorney General’s review described insufficient evidence that the promised system worked as represented ([Utah AG report](https://attorneygeneral.utah.gov/wp-content/uploads/2020/08/Banjo-Report.pdf), pre-2024). **INFERRED:** this is principally a governance/proof failure, not clean evidence about marketplace liquidity.
- **OBSERVED:** Narrative still presents a data-commerce platform and “Data Shops,” rather than being clearly dead ([Narrative](https://www.narrative.io/)). **UNKNOWN:** current GMV and customer count. The honest status is opaque/stalled-looking, not proven defunct.

The common failure mode is not “nobody buys data.” It is that horizontal discovery does not remove evaluation, rights, integration, freshness and liability work. Vertical vendors package those burdens into the product.

## Who pays: buyer jobs to be done

|Buyer persona and job|Evidence of spend / volume|Current channel and unit|What they are really buying|
|---|---|---|---|
|Quant funds: improve signal before competitors|**OBSERVED (industry estimate, not audited):** Neudata estimated investment-manager alternative-data spend could exceed **$15.4bn in 2025** ([Neudata release](https://www.prnewswire.com/news-releases/alternative-data-spending-by-investment-management-firms-could-top-15-4bn-in-2025--according-to-neudatas-latest-report-302384650.html)). Source quality: specialist vendor estimate with commercial incentives, useful directionally only.|Annual dataset licences, feeds and expert/data subscriptions; sometimes API usage.|Exclusivity, history, point-in-time correctness and legal diligence—not raw rows.
|Insurers: price and adjudicate risk|**OBSERVED:** LexisNexis C.L.U.E. Auto provides up to seven years of personal-auto claims history to insurers ([CLUE Auto](https://risk.lexisnexis.com/products/clue-auto)); C.L.U.E. Property similarly packages loss history ([CLUE Property](https://risk.lexisnexis.com/products/clue-property)).|Per-order/report under enterprise contracts; prices undisclosed.|A decision-grade claims answer with permissible-purpose controls and dispute processes.
|Lenders/fintechs: verify identity, account and income|**OBSERVED:** Plaid says it served 12,000+ financial institutions and 100m+ users and reported positive operating cash flow in 2025 ([2025 shareholder letter](https://plaid.com/2025-shareholder-letter/)).|Per successful connection, per request or subscription depending product ([billing docs](https://plaid.com/docs/account/billing/)).|Consent, connectivity, normalisation and ongoing reliability.
|AI companies: ground, train and evaluate models|**OBSERVED:** AWS offers files, tables and APIs including labelled media and diagnostic data; more than 1,000 datasets are free ([AWS](https://aws.amazon.com/data-exchange/)). **UNKNOWN:** paid AI-specific spend.|Licences, bulk datasets, API calls, and human-evaluation contracts.|Rights-cleared provenance and coverage; per-call is only one channel.
|Sales/revenue teams: identify and enrich prospects|**OBSERVED:** People Data Labs meters Person Enrichment and Person Identify in credits and publishes self-serve plans ([pricing overview](https://support.peopledatalabs.com/hc/en-us/articles/23553812020891-Pricing-Overview), [credit rules](https://support.peopledatalabs.com/hc/en-us/articles/25794271805211-Pricing-credits)).|Monthly committed credits; unit consumption per match/record.|Match quality, coverage and permissible use.
|Site selection / commercial real estate: compare locations and property risk|**OBSERVED:** CoreLogic sells property information, valuation and risk products; Equifax Australia sells property valuation and land-title products ([CoreLogic AU](https://www.corelogic.com.au/), [Equifax land titles](https://www.equifax.com.au/business-enterprise/products/land-titles)). **UNKNOWN:** public enterprise spend.|Per report/search plus enterprise platform subscriptions.|Decision-ready records joined across title, valuation and hazard sources.
|Supply-chain/procurement teams: detect counterparty and disruption risk|**OBSERVED:** AWS Data Exchange lists financial, manufacturing and retail datasets and API delivery ([AWS](https://aws.amazon.com/data-exchange/)). **UNKNOWN:** marketplace spend by this persona.|Annual feeds and API contracts; due-diligence reports per entity.|Freshness, entity resolution, monitoring and recourse.
|Compliance/fraud teams: pass or fail a person/business|**OBSERVED:** Trulioo reports coverage across 195 countries and a platform spanning person and business verification ([Trulioo](https://www.trulioo.com/)); Persona publishes per-verification pricing tiers and volume discounts ([Persona pricing](https://withpersona.com/pricing/)).|Per verification, often with monthly minimums and add-on database checks.|An auditable determination, orchestration and regulatory evidence.

**JTBD finding — INFERRED:** all eight buyers hire data to reduce the expected cost of a decision: bad underwriting, missed alpha, fraud, wasted sales labour, site mispricing or compliance failure. They do not primarily hire “access.” A new bounded product is plausible only where it collapses a costly decision step and can state its provenance, permitted use, freshness and failure policy.

## Willingness-to-pay ladder

Exact public prices are scarcer than product pages imply. The table separates observed list prices from undisclosed enterprise pricing rather than inventing comparables.

|Tier|Example bounded unit|Published anchor|Price-to-decision-value interpretation|
|---|---|---:|---|
|Commodity machine lookup|akta private-market data request|**OBSERVED:** **US$0.125/request** advertised by akta/Monid ([akta](https://akta.pro/)).|Tiny share of research labour; low liability and easy retry.
|Person/company enrichment|People Data Labs match/enrichment credit|**OBSERVED:** credit-metered self-serve plans; exact effective unit price varies by plan and endpoint ([PDL pricing](https://support.peopledatalabs.com/hc/en-us/articles/23553812020891-Pricing-Overview)).|Cents to low dollars are supportable when multiplied across outbound workflows.
|Bank-data fact|Plaid account/transaction request|**OBSERVED:** per-request, one-time and subscription fee types exist; public US page requires product/volume selection and enterprise quote ([Plaid pricing](https://plaid.com/pricing/), [billing](https://plaid.com/docs/account/billing/)).|Priced below avoided manual verification and fraud loss.
|Identity determination|Persona verification|**OBSERVED:** self-serve and volume-based per-verification pricing is published on Persona’s pricing surface ([Persona](https://withpersona.com/pricing/)).|Dollars are credible because failure blocks onboarding or creates regulatory exposure.
|Australian credit/business check|Equifax SwiftCheck report|**OBSERVED:** Equifax publishes report comparison and pay-per-report purchase paths ([SwiftCheck](https://equifax.com.au/swiftcheck/reports/compare-reports)).|Tens of AUD can be rational against trade-credit loss.
|Legal/corporate record search|LexisNexis corporate/legal search|**OBSERVED:** per-search and document price schedules exist ([LexisNexis schedule](https://www.lexisnexis.com/en-us/terms/SACommercial/pricing.page)).|Higher price follows source authority and legal workflow value.
|Vehicle-history answer|CARFAX vehicle report|**OBSERVED:** CARFAX sells individual and multi-report packages directly ([CARFAX](https://www.carfax.com/vehicle-history-reports/)).|A report worth tens of dollars protects a purchase worth thousands.
|Property/title/valuation answer|CoreLogic/Equifax AU report|**OBSERVED:** products are sold as bounded reports/searches, but current public enterprise prices were not found ([CoreLogic](https://www.corelogic.com.au/), [Equifax valuation](https://www.equifax.com.au/business-enterprise/products/property-valuation)).|Potentially high unit value where mortgage/property decisions are six figures; price is contract-dependent.

Clearbit is now integrated into HubSpot as Breeze Intelligence and priced through HubSpot credits rather than a clean public per-call tariff ([HubSpot](https://www.hubspot.com/products/artificial-intelligence/breeze-intelligence)). Plaid, LexisNexis, CoreLogic and Equifax frequently obscure enterprise rates. **INFERRED:** price opacity signals segmentation and negotiation, and weakens any claim that autonomous spot purchasing is already the dominant channel.

### Price-per-decision-value ratio

**INFERRED:** the useful metric is $p/L$, where $p$ is unit price and $L$ is the expected loss or labour avoided. A $0.125 lookup can be attractive if it saves one minute; a $30–$50 vehicle/history report can be attractive before a $20,000 purchase; a verification costing dollars can be attractive against hundreds in acquisition cost or fraud. Formation should start with units where $p$ is visibly below 1–5% of conservative decision value, not with what is technically easy to expose. **UNKNOWN:** the akta unit’s retention, gross volume and buyer ROI are undisclosed.

## Verification and the answer economy

Plaid, Trulioo, Persona, C.L.U.E. and CARFAX prove a narrower proposition than “all latent knowledge is tradable.”

1. **OBSERVED:** they sell a bounded output—connected account data, identity pass/evidence, claims history or vehicle history—rather than forcing every buyer to acquire a raw database ([Plaid Identity Verification](https://plaid.com/docs/identity-verification/), [Trulioo](https://www.trulioo.com/), [Persona](https://withpersona.com/), [C.L.U.E.](https://risk.lexisnexis.com/products/clue-auto), [CARFAX](https://www.carfax.com/vehicle-history-reports/)).
2. **INFERRED:** accountability creates pricing tiers. Commodity enrichment promises a likely match. Verification adds source checks, consent, audit trail, dispute handling, fraud rules and sometimes regulatory representations. The buyer pays for reduced residual uncertainty and a defensible process.
3. **OBSERVED:** the channel is usually an API under an account, contract, credits or minimum commitment—not a fresh payment attached to every HTTP request. This proves unit economics, not open-agent commerce.
4. **INFERRED:** a formation layer must specify “what happens when this answer is wrong?” before pricing. Without recourse, provenance and confidence, it is merely data exhaust.

## Agent-side payment rails: announced versus transacting

|Evidence|Status|What it proves|
|---|---|---|
|Coinbase launched x402 on 6 May 2025 with collaborators including AWS, Anthropic, Circle and NEAR; it describes paid API and metered-service use cases ([Coinbase](https://www.coinbase.com/en-au/developer-platform/discover/launches/x402)).|**OBSERVED announcement.**|Protocol availability and ecosystem intent, not buyer retention.
|Chainalysis analysed x402 activity and reported that transaction counts grew rapidly but much activity was concentrated and low-value ([Chainalysis](https://www.chainalysis.com/blog/x402-agentic-payments-adoption/)).|**OBSERVED third-party chain analysis, not audited Coinbase revenue.**|On-chain transactions occurred; raw count should not be equated with unique economic buyers or agent autonomy.
|Stripe and OpenAI launched Instant Checkout and the Agentic Commerce Protocol, initially for US Etsy sellers and later Shopify merchants ([Stripe](https://stripe.com/newsroom/news/stripe-openai-instant-checkout), [OpenAI](https://openai.com/index/buy-it-in-chatgpt/)).|**OBSERVED live product announcement; transaction volume UNKNOWN.**|Agents/chat interfaces can initiate mainstream checkout, mainly for conventional goods.
|Stripe announced agentic-commerce tooling and Microsoft Copilot support ([Stripe](https://stripe.com/newsroom/news/microsoft-copilot-and-stripe)).|**OBSERVED partnership; GMV UNKNOWN.**|Distribution commitment, not demand for novel bounded knowledge.
|Agentic Market lists machine-purchasable services ([Agentic Market](https://agentic.market/)).|**OBSERVED operating catalogue; buyer count, GMV and repeat rate UNKNOWN.**|Discovery surface exists.
|Monid/akta advertises $0.125 private-market requests ([akta](https://akta.pro/)).|**OBSERVED price and product claim; funding, paid volume and retention UNKNOWN.**|A concrete offer exists, not yet independently evidenced traction.

**INFERRED:** x402 transaction counts can be inflated by demos, loops, self-payments and tiny values. The decisive metrics are distinct paying principals, repeat cohorts, supplier net revenue, useful-result rate and spend authorised by a human objective. No primary disclosure found establishes those for Agentic Market or Monid.

## Ansoff classification

- **Existing product / existing demand (market penetration):** enrichment, KYC, credit, vehicle and claims reports moved through APIs. **OBSERVED/INFERRED:** safest wedge; formation improves packaging or channel.
- **Existing product / new channel (market development):** agents buying current APIs through x402 or ACP. **INFERRED:** rails may reduce procurement friction, but billing migration alone is not new value.
- **New product / existing demand (product development):** a logistics operator turns internal feasibility knowledge into one auditable answer for an existing shipper decision. **INFERRED:** this is the strongest version of the thesis and still needs field proof.
- **New product / new demand (diversification):** autonomous agents discover and buy knowledge nobody previously budgeted for. **UNKNOWN:** highest upside, lowest evidential support.

AE should describe the initial thesis as **new product into existing, costly decisions**, not “new demand.”

## Disconfirming evidence

1. **OBSERVED:** the largest marketplace operators do not disclose marketplace GMV, paid-buyer counts or seller earnings. Catalogue counts are therefore poor demand evidence.
2. **OBSERVED:** AWS has 1,000+ free datasets among 3,500+ total. Free supply is substantial and may anchor buyers at zero.
3. **OBSERVED:** Azure DataMarket was retired/migrated; surviving vendors tend to be vertical or infrastructure providers. Horizontal discovery alone has a weak historical record.
4. **OBSERVED:** dominant verification vendors use accounts, contracts, subscriptions, credits and committed volumes. Per-unit metering does not imply spot purchasing.
5. **OBSERVED:** x402 and ACP sources disclose partnerships and protocol mechanics but little audited GMV, repeat purchase or unique-buyer evidence.
6. **INFERRED:** high-value suppliers may fear cannibalisation, privacy leakage, adverse selection and loss of informational advantage. The economically best latent capacity may be precisely what firms refuse to externalise.
7. **INFERRED:** transaction costs move rather than vanish: buyers still need rights review, schema mapping, quality evaluation, recourse and integration. Agents can automate parts but cannot manufacture authority.
8. **UNKNOWN:** no evidence found that small Australian businesses have recurring buyer demand for machine-priced internal knowledge at a level covering formation, assurance and support costs.

## Base rates

There is no reliable published denominator for attempted data marketplaces or agent-native capacity products. That makes a numeric startup success rate **UNKNOWN**, and inventing one would be false precision. The observable comparison set is asymmetric:

- **OBSERVED:** durable scaled businesses cluster in vertical, recurring decisions: Plaid (financial connectivity), LexisNexis C.L.U.E. (insurance claims), CARFAX (vehicle history), CoreLogic (property), identity/KYC vendors and financial-data APIs.
- **OBSERVED:** broad marketplaces can accumulate thousands of listings, yet their operators do not isolate GMV and often include large free catalogues.
- **OBSERVED:** at least one prominent general market, Azure DataMarket, disappeared as a standalone boundary; Xignite’s durable proposition is vertical managed financial data.
- **INFERRED:** the base-rate-favoured company is a vertical answer provider with embedded workflow and repeat use, not a neutral horizontal catalogue. A formation layer improves its odds only if it repeatedly discovers similar high-value jobs and standardises assurance—not if every supplier requires bespoke consulting.

A practical base-rate gate is therefore empirical: in one vertical, recruit 10 credible buyers, obtain at least three paid trials, see at least two repeat without founder chasing, and show supplier gross margin after verification/support. These are proposed falsification thresholds, not observed industry norms.

## What this kills or narrows

- Kills “marketplace catalogue size proves demand.”
- Kills “x402 adoption proves autonomous buyers.”
- Narrows the unit from any dormant datum to a recurring, decision-changing answer with provenance and recourse.
- Narrows the first buyer to a budget owner already paying for data, verification or manual research.
- Narrows the first Ansoff move to new packaging/channel for existing demand; new-demand creation stays an option, not the forecast.
- Narrows pricing to a small fraction of avoided loss/labour, with subscriptions or commitments permitted where procurement requires them.
- Kills a payment-rail-first wedge. Formation and assurance are the unproven work; rails are increasingly available.

## Open questions only fieldwork can answer

1. Which recurring decisions currently trigger an analyst, broker, phone call or spreadsheet that buyers will replace with a bounded answer?
2. What budget owns that job, and what was actually spent in the last 12 months—not stated willingness to pay?
3. What minimum provenance, freshness, confidence, insurance or contractual recourse changes a result from “interesting” to usable?
4. Will suppliers expose the answer after seeing cannibalisation, privacy and liability terms?
5. Do buyers prefer per-call, prepaid credits, minimum commitments or subscriptions once usage is recurrent?
6. What percentage of paid answers cause a decision, and what percentage are retried, disputed or ignored?
7. Can formation and ongoing assurance be standardised enough that contribution margin improves with each supplier?
8. Do agents discover incremental demand, or merely execute purchases already selected and budgeted by humans?

## Sources

- https://aws.amazon.com/data-exchange/
- https://www.sec.gov/Archives/edgar/data/1018724/000101872426000004/amzn-20251231.htm
- https://docs.snowflake.com/en/collaboration/provider-listings-about
- https://docs.snowflake.com/en/collaboration/provider-listings-pricing-model
- https://www.sec.gov/Archives/edgar/data/1640147/000164014725000052/snow-20250131.htm
- https://docs.databricks.com/aws/en/marketplace/
- https://www.dawex.com/
- https://datarade.ai/
- https://www.microsoft.com/en-us/translator/blog/2017/04/10/reminder-move-translator-api-subscriptions-from-datamarket-to-azure-before-april-30-2017/
- https://learn.microsoft.com/en-us/archive/msdn-magazine/2010/november/msdn-magazine-microsoft-azure-marketplace-datamarket-introducing-datamarket
- https://www.xignite.com/
- https://attorneygeneral.utah.gov/wp-content/uploads/2020/08/Banjo-Report.pdf
- https://www.narrative.io/
- https://www.prnewswire.com/news-releases/alternative-data-spending-by-investment-management-firms-could-top-15-4bn-in-2025--according-to-neudatas-latest-report-302384650.html
- https://risk.lexisnexis.com/products/clue-auto
- https://risk.lexisnexis.com/products/clue-property
- https://plaid.com/2025-shareholder-letter/
- https://plaid.com/docs/account/billing/
- https://plaid.com/docs/identity-verification/
- https://support.peopledatalabs.com/hc/en-us/articles/23553812020891-Pricing-Overview
- https://support.peopledatalabs.com/hc/en-us/articles/25794271805211-Pricing-credits
- https://www.corelogic.com.au/
- https://www.equifax.com.au/business-enterprise/products/land-titles
- https://www.equifax.com.au/business-enterprise/products/property-valuation
- https://equifax.com.au/swiftcheck/reports/compare-reports
- https://www.trulioo.com/
- https://withpersona.com/pricing/
- https://www.lexisnexis.com/en-us/terms/SACommercial/pricing.page
- https://www.carfax.com/vehicle-history-reports/
- https://www.hubspot.com/products/artificial-intelligence/breeze-intelligence
- https://www.coinbase.com/en-au/developer-platform/discover/launches/x402
- https://www.chainalysis.com/blog/x402-agentic-payments-adoption/
- https://stripe.com/newsroom/news/stripe-openai-instant-checkout
- https://openai.com/index/buy-it-in-chatgpt/
- https://stripe.com/newsroom/news/microsoft-copilot-and-stripe
- https://agentic.market/
- https://akta.pro/

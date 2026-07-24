# Latent-capacity business models

**Status:** Research complete  
**Decision affected:** Whether AE pursues the latent-capacity formation-layer wedge  
**Evidence cutoff:** 2026-07-22

## Research question and method

Which business-model shape can turn unpackaged internal capacity into bounded, priced, accountability-backed products without assuming that a catalogue itself creates a market?

Claims are labelled **OBSERVED** when the cited source was read, **INFERRED** when derived from evidence, and **UNKNOWN** where public evidence is insufficient. Scores are comparative judgements, not measured facts: 1 is structurally poor/high-risk and 5 structurally strong/low-risk. Pre-2024 sources are flagged as possibly stale.

The assessment applies six lenses. **OBSERVED:** Gurley’s ten marketplace factors are new-experience value, economic advantage, opportunity to expand the market, frequency, payment flow, network effects, higher supplier leverage, fragmentation, friction and take rate ([Above the Crowd, 2012; possibly stale](https://abovethecrowd.com/2012/11/13/all-markets-are-not-created-equal-10-factors-to-consider-when-evaluating-digital-marketplaces/)). **OBSERVED:** Rochet and Tirole model platforms as choosing a *price structure*, not merely a total price; the side generating stronger cross-side benefit or greater price sensitivity is normally subsidised ([paper, 2003; possibly stale](https://www.tse-fr.eu/sites/default/files/medias/doc/wp/2002/platform.pdf)). **OBSERVED:** Arrow identified the disclosure problem: a buyer cannot value information before seeing it, but disclosure can destroy exclusivity ([NBER chapter, 1962; possibly stale](https://www.nber.org/books-and-chapters/rate-and-direction-inventive-activity-economic-and-social-factors/economic-welfare-and-allocation-resources-invention)). **OBSERVED:** Chen’s cold-start frame requires a small “atomic network” that is useful before scaling ([book extract, 2022; possibly stale](https://andrewchen.com/wp-content/uploads/2022/01/ColdStartProb_9780062969743_AS0928_cc20_Final.pdf)).

## Six candidate models, precisely defined

|Model|Revenue mechanics and payer|Gross-margin shape|Capital need|What can compound|
|---|---|---|---|---|
|A. Brokerage / marketplace|Buyer pays transaction price; platform retains take-rate and remits balance to holder. Optional buyer access or seller listing fees are secondary.|High incremental margin after trust, billing and support, but only after liquidity; low revenue per failed match.|Moderate platform spend; high commercial spend to acquire both sides.|Transaction history, demand graph, reputation, standard contracts and liquidity—if transactions stay on-platform.|
|B. Formation-as-a-service|Holder pays a scoped engagement fee to inventory, clean, permission, package, price and launch one product; optional retainer or success fee.|Consulting-like: positive early revenue but labour constrains margin and scale.|Low software capital, high expert labour and working-capital need.|Templates, vertical playbooks and buyer knowledge; weak unless engagements create reusable rights/data.|
|C. Underwriter / publisher|Company licenses holder capacity, funds formation, sells products in its own catalogue, then pays royalties or minimum guarantees.|Digital resale can be high-margin after recovery, but acquisition, curation and amortisation precede uncertain sales.|High: advances, diligence, product build, indemnity and demand risk.|Exclusive rights, a reusable library, outcome history, brand and distribution.|
|D. Holder SaaS / PLG|Holders pay subscription or usage fees for self-serve ingestion, governance, product definition, metering and delivery.|Software-like at scale, but onboarding and data integration can hide services costs.|Moderate product/integration spend; low inventory financing.|Workflow lock-in, schemas, integrations and benchmarking data—not transaction liquidity by default.|
|E. Contributory database|Industry members contribute standardised records and buy reports/benchmarks; fees are subscriptions, per-query charges or membership assessments.|Very high once contribution, normalization and compliance infrastructure are established.|High and patient: governance, coverage, matching, dispute handling and regulated-data controls.|Coverage, longitudinal history, reciprocal participation and workflow embedding.|
|F. Vertical data-products company|Choose one decision and sector; license/collect source data, form a proprietary product, sell recurring access or per-decision outputs.|Potentially high recurring margin; meaningful data, domain-sales and product costs.|Moderate-high, but bounded to one buyer/supply loop.|Proprietary dataset, domain ontology, outcome labels, distribution and switching costs.|

## Scored comparison

The “Gurley 10” score is the aggregate structural fit of all ten factors, not ten hidden sub-scores. Rochet–Tirole scores whether the model has a coherent and affordable subsidy. Arrow scores how well previews, provenance, samples, warranties or derived outputs permit evaluation without giving away the asset. Capital scores 5 for least capital-intensive.

|Rank|Model|Gurley 10|Subsidy logic|Arrow handling|Cold start|Capital|Defensibility|Total /30|
|---:|---|---:|---:|---:|---:|---:|---:|---:|
|1|F. Vertical data products|4|4|4|4|3|5|24|
|2|B. Formation-as-a-service|3|3|4|5|5|2|22|
|3|E. Contributory database|4|5|5|1|1|5|21|
|4|C. Underwriter / publisher|4|4|5|3|1|4|21|
|5|D. Holder SaaS / PLG|2|2|3|3|4|3|17|
|6|A. Brokerage / marketplace|3|2|2|1|3|4|15|

### A. Brokerage / marketplace — 15/30

**INFERRED:** Brokerage benefits from fragmented supply, payment capture and potential cross-side effects, but latent capacity is low-frequency, non-standard and hard to inspect. That weakens Gurley’s frequency, friction and take-rate factors simultaneously: heavy diligence must be funded from sporadic transactions. The logical subsidy is free formation for scarce holders, yet doing that for many holders before buyer demand makes the marketplace absorb consulting costs without publisher economics. Arrow remains severe because listing metadata rarely proves data quality or decision value. The cold start needs several holders *and* repeat buyers in one narrow category.

**OBSERVED:** Dawex describes data-exchange technology and announced a €5m raise in 2019, but does not publish marketplace GMV, take rate or profitable liquidity ([Dawex, 2019; possibly stale](https://www.dawex.com/en/news/20190523-dawex-raises-5-millions-accelerate-development-data-economy/)). Datarade’s current company page presents a discovery/platform business, while Narrative offers a data marketplace, but neither publishes audited transaction outcomes ([Datarade](https://datarade.ai/company); [Narrative](https://next.narrative.io/products/data-marketplace)). **UNKNOWN:** whether any of these has durable transaction liquidity rather than enterprise software/services revenue. Absence of disclosed GMV is not proof of failure, but it prevents using them as validated take-rate analogues.

### B. Formation-as-a-service — 22/30

**INFERRED:** This model has the easiest cold start: one holder and one identified buyer can form an atomic network, and a paid engagement resolves Arrow through staged discovery, samples, acceptance tests and contractual warranties. It can charge holders immediately rather than subsidising both sides. Its weakness is economic: the work—permissions, ontology, cleaning, liability and sales—is bespoke. Gurley’s scale and network-effect factors are modest; expertise walks out the door and clients can internalise it.

**OBSERVED:** Accenture’s FY2025 10-K reports $69.67bn revenue and $22.84bn cost of services, implying about 67.2% gross margin before sales/general costs, while operating income was $9.18bn, about 13.2% of revenue ([Accenture 2025 10-K](https://www.accenture.com/content/dam/accenture/final/accenture-com/document-4/Accenture-2025-10-K.pdf)). This is broad consulting, not a pure data-formation comparable, but it shows the gap between project gross margin and operating margin after the delivery/sales machine. **INFERRED:** services are a viable learning and cash-flow entry, not a proven terminal moat. Every engagement should produce a reusable permission pattern, schema or product right—or AE is simply a consultancy.

### C. Underwriter / publisher — 21/30

**INFERRED:** The publisher can solve Arrow better than an open listing by selling standardised derived products, samples and accountable outputs while protecting raw source. Royalties align holders; minimum guarantees may secure exclusivity. It can subsidise holders because it captures downstream margin. But it assumes inventory risk and must choose products correctly before sales evidence.

**OBSERVED:** TGS’s multi-client model funds/acquires seismic surveys once and licenses the library repeatedly. Its 2025 annual report records $1.527bn revenue, a $1.149bn multi-client library net book value, $103m capital expenditure, and 58% EBITDA margin; it also reports postponed multi-client purchases and lower partner participation when oil-price uncertainty rose ([TGS 2025 annual report](https://www.tgs.com/hubfs/Financial%20Reports/Annual%20Reports/2025%20Annual%20Report/TGS%202025%20Annual%20Report.pdf)). This is powerful evidence for reusable-library economics and equally strong evidence of capital/cycle risk.

**OBSERVED:** RELX says it combines unique content and comprehensive datasets with analytics; group 2025 revenue was £9.590bn and adjusted operating profit £3.342bn, a 34.8% margin ([RELX 2025 results](https://www.relx.com/media/press-releases/year-2026/relx-2025-results)). dunnhumby demonstrates retailer-data formation but Tesco does not disclose standalone dunnhumby revenue/margin, so its economics are **UNKNOWN** rather than assumed.

### D. Holder SaaS / PLG — 17/30

**INFERRED:** SaaS avoids financing inventory and can have attractive marginal economics, but it asks a holder to recognise the product, navigate rights and find demand—the very formation problems under test. It has one-sided software economics more than marketplace economics. Subsidising holders with a free tier is affordable only if enough convert; buyers receive no necessary subsidy because the tool may never aggregate demand. Arrow handling is partial: tooling can emit samples and provenance, but cannot establish usefulness or title.

**OBSERVED:** Snowflake’s FY2025 10-K describes Marketplace and Native Apps as means for providers to distribute data/apps directly inside customer accounts, and reports 11,159 customers overall, but does not disclose active provider count, provider revenue, marketplace GMV or Native App survival by cohort ([Snowflake FY2025 10-K](https://www.sec.gov/Archives/edgar/data/1640147/000164014725000052/snow-20250131.htm)). **INFERRED:** distribution inside an existing cloud is real adoption infrastructure; it does not prove that standalone formation PLG creates products or demand. The likely result for AE would be integration-heavy vertical SaaS unless accompanied by services or an existing buyer channel.

### E. Contributory database — 21/30

**INFERRED:** This is the strongest mature moat and the hardest commercial cold start. Contributors can be subsidised with access/benchmarks because each record improves all buyers; reciprocal value makes Rochet–Tirole logic unusually coherent. Standardised reports and regulated access solve Arrow. Coverage and history compound. But a useful initial database may require a whole industry cohort, governance and a credible neutral operator.

**OBSERVED:** The CFPB describes LexisNexis C.L.U.E. as a claims information exchange holding up to seven years of auto and home/personal-property claims for pricing and underwriting ([CFPB, modified 2025](https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/consumer-reporting-companies/companies-list/comprehensive-loss-underwriting-exchange/)). C.L.U.E. began in 1987 according to LexisNexis’s 35th-anniversary account; therefore time from launch to today’s embedded position is measured in decades, not an AI startup cycle ([LexisNexis, 2023; possibly stale](https://www.prnewswire.com/news-releases/lexisnexis-risk-solutions-celebrates-35th-anniversary-continued-innovation-of-clue-auto-301742250.html)).

**OBSERVED:** RELX’s Risk division is the closest disclosed economic umbrella for LexisNexis Risk Solutions; the 2025 annual report is the authoritative segment source, while group results show the wider company’s £9.590bn revenue and 34.8% adjusted operating margin ([RELX annual report](https://www.relx.com/~/media/Files/R/RELX-Group/documents/reports/annual-reports/relx-2025-annual-report.pdf)). **UNKNOWN:** C.L.U.E.-only revenue and margin are not separately disclosed. Treating all RELX Risk economics as C.L.U.E. would be false precision.

### F. Vertical data-products company — 24/30

**INFERRED:** One vertical narrows the atomic network to one recurrent decision, permits demand-first acquisition and makes quality legible through outcome tests. The company can subsidise a few anchor holders with services or royalties and charge buyers for a finished product. It handles Arrow with a derived answer, provenance and warranty rather than raw-data disclosure. The moat compounds in source coverage, domain ontology and observed decisions. It sacrifices the “formation layer for everyone” story, but that narrowing is why it can work.

**OBSERVED:** CoreLogic’s last public-company year, 2020, reported record $1.66bn revenue and $753m adjusted EBITDA (about 45%); its property data and workflow business was then acquired and is now branded Cotality ([CoreLogic 2020 results, possibly stale](https://www.corelogic.com/press-releases/corelogic-reports-record-full-year-and-fourth-quarter-2020-revenue-operating-income-profit-margins-and-cash-flow/); [Cotality](https://www.cotality.com/)). Cotality Australia sells domain-specific products including Cordell Connect for construction project intelligence ([Cotality AU](https://cotality.com/au/products/cordell-connect)). Historical figures are pre-private acquisition and cannot establish current AU margins, but they validate deep vertical product economics better than general exchanges validate brokerage.

## Verisk deep dive: the precedent and the trap

**OBSERVED:** Insurance Services Office was formed in 1971 through consolidation of rating organisations; Verisk’s IPO registration describes ISO as its predecessor and the later conversion from insurer-owned/not-for-profit structure ([Verisk 2009 registration statement; possibly stale](https://www.sec.gov/Archives/edgar/data/1442145/000095012309049069/y78574b4e424b4.htm)). State insurance examination material describes ISO’s regulated advisory/rating role ([multi-state examination report, possibly stale](https://disb.dc.gov/sites/default/files/dc/sites/disb/publication/attachments/Adopted--MultiState%20Examination%20of%20ISO-Examination%20Report_08%2027%2018%281%29.pdf)). **OBSERVED:** Verisk’s current insurance business says it supplies statistical, actuarial, underwriting and claims information to insurers ([Verisk insurance](https://verisk.com/insurance)). **OBSERVED:** its 2025 10-K is the authoritative source for current results and describes the insurance-focused business ([Verisk 2025 10-K](https://www.sec.gov/Archives/edgar/data/1442145/000143774926004452/vrsk20251231_10k.htm)). Public result summaries place annual revenue around $3bn, not safely “exactly $2.7bn”; the filing should govern any external numerical claim.

The origin mechanism matters more than the scale. **INFERRED:** ISO did not persuade unaffiliated insurers one-by-one to donate proprietary claims data to an unknown startup and then wait for buyers. It inherited rating-bureau functions, insurer ownership, standard reporting relationships and a regulatory use case. Contribution and purchase were tied to an existing industry institution. Its initial atomic network was institutionally assembled.

**INFERRED:** Verisk is the latent-capacity thesis executed before AI—internal insurer observations became pooled loss costs, forms, analytics and workflow products—but it is weak evidence that a neutral commercial startup can cold-start the same model. The correct lesson is conditional: contributory data becomes extraordinarily defensible *after* coordination exists. Without a regulator, mutual ownership, mandatory reporting, dominant channel or anchor consortium, AE must pay for contribution, give reciprocal value immediately, or begin with a single-holder product. AI lowers processing cost; it does not manufacture permission or collective action.

C.L.U.E. is a second caution. **OBSERVED:** it is an FCRA-governed consumer-reporting exchange with dispute and free-file obligations, not merely a data API ([CFPB](https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/consumer-reporting-companies/companies-list/comprehensive-loss-underwriting-exchange/)). **INFERRED:** its liquidity is embedded in insurance underwriting workflows and accumulated over decades. Both exemplars support the value of formed information and disconfirm rapid, permission-light marketplace formation.

## What agents and AI change—and do not

|Constraint|Changed by agents/AI?|Assessment|
|---|---|---|
|Schema discovery, document extraction, classification, sample generation|Materially|**INFERRED:** LLMs lower the labour cost and time of first-pass formation, making service engagements cheaper and more repeatable. Human validation remains necessary for consequential outputs.|
|Small-unit distribution and billing|Partly|**OBSERVED:** cloud marketplaces already distribute data/apps in the customer environment ([Snowflake 10-K](https://www.sec.gov/Archives/edgar/data/1640147/000164014725000052/snow-20250131.htm)). **INFERRED:** per-call rails reduce minimum efficient transaction size, but do not ensure demand or margin after support.|
|Demand aggregation|Plausibly|**INFERRED:** buying agents can express repeated missing-information objectives, allowing a formation company to observe demand before acquiring supply. No cited public evidence establishes that this produces durable willingness to pay.|
|Title, privacy and permitted purpose|No|**OBSERVED:** C.L.U.E. remains subject to consumer-reporting rights and disputes. A model cannot infer resale rights from technical access.|
|Liability and decision accountability|No|**INFERRED:** cheaper generation may increase error volume. Contracts, provenance, insurance and acceptance tests remain economic costs.|
|Trust, channel conflict, holder fear of commoditisation|No|**INFERRED:** an agent cannot guarantee that exposing a signal will not cannibalise the holder’s core product or reveal strategy.|

## Ranked verdict

1. **Vertical data-products company (24/30).** It best matches observed successful economics while making the cold start small enough to test: one expensive decision, a few holders and repeat buyers. It produces a defensible outcome/data loop rather than waiting for general liquidity.
2. **Formation-as-a-service (22/30).** It is the best *entry motion*: fastest paid learning, lowest capital and strongest cold-start score. It ranks below vertical product because labour does not compound automatically and clients can internalise the work.
3. **Contributory database (21/30).** Highest eventual moat, but only with an institutional coordination mechanism AE does not yet possess.
4. **Underwriter/publisher (21/30).** Proven reusable-library economics, offset by inventory and demand risk. It ranks below contributory at equal score because AE lacks both capital and a proven product-selection edge.
5. **Holder SaaS/PLG (17/30).** Attractive delivery economics but pushes unsolved formation and demand back onto holders.
6. **Brokerage/marketplace (15/30).** A possible later monetisation layer, not a credible starting model; exchange exemplars disclose too little transaction evidence to overcome cold-start theory.

**Why rank 1 beats rank 2:** **INFERRED:** services can discover the first vertical, but the destination should own a repeatable data product and outcome loop. Rank 1 captures reusable economics; rank 2 captures learning but risks permanent bespoke delivery. The practical sequence is therefore B as a tightly bounded acquisition/learning method in service of F—not a horizontal consultancy and not six simultaneous verticals.

**Evidence that would flip them:** rank 2 should become the durable model if 8–12 paid formation engagements across at least three verticals show (i) strong holder willingness to pay, (ii) gross margin above 60% after fully loaded delivery labour, (iii) more than 70% reuse of formation steps, and (iv) no single repeatable buyer decision with superior retention. Rank 1 remains preferred if one vertical produces five independent paying buyers, three renewable source agreements, repeat usage within 90 days and contribution margin above 50%. A regulator-backed consortium or dominant channel committing standardised contributions would instead move E to rank 1.

## Disconfirming evidence

- **OBSERVED:** The clearest contributory success, Verisk/ISO, began from rating-bureau and regulatory infrastructure, not an ordinary commercial cold start. That directly weakens the claim that AI now makes a neutral horizontal formation layer easy.
- **OBSERVED:** TGS carries a $1.149bn library asset and reports demand postponements and partner shortfalls; publisher margins require capital and tolerate cycles, not just cheap digital replication.
- **OBSERVED:** Public exchange exemplars Dawex, Datarade and Narrative do not disclose audited GMV, take rates, seller earnings or marketplace profitability. The evidence does not validate horizontal data brokerage.
- **OBSERVED:** Snowflake has massive existing distribution yet does not disclose provider economics or Native App cohort success. Tool availability is not proof of holder productisation.
- **INFERRED:** LLM formation-cost decline can be competed away. If extraction and packaging become commodities, title, unique source rights, distribution and outcome validation—not formation software—capture value.
- **INFERRED:** The best exemplars are vertical, regulated, institutionally coordinated or capital-heavy. None validates a lightly capitalised, general-purpose formation company.

## Base rates

No defensible public dataset reports survival or liquidity rates specifically for “latent-capacity formation” startups. **UNKNOWN:** the category base rate. Using adjacent classes, the observable pattern is asymmetric: a handful of decades-old vertical information companies have very large revenue and margins, while horizontal exchanges commonly disclose funding and product features rather than GMV or profit. This is selection-biased but still decision-relevant.

**INFERRED:** The appropriate prior is therefore low for a horizontal marketplace or contributory database without forced coordination, moderate for paid services, and moderate for a sharply vertical product where demand is proven before broad acquisition. The spectacular outcomes—Verisk, RELX Risk, CoreLogic and TGS—should not be averaged as if a new entrant has their regulatory origins, decades of history, capital or exclusive source position. A base-rate-respecting plan funds one atomic network and requires repeat purchase before platform build.

## What this kills or narrows

1. It kills “launch a general data marketplace, then wait for liquidity” as the starting strategy.
2. It narrows “formation layer” from a horizontal product to a repeatable capability initially exercised inside one vertical and one buyer decision.
3. It kills Verisk as evidence of easy commercial cold start; Verisk is evidence of end-state value after institutional coordination.
4. It narrows services to a learning/acquisition motion with explicit reuse gates, not an unbounded consulting business.
5. It postpones contributory pooling until AE has an anchor consortium, regulatory/reporting hook or dominant distribution channel.
6. It rejects the assumption that agent payment rails solve title, liability, quality or channel conflict.

## Open questions only fieldwork can answer

- Will three holders grant renewable, permitted-purpose rights to a derived product rather than merely a bespoke analysis?
- Which single buyer decision recurs often enough that a formed answer changes action and supports repeat payment?
- What evidence, sample or warranty lets a buyer value the output without receiving the underlying asset?
- Will holders accept royalties, demand an advance, or pay a formation fee—and what channel-conflict protections do they require?
- What fully loaded human review cost remains after LLM-assisted formation?
- Can AE obtain five repeat buyers before building self-serve holder tooling?
- Is there an Australian association, regulator, insurer, bank or software channel able to assemble an initial contributory cohort?
- Do buyers want raw access, a derived signal, or an accountable action—and who bears loss when it is wrong?

## Sources

- https://abovethecrowd.com/2012/11/13/all-markets-are-not-created-equal-10-factors-to-consider-when-evaluating-digital-marketplaces/
- https://www.tse-fr.eu/sites/default/files/medias/doc/wp/2002/platform.pdf
- https://www.nber.org/books-and-chapters/rate-and-direction-inventive-activity-economic-and-social-factors/economic-welfare-and-allocation-resources-invention
- https://andrewchen.com/wp-content/uploads/2022/01/ColdStartProb_9780062969743_AS0928_cc20_Final.pdf
- https://www.dawex.com/en/news/20190523-dawex-raises-5-millions-accelerate-development-data-economy/
- https://datarade.ai/company
- https://next.narrative.io/products/data-marketplace
- https://www.accenture.com/content/dam/accenture/final/accenture-com/document-4/Accenture-2025-10-K.pdf
- https://www.tgs.com/hubfs/Financial%20Reports/Annual%20Reports/2025%20Annual%20Report/TGS%202025%20Annual%20Report.pdf
- https://www.relx.com/media/press-releases/year-2026/relx-2025-results
- https://www.relx.com/~/media/Files/R/RELX-Group/documents/reports/annual-reports/relx-2025-annual-report.pdf
- https://www.sec.gov/Archives/edgar/data/1640147/000164014725000052/snow-20250131.htm
- https://www.consumerfinance.gov/consumer-tools/credit-reports-and-scores/consumer-reporting-companies/companies-list/comprehensive-loss-underwriting-exchange/
- https://www.prnewswire.com/news-releases/lexisnexis-risk-solutions-celebrates-35th-anniversary-continued-innovation-of-clue-auto-301742250.html
- https://www.corelogic.com/press-releases/corelogic-reports-record-full-year-and-fourth-quarter-2020-revenue-operating-income-profit-margins-and-cash-flow/
- https://www.cotality.com/
- https://cotality.com/au/products/cordell-connect
- https://www.sec.gov/Archives/edgar/data/1442145/000095012309049069/y78574b4e424b4.htm
- https://disb.dc.gov/sites/default/files/dc/sites/disb/publication/attachments/Adopted--MultiState%20Examination%20of%20ISO-Examination%20Report_08%2027%2018%281%29.pdf
- https://verisk.com/insurance
- https://www.sec.gov/Archives/edgar/data/1442145/000143774926004452/vrsk20251231_10k.htm

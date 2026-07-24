# Latent-capacity go-to-market and cold start

**Status:** Research complete  
**Decision affected:** Whether AE pursues the latent-capacity formation-layer wedge  
**Evidence cutoff:** 2026-07-22

## Question and evidence standard

How do comparable companies actually obtain their first suppliers and paying buyers? This record separates **OBSERVED** facts from **INFERRED** implications and **UNKNOWN** gaps. An observation means the cited source was read; it does not make a company-authored claim independently audited. Sources before 2024 are flagged as possibly stale where used for current conditions.

The central finding is less glamorous than “launch a marketplace”: the best-evidenced cold starts used one buyer problem, manual work, and pre-committed counterparties. Broad catalogues became useful later. Exact “first ten” customer lists are rarely public, so this record does not manufacture them.

## Origin-story forensics

| Company | First supply | First buyer | Time to revenue | Initial model |
|---|---|---|---|---|
| TGS / PGS multi-client | **OBSERVED:** contractor-funded seismic surveys, commonly de-risked by oil-company pre-funding for discounted licences; TGS retained ownership ([TGS 1998 annual report](https://cdn2.hubspot.net/hubfs/2478981/Financial%20Reports/Annual%20Reports/TGS_Annual_Report_1998.pdf), 1999, stale historically but primary) | **OBSERVED:** oil companies bidding for acreage; one 1995–98 Gulf project had sold to 50+ oil companies by 1998 | **UNKNOWN** for the first corporate sale; projects could sell pre-funding before capture and licences after | Shared-cost, non-exclusive licence; demand commitments financed supply |
| Nearmap | **OBSERVED:** founder-funded Perth test survey in 2007, then proprietary HyperPod capture system in 2008 ([Nearmap history](https://www.nearmap.com/au/blog/15-years-of-tech-innovation-in-nearmap-history), 2023) | **UNKNOWN:** no reliable public source names the first subscriber | **UNKNOWN** | **INFERRED:** seed coverage first, then recurring imagery access; its owned capture-processing-delivery pipeline was the product advantage |
| Plaid | **OBSERVED:** founders initially attempted a consumer finance app, then exposed the bank-connection infrastructure as an API; the 2013 launch described a developer API and $2.8m funding ([TechCrunch](https://techcrunch.com/2013/09/19/plaid-funding/), 2013, stale historical source; [Homebrew launch](https://homebrew.co/blog/2013/09/19/plaid-launches-the-modern-api-for-banking-data), 2013) | **OBSERVED:** public accounts identify Venmo as an early customer, not conclusively the first ([CNBC](https://www.cnbc.com/2018/10/04/meet-the-startup-that-powers-venmo-robinhood-and-other-big-apps.html), 2018) | **UNKNOWN** | Developer-first API solving the founders’ own integration pain; integrations were built before bank partnerships became the dominant supply route |
| SafeGraph | **OBSERVED:** assembled and cleaned places/location data and launched SafeGraph Places as a “source of truth” product ([founder launch](https://medium.com/safegraph/introducing-safegraph-places-the-source-of-truth-about-physical-places-17eeb13ee607), 2017, company-authored and stale) | **UNKNOWN:** first paying buyer not disclosed | **UNKNOWN** | Data-as-a-service; first-party public evidence is too thin to establish the first-ten mechanics |
| Placer.ai | **OBSERVED:** aggregated anonymised mobile-location signals into location analytics; early stated users included commercial-property and retail professionals ([Stage Series A](https://www.stagevp.com/blog/2020/1/23/announcing-the-series-a-of-placer), 2020, investor-authored and stale) | **UNKNOWN:** no verified first buyer | **UNKNOWN** | Free product/demo access appears to have generated usage before enterprise conversion, but first-ten causality is **UNKNOWN** |
| dunnhumby | **OBSERVED:** Edwina Dunn and Clive Humby won Tesco work analysing Clubcard trial data; the programme launched nationally in 1995 and Tesco later bought a majority stake ([BBC](https://www.bbc.com/news/business-30095454), 2014, stale historical source) | Tesco | **OBSERVED:** consultancy existed from 1989; material Tesco relationship arrived roughly five years later | Services-led analytics embedded in one strategic retailer, then reusable loyalty-data capability |
| 84.51° | **OBSERVED:** Kroger created 84.51° in 2015 when restructuring its relationship with dunnhumby; Kroger retained the US analytics operation and dunnhumby retained certain non-Kroger clients ([Kroger release](https://ir.kroger.com/news/news-details/2015/dunnhumby-Ltd-and-Kroger-Announce-New-Relationship/default.aspx), 2015) | Kroger was the anchor, not a cold-start buyer | Immediate inherited revenue/capability; not comparable to a startup | Captive analytics unit with an anchor customer and inherited people/data |
| Flatfile | **OBSERVED:** founders productised repeated CSV/data-import pain; by its 2020 seed it reported hundreds of companies using the importer ([TechCrunch](https://techcrunch.com/2020/06/10/flatfile-scores-7-6m-seed-investment-to-simplify-data-onboarding/), 2020) | **UNKNOWN** first payer | **UNKNOWN** | Developer component plus high-touch onboarding; evidence does not support calling it a pure consulting start |
| Crux Informatics | **OBSERVED:** launched a managed service to ingest, validate and deliver external data; Goldman Sachs was both Series A lead and a strategically relevant financial-data buyer ecosystem participant ([Crux release](https://www.prnewswire.com/news-releases/crux-informatics-announces-10-million-series-a-led-by-goldman-sachs-principal-strategic-investments-300551504.html), 2017, company-authored) | **UNKNOWN** first payer | **UNKNOWN** | Managed data engineering before/alongside platform automation |
| Datarade | **OBSERVED:** incorporated 2018, raised €1.2m in 2019, launched its buyer marketplace in 2020, reported $7.5m+ GMV and 1,000 registered providers in 2021, then $1m+ ARR and its provider-SaaS product’s 500th customer in 2023 ([company profile](https://datarade.ai/company), current company-authored metrics) | **UNKNOWN** first buyer | First marketplace launch about two years after incorporation; first revenue date **UNKNOWN** | Free buyer discovery/matching; monetisation shifted toward SaaS tooling for providers (now Monda) |
| akta.pro × Monid | **OBSERVED:** 2026 launch offers 20m+ private-company records through Monid at $0.125/request and $1 free credit, versus subscriptions ([launch page](https://monid.ai/blog/akta-pro-is-now-available-on-monid), 2026) | **UNKNOWN:** no disclosed paying customer, request volume, revenue, or retention | **UNKNOWN** | Per-request distribution partnership into an agent tool aggregator |

**Team and funding caveat.** **UNKNOWN:** public pages, LinkedIn search results and the launch material did not establish reliable current headcount, funding, incorporation date, or paid traction for akta.pro or Monid. The “killed PitchBook” statement is marketing, not evidence of substitution. Treat both as a live pricing experiment, not a validated base rate.

## What the origin stories actually imply

1. **OBSERVED:** TGS reduced the expensive supply gamble with buyer pre-funding. It did not survey everywhere and hope a directory created demand. The project was timed to licensing rounds, a specific buyer deadline.
2. **OBSERVED:** dunnhumby’s reusable asset emerged inside a consequential services engagement. It took years, not weeks, to reach the Tesco anchor.
3. **OBSERVED:** Plaid first solved an integration problem it directly experienced, then sold the interface to developers. This is product-led, but it is not evidence that unknown SME data owners will self-serve formation.
4. **OBSERVED:** Datarade’s eventual ARR came from provider software, while buyer discovery remained free. Marketplace traffic alone was not the only monetisation engine.
5. **INFERRED:** the recurring cold-start pattern is “one costly decision + manually formed supply + a committed buyer,” not “ten suppliers then ten buyers.”

## Channel analysis: Perth and Australia

### Supply-side access

| Channel | Evidence and likely use | Failure mode |
|---|---|---|
| Accountants and fractional CFOs | **OBSERVED:** CPA Australia’s 2024 technology research documents accountants’ involvement in small-business technology decisions ([CPA report](https://www.cpaaustralia.com.au/-/media/project/cpa/corporate/documents/tools-and-resources/business-management/business-management-research/business-technology-report_2024_digital_v1.pdf?rev=8afe59dc4a9a4ef295e1346c5e20c378), 2024). **INFERRED:** they can identify operational datasets and revenue pressure, but are not automatically authorised to disclose data. | Advice trust does not equal data rights; referrals can die in privacy/legal review. One survey found only 15% of SMBs viewed accountants as growth partners despite 76% of accountants aspiring to that role ([Agile Market Intelligence](https://agilemarketintelligence.com.au/news/only-15-of-smbs-see-their-accountant-as-a-growth-partner-even-though-76-of-accountants-aspire-to-be), 2025). |
| MSPs, cloud resellers, systems integrators | **INFERRED:** strongest view of where data sits and what extraction costs. Vendor-channel evidence shows Australian SMB technology distribution is partner-led ([Dicker Data SMB paper](https://www.dickerdata.com.au/hubfs/MIC1971%20SMB%20Thought%20Leadership%20-%20Partner%20-%20Dicker%20Data%20v1.pdf), pre-2024, possibly stale). | Their incentive is implementation/resale margin, not proving a novel buyer. They may capture the services revenue or block unfamiliar liability. |
| Industry associations | **INFERRED:** efficient trust transfer and repeated vocabulary within mining services, property, logistics or agriculture. | Associations provide introductions, not transaction authority; broad member campaigns produce low-intent supply. |
| Insurance brokers and risk consultants | **INFERRED:** see recurring information gaps and can identify bounded risk signals. | Confidentiality, licensing and adverse-selection concerns make raw data sharing unlikely; a derived answer is more feasible. |
| Industry-specific consultants | **INFERRED:** best initial channel because they know both the data owner and the decision buyer. | They may be the incumbent matchmaker and perceive AE as disintermediation. Offer them paid formation/referral work rather than bypassing them. |

**Verdict on supply channels:** use channels for named introductions only. Do not pay for mass lead lists or ask partners to “recruit suppliers.” The first target is one consultant/accountant/MSP who can name a data-bearing business and a buyer decision that already hurts.

### Where demand already congregates

- **OBSERVED:** Datarade reports 100,000 monthly buyer visits, 500 providers, 4,000 products and 30,000 matches; these are self-reported current metrics ([Datarade](https://datarade.ai/company)). It is useful for demand-language mining, but AE would be one supplier among many.
- **OBSERVED:** Databricks reported 2,500+ listings from 250+ providers in 2024 and says request-access commercial deals are completed directly between provider and consumer ([Databricks marketplace FAQ](https://www.databricks.com/blog/top-10-marketplace-questions-answered), 2024).
- **OBSERVED:** AWS and Snowflake provide procurement/billing rails, but require a formed data product, rights, documentation and delivery. They do not create a product from a Perth company’s internal files.
- **OBSERVED:** Neudata is the closest demand-map analog. It explicitly says it provides research and consultancy and “does not provide the data itself or act as a broker.” Buyers pay undisclosed subscription pricing for Scout research, analyst access, compliance intelligence, price intelligence on 2,000+ products and matchmaking; suppliers can list free, while paid supplier packages buy networking and content features ([buyer solution](https://www.neudata.co/solutions/experienced-data-buyer); [provider plans](https://www.neudata.co/data_providers/plans), current). It claims 1,000+ qualified buyers on its supplier page. **UNKNOWN:** public buyer list price, conversion rate, and transaction volume.
- **INFERRED:** Eagle Alpha and similar alternative-data brokers validate buyer-paid scouting, but their hedge-fund concentration does not prove Perth mid-market demand.

## Neudata: why the closest analog matters

Neudata starts from recurring buyer work: find, compare, price-check and de-risk datasets. Supply lists free because buyer attention is scarce. Human analysts produce neutral reports, highlight weak datasets and arrange one-to-one meetings. That creates a proprietary demand and trial map before any transaction rail.

For AE, the transferable mechanic is not “become an alternative-data terminal.” It is: charge a buyer for a bounded sourcing brief, inspect which missing inputs repeatedly matter, then form only the supply that answers one brief. **INFERRED:** AE’s trust/receipt capabilities could record the brief, permitted use and delivered evidence. **UNKNOWN:** whether Australian non-investment buyers will pay separately for scouting rather than bundle it into consulting.

## Three sequencing options

Scores are 1 (poor) to 5 (strong), applied to a one- or two-person company with strong Australian networks and an existing trust/receipt platform.

| Sequence | Time to first revenue | Capital need | Map-building rate | Lock-in created | Evidence-weighted total |
|---|---:|---:|---:|---:|---:|
| Services-led: sell one discovery/formation engagement, manually deliver, productise repeats | 5 | 5 | 4 | 4 | **18/20** |
| Product-led: publish tooling and seek self-serve suppliers/buyers | 2 | 2 | 2 | 3 | **9/20** |
| Demand-aggregator-led: paid buyer scouting, then form supply for repeated briefs | 4 | 4 | 5 | 5 | **18/20** |

**Most evidenced sequence:** a combined demand-aggregator-led, services-delivered sequence—not three simultaneous businesses. Start with one paid buyer brief; manually source and form one supplier answer; preserve the permission, pricing and outcome record; repeat in the same vertical. This combines Neudata’s buyer-paid map with dunnhumby/Crux high-touch delivery and TGS pre-commitment. Product-led tooling comes only after repeated work exposes a stable step.

The distinction matters: pure services-led work can become generic consulting. The buyer brief must name the missing decision input, intended use, willingness to pay and renewal trigger. Each engagement must add a reusable supply-to-objective relationship to AE’s map.

## Pricing GTM and marketplace economics

### Introductory pricing mechanics

**OBSERVED:** commercial data marketplaces commonly support samples/free listings and negotiated access. Databricks says samples, trial versions and notebooks improve evaluation, while commercial request-access deals happen off-platform. Monid uses $1 free credit then $0.125/request. TGS used discounted pre-funding. These support three honest tests: (1) paid feasibility/formation fee; (2) limited sample or pilot with an explicit conversion price; (3) per-answer pricing only where marginal delivery and quality are stable.

**INFERRED:** revenue share alone is bad cold-start economics for AE: it funds substantial formation work from uncertain future sales. Prefer buyer-paid discovery plus supplier revenue share on repeat transactions. A free pilot should be small, time-boxed and incapable of satisfying the full recurring need.

### Marketplace take-rate table

| Marketplace | Actual published charge | What it means |
|---|---|---|
| AWS Data Exchange / AWS Marketplace | **OBSERVED:** 3% public-offer listing fee for AWS Data Exchange; private offers 3% under $1m, 2% $1m–<$10m, 1.5% ≥$10m and renewals; professional-services private offers 0.5% ([AWS fee schedule](https://docs.aws.amazon.com/marketplace/latest/userguide/listing-fees.html), effective 2024-01-05) | Procurement rail is cheap relative to formation work; 3% cannot fund manual product creation. |
| Snowflake Marketplace | **OBSERVED:** transaction fee exists and is deducted from payout, but the public documentation directs providers to a logged-in Billing & Terms fee schedule rather than publishing a percentage ([Snowflake docs](https://docs.snowflake.com/en/collaboration/provider-transactions-invoicing-collections), current). | **UNKNOWN** public percentage; do not repeat an uncited number. Provider remains seller of record and bears disputes/nonpayment responsibility. |
| Databricks Marketplace | **OBSERVED:** 0% revenue share and no listing fee; paid transactions occur directly between buyer and provider ([Databricks FAQ](https://www.databricks.com/blog/top-10-marketplace-questions-answered), 2024). | It is discovery/delivery infrastructure, not merchant-of-record monetisation or formation. |

## Australia: Data Republic, Adatree and CDR

### Data Republic cautionary case

**OBSERVED:** Data Republic raised at least AU$10.5m in a 2016 Series A backed by Qantas, NAB and Westpac ([ZDNet](https://www.zdnet.com/article/qantas-nab-and-westpac-behind-data-republics-au10-5m-funding-round/), 2016, stale historical source). Contemporary reporting places total capital raised above AU$40m. It collapsed in 2021 after a failed funding round; IXUP acquired its technology/IP for AU$3m, reported as a roughly 94% discount to prior value ([AFR collapse](https://www.afr.com/technology/big-bank-backed-data-republic-collapses-after-failed-funding-round-20210506-p57pn2), 2021; [ARN acquisition](https://www.arnnet.com.au/article/1262837/ixup-acquires-collapsed-data-republic-ip-for-3m.html), 2021). Exact cumulative funding is **UNKNOWN** from primary filings reviewed here, so “~AU$40m+” remains a secondary-source estimate.

The lesson is not “Australian data sharing cannot work.” It is narrower:

- **INFERRED:** major logos and secure-exchange technology did not remove long enterprise sales cycles, legal negotiation, uncertain use-case value and dependence on continuing venture finance.
- **INFERRED:** a horizontal exchange can accumulate governance capability without enough repeat paid demand.
- **INFERRED:** AE should not fund a general secure data-sharing platform before a buyer repeatedly pays for one output.
- **UNKNOWN:** Data Republic’s customer-level gross retention, deal margins and precise shutdown causes; COVID and a failed US transaction were reported factors, not a complete causal proof.

### Adatree and CDR economics

**OBSERVED:** Adatree built accredited Consumer Data Right infrastructure and was acquired by payments company Fat Zebra in 2024 ([Open Banking Expo](https://www.openbankingexpo.com/news/accredited-data-recipient-adatree-acquired-by-fat-zebra/), 2024). **OBSERVED:** the Australian Banking Association’s 2024 strategic review argued CDR participation costs were high relative to adoption and called for a narrower, use-case-led rollout ([ABA review](https://www.ausbanking.org.au/wp-content/uploads/2024/07/CDR-Strategic-Review_July-2024.pdf), 2024; industry-authored, not neutral government evidence).

**INFERRED:** regulated access rails create an infrastructure/vendor market, but compliance does not create buyer willingness to pay. The viable firms may monetise enablement, fraud insights or embedded finance rather than raw data exchange. AE should prefer derived, permission-bounded answers over transferring SME datasets.

## Disconfirming evidence

- No reviewed source discloses a reproducible “first ten suppliers / first ten paying buyers” playbook. The thesis rests on analogous patterns, not a direct formation-layer precedent.
- Nearmap and seismic models required capital-intensive proprietary supply before broad subscriptions. They weaken the claim that every dormant asset can be formed cheaply.
- Plaid, Flatfile and Crux primarily solved integration/engineering pain around already-demanded data. They do not prove that previously unsold SME knowledge has buyers.
- Neudata’s strongest buyer base is investment management, where one dataset can affect large portfolios. Perth SMEs and mid-caps may have much lower willingness to pay.
- Datarade needed funding, two years to marketplace launch, and later provider SaaS for ARR. Its self-reported 30,000 matches do not establish paid transaction conversion.
- Data Republic shows trusted enterprise sponsors, substantial capital and governance technology can still fail commercially.
- Monid × akta.pro discloses price and inventory, not paying demand or retention. It is evidence of an offer, not traction.

## Base rates

**OBSERVED:** among this deliberately selected comparison set, only dunnhumby/Tesco, TGS pre-funded surveys, Plaid’s developer API and Datarade’s later provider SaaS expose a reasonably clear route from a narrow problem to revenue. Exact first-revenue timing remains unknown for most. This is survivorship-biased: failed data-marketplace origin stories publish less detail.

**INFERRED:** the base rate for a horizontal two-sided data marketplace cold start is poor because four gates must clear simultaneously: rights, product quality, buyer value and repeatability. A services engagement needs only one buyer and one supplier to begin, but has a separate poor base rate of remaining bespoke consultancy.

**INFERRED:** for a one- or two-person company, reaching ten catalogue suppliers is easier than reaching one repeat buyer and therefore is the wrong milestone. The better base-rate checkpoint is three paid repetitions of the same decision outcome, with at least two suppliers or two buyers demonstrating that the map generalises.

## What this kills or narrows

1. Kills “launch the marketplace, then recruit both sides.”
2. Kills free, broad supplier onboarding as the first Perth motion.
3. Narrows product-led GTM to automation after repeated manual delivery.
4. Narrows marketplace distribution to a later channel for already formed products.
5. Kills pure revenue-share compensation for initial formation work.
6. Narrows the first vertical to one where a trusted intermediary can introduce both a rights-holder and a buyer with a recurring, expensive decision.
7. Narrows the akta.pro example to pricing-format evidence, not demand validation.

## Open questions only fieldwork can answer

- Which Perth advisers can name both a data owner and a current buyer decision, rather than merely offer introductions?
- Will a buyer pay for a sourcing/formation brief before the supplier product exists? At what amount and procurement threshold?
- Which supplier can sell a derived answer without exposing personal, confidential or competitively sensitive records?
- Does the first buyer want raw data, a verified answer, or an accountable action?
- What evidence converts a pilot to repeat purchase, and who signs that conversion?
- Will advisers accept referral fees, paid delivery roles, or neither?
- Can AE prevent bypass after the first introduction by adding continuing evidence, permission and outcome value?
- Do three repetitions produce a reusable formation template or three bespoke consulting projects?

## Sources

- https://cdn2.hubspot.net/hubfs/2478981/Financial%20Reports/Annual%20Reports/TGS_Annual_Report_1998.pdf
- https://www.nearmap.com/au/blog/15-years-of-tech-innovation-in-nearmap-history
- https://techcrunch.com/2013/09/19/plaid-funding/
- https://homebrew.co/blog/2013/09/19/plaid-launches-the-modern-api-for-banking-data
- https://www.cnbc.com/2018/10/04/meet-the-startup-that-powers-venmo-robinhood-and-other-big-apps.html
- https://medium.com/safegraph/introducing-safegraph-places-the-source-of-truth-about-physical-places-17eeb13ee607
- https://www.stagevp.com/blog/2020/1/23/announcing-the-series-a-of-placer
- https://www.bbc.com/news/business-30095454
- https://ir.kroger.com/news/news-details/2015/dunnhumby-Ltd-and-Kroger-Announce-New-Relationship/default.aspx
- https://techcrunch.com/2020/06/10/flatfile-scores-7-6m-seed-investment-to-simplify-data-onboarding/
- https://www.prnewswire.com/news-releases/crux-informatics-announces-10-million-series-a-led-by-goldman-sachs-principal-strategic-investments-300551504.html
- https://datarade.ai/company
- https://monid.ai/blog/akta-pro-is-now-available-on-monid
- https://www.neudata.co/solutions/experienced-data-buyer
- https://www.neudata.co/data_providers/plans
- https://www.databricks.com/blog/top-10-marketplace-questions-answered
- https://docs.aws.amazon.com/marketplace/latest/userguide/listing-fees.html
- https://docs.snowflake.com/en/collaboration/provider-transactions-invoicing-collections
- https://www.cpaaustralia.com.au/-/media/project/cpa/corporate/documents/tools-and-resources/business-management/business-management-research/business-technology-report_2024_digital_v1.pdf?rev=8afe59dc4a9a4ef295e1346c5e20c378
- https://agilemarketintelligence.com.au/news/only-15-of-smbs-see-their-accountant-as-a-growth-partner-even-though-76-of-accountants-aspire-to-be
- https://www.dickerdata.com.au/hubfs/MIC1971%20SMB%20Thought%20Leadership%20-%20Partner%20-%20Dicker%20Data%20v1.pdf
- https://www.zdnet.com/article/qantas-nab-and-westpac-behind-data-republics-au10-5m-funding-round/
- https://www.afr.com/technology/big-bank-backed-data-republic-collapses-after-failed-funding-round-20210506-p57pn2
- https://www.arnnet.com.au/article/1262837/ixup-acquires-collapsed-data-republic-ip-for-3m.html
- https://www.openbankingexpo.com/news/accredited-data-recipient-adatree-acquired-by-fat-zebra/
- https://www.ausbanking.org.au/wp-content/uploads/2024/07/CDR-Strategic-Review_July-2024.pdf

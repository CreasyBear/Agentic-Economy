# Honest option comparability for AE

**Issue:** [#124 — Define comparable options recommendation and commercial influence](https://github.com/CreasyBear/Agentic-Economy/issues/124)  
**Question:** Under what evidence may AE call provider offers comparable, rank or recommend one, and disclose price or commercial influence without misleading the customer?  
**Method:** Current first-party product documentation and regulator-owned sources were reviewed on 13 July 2026. Older regulator material is retained only where it supplies a useful comparison principle and is labelled as such. “Observed rule” reports the source. “AE inference” is a proposed product contract, not legal advice.

## Executive conclusion

AE may present offers in one comparison set only when it can prove that they answer the same registered capability and Request, are currently eligible, and expose a normalized set of decision dimensions. Missing values are not zeroes. Materially different scope, fulfillment, price basis, authority, or evidence makes an offer **incomparable**, not worse.

The result surface must answer six questions without opening protocol detail:

1. **What did AE compare?** Registered providers and offers actually searched, plus market-coverage limits.
2. **Why are these together?** Shared capability, customer facts, fulfillment outcome, and normalized dimensions.
3. **Why this order?** Customer-fit factors and decisive tradeoffs, never an unexplained score.
4. **What will it cost?** Total or maximum payable price on a common basis, or an honest estimate/formula with exclusions.
5. **How current is it?** Observation time, expiry/revalidation state, evidence source, and availability limitations.
6. **Did money affect visibility or order?** Sponsor, commission, rebate, ownership, and any actual influence, at the option and result-set level.

## Primary-source findings

### 1. “Comparable” requires like-for-like scope, not visual uniformity

**Observed rule.** The Australian Competition and Consumer Commission’s comparator guidance states three principles: facilitate honest like-for-like comparisons, disclose commercial relationships, and disclose who and what is compared. It warns against overstating market coverage, impartiality, savings, or value rankings. [ACCC comparator guidance](https://www.accc.gov.au/media-release/accc-releases-comparator-website-guidance) Its detailed industry guide says operators should identify suppliers and product ranges, not list brands that are not actually compared, and not overstate the percentage of the market covered. [ACCC industry guide (PDF)](https://www.accc.gov.au/system/files/CSBS%20-%20Comparator%20web%20sites%20project%20-%20Industry%20Guidance%20-%20final.pdf)

**Observed rule (historical but useful).** The UK FCA’s insurance comparison review tested whether customers could compare key features, total costs, and main exclusions. It found that headline price and brand can distract from coverage, terms, and excesses. The page now identifies the review as historical. [FCA TR14/11](https://www.fca.org.uk/publications/thematic-reviews/tr14-11-price-comparison-websites-general-insurance-sector)

**Observed product model.** Ofcom describes accredited comparison services as accessible, accurate, transparent, comprehensive, and up to date. Its customer guidance says whole-contract price—not merely a monthly headline—must be considered alongside speed, technology, features, contract duration, and installation fees. [Ofcom accredited comparison sites](https://www.ofcom.org.uk/phones-and-broadband/saving-money/price-comparison/) [Ofcom choosing a provider](https://www.ofcom.org.uk/phones-and-broadband/service-quality/quality-of-service?language=en)

**AE inference.** Comparable options require a source-owned `comparisonBasis`:

- exact registered capability-contract version;
- normalized outcome/scope and fulfillment mode;
- customer facts used for eligibility;
- common price unit, quantity, duration, currency, tax geography, and payment timing;
- named dimensions with value, evidence type, and missing/unknown status;
- material exclusions and conditional obligations.

If a material dimension cannot be normalized—one offer is advice only while another performs the work; one is a firm quote while another is an uncapped hourly estimate—AE must place it in a separate **alternative** group and explain the difference. It must not coerce both into a numeric rank.

### 2. Price must support a real comparison

**Observed rule.** Current UK CMA guidance says mandatory fees, taxes, and unavoidable charges normally belong in the upfront total. Where a total depends on customer requirements and cannot yet be calculated, the trader must supply what the customer needs to calculate it. For local/foreign-currency charges it calls for explicit pay-now/pay-locally amounts and exchange-rate disclosure. [CMA price-transparency summary, updated January 2026](https://www.gov.uk/government/publications/price-transparency-cma209/providing-clear-and-accurate-information-about-prices-summary)

**Observed rule.** The US FTC’s fee rule, effective 12 May 2025 for live-event tickets and short-term lodging, requires the advertised total price to include known mandatory fees up front; other fees that cannot be calculated up front must be disclosed before final payment. [FTC rule effective-date notice](https://www.ftc.gov/news-events/news/press-releases/2025/05/ftc-rule-unfair-or-deceptive-fees-take-effect-may-12-2025)

**Observed product model.** Airbnb made fee-inclusive total price before taxes the standard search-results price worldwide in April 2025 and shows the tax-inclusive total before checkout; its US help page identifies when taxes Airbnb does not collect may remain outside the displayed total. [Airbnb global total-price display](https://news.airbnb.com/total-price-display-is-now-standard-globally/) [Airbnb US price display](https://www.airbnb.com/help/article/3610)

**Observed product model.** Uber shows an upfront fare before request, states inputs such as expected time, distance, traffic, and surge, identifies circumstances that can adjust it, then exposes the final charge in the trip record and receipt. [Uber upfront fares](https://help.uber.com/riders/article/how-do-upfront-fares-work?nodeId=5073140f-3d5f-4046-80da-2db9ed7b11b3)

**AE inference.** Every option price needs a discriminated representation, not a bare number:

- `total`: all known mandatory amounts for the stated Request;
- `maximum`: a binding ceiling plus what could trigger a lower charge;
- `estimate`: expected amount/range, estimation basis, uncertainty, and possible adjustments;
- `formula`: rate/unit/minimum/mandatory fees sufficient to calculate, with unresolved customer inputs;
- `unpriced`: no decision-grade price evidence; never sorted as cheap.

The common comparison field is the **customer-payable total or maximum on the declared basis**. Display optional extras and conditional costs separately. If the basis differs, show “not directly comparable” rather than a synthetic price rank.

### 3. Ranking needs an inspectable customer-fit explanation

**Observed rule.** The EU Digital Services Act requires platforms using recommender systems to explain in plain language the most significant criteria and why they matter relatively; where multiple ordering options exist, users must be able to select and change them. [DSA Article 27](https://eur-lex.europa.eu/legal-content/EN/TXT/?qid=1669307560160&uri=CELEX%3A32022R2065)

**Observed product model.** Google says local results are mainly based on relevance, distance, and prominence and explicitly says businesses cannot pay for better local ranking. [Google local ranking](https://support.google.com/business/answer/7091?hl=en-en) Google’s “About this result” surface can explain relationships such as local relevance, language/region, recency, and content type. [Google Search result explanations](https://support.google.com/websearch/answer/134479?hl=en)

**Observed product model.** Airbnb says ranking uses entered criteria plus listing factors including location, price, availability, reviews/quality, popularity, and personalization, and that it encourages variety. It may show near-matches when too few high-quality exact matches exist. [Airbnb search ranking](https://www.airbnb.com/help/article/39)

**AE inference.** AE should not emit “best” or a scalar confidence score. Each ranked option must expose:

- eligibility facts satisfied;
- the two or three Request-specific factors that moved it up;
- its decisive advantage and material downside versus this set;
- unknown or weaker evidence that limits confidence;
- the selected ordering mode (`best fit`, `lowest comparable total`, `soonest`, `closest`, or user-defined);
- whether diversity or near-match logic changed the displayed set.

“Recommended” is permitted only when the same evidence object can generate both the human explanation and agent-readable projection. Changing copy must not change the ranking basis; changing ranking evidence must produce a new result revision.

### 4. Commercial influence must be separated from recommendation

**Observed rule.** The DSA requires every advertisement to be identifiable clearly and in real time, including who it is presented for, who paid if different, and meaningful information about targeting parameters. [DSA Article 26](https://eur-lex.europa.eu/legal-content/EN/TXT/?qid=1669307560160&uri=CELEX%3A32022R2065)

**Observed enforcement model.** The US CFPB states that a comparison-shopping operator may violate consumer-finance law when remuneration causes preferential treatment or steering while customers reasonably rely on it to act in their interests. Visually separate advertising is distinguished from paid content intertwined with recommendations. [CFPB Circular 2024-01](https://www.consumerfinance.gov/compliance/circulars/consumer-financial-protection-circular-2024-01-preferencing-and-steering-practices-by-digital-intermediaries-for-consumer-financial-products-or-services/)

**Observed enforcement model.** The FTC alleged deception where a site marketed rankings as honest/unbiased but boosted positions based on payment; a buried general compensation sentence was inadequate. [FTC LendEDU case guidance](https://search.ftc.gov/business-guidance/blog/2020/02/ftc-alleges-deception-unbiased-review-sites-ratings-rankings)

**AE inference.** Commercial data belongs in every option envelope even when it has no ranking effect:

- sponsor/advertisement status;
- payer and beneficiary identities;
- AE commission, referral fee, rebate, ownership, or other value;
- amount/rate/basis when known;
- `influencedEligibility`, `influencedInclusion`, and `influencedOrder` booleans with explanation.

AE’s neutral recommendation order must never use provider payment. Paid placement, if ever supported, is a separately labelled surface outside the recommendation rank and cannot use “best,” “recommended,” or visually merge with organic options. A footer-level generic disclosure is insufficient.

### 5. Freshness is part of the offer, not metadata trivia

**Observed integration model.** Booking.com tells Demand API integrators not to cache price or availability, to validate final price and availability through order preview, and to treat its 15-minute order token as risk reduction rather than a guarantee. It documents explicit `order_price_changed` recovery, stale availability caches, and the need to remove known-unavailable products. [Booking.com pricing troubleshooting](https://developers.booking.com/demand/docs/accommodations/pricing-troubleshooting) [Booking.com migration FAQ](https://developers.booking.com/demand/docs/migration-guide/v3/migration-faqs)

**Observed lifecycle model.** Stripe quotes distinguish draft, finalized/open, accepted, and canceled states; an open quote has an expiration time and cannot be accepted after expiration/cancellation. [Stripe quote lifecycle](https://docs.stripe.com/quotes?locale=en-GB)

**AE inference.** Each option must carry `observedAt`, source, evidence/quote identifier, `validUntil` when supplied, validation state, and a capability-specific freshness policy. Before commitment AE must revalidate availability, total price, and material terms. Changed evidence creates a new option revision and an explicit customer decision; it never silently mutates the accepted comparison.

### 6. Zero, one, and many are materially different claims

The sources do not prescribe universal wording. The following is an **AE inference** derived from their coverage, near-match, and truthful-comparison rules.

| Result | Permitted customer language | Required evidence and exclusions |
|---|---|---|
| **Zero exact** | “No registered options matched these requirements.” | Say what capability, geography/time, and binding set were searched; distinguish no registered supply, no eligible supply, provider error, stale/unknown availability, and unsupported Request. Near-matches are a separate labelled group and name the relaxed constraint. Never say “none exist.” |
| **One exact** | “One registered option matched.” | Do not call it best, recommended, competitive, or a comparison. Show coverage, material unknowns, and why other evaluated options were excluded. Offer to broaden/adjust the Request. |
| **Many comparable** | “These N registered options can be compared on [basis].” | Declare comparison basis, coverage, ordering mode, decisive tradeoffs, freshness, exclusions, and commercial influence. |
| **Many but incomparable** | “AE found alternatives, but they do not offer the same thing on a common basis.” | Group by outcome/scope/price authority. Explain differences; allow the customer to choose a path or supply a missing fact. No cross-group winner or shared numeric rank. |

## Proposed issue-124 contract

### Source-owned types

`ComparableOptionSet` should contain:

- Request and registered capability-contract revision;
- evaluated bindings, included option IDs, excluded candidates with reason codes, provider failures, and explicit coverage statement;
- normalized comparison basis and dimension definitions;
- result cardinality (`zero_exact`, `one_exact`, `many_comparable`, `many_incomparable`);
- ordering mode, ranking factors, relative importance, diversity/near-match intervention;
- option evidence, price model, freshness/revalidation, exclusions, tradeoffs, commercial influence;
- stable result revision and provenance references.

The human UI and agent API must project this same record. Neither may independently calculate rank, rewrite unknown into false, suppress exclusions, or invent total price.

### Exclusion reason vocabulary

Use typed reasons that can be aggregated without leaking private provider detail:

- capability mismatch;
- contract-version mismatch;
- missing required customer fact;
- geography/time outside eligibility;
- unavailable or quote expired;
- provider evidence unavailable/error;
- price basis not comparable;
- fulfillment/outcome not comparable;
- authority/mandate restriction;
- trust/safety eligibility failure;
- customer constraint not met.

### Adversarial acceptance tests

1. Highest-paying provider cannot move above a better-fit provider or appear organic.
2. A commission-bearing option produces the same fit score/rank as an otherwise identical non-commission option.
3. A low headline/hourly rate with mandatory fees or uncapped units cannot outrank a known lower total.
4. Missing price, rating, availability, or evidence cannot become zero, neutral, or favorable during sort.
5. A stale quote cannot be committed; revalidation creates a disclosed new revision.
6. One match cannot yield “best”; zero registered matches cannot yield “no providers exist.”
7. Near-matches cannot enter the exact set without naming the relaxed constraint.
8. Different outcomes or price authority cannot receive a shared winner rank.
9. Provider self-claims cannot be presented as independently verified facts.
10. Human and agent projections have identical membership, order, price basis, evidence class, exclusions, and influence disclosure.

## Decision for AE

Build a comparison **evidence object**, then render it. Do not begin with option cards and retrofit honesty into copy. The product may hide routing choreography, but it must never hide the boundaries of the market searched, the basis of comparison, who influenced visibility, what is unknown, or how current the offer is.

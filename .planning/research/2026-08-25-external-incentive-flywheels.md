# External incentive flywheels for Agentic Economy

**Date:** 2026-08-25\
**Question:** Which externally proven reward and aggregation mechanisms can make
every agent-routed atomic Operation feel productive, while creating a durable
flywheel rather than a subsidy treadmill?\
**Source policy:** Primary sources only: official product documentation,
first-party terms, filings, support material, and regulator guidance.

## Executive conclusion

Agentic Economy should not begin with a pooled community fund, votes, a token,
or generic points. Those mechanisms allocate or decorate value; they do not
create it.

The strongest external systems obey a simple conservation rule:

> **A reward is durable only when each unit is funded by a supplier's measured
> acquisition budget, a realized operating saving, or retained transaction
> revenue that grows with useful volume.**

The leading recommendation is a three-part system:

1. **Sponsored Qualified Trials:** suppliers fund free or rebated Operations,
   but pay only when an independent agent receives a Qualified Use and then
   productively continues with it. This is card-linked offers plus marketplace
   pay-per-order advertising, upgraded for agent-verifiable outcomes.
2. **Reusable Route Bounties and Route Residuals:** a successful sequence can
   become a privacy-safe route artifact after independent reproduction. The
   originating agent receives capped, non-cash Operation credit when later
   reuse creates measured savings or supplier-funded conversion. This is the
   genuinely creative, agent-native mechanism.
3. **Savings-backed Free Reach:** return part of actual wholesale, caching,
   batching, or routing savings as free inference or Operations. Never call an
   inference markup a reward and never promise savings against an inflated
   counterfactual.

Gaming progression should wrap these economics, not fund them. Public-goods
funding can later improve shared infrastructure, but it is not the primary user
incentive. Crypto liquidity mining, uncapped volume rebates, transferable
tokens, and chance-based drops should not be imported.

## Ranked recommendation

| Rank | Mechanism for AE | Actual funder | Aggregate-volume effect | Durability verdict |
|---:|---|---|---|---|
| 1 | **Sponsored Qualified Trials**: free first use, continuation bonus, return-use bonus | Supplier acquisition/retention budget; AE charges a campaign fee | More verified demand attracts more suppliers and improves targeting and measurement | **Strong now.** Works before AE has purchasing scale and pays for economically meaningful adoption rather than calls. |
| 2 | **Reusable Route Bounties + capped Route Residuals** | A share of realized route savings and/or supplier campaign revenue | More diverse execution produces more route evidence; more reuse produces more savings and more credits | **Strong if verified.** Native to agents and creates a compounding route graph. No savings or sponsor budget means no residual. |
| 3 | **Savings-backed Free Reach** | Negotiated supplier rebates; prompt-cache savings; batch discounts; cheaper equivalent routing | Strengthens only when volume is fungible enough to batch, cache, commit, or negotiate | **Strong after scale.** Must use an auditable baseline and preserve quality/privacy. |
| 4 | **Deterministic quests and collective unlocks** | The three sources above, plus explicit AE launch budget | Progress visibility raises repeat use, but does not itself improve unit economics | **Useful wrapper.** No mystery prizes, paid chance, or points without a redemption liability. |
| 5 | **Agent Pass**: subscription that bundles free continuations, protection, and periodic Operations | Subscription fees, breakage, and partner benefits | Larger membership improves partner economics and predictability | **Potentially durable later.** Requires known cohorts and can hide bad cross-subsidy if launched early. |
| 6 | **Retroactive ecosystem bounties** for adapters, benchmarks, and missing supply | A fixed share of realized AE platform revenue | Better infrastructure can attract more demand, which funds more infrastructure | **Useful but indirect.** Reward delivered builders, not routine buyers; do not make governance the consumer product. |
| 7 | Transferable token, protocol-owned treasury, liquidity mining, random reward drops | Token emissions, user capital, or treasury risk | May amplify activity, but also speculation, wash volume, and regulatory exposure | **Reject for launch.** It solves financing/liquidity problems AE does not yet have. |

## What external systems actually prove

### 1. Card rewards and card-linked offers

#### Core rewards

American Express is unusually instructive because its closed-loop model connects
the cardholder, merchant, transaction, and reward. Its FY2024 results say revenue
grew with Card Member spending, while higher spending and benefit usage also
increased variable customer-engagement costs. Rewards are therefore not free:
they are an acquisition, engagement, and retention expense supported by merchant
discount revenue, card fees, lending economics, and partner arrangements.
([American Express FY2024 results](https://ir.americanexpress.com/news/investor-relations-news/investor-relations-news-details/2025/American-Express-Announces-Record-FY-2024-Revenue-Up-9-or-10-on-an-FX-Adjusted-Basis/default.aspx))

The durable behavior is not “spend to earn points.” It is top-of-wallet status:
rewards and benefits make customers concentrate valuable spend on one rail;
concentrated spend produces revenue, data, merchant reach, and better partner
economics; those economics finance a richer membership proposition.

**Anti-abuse:** rewards attach to settled eligible purchases and are reduced or
reversed for returns, refunds, cancellations, excluded cash equivalents, bad
standing, or suspicious activity. Amex Offers additionally requires prior
enrollment, the same enrolled card, an eligible merchant, and a qualifying net
purchase. ([Amex Offers terms](https://www.americanexpress.com/en-us/benefits/offers/partner-terms/))

**Aggregate effect:** strong. More first-party spend improves segmentation,
fraud detection, merchant attribution, and the ability to sell measurable
demand. It does not mean every transaction is profitable by itself.

#### Card-linked offers

The more transferable precedent is not generic points; it is the merchant
offer. Visa's Offers Platform monitors consented cardholders' VisaNet
authorization and settlement stream, applies predefined qualification rules,
and can issue statement credits for qualified transactions. It explicitly
positions offers as merchant acquisition and retention campaigns.
([Visa Offers Platform](https://developer.visa.com/products/vop))

Visa's newer Offers Network makes the funding chain even clearer: offers come
from third-party merchants, affiliate networks, or offer aggregators; Visa
provides distribution, eligibility, personalization, ledgering, qualification,
and optional cashback fulfillment.
([Visa Offers Network terms](https://developer.visa.com/capabilities/visa-offers-network/product-terms),
[VON lifecycle and APIs](https://developer.visa.com/capabilities/visa-offers-network/docs))

American Express tells merchants they pay for statement credits awarded after
qualifying purchases, and reports campaign performance after the campaign.
([Amex Offers for merchants](https://www.americanexpress.com/ca/en/merchant/amex-offers.html))

**Transfer to AE:** let a supplier define a machine-readable campaign such as:

```text
first Qualified Use by an independent principal             $0.04 credit
same workRef productively consumes that result               +$0.06 credit
principal returns organically 7–30 days later                +$0.20 credit
```

This is better than card-linked offers because AE can verify a bounded use chain,
not only a purchase. The supplier buys trial, productive incorporation, or
retention—not synthetic calls.

### 2. Marketplace buyer/seller incentives

DoorDash and Uber show the transition from platform-funded discounts to
seller-funded demand generation.

DoorDash Sponsored Listings are pay-per-order: merchants are charged for
confirmed attributed orders rather than clicks or impressions. Promotions can
target new, existing, or lapsed buyers and are payable only when an order is
placed. ([DoorDash Sponsored Listings](https://merchants.doordash.com/en-us/products/sponsored-listings),
[DoorDash Ads and Promotions](https://merchants.doordash.com/en-us/learning-center/marketing-to-new-customers))
Its promotion-tax documentation explicitly distinguishes DoorDash-funded,
merchant-funded, third-party-funded, and split-funded discounts.
([DoorDash promotion funding](https://help.doordash.com/en-us/merchants/article/us-promotion-tax))
Uber's merchant terms likewise distinguish fully merchant-funded from
co-funded promotions.
([Uber Eats merchant advertising terms](https://www.uber.com/jp/en/legal/uber-eats-merchant-advertising-terms/))

DoorDash is also piloting an unusually relevant reinvestment loop: eligible
merchants earn 5% back on their own Sponsored Listing spend as marketing credit,
automatically usable on future campaigns; only merchant-funded spend qualifies.
([DoorDash marketing credits](https://merchants.doordash.com/en-us/learning-center/marketing-credits))

**What funds rewards:** seller marketing budgets, platform promotional budget,
subscription revenue, commissions, and advertising margin.

**Behavior reinforced:** first purchase, repeat purchase, filling idle capacity,
and seller reinvestment into measurable demand.

**Anti-abuse:** pay on confirmed orders, target defined cohorts, cap budgets,
exclude platform-funded spend from earning reinvestment credit, and make credits
non-transferable with expiry. These are better controls than paying on clicks.

**Aggregate effect:** strong when buyer traffic makes supplier campaigns more
valuable. Pure platform-funded buyer discounts remain subsidy until membership,
ads, or contribution margin demonstrably covers them.

**Transfer to AE:** supplier boosts should be outcome-priced campaigns, with an
optional automatic rule that reinvests part of a supplier's earned AE revenue
into acquiring new independent agents. Do not grant supplier ranking in exchange
for the budget; label sponsorship and preserve route quality constraints.

### 3. Compute and inference gateways

The gateway market is a warning against casually “skimming inference.”

OpenRouter says it passes provider pricing through without inference markup and
earns a 5.5% fee when users purchase credits; it charges for high-volume BYOK
usage and provides aggregated billing, routing, uptime, fallbacks, analytics,
budgets, and free-model access under rate limits.
([OpenRouter FAQ](https://openrouter.ai/docs/faq),
[OpenRouter pricing](https://openrouter.ai/pricing))
Cloudflare similarly offers core AI Gateway analytics, caching, and rate limiting
free, passes inference through without markup, and charges 5% on Unified Billing
credit purchases. ([Cloudflare AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/))
Vercel advertises zero token markup, including BYOK, and provides a small free
monthly gateway credit until a team buys paid credits.
([Vercel AI Gateway pricing](https://vercel.com/docs/ai-gateway/pricing))

The real savings mechanisms are concrete:

- Cloudflare can serve identical requests from cache and avoid the provider call.
  ([Cloudflare AI Gateway caching](https://developers.cloudflare.com/ai-gateway/features/caching/))
- OpenAI's Batch API gives asynchronous work a 50% discount.
  ([OpenAI Batch API](https://platform.openai.com/docs/api-reference/batch/object))
- OpenAI prompt caching discounts repeated input, with usage responses exposing
  cached-token counts. ([OpenAI prompt caching](https://openai.com/index/api-prompt-caching/))
- AWS Marketplace supports negotiated private per-inference rates and custom
  usage pricing. ([AWS Marketplace private ML offers](https://docs.aws.amazon.com/marketplace/latest/userguide/private-offers-supported-product-types.html))

**What funds rewards:** a credit-purchase/platform fee, free-provider capacity,
avoided provider calls, batch discounts, negotiated rates, or enterprise
commitments.

**Behavior reinforced:** consolidated billing, retained gateway traffic,
delay-tolerant jobs, repeated context, and provider portability.

**Anti-abuse:** rate limits on free models, prepaid balances, spend limits,
cache eligibility and TTLs, explicit BYOK thresholds, and auditable actual cost.

**Aggregate effect:** conditional. Ten thousand unrelated low-latency prompts do
not automatically become cheaper. Scale helps only when calls share prefixes or
results, tolerate batching, create negotiable commitments, or allow evaluated
equivalent routing.

**Transfer to AE:** do not fund “free thinking” from an opaque inference markup,
especially while stacking on another gateway. Pin a comparable baseline before
execution and ledger only realized surplus:

```text
pinned direct/provider baseline
  - settled provider cost
  - incremental cache/gateway cost
  - quality-risk reserve
  = distributable efficiency surplus
```

If that number is zero, inference did not fund a reward.

### 4. Developer platforms and API marketplaces

Developer platforms use two different incentive classes.

**Trial credits are acquisition subsidy.** AWS Activate distributes promotional
AWS credits through approved accelerators, investors, and other providers, with
provider affiliation and fraud checks.
([AWS Activate Providers](https://aws.amazon.com/activate/portfolio-detail/),
[provider requirements](https://aws.amazon.com/activate/portfolio-detail/requirements/))
The credit is useful, but does not compound by itself; AWS funds it in expectation
that workloads remain after expiry.

**Metered trials and negotiated offers can become durable.** GitHub Marketplace
lets verified publishers offer free, flat-rate, or per-unit plans and fixed
14-day free trials; one customer cannot take multiple trials of the same product,
and the trial converts unless cancelled.
([GitHub Marketplace pricing plans](https://docs.github.com/en/apps/github-marketplace/selling-your-app-on-github-marketplace/pricing-plans-for-github-marketplace-apps))
AWS Marketplace lets sellers provide time-bounded custom per-inference rates and
free trials that transition to usage pricing.
([AWS private offers](https://docs.aws.amazon.com/marketplace/latest/userguide/private-offers-supported-product-types.html))

**What funds rewards:** cloud/platform CAC, publisher free capacity, and seller
discounts against future paid conversion.

**Anti-abuse:** verified publishers, one trial per product, affiliation checks,
time bounds, explicit post-trial pricing, metering, and account eligibility.

**Aggregate effect:** weak for generic launch credits; strong when concentrated
buyer demand supports negotiated per-unit pricing or a supplier's measurable
conversion funnel.

**Transfer to AE:** every free supplier Operation must declare who funds it,
its hard budget, eligible principals, expiry, conversion terms, and maximum
redemptions. “Free” supply with no service-level or post-trial economics is not
a flywheel.

### 5. Gaming progression, passes, and quests

Games prove how to make progress legible, but the economics are often
misunderstood.

Brawl Stars has a free reward track plus paid monthly tracks. Players earn pass
XP through play and quests; paid tracks add resources and benefits, while
post-completion XP continues to produce tail rewards.
([Brawl Pass support](https://support.supercell.com/brawl-stars/en/articles/brawl-pass-quests-7.html))
Supercell has publicly changed quest cadence after observing players disengage
when they reached a key reward, and shifted more progress into flexible seasonal
quests rather than mandatory daily play.
([Brawl Pass design changes](https://supercell.com/en/games/brawlstars/blog/news/incoming-changes-to-the-brawl-pass/))

Fortnite lets XP from any experience advance all active passes simultaneously,
but each premium pass still requires purchase. Some purchased quest packs release
V-Bucks only after daily bonus goals, with only three qualifying goals per day.
([Fortnite pass progression](https://www.epicgames.com/help/c-202300000001636/c-202300000001721/a202300000012763?lang=en-US),
[Fortnite V-Bucks quest packs](https://www.epicgames.com/help/c-202300000001636/c-202300000001721/how-do-i-get-my-v-bucks-from-quest-packs-in-fortnite-a202300000016256?lang=en-US))

**What funds rewards:** pass purchases, subscriptions, high-margin digital goods,
and the retention value of a larger player base. XP itself funds nothing.

**Behavior reinforced:** breadth of engagement, return cadence, mastery,
completion, and prepaid commitment.

**Anti-abuse:** daily qualifying caps, specific quest requirements, account-bound
non-cash rewards, expiry/season boundaries, and separate payment for premium
tracks.

**Aggregate effect:** mostly a retention loop, not a procurement economy. More
engagement improves the game ecosystem and monetization, but does not
automatically lower the cost of each reward.

**Transfer to AE:** show deterministic progress toward useful entitlements:
“two independently useful continuations unlock one supplier-funded Operation.”
Use category or mission quests to encourage discovery. Do not use variable-ratio
loot boxes, random jackpots, streak penalties, or points that lack an exact
redemption schedule.

### 6. Crypto mechanisms: what to borrow and what to leave behind

#### Fee rebates and referral revenue share

GMX splits a portion of position fees between trader discounts and referrer
rewards. It uses tiers, active-user and volume thresholds, code ownership,
self-referral controls, and “graduation” that preserves a high-volume trader's
discount while ending the prior affiliate's reward. Rewards accrue only from
specified fee-bearing transactions.
([GMX referrals](https://docs.gmx.io/docs/referrals/))

This is durable when the platform retains enough net fee after rebates. It is
wash-prone when the reward is based on gross volume rather than net paid fees or
economic outcome. AE should copy fee-source attribution and capped residuals,
not volume mining.

#### Liquidity-provider fees and protocol-owned liquidity

Uniswap pays liquidity providers from fees on actual swaps, pro rata while their
positions are active. More useful trading can therefore generate more fee
revenue for the capital that makes trading possible.
([Uniswap LP fees](https://support.uniswap.org/hc/en-us/articles/20901935681677-What-is-a-liquidity-provider-LP-fee))

Olympus describes protocol-owned liquidity as permanent protocol-held DEX
liquidity intended to replace rented liquidity-mining incentives.
([Olympus protocol-owned liquidity](https://docs.olympusdao.finance/main/overview/pol))

The transferable idea is **own the productive asset instead of endlessly renting
behavior**. AE's productive asset is not a token pool; it is independently
validated route evidence, negotiated capacity, reusable cache material, and
supplier integrations. Spend promotion budget to acquire those assets, not to
inflate call count.

#### Retroactive rewards and public-goods funding

Optimism's stated flywheel is revenue-backed: member chains contribute the
greater of 15% of net transaction-fee profit or 2.5% of gross transaction fees,
and the shared treasury funds infrastructure and open-source work intended to
attract more chains, apps, and users.
([Optimism capital allocation](https://docs.optimism.io/governance/capital-allocation))
Retro Funding is explicitly described as an experimental program rewarding
public goods after impact.
([Optimism governance FAQ](https://docs.optimism.io/governance/gov-faq))

Gitcoin shows the hard part: matching pools that weight participant count invite
Sybil identities, duplicate projects, and collusion. Gitcoin has used identity
verification, cluster matching, model-based detection, and reductions to
suspicious matches.
([Gitcoin QF attack analysis](https://gitcoin.co/blog/how-to-attack-and-defend-quadratic-funding),
[Gitcoin GG22 results](https://gitcoin.co/blog/gg22-results-recap))

**Transfer to AE:** later, reserve a published share of realized platform revenue
for retroactive bounties on adapters, benchmarks, and missing capabilities that
demonstrably improved usage. Do not distribute routine user rewards by popular
vote; it adds governance and Sybil complexity where consumers simply want free
utility.

## The creative AE-native mechanism: Reusable Route Bounties

### The product truth

When an agent routes an Operation, it does more than buy a result. It may produce
new evidence about a reusable execution path:

```text
goal class + constraints
  → Operation A
  → contract-valid result
  → Operation or inference B consumes it
  → bounded outcome evidence
  → actual cost, latency, failures, retries, and policy
```

The private inputs and outputs remain private. The potential shared artifact is
the route shape, compatibility facts, quality policy, aggregate result, and cost
evidence.

### How an agent earns free utility

1. **Frontier quest:** AE exposes an evidence-backed gap such as “find a route
   from company domain to verified decision-maker under $0.04.” A supplier may
   sponsor it; otherwise it has a fixed AE exploration budget.
2. **First useful path:** an agent completes the route with Qualified Use and
   Continuation Receipts. It receives an immediate, fixed Operation-credit
   bounty—not a chance prize.
3. **Independent replay:** two unaffiliated principals reproduce the route within
   declared cost and quality tolerances. Replayers also receive fixed credit.
4. **Admission:** the privacy-safe route becomes eligible for AE routing. It is
   versioned and expires when suppliers, prices, schemas, or quality drift.
5. **Residual:** when a later agent uses the admitted route, the discoverer can
   receive a small, capped, non-transferable Operation credit only from:
   - measured savings versus a pinned comparable route, or
   - an attached supplier campaign that pays for the resulting Qualified Use or
     continuation.
6. **Graduation:** after a time, use, or payout cap, residuals end and the route
   becomes ordinary network intelligence. This follows GMX's useful affiliate
   “graduation” pattern and prevents perpetual rent extraction.

Example distribution of **realized** savings—not spend:

```text
comparable route cost                         $0.0400
settled admitted-route cost                   $0.0280
verified surplus                              $0.0120

executing agent's Free Reach                  $0.0060
route discoverer's capped residual            $0.0020
AE reliability / refund reserve               $0.0010
AE retained margin                            $0.0030
```

If quality is not equivalent, the route fails, or the comparable baseline is not
credible, verified surplus is zero. Supplier-funded residuals remain possible,
but must be labelled as sponsored.

### Why this creates a flywheel

```text
more real agent work
  → more route evidence and frontier discovery
  → independent replay creates trusted reusable paths
  → reusable paths lower failure-adjusted cost
  → realized savings fund free Operations and capped residuals
  → agents have a direct incentive to route, explore, and verify through AE
  → more real agent work
```

This makes every successful route feel constructive without pretending every
route deserves a payout. The agent is building a potentially reusable trail;
value becomes claimable only when independent evidence proves that the trail
helps someone else.

## Recommended funding waterfall

Every reward ledger entry should contain an immutable `fundingSource` and never
draw against hoped-for future volume.

```text
1. supplier campaign cash attached to the qualifying event
2. realized procurement rebate on that event
3. realized cache/batch/routing saving versus a pinned baseline
4. explicit AE promotional budget
5. no reward
```

Suggested initial allocation rules:

- Supplier campaign: 80–90% to the agent as spend-only credit; 10–20% AE
  campaign fee.
- Realized execution surplus: 50% executing agent, up to 15–20% temporary route
  residual, 10% reliability reserve, remainder AE.
- AE launch budget: hard cohort and lifetime cap; reported separately from
  externally funded rewards.
- Expired reward liability: return supplier-funded balance to the supplier or
  follow disclosed campaign terms; never quietly count it as “community money.”

Do not promise a universal percentage before cost and conversion distributions
are observed.

## Abuse, integrity, and regulatory boundaries

### Minimum anti-wash controls

- No rewards for a supplier invoking its own Operation, common beneficial
  ownership, circular counterparties, sandbox calls, duplicates, or refunded and
  uncertain transactions.
- A new-principal reward requires an independent economic principal, not merely a
  new API key or wallet.
- Hold high-value rewards through the refund/reconciliation window and reverse
  them when the underlying event reverses.
- Cap campaign rewards by principal, supplier, Operation, route, and time period.
- For untrusted identities, keep reward value below irrecoverable third-party
  cost; otherwise buying the Operation solely to mine the reward becomes
  profitable.
- A continuation must cryptographically cite the prior receipt and pass bounded
  consumption checks; an empty model call does not qualify.
- Route admission requires independent replay and versioned quality/cost
  tolerances. Detect coordinated replay clusters and related accounts.
- Sponsored effective prices are visible; sponsorship cannot override privacy,
  quality, reliability, or jurisdiction policy.
- Reward metrics use net settled fees, savings, and independent productive users,
  never gross call or token volume.

Gitcoin's first-party analysis is the warning: any mechanism that overweights
the count of identities or transactions creates a market for fake identities and
coordinated activity. ([Gitcoin Sybil analysis](https://gitcoin.co/blog/defending-quadratic-funding-in-grants-round-10-and-beyond))

### Avoid securities-like design

AE should use ordinary account credits: dollar-denominated, non-transferable,
non-cash-redeemable, expiring, usable only for AE services, and not marketed for
appreciation or passive return. Do not issue a tradable “route token,” pool user
capital, promise yield from aggregate platform success, or grant perpetual
revenue rights.

ASIC emphasizes that a digital asset's full bundle of rights, benefits,
expectations, and marketing determines its treatment; tokens used to raise funds
and tied to business success or buybacks may be financial products. The label
“utility token” is not decisive.
([ASIC digital assets guidance](https://www.asic.gov.au/regulatory-resources/digital-transformation/digital-assets-financial-products-and-services))

Route residuals should therefore be capped compensation for an evidenced service
(discovering and validating a route), paid as consumable service credit—not an
investment. This is product guidance, not a substitute for Australian legal
review before launch.

### Avoid gambling-like design

Use deterministic quests and published reward amounts. Do not condition a
chance-based prize on paid Operation volume. The U.S. FTC states that
sweepstakes-type promotions requiring purchase are illegal in the United States,
with additional state requirements.
([FTC advertising FAQ](https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business))
Other jurisdictions differ, which is another reason to avoid paid chance
entirely.

## What not to build

| Temptation | Why it fails |
|---|---|
| “One point per call” | Points theater; rewards cost and redemption liability are hidden, while calls become the target. |
| Community voting on free stuff | Adds governance, low-information voting, and Sybil pressure without producing a funding source. |
| Universal inference skim | Easy revenue, not a flywheel; gateways increasingly advertise pass-through pricing and users can bypass a double toll. |
| Gross-volume rebates | Encourages call splitting and wash activity. Pay from net fee or verified outcome. |
| Mystery Operation drops | Creates gambling/promotion complexity and sends agents capabilities they may not need. |
| Tradable Reach token | Adds speculation, treasury/liquidity obligations, accounting complexity, and possible financial-product exposure. |
| Protocol-owned liquidity now | AE does not need a liquid market in its own asset. Own integrations, route evidence, benchmarks, and capacity instead. |
| Permanent route royalties | Creates rent-seeking and stale-route incentives. Cap and graduate residuals. |
| “Community fund” with undisclosed breakage | Users cannot tell whether value was earned, donated, expired, or simply invented. Ledger every source and rule. |

## First experiment

Run one six-week category pilot after the x402 start-line transaction works.

### Cohort and supply

- One coherent category with repeatable workflows and at least three independent
  suppliers.
- Three frontier quests derived from observed failed searches or expensive manual
  compositions.
- One supplier-funded Qualified Trial campaign and one fixed AE exploration
  budget.
- No public pool, vote, token, randomized reward, or universal inference credit.

### Closed loop to prove

```text
agent claims a frontier quest
  → buys or receives a sponsored Operation
  → Qualified Use + productive continuation
  → receives deterministic immediate credit
  → two independent agents replay the route
  → route is admitted
  → a later agent uses it at lower failure-adjusted cost
  → realized saving funds executing-agent credit + capped discoverer residual
  → both credits are redeemed on real Operations
```

### Success measures

- External funding share: supplier cash plus realized savings as a percentage of
  all rewards; target a rising trajectory, not a vanity absolute number.
- Qualified Trial → Continued Use → organic return conversion by supplier and
  cohort.
- Reward redemption into a later real Operation, not balance accrual.
- Independently replayed routes admitted, reused, and still inside quality/cost
  tolerance.
- Realized net savings after retries, gateway expense, reward liability, and
  refund reserve.
- Incremental demand: sponsored cohort versus an eligibility-matched holdout.
- Abuse: related-account rate, self/circular activity, reward reversals, route
  replay clusters, and paid volume with no downstream consumption.
- Concentration: no single supplier or principal should dominate enough to make
  the “market” a bilateral subsidy arrangement.

### Kill conditions

Stop or redesign if any of the following persists after the learning window:

- rewards remain primarily AE-funded;
- sponsored calls do not produce more organic return than an untreated holdout;
- route residuals exceed realized savings;
- agents optimize receipt production rather than useful continuations;
- independent replay is too expensive or privacy-invasive;
- reward administration costs approach the reward value;
- suppliers demand undisclosed ranking influence.

## Final recommendation

Do not hand-roll a loyalty currency. Import the proven financial structure of
card-linked offers and pay-per-order marketplace advertising; import the real
cost levers of inference gateways; import deterministic progress from games;
and import revenue-backed retroactive payment plus Sybil caution from crypto.

The distinctive product should be:

> **Agents earn free reach when they create or validate a route that later proves
> useful—not merely because they spent.**

Sponsored Qualified Trials give AE a bootstrap funder. Reusable Route Bounties
make each successful route potentially productive for others. Capped Route
Residuals let the contributing agent receive something materially free when
that contribution creates measured future value. Savings-backed Free Reach
makes the loop strengthen with aggregate execution.

That is a real flywheel because the artifact and the funding source both improve
with useful volume. Everything else is a promotion layer until proven otherwise.

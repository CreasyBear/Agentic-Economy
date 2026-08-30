# Agent Commerce Flywheel — Earned Free Reach

**Status:** founder decision note; post–start-line product direction  
**Decided:** 2026-08-25  
**Relationship to the active milestone:** this does not widen the Treg-clone
start line. First prove one unfamiliar agent can discover, pay for, and receive
one independently supplied x402 Operation end to end.

## Decision

Agentic Economy will not invent an unbacked points economy, pooled community fund,
governance system, token, or universal inference skim.

It will make agents materially better off by returning value that a routed
Operation actually creates:

1. **supplier acquisition money** for a verified new or retained agent;
2. **execution surplus** produced when suppliers compete or AE lowers settled
   cost without lowering declared quality;
3. **route value** when one agent discovers a reusable path that later agents
   independently validate and reuse.

The durable rule is:

> **Every reward must trace to supplier cash, realized savings, retained
> transaction revenue, or an explicitly capped AE promotion budget.**

If none exists, there is no financial reward to manufacture. The agent still
gets the Operation result and a receipt that can contribute to a reusable route,
but AE does not issue fake progress.

The Australian evidence adds an important product rule:

> **The product is the ledger that preserves tiny funded fractions until they
> can make one later action genuinely free.**

Every eligible settled Qualified Operation should therefore accrue its exact
share of a published AE gross-profit allocation, supplier campaign, or realised
execution saving. Sub-cent fractions carry forward across suppliers and work
references; they are never rounded away at the Operation boundary. Richer
outcome rewards accelerate the balance, but aggregation is the everyday habit.

## What successful Australian schemes prove

| Program | Proven mechanism | Lesson for AE |
|---|---|---|
| **Flybuys** | Usually 1 point per A$1 and 2,000 points for A$10 off: a 0.5% base return accumulated across a coalition. It had 9.9 million active members in FY25, although Coles recorded a A$5 million share of the joint venture's loss. | A tiny base earn works when one balance spans many suppliers and reaches a concrete redemption. Strategic network value can exceed standalone program profit. |
| **Everyday Rewards** | At least 1 point per A$1; 2,000 points becomes A$10, Bank for Christmas, or 1,000 Qantas Points. Woolworths accounts for issued points as a contract liability and recognises estimated breakage. | Show continuous progress, preserve the liability, and allow earn in one category to burn in another. |
| **Qantas Loyalty** | External partners buy points. FY25 produced A$2.863 billion revenue and A$556 million EBIT while Qantas carried A$3.556 billion of unredeemed-point revenue. | The common reward currency can become the B2B product; issuance and redemption economics matter more than per-call rake. |
| **Velocity** | FY25 external billings rose 14%; the segment produced A$127.3 million EBIT at a 28.3% margin. | Partner billings and active earn/burn are stronger health measures than registrations. |
| **Cotton On Perks Payday** | Separate eligible purchases accumulate to A$100, triggering a closed-loop A$10 voucher with a A$20 minimum spend, 45-day expiry and reversal controls. | Aggregate fragments, then redeem into another network purchase whose perceived value can exceed issuer cost. |
| **Medibank Live Better** | Rewards verified health actions and partner purchases; 931,000 participants redeemed A$32.8 million in FY25. | Keep a universal base earn, but pay larger bonuses for productive behaviour tied to the core business. |
| **pay.com.au** | Businesses explicitly pay 1.0% for 1 PayRewards point per dollar or 1.8% for 2, then aggregate and transfer into airline/hotel programs. | Aggregation and redemption optionality are valuable enough to buy, but user-funded points must never be described as free value. |
| **CommBank Yello, October 2026** | CBA is replacing separate card and product cashbacks with one balance earned across cards, loans, savings, insurance, travel and partners as card interchange falls. | Skate toward relationship-level aggregation, not a reward funded by one transaction type. |

The counterexample is ANZ's Cashrewards closure and A$78 million impairment in
2025. Thin affiliate cashback attached to a separate destination lacked enough
economic or strategic rationale. AE must embed rewards in the transaction
router itself.

## The selected system

### 1. Sponsored Qualified Trials — bootstrap engine

A supplier declares and funds a machine-readable campaign:

```text
first Qualified Use by an independent principal       A$0.04 Reach Credit
same workRef productively consumes the result          +A$0.06 Reach Credit
principal returns organically within 7–30 days         +A$0.20 Reach Credit
campaign cap                                           A$2,000
```

The pattern is externally proven:

- Visa's Offers Platform qualifies consented settled transactions and can
  issue rewards; its Offers Network lets merchants and offer networks supply
  the offers.
- Whop Content Rewards requires a defined rate, requirements, end date and
  maximum payout; the campaign is funded before approved contributors receive
  Whop Credits.
- DoorDash Sponsored Listings charge merchants for attributed confirmed orders,
  not impressions, and distinguish merchant-, platform-, third-party- and
  split-funded promotions.
- Shopify Shop Campaigns let merchants set acquisition cost limits and pay for
  attributed acquisitions.

AE improves on purchase attribution because it already has an immutable
**Qualified Use** receipt. Later privacy-bounded **Continuation Evidence** can
show that an agent consumed the purchased result in subsequent work. It does
not prove that the result was correct or objectively useful; **Agent
Evaluation** remains an attributed buyer judgment. Suppliers buy evidenced
adoption rather than calls.

Sponsorship changes effective price, never admission or the quality floor.
Sponsored supply is labelled before routing.

### 2. Capability Intent Competition — surplus engine

For comparable Operations, an agent should be able to declare an intent rather
than select a listing:

```ts
type CapabilityIntent = Readonly<{
  capability: string
  inputContractRef: string
  outputContractRef: string
  maximumTotalCost: ExactAmount
  maximumLatencyMs: number
  minimumQualityPolicyRef: string
  privacyPolicyRef: string
  jurisdictionPolicyRef?: string
}>
```

Eligible suppliers or routers compete to satisfy it. AE selects the best
failure-adjusted solution inside the agent's constraints and settles the
result.

This borrows directly from CoW Protocol's fair combinatorial auction. CoW
aggregates intents, independent bonded solvers submit solutions, unfair batches
are filtered out, and the winning combination maximizes user surplus while each
order must receive at least its standalone outcome.

AE should begin more simply:

- auction only fungible, machine-verifiable Operations;
- preserve a standalone quote before competition;
- compare settled cost including retry and latency policy;
- return a declared share of verified improvement to the executing agent;
- retain a reliability reserve and AE margin;
- expose all sponsorship separately from execution quality.

This is not payment for order flow. Australian Consumer Law and the product's
allocation integrity are the controlling local frame. The SEC's Robinhood
action is only a foreign design warning: opaque routing payments can finance
“free” service while producing inferior execution. Supplier payments cannot
make a worse route win. The agent sees the standalone baseline, winner, settled
cost, sponsorship, surplus and reward.

### 3. Reusable Route Bounties — compounding asset

The genuinely AE-native mechanism is to let real work discover reusable paths.

```text
goal class + declared constraints
  → Operation A
  → contract-valid result
  → Operation or inference B consumes it
  → bounded outcome evidence
  → actual cost, latency, failures, retries and policy
```

The inputs and outputs remain private. The potential shared artifact is the
route shape, compatibility facts, cost envelope, quality policy and aggregate
evidence.

An agent earns free utility through a bounded process:

1. **Discovery:** an agent completes a route for a published frontier gap or
   produces a candidate route during normal work.
2. **Replay:** at least two unaffiliated principals reproduce it within declared
   cost and quality tolerances.
3. **Admission:** the privacy-safe, versioned route becomes eligible for AE
   routing and expires when schemas, prices or quality drift.
4. **Reuse:** a later agent uses the route.
5. **Residual:** the discoverer receives a small, capped, non-transferable Reach
   Credit only from measured route savings or an attached supplier campaign.
6. **Graduation:** after a payout, use or time cap, the residual ends and the
   route becomes ordinary network intelligence.

This stitches together three proven mechanics:

- Hivemapper returns part of paid map consumption to contributors whose useful
  work created the consumed network asset.
- GMX referral rewards accrue from specified fee-bearing transactions and can
  graduate rather than create a permanent claim.
- CoW demonstrates that independently competing execution paths can create
  measurable user surplus.

Example distribution of **realized savings**, not gross spend:

```text
pinned comparable route cost                  A$0.0400
settled admitted-route cost                    A$0.0280
verified execution surplus                     A$0.0120

executing agent's Reach Credit                 A$0.0060
temporary discoverer residual                  A$0.0020
reliability/refund reserve                      A$0.0010
AE retained margin                             A$0.0030
```

If the routes are not quality-equivalent, the call fails, or the baseline is
not credible, realized surplus is zero. There is then no savings-funded reward.

### 4. Aggregate Reach — accrual and redemption rail

Aggregate Reach is one exact balance across eligible Operations. It is an
account-bound, non-transferable, non-cash-redeemable entitlement to future
AE-supplied services. It is measured in AUD micros for the ledger and may be
shown as progress in the interface, but it is not represented as deposited
money, a wallet, USDC or customer property.

Every eligible Operation can add several independently attributed fractions:

```text
Operation cost                                A$0.023700
supplier campaign earn                        A$0.001200
realised routing/caching surplus share         A$0.000430
AE gross-profit loyalty allocation             A$0.000240
Aggregate Reach accrued                        A$0.001870
```

The balance can pay for:

- a future Operation;
- the inference needed to consume an Operation result;
- retry or failure protection;
- priority capacity;
- part of an Agent Pass introduced after cohort economics are known.

Partners may eventually fund campaigns that cause AE to issue Reach Credit when
an eligible agent uses an AE service. Airline programs prove that a broadly
redeemable reward currency can become a major B2B product: American Airlines
reported US$6.2 billion of cash payments from co-branded card and other partners
in 2025. AE should not sell or distribute bulk balances at launch. That creates
a redemption liability and may change the Australian legal character of the
facility; partner, accounting and legal economics need to be proven first.

“Free continuation” is one good redemption experience:

> **This Operation earned enough credit to think with its result.**

It is no longer presented as the flywheel or issued as an unfunded universal
promise. The funding source determines each fraction. AE should automatically
redeem when the balance can make the next useful eligible Operation fully free,
unless the principal elects to save it. The relevant milestone is not A$10; it
is the cheapest useful complete Operation for that agent.

Precision is part of the product. Calculate on exact settled amounts, store
integer micros or an equivalent fixed-point unit, carry every remainder, and
reverse the exact original accrual when the underlying transaction reverses.
Australian card programs commonly discard fractions after per-purchase
rounding; that would make an atomic-operation loyalty program fail.

## Australian launch posture

The Australian structure is narrower than the long-term platform vision.

ASIC Corporations (Non-cash Payment Facilities) Instrument 2026/167 declares a
qualifying **loyalty scheme** not to be a financial product for Chapter 7. Its
definition requires the scheme's dominant purpose to promote purchases or use,
credits to be allocated as a result of those purchases or uses, and credits to
buy goods, services or another benefit. It must not be part of another financial
product.

Reach Credit should be deliberately designed for that fact pattern, subject to
fixed-scope Australian legal advice on the implemented terms and money flow:

- the customer buys a completed AE capability service in AUD;
- AE's own treasury buys the underlying x402 Operation as a cost of sale;
- qualifying use of the AE service may earn a promotional credit;
- the credit reduces the price of a later AE-supplied service;
- customers cannot purchase, top up, cash out, transfer, sell or withdraw it;
- it cannot pay an external person or appear as USDC on a customer sub-ledger;
- supplier campaign money belongs to AE until the qualifying discount is
  applied; AE is not holding it beneficially for the customer or supplier;
- expiry, earning, reversal and redemption terms are prominent and stable;
- sponsorship and the effect on effective price are disclosed before routing;
- route and transaction data are not repurposed for targeting without clear
  disclosure and control.

This follows the already selected Australian Stage 1 posture: AE is a B2B
capability reseller, not a wallet, exchange or supplier payment agent. If Reach
Credit becomes purchasable, transferable, cash-redeemable, externally spendable
or attached to a customer-controlled asset balance, stop and reclassify the
facility before launch. The loyalty-scheme treatment is a design path, not a
self-executing exemption.

## What the agent sees

Before routing:

```json
{
  "intent": "company.domain -> verified.decision_maker",
  "standaloneQuote": { "amount": "0.0400", "currency": "AUD" },
  "maximumCost": { "amount": "0.0400", "currency": "AUD" },
  "eligibleReward": { "amount": "0.0500", "currency": "AUD", "source": "supplier_campaign" },
  "requirements": ["first_independent_qualified_use", "productive_continuation"],
  "sponsored": true
}
```

After settlement:

```text
Operation complete
3 eligible routes competed

Standalone quote                  A$0.040
Settled execution                 A$0.028
Execution surplus                 A$0.012
Supplier campaign reward          A$0.050
Your Reach Credit                 A$0.056
Discoverer residual               A$0.002
AE + reliability reserve          A$0.004

You can spend A$0.056 on any eligible Operation or continuation.
This route is now 2 / 3 independent replays from admission.
```

The agent can optimize on **effective cost**, while still enforcing quality,
privacy, latency and jurisdiction:

```text
effective cost
  = settled price
  + expected retry/failure cost
  + agent-selected latency penalty
  - explicit campaign reward
  - executing-agent share of verified surplus
```

## Funding waterfall

Every reward ledger entry carries an immutable `fundingSource`. AE never draws
against hoped-for future value.

```text
1. supplier campaign cash attached to the qualifying event
2. realised procurement rebate on that event
3. realised cache, batch, competition or routing saving
4. a fixed, capped share of realised AE gross profit
5. explicit AE promotional budget
6. no reward
```

Initial constraints:

- supplier campaigns pass most of their budget to the agent and charge a
  visible campaign/service fee;
- the everyday base accrual is a published share of realised gross profit, not
  a percentage of unprofitable gross volume;
- execution rewards never exceed realized event-level or cohort-level surplus;
- high-value rewards wait through the refund/reconciliation window;
- expired supplier money returns according to published campaign terms;
- AE promotional subsidy is separately labelled and hard-capped;
- no universal reward percentage is promised before distributions are known.

## The flywheel

```text
suppliers fund measurable agent acquisition
  → agents see lower effective cost and route real work through AE
  → comparable intents create supplier competition
  → execution and continuation create reusable route evidence
  → validated routes reduce failure-adjusted cost
  → realized savings fund free reach and temporary route residuals
  → agents route, discover and verify more work through AE
  → concentrated verified demand makes campaigns and negotiated supply
    more valuable to suppliers
  → suppliers fund more measurable acquisition
```

The user feels they made something because a productive route can create:

1. the result needed now;
2. spendable free reach funded by a sponsor or real surplus;
3. progress toward admission of a reusable route;
4. a capped residual if later independent demand proves that route valuable.

The economic asset is the validated route graph, not the credit balance.

## Integrity rules

- No reward for owner/self traffic, common beneficial ownership, circular
  counterparties, sandboxes, duplicates, refunds, or uncertain settlement.
- A new principal means an independent economic principal, not a new key or
  wallet.
- A continuation cryptographically cites its Qualified Use receipt and passes a
  bounded consumption check; an empty model call does not qualify.
- Route admission requires unaffiliated replay and versioned tolerances.
- Sponsored effective prices are visible and cannot override quality, privacy,
  reliability or jurisdiction policy.
- Reward metrics use net settled fees and measured surplus, never raw call,
  token or gross-payment volume.
- For low-trust identities, the reward stays below irrecoverable third-party
  cost so reward mining is unprofitable.
- Credits are initially consumable service credits, not investments: no yield,
  appreciation claim, pooling of user capital, tradability or perpetual route
  royalty.
- Quests are deterministic. No mystery drops, paid chance or loot boxes.

## What already exists in AE

| Needed primitive | Existing foundation | Incremental gap |
|---|---|---|
| Exact economic events | `moneyUsageEvents`, ledger entries, refunds and payout allocations | Add reward funding/allocation entries. |
| Contract-valid delivery | Immutable `qualifiedUseReceipts` | Add optional privacy-bounded continuation receipts. |
| Supplier economics | Earnings, fixed brokered rake and payout state | Add supplier campaign balances and terms. |
| Agent authority | Credential budgets and external-spend reservations | Allow Reach Credit as a constrained funding source. |
| Safe execution | Durable invocation, idempotency and reconciliation | Carry intent, campaign and route references. |
| Model economics | OpenRouter usage and settled-cost visibility | Persist comparable baseline and actual cost under `workRef`. |
| Market evidence | Qualified Use and aggregate fact projections | Add independent route replay, drift and reuse evidence. |

This reuses the current ledger. It does not create a second money system.

## First experiment after the x402 start line

Run a six-week pilot in one fungible category with at least three independent
suppliers.

1. Publish three capability intents derived from observed demand or failed
   discovery.
2. Accrue an exact fractional base reward on every eligible settled Operation,
   funded by 10–20% of realised AE gross profit for the bounded pilot.
3. Fund one supplier Qualified Trial campaign and one hard-capped AE frontier
   bounty.
4. Preserve a standalone quote, then let eligible routes compete.
5. Pay the immediate campaign reward only for Qualified Use and declared
   continuation/return evidence.
6. Admit one route only after two unaffiliated replays.
7. On later reuse, split only measured savings into executing-agent credit,
   temporary discoverer residual, reserve and AE margin.
8. Auto-redeem Aggregate Reach when it can make the next useful Operation free,
   and compare against a holdout receiving the same prices without accrual.

The primary experiment is whether exact micro-accrual gets a meaningful share
of agents to a first free action and then creates **incremental productive
routing**, without exceeding its declared funding pools. Use an
eligibility-matched holdout, following the measurement logic of outcome-funded
promotion platforms such as Upside.

### Success measures

- rewards funded by supplier cash, realised savings, declared gross-profit
  allocation and temporary promotion, reported separately;
- time and Operation count to the first fully free action;
- share of active principals reaching a meaningful redemption;
- Qualified Trial → continuation → organic return conversion;
- incremental productive routing versus the holdout;
- reward redemption into later real Operations;
- admitted routes reused inside quality and cost tolerance;
- realized net savings after retries, gateway expense and refund reserve;
- related-account activity, reward reversals and replay clusters;
- buyer and supplier concentration.

### Kill conditions

- the base allocation exceeds its gross-profit cap or boost economics remain
  dependent on temporary AE promotion;
- sponsored agents do not return more than an untreated holdout;
- rewards or residuals exceed their funded campaign or realized surplus;
- agents optimize receipt production rather than useful work;
- independent replay is privacy-invasive or costs more than route reuse saves;
- suppliers demand undisclosed ranking influence.

## Explicit rejections

| Proposal | Decision |
|---|---|
| One point per call | Reject: pays for cost and invites call splitting. |
| Pooled community reward fund | Reject: allocation mechanism without a value source. |
| User voting/governance | Reject: Sybil and attention burden unrelated to free utility. |
| Universal inference markup | Reject: a bypassable toll disguised as a reward. |
| Gross-volume rebates | Reject: creates wash volume. |
| Random drops | Reject: irrelevant utility and gambling/promotion complexity. |
| Tradable token | Reject: speculation, liability and regulatory surface. |
| Permanent route royalties | Reject: rent extraction and stale-route incentives. |

## Primary precedents

- [ASIC Corporations (Non-cash Payment Facilities) Instrument 2026/167](https://www.legislation.gov.au/F2026L00318/latest/text)
  — the controlling Australian definition and Chapter 7 treatment of qualifying
  loyalty schemes and low-value payment facilities.
- [ACCC guidance for customer loyalty schemes](https://www.accc.gov.au/business/advertising-and-promotions/customer-loyalty-schemes)
  — clear earning, expiry, value and data practices under the Australian
  consumer-protection frame.
- [Coles FY25 results](https://www.colesgroup.com.au/annual-report),
  [Everyday Rewards](https://www.everyday.com.au/rewards/how-it-works/your-rewards-choices.html)
  and [Cotton On Perks terms](https://cottonon.com/AU/perks/perks-terms.html)
  — Australian micro-accrual, coalition redemption and closed-loop Payday
  mechanics.
- [Qantas FY25 annual report](https://investor.qantas.com/FormBuilder/_Resource/_module/doLLG5ufYkCyEPjF1tpgyw/file/annual-reports/2025-Annual-Report.pdf)
  and [Virgin Australia FY25 results](https://www.virginaustralia.com/content/dam/vaa/documents/investor-centre/fy25-financial-results-asx-release.pdf)
  — partner-funded point issuance, reward liabilities and profitable loyalty
  businesses at Australian scale.
- [CommBank Yello redesign](https://www.commbank.com.au/articles/newsroom/2026/08/commbank-yello-reimagined.html)
  — the current shift from card cashback to whole-relationship points.
- [Medibank Live Better terms](https://www.medibank.com.au/livebetter/rewards/terms/)
  — verified productive-behaviour rewards with caps and reversals.
- [pay.com.au PayRewards fees](https://help.pay.com.au/hc/en-au/articles/14199849479439-Do-I-pay-a-fee-to-earn-PayRewards)
  and [ANZ FY25 annual report](https://www.anz.com/content/dam/anzcom/shareholder/2025-annual-report/anz-2025-annual-report.pdf)
  — the value of B2B reward aggregation and the failure of strategically thin
  standalone cashback.
- [Visa Offers Platform](https://developer.visa.com/products/vop) and
  [Visa Offers Network](https://developer.visa.com/capabilities/visa-offers-network/docs)
  — programmable merchant-funded qualification and rewards.
- [Whop Content Rewards terms](https://whop.com/content-rewards-terms/) — funded,
  capped, criteria-based campaigns and approved credit payouts.
- [DoorDash Sponsored Listings](https://merchants.doordash.com/en-us/products/sponsored-listings)
  and [promotion funding](https://help.doordash.com/en-us/merchants/article/us-promotion-tax)
  — pay-per-order seller acquisition and explicit funding attribution.
- [Shopify Shop Campaigns](https://help.shopify.com/en/manual/online-sales-channels/shop/shop-campaigns)
  — merchant-set acquisition economics and attributed rewards.
- [Upside measurement methodology](https://www.upside.com/business/how-it-works/measurement-methodology)
  — pay from measured incremental profit rather than assumed lift.
- [CoW Protocol fair combinatorial auction](https://docs.cow.fi/cow-protocol/concepts/introduction/fair-combinatorial-auction)
  and [solvers](https://docs.cow.fi/cow-protocol/concepts/introduction/solvers)
  — intent aggregation, independent competition, fairness and user surplus.
- [Hivemapper burn and mint](https://docs.hivemapper.com/honey-token/honey-burn-and-mint/)
  — paid consumption returning value to contributors who created the network
  asset.
- [GMX referrals](https://docs.gmx.io/docs/referrals/) — fee-backed residuals,
  self-referral controls and graduation.
- [OpenRouter pricing](https://openrouter.ai/pricing),
  [Cloudflare AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/),
  [OpenAI Batch API](https://platform.openai.com/docs/api-reference/batch/object)
  and [prompt caching](https://openai.com/index/api-prompt-caching/) — pass-through
  gateway economics and real efficiency sources.
- [American Airlines 2025 Form 10-K](https://www.sec.gov/Archives/edgar/data/6201/000000620126000014/aal-20251231.htm)
  — partner-funded loyalty currency as a large B2B product.
- [SEC Robinhood order](https://www.sec.gov/newsroom/press-releases/2020-321) —
  a foreign design caution, not the Australian legal frame, on hiding routing
  economics or allowing them to degrade execution.
- [ASIC digital-assets guidance](https://www.asic.gov.au/regulatory-resources/digital-transformation/digital-assets-financial-products-and-services)
  — why consumable service credit is preferable to a tradable reward asset.

The full external research and mechanism comparison is in
[`2026-08-25-external-incentive-flywheels.md`](.planning/research/2026-08-25-external-incentive-flywheels.md).

The Australian loyalty-system research is in
[`2026-08-25-australian-loyalty-microtransaction-flywheels.md`](.planning/research/2026-08-25-australian-loyalty-microtransaction-flywheels.md).

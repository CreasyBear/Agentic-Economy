# Agent Services Market — Category Thesis

**Date:** 2026-08-08  
**Status:** founder-confirmed destination; adversarial verdict: narrow hypothesis, not yet category proof  
**Authority:** `.planning/PROJECT.md`, `.planning/VISION-conceptual-map.md`, `.planning/wayfinder/MAP.md`, `UBIQUITOUS_LANGUAGE.md`

## The hypothesis

> **Agentic Economy lets developers turn agent capabilities into discoverable, metered services that agents can buy.**

Original working shorthand:

> **OpenRouter for agent services, with a Vercel-style publisher experience. The agent is the app store.**

That shorthand describes the destination, not an earned public category claim. A seven-role cold OMP council attacked demand, supply, market mechanics, protocol feasibility, competition, economics/legal exposure and category language. Its unanimous verdict was **NARROW**:

- kill the broad universal-marketplace claim;
- retain the **Market Operation** as the bounded market unit;
- treat AE as a gateway/control-plane feature until independent buyers keep it in the transaction path after direct alternatives are disclosed;
- call it a market only after repeat cross-supplier purchasing, reconciled settlement and contribution-positive supplier economics are observed.

The strongest honest sentence before that proof is:

> **Agentic Economy is a controlled transaction layer where authorized agents invoke admitted third-party Operations and suppliers accrue earnings only after Qualified Use plus separately authoritative reconciled settlement.**

The purchasing principal is the human or organization that owns the budget and grants authority. The agent is its delegated shopper, never the principal. Developers host implementations wherever they choose; AE admits versioned callable Operations, enforces the transaction boundary and records attributable outcomes.

The openness/control question is a launch sequence, not an unresolved philosophy. **V1 is closed:** one contract family, curated suppliers, and AE-owned admission, verification and reconciliation. **Later versions may open under published policy:** more families and delegated evidence issuers only after the first family proves the controls. Too open at launch becomes an unsafe directory; too controlled forever becomes a replaceable managed gateway.

## Evidence check

The council's critique matches the current source and reference products:

- OpenRouter's official quickstart exposes hundreds of models through one chat-completions interface; its provider router compares implementations of the same requested model using price, throughput, latency, data policy and fallback preferences. That supports the market analogy only where AE Operations are genuinely substitutable inside one contract family.
- agentic.market's machine-readable contract demonstrates agent-side service discovery, endpoint pricing and per-request x402 payment. It does not establish that arbitrary services share semantics or that buyers retain a neutral intermediary after learning the endpoint.
- Apify's pay-per-event model demonstrates that measurable outcomes can be monetized, but Apify owns the Actor runtime, charges platform costs and pays suppliers 80% of event revenue. It is evidence for outcome-linked billing and budget controls, not proof that a supplier-hosted neutral exchange has the same economics.
- OpenAI Plugins now package Skills and MCP servers behind one installable identity and public directory. This reduces supplier distribution friction but does not provide AE's admission, outcome or settlement semantics.
- Stripe Machine Payments now supports MPP and x402 for agent-paid APIs and services, including seller settlement and scoped payment credentials. Stripe can therefore invade the payment boundary; AE cannot treat payment plumbing as a moat.
- Cloudflare's WebMCP preview can expose typed website tools to browser agents at the edge while reusing the visitor's session. It weakens any moat based only on tool discovery or invocation transport.
- AE's owner publication path is explicitly a hard-coded `ae-demo-services.quote` boundary; real OpenAPI/MCP/x402 admission remains curated/admin (`convex/capabilitySupplyOwnerFunnel.ts:246-301`).
- AE's generic executor currently admits only keyless HTTPS JSON `GET` Operations and returns a validated result plus evidence hash; it is not a heterogeneous service router (`src/modules/capability-execution/operation-execute.functions.ts:7-31,129-232`).
- Production money is deliberately closed: all six counsel decisions remain open and Stripe is test/unavailable (`src/modules/money/internal/live-money-gate.ts:9-57`); server-side provider earnings and payout status still return `unsupported_console_query` (`src/lib/server/money-query.ts:77-81`).

Therefore the current code supplies useful admission, execution, evidence and ledger primitives, but no on-disk evidence proves the market claim, supplier economics, retained buyer demand or a production settlement loop.

## The analogies and their limits

### OpenRouter for services instead of models

OpenRouter gives applications one API over many models and providers. It normalizes access, exposes price and performance choices, routes calls, handles fallbacks, and attributes usage.

AE applies the same market structure to agent services:

| OpenRouter | Agentic Economy |
|---|---|
| Model | Market Operation |
| Model provider | Supplier / Provider |
| Model slug | `operationRef` |
| Messages and generation parameters | Operation-specific typed input |
| Completion | Typed result and evidence |
| Token price | Declared per-use price |
| Provider routing | Compatible-operation discovery and selection |
| Provider uptime/latency | Validated reliability and latency |
| Usage accounting | Qualified Use; earnings require separate authoritative reconciled settlement |

The important difference is heterogeneity. Models mostly fit a shared generation interface. Agent services do not. A search operation, memory service, verifier, browser worker and payment action have different inputs, outputs, data-use policies, effects, authority requirements and failure modes.

Therefore AE cannot merely proxy arbitrary APIs. Its common interface is the market lifecycle:

```text
discover → inspect contract → compare → authorize → invoke → validate → receipt → pay
```

### Vercel-style publisher experience — supplier UX only

The Vercel analogy describes the supplier experience, not an AE-owned runtime.

A developer should be able to move from a working capability to a live market service with a short self-serve path:

```text
build anywhere → connect endpoint → import contract → validate
→ set price → publish → observe usage → improve → earn
```

AE should make publishing, revisions, readiness, pricing, usage and earnings feel coherent and immediate. It should not require developers to understand AE’s internal registry, evidence, money or routing machinery.

The implementation remains supplier-hosted. Cloudflare, Vercel, Modal, AWS, Browserbase, E2B, a conventional server, or any future substrate can sit behind the same admitted Operation. Deployment integrations may improve acquisition later, but AE does not need to become a general-purpose host.

### The agent-as-store hypothesis — not yet a public claim

A conventional app store is a human storefront. A person browses, evaluates, installs and configures software before using it.

The strongest future version of AE would let a consuming runtime perform a bounded equivalent while pursuing an objective:

1. Recognize a missing capability.
2. Search a pre-admitted market for compatible Operations.
3. Inspect typed contracts, prices, evidence and constraints.
4. Compare viable suppliers inside one contract family.
5. Obtain required authority.
6. Invoke one service through AE.
7. Validate the result and retain the receipt.
8. Pin, reuse or replace the route on later work.

The model is not the purchasing principal. The user, developer, enterprise or runtime controls credentials, spend, data policy and effects. Repeated use will usually pin a route; AE retains a market role only if buyers still value its authorization, evidence, metering, settlement and fallback boundary enough not to bypass it.

Therefore “the agent is the app store” remains an internal provocation, not public positioning. The claim survives only if agents make genuinely new purchases and AE retains repeat paid transactions after provider identity and direct alternatives are disclosed.

## The market unit

The competitive unit is the **Market Operation**, not a repository, skill, endpoint URL, full agent, or whole supplier.

A supplier might publish:

- `web.search`
- `document.extract`
- `memory.retrieve`
- `plan.critic`
- `claim.verify`
- `browser.complete-task`
- `invoice.reconcile`

Each Operation has its own:

- typed input and result;
- effect and data-use policy;
- price;
- readiness and lifecycle;
- validated usage;
- reliability and latency history;
- consumer base;
- revenue and settlement evidence.

The Supplier is the portfolio rollup. Supplier reputation may help discovery, but it must not erase operation-specific evidence.

## The two-sided product

### Supplier side

A developer or business can:

1. Connect an existing HTTP, OpenAPI, MCP or x402 service.
2. Import or declare its contract.
3. Prove ownership and provenance.
4. Pass admission and readiness checks.
5. Set an exact per-use price.
6. Publish a Market Operation.
7. See validated calls, consumers, failures, latency and revenue.
8. Revise, withdraw or replace the service.
9. Accrue earnings only from Qualified Use plus separately authoritative reconciled settlement, then receive payouts.

### Agent side

An agent can:

1. Search by intent and required outcome.
2. Filter by input compatibility, effects, authority, price and freshness.
3. Inspect a compact machine-readable contract.
4. Invoke through a stable AE market boundary.
5. Receive a typed result, evidence and receipt.
6. Pay only under the declared contract.
7. Prefer or replace services using transparent evidence.

## The minimal agent-facing interface

The market can expose many protocols, but they must project one semantic kernel:

```ts
market.search({ intent, constraints })
market.inspect({ operationRef })
market.invoke({ operationRef, input, authority })
market.receipt({ invocationRef })
```

REST, MCP, SDKs, the AE CLI, and AE’s first-party answer agent are adapters over this same lifecycle. They must not become separate registries, execution authorities or payment systems.

The public Service DTO is a portfolio/discovery projection. `operationRef` remains the invocation identity. A Service contains Operations; it is not itself the thing an agent executes.

## What AE owns

AE must own the shared facts that neither supplier nor buyer can establish alone:

- Supplier, Provider and publisher identity;
- contract admission and immutable revisions;
- Market Operation identity;
- discovery and comparison representation;
- invocation and attempt identity;
- caller authority, limits and idempotency;
- validated terminal outcome and evidence;
- Qualified Use policy;
- exact pricing and charge state;
- payment reconciliation;
- provider accrual, platform rake and payout state;
- transparent operation-level market metrics;
- fraud, self-traffic and retry exclusions.

AE must either sit in the invocation/payment path or receive authoritative outcome and settlement receipts. Provider-reported counters alone cannot support verified usage, rankings or fees.

## What AE does not own

Suppliers own:

- implementation code;
- runtime and scaling;
- internal databases and state;
- infrastructure secrets;
- model, browser, GPU and compute choices;
- internal operating costs;
- service-specific operational quality.

AE should not build a general-purpose cloud, sandbox, container orchestrator, package builder, secret vault, scheduler, agent framework or model gateway. Mature infrastructure already supplies those functions.

Skills, SDKs and repositories remain important acquisition, lineage and developer-distribution artifacts. They become market supply only when they resolve to an admitted, remotely callable Operation with an evidence path.

## The supply wedge — lower-friction, not free

The most credible initial suppliers are developers who already operate hosted services and use open-source repositories, Skills, SDKs or MCP servers for distribution. They have already paid much of the product and integration cost; AE can offer incremental paid demand without asking them to move runtimes.

The narrow supplier path is:

```text
running service → import contract → validate → price → publish
→ receive attributable paid use → improve or withdraw
```

This is not “free supply” or “money without an ask.” Suppliers still fund hosting, integration, support, compliance and payout friction. Raw repositories and static Skills are acquisition leads, not supply. The testable claim is only that admitting an already-running service costs less than recruiting and financing a greenfield provider, and that AE-attributed net revenue repays that marginal effort.

Non-owner contract-valid Qualified Use may become a better demand signal than stars or installs; a supplier-earnings or paid-use signal additionally requires separately authoritative reconciled settlement and contribution-positive economics. Gross calls and gross payment volume do not prove supplier value.

## Market mechanics

### Discovery

Discovery answers: *Which Operations could perform this work under these constraints?*

It is not execution authority. A model, popularity score or search rank may propose candidates, but contract compatibility, authority, effects and spend remain deterministic gates.

### Invocation, evidence and charge

AE binds one principal authorization, one logical invocation, one Operation revision, one or more retry attempts and one terminal outcome. Retries must not become extra uses. Consequential unknown outcomes must not be blindly retried.

The required V1 transaction state machine is:

```text
authorize → reserve → invoke → receive evidence → validate
                                      ├─ valid   → capture → settle
                                      ├─ invalid → release
                                      └─ unknown → hold → reconcile
```

No provider accrual is released before validation. A payment rail that irreversibly settles before delivery does not satisfy this invariant by itself; V1 needs a reversible authorization/reservation primitive or an AE-controlled prepaid balance. Refund-after-charge is recovery, not equivalent prevention.

“Verified execution” has two distinct evidence classes:

1. **Contract-valid delivery:** AE can verify identity, revision, input/output schema, artifact digest, freshness, idempotency and family-specific evidence without trusting a supplier counter.
2. **Semantic quality or buyer utility:** the result was substantively correct or useful. Schema conformance alone never proves this; it needs buyer outcome, benchmark or authoritative external evidence.

Settlement may follow contract-valid delivery, but it remains separate from Qualified Use. Reliability, quality and ranking claims must state which evidence class they use.

### Qualified Use

One Qualified Use means:

- one logical production invocation;
- by a non-owner consumer;
- against an admitted current Operation;
- with contract-valid terminal success;
- with required result/effect evidence;
- excluding tests, probes, retries, refunds, refusal, failure and unknown outcomes.

Qualified Use is independent of semantic correctness and payment settlement. It counts from the qualifying invocation and does not require settlement; supplier accrual and creator earnings require Qualified Use plus separately authoritative reconciled economic settlement. A conforming result does not prove usefulness, and a charge attempt does not prove a valid result.

When a Qualified Use also has an authoritative settled charge, it is a stronger demand signal than a passive distribution observation such as a view, impression or exposure: a non-owner principal authorized spend, an actual invocation occurred, delivery passed the declared contract checks, and the payment survived reconciliation. Likes and other engagement signals can measure attention or discovery, but can also be owner traffic, bots, accidental impressions or engagement bait without delivery or economic commitment. A settled non-owner Qualified Use still does not prove semantic truth or customer utility. A result can satisfy the schema and provenance contract while being wrong, incomplete or not worth its price; semantic quality needs separate buyer-outcome, benchmark or authoritative external evidence.

### Economics

The buyer pays the declared Operation price through the authorized economic path. AE reconciles the authoritative payment state separately from Qualified Use, applies the declared platform fee, and accrues the remainder to the Supplier only when both facts hold.

The exact payment rail may be x402, prepaid balance, Stripe or another managed rail. The economic invariant stays constant:

```text
Qualified Use + authoritative reconciled settlement
→ provider net + platform rake + buyer receipt
```

### Competition

Operations should compete on separate transparent facts, selected in the context of the requested intent and constraints and labelled by evidence class:

- contract fit;
- declared price;
- freshness;
- admission/readiness state;
- non-owner Qualified Use, with its exclusions visible;
- reliability and latency;
- successful uses, distinct consumers, settled volume, recent growth and voluntary saves or favourites;
- bounded, explicitly labelled exploration for eligible new supply.

Gross calls, owner traffic, popularity or follower-like attention must not rank an Operation by themselves. There should be no universal opaque quality score. Every metric must disclose its numerator, denominator, time window, evidence tier, freshness and exclusions; schema-valid delivery and settlement remain distinct from semantic-quality or buyer-utility evidence.

## Agent-native UGC operating model — analogy only, not a category rename

Mature UGC and creator platforms provide an operating-model analogy: supply is created, admitted, distributed, consumed, measured and revised. This means Instagram/YouTube-style user-generated publishing, feed/catalog distribution, recommendation and exploration—not influencer or brand-campaign procurement, a creator-hiring marketplace or negotiated collaboration. The analogy does not rename AE's category, add a social-feed domain object or establish a runtime capability. AE remains an **Operation** market, with the **Market Operation** as its bounded unit and the existing Principal, Consuming Agent, Supplier/Provider, Qualified Use, admission, readiness and authority distinctions intact. The mechanics below are design hypotheses and source observations, not AE proof.

#### Canonical mapping

| Creator/UGC concept | AE canonical mapping | Boundary |
|---|---|---|
| Creator | Supplier / Provider | The Supplier/Provider owns the implementation and its rights; AE admits the callable supply. |
| Post or asset | Immutable versioned Market Operation | A versioned Operation, not a social post, is what an agent can inspect and invoke. |
| Feed, search or recommendation | Agent discovery and distribution | Distribution proposes an admitted Operation in context; it does not grant authority or prove quality. |
| View, impression or exposure | Distribution observation | Passive distribution observation; it is not an invocation or Qualified Use. |
| Active use | Invocation | Active use is an invocation; only a qualifying non-owner, contract-valid production invocation with required evidence and exclusions is Qualified Use. |
| Qualified engagement or conversion | Non-owner contract-valid Qualified Use | Only a qualifying invocation counts; Qualified Use is independent of settlement, semantic truth and customer utility. |
| Creator earnings | Supplier accrual after Qualified Use + settlement | Earnings require both Qualified Use and separately authoritative reconciled economic settlement; attention or passive exposure is not enough. |
| Insights or trends | Privacy-safe aggregated demand gaps and operation-level evidence | Aggregates may guide supply; Principal prompts, data and raw supplier data are not discovery material. |

#### Supplier creation and market loop

The supplier creates or hosts an implementation outside AE, establishes source authorization or ownership, provenance, license or material-derivation rights and immutable lineage, then publishes an immutable Operation revision. The agent-native loop is:

```text
publish → admit → distribute → invoke → validate → Qualified Use
→ [separate settlement reconciliation] → accrue earnings
→ learn → revise/withdraw
```

`Admit` means the revision passes the applicable contract, provenance, source authorization/ownership, license or material-derivation rights, immutable lineage and publication-eligibility checks. Readiness and Principal/execution authority are later, independent routeability and invocation gates. `Distribute` means an agent or consuming runtime can find and receive a contextual recommendation. `Validate` means contract-valid terminal delivery and its required evidence; for a non-owner production invocation it establishes Qualified Use, never semantic truth. `Settle` means separately authoritative payment reconciliation; only together with Qualified Use can it support supplier accrual. A supplier may learn from operation-level evidence and privacy-safe aggregates, then publish a new immutable revision or withdraw; AE does not take custody of the supplier's implementation or payload merely to improve discovery.

This is a low-commitment per-use exchange, not an ongoing bilateral buyer-supplier relationship. A Principal can use one admitted Operation, use another supplier on the next invocation or leave the market; the system does not require a standing brief, campaign, application, negotiated collaboration or direct supplier relationship.

#### Agent distribution and consumption loop

An agent runtime can consume and distribute admitted supply while pursuing a Principal's objective:

```text
need → discover → inspect contract and evidence
→ obtain Principal authority → invoke → validate
→ retain receipt and settle → pin, replace or request again
```

The Consuming Agent or its runtime is a delegated actor. It may search, recommend, invoke and distribute an Operation through its task flow, but it does not own the budget, grant itself authority or become the Principal. A recommendation or passive distribution observation is not an invocation. Active use is an invocation; only a qualifying non-owner, contract-valid production invocation with required evidence and exclusions becomes Qualified Use. Settlement remains separate.

#### Privacy-safe demand gaps to bespoke supply

The demand loop is intentionally aggregate:

```text
privacy-safe aggregate demand gap
→ supplier proposes bespoke dataset or Operation
→ prove provenance, source authorization/ownership, license/derivation rights, immutable lineage and contract
→ admit → distribute → invoke → validate → Qualified Use
→ [separate settlement reconciliation] → accrue earnings
→ learn and revise
```

Repeated unmet intents, coverage gaps or operation-level evidence may indicate a gap worth serving. They may guide a supplier toward a bespoke dataset or Operation only as privacy-safe aggregates. AE must never leak Principal prompts, private data or task content, and must never expose supplier data raw merely to improve discovery. A demand gap is a lead for supply creation, not proof that the resulting dataset or Operation is useful; the same admission/publication, routeability/readiness, Principal/execution-authority, validation and proof ceilings apply. This is specialized production for an observed aggregate gap, not a campaign brief, negotiated commission or creator application flow.

#### Separate gates and bounded new-supply exploration

Admission/publication eligibility, routeability/readiness, recommendation/distribution, invocation authority, Qualified Use and supplier earnings/settlement are separate gates:

| Gate | Decides | Does not imply |
|---|---|---|
| Admission / publication eligibility | Whether contract, provenance, source authorization/ownership, license or material-derivation rights and immutable lineage checks are satisfied for the revision. | It does not imply readiness, routeability, recommendation/distribution, Principal/execution authority, invocation, Qualified Use, settlement or earnings. |
| Routeability / readiness | Whether an admitted revision is operationally ready and eligible to be routed under current policy. | It does not imply Principal/execution authority, invocation, Qualified Use, settlement, semantic truth or customer utility. |
| Recommendation / distribution | Which admitted, routeable revisions fit the current intent and constraints, using labelled evidence for contract fit, price, freshness, Qualified Use, reliability and latency, plus bounded exploration for new supply. | Distribution does not grant Principal/execution authority, create an invocation or payment obligation, assert semantic quality or create Qualified Use. |
| Principal / execution authority | Whether this Principal and delegated Consuming Agent may invoke the selected Operation under spend, effect, data-use and idempotency limits. | Authority does not imply contract-valid delivery, Qualified Use, settlement, semantic truth or customer utility. |
| Qualified Use eligibility | Whether one non-owner production invocation against an admitted current Operation reached contract-valid terminal success with required result/effect evidence and exclusions. | Qualified Use is independent of settlement; it does not imply payment settlement, supplier accrual/earnings, semantic truth or customer utility. |
| Supplier earnings / settlement eligibility | Whether a Qualified Use also has separately authoritative reconciled economic settlement sufficient for supplier accrual/earnings. | Settlement or earnings do not prove semantic truth or customer utility; settlement without Qualified Use does not create supplier earnings. |

New-supply exploration is an explicitly bounded opportunity among admitted, ready-enough candidates; readiness is a routeability gate, not admission proof or a popularity contest. Any exploration exposure must remain contextual and evidence-class-labelled. Gross calls, owner traffic, popularity, follower-like attention or one opaque score cannot substitute for contract fit, Qualified Use or settlement evidence.

#### Originality, provenance and rights

The UGC idea of originality maps to source ownership/authorization, provenance, license or material-derivation rights, immutable lineage and an anti-copy/unauthorized-republication policy. Authorized licensed or materially derived supply is allowed when its rights and lineage are established; these controls distinguish it from unauthorized copy/republication and preserve the evidence chain across revisions. They establish lineage and permission boundaries only: schema-valid output must never be called truthful, and provenance does not by itself establish semantic correctness or customer utility.

#### Explicit non-transfer list

The analogy does **not** import:

- a follower graph requirement;
- engagement bait as a growth or ranking mechanism;
- opaque popularity ranking;
- ad-impression economics;
- repost aggregation as independent supply or demand;
- supplier-hosted payload custody by AE;
- agent-as-Principal;
- campaign briefs, apply/accept workflows or negotiated creator collaborations; or
- an assumed ongoing bilateral buyer-supplier relationship.

AE therefore does not need social followers, likes or views to establish a market; views, impressions and exposure are distribution observations, not invocations or Qualified Use. It does not reward attention instead of Qualified Use, aggregate reposts into market supply, take supplier payload custody for discovery, or treat an agent runtime as the budget-owning Principal. Provider-direct x402 remains a disjoint lane, and the existing V1 closed-family, authority, validation, settlement and proof gates remain unchanged.

## The possible flywheel — unproven

The loop below is still a hypothesis, not demonstrated network effect or AE proof:

```text
More useful services
→ more agent demand can be fulfilled
→ more validated calls and revenue
→ better evidence and supplier feedback
→ developers improve and publish more services
→ agents find stronger substitutes
→ more useful services
```

This is a hypothesis, not a demonstrated network effect. Listings, wrappers, admission, metering and payment are copyable. The leaderboard is not a moat.

The only plausible earned moat is permissioned cross-supplier history of compatible contracts, verified outcomes and reconciled settlement that materially improves later selection. It exists only after real traffic proves:

- buyers keep AE in the path after successful routes are pinned;
- suppliers receive incremental, contribution-positive demand;
- outcome evidence predicts future success better than a native runtime catalog or buyer-owned gateway;
- the history cannot be cheaply recreated by the runtime or payment incumbent that already owns distribution.

Until then AE has telemetry, not a defensible network effect.

## Product boundaries

AE's proposed narrow product is:

- a controlled exchange for admitted Market Operations;
- one auditable invocation, evidence and economic boundary;
- a self-serve supplier publication and operations surface;
- a machine-consumable discovery layer;
- a transparent operation-level evidence system.

AE is not:

- a generic agent builder;
- an app builder;
- a repository host;
- a general-purpose serverless platform;
- a human task marketplace;
- an opaque autonomous allocator;
- merely an agentic.market clone.

The agentic.market Service/Endpoint representation is a useful protocol baseline. AE’s product differentiation is the complete publisher-to-paid-use loop: self-serve supply, admission, invocation, validated outcomes, qualified-use measurement, provider economics and competitive distribution.

## Minimum category experiment

This is an eight-week transaction-spine smoke test with strangers, not a statistically powered market study.

### Named V1 family

V1 admits one family: **public-document structured extraction with field-level provenance**.

The normalized contract accepts an immutable public document artifact or AE-captured snapshot, a bounded JSON Schema and extraction instructions. It returns structured JSON plus, for every material scalar field, a source span and artifact digest. AE verifies:

- the output conforms to the declared schema;
- the digest identifies the exact input artifact;
- every cited span exists in that artifact;
- each scalar value is supported by its cited span under the family's declared normalization rules;
- freshness, size, timeout and idempotency limits hold.

This family is the best current candidate because it is read-only, frequent, supplied by multiple OSS-adjacent hosted products and mechanically comparable. The evidence proves provenance-backed, contract-valid delivery—not semantic correctness or completeness. A held-out human-labelled corpus measures those separately.

Before the paid pilot, a short bake-off must show three genuinely substitutable suppliers can satisfy this one normalized contract without a supplier-specific semantic adapter. If they cannot, do not substitute a vaguer family; the category hypothesis remains unproven.

### Cohort and calls

- three to five independent suppliers;
- one anchor agent/runtime distributor;
- three unrelated paying principals;
- provider identity and direct alternatives disclosed;
- no per-call human supplier selection;
- at least 100 settled real-money calls in each of two consecutive months.

### Hard transaction gates

Every call must satisfy:

- principal authorization and spend limit precede invocation;
- zero unauthorized effects;
- no capture or supplier accrual without contract-valid terminal delivery;
- exact one-invocation-to-charge-to-accrual reconciliation;
- invalid outcomes release the reservation;
- unknown outcomes remain held until reconciled;
- retries never create duplicate Qualified Uses or charges;
- no unexplained ledger or payout mismatch.

Any failure of these invariants is a **transaction-spine failure** and stops the pilot.

### Directional market gates

- at least two principals make a repeat purchase;
- at least two suppliers receive repeat demand;
- AE retains at least 50% of each repeat buyer's eligible next paid purchases after direct alternatives are disclosed;
- at least three of five suppliers receive contribution-positive AE-attributed demand that repays marginal onboarding effort within 90 days;
- AE is contribution-positive after payment, payout, fraud, disputes, refunds and support.

The 50% figure is a per-buyer purchase-share gate, not a population retention estimate. With three buyers it establishes only whether the mechanism survives direct alternatives in this cohort.

Routing accuracy, task-completion lift, latency and token overhead are diagnostics in this pilot, not category pass criteria. The held-out corpus should still compare suppliers on semantic accuracy, completeness, latency and price, but there is no universal “correct supplier” label and no composite quality score.

### Pre-registered verdicts

- **Transaction-spine failure:** stop. The core control-and-settlement claim failed.
- **Demand failure:** stop calling it a marketplace. Retain a registry, gateway or lead-generation product only if customers pay for that narrower value.
- **Supplier-cohort failure with a sound spine:** replace the cohort once only when evidence identifies supplier quality or onboarding fit as the cause. A second failure rejects the supply wedge; do not keep rotating suppliers until the thesis appears true.
- **Family failure:** if three suppliers cannot satisfy the normalized extraction contract, or if provenance checks do not predict buyer-accepted delivery, the family is unsuitable. Re-open family selection rather than weakening verification.

The public category claim is earned only after a later, larger cohort reproduces the result.

## Primary references

- [OpenRouter quickstart — unified model API](https://openrouter.ai/docs/quickstart)
- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- [agentic.market machine-readable documentation](https://agentic.market/llms.txt)
- [agentic.market Service API](https://api.agentic.market/v1/services?limit=3)
- [Vercel deployment model](https://vercel.com/docs/deployments)
- [Apify pay-per-event monetization](https://docs.apify.com/actors/publishing/monetize/pay-per-event)
- [OpenAI Plugins — package Skills and MCP servers](https://developers.openai.com/plugins/build/plugins)
- [Stripe Machine Payments](https://docs.stripe.com/payments/machine)
- [Cloudflare WebMCP developer preview](https://blog.cloudflare.com/webmcp/)
- [Roblox — Recommendations and Ranking](https://en.help.roblox.com/hc/en-us/articles/21416941036564-Recommendations-and-Ranking-on-Roblox) — primary reference for contextual recommendation, ranking and exploration mechanics; observed mechanics are an analogy, not AE proof.
- [Instagram Creators — Recommendations and Originality](https://creators.instagram.com/recommendations-and-originality) — primary reference for recommendation and originality/source-lineage considerations; not evidence of AE capability or outcomes.
- [mod.io — How does mod.io Marketplace work?](https://support.mod.io/hc/en-us/articles/9860328171151-How-does-mod-io-Marketplace-work) — primary reference for creator publishing, marketplace distribution and monetization mechanics; not evidence of AE demand or settlement.
- [YouTube — Partner Program eligibility](https://support.google.com/youtube/answer/1311392) — primary reference for creator monetization eligibility; it does not transfer ad-impression economics or prove AE utility.

## Related AE evidence

- `2026-08-08-agent-runtime-microservice-market-literature-review.md`
- `2026-08-08-agent-runtime-microservice-market-architecture.md`
- `2026-08-07-agentic-market-representation-and-ae-mirror.md`
- `2026-08-07-agentic-market-vs-ae-schema-comparison-and-blast-radius.md`
- `2026-08-08-hosted-capability-platform-feasibility.md` — rejected AE-hosting branch

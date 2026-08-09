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

> **Agentic Economy is a controlled transaction layer where authorized agents invoke admitted third-party Operations and suppliers are paid after contract-valid delivery.**

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
| Usage accounting | Qualified Use and Settled Use |

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
9. Accrue earnings and receive payouts.

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

Paid use may become a better demand signal than stars or installs, but only when it is non-owner, outcome-valid, reconciled and contribution-positive. Gross calls and gross payment volume do not prove supplier value.

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

Settlement may follow contract-valid delivery. Reliability, quality and ranking claims must state which evidence class they use.

### Qualified Use

One Qualified Use means:

- one logical production invocation;
- by a non-owner consumer;
- against an admitted current Operation;
- with contract-valid terminal success;
- with required result/effect evidence;
- excluding tests, probes, retries, refunds, refusal, failure and unknown outcomes.

Qualified Use is separate from semantic correctness and payment settlement. A conforming result does not prove usefulness, and a charge attempt does not prove a valid result.

### Economics

The buyer pays the declared Operation price. AE reconciles the authoritative payment state, applies the declared platform fee, and accrues the remainder to the Supplier.

The exact payment rail may be x402, prepaid balance, Stripe or another managed rail. The economic invariant stays constant:

```text
validated use + authoritative settlement
→ provider net + platform rake + buyer receipt
```

### Competition

Operations should compete on separate transparent facts:

- successful uses;
- distinct consumers;
- reliability;
- latency;
- settled volume;
- recent growth;
- voluntary saves or favourites.

There should be no universal opaque quality score. Every metric must disclose its numerator, denominator, time window, evidence tier, freshness and exclusions.

## The possible flywheel — unproven

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

## Related AE evidence

- `2026-08-08-agent-runtime-microservice-market-literature-review.md`
- `2026-08-08-agent-runtime-microservice-market-architecture.md`
- `2026-08-07-agentic-market-representation-and-ae-mirror.md`
- `2026-08-07-agentic-market-vs-ae-schema-comparison-and-blast-radius.md`
- `2026-08-08-hosted-capability-platform-feasibility.md` — rejected AE-hosting branch

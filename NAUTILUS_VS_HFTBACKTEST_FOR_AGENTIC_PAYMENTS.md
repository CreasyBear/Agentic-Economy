# NautilusTrader vs hftbacktest: architecture for machine-scale agentic payments

**Evidence cut:** 2026-08-25

**Repository pins:** NautilusTrader [`13559f053a376bbbd4bdd765cdefe2a635f893e7`](https://github.com/nautechsystems/nautilus_trader/tree/13559f053a376bbbd4bdd765cdefe2a635f893e7); hftbacktest [`5f3ec40b2afb764e0fea112f941ed85523ef4e88`](https://github.com/nkaz001/hftbacktest/tree/5f3ec40b2afb764e0fea112f941ed85523ef4e88).

**Scope:** comparative architecture, adversarial review, and an implementation path for the current Agentic Economy (AE) codebase. This is not a claim that payments are an exchange or that either repository is a production agent-payment stack.

## Executive thesis

NautilusTrader and hftbacktest are valuable because they solve different epistemic problems:

- **NautilusTrader asks how a live engine should control state and exposure while an external venue may disagree.** It contributes typed lifecycles, controlled mutation, pre-release risk gates, write-once execution origin, reconciliation, and state replay that cannot resend orders.
- **hftbacktest asks how a policy should be evaluated when the remote world changes before the local actor can know it.** It contributes explicit remote-occurrence versus local-knowledge clocks, deterministic event scheduling, replaceable latency and queue models, and counterfactual replay without future-data leakage.

The correct synthesis for agentic payments is not an HFT engine. It is a **distributed knowledge-and-control kernel paired with a closed-loop causal digital twin**:

```text
                     shared, versioned contracts
       transition schema | evidence semantics | policy interface
                              |
              +---------------+----------------+
              |                                |
              v                                v
  PRODUCTION KNOWLEDGE-AND-CONTROL KERNEL   CAUSAL DIGITAL TWIN
  owns authority, exact Operation state,    owns no real authority
  release fences, accepted evidence,        simulates hidden remote state,
  accounting, exposure and resolution       delayed knowledge and adaptation

  conservative about irreversible effects  aggressive about falsifying policy
```

The production kernel must answer four questions durably:

1. What exact Operation contract and delegated authority were accepted?
2. What exact Operation, authority, Attempt/effect generation, and external-spend identity were bound, and might an irreversible boundary have been crossed?
3. What has AE actually learned, from which source, and what decision-scoped evidence basis was available at the time?
4. What financial value, capital time, and reconciliation capacity remain exposed?

The twin answers a different question: given only the knowledge available at each decision, would admission, optional Operation selection, and clearing policies remain safe, contract-conformant, economical, private, and resilient across delay, fraud, herding, provider adaptation, and correlated infrastructure failure? Agent-perceived utility may be modelled as a source-attributed or hidden scenario variable, but it is not an AE verdict.

The north-star metric is therefore not TPS or median payment latency. It is:

> **Contract-valid, authorized, attributable, economically resolved Operation deliveries per unit of money, capital time, compute, privacy exposure, and reconciliation work—under bounded concentration and uncertainty.**

## Analogy boundary: HFT informs AE; it does not name AE

HFT is productive here where it exposes split remote/local truth under latency, conservative control before irreversible effects, explicit exposure while outcomes are uncertain, immutable origin plus reconciliation, and causal backtesting without hindsight. Those are the distinctive lessons this comparison transfers.

Standard distributed-payments doctrine still supplies the ordinary implementation mechanics: material idempotency, inbox/outbox, leases and fencing, durable ledgers, sagas/compensation, and effect-free rebuild. Their presence does not turn AE into an exchange.

The analogy becomes harmful when it imports speed theater, fungible-venue or best-execution assumptions, order/fill ontology, transparent failover, global owner loops, or market-microstructure routing into semantic Operations. AE's governing frame remains the Atomic Operation Market: agents own planning, orchestration, semantic evaluation, and reliance; an exact `operationRef` names execution; Invocation, Attempt/effect generation, authority, declared conformance, evidence, and Money own the transaction lifecycle.

The narrow trading analogy is still exact and useful: an Operation is the declared instrument, an Invocation is an order to take its terms, and a Contract-Valid Delivery is the closest equivalent to a fill. The content received is the economic exposure; only the Consuming Agent can evaluate it after delivery. “Fill or kill” is therefore safe only as an **atomic delivery** posture for read-only or safely replayable Operations whose non-delivery can be proved. A consequential Operation needs a **fenced effect** posture: after possible release, silence creates an open exposure for reconciliation, not a fictional kill.

## Precise verdict on the traffic premise

The strategic direction is credible; the present-tense premise needs tightening.

- **Supported on observed surfaces:** automated/bot requests exceed human requests in two large vendor datasets. Thales/Imperva reports 53% automated traffic in its 2025 observed web traffic; Cloudflare wrote in July 2026 that more than half of traffic on its measured surface was non-human ([Thales 2026 Bad Bot Report](https://www.imperva.com/resources/reports/2026-Thales-Bad-Bot-Report.pdf), [Cloudflare 2026 report](https://blog.cloudflare.com/agentic-internet-bot-report/)).
- **Not supported:** AI-agent traffic, autonomous-agent traffic, or autonomous economic transactions already exceed their human equivalents. Thales separately estimated legitimate AI bots at roughly 2% of session traffic in its research data, mostly crawlers rather than action-taking buyers ([Thales AI traffic analysis](https://www.imperva.com/blog/ai-bot-traffic-which-bots-to-trust/)). Cloudflare's “non-human” category also includes long-established crawlers and automation.
- **Supported as an early workload signal, not a global census:** x402's first-party dashboard showed 75.41 million transactions and $24.24 million volume over the prior 30 days at this evidence cut—about $0.32 per transaction by simple division. Coinbase separately reported more than 100 million facilitated x402 payments. These are mutable, first-party counters, not audited global agent-payment totals ([x402 Foundation](https://www.x402.org/), [Coinbase x402 documentation](https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works)).

The defensible premise is:

> Automation already dominates some major web measurements. Autonomous economic agents are not yet proven to dominate payments, but their near-zero marginal attempt cost, recursive delegation, synchronized policies, and higher request-to-payment conversion make machine-majority payment traffic a prudent capacity and threat scenario—and a likely direction—before it becomes a measured fact.

This distinction matters. A crawler does not carry spending authority; a credential-stuffing bot is not an economic agent; a human-triggered backend request is not necessarily autonomous. AE should preserve causal origin and authority instead of relabeling all automation as agent commerce.

## Sources, method, and evidence discipline

This synthesis used:

1. the two pinned repository clones, inspected as source code rather than by README claims;
2. the standalone studies [NautilusTrader HFT lessons](NAUTILUS_TRADER_HFT_LESSONS.md) and [hftbacktest lessons](HFTBACKTEST_LESSONS_FOR_AGENT_MICROTRANSACTIONS.md);
3. three sequential comparative passes covering kernels, current protocols/traffic, and target architecture;
4. the current AE schemas, release worker, money state, reconciliation worker, workpool, tests, and founder start-line decision;
5. first-party protocol, network, standards, and traffic sources for current ecosystem claims.

Claims use four evidence labels:

| Label | Meaning |
|---|---|
| **Verified** | Directly present in the pinned repository or current AE code, or stated by a primary specification. |
| **Vendor-reported** | A first-party traffic, volume, latency, rollout, or product claim; useful but not independently proven. |
| **Inference** | Architectural consequence derived from verified behavior. It is not claimed as a feature of the source system. |
| **Proposal/scenario** | A design or capacity assumption for AE that requires implementation and measurement. |

Status is equally strict:

| Category | Examples at this evidence cut | Treatment |
|---|---|---|
| **Shipped/operational** | x402 protocol/facilitator usage; ACP production integrations for approved partners; Cloudflare Pay Per Crawl product surface; live card-network agentic pilots/transactions | Evidence that a mechanism can operate, not proof of universal scale, reliability, or economics. |
| **Published specification/draft** | A2A 1.0; UCP; AP2 0.2; ACP beta spec; Verifiable Intent 0.1; MPP and its IETF Internet-Draft | Evidence of semantics, not adoption or production SLOs. |
| **Pilot/limited rollout** | Visa Intelligent Commerce and Mastercard Agent Pay deployments | Evidence of real network integration, not broad availability or public throughput. |
| **Announcement/proposition** | Mastercard Agent Pay for Machines; Cloudflare Monetization Gateway at announcement time | Architecture signal only. “Will,” “planned,” or waitlist features are not treated as shipped. |

Important source limitations:

- The repositories demonstrate code structure, not production performance. Neither pinned tree provides audited wire-to-venue tail latency, loss, or availability evidence.
- hftbacktest's backtest outcomes are conditional on its tape and models. Determinism does not establish realism.
- Vendor traffic shares describe vendor-observed surfaces, not the entire Internet.
- Mutable dashboard counts are recorded only as an evidence-cut observation.
- A protocol receipt proves only what that protocol defines. It does not automatically prove legal authority, semantic usefulness, economic finality, or absence of dispute.

## Comparative verdict at a glance

| Dimension | NautilusTrader — verified | hftbacktest — verified | Correct AE transfer | What remains inference/proposal |
|---|---|---|---|---|
| Ontology | Rich order/event/account/position model with guarded transitions and duplicate-fill checks ([order construction](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/model/src/orders/any.rs#L28-L101), [transition table](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/model/src/orders/mod.rs#L204-L298)) | Compact order/feed/queue/P&L simulation types ([event and order types](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/types.rs#L311-L620)) | Multiple coupled transaction state machines | Semantic acceptance, delegation, privacy, dispute and multi-rail finality are AE additions. |
| Clocks | `ts_event`, `ts_init`, and report/lifecycle timestamps ([fill](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/model/src/events/order/filled.rs#L48-L121)) | Explicit `exch_ts` and `local_ts`; entry/response latency seams ([event](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/types.rs#L311-L333), [latency models](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/latency.rs#L13-L104)) | Evidence lattice and as-of decisions | Providers do not supply one authoritative exchange clock; evidence strength must outrank timestamp. |
| Routing / origin | Explicit client/account/venue/default resolver, then write-once origin ([resolver](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/execution/src/engine/mod.rs#L2033-L2063), [origin claim](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/common/src/cache/mod.rs#L4672-L4736)) | Static `asset_no`; live instrument binds one connector/symbol ([backtest submission](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L921-L1008), [live binding](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/live/mod.rs#L15-L56)) | Preserve exact Operation binding after caller choice or optional future selection | Neither implements AE's Atomic Operation Market, delegated authority, semantic selection, trust, compliance, or multi-rail economics. |
| Risk | Pre-trade validity, state, balance/notional, and rate gates ([risk config](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/risk/src/engine/config.rs#L47-L104), [submit gate](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/risk/src/engine/mod.rs#L580-L653)) | No comparable production risk engine | Hard pre-release authority/exposure gates plus post-release uncertainty control | Epistemic risk, privacy, fraud, mandates, clearing credit, and correlated-dependency limits are AE-specific. |
| Queueing | Seven unbounded live channels; biased selection and dispatch quota ([channels](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/runner.rs#L149-L257), [loop](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/node/mod.rs#L1679-L1807)) | In-memory deques and unbounded live publisher fan-in ([order bus](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/order.rs#L9-L69), [connector fan-in](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/main.rs#L23-L31)) | Bounded lanes, explicit admission, reserved safety capacity | Priority without a capacity bound is not a tail-latency or safety guarantee. |
| Concurrency | One current-thread owner of mutable runtime state; async producers/I/O | Single-threaded deterministic simulation; experimental async live connector | Serialize per economic/effect identity; parallelize across fenced partitions | A global owner loop is a cross-tenant failure domain at economy scale. |
| Durability | Event store with queue/batching/high-watermark; enqueue is not durable commit ([writer](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/event_store/src/writer/mod.rs#L48-L78), [submit](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/event_store/src/writer/mod.rs#L264-L300)) | Backtest tapes; volatile live order correlation | Commit exact Operation/Invocation identity, authority, reservations, Attempt/effect generation, and possible-release fence before I/O | Neither provides a cross-provider exactly-once transaction. AE cannot either; it can bound and own uncertainty. |
| Reconciliation | Startup mass status and optional continuous order/position checks ([startup](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/node/mod.rs#L389-L467), [continuous checks](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/node/mod.rs#L1624-L1647)) | Joins REST/WebSocket evidence in memory; one-sided terminal records age out ([join](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/binancefutures/ordermanager.rs#L29-L48), [GC](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/binancefutures/ordermanager.rs#L278-L307)) | Permanent evidence-seeking safety plane | Unknown outcomes must consume exposure and work capacity; timeouts/GC cannot imply safety. |
| Replay | State-only event-store replay explicitly avoids live publishing/adapters ([replay contract](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/event_store/src/replay.rs#L16-L21)) | Causal strategy replay over exchange/local event slots ([event loop](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L755-L863)) | Separate production rebuild and counterfactual twin | The two replay modes need opposite permissions and must never share live credentials. |
| Fidelity | Live-engine architecture is its strength, not market simulation | Pluggable latency/queue models, but historical market is exogenous/no-impact ([assumption](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/docs/order_fill.rst#L8-L18)) | Endogenous provider/rail/agent world model | Agent Operation selection, invocation, and retry behavior change queues, prices, fraud, and future load; no-impact replay is a restricted scenario only. |
| Performance | Performance-oriented runtime and microbenchmarks, not audited external SLO proof | Efficient replay implementation, not live-payment performance evidence | Optimize durable acceptance, deadline success, resolution time, and cost | “HFT” in a project name is not evidence of production bounded latency. |
| Failure boundary | One live node/owner loop couples many responsibilities | Simulator process and live connector have broad/volatile failure domains | Bulkheads by principal/provider/rail/custody/source and separate safety plane | Cross-region, legal, treasury, privacy, and counterparty failure are unsolved by both. |

## Deep comparative analysis

### 1. Ontology: an order is not a transaction

NautilusTrader's typed order aggregate is the more useful production reference. An initialization event reconstructs order material; transitions reject invalid state movement; fills carry account, venue, order, strategy and trade identities; duplicate or conflicting applications are guarded. hftbacktest intentionally uses a much smaller simulation object: order request/status, quantities, timestamps and queue/fill behavior.

The transferable lesson is not to rename an order `Payment`. A machine transaction is a composition of independently resolving state:

```text
semantic intent and declared acceptance predicate
delegated mandate and authority use
exact immutable Operation snapshot and Invocation identity
Attempt/effect generation and provider effect
delivery and declared contract conformance
source-attributed Agent Evaluation and Continuation Evidence
payment authorization and submission
rail acceptance, settlement, reversal and recourse
accounting recognition and clearing
evidence, reconciliation and dispute
```

A Provider can make a Contract-Valid Delivery while payment remains unknown. Payment can settle while output is contract-invalid. A Consuming Agent can value an output that violated data-use authority, or reject a conformant output as useless. An irreversible side effect can occur even if the response is lost. A settled card payment can charge back; a chain transfer can be irreversible while the Operation remains disputable. AE owns the declared conformance and economic facts; the agent owns semantic evaluation and reliance. A single `completed` flag destroys these distinctions.

### 2. Clocks: from dual time to an evidence lattice

hftbacktest's best idea is explicit epistemic separation: `exch_ts` represents when the simulated exchange event occurred; `local_ts` represents when the strategy may observe it. An admission or Operation-selection policy cannot use a future local observation to justify an earlier decision.

Payments need more than two timestamps because there is no universally authoritative exchange clock:

```text
sourceOccurredAtAssertion / occurrenceInterval  remote assertion, optional
sourceSequence + sourceGeneration               stronger source ordering when supplied
ingressAt                                       AE first received bytes/event
durablyAcceptedAt                               insert-once evidence commit
appliedAt                                       projection transition
decisionAt                                      admission/authority/selection decision
clientObservedAt                                receipt/status visibility
expiresAt                                       quote, authority, reservation, capacity
finalityLevel                                   source-specific, not a timestamp
```

Source identity, signatures, monotonic sequence, causal links, and finality class outrank timestamp. Remote time can be skewed or fabricated. A chain can reorg. A webhook can overtake a synchronous response. “Latest timestamp wins” is not a safe evidence rule.

Every consequential production decision should persist or be attributable to a decision-scoped `DecisionEvidenceBasis`: the exact Operation snapshot and its readiness/qualification/evidence digests, accepted authority and target digest, plus any bounded evidence references and policy-input digest actually consumed. It is not a universal global sequence. The causal twin may retain explicit knowledge/evidence cuts as simulation concepts because it needs to reconstruct what a candidate policy could know at each simulated instant.

### 3. Operation binding and optional selection: transfer origin pinning, not a routing aggregate

NautilusTrader resolves a configured execution client and then makes origin write-once. The transferable rule is immutability after possible release, not the resolver itself. In AE, status, refund, settlement, dispute, and reconciliation remain attached to the exact Operation snapshot, Invocation, Attempt/effect generation, accepted authority, provider connection lease, and external-spend identity.

hftbacktest is even more static: the strategy submits to an asset index; live instruments name a connector. Its purpose is policy evaluation inside a chosen simulated market, not Operation discovery or selection.

AE's active product is the **Atomic Operation Market**. Consuming agents own planning and orchestration. The execution input is an exact opaque `operationRef`; admission resolves it to a persisted immutable `PublishedOperation` snapshot. Therefore direct caller-selected invocation has no separate routing or selection aggregate.

The normalized lifecycle is:

```text
Operation discovery
 -> optional OperationSelection
 -> exact immutable Operation snapshot
 -> Invocation
 -> authority decision
 -> Attempt/effect generation
 -> release fence
 -> provider effect
 -> evidence/reconciliation
 -> settlement/receipt
```

`OperationSelection` exists only if AE later chooses among candidate Operations. It is a read-only, abstention-capable decision built on capability-supply search/compare and remains deferred until after the current start line. Once an exact Operation enters admission, the existing execution binding is the source of truth; a parallel claim aggregate would duplicate it.

Before possible release, selecting a different Operation is a new selection and authority/admission decision. After possible release, it is **Operation substitution** and a potential duplicate economic effect—not failover. It is forbidden unless evidence proves non-release or authority explicitly permits a bounded duplicate-safe hedge.

### 4. Risk: an epistemic balance sheet, not a faster rate limiter

NautilusTrader demonstrates the right control shape: pre-release checks are part of the engine, not advice from a model. hftbacktest has no equivalent production risk plane.

Agentic-payment risk is continuous:

- mandate scope, generation, expiry, purpose, beneficiary, recipient, amount, recurrence, and subdelegation;
- semantic effect class, reversibility, duplicate harm, and acceptance ambiguity;
- reserved, possibly released, unsettled, refundable, chargeback, channel, and clearing exposure;
- provider/agent fraud, Sybil/collusion, fabricated evidence, and threshold splitting;
- sanctions, AML/KYT, licensing, tax, consumer rights, privacy, localization, and retention;
- provider/custody/rail/facilitator/issuer/chain/cloud concentration;
- negative contribution after signing, storage, reconciliation, support, fraud, and capital time.

Unknown is not a missing database value. It must consume:

```text
financial exposure
+ worst-case-loss headroom
+ unknown value-seconds
+ reconciliation work units
+ reserved provider/rail query quota
+ concentration capacity
```

The red-team correction is to avoid pretending a mathematically named “uncertainty capital charge” is automatically calibrated. P0 should use conservative observable caps and simple cost buckets. Statistical pricing belongs only after production evidence establishes calibration and tail stability.

### 5. Queues and concurrency: priority is not backpressure

Both repositories show why performance language can obscure overload. Unbounded queues can have excellent throughput under benchmarks and catastrophic age, memory, expiry, and ambiguity under sustained overload. Biased selection is service priority, not a finite tail guarantee.

AE must bound work by more than item count:

- work units and oldest age;
- authorized and possibly released value;
- authority/quote/result deadlines;
- unknown value-seconds;
- dependency concentration;
- forecast reconciliation work;
- provider/rail status-query quota.

The other correction is hidden global serialization. “One mutation authority” should mean one authority **per economic identity or partition**, not one thread, database row, or total-order event stream for AE. Serialize overspend and duplicate-release boundaries; allow unrelated principals, providers, rails, and evidence sources to progress independently under fencing.

### 6. Durability: exactly once is the wrong promise

NautilusTrader's event store is a meaningful recovery facility but its normal enqueue acknowledgment is not proof that an intent committed before venue I/O. hftbacktest's tape and volatile live maps are further from a financial boundary.

The achievable production guarantee is:

> At most one AE-authorized release per effect generation, durable knowledge of possible release before irreversible I/O, materially idempotent accounting recognition, and evidence-driven resolution of uncertainty.

It is **not** exactly-once provider effect. A local database cannot atomically commit with arbitrary providers, card networks, facilitators, or chains. Even protocols with idempotency can have scope, retention, expiry, or implementation failures. “Exactly once” may correctly describe a balanced ledger transition under a material idempotency key; it must never be projected onto the remote world.

### 7. Reconciliation: a safety plane, not exception handling

NautilusTrader's startup and continuous venue checks are the better live precedent. hftbacktest's dual REST/WebSocket join shows useful multi-source correlation, but volatile state and time-based deletion are unacceptable for money safety.

At machine volume, rare ambiguity becomes a service population. At one billion paid attempts/day, a one-in-a-million unknown rate yields 1,000 new cases/day; a correlated provider incident can create far more in minutes. Reconciliation must have independent admission, capacity, leases, source-specific backoff, value/age priority, and automatic resolution ladders.

The red-team correction is stronger than “add a workpool”: individual status queries may themselves be economically impossible for sub-cent uses. Resolution needs batch/source checkpoints, cohort-level evidence, clearing manifests, bounded-loss write-off policy, and provider contracts that expose queryable identities. An Operation without economical status evidence may be ineligible even if its nominal price is lowest.

### 8. Replay: recovery and counterfactual evaluation need opposite permissions

NautilusTrader's state-only replay is the correct production rule: rebuilding state must not publish commands or invoke adapters. hftbacktest's causal replay is the correct evaluation rule: policies act against a delayed local view while the harness retains hidden remote truth.

They must be separate executables/permissions:

| Mode | Input | May do | Must never do |
|---|---|---|---|
| Production rebuild | Committed AE transitions and accepted evidence | Reconstruct ledger, projections, holds, exposure, unresolved cases | Call a provider, signer, rail, refund API, or dispatch outbox solely because history contains an intent |
| Counterfactual twin | Versioned world tape, knowledge tape, seed, scenario and policy artifact | Create simulated effects and compare policy outcomes | Access production credentials, claim production truth, mutate live policy, or erase censored/unknown outcomes |

### 9. Performance and resilience: economic latency, not microsecond theater

Neither repository proves production HFT latency at the pinned revision. Even if local dispatch were microseconds, a provider, facilitator, chain, card issuer, human approval, or dispute can dominate completion by orders of magnitude.

The useful transfer is measurement discipline and deterministic state—not the assumption that the fastest local path wins. AE should separately measure durable acceptance, queue time, release-fence time, declared delivery conformance, source-attributed Agent Evaluation, knowledge lag, settlement/finality, unknown resolution, and recourse. A 20 ms response with an ambiguous external effect can be economically slower than a 500 ms response with signed, queryable, final evidence.

## What each contributes, and what neither solves

### NautilusTrader contributes

- typed aggregate transitions and material identity checks;
- a controlled mutation boundary;
- hard risk gates immediately before execution;
- write-once execution origin;
- startup and continuous reconciliation concepts;
- effect-free recovery replay;
- a warning that global ownership and unbounded ingress do not scale safely.

### hftbacktest contributes

- remote-world time separated from local-knowledge time;
- deterministic discrete-event scheduling with explicit decision causality;
- replaceable latency and queue assumptions;
- common-tape counterfactual policy comparison;
- a warning that deterministic simulation can still be wrong when the world is exogenous, transport ordering is simplified, and live state is volatile.

### Neither solves

- semantic substitutability across Operations or objective response quality, which remain contract- and agent-specific;
- nested delegated mandate chains and revocation propagation;
- arbitrary provider-effect/payment atomicity;
- multi-rail finality, refunds, chargebacks, disputes, or clearing;
- privacy purpose, data localization, retention, or legal accountability;
- provider/agent collusion, Sybil identities, prompt/tool-output manipulation, or recipient substitution;
- economically viable sub-cent usage across storage, signing, settlement, fraud, and reconciliation;
- correlated shared dependencies hidden behind nominal provider diversity;
- distributed machine-scale serialization and global exposure without hot keys;
- a self-calibrating production-to-simulation promotion loop.

### False HFT analogies to reject

1. Provider capacity is not an order book. It is multidimensional, private, perishable, contract-specific, and often unverifiable.
2. A payment is not a fill. Authorization, provider effect, delivery, settlement, reversal, refund, and dispute are different facts.
3. A provider is not simply a venue. Semantics, law, privacy, evidence, trust, and recourse vary.
4. A retry is not cancel/replace. The prior external effect may already exist and may be nonfungible.
5. A price challenge is not a market quote. It can bind scope, taxes, data rights, SLA, refund terms, and contingent usage.
6. Remote provider time is not exchange truth. It is evidence with provenance and strength.
7. Low latency is not liquidity or usefulness. Weak evidence can make a fast Operation capital-intensive.
8. Historical replay is not a no-impact oracle. Agent selection/invocation behavior changes queues, prices, fraud, and future demand.
9. A signed agent is not an aligned principal. Authentication proves key control, not human understanding or lawful purpose.
10. Exactly-once local application is not exactly-once external effect.

## Machine-scale demand model

### Actors and authority roles

Do not model one authenticated “user.” In one economic action the legal payer, account owner, planner, invoker, beneficiary, data subject, provider, fulfiller, payee, instrument issuer, custodian, facilitator, rail operator, and dispute resolver can all differ:

```text
root principal / legal payer
  -> organization or household policy domain
      -> orchestrator
          -> planning agent
              -> delegated sub-agent / tool agent
                  -> AE allocator and transaction kernel
                      -> provider operator / provider agent
                          -> subcontractor or fulfillment agent
                      -> credential issuer / wallet / vault / HSM
                      -> facilitator / PSP / acquirer / network
                      -> custody / stablecoin issuer / chain / sequencer / RPC
                      -> beneficiary / recipient / data subject
                      -> auditor / regulator / dispute resolver
```

An agent key proves control of a key. It does not, by itself, establish legal identity, runtime integrity, human comprehension, aligned intent, beneficial owner, or lawful purpose. Every transaction should bind the roles that affect authority, recourse, privacy, sanctions, tax, or liability; absence is a hard gate when it changes the permissible Operation or payment path.

### Arrival processes: swarms, loops, and synchronized adaptation

Human checkout assumptions are weak for agent traffic. Model at least:

- many agents running the same model/policy and reacting to one signal;
- recursive fan-out to sub-agents and tools;
- quote/discovery spraying with low purchase conversion;
- timeout-driven retry amplification and Operation-substitution cascades;
- condition-triggered polling that converts simultaneously when a threshold changes;
- streaming token/byte/second metering under one authority;
- agents that learn circuit thresholds and adapt request timing;
- adversaries maximizing reconciliation work or capital lock per dollar spent;
- providers that change price, evidence quality, or capacity in response to allocated flow.

This is a closed loop:

```text
Operation-selection policy -> provider load -> latency/evidence delay -> timeouts/unknowns
      ^                                                    |
      |                                                    v
admission/circuit <- capital + reconciliation capacity <- uncertainty
```

A twin that replays an exogenous tape cannot capture this loop. A production Operation selector that always chooses the apparent lowest latency can create the incident it was trained to avoid.

### Count, value, and uncertainty grow differently

These are independent scaling axes:

```text
usage count N                   can rise with tokens/bytes/calls
gross value V = sum(amount)     can stay modest while N explodes
unknown value U                 depends on Operation/dependency failure and evidence
unknown value-seconds UVS       grows with both U and resolution duration
reconciliation work W          depends on case shape, source APIs and batching
semantic blast radius B        can be high even when payment amount is tiny
```

A $0.001 payment can trigger an irreversible data disclosure, recipient change, message, booking, or actuator effect. Conversely, millions of metering ticks may represent one low-risk session whose settlement should be aggregated. Value alone cannot classify consequence, and count alone cannot price risk.

Scenario sizing should include separate conversion ratios:

```text
incoming machine requests
  * paid-challenge rate
  * authorization-created rate
  * provider-release rate
  * settlement-item rate
  * unknown-outcome rate
  * reconciliation-work-units per unknown
```

The system should not assume all ratios equal one. Usage, authorization, and settlement granularities must deliberately diverge when economics require it.

### Adversarial behavior at machine speed

The threat is not merely stolen credentials:

- split spend below step-up, AML, rate, or loss thresholds;
- use nested agents to obscure a common principal or shared objective;
- manipulate capability descriptions, recipient fields, quotes, health, and capacity declarations;
- induce provider execution and response loss to profit from duplicate failover;
- replay signed evidence or exploit source-generation resets;
- fabricate Agent Evaluation or Continuation Evidence through Provider-agent collusion;
- create circular paid-call graphs and denominator attacks against budgets;
- drain signing/HSM, chain RPC, status-query, or reconciliation capacity;
- probe abstention and circuit policies, then coordinate around them;
- exploit rounding, dust, batch inclusion, voucher close, and netting adjustments;
- spray privacy-sensitive inputs across candidates before selection.

Authentication, a wallet signature, or a valid 402 credential does not prove the semantic action was wise, intended, useful, or lawful.

### Correlated failure defeats nominal diversification

Providers that look independent may share:

- one custody provider or wallet key service;
- one facilitator, PSP, acquirer, or card network;
- one stablecoin issuer, chain, sequencer, RPC, bridge, or oracle;
- one cloud region, model provider, CDN, DNS, or identity directory;
- one codebase, agent model, or Operation-selection policy;
- one subcontractor or source dataset.

The dependency graph will be incomplete. Unknown dependencies should attract conservative concentration charges rather than being treated as diversification. Failure testing must include hidden common-cause clusters, not only named provider outages.

## Agentic-payment lifecycle: Operation-native coupled state machines

### 1. Operation discovery, optional selection, and exact snapshot

```text
DISCOVERED
 -> CALLER_SELECTS_EXACT_OPERATION
 -> SNAPSHOT_RESOLVED
 -> ADMITTED | REFUSED | EXPIRED

future AE-managed choice only:
CANDIDATES_COMPARED -> OPERATION_SELECTED | ABSTAINED
                    -> SNAPSHOT_RESOLVED
```

The Consuming Agent owns planning and orchestration. Today it supplies one exact `operationRef`; AE does not invent a selection record for that choice. Admission persists the exact `PublishedOperation` snapshot, including publication/contract/offering/binding/adapter/transport/payment/price/readiness/qualification/evidence material, then validates input and authority against it. Returned bytes do not equal contract acceptance.

### 2. Invocation and exact execution binding

```text
Invocation: PENDING -> AUTHORITY_ACCEPTED -> DISPATCH_OWNED
Attempt:    LEASED -> POSSIBLY_RELEASED -> RESOLUTION_OWNED
```

AE already composes the immutable operational origin from the persisted `PublishedOperation` snapshot, material invocation/idempotency identity, accepted authority and target digest, Attempt/effect generation, provider connection lease, and external-spend identity. Policy rollback changes only future admission or future optional selections; it never rewrites an Invocation or Attempt already resolving. A new Operation after possible release is substitution and requires proof of non-release or separately bounded duplicate-safe authority.

### 3. Mandate and authority use

```text
PRESENTED -> VERIFIED -> RESERVED -> CONSUMED
                      |          |
                      |          +-> REVERSED/COMPENSATED
                      +-> RELEASED_NOT_USED
                      +-> UNCERTAIN -> RECONCILED_USED | RECONCILED_NOT_USED

any unused generation -> REVOKED | EXPIRED
```

Reversal does not erase the historical authority use. Revocation prevents future release under the generation; it does not retroactively make a possibly released effect nonexistent.

### 4. Reservation and provider attempt

```text
PREPARED -> LEASED -> POSSIBLY_RELEASED
                        |-> NOT_RELEASED_PROVEN
                        |-> RELEASED_OBSERVED
                        |-> OUTCOME_UNKNOWN

RELEASED_OBSERVED -> DELIVERY_PENDING
                  -> DELIVERY_SCHEMA_VALID
                  -> DELIVERY_CONTRACT_VALID
                  -> DELIVERY_INVALID | DELIVERY_UNKNOWN
                  -> COMPENSATION_PENDING -> COMPENSATED | FAILED

DELIVERY_CONTRACT_VALID -> AGENT_EVALUATION_RECORDED?
                        -> CONTINUATION_EVIDENCE_RECORDED?
```

The release fence is committed before irreversible I/O. Timeout never means `NOT_RELEASED_PROVEN`. A new effect generation is legal only after evidence-backed non-release or explicit aggregate authority for a duplicate-safe hedge.

### 5. Payment and settlement

```text
NOT_PREPARED
 -> AUTHORITY_RESERVED
 -> CREDENTIAL_PREPARED
 -> POSSIBLY_SUBMITTED
 -> SUBMISSION_OBSERVED
 -> RAIL_ACCEPTED
 -> ECONOMICALLY_FINAL
 -> REVERSED | REFUNDED | CHARGEDBACK | DISPUTED

POSSIBLY_SUBMITTED -> OUTCOME_UNKNOWN -> evidence-backed branch
```

Buyer authorization, provider payment, supplier accrual, and rail settlement may be different transactions. A reservation is not settlement; a facilitator acceptance is not always economic finality; stablecoin irreversibility is not proof of service quality; card capture is not the end of chargeback risk.

### 6. Usage, clearing, and accounting

```text
USAGE_RECORDED
 -> ENTITLEMENT_ACCRUED
 -> NET_POSITION_OPEN
 -> CLEARING_BATCH_CLOSED
 -> SETTLEMENT_POSSIBLY_SUBMITTED
 -> SETTLED | OUTCOME_UNKNOWN | DEFAULTED
 -> ADJUSTED | DISPUTED
```

The three granularities are separate:

| Granularity | Meaning | Example |
|---|---|---|
| Usage | Metered economic consumption | token, byte, call, second, tool result |
| Authorization | Smallest independently bounded payer consent/provider entitlement | session ceiling, one checkout, cumulative voucher |
| Settlement | Rail item moving net value | channel close, batch voucher, card clearing item, chain transfer |

Clearing reduces rail transaction count; it does not erase per-use attribution, authority, acceptance, refund rights, or audit commitments.

### 7. Refund, dispute, and finality vector

Finality is a vector, not a scalar:

```text
FinalityVector {
  authority: reserved | consumed | released | uncertain
  providerEffect: notReleased | possible | released | compensated | unknown
  delivery: absent | schemaValid | contractValid | invalid | disputed | unknown
  agentEvaluation: unreported | accepted | rejected | reliedUpon | disputed
  payment: notSubmitted | possible | accepted | settled | reversed | refunded | disputed
  rail: source-specific level, confirmations, reversal window
  accounting: pending | posted | adjusted | closed
  legalRecourse: open | expired | adjudicated
  decisionEvidenceBasisRef
  projectionRevision
}
```

A public receipt may summarize the vector for usability, but the canonical record must retain it. No public `completed` state may claim more certainty than its attributable decision/evidence basis.

## Target architecture: distributed control plus causal learning

This is a constitutional map of eventual safety surfaces, not the immediate product deployment sequence. Existing Operation/Invocation/Attempt/Money ownership remains primary; each additional plane is extracted only when measured variation or load makes it deep.

```text
AGENT / ORCHESTRATOR
  semantic intent + acceptance predicate + delegated mandate + deadline
                              |
                              v
1. DISCOVERY / SEMANTIC PLANE                 no release authority
  normalized contracts, provider capabilities, privacy-safe discovery
                              |
                              v
2. OPERATION ADMISSION                         exact operationRef today
  resolve immutable PublishedOperation snapshot; optional future selector may abstain
                              |
          Operation snapshot + DecisionEvidenceBasis
                              |
                              v
3. INVOCATION / ATTEMPT KERNEL                 durable authority
  material idempotency, accepted authority, reservation, exact execution binding,
  bounded admission, effect generation, provider lease, pre-release validation, fence
                   |                              |
                   v                              v
4a. PROVIDER EFFECT PLANE            4b. PAYMENT / CLEARING PLANE
  prepare/release/query/compensate     balance/x402/session/card/netting
  delivery/acceptance evidence         auth/settle/reverse/refund/dispute
                   |                              |
                   +---------------+--------------+
                                   v
5. EVIDENCE / RECONCILIATION / ACCOUNTING SAFETY PLANE
  insert-once inboxes, contradiction, active queries, ledger, suspense,
  finality projections, protected lanes, batch manifests, dispute ownership
                                   |
                        privacy-controlled causal trace
                                   v
6. CLOSED-LOOP DIGITAL TWIN                    no production authority
  hidden world + delayed AE knowledge + endogenous provider/agent behavior
  invariants, economics, tail risk, concentration, calibration, promotion gates
```

### Authority boundaries

- Discovery describes Operations; it cannot reserve or release.
- Direct invocation begins from a caller-selected exact `operationRef`. A future Operation selector may compare or abstain, but it cannot call adapters or become execution source truth.
- The kernel is authoritative for AE-controlled decisions and accounting, not for total remote truth.
- Adapters translate protocols and submit raw observations; they cannot turn timeout into failure or finalize money by assertion.
- Reconciliation adds evidence and derived transitions; it cannot delete contradiction.
- The twin can simulate effects only; it cannot access production credentials or mutate live state.

### Mandate DAG and hierarchical permits

AE already has standing mandates, reserved/consumed/released/uncertain authority uses, accepted-authority variants, and grant generations. Extend that implementation first if nested delegation becomes necessary. The eventual shape may be a signed, versioned DAG whose ordinary path is a chain:

```text
MandateRoot -> DelegationEdge[0] -> ... -> DelegationEdge[n] -> AuthorityUse
```

Each edge binds grantor/grantee/key generation, capability and semantic purpose, provider/payee/recipient constraints, amount/count/recurrence/concurrency, effect/reversibility ceiling, data purpose/fields/retention/jurisdiction, allowed rails/assets/custody, evidence/recourse, fallback, subdelegation depth, expiry, parent digest, and revocation source.

Every child must be a provable attenuation across every understood dimension. Unknown constraint semantics fail closed for consequential actions. A provider, payee, rail, asset, data recipient, jurisdiction, or effect-class change can require a new authority use even if the capability label is unchanged.

To avoid a hot global mandate row at high volume, allocate short-lived hierarchical permits:

1. a root controller grants a bounded value/count/worst-loss/unknown-work permit to a mandate shard;
2. the shard spends it transactionally for individual uses;
3. unused capacity expires or returns; uncertain use remains consumed;
4. revocation increments generation, fencing stale permits;
5. under partition, no new permits are granted, while evidence and reconciliation continue.

This mechanism is a P3 optimization, not a P0 prerequisite. It should be introduced only when measured contention requires it; otherwise it creates unnecessary distributed-risk complexity.

### Bounded lanes and bulkheads

| Lane | Work | Rule |
|---|---|---|
| S0 safety | Unknown provider/payment/clearing resolution; revocation races | Dedicated capacity and query quota; never borrowed by new dispatch |
| S1 recovery | Refund, reversal, compensation, source resync, expired-credential cleanup | Guaranteed capacity; value/age/legal-deadline priority |
| P0 expiring authorized | Definitely-not-released work near expiry | Deadline scheduled; must revalidate all material |
| P1 new consequential paid | Ordinary admitted effects | Bounded by principal/provider/rail/custody/exposure and forecast safety work |
| P2 reversible/read-only | Safe reads/free work | Separate quotas; no access to S0/S1 reserves |
| M maintenance | Discovery probes, analytics, trace export | Shed/defer first |

Bulkheads exist independently for principal/mandate, Operation/provider/operator/binding, rail/facilitator/custody, source/dependency set, semantic risk class, region, and any future Operation-selection policy artifact. Closing new release must leave evidence ingest, status, refund, revocation, and reconciliation operational.

### Inbox, outbox, leases, and fencing

The desired durable release transaction is:

```text
verify material idempotency and current mandate generation
persist the exact Operation snapshot, Invocation identity, accepted authority and decision evidence basis
reserve payer funds, risk/exposure and safety-work capacity
persist exact dispatch outbox item
claim lease/effect generation with monotonic fence
revalidate authority target, Operation material, provider connection, price, readiness, capacity and expiry
transition to POSSIBLY_RELEASED
COMMIT
then and only then perform irreversible provider/payment I/O
```

This may require more than one local transaction across shards, so the implementation is a saga with per-shard invariants and permits—not a fiction that one transaction includes arbitrary providers. The last local commit before I/O must establish the release fence and sufficient durable ownership to recover.

All synchronous responses, webhooks, chain receipts, facilitator events, provider results, refunds, and disputes enter insert-once evidence inboxes before projection. Deduplicate by `(sourceId, sourceGeneration, sourceEventId, payloadDigest)`. Same identity plus different digest is a retained conflict/security incident.

A stale worker may insert new evidence because observation is additive. It may not release, spend, close a clearing batch, overwrite a newer projection, or resolve a case owned by a later fencing token.

### Reconciliation safety plane

Each unresolved case owns:

```text
identities + exposure vector
evidence gap and contradiction state
source-specific query plan and quotas
priority, value, age, deadline, systemic/dependency flags
lease and fencing token
attempts, nextAttemptAt, automatic resolution policy
resolution evidence and accounting consequences
manual owner only for high-value/legal/systemic tails
```

Resolution ladder:

1. join and verify existing evidence;
2. query the exact provider/payment/order/session/chain identity;
3. query independent sources where semantics permit;
4. apply deterministic evidence precedence;
5. execute bounded refund/compensation/write-off policy;
6. escalate only cases whose value, legality, pattern, or systemic signal justifies human cost.

Manual review is a priced, capacity-limited queue. “After five attempts, manual” is not a machine-scale strategy.

## Core data contracts and knowledge-time semantics

These are proposed contracts. Names and fields should remain versioned, bounded, and protocol-neutral while retaining the raw source artifact.

### EvidenceEnvelope and DecisionEvidenceBasis

```text
EvidenceEnvelope {
  evidenceRef, eventType, schemaVersion
  sourceId, sourceGeneration, sourceEventId, sourceSequence?
  sourceOccurredAtAssertion?, occurrenceInterval?
  ingressAt, durablyAcceptedAt, appliedAt?, clientObservedAt?
  operationRef?, invocationRef?, attemptRef?, effectGeneration?
  externalEffectRef?, paymentRef?, settlementRef?, disputeRef?
  payloadDigest, rawEncryptedPayloadRef?
  verificationMethod, verificationResult, evidenceClass, finalityLevel
  causationRef?, priorTransitionHash?
  retentionClass, jurisdictionTags
}

DecisionEvidenceBasis {
  basisRef, decisionKind
  operationRef, operationMaterialDigest, readinessValidUntil
  qualificationDigest, operationEvidenceDigest
  acceptedAuthorityDecisionDigest?, authorityTargetDigest?
  selectedEvidenceRefs?, sourceHighWatermarkDigest?
  decidedAt
  factAgeAndStrengthDigest
  policyInputDigest
}
```

A decision evidence basis means “the durable facts actually available to this decision,” not “the most recent remote occurrence.” For current direct invocation, much of it already exists in the persisted Operation snapshot, readiness/qualification/evidence digests, and accepted authority/target digest; hardening should attribute those facts without duplicating them. A later source assertion cannot justify an earlier admission, authority decision, or optional Operation selection. Policy review must reconstruct the same as-of view. The causal twin may use explicit knowledge/evidence cuts internally to replay simulated availability.

Avoid three traps:

1. **Global ordering:** a single evidence sequence for all sources creates hidden serialization. Use decision-scoped references, source/shard high-watermark digests, and explicit causal links.
2. **Timestamp authority:** remote time is an assertion, not automatic precedence.
3. **Unbounded vectors:** large selected-evidence lists and source maps require digests, bounded manifests, or external immutable blobs; Convex parent documents must not grow without bound.

### Existing exact execution binding and optional future OperationSelection

```text
OperationSelection {                         // only when AE chooses
  selectionRef, principalRef
  candidateSetDigest
  candidates[{ operationRef, providerRef, bindingRef, quoteRef,
               hardGateResult, rejectionCodes, scoreComponents,
               uncertaintyCost, capacityPermitRef? }]
  selectedOperationRef? | abstentionReason?
  decisionEvidenceBasisRef, policyArtifactRef, calibrationManifestRef
  decisionAt, expiresAt, selectionDigest
}

ExactExecutionBinding {                       // composed from existing source truth
  PublishedOperation snapshot + operationRef + materialDigest
  principal/credential/grant generation + input/idempotency digests + invocationRef
  accepted authority + targetDigest
  attemptRef + effectGeneration + provider connection lease
  external-spend identity + payment/custody generations
}
```

There is no `OperationSelection` when the caller supplies the exact `operationRef`, and `ExactExecutionBinding` is explanatory notation rather than a new aggregate or table. If automatic selection is later built, persisting bounded rejected-candidate facts matters for evaluation, but candidate payloads can leak commercial and personal information. Store bounded rejection codes, feature digests, and privacy-reviewed details; do not persist raw candidate prompts or secrets by default.

### Composed admission/exposure decision and ExposureVector

```text
AdmissionExposureDecision {
  admit | defer | abstain | requireStepUp | refuse
  financialExposurePermit
  uncertaintyWorkPermit
  concentrationPermits[]
  requiredEvidenceClass
  circuitStateRefs[]
  uncertaintyCost
  decisionEvidenceBasisRef, expiresAt, decisionDigest
}

ExposureVector {
  authorizedValue, reservedValue, possiblyReleasedValue
  unsettledValue, reversibleValue, disputeReserve
  channelDeposit, clearingReceivable, clearingPayable
  unknownCount, unknownValue, unknownValueSeconds
  reconciliationWorkUnits
  worstCaseLoss, expectedLoss
}
```

This is a logical audit view, not a proposed global table or top-level engine. Initially its facts and enforcement remain with Agent Access, Action Invocation, provider connection/capability supply, and Money. Extract a shared module only if a genuinely deep common policy interface emerges.

Aggregate independently by root principal, mandate, credential, semantic effect, provider/operator, rail/asset/issuer, facilitator/PSP, custody, chain/sequencer/RPC, cloud/region/dependency set, and clearing counterparty/epoch. Nominal provider diversification cannot defeat a shared-custody cap.

### Adapter capability contracts

```text
EffectAdapterCapabilities {
  externalIdempotency: unsupported | operation | account | global
  idempotencyRetentionAndExpiry
  statusLookup: none | requestIdentity | externalIdentity
  evidence: unsigned | signed | signedSequenced
  cancellation: beforeStart | bestEffort | compensatingOnly | unsupported
  refund/reversal, resultAttestation, sourceRestartSemantics
  dataJurisdictions, retention, maxPayload, serviceTimeClass
}

RailCapabilities {
  railKind, assets/currencies, authorizationMode
  minimumFee, percentageFee, effectiveFeeDistribution
  batching/session/netting support
  finalityModel, reversal/chargeback/refund model
  idempotency/status/evidence semantics
  custody/facilitator/issuer/dependency refs
  compliance boundary, availabilityEvidence, capacityTerms
}
```

Capability declarations are claims with provenance and freshness. They do not become truth because a provider signed them. Any future Operation-selection score must compare declarations with observed behavior.

### ClearingBatch and usage commitments

```text
UsageLeaf {
  usageRef, authorityUseRef, providerEntitlementRef
  contractRef, amount, units, occurred/observed clocks
  acceptance/evidence digests
}

ClearingBatch {
  batchRef, counterpartyRef, rail, asset, epoch
  leafCount, grossDebit, grossCredit, netAmount
  usageManifestRoot, adjustmentManifestRoot
  margin/reserve refs, closeSequence
  settlementAttemptRef, releaseFence, finalityVector
}
```

For extreme metering volume, not every token tick needs an independent full ledger document forever. A bounded append log or session accumulator can commit usage leaves into hash/Merkle manifests, while checkpoints and final settlement preserve auditability. This is an economic/storage design decision; it must not erase the ability to prove a disputed use or recreate totals.

## Formal production invariants

These are model-independent proof obligations:

1. At most one AE-authorized irreversible release per `(invocationRef, attemptRef, effectGeneration)`.
2. No automatic repeat or Operation substitution after the prior effect may have begun.
3. A new effect generation requires evidence-backed non-release or explicit duplicate-safe aggregate authority.
4. A stale lease/fence cannot release, spend, close clearing, or finalize newer work.
5. One idempotency identity cannot bind different principal, grant/mandate generation, exact Operation snapshot, input, authority target, payee, amount, rail, asset, custody, or expiry material.
6. Every provider effect and payment observation is attributable to the exact Operation/Invocation, Attempt, effect generation, external-spend identity, and source.
7. Exact execution binding is immutable after possible release; policy rollback affects only new admissions or future optional Operation selections.
8. Authority, grant generation, quote, price, readiness, capacity permit, provider approval, and payment expiry are revalidated immediately before release.
9. A child mandate never widens its parent. Unknown constraint semantics fail closed for consequential effects.
10. Duplicate evidence with identical identity/digest is idempotent; identical identity/different digest is retained as conflict.
11. Older or weaker evidence cannot roll definitive state backward without an explicit correction/reversal transition.
12. Unknown outcome is durable, owns financial/work exposure and a resolution case, and never disappears by timeout, cleanup, or projection rebuild.
13. Settled, refunded, reversed, disputed, defaulted, and lost money produce balanced, materially idempotent accounting consequences.
14. Clearing totals equal the committed usage/adjustment manifests; gross exposure never exceeds counterparty permits.
15. Safety and reconciliation capacity remains available when new-release circuits are closed.
16. Admission cannot forecast safety work beyond the protected envelope or allow unknown exposure beyond any relevant cap.
17. New dispatch cannot consume query/signing quota reserved to resolve existing unknowns.
18. Public receipts never collapse required unknown finality dimensions into scalar success.
19. Production replay performs zero remote I/O and reconstructs identical ledger, exposure, projections, and unresolved ownership.
20. Every policy decision is reproducible from its artifact and decision evidence basis; future Operation selections also retain bounded candidate facts. Later evidence cannot leak into evaluation.

The “exactly once” phrase is intentionally restricted to local material application (for example, one balanced accounting consequence). The external guarantee remains at-most-one AE-authorized release plus reconciliation.

Twin-only invariants:

1. Same code revision, manifest, tape, seed, and equal-time rule produce identical transition hashes.
2. A policy sees only evidence durable at its simulated knowledge cut.
3. Hidden world truth never enters production decisions or receipts.
4. Endogenous load/effect mode is the default; no-impact mode is explicitly labeled restricted.
5. Promotion fails on any production invariant violation regardless of profit.

## Operation selection under stale knowledge, economics, trust, regulation, and capacity

This chapter applies only when AE eventually selects among candidate Operations. It does not add a decision step to current direct invocation, where the caller supplies the exact `operationRef`.

### Step 1: semantic eligibility, not nearest label

Normalize intent into a contract and hard-gate:

- capability/version/input/output and acceptance semantics;
- effect class, reversibility, duplicate harm, and compensation;
- data fields, recipients, purpose, retention, and jurisdiction;
- payer, beneficiary, provider, payee, sanctions and licensing;
- mandate chain, amount/count/recurrence/concurrency/subdelegation;
- deadline and agent-declared result useful-life window;
- evidence, idempotency, status, refund, and recourse appropriate to risk;
- permitted rail, asset, custody, facilitator, and finality;
- current readiness, price, quote, capacity, and expiry;
- trust tier and shared-dependency concentration.

Only semantically substitutable operations enter one equivalence class. A cheap response with the wrong freshness, provenance, privacy regime, or side-effect class is not a fallback.

### Step 2: score contribution at the decision evidence basis

For eligible Operation `i`:

```text
ExpectedNetContribution_i =
  P(contract-valid delivery by deadline | DecisionEvidenceBasis) * AgentDeclaredValue
  - providerPrice
  - railAndClearingCost
  - computeVerificationStorageCost
  - expectedFraudRefundDisputeLoss
  - expectedReconciliationCost
  - capitalTimeCost(unknown value-seconds)
  - privacyComplianceCost
  - concentrationShadowPrice
  - stressTailPenalty
```

The Operation selector may abstain. `AgentDeclaredValue` comes from the consuming agent or its policy; AE must not invent an objective utility score. Source-attributed Agent Evaluation and Continuation Evidence may inform a permitted policy without becoming platform truth. Evidence age widens uncertainty: hard-stale authority, sanctions, quote, or readiness fails closed; soft-stale delivery-conformance and latency estimates increase uncertainty and can reduce allocation.

Do not begin with a learned black-box score. Start with auditable hard gates and decomposed costs. Introduce learned components only after shadow evaluation shows calibration, stability, and no unacceptable provider/consumer fairness regressions.

### Operation-selection policy gaming

An Operation market is adversarial. Providers can underquote, overstate capacity, delay bad evidence, rotate identities, collude with agents, or manipulate the training signal. Defenses include:

- signed/versioned capability and capacity claims with deposits or contractual penalties only where enforceable;
- outcome attribution by provider operator and hidden dependency, not merely endpoint identity;
- delayed conformance/reliability credit until evidence/finality windows mature, with Agent Evaluation kept source-attributed;
- robust statistics that retain censored/unknown outcomes instead of dropping them;
- exploration budgets isolated from high-consequence flow;
- persisted randomized allocation among near-equivalent Operations to reduce herding;
- concentration floors/ceilings and Sybil clustering;
- adversarial holdout providers/scenarios and score-feature provenance;
- inability for provider-supplied text to directly set recipients, risk class, or authority scope.

Randomization is not automatically fair: it can allocate harmful exploration to buyers. Exploration must respect mandate, risk, compensation, privacy, and price limits, with sponsor-paid risk where appropriate.

### Fallback and hedging by phase

- Before admission/reservation: select another eligible Operation.
- After selection but before release: material substitution creates a new selection/admission decision and may require new authority.
- After `POSSIBLY_RELEASED`: reconcile; no silent Operation substitution.
- After `NOT_RELEASED_PROVEN`: a new effect generation is permitted under current authority.
- Hedge/race only when outputs are fungible, duplicates harmless/compensable, aggregate spend authorized, privacy exposure acceptable, and every possible release consumes exposure.

### Auctions and quotes: narrow use only

Auctions are justified mainly for **future capacity procurement** or standardized, fungible services with enforceable delivery/evidence terms. Per-request auctions can create quote storms, latency races, collusion, information leakage, and adverse selection that cost more than the microtransaction.

Reasonable mechanisms:

- batched sealed capacity procurement for a service class/region/time window;
- posted signed capacity quotes with expiry and penalties;
- bilateral session terms for repeated flow;
- congestion prices internal to AE to protect scarce provider and reconciliation capacity.

Do not auction away hard semantic, authority, privacy, jurisdiction, or recourse constraints. Do not call self-reported concurrency “liquidity.”

## Performance and resilience model

### Separate local acceptance from external completion and finality

```text
T_discover  semantic search and candidate projection
T_decide    decision-scoped admission/authority/exposure; optional future selection
T_accept    authentication + idempotency + durable reservation/outbox
T_queue     admitted wait before fenced ownership
T_release   revalidation + release-fence commit
T_effect    provider execution + transport + output verification
T_know      remote occurrence assertion to durable AE knowledge
T_settle    payment submission to rail/economic finality
T_resolve   unknown detection to evidence-backed resolution
T_recourse  refund/dispute window and adjudication
```

Only `T_accept`, local queueing, and the fence are primarily AE-owned. External completion/finality SLOs must be Operation/provider- and rail-specific. A single end-to-end p99 conceals whether AE, a provider, the evidence path, or the rail is failing.

### Admission and safety capacity math

For Operation/dependency regime `r`, let:

- `lambda_a(r)` = admitted paid attempts/second;
- `p_u(r)` = unknown-outcome probability;
- `w_u(r)` = expected reconciliation work units per unknown;
- `mu_s` = protected safety service rate in work units/second;
- `B_s` = current safety backlog;
- `H` = planning horizon;
- `rho_target` = conservative target utilization.

Then:

```text
W_forecast(H) = B_s + H * sum_r(lambda_a(r) * p_u(r) * E[w_u(r)])

admit only if:
  W_forecast(H) <= H * mu_s * rho_target
  and oldest-case/value/exposure SLOs remain feasible
```

This is a control heuristic, not a proof: `p_u` and work are nonstationary and correlated. Use stress multipliers, confidence bounds, and circuit states. A nominal 50–65% ordinary utilization target may be a starting scenario, not a hard-coded universal constant.

Financial admission independently requires:

```text
cash_or_credit
- durable reservations
- possible-release exposure
- unsettled authorizations
- dispute/refund reserves
- deposits and clearing margin
- correlated-failure buffer
>= new worst-case commitment
```

### Overload outcomes

Before the release fence, overload can return durable:

- `accepted` with a bounded deadline;
- `deferred(retryAfter, reason)` without consuming release authority;
- `expired_before_release` with holds released;
- `abstained` because no eligible Operation is economical/safe;
- `refused` because authority/risk cannot be satisfied.

After the fence, overload may only slow status/reconciliation within protected SLOs; it must never convert uncertainty into a generic retry. If safety capacity degrades, close new release first.

### Sharding and failure boundaries

Serialize locally by:

```text
authority/budget     (rootPrincipalRef, mandateRef, asset)
invocation/effect    (invocationRef, attemptRef, effectGeneration)
provider capacity    (providerRef, bindingRef, region, serviceClass)
external spend       (paymentIdentifier, challengeDigest)
rail/custody risk    (custodyGeneration, rail, asset, region)
clearing             (counterpartyRef, asset, clearingEpoch)
reconciliation       (sourceId, externalIdentityHash)
```

Cross-shard work is an explicit saga with permits and compensation. Do not introduce global locks for Operation selections, decision evidence bases, total ledger sequence, or policy versions.

### Circuit breakers and kill switches

Circuit hierarchy:

- principal/mandate/credential;
- provider/operator/binding/service class;
- facilitator/PSP/acquirer/custody/key directory;
- rail/asset/issuer/chain/sequencer/RPC;
- cloud/region/dependency set;
- semantic effect/risk class;
- policy artifact.

States should distinguish `open`, `degraded`, `new_release_closed`, `safety_only`, and `administratively_killed`. Trip on unknown generation/value/value-seconds, reconciliation age, evidence conflicts/source regressions, invalid output, reversal/default, deadline misses, concentration, or stress-capital breach—not only HTTP error rate.

A global kill switch stops new irreversible release and new clearing-batch submission. It must not stop evidence ingest, status, refunds, revocations, receipts, or reconciliation.

### Initial SLO classes

These are proposal targets to validate, not current AE claims:

| Class | Example | AE-owned control goal under admitted regional load | External contract |
|---|---|---|---|
| L0 | discovery/quote/status | p99 100–300 ms; disclose projection age | no side effect |
| L1 | fast lookup/read | durable accept p99 <300 ms; release-ready <750 ms | contract-valid delivery by 2–5 s |
| L2 | model/API work | durable accept p99 <500 ms | explicit 5–120 s deadline/progress |
| L3 | async compute/workflow | durable accept p99 <750 ms | minutes/hours with status and expiry |
| L4 | physical/human service | authority/acceptance confirmation | hours/days with milestones and recourse |

Safety/economic SLOs matter more:

- zero automatic alternate release after possible release;
- zero successful stale-fence release in invariant tests;
- 100% balanced ledger and deterministic rebuild hash;
- oldest and value-weighted reconciliation age by dependency;
- unknown count/value/value-seconds as a share of capital;
- contract-valid delivery by deadline, separate from transport success;
- source-attributed Agent Evaluation and Continuation Evidence, reported separately from contract validity;
- finality/reversal/refund/dispute by rail;
- automatic resolution rate and manual cases per million uses;
- Operation/provider and hidden-dependency concentration;
- cost and contribution per contract-valid economically resolved delivery;
- policy calibration error, abstention, tail loss, and regret at the recorded decision evidence basis.

## Microtransaction economics and rail design

### Minimum viable price

For one contract-valid economically resolved delivery, let:

```text
C = provider cost
  + local compute/verification/storage
  + expected fraud/refund/dispute loss
  + expected reconciliation and support
  + capital cost of reservations/deposits/unknown value-seconds
  + compliance/privacy/retention cost
  + fixed settlement cost / uses per settlement

p_min = C / (1 - percentage_rail_fee - target_margin)
```

If `p < p_min`, the transaction is uneconomic even if technically successful. Subsidies are legitimate only when sponsor, budget, and objective are explicit. “Free” calls still consume signing, provider, evidence, and safety capacity and can enable reconnaissance or denial-of-wallet attacks.

At this evidence cut Coinbase published 1,000 free facilitator transactions/month and then $0.001 per transaction, while its changelog recorded a $0.001 minimum payment. A one-mill payment cannot also bear a one-mill facilitator cost without subsidy, batching, sessions, or another facilitator model ([facilitator pricing](https://docs.cdp.coinbase.com/x402/core-concepts/facilitator), [minimum-payment changelog](https://docs.cdp.coinbase.com/get-started/changelog)). The broader point survives price changes: fixed per-settlement cost imposes a hard floor.

### Rail posture

| Rail/mechanism | Best fit | Advantage | Structural risk | AE posture |
|---|---|---|---|---|
| Internal prepaid/session balance | repeat low-value calls | lowest marginal reservation/ledger cost | custody/licensing, prefunding, treasury concentration | default for sub-cent repeat flow where legally available |
| x402 exact stablecoin | open Internet, discrete low-dollar resource | HTTP-native, programmable, observable | facilitator/gas/key/issuer/chain concentration; limited recourse | first open rail; retain chain/asset/finality evidence |
| x402 batch / MPP session voucher | streaming/repeat use | amortizes verification and settlement | deposit lock, stale voucher, channel close, counterparty risk | bounded deposits, monotonic vouchers, fenced close owner |
| Card/network token | retail and merchant commerce | acceptance, compliance, fraud/dispute infrastructure | fixed fees, auth/capture/chargeback, token-vault/issuer dependence | higher-value commerce; aggregate rather than per-token auth |
| Bank/account rail | larger B2B/slow settlement | lower percentage cost, legal counterparties | returns, windows, slower finality | clearing settlement, not request path |
| Bilateral netting | high repeat known counterparties | millions of uses to bounded settlements | credit, margin, default, legal complexity | only after exact usage ledger and exposure permits |

[x402](https://www.x402.org/) proves HTTP-native machine payment is operational. [MPP](https://mpp.dev/protocol) and its [Tempo session method](https://mpp.dev/payment-methods/tempo/session) demonstrate the architectural separation between metering and settlement through cumulative vouchers. [AP2](https://ap2-protocol.org/ap2/specification/), [UCP](https://ucp.dev/latest/specification/overview/), and [ACP](https://developers.openai.com/commerce/specs/checkout) are more relevant to delegated commerce/checkout than sub-cent settlement. No one rail satisfies every finality, recourse, cost, privacy, and compliance need.

### Clearing and netting

For netted flow:

1. each use emits an immutable entitlement/usage commitment and provisional balanced consequence;
2. bilateral positions update on counterparty/asset/epoch shards with replay protection;
3. permits cap gross unsettled and net receivable—never only expected net;
4. batch close commits a manifest root and totals;
5. settlement submission has its own release fence and unknown state;
6. final rail evidence closes the batch;
7. later refunds/disputes append adjustments to a later epoch rather than rewriting history;
8. margin and default waterfall are explicit: participant collateral, reserve, loss allocation, then AE capital.

Netting does not eliminate risk; it creates credit exposure and a miniature clearing institution. Begin prefunded or tightly collateralized and obtain legal/regulatory analysis before broad credit or multilateral netting.

### Working capital and uncertainty

Optimize settlement interval and session deposit jointly with:

- fixed settlement fee amortization;
- counterparty default exposure;
- capital lock and opportunity cost;
- refund/adjustment frequency;
- evidence/finality delay;
- provider dependency concentration;
- channel/session recovery cost;
- customer/provider liquidity preference.

The cheapest posted rail can be more expensive after reserve lock, reconciliation, reversals, and operational queries. Those costs belong in Operation contribution and provider/payment terms.

## Security, identity, governance, privacy, and disputes

### Delegated authority is more than a signed prompt

Proof of intent should bind:

- root/legal principal and signing key generation;
- exact semantic contract or bounded open constraints;
- beneficiary, provider/payee/recipient, amount, recurrence, and expiry;
- data purpose, fields, recipients, retention, and jurisdiction;
- rail/asset/custody and required recourse/finality;
- permitted fallback, substitution, hedging, and subdelegation;
- nonce/challenge, body/input digest, Operation/Invocation/effect/payment identities;
- trusted UI or organizational policy evidence where required.

AP2's open/closed mandates and selective disclosure, Verifiable Intent's delegation chains, ACP's scoped delegated payment token, and Visa/Mastercard agent-recognition/network controls are relevant components—not one universal authority layer ([AP2](https://ap2-protocol.org/ap2/specification/), [Verifiable Intent](https://verifiableintent.dev/spec/), [ACP delegated payment](https://developers.openai.com/commerce/specs/payment), [Visa Trusted Agent Protocol](https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications), [Mastercard Agent Pay framework](https://www.mastercard.com/global/en/news-and-trends/stories/2025/agentic-commerce-framework.html)). Preserve original artifact format, version, digest, verification method, and limitations.

A signed mandate can still encode a manipulated or misunderstood request. High-consequence flows may require trusted-surface confirmation, delayed execution, multi-party approval, or human step-up. “Autonomous” cannot mean removal of recourse and escalation.

### Nonces, generations, and key/custody identity

- Nonces prevent replay only within a defined scope and retention window; store that scope.
- Key rotation and source restart increment generation. Old signatures remain attributable but cannot authorize new work.
- Wallet, HSM, vault, custody provider, facilitator, and instrument issuer are separate dependency identities.
- A credential reference must not expose raw secrets in canonical events; bind digest/generation/custody evidence.
- Revocation affects future release immediately, while ambiguous past release remains exposed.
- Provider identity must distinguish endpoint, binding, operator, legal entity, and dependency set; endpoint rotation must not reset reputation or exposure.

### Policy provenance and governance

Every authority/admission/exposure decision, and every future Operation selection, records:

```text
policy code/config artifact
model version and feature schema
calibration manifest and training evidence basis
candidate facts and rejection codes
random seed/draw where used
human/administrative override and reason
```

Model output cannot bypass hard kernel invariants. Promotion, rollback, kill, and override are authenticated, auditable control-plane actions. Rollback never rewrites existing claims or their resolution policy unless a separately authorized safety migration is recorded.

### Privacy and regulatory conflict

Financial auditability and privacy rights can conflict. “Store everything immutably” is not a sufficient policy:

- separate routable metadata from encrypted payloads;
- persist payload digests and retention-controlled encrypted references, not copied prompts/results;
- use selective disclosure for mandate constraints;
- bind data recipient/purpose/retention/jurisdiction into authority and the exact Operation/payment material;
- perform semantic matching on declared contracts before sending concrete user inputs;
- use cryptographic erasure/key destruction where law permits while retaining minimum non-identifying financial proofs;
- establish legal basis and retention per jurisdiction, rail, and dispute window;
- keep high-cardinality/sensitive evidence in controlled stores, not unrestricted metrics;
- export only privacy-reviewed features and censored outcomes to the twin.

Micro-value does not imply exemption from sanctions, AML/KYT, tax, consumer rights, data protection, or licensing. High aggregate machine volume can make individually tiny events material. The architecture must support jurisdictional Operation eligibility, payment-path constraints, and regional evidence/control boundaries; legal conclusions require counsel, not a scoring model.

### Disputes and human escalation

Dispute evidence should connect:

```text
agent plan -> exact Operation snapshot -> accepted authority -> Invocation/Attempt -> provider effect
-> delivery/acceptance -> payment/finality -> accounting/refund
```

It must distinguish agent compromise, unauthorized delegation, provider misdelivery, buyer rejection, rail fraud, payment reversal, and AE control failure. Automatic remedies should be predeclared by contract and bounded by risk permits. Humans handle legal/high-value/systemic tails; the architecture should minimize cases without making absence of support the “solution” to micropayment economics.

## Closed-loop deterministic digital twin

### What to take from hftbacktest

The twin should reuse hftbacktest's strongest disciplines:

- hidden remote world separated from delayed local knowledge;
- explicit event scheduling and versioned equal-time priority;
- distinct entry, service, response, and evidence latency;
- replaceable uncertainty models;
- deterministic seeds/tapes and common random numbers for policy comparison;
- compact failing traces and reproducible counterfactuals.

It must reject hftbacktest's unsafe production assumptions:

- no-impact historical world as a default;
- one standardized exchange truth;
- forced nondecreasing request/response order;
- volatile identity/correlation;
- static connector binding;
- queue-position models treated as provider-capacity models.

### Shared production/twin schema, separate authority

Share pure, versioned definitions for:

- event/evidence envelopes and state transitions;
- material identities and invariant predicates;
- optional Operation-selection policy input/output;
- evidence precedence and finality semantics;
- admission outcomes and economic metrics;
- provider/rail capability declarations.

Do not share:

- production credentials, signers, mutable DB handles, or adapter code;
- hidden simulator truth with production decisions;
- stochastic draws in the live hard-gate path;
- raw sensitive production payloads by default.

### Twin world and knowledge tapes

World state should include:

- provider queue, concurrency, token/inventory/rate limits, and service distribution;
- idempotency retention, status semantics, evidence quality/delay, source restart;
- declared output conformance and adversarial content;
- latent agent-perceived utility, Agent Evaluation, and Continuation Evidence as separate variables;
- credential issuance, facilitator/PSP behavior, chain inclusion/reorg, card reversal;
- custody balance, channel/session state, clearing exposure/margin/default;
- hidden dependency graph and correlated outage/degradation;
- adaptive price/capacity/evidence policy by providers;
- adaptive Operation selection/retry/delegation by agents;
- fraud, collusion, Sybil identities, threshold probing, and privacy leakage.

Knowledge delivery independently injects delay, loss, duplication, overtaking, contradiction, stale webhook, partial finality, and censored/missing terminal outcomes. Policies see only locally durable evidence; evaluators may inspect hidden truth afterward.

### Determinism manifest

```text
world tape/version
+ knowledge-delivery tape/version
+ scenario/regime manifest + seed
+ transition/evidence schemas
+ explicit equal-time ordering rule
+ policy artifact and calibration versions
+ code revision and dependency manifest
```

Same manifest must produce identical transition hashes. Candidate policies run with common random numbers. Report distributions, worst regimes, calibration error, and censored outcomes—not one magic p99 or average profit.

### Red-team correction: deterministic does not mean predictive

Digital twins overfit when:

- latency/error models are fit only to successful, observable calls;
- manual and never-resolved cases are dropped as missing;
- policy-driven provider adaptation is absent;
- one recent regime is replayed repeatedly;
- provider identities rotate or selection changes the observed sample;
- synthetic semantic-quality scores are mistaken for AE truth or substitute for source-attributed Agent Evaluation;
- common random numbers hide structural model misspecification;
- policy is optimized against the exact scenario corpus used for promotion.

Controls:

- separate calibration, tuning, holdout, and adversarial corpora;
- retain censored/unknown outcomes and bound them pessimistically;
- compare multiple model families and stress envelopes;
- require scenario coverage by failure mechanism, not total trace count;
- use production shadow decisions before financial canaries;
- cap canary value, consequence, principal, provider, and rail;
- monitor live calibration and automatically demote policy on drift;
- never relax kernel caps because a simulator predicts safety.

### Policy certification and promotion

1. zero hard-invariant violations;
2. bounded worst-regime loss, unknown exposure, and safety-lane age;
3. improved contribution distribution, not average only;
4. no unacceptable concentration, privacy, consumer, or provider fairness regression;
5. holdout and adaptive-adversary pass;
6. signed/versioned artifact and review record;
7. production shadow;
8. bounded canary with unchanged kernel gates;
9. rollback affects new decisions only.

The twin has no production authority. It produces evidence for governance, not permission to bypass governance.

### Required deterministic scenario corpus

At minimum:

1. crash before/after decision commit;
2. crash before/after money reservation;
3. crash before/after release fence;
4. provider performs effect; response is lost;
5. payment submits; output is absent or invalid;
6. output is valid; payment remains unknown;
7. webhook overtakes synchronous response;
8. duplicate source identity with same and different digest;
9. source sequence regression/restart;
10. stale lease attempts release/finalization;
11. authority/quote/readiness/capacity expires in queue;
12. mandate revokes during preparation and ambiguous release;
13. a different Operation attempts release after the original may have been released;
14. shared custody/facilitator/chain/cloud outage across providers;
15. reorg, depeg, chargeback, or PSP reserve after apparent completion;
16. safety lane saturates during demand spike;
17. dispatch consumes query quota needed for unknown resolution;
18. agents herd to the same low-latency provider;
19. recursive paid-call loop and threshold splitting;
20. provider-agent collusion fabricates delivery;
21. netting counterparty defaults before settlement;
22. stale voucher/channel-close race;
23. privacy-sensitive input is sprayed across candidates;
24. projection rebuild while evidence ingest continues;
25. policy rollback while existing exact Operation/Invocation bindings resolve;
26. hidden common dependency fails despite apparent Operation/provider diversification;
27. quote/capacity Sybil manipulation;
28. reconciliation queries cost more than the disputed value;

Each scenario measures invariants, contract-valid delivery, separately attributed Agent Evaluation and Continuation Evidence, unknown value-seconds, safety work, capital loss, concentration, privacy exposure, unit economics, and deterministic replay.

## Current AE: verified strengths to preserve

AE is materially ahead of both references on several payment-safety mechanics:

1. **Explicit release uncertainty.** The action invocation schema distinguishes `not_released`, `released`, and `possibly_released`, carries `effectGeneration`, and forces timeout/uncertainty into `reconcile_before_retry` ([action invocation states](src/modules/action-invocation/internal/convex-schema.ts#L16-L78)).
2. **Durable fence before network.** The canonical command transitions the attempt/control to `possibly_released` and materially binds invocation, attempt, and generation ([canonical release fence](src/modules/action-invocation/canonical-claim.ts#L257-L307)). The worker persists/reads the fence before transport invocation; brokered x402 places the fence at the authorization-read boundary ([release worker](src/modules/capability-execution/invocation-worker/runRelease.ts#L147-L167), [pre-send fence and invocation](src/modules/capability-execution/invocation-worker/runRelease.ts#L423-L502)).
3. **Repeated pre-release validation.** Preparation verifies principal/grant generation, current operation material, fixed price/readiness, provider connection authority, and accepted authority ([preparation gates](src/modules/capability-execution/invocation-worker/runPreparation.ts#L95-L237)); release re-reads the grant and current publication before proceeding ([release revalidation](src/modules/capability-execution/invocation-worker/runRelease.ts#L263-L322)).
4. **Exact immutable Operation material is already persisted.** `PublishedOperation` binds business/publication/contract/offering/binding/adapter/transport, endpoint, payment/recipient, price, readiness, qualification, evidence, and connection-authority material into a digest; the invocation stores the serialized snapshot ([snapshot](src/modules/capability-supply/published-operation.ts#L31-L86), [invoke schema](src/modules/capability-execution/internal/convex-schema.ts#L137-L198)). Accepted authority binds its `targetDigest`, and Attempt identity adds `operationRef`, input/idempotency, `attemptRef`, and `effectGeneration` ([authority validation](convex/capabilityOperationInvocationIdentity.ts#L51-L143)).
5. **Material external-spend identity and unknown state.** External spend binds principal, credential, grant generation, invocation, attempt, effect generation, operation, provider, payment identifier, challenge, amount, custody and idempotency; settlement maps explicitly to `settled`, `released`, or `outcome_unknown` ([identity](src/modules/money/internal/external-spend.ts#L217-L251), [reconciliation transition](src/modules/money/internal/external-spend.ts#L436-L493)).
6. **Bounded production authority.** Production `full_yolo` is rejected at principal write and verification boundaries ([principal enforcement](convex/agentAccessPrincipals.ts#L55-L80), [supply verification](convex/agentAccessPrincipals.ts#L103-L120)).
7. **Durable automatic reconciliation.** A scheduled worker has bounded selection, a 45-second sweep deadline, leases, retries/backoff, expiry recovery, and manual disposition ([sweep](convex/capabilityOperationInvocationWorker.ts#L41-L203), [finish/backoff](convex/capabilityOperationInvocations.ts#L252-L313)).
8. **Deliberate exact-Operation start line.** The Atomic Operation Market requires one exact, real-funds x402 journey before automatic provider selection; the Consuming Agent owns planning and supplies exact `operationRef`, which the invoke API materially includes in its request and invocation identity ([start line](START_LINE.md#L24-L66), [admission](src/modules/capability-execution/operation-invoke-admit.ts#L184-L256), [language](UBIQUITOUS_LANGUAGE.md#operation)).

These are not reasons to rewrite. They are the production kernel nucleus.

## Current AE gaps and red-team findings

### 1. Decision-basis attribution and evidence clocks are not yet normalized

The current schema composes action invocation, capability execution, money, and observability tables. Direct invocation already persists the exact `operationRef`, serialized `PublishedOperation`, input/request/idempotency identity, grant generation, accepted authority, Attempt/effect generation, and external-spend linkage ([invoke schema](src/modules/capability-execution/internal/convex-schema.ts#L137-L198), [attempt identity](convex/capabilityOperationInvocationIdentity.ts#L11-L49)). Those are the correct source facts, not evidence that a missing routing aggregate should be added.

The real gap is normalized attribution of which readiness, qualification, evidence, authority, source-clock, and policy facts a consequential decision consumed. Automatic Operation selection would additionally need bounded candidate/rejection and policy/calibration provenance, but caller-selected direct invocation does not.

**Correction:** while direct invocation remains reconstructible from existing exact facts, preserve and test that linkage. Add decision-scoped `DecisionEvidenceBasis` attribution and normalized source/projection clocks when multiple sources or a real as-of decision make them necessary. Do not synthesize one-candidate selection records or add a parallel production claim aggregate.

### 2. Evidence semantics are too shallow for as-of reasoning

Action history has a single `recordedAt` and optional evidence reference; observability audit events have `createdAt`, evidence refs, and a payload hash, but no normalized source generation/sequence, ingress, durable acceptance, application, finality, or decision evidence basis ([action history](src/modules/action-invocation/internal/convex-schema.ts#L196-L217), [audit events](src/modules/observability/internal/schema.ts#L12-L31)). Transport observations do distinguish release/payment uncertainty, which is a strong input, but remain an observation object rather than a durable multi-source evidence lattice ([transport observation](src/modules/capability-supply/internal/route-transport-observation.ts#L7-L28)).

**Correction:** when source overtaking/contradiction or as-of replay becomes real, insert raw evidence rows independently from parent documents and derive projections with explicit precedence. Reference them through bounded decision evidence bases; do not add unbounded evidence arrays to invocation rows or invent one global evidence sequence.

### 3. Reconciliation is bounded, but not protected or exposure-aware

The one-minute cron calls one reconciliation action ([cron](convex/crons.ts#L5-L12)). A sweep admits at most 25 total items, uses up to 45 seconds, and expired authorization work consumes capacity before ordinary reconciliation ([worker](convex/capabilityOperationInvocationWorker.ts#L41-L138)). Cases move to manual review after a fixed attempt ceiling ([finish](convex/capabilityOperationInvocations.ts#L282-L313)).

This is good bounded operational hygiene, but it does not prioritize by amount, unknown value-seconds, legal/evidence deadline, shared dependency, or forecast work. It has no separately reserved provider/rail query budget, batch-resolution strategy, or admission feedback.

**Correction:** keep measuring age, starvation, query quota, and exposure. Create protected reconciliation capacity and exposure-aware indexed scheduling before scaling dispatch or automatic Operation selection only if those measures approach the safe envelope.

### 4. One ordinary workpool remains a coupling risk

Market dispatch owns 32 of 100 noted global slots and retries actions by default ([workpool](convex/marketDispatchWorkpool.ts#L5-L10)). Canonical fences make release safer than the generic retry setting suggests, but this configuration must not become the correctness model. Cleanup/maintenance and paid dispatch should not compete with safety work, and generic action retry must never decide effect retryability.

**Correction:** state machine decides retry; safety/recovery gets separate capacity and quotas; provider/rail/principal bulkheads limit ordinary dispatch.

### 5. Delegation is strong but not a general nested DAG

Current grants bind principal, owner, application, credential, environment, policy, budgets/rates, lifecycle, generation, digest, and expiry ([grant schema](src/modules/agent-access/internal/convex-schema.ts#L37-L83)). Accepted invocation authority records approve-each, standing mandate use, customer-request mandate use, and public capability use ([accepted authority](src/modules/action-invocation/internal/convex-schema.ts#L79-L125)). This is substantial.

It is not yet a durable general user→organization→orchestrator→sub-agent delegation graph with provable multidimensional attenuation, revocation propagation, nested key generation, and data-purpose/rail/fallback constraints.

**Correction:** extend current mandate strengths; do not replace them with a generic identity-token layer.

### 6. Receipts collapse rail and finality dimensions

The canonical receipt currently fixes Base mainnet (`eip155:8453`) and the Base USDC contract and presents `settled | refunded | reconciliation_required` as the top-level state ([receipt schema](src/modules/capability-execution/internal/convex-schema.ts#L56-L74)). This is appropriate for the current x402 start line but cannot be the long-term protocol-neutral truth.

**Correction:** preserve the v1 x402 truth now. Add a versioned finality vector and compatibility projection when a second real external rail creates dimensions the current receipt cannot represent honestly; do not break the proven path to generalize prematurely.

### 7. No clearing/netting or production-to-twin policy lifecycle

The current schema has no clearing position/batch/default-waterfall state, and no causal trace export, simulator manifest, policy artifact registry, shadow decision, or promotion state.

**Correction:** clearing follows exact Operation/Invocation usage, accounting, and counterparty caps; the twin follows evidence semantics and exact execution-binding/optional-selection provenance after real tapes and a genuine policy choice exist. Product sequencing remains governed by [START_LINE.md](START_LINE.md) and [AGENT_COMMERCE_FLYWHEEL.md](AGENT_COMMERCE_FLYWHEEL.md), not this architecture comparison.

### 8. Economic proof is not yet present

Current safety mechanisms are necessary but may cost more per event than sub-cent prices can bear. No current evidence proves AE's per-use storage, compute, signing, reconciliation, customer support, capital, and rail costs at machine volume.

**Correction:** instrument full cost per contract-valid economically resolved delivery before promising fractional-cent viability. The architecture should support prepaid/session/batch economics, but price floors must come from measured costs. Agent-perceived value is a separate buyer-side input or attributed observation.

## Implementation roadmap: a trigger-gated architecture constitution

The HFT synthesis is an **architecture constitution**, not a product sequence or a command to build every mechanism. It does not supersede the current milestone in [START_LINE.md](START_LINE.md) or the selected post–start-line compounding direction in [AGENT_COMMERCE_FLYWHEEL.md](AGENT_COMMERCE_FLYWHEEL.md). Its invariants apply immediately: exact Operation identity, bounded authority, material idempotency, a durable release fence, durable unknown outcomes, balanced money consequences, and effect-free replay. Larger modules and scheduling topologies are options activated by evidence.

The current release-fence/idempotency/durable-unknown/ledger nucleus may be sufficient at low flow with one live external rail. A universal evidence lattice, generalized exposure coordinator, protected scheduling split, rail abstraction, or causal twin would add operational cost before it has a job.

| Observed trigger | Add or deepen | Do not prebuild |
|---|---|---|
| Multiple independent evidence sources, overtaking/contradiction, or a real as-of policy decision | Decision-scoped evidence envelope/precedence module and `DecisionEvidenceBasis` | Universal global evidence sequence or speculative source taxonomy |
| Automatic AE choice among multiple Operations | `OperationSelection` provenance in capability supply, with bounded candidates/rejections and policy basis | One-candidate selection records for caller-supplied `operationRef` |
| Reconciliation age, starvation, query-quota contention, or unknown exposure threatens the measured envelope | Reserved reconciliation capacity, indexed priority, admission feedback, and batch/source resolution | Separate workpools and schedulers solely for architectural symmetry |
| Correlated unknown exposure is measured across principals, Providers, custody, facilitators, rails, or dependencies | Cross-owner exposure views/permits and, only if deep enough, a shared admission interface | A global risk engine or hot total-order coordinator |
| A second real external rail introduces different submission/status/finality/refund semantics | Versioned finality v2 and the smallest evidenced rail seam | Registry/adapters for hypothetical rails |
| Nested delegation is demanded by a real actor chain current standing mandates cannot express | Extend standing-mandate and accepted-authority attenuation/path semantics | Parallel generic delegation domain |
| Per-use settlement cost or repeated counterparty flow makes batching economically necessary | Session/bilateral clearing from exact Qualified Use and Money facts | Credit or multilateral clearing before legal, margin, and default proof |
| Real production tapes exist and AE must choose between admission/selection policies | Non-authoritative causal twin and governed shadow/canary lifecycle | Simulator-driven permission or synthetic optimization before data |
| Measured hot keys, cross-region demand, or source contention exceed the current kernel | Hierarchical permits and partitioned safety work | Premature global distribution |

Before any Convex code change, read `convex/_generated/ai/guidelines.md` as required by the repository. The sections below specify trigger-gated constitutional options and proof gates; no application code was changed by this study.

### Stage 0 — finish the current start line

Keep direct `operationRef` invocation and the current x402 path.

**Files to preserve and instrument**

- `src/modules/action-invocation/canonical-claim.ts`
- `src/modules/capability-execution/invocation-worker/runPreparation.ts`
- `src/modules/capability-execution/invocation-worker/runRelease.ts`
- `src/modules/money/internal/external-spend.ts`
- `convex/capabilityOperationInvocationWorker.ts`
- `convex/marketDispatchWorkpool.ts`

**Add only stage telemetry**

- durable acceptance, queue, fence, provider, knowledge, settlement and resolution clocks;
- unknown value/value-seconds and reconciliation work units;
- provider, facilitator, custody, rail, asset, chain, region, and dependency labels;
- cost per invocation stage and contract-valid economically resolved delivery.

**Proof gate**

- one hosted real-funds x402 discovery→price→authority→release→Contract-Valid Delivery→settlement receipt journey;
- crash/timeout/retry cases prove no duplicate release or charge;
- every unknown remains queryable and owned;
- exact cost of the journey is measured, not estimated from provider price alone.

### P0 — causal truth, invocation provenance, and protected safety

Implement each item below only when its trigger in the table above is present. Preserve the stated invariant and observability before then.

#### P0.1 Evidence lattice

**Trigger:** multiple sources, overtaking/contradiction, or a real as-of decision can no longer be reconstructed from existing Operation/readiness/authority/evidence facts.

**New modules**

- `src/modules/evidence/contracts.ts`
- `src/modules/evidence/precedence.ts`
- `src/modules/evidence/as-of.ts`
- `src/modules/evidence/internal/convex-schema.ts`
- `convex/evidence.ts`

**Integrations**

- add tables through `convex/schema.ts`;
- ingest transport observations from `src/modules/capability-supply/internal/route-transport-observation.ts`;
- ingest x402 payment/facilitator events from `convex/moneyX402PaymentAttempts.ts`, `convex/moneyX402PaymentObservation.ts`, and related shared modules;
- ingest recovery evidence from `src/modules/capability-execution/invocation-worker/recover.ts`;
- add evidence/projection refs—not raw growing arrays—to action invocation and observability.

**Migration**

- additive insert-once table; no rewrite of existing canonical histories;
- backfill legacy events as `legacy_projection` evidence with honest missing clock/source fields;
- store migration provenance as a bounded decision/evidence basis and do not invent remote occurrence time.

**Tests/proof gate**

- `tests/unit/convex/evidence-envelope-dedup.test.ts`
- `tests/unit/convex/evidence-conflict-retention.test.ts`
- `tests/unit/convex/evidence-as-of-decision-basis.test.ts`
- same source identity/same digest is idempotent;
- same identity/different digest persists conflict;
- later evidence is unavailable to earlier decision replay;
- bounded-query/document-size tests pass.

#### P0.2 Exact Operation invocation provenance and invariant hardening

**Trigger:** additive tests reveal a reconstruction/material-binding gap, or a change to admission/dispatch threatens the current exact binding. The tests are cheap constitutional proof; a new aggregate is never implied.

Deepen existing modules; add no top-level aggregate:

- keep the serialized `PublishedOperation` snapshot authoritative in `src/modules/capability-execution/internal/convex-schema.ts`;
- make the Operation material digest, accepted-authority decision/target digests, Attempt/effect-generation identity, provider connection lease/generation, and external-spend identity explicitly traceable from one Invocation;
- harden `src/modules/capability-execution/operation-invoke-admit.ts`, `src/modules/action-invocation/canonical-claim.ts`, `convex/capabilityOperationInvocationIdentity.ts`, preparation/release, and `src/modules/money/internal/external-spend.ts` so a material mismatch fails closed;
- attach a bounded `DecisionEvidenceBasis` reference/digest where the existing snapshot and authority fields do not already make the consumed facts reconstructible.

No migration should fabricate a selection or claim record. Existing invocations retain their stored Operation/authority/effect/payment facts; mark any genuinely missing provenance honestly.

**Tests/proof gate**

- `tests/unit/capability-execution/operation-invocation-material-idempotency.test.ts`
- `tests/unit/capability-execution/operation-snapshot-exactness.test.ts`
- `tests/unit/capability-execution/operation-authority-target-digest.test.ts`
- `tests/unit/action-invocation/post-fence-operation-non-substitution.test.ts`
- `tests/unit/money/external-spend-operation-linkage.test.ts`
- a changed Operation snapshot/provider/payee/rail/amount/input under one idempotency identity conflicts;
- after possible release, a different Operation cannot be substituted automatically;
- policy rollback does not alter old Invocation/Attempt bindings.

#### P0.3 Epistemic exposure and simple permits

**Trigger:** measured unknown value/value-seconds, correlated dependency exposure, or reconciliation work can exceed an existing owner's safe envelope.

Deepen the modules that already own the relevant constraints:

- `agent-access` owns principal/credential/grant budgets, rates, concurrency, generation, and expiry;
- `action-invocation` owns authority-use reservation, Attempt release uncertainty, and reconciliation-required state;
- provider-connection/capability-supply ownership tracks Provider/Binding readiness, lease, operator, region, and dependency evidence;
- `money` owns reserved, possibly submitted, unknown, settled, released, reversed, rail/asset/custody/facilitator exposure.

Add conservative aggregate exposure indexes/permits through those seams and check them during money admission, preparation, and immediately before the fence. Extract a shared risk module only when repeated policy has become deep enough to hide behind a small stable interface; do not mandate a global coordinator or table now.

**Migration**

- begin with conservative static caps, count/value/value-seconds, and observed reconciliation work;
- no learned capital pricing or hierarchical permits yet.

**Tests/proof gate**

- `tests/unit/convex/unknown-exposure-retained.test.ts`
- `tests/unit/convex/exposure-correlated-dependency.test.ts`
- `tests/unit/convex/exposure-permit-before-fence.test.ts`
- unknown external spend continues consuming exposure until evidence-backed resolution;
- shared custody/rail cap trips despite provider diversity;
- replay reconstructs identical exposure.

#### P0.4 Protected reconciliation capacity

**Trigger:** reconciliation age/starvation, safety query-quota contention, or forecast unknown exposure approaches its SLO/cap under load.

**New/changed modules**

- create `convex/reconciliationWorkpool.ts`;
- split expiry, effect/payment resolution, refund/reversal, and maintenance scheduling in `convex/crons.ts`;
- extend `convex/capabilityOperationInvocations.ts` with bounded indexed priority buckets;
- extend `convex/capabilityOperationInvocationWorker.ts` with value/age/deadline/systemic/work-unit scheduling;
- add source/provider/rail query quotas reserved for safety work.

**Migration**

- drain existing automatic cases into the new queue idempotently;
- preserve attempt counts and next-attempt times;
- do not reset manual cases or reinterpret timeout as non-release.

**Tests/proof gate**

- `tests/unit/convex/reconciliation-safety-capacity.test.ts`
- `tests/unit/convex/reconciliation-value-age-priority.test.ts`
- `tests/unit/convex/reconciliation-query-quota-reserve.test.ts`
- saturating new dispatch cannot starve S0/S1;
- stale reconciliation owner cannot resolve newer case;
- admission closes before forecast safety age/exposure breach.

#### P0.5 Rail-neutral finality v2

**Trigger:** a second real external rail creates finality/refund/reversal semantics the current x402 receipt cannot represent honestly.

Keep this as a versioned contract/projection improvement inside the existing capability-execution and x402/economic-rail ownership. Do not extract a new top-level payment-rail abstraction until a second real external rail creates actual behavioral variation.

**Files**

- extend `src/modules/capability-execution/internal/convex-schema.ts`;
- add v2 contracts in `src/modules/capability-execution/operation-invoke-contracts.ts`;
- update `src/modules/capability-execution/invocation-receipt-view.ts`;
- keep v1 Base/USDC projection for compatibility.

**Tests/proof gate**

- `tests/unit/convex/finality-vector-projection.test.ts`
- receipt never claims settlement when effect/delivery/payment/rail state is required and unknown;
- v1 clients retain current behavior for existing x402 transactions;
- reversals/refunds append state and accounting, not rewrite history.

### P1 — extensible mandates, optional Operation selection, evidenced rail seams, and bilateral clearing

#### P1.1 Durable mandate DAG

**Trigger:** a real nested actor chain cannot be expressed safely by current standing mandates and accepted authority.

Extend `src/modules/action-invocation/standing-mandate.ts`, its validation/policy/grant support, and the existing accepted-authority representation first. Add parent/path digests, multidimensional attenuation, nested key generation, revoke-generation propagation, and reserve/consume/release/uncertain-use transitions without creating a parallel generic delegation domain. Bind the accepted root/path digest into `convex/capabilityOperationInvocationIdentity.ts`. Extract a dedicated module only if this implementation develops a deep independent model and stable interface.

**Proof gate:** property tests prove child constraints never widen parent across money, count, effect, provider/payee, data, jurisdiction, rail, expiry, fallback, or subdelegation. Revocation racing a possible release leaves the use uncertain and exposed.

#### P1.2 Optional Operation selector

**Trigger:** AE deliberately takes responsibility for choosing among candidate Operations after the start line.

Build on:

- `src/modules/capability-supply/internal/operation-search.ts`
- `src/modules/capability-supply/internal/operation-detail-compare.ts`
- existing contract/effect/data-use projections.

Deepen capability-supply ownership with Operation-focused components such as semantic equivalence, hard gates, decomposed contribution, abstention, and selection alongside existing search/compare projections. Keep direct `operationRef` invocation as the primary deterministic path, not an escape hatch. Create an `OperationSelection` record only when AE actually chooses among candidates; persist bounded candidate/rejection facts before handing one exact `operationRef` to normal invocation admission.

**Proof gate:** no candidate crosses hard semantic/authority/privacy/compliance gates; stale evidence increases uncertainty or fails closed; Operation substitution after possible release is impossible; shadow selections are reproducible from their decision evidence bases.

#### P1.3 Rail abstraction

**Trigger:** the second real external rail demonstrates actual variation after P0.5.

First deepen the proven x402/economic-rail implementation in `src/modules/capability-supply/internal/route-transport-x402*.ts` and `src/modules/capability-execution/invocation-worker/x402*.ts`, together with the versioned finality contract. When a second real external rail creates actual differences in submission, status, evidence, finality, refund, fees, or dependencies, extract the smallest shared rail seam and adapters for the variations that now exist. Do not prebuild a registry around hypothetical internal, batch/session, card, and net-settlement adapters.

**Proof gate:** each adapter declares idempotency scope, status/evidence/finality/refund/fee/dependency semantics; timeout cannot map directly to failure; all rails project the same versioned finality vector without erasing rail-specific evidence.

#### P1.4 Bilateral clearing, prefunded first

**Trigger:** measured repeated-counterparty flow and per-settlement cost justify batching, with legal/margin/default analysis complete.

Create:

- `src/modules/clearing/contracts.ts`
- `src/modules/clearing/net-position.ts`
- `src/modules/clearing/batch.ts`
- `src/modules/clearing/margin.ts`
- `src/modules/clearing/default-waterfall.ts`
- `src/modules/clearing/internal/convex-schema.ts`
- `convex/clearing.ts`

Consume existing qualified-use receipts and money-ledger entries as source truth. Begin one counterparty/one asset/prefunded or tightly collateralized.

**Proof gate:** batch root/totals reproduce from leaves; submission is fenced; unknown settlement remains exposed; default cannot affect another counterparty/epoch; adjustments append; legal/compliance sign-off exists.

#### P1.5 Dependency graph and capacity permits

**Trigger:** production evidence shows common dependencies or capacity contention that Provider/Binding-level limits cannot contain.

Extend provider/binding schemas with versioned idempotency/evidence/status/capacity declarations. Project provider→operator→custody→facilitator→rail→issuer/chain→region dependencies. Add signed, expiring capacity quotes and bounded permits only for enforceable service classes.

**Proof gate:** nominally diverse Operations/providers sharing a dependency hit the common cap; status/refund quota remains reserved; self-reported capacity alone cannot raise an Operation above its observed/enforced ceiling.

### P2 — closed-loop twin and governed policy promotion

**Trigger:** real production tapes exist and AE has at least two consequential admission or Operation-selection policies worth comparing.

Create `eval/agent-payments-twin/`:

- `events.ts`, `scheduler.ts`, `world.ts`, `knowledge.ts`;
- `provider-models.ts`, `rail-models.ts`, `agent-models.ts`, `dependency-models.ts`;
- `invariants.ts`, `economics.ts`, `regimes.ts`, `manifest.ts`;
- `calibration.ts`, `holdouts.ts`, `minimize-failure.ts`.

Add:

- `convex/economicTraceExport.ts` for privacy-controlled causal export;
- policy artifact registry and promotion state;
- shadow Operation selections and bounded canaries;
- production calibration monitoring and demotion.

The export and twin consume exact persisted Operation/Invocation/Attempt, evidence, Qualified Use, receipt, and Money facts. They do not create alternative production identities, infer missing execution choices, or gain authority over live state.

**Proof gate:** deterministic hashes for identical manifests; zero hard invariant violations; adversarial/holdout pass; no hindsight leakage; censored outcomes retained; shadow calibration acceptable; canary bounded by value/consequence/provider/rail; rollback leaves existing exact Operation/Invocation bindings intact.

### P3 — measured machine-scale distribution

Only after telemetry proves need:

- hierarchical risk permits to relieve hot budget keys;
- regional/source-partitioned reconciliation with global dependency caps;
- cross-region recovery and jurisdictional data boundaries;
- adaptive capacity procurement and clearing-interval/session-deposit optimization;
- multilateral clearing after bilateral default/margin/legal proof;
- lower-level runtime optimization if local control, rather than provider/finality/reconciliation, is the measured bottleneck.

**Proof gate:** load ramps to an explicit admission boundary; queues remain bounded; safety oldest age/value remains inside stress SLO; no global serialization hot key; correlated failure is contained; regional recovery preserves evidence and ledger invariants; unit economics remain positive at the marketed minimum price.

## Defensible advantage

Wire protocols will remain plural and will not be the moat. AE's defensible asset can be the **causal economic graph**:

```text
semantic intent
-> delegated authority chain
-> candidates and rejected alternatives
-> evidence available at decision time
-> optional Operation selection
-> exact Operation snapshot, Invocation/Attempt and payment/dependency binding
-> provider effect and declared delivery conformance
-> payment, settlement, reversal and dispute
-> reconciliation work and capital time
-> source-attributed Agent Evaluation and Continuation Evidence
```

This can compound into:

1. **Evidence-adjusted Operation selection:** when AE selects, optimize contract-valid economically resolved delivery against the agent's declared value, after ambiguity, invalid output, reversal, and recovery cost.
2. **Epistemic liquidity:** stronger status/evidence releases capital and safety capacity sooner.
3. **Cross-protocol authority portability:** conservatively compile AP2/VI/ACP/network/x402/MPP artifacts without flattening semantics.
4. **Machine-scale risk pricing:** attribute unknown and correlated-dependency costs to Operations, providers, rails, and shared dependencies.
5. **Counterfactual policy governance:** compare decisions without hindsight leakage before real money control.
6. **Provider incentives:** reward evidence, idempotency, status, privacy, and reconciliation quality—not only price/latency.
7. **Low-cost dispute automation:** exact Operation/Invocation, authority, effect, payment, evidence, and finality lineage makes sub-dollar resolution possible without human work per case.

The moat is not “fast payments,” nor a platform claim to know which Provider answer is best. It is knowing, without hindsight leakage, which exact Operation under which bounded authority and payment conditions is likely to produce a contract-valid, economically resolved delivery for an agent-declared objective—and having a kernel that can act without unbounded downside.

## Risks and open questions

1. **Legal role:** Does AE become money transmitter, custodian, merchant of record, marketplace operator, payment facilitator, clearing agent, or credit provider under each design/geography?
2. **Economic floor:** What are measured database, signing, storage, reconciliation, support, reserve, and rail costs per contract-valid economically resolved delivery at target volume?
3. **Declared verification:** Which Operation classes can name an objective verifier in their contract, and where must Agent Evaluation, Provider claims, and dispute evidence remain source-attributed?
4. **Mandate interpretation:** How are unknown/custom constraints attenuated across heterogeneous protocol artifacts without unsafe widening?
5. **Privacy versus evidence:** What minimum lineage can survive erasure while satisfying financial, tax, sanctions, and dispute retention?
6. **Unknown dependencies:** How can AE infer shared provider infrastructure without coercive disclosure or excessive false concentration?
7. **Provider incentives:** Can capacity/evidence promises be made enforceable at microtransaction values without contracts costing more than the flow?
8. **Clearing default:** Who supplies margin, absorbs tail loss, and has legal authority to net obligations?
9. **Stablecoin/card asymmetry:** How should irreversible transfer and reversible consumer recourse coexist in one receipt and payment/selection policy?
10. **Agent accountability:** Who bears loss when a validly delegated agent is manipulated, misaligned, or compromised?
11. **Model risk:** How will AE detect Operation-selection-policy drift when selection changes the sample used to estimate delivery conformance, reliability, and source-attributed Agent Evaluation?
12. **Fairness/market power:** Can evidence-adjusted Operation selection avoid entrenching incumbents with more historical data while protecting buyers from unsafe exploration?
13. **Human tail:** What case value/legal/systemic threshold justifies manual review, and who pays?
14. **Global limits:** How are enterprise/root exposure caps enforced across regions without a global hot key or unsafe permit duplication?

## Skeptical validation corrections

This final pass makes the following corrections to attractive but overstrong interpretations:

1. **Traffic:** automation-majority measurements do not prove autonomous-agent or economic-agent majority. The latter is a capacity scenario and likely direction.
2. **HFT label:** neither pinned repository proves production HFT wire latency. Architecture and code paths are evidence; marketing/category labels are not.
3. **Nautilus durability:** asynchronous event capture is not committed-before-effect journaling.
4. **hftbacktest determinism:** exact replay proves reproducibility under the model, not realism or safety.
5. **Exactly once:** only local material transition/application can be exactly-once. External provider/payment effects remain uncertain across partitions.
6. **One owner:** deterministic mutation does not justify a global event loop, sequence, ledger lock, mandate row, or evidence watermark.
7. **Reconciliation:** a separate worker is insufficient without reserved capacity, query quota, admission feedback, batch resolution, and economic treatment of low-value cases.
8. **Risk pricing:** uncertainty charges are a useful accounting frame, not a calibrated fact. Begin with conservative caps and measured work/loss.
9. **Automatic selection:** adding a scorer before decision-basis provenance, evidence, and reconciliation would create opaque automated risk. Direct exact-`operationRef` invocation remains primary.
10. **Auctions:** provider capacity is not exchange depth; auctions are narrow procurement tools, not the universal Operation selector.
11. **Micropayments:** per-use authorization does not imply per-use rail settlement or full per-use storage. Sessions, balances, manifests, and clearing are economic necessities at sufficiently small values.
12. **Receipts:** payment success, service acceptance, economic finality, refundability, and legal resolution are distinct.
13. **Identity:** keys, Agent Cards, wallets, and network tokens authenticate artifacts; they do not prove aligned intent or legal responsibility end-to-end.
14. **Diversification:** provider count is not dependency diversity. Unknown common infrastructure must be stress-tested and conservatively capped.
15. **Privacy:** immutable evidence cannot mean universal plaintext retention. Purpose limitation, selective disclosure, encryption, and erasure-aware design are mandatory.
16. **Twin promotion:** simulated outperformance never relaxes production invariants; live shadow/calibration and bounded canary remain required.

## Primary source index

### Pinned NautilusTrader

- [Pinned repository tree](https://github.com/nautechsystems/nautilus_trader/tree/13559f053a376bbbd4bdd765cdefe2a635f893e7)
- [Order transition table](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/model/src/orders/mod.rs#L204-L298)
- [Order event application checks](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/model/src/orders/mod.rs#L819-L935)
- [Execution client resolver](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/execution/src/engine/mod.rs#L2033-L2063)
- [Write-once order origin](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/common/src/cache/mod.rs#L4672-L4736)
- [Risk submit gate](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/risk/src/engine/mod.rs#L580-L653)
- [Live unbounded channels](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/runner.rs#L149-L257)
- [Startup reconciliation](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/node/mod.rs#L389-L467)
- [Event-store writer behavior](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/event_store/src/writer/mod.rs#L264-L300)
- [State-only replay](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/event_store/src/replay.rs#L16-L21)

### Pinned hftbacktest

- [Pinned repository tree](https://github.com/nkaz001/hftbacktest/tree/5f3ec40b2afb764e0fea112f941ed85523ef4e88)
- [Event dual clocks](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/types.rs#L311-L333)
- [Order and status types](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/types.rs#L385-L620)
- [Latency model interface](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/latency.rs#L13-L104)
- [Four-slot event scheduler](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/evs.rs#L17-L89)
- [Backtest event loop](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L755-L863)
- [Order bus and forced delivery order](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/order.rs#L9-L69)
- [No-market-impact assumption](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/docs/order_fill.rst#L8-L18)
- [Live dual-source order join](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/binancefutures/ordermanager.rs#L29-L48)
- [Live one-sided terminal GC](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/binancefutures/ordermanager.rs#L278-L307)

### Traffic, protocols, and standards

- [Thales 2026 Bad Bot Report](https://www.imperva.com/resources/reports/2026-Thales-Bad-Bot-Report.pdf)
- [Thales AI bot traffic analysis](https://www.imperva.com/blog/ai-bot-traffic-which-bots-to-trust/)
- [Cloudflare 2026 agentic-Internet report](https://blog.cloudflare.com/agentic-internet-bot-report/)
- [A2A 1.0 specification](https://a2a-protocol.org/latest/specification/)
- [UCP specification](https://ucp.dev/latest/specification/overview/)
- [AP2 0.2 specification](https://ap2-protocol.org/ap2/specification/)
- [ACP repository](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)
- [ACP checkout](https://developers.openai.com/commerce/specs/checkout) and [delegated payment](https://developers.openai.com/commerce/specs/payment)
- [Visa Trusted Agent Protocol](https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications) and [Visa Intelligent Commerce](https://developer.visa.com/capabilities/visa-intelligent-commerce)
- [Mastercard Verifiable Intent](https://verifiableintent.dev/spec/) and [Agent Pay for Machines](https://www.mastercard.com/us/en/business/artificial-intelligence/mastercard-agent-pay/agent-pay-for-machines.html)
- [x402 Foundation](https://www.x402.org/), [flow/batching](https://docs.cdp.coinbase.com/x402/core-concepts/how-it-works), and [networks](https://docs.cdp.coinbase.com/x402/network-support)
- [Machine Payments Protocol](https://mpp.dev/protocol), [IETF Internet-Draft](https://datatracker.ietf.org/doc/draft-ryan-httpauth-payment/), and [Tempo session](https://mpp.dev/payment-methods/tempo/session)
- [Cloudflare Pay Per Crawl](https://developers.cloudflare.com/ai-crawl-control/features/pay-per-crawl/) and [Monetization Gateway announcement](https://blog.cloudflare.com/monetization-gateway/)
- [FIDO agentic authentication/payments working groups](https://fidoalliance.org/fido-alliance-to-develop-standards-for-trusted-ai-agent-interactions/)

## Final verdict

NautilusTrader should influence AE's **production conservatism**: typed state, materially bound identity, risk before release, immutable operational origin, reconciliation, and effect-free recovery.

hftbacktest should influence AE's **epistemic honesty**: remote occurrence separated from local knowledge, deterministic causal scheduling, explicit delay/failure seams, and counterfactual policy evaluation without future evidence.

Neither should dictate AE's topology. Both centralize too much, bind execution too statically for future selection, and assume a more standardized and observable world than agent commerce. Agentic payments require per-identity serialization, exact Operations, extensible mandates, multiple finality dimensions, bounded unknown exposure, protected reconciliation, evidence-driven optional selection, clearing, privacy/compliance constraints, and endogenous-agent/provider simulation.

The constitutional implementation sequence, when the corresponding triggers fire, is therefore:

1. prove and preserve the exact-Operation x402 kernel;
2. harden decision-scoped evidence/provenance around the existing exact binding, unknown exposure, finality, and reconciliation only where measured gaps require it;
3. extend mandates, add `OperationSelection` only when AE actually selects, extract a rail seam only from real variation, and add tightly bounded clearing only when economics justify it;
4. build the non-authoritative twin only from real production tapes when AE has policies worth choosing between;
5. distribute permits, reconciliation, and clearing only when measured contention proves the need.

This sequence is conditional architecture, not a replacement for the product sequence governed by [START_LINE.md](START_LINE.md) and [AGENT_COMMERCE_FLYWHEEL.md](AGENT_COMMERCE_FLYWHEEL.md).

The deepest lesson from HFT is not speed. It is that when actions are fast, external truth is delayed, and mistakes compound automatically, **state, causality, exposure, and recovery must be designed before optimization**. In a machine-majority payment scenario, the scarce resource is not the ability to emit another transaction. It is the ability to know what was authorized, what may already have happened, what remains economically exposed, and what can still be resolved without creating the next duplicate effect.

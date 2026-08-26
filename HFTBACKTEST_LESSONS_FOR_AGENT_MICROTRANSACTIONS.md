# hftbacktest lessons for Agentic Economy microtransactions

## Executive verdict

`hftbacktest` is valuable to Agentic Economy (AE) primarily as a **simulation architecture**, not as production HFT infrastructure. Its distinctive contribution is a two-view causal model: an exchange-side processor advances the simulated authoritative world at `exch_ts`, while a local-side processor exposes the same feed and order outcomes only at `local_ts`. Strategy decisions therefore use what the strategy could have known, not future exchange truth.

That maps unusually well to agent microtransactions. A provider or payment rail may complete an effect at time T while AE learns about it through a response, webhook, chain receipt, or reconciliation query much later. Routing, retries, cancellation, settlement, and user-visible status during that gap must be based on AE's **durably accepted knowledge**, not eventual remote truth.

The recommended transfer is therefore:

1. **Adopt** the split between remote occurrence and local knowledge, the discrete-event replay pattern, and replaceable latency/uncertainty models.
2. **Adapt** the local/exchange state split into a deterministic microtransaction digital twin containing remote provider/payment truth and AE's delayed projection.
3. **Reject** the trading-specific queue formulas, FIFO assumptions, no-impact replay, forced in-order request bus, static `asset_no` routing, volatile live IPC, and connector recovery behavior.
4. **Keep production changes small at first:** correct timestamp semantics, normalize evidence provenance, record lifecycle stages, and actively acquire reconciliation evidence. Put the full event kernel and failure injection in evaluation tooling, not in the request path.

AE already has stronger real-money safety primitives than the inspected project: durable attempt/effect identities, a release fence before provider I/O, explicit `possibly_released` and `outcome_unknown` states, exact external-spend identity, held money, and reconciliation ownership. The high-leverage next step is to prove those controls across delayed, duplicated, reordered, dropped, stale, and contradictory observations.

**Verified** below means directly traced in the pinned source or current AE workspace. **Inference** means a design consequence or recommendation. Nothing in this report treats `hftbacktest` as proof of production HFT latency, resilience, or routing quality.

## Pinned source and method

- Upstream: [`nkaz001/hftbacktest`](https://github.com/nkaz001/hftbacktest).
- Pinned revision: [`5f3ec40b2afb764e0fea112f941ed85523ef4e88`](https://github.com/nkaz001/hftbacktest/tree/5f3ec40b2afb764e0fea112f941ed85523ef4e88).
- Clone inspected at `/tmp/hftbacktest-study.acpvKv/repo`; `git rev-parse HEAD` matched the revision above.
- Sequential research inputs reviewed: `/tmp/hftbacktest-study.acpvKv/pass1-architecture-map.md`, `pass2-hft-routing-performance-resilience.md`, and `pass3-agent-microtransaction-translation.md`.
- Method: trace event ingestion, scheduler ordering, local/exchange state, request/response transit, queue/fill and latency models, multi-asset behavior, live IPC/connectors, recovery, persistence, tests, and performance evidence; then compare those mechanisms with current AE invocation, supply, money, reconciliation, workpool, market-evidence, and routing surfaces.
- Verification boundary: the study was static. A Rust toolchain was not available in the study environment, so upstream tests were not executed. Potential correctness issues are explicitly labeled as **test concerns**, not established bugs.

## Concise actual architecture

```text
historical normalized event chunks (.npy/.npz)
                   |
          shared Reader per asset
             /             \
            v               v
 exchange-side processor   local-side processor
  - exchange-time book      - delayed strategy book
  - queue/fill model         - local order view
  - simulated remote P&L     - strategy-visible P&L
            ^               ^
            | request bus   | response bus
            +-------+-------+
                    |
      one single-threaded discrete-event loop
      slots per asset: local data, local order,
                       exchange data, exchange order
                    |
          Rust Bot API / Python-Numba facade

Separate experimental live path:
Rust LiveBot <-> iceoryx2 shared-memory IPC <-> connector process
                                                -> exchange REST/WebSocket
```

**Verified.** The Cargo workspace contains the core `hftbacktest` library, a derive macro, the PyO3/Numba facade, collectors, and the connector executable ([workspace members](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/Cargo.toml#L1-L8)).

**Verified.** Each L2 asset constructs two independent depths and accounting states, a shared bidirectional order bus, a local processor, and an exchange processor ([L2 asset construction](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L253-L337)). The same reader is cloned so each side advances through the source independently, and a `Backtest` owns one local/exchange pair per asset ([multi-asset construction](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L566-L609)).

**Verified.** `Event` is a 64-byte-aligned row with independent exchange/local visibility flags and both `exch_ts` and `local_ts` ([event flags](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/types.rs#L184-L189), [event record](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/types.rs#L311-L333)).

**Verified.** `EventSet` holds four timestamps per asset and linearly scans them for the minimum. Strict `<` comparison makes equal-time priority implicit: lower asset number first, then local data, local response, exchange data, exchange order ([scheduler representation and selection](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/evs.rs#L17-L63)). The kernel dispatches one selected processor at a time ([event loop](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L755-L863)).

**Verified.** Strategy submission directly names `asset_no`; there is no candidate discovery or route scorer in the path ([order submission](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L921-L1008)). In live mode, each instrument similarly stores one connector name and symbol ([live instrument binding](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/live/mod.rs#L15-L56)).

## Simulation fidelity

### What is genuinely strong

**Verified.** Feed latency and order latency are separated. Market events expose remote and local timestamps, while `LatencyModel` independently supplies order entry and response delay ([latency interface and constant model](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/latency.rs#L13-L55)). Historical request/exchange/response observations can be interpolated through `IntpOrderLatency` ([historical latency rows](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/latency.rs#L57-L104), [interpolation path](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/latency.rs#L170-L273)).

**Verified.** L2 queue uncertainty is behind a model interface. The conservative model advances only on trades; the probability-named model allocates level reductions through a configurable curve ([queue interface and conservative model](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/queue.rs#L24-L96), [probability model](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/queue.rs#L98-L217)). The latter is deterministic; it computes a fractional estimate and does not draw random samples.

**Verified.** L3 replay reconstructs price-time FIFO when stable order IDs and a compatible feed are available, while the source explicitly warns that venues may use pro-rata or other rules ([L3 FIFO scope](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/queue.rs#L473-L489)).

**Inference.** These seams are excellent for sensitivity analysis: compare conservative, empirical, and optimistic assumptions without pretending one model is truth.

### Hard fidelity limits

**Verified.** Historical market state is exogenous. Simulated orders cannot change future depth or trades; the documentation says orders should be small enough to have no market impact ([no-impact assumption](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/docs/order_fill.rst#L8-L18)). Taker fills may therefore be unrealistic; `NoPartialFillExchange` can fill all marketable quantity at best regardless of displayed size ([documented fill behavior](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/docs/order_fill.rst#L40-L44)).

**Verified.** Partial-fill mode still cannot consume historical depth. Marketable GTC remainder is forcibly filled at the limit because it cannot remain in the replayed opposite book, and market orders search an arbitrary 100-tick range marked TODO ([buy-side boundary](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/proc/partialfillexchange.rs#L453-L516), [sell-side boundary](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/proc/partialfillexchange.rs#L581-L647)). L3 partial-fill construction is unimplemented ([L3 builder boundary](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L530-L547)).

**Verified.** Replay correctness depends on normalized input order. `Reader` documents that files should be chronological but does not enforce chronology ([reader contract](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/data/reader.rs#L269-L291)). A Python validator checks monotonic exchange and local streams, but it is an optional utility rather than mandatory ingestion ([validation helper](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/py-hftbacktest/hftbacktest/data/validation.py#L139-L152)).

**Inference.** For AE, a no-impact world tape is insufficient. Provider calls can consume capacity or inventory, create state, trigger rate limits, alter balance, and change later availability. The digital twin must evolve remote state endogenously.

## Routing, performance, resilience, and live limitations

### Routing

**Verified.** Multi-asset/multi-exchange backtesting means heterogeneous preconfigured asset slots feeding one scheduler; it is not smart routing. Every order already names its asset, and live instruments already name their connector.

**Inference.** AE should retain post-decision pinning but evaluate selection separately. A route policy should choose using contract compatibility, authority, price, evidence freshness, capacity, unknown-outcome exposure, and economics. Once release is possible, it must not silently fail over.

### Performance

**Verified.** Performance-aware choices include compact aligned event rows, a contiguous timestamp array, unchecked indexed hot paths, optimized release settings, one-chunk preloading, Rust simulation, and a Numba/Python facade. The release profile enables optimization level 3, LTO, one codegen unit, and abort-on-panic ([release profile](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/Cargo.toml#L29-L38)); the reader can preload the next chunk ([reader prefetch](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/data/reader.rs#L346-L380)).

**Verified.** Scheduler work is O(asset count) per dispatched event, simulation state mutation is single-threaded, and loading—not simulation—is the threaded portion. This can be fast for a small fixed research universe but does not establish multi-core scale, bounded latency, or production jitter.

**Verified.** The pinned tree contains no checked-in benchmark suite or end-to-end connector latency evidence. Its roadmap still lists broader test coverage/workflows and differentiated order latency classes as unfinished ([roadmap](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/ROADMAP.md#L22-L23), [test-coverage roadmap](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/ROADMAP.md#L54-L56)).

**Inference.** This source supports a claim of a performance-conscious replay engine, not production HFT throughput, p99/p999 latency, or capacity.

### Resilience and live scope

**Verified.** The connector README cautions users, identifies Binance Futures as testnet-tested and Bybit as under development, and requires bot and connector to share a host ([connector status and topology](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/README.md#L7-L16), [same-host IPC](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/README.md#L34-L45)).

**Verified.** Connector events fan into an unbounded Tokio channel, one publisher owns in-memory books/positions, and order/feed updates are broadcast to all bots ([unbounded queue and publisher](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/main.rs#L23-L31), [publisher state and broadcast](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/main.rs#L117-L202)). A child panic terminates the process, and several top-level results are unwrapped ([failure coupling](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/main.rs#L334-L443)).

**Verified.** The Binance order manager thoughtfully joins unordered REST and WebSocket terminal updates, but correlation maps are in memory and one-sided terminal state is garbage-collected after five minutes ([dual-source join](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/binancefutures/ordermanager.rs#L29-L48), [volatile correlation](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/binancefutures/ordermanager.rs#L247-L269), [five-minute GC](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/binancefutures/ordermanager.rs#L278-L307)). Submit failures are projected to `Expired` rather than first reconciling by the generated client order ID ([submit-failure path](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/binancefutures/ordermanager.rs#L111-L139)).

**Inference.** The REST/WebSocket convergence idea is transferable, but it must become a durable, tenant-scoped evidence join. The live implementation is not a durable OMS, multi-tenant router, or financial control plane and should not be copied into AE.

## Adopt, adapt, or reject

| hftbacktest pattern | Decision | AE meaning |
|---|---|---|
| Remote occurrence time distinct from local observation time | **Adopt** | Store asserted/verified occurrence separately from ingress, durable acceptance, application, and client observation. |
| Separate remote and local state processors | **Adapt** | Twin owns provider/payment truth and a delayed AE projection; production retains durable canonical state plus evidence. |
| One explainable discrete-event loop | **Adopt for evaluation** | Replay provider, payment, webhook, reconciliation, queue, crash, and client-observation events with explicit tie order. |
| Replaceable latency and queue-model interfaces | **Adapt** | Plug in provider, signer, rail, webhook, reconciliation, load, and failure-regime models; do not reuse market formulas. |
| Conservative versus optimistic model variants | **Adopt** | Report sensitivity bands and tail outcomes rather than one falsely precise forecast. |
| Timestamp-aware multi-source fusion | **Adapt** | Prefer signed source version/event ID and evidence strength; use time only after provenance/sequence. |
| REST + WebSocket dual-confirmation join | **Adapt** | Durable provider/payment inbox, exact identity, cumulative facts, no uncertainty-destroying GC. |
| Stable scheduler input tape | **Adopt with stronger contract** | Persist tape digest, schema, seed, sequence, configuration, code revision, and transition hashes. |
| Static `asset_no` / one connector per instrument | **Reject as routing** | Evaluate candidate routes before dispatch, persist choice, and pin retries/reconciliation afterward. |
| Trading queue-position curves and FIFO matching | **Reject** | Provider capacity is not an order book; use measured service/queue models and tenant policy. |
| No-impact historical replay | **Reject** | Calls can mutate provider state, consume budget/capacity, and affect later observations. |
| Forced in-order request/response bus | **Reject** | Simulate overtaking, duplicate delivery, late acknowledgements, and retry races. |
| Implicit equal-time priority | **Reject** | Name, version, and test a stable priority contract. |
| Unordered map/set traversal in replay truth | **Reject** | Sort emitted work or assign stable sequences before scheduling. |
| Volatile shared-memory IPC and unbounded publisher queue | **Reject** | Use durable inbox/outbox, bounded capacity, admission outcomes, and bulkheads. |
| Cancel/delete uncertainty on reconnect/timeout | **Reject** | Freeze new release where necessary, actively query remote truth, retain unresolved ownership. |

## Unique relevance compared with the NautilusTrader study

The existing NautilusTrader report answers a different question. Together they are complementary:

| Question | NautilusTrader's stronger lesson | hftbacktest's unique lesson |
|---|---|---|
| What should production runtime state look like? | Explicit lifecycle, write-once origin, reconciliation, state replay without side-effect replay. | Not its strength; live connector is experimental and volatile. |
| How should work be isolated? | Bounded safety lanes, bulkheads, fencing, immutable route claims. | Supplies failure patterns to inject, not a production isolation design. |
| How should route policies be evaluated? | Allocation before pinned dispatch. | Replay every policy against the same remote-world tape and delayed knowledge tape. |
| How should time be represented? | Runtime event/order lifecycle timestamps. | Makes remote occurrence versus local visibility the central causal abstraction. |
| How should uncertainty be studied? | Reconciliation and unknown-state ownership. | Replaceable latency/queue assumptions, counterfactual replay, sensitivity across models. |
| What does “fast” mean for AE? | Durable acceptance and economic finality, not microseconds. | Decompose latency and quantify what decisions knew at each point. |

**Inference.** Nautilus is the better reference for production state-machine discipline. `hftbacktest` is the better reference for an epistemically honest evaluation harness. The latter should test the former's AE translation.

## Authoritative occurrence versus local observation/knowledge

In a backtest, exchange time is authoritative **inside the simulator**. In real agent commerce, a provider timestamp is usually an assertion, not automatically authoritative. AE should distinguish remote-world time, evidence time, and knowledge time:

| Clock | Meaning | Decision trust |
|---|---|---|
| `sourceOccurredAt` | Provider/rail assertion of when the remote effect or fact occurred. | Untrusted until authenticated/corroborated; retain clock-error interval. |
| `verifiedOccurredAt` | Occurrence/inclusion time supported by signed receipt, chain evidence, or authoritative query. | Stronger, but still accompanied by verification method and finality. |
| `sourceEmittedAt` | Source assertion of when it emitted response/webhook/receipt. | Useful for source-side delay, not decision availability. |
| `gatewayReceivedAt` | First AE ingress receipt of bytes. | AE-controlled wall clock; evidence is still not durable. |
| `durablyAcceptedAt` | Normalized evidence committed idempotently to AE storage. | First safe default time at which a policy may know the evidence. |
| `appliedAt` | Evidence changed the canonical projection. | Measures projection lag and records transition order. |
| `clientObservedAt` | Caller received the projected state. | Measures user/agent visibility, not system knowledge. |
| `scheduledKnowledgeAt` | Simulator-only time when an observation becomes available to the AE policy. | Drives the knowledge queue. |
| `ingestSequence` | Stable simulator/durable-ingress tie breaker. | Makes same-time ordering reproducible. |

Knowledge rule:

```text
evidence is policy-visible at decision D only if
  evidence.durablyAcceptedAt <= D
  AND evidence verification/policy permits its use
```

Conflict rule:

```text
source epoch/version/sequence
  > signature or verification strength
  > causal relation
  > verified occurrence time
  > asserted occurrence time
  > stable ingest sequence
```

Arrival order must not overwrite a newer or stronger fact, and source time alone must not decide conflicts when clocks can skew. Contradictory evidence should be retained as evidence, not erased by projection.

### Current AE evidence

**Verified.** AE's invocation attempt/history records have strong identities and release/outcome states, but primarily one `recordedAt` plus occasional `observedAt` (`src/modules/action-invocation/internal/convex-schema.ts:178-217`). Reconciliation evidence likewise has a single `observedAt` (`src/modules/capability-execution/internal/convex-schema.ts:85-110`). External-spend and x402 records preserve exact transaction identity and several lifecycle timestamps, but not a general source-occurrence/receipt/durable-acceptance/application envelope (`src/modules/money/internal/convex-schema.ts:131-265`).

**Verified.** `RouteTransportObservation` captures disposition, release/payment status, digests, receipt, proof, and continuation material but no event ID/version or clocks (`src/modules/capability-supply/internal/route-transport-observation.ts:9-28`).

**Verified.** The readiness probe captures `now` before target validation, credential resolution, and network execution, then passes that same number into the result (`src/modules/capability-supply/internal/readiness-probe.ts:27-116`). `healthy`/`unhealthy` call it `observedAt` and calculate TTL from it (`src/modules/capability-supply/internal/readiness-probe-shared.ts:151-186`). This is a current semantic defect: for network probes, `observedAt` is probe start, not completed observation.

## Minimal production timestamp and evidence changes

These changes are deliberately smaller than the digital twin.

1. **Fix readiness semantics.** Add `probeStartedAt` and `probeCompletedAt`; stamp completion after the outcome is known and derive `validUntil` from completion. Keep `observedAt` temporarily as a compatibility projection of completion. Files: `src/modules/capability-supply/internal/readiness-probe.ts`, `readiness-probe-shared.ts`, HTTP/MCP/x402 probe commands, and readiness tests.
2. **Create one normalized evidence envelope.** Add a shared type such as `src/modules/common/evidence-envelope.ts` carrying `sourceEventId`, source epoch/version/sequence, asserted/verified occurrence, source emission, gateway receipt, durable acceptance, application, evidence strength, payload digest, and provenance. Extend `RouteTransportObservation` and reconciliation evidence first (`src/modules/capability-supply/internal/route-transport-observation.ts:9-28`; `src/modules/capability-execution/internal/convex-schema.ts:85-110`).
3. **Persist before projection.** Add durable provider/payment evidence inbox rows keyed by `(source, sourceEventId, sourceVersion)` with same-ID/different-digest treated as a security conflict. Link inbox refs into invocation history and money evidence rather than copying unbounded payloads. Relevant authorities: `src/modules/action-invocation/internal/convex-schema.ts:196-217` and `src/modules/money/internal/convex-schema.ts:131-265`.
4. **Record stage events append-only.** Add admitted, enqueued, claimed, prepared, release-fenced, request-started, first-response, provider-occurrence-asserted, payment-submitted, settlement-observed, reconciliation-started, and resolved timestamps. Avoid widening the hot mutable invocation row with every metric; an append-only lifecycle event table can project current metrics. Current invocation rows expose mostly `createdAt`/`updatedAt` (`src/modules/capability-execution/internal/convex-schema.ts:170-205`).
5. **Actively obtain reconciliation evidence.** Scheduled reconciliation currently uses `mode: 'status'` (`convex/capabilityOperationInvocationWorker.ts:143-188`), and that mode only reads durable local status (`src/modules/capability-execution/invocation-worker/recover.ts:147-168`). The rich reconciliation path verifies supplied provider/payment evidence and chain receipts (`src/modules/capability-execution/invocation-worker/recover.ts:468-705`), but the ordinary sweep does not acquire it. Add bounded provider status, webhook-inbox, facilitator, and chain-evidence adapters; failure to acquire evidence must never imply safe retry.

## Deterministic microtransaction digital twin

### Scope and structure

Create an isolated evaluation package, not a production runtime dependency:

```text
eval/microtransaction-twin/
  event.ts
  clocks.ts
  kernel.ts
  state.ts
  replay.ts
  invariants.ts
  metrics.ts
  manifest.ts
  policies/
  models/
    latency.ts
    failure-regime.ts
    queues.ts
    provider.ts
    payment-rail.ts
    signer.ts
    webhook.ts
    reconciliation.ts
  scenarios/
tests/simulation/
```

The kernel owns two state spaces:

- **remote truth:** what providers, signers, payment rails, and external ledgers have actually done;
- **AE knowledge:** facts that have been durably accepted and are valid for policy use.

An event may mutate remote truth and schedule zero or more later observations. Route, retry, cancel, hold-release, and reconciliation policies read only AE knowledge. An oracle may inspect remote truth solely to calculate regret.

### Event schema

```ts
type SimEvent = Readonly<{
  schemaVersion: 1
  eventId: string
  runId: string
  scenarioId: string
  kind:
    | 'invocation_arrived' | 'route_decided' | 'attempt_claimed'
    | 'release_fenced' | 'request_sent' | 'provider_effect_occurred'
    | 'response_emitted' | 'response_received'
    | 'webhook_emitted' | 'webhook_received'
    | 'payment_prepared' | 'payment_submitted'
    | 'payment_included' | 'payment_finalized' | 'payment_reversed'
    | 'evidence_durably_accepted' | 'evidence_applied'
    | 'reconciliation_due' | 'reconciliation_queried'
    | 'queue_entered' | 'queue_left' | 'hold_changed'
    | 'partition_started' | 'partition_ended' | 'worker_crashed'

  tenantId: string
  principalId?: string
  invocationRef?: string
  attemptRef?: string
  effectGeneration?: number
  routeRef?: string
  providerRef?: string
  rail?: string
  paymentIdentifier?: string

  correlationId?: string
  causationId?: string
  sourceEventId?: string
  sourceEpoch?: string
  sourceSequence?: string

  sourceOccurredAt?: number
  verifiedOccurredAt?: number
  sourceEmittedAt?: number
  gatewayReceivedAt?: number
  durablyAcceptedAt?: number
  appliedAt?: number
  scheduledKnowledgeAt: number
  ingestSequence: number

  modelRef?: string
  uncertainty?: {
    sourceClockErrorMs?: readonly [number, number]
    occurrenceWindowMs?: readonly [number, number]
    evidenceStrength?: 'asserted' | 'signed' | 'ledger_verified'
  }
  payloadDigest: string
  payload: unknown
  provenance: { source: string; transport?: string; configDigest: string }
}>
```

Queue events by:

```text
(scheduledKnowledgeAt, kindPriority, ingestSequence, eventId)
```

`kindPriority` must be named and versioned. A reasonable same-time causal order is crash/partition boundary, remote occurrence, ingress receipt, durable acceptance, projection application, timer/expiry, policy decision, then client observation. The exact order matters less than specifying and testing it.

### State machines

Project independent, linked state machines rather than one ambiguous status.

```text
INVOCATION / EFFECT

ARRIVED -> ADMITTED -> ROUTE_DECIDED -> AUTHORIZED -> ENQUEUED
        -> CLAIMED -> PREPARED -> RELEASE_FENCED(possibly_released)
        -> REQUEST_SENT
             |-> VALID_RESULT -> COMPLETED
             |-> DEFINITELY_NOT_RELEASED -> RETRYABLE_SAFE
             |-> RELEASED_INVALID_RESULT -> COMPENSATION_REQUIRED
             `-> OUTCOME_UNKNOWN -> RECONCILIATION_REQUIRED

RECONCILIATION_REQUIRED
  -> VERIFIED_NOT_RELEASED -> RETRYABLE_SAFE(new attempt/effect generation)
  -> VERIFIED_RELEASED -> delivery/payment/accounting convergence
  -> INCONCLUSIVE -> backoff -> MANUAL_REVIEW

Cancellation before fence -> CANCELLED_SAFE
Cancellation after fence  -> RECONCILIATION_REQUIRED
```

```text
PAYMENT / MONEY

NOT_RESERVED -> RESERVED -> AUTHORIZATION_PREPARED
             -> POSSIBLY_SUBMITTED
             -> INCLUDED -> FINALIZED -> ACCOUNTED
             |             |             `-> REFUND/REVERSAL/LOSS
             |             `-> REVERTED
             `-> OUTCOME_UNKNOWN -> RECONCILED_SETTLED
                                  -> RECONCILED_NOT_SETTLED
                                  -> MANUAL_REVIEW
```

Also model provider remote truth (`not_seen`, `queued`, `executed`, `refused`, `cancelled`, `result_retained`), evidence knowledge/conflicts, route snapshots, capacity queues, network regimes, and economics independently.

### Seeded randomness and exact replay

- Derive independent streams from `(rootSeed, modelName, entityRef)`. Adding an unrelated sample must not perturb every later outcome.
- Persist the PRNG algorithm/version, root seed, scenario/config digest, code revision, model versions, and input-tape digest.
- Generate the remote-world tape once, derive the observation tape once, then compare all policies against those identical tapes.
- Sort map/set-derived work before event emission.
- Hash normalized inputs and every transition; persist final and rolling hashes.
- On invariant failure, retain the seed, manifest, and smallest event prefix after shrinking.
- Use many seeds for distributional claims. One deterministic run is a regression fixture, not evidence of a probability.

`hftbacktest` itself does not provide seeded stochastic queue sampling; its probability curves are deterministic. Its scheduler is deterministic at slot selection, but some fill paths iterate hash-backed collections ([hash-map fill traversal](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/proc/nopartialfillexchange.rs#L242-L310), [hash-set queue cleanup](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/queue.rs#L497-L525)). AE's twin should be stricter.

### Latency and uncertainty models

Model each stage separately:

1. dispatch admission and queue wait;
2. lease/credential/authority acquisition;
3. payment challenge acquisition;
4. signer claim and signing;
5. release-fence commit;
6. request transit;
7. provider queue and execution;
8. response transit, loss, duplicate, and reorder;
9. webhook emission and ingress;
10. rail inclusion, finality, reversal, and RPC disagreement;
11. reconciliation queue, query, and resolution;
12. client polling/notification observation.

Key models by provider, operation, region, rail, custody mode, signer, payload-size class, load regime, retry number, and outcome where evidence permits. Start with empirical histograms plus explicit timeout/loss atoms. Add correlated regimes—healthy, degraded, rate-limited, one-way partitioned, recovering—because provider response, webhook, and reconciliation failures are not independent.

Represent uncertain occurrence as an interval/distribution plus provenance, not a fabricated point. Preserve heavy tails and deployment/outage boundaries rather than smoothing through them with linear interpolation.

### Routing under stale information

AE search currently ranks lexical relevance with a deterministic operation-ref tie break (`src/modules/capability-supply/internal/operation-search.ts:40-88`). Invocation admits an exact `operationRef` (`src/modules/capability-execution/operation-invoke-admit.ts:184-203`), and release rechecks the exact current published material before sending (`src/modules/capability-execution/invocation-worker/runRelease.ts:299-321`). This is good pinning, not yet policy-aware allocation.

For every route decision, snapshot:

- candidate set and hard rejection codes;
- operation/publication/binding/price digests;
- authority decision and expiry;
- readiness/evidence IDs, source versions, strength, and age;
- provider/signer/rail queue estimates and unknown exposure;
- policy/model version and route-decision digest.

Compare policies over the same knowledge tape:

- current exact-operation selection;
- cheapest eligible;
- lowest measured tail latency;
- freshness-weighted health;
- capacity-aware;
- unknown-risk-adjusted expected contribution;
- conservative abstain/ask-user.

Report regret against an oracle that sees remote truth, but never use that oracle to select a production route. After a release fence or ambiguous send, no policy may fail over to another provider unless evidence proves the first effect was not released.

### Queues, backpressure, and failure injection

Model explicit queues for dispatch, provider leases, signing, provider execution, webhook ingress, payment RPC, ledger application, and reconciliation. For each, configure:

- arrivals: steady, Poisson, burst, hot tenant, synchronized TTL expiry;
- service time and parallelism;
- finite capacity and admission result;
- tenant/provider/rail fairness and reserved safety capacity;
- queue deadline and authority/readiness/payment expiry while waiting;
- retry budget and retry amplification;
- crash points before/after every durable boundary;
- delay, drop, duplicate, reorder, partition, and recovery burst.

Current AE dispatch uses one 32-parallel workpool with generic retries (`convex/marketDispatchWorkpool.ts:5-10`). Scheduled reconciliation runs every minute (`convex/crons.ts:7-12`), selects at most 25 total expiry/reconciliation candidates, processes them serially, and stops starting work after 45 seconds (`convex/capabilityOperationInvocationWorker.ts:41-42`, `convex/capabilityOperationInvocationWorker.ts:79-202`). Lease/backoff/manual-review controls are explicit (`convex/capabilityOperationInvocations.ts:47-51`, `convex/capabilityOperationInvocations.ts:191-313`).

Use the twin to determine whether separate pools are necessary. The invariant is the outcome, not a predetermined topology: ordinary dispatch must not starve authorization expiry, money evidence, ledger finalization, or unknown-outcome reconciliation beyond their SLO.

### Initial scenario corpus

| Scenario | Injected condition | Expected result |
|---|---|---|
| Baseline | Healthy provider and rail | One effect, one settlement, balanced accounting. |
| Effect then lost response | Provider executes; response disappears | No blind resend; unknown is owned; reconciliation converges. |
| Signed submit returns 402 | Payment release began; provider challenges again | No altered-material retry; reconcile. |
| Duplicate webhook/receipt | Same source event delivered repeatedly | One evidence/ledger consequence. |
| Finality before provider response | Strong payment evidence arrives first | Monotonic convergence; weaker late response cannot regress. |
| Stale healthy route | Provider fails after last health observation | Policy sees only stale health and records its age. |
| Delayed recovery observation | Provider recovers before AE learns | Measure conservative-route regret. |
| One-way provider partition | Effect can occur but response cannot return | No post-fence cross-provider failover. |
| Retry overtakes original | First request delayed, retry faster | Identity/fence prevents duplicate effect or surfaces ambiguity. |
| Signer saturation | Authorization expires in signing queue | No expired authorization release; clean compensation. |
| Dispatch burst | Authority/readiness expires while queued | Revalidate at release; bounded admission. |
| Reconciliation starvation | Ordinary work saturates capacity | Safety work stays within explicit age bound. |
| Crash sweep | Crash immediately before/after every transition | Replay converges without duplicate remote effect. |
| Lease takeover | Owner stalls past lease | New owner respects exact attempt/effect identity. |
| RPC disagreement/reorg | Settlement sources conflict or regress | Evidence stays owned until policy threshold/manual review. |
| Correlated outage | Provider, webhook, and RPC degrade together | Tail unknown duration is not understated. |
| Invalid output after settlement | Payment settles; output schema/digest fails | Preserve payment/effect evidence; compensation/loss is explicit. |
| Provider 429 | Rate limit plus delayed health update | Bounded backoff; no retry storm. |
| Clock skew | Provider time leads/lags AE | Source sequence and evidence strength beat naive timestamp. |
| Same ID, different digest | Conflicting external event reuse | Security incident; no projection overwrite. |

Existing tests are good deterministic seeds: signed-submit-then-402 and lost-response paths (`tests/unit/capability-supply/route-transport-x402.test.ts:185-257`, `tests/unit/capability-supply/route-transport-x402.test.ts:841-906`), timeout/late-result handling (`tests/unit/action-invocation/in-memory-action-invocation.test.ts:510-605`), durable release-fence history (`tests/integration/capability-operation-workpool.test.ts:330-377`), unknown money holds and authoritative reconciliation (`tests/integration/money-external-spend.test.ts:266-317`), and lease/backoff/deadline behavior (`tests/unit/convex/capability-operation-worker-reconcile.test.ts:160-415`).

### Required invariants

1. At most one irreversible release per `(invocationRef, attemptRef, effectGeneration)`.
2. Once release may have started, automatic recovery never blindly resends the effect.
3. One idempotency identity always binds to the same operation, provider, authority, amount, and signed material.
4. Duplicate evidence is a no-op after first valid application; same ID/different digest is rejected and retained.
5. Older or weaker evidence cannot roll a definitive projection backward.
6. Settled, refunded, reversed, and lost money produces balanced, exactly-once ledger consequences.
7. Every hold is resolved or visibly owned as unknown; it never silently disappears.
8. A dropped response after remote execution resolves automatically or remains reconciliation-owned within the horizon.
9. A route policy reads no evidence durably accepted after its decision.
10. No post-fence failover creates an effect on a second provider.
11. Crash and exact replay at every transition boundary yields the same projection, ledger, and transition hash.
12. Ordinary saturation cannot starve expiry, money evidence, or unknown reconciliation past its bound.
13. Authority, readiness, price, and payment expiry are revalidated immediately before irreversible release.
14. Contradictory evidence remains attributable; projection conflict never destroys source facts.

### Metrics and economics

| Dimension | Metrics |
|---|---|
| Safety | irreversible effects per generation; duplicate settlement attempts; post-fence failovers; invariant failures. |
| Knowledge | occurrence-to-receipt, receipt-to-durable, durable-to-apply; evidence age at decision; contradiction duration. |
| Latency | stage p50/p95/p99; deadline success; terminal latency; unknown-to-resolution latency. |
| Routing | completion, refusal, unknown, abstention, provider concentration, snapshot age, oracle regret. |
| Capacity | queue depth/age, admission, expiry-in-queue, retry amplification, safety-lane starvation. |
| Money | hold-seconds/value-seconds, settlement/refund/reversal/loss, reconciliation calls, rail/signing/RPC cost. |
| Resilience | partition recovery, automatic/manual resolution, duplicate/drop/reorder tolerance. |
| Reproducibility | replay hash match, manifest completeness, failing-seed shrink size, nondeterministic transition count. |

Evaluate route economics over many seeds:

```text
expected contribution
= buyer revenue + platform fee
- provider payout
- payment/signing/RPC/storage cost
- expected refund, reversal, fraud, and loss
- reconciliation and support cost
- capital-time cost of outcome_unknown holds
- deadline-miss or stale-result penalty
```

Report expected value with p5/p50/p95, loss probability, CVaR/tail loss, completion-by-deadline, unknown probability/duration, hold-value-seconds, reconciliation calls, and total cost per useful success. Current pricing defaults to a 10% platform fee (`src/modules/money/internal/pricing-config.ts:37-61`), while market evidence retains at most 48 recent completion durations and projects median/p95 only after a small minimum sample (`convex/marketListingEvidence.ts:144-177`; `src/modules/market/listing-evidence.ts:84-110`). Those aggregate durations do not yet price unknown outcomes, capital held, correlated failure, or reconciliation work.

## Staged implementation roadmap

### P0 — establish causal truth and deterministic safety parity

1. **Evidence clock contract.** Add `src/modules/common/evidence-envelope.ts`; define field semantics, provenance/strength precedence, stable source identity, and compatibility projection rules. Wire types first into `src/modules/capability-supply/internal/route-transport-observation.ts` and `src/modules/capability-execution/internal/convex-schema.ts`.
2. **Readiness clock correction.** Change `src/modules/capability-supply/internal/readiness-probe.ts` and `readiness-probe-shared.ts` so completion, not start, becomes `observedAt`/TTL basis. Update `tests/unit/capability-supply/readiness-probe-*.test.ts` with delayed-send assertions.
3. **Twin skeleton.** Add `eval/microtransaction-twin/{event,clocks,kernel,state,replay,manifest,invariants,metrics}.ts` and `tests/simulation/`. Implement explicit equal-time order, rolling transition hashes, and exact replay before stochastic models.
4. **Safety parity fixtures.** Port the existing x402 lost-response, post-submit 402, timeout/late result, release-fence, unknown-hold, and reconciliation-lease cases into world/knowledge tapes. The twin must reproduce current outcomes before testing new policies.
5. **Core invariants.** Add property generators for crash boundary, duplicate, reorder, drop, delay, and partition; shrink to a minimal tape and retain the replay manifest.

P0 exit: identical manifest/tape produces identical transition hashes; current AE safety fixtures pass in both runtime tests and the twin; readiness TTL has correct completion semantics.

### P1 — durable evidence, calibrated stages, and active reconciliation

1. **Provider/payment evidence inbox.** Extend `src/modules/action-invocation/internal/convex-schema.ts` and/or add a bounded evidence module with insert-once source identity/digest, clocks, provenance, verification, and links to invocation/money rows. Extend `src/modules/money/internal/convex-schema.ts` with evidence refs/clocks rather than raw unbounded payload copies.
2. **Lifecycle stage events.** Add an append-only timing table alongside `src/modules/capability-execution/internal/convex-schema.ts`; instrument admission, workpool enqueue/claim, preparation, release fence, send, observation, settlement, and reconciliation in `src/modules/capability-execution/invocation-worker/runPreparation.ts`, `runRelease.ts`, and `recover.ts`.
3. **Active reconciliation acquisition.** Replace ordinary local-only scheduled status checks with bounded provider/payment/chain queries in `src/modules/capability-execution/invocation-worker/recover.ts` and `convex/capabilityOperationInvocationWorker.ts`. Keep current leases, retry budget, and manual ownership.
4. **Stage-model export.** Extend `convex/marketEvidence.ts`, `convex/marketListingEvidence.ts`, and `src/modules/market/listing-evidence.ts` to expose sanitized aggregate stage distributions/regime labels—not sensitive payloads or only total duration.
5. **Stochastic models.** Add independent seeded provider, signer, rail, webhook, queue, reconciliation, and correlated-failure-regime models. Validate with holdout windows and explicit uncertainty bands.

P1 exit: ordinary unknowns can acquire evidence actively; every critical stage has durable/projection timing; models can be replayed and their calibration error is reported.

### P2 — evidence-driven routing and capacity design

1. **Counterfactual route evaluator.** Add policies under `eval/microtransaction-twin/policies/`; compare them on the same world/knowledge tapes and publish safety, latency, capacity, and economic metrics.
2. **Immutable route-decision record.** Implement allocation ownership in the currently empty `src/modules/routing-kernel/` boundary. Persist candidate set, hard rejection codes, evidence age/strength, capacity/unknown exposure, selected exact Operation/binding/price/authority, policy version, expiry, and digest. Keep direct exact-`operationRef` invocation supported.
3. **Protected capacity justified by experiments.** Sweep dispatch/reconciliation pool sizes, provider/custody/rail bulkheads, queue limits, TTLs, and backoffs. Change `convex/marketDispatchWorkpool.ts`, `convex/capabilityOperationInvocationWorker.ts`, and `convex/crons.ts` only when experiments show the present SLO cannot hold.
4. **Unknown-exposure admission.** Add per-principal/provider/custody/rail caps by count and value, with explicit defer/refuse/manual-review results, using the money reservation identities in `src/modules/money/internal/convex-schema.ts:131-265`.
5. **Operational review.** Publish replay manifest, calibration version, policy version, route-decision digest, queue-age SLOs, unknown exposure, and reconciliation backlog to operator observability without exposing provider credentials or payment material.

P2 exit: route-policy changes require twin safety parity and economic improvement under holdout traces; runtime routing is immutable after release and safety work has a measured starvation bound.

## Risks and open questions

- **Provider time is not exchange time.** Which providers expose signed event IDs, sequence/version, execution time, and status query APIs? Where they do not, occurrence must remain an interval/assertion.
- **Durable acceptance clock.** It should be assigned at the committing mutation, not passed from an earlier action. The implementation must document its relationship to database creation/transaction time.
- **Evidence retention and privacy.** What raw evidence is legally/operationally necessary, how long is it retained, and which payloads should be reduced to digests plus encrypted references?
- **Provider idempotency.** Which providers enforce a stable idempotency key across retries and regions? Without it, post-timeout safety relies more heavily on query/reconciliation.
- **Calibration bias.** Current successful-call latency samples omit timeouts, manual-review cases, rejected admissions, and possibly correlated outages. Models must represent censoring and missingness.
- **Correlated infrastructure.** Provider, webhook, facilitator, RPC, DNS, and AE execution may share a region or dependency. Independence assumptions would understate tails.
- **Economic constants.** Reconciliation labor, support, capital-time cost, deadline value, reversal loss, and provider concentration need explicit owners and sensitivity ranges.
- **Simulation scale.** Start with a simple priority queue. Partition only after profiling; deterministic causality is more important than copying the upstream flat scan or prematurely building distributed simulation.
- **Liveness horizon.** Some effects may never become externally provable. AE needs a policy for indefinite unknown, accounting loss, refund, and human ownership without rewriting history.
- **Route authority.** When a route change modifies price, provider, effect, data use, or jurisdiction, which authority artifacts must be reacquired?

## Skeptical validation and corrections

1. **“Deterministic” is qualified.** Equal-time scheduler slot selection is deterministic, but the priority is implicit and hash-backed fill traversal can vary within an event. No replay-hash guarantee was found.
2. **“Probability queue” is not stochastic.** The supplied L2 probability functions deterministically allocate a quantity change; there is no seed, sampling distribution, or calibration framework in the core model.
3. **“Multi-exchange” is not smart routing.** It means multiple preconfigured asset/exchange-model slots merged into one simulation. Orders select `asset_no` directly.
4. **“High performance” is not bounded production latency.** Source-level optimizations are credible, but no checked-in throughput/tail-latency benchmark or wire-to-venue measurement supports an HFT infrastructure claim.
5. **“Live” is experimental.** The connector's own documentation warns users and labels venue readiness narrowly. It has volatile state, same-host IPC, unbounded fan-in, and process-wide failure coupling.
6. **Partial-fill accounting needs a focused test.** Exchange-side code applies each fill and emits `PartiallyFilled`/`Filled` responses ([fill implementation](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/proc/partialfillexchange.rs#L208-L244)). Local accounting applies only a response whose status is exactly `Filled` ([local response accounting](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/proc/local.rs#L76-L135)), while `exec_qty` is the current execution field and is overwritten on update ([order execution fields](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/types.rs#L488-L525), [order update](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/types.rs#L584-L620)). This **appears capable of omitting intermediate partial fills from local P&L/position**, but is not called a proven bug without a multi-fill lifecycle test.
7. **Latency interpolation has unproven edge risks.** Empty data is indexed at first use and duplicate sample timestamps reach an unguarded interpolation denominator ([interpolation implementation](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/latency.rs#L145-L172)). Cross-chunk entry/response cursor interaction also deserves focused tests. These are concerns, not dynamically reproduced defects.
8. **The order-correction helper needs a terminal-boundary test.** It indexes exchange/local arrays before checking cursor bounds inside its loop ([correction loop](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/py-hftbacktest/hftbacktest/data/validation.py#L72-L136)). Do not rely on it without a focused empty/one-sided/exhaustion test.
9. **Bybit execution price conversion is a source concern.** Both execution handlers divide execution price by `price_tick` rather than `tick_size`, which appears dimensionally inconsistent ([Bybit order manager](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/bybit/ordermanager.rs#L64-L92)). The connector is already labeled under development; this should be covered by a unit test before being called a confirmed defect.
10. **AE readiness timing is directly established.** Unlike the upstream concerns above, the current AE code visibly captures start time and later labels it observation time. That semantic correction is safe to prioritize independently of the simulator.

## Source index

### hftbacktest pinned source

- [Event flags and event clocks](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/types.rs#L184-L189)
- [Discrete-event slot scheduler](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/evs.rs#L17-L89)
- [Backtest event loop](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L755-L863)
- [Forced in-order request/response bus](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/order.rs#L25-L46)
- [Latency models](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/latency.rs#L13-L104)
- [L2 queue models](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/queue.rs#L24-L217)
- [L3 FIFO scope](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/models/queue.rs#L455-L489)
- [No-impact/fill assumptions](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/docs/order_fill.rst#L8-L18)
- [Multi-asset builder](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L566-L609)
- [Static order target](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/hftbacktest/src/backtest/mod.rs#L921-L1008)
- [Live connector warning](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/README.md#L7-L16)
- [Live connector fan-in/failure domain](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/connector/src/main.rs#L117-L202)
- [Roadmap/non-complete scope](https://github.com/nkaz001/hftbacktest/blob/5f3ec40b2afb764e0fea112f941ed85523ef4e88/ROADMAP.md#L22-L59)

### Current AE source

- Invocation attempt/history clocks and release states: `src/modules/action-invocation/internal/convex-schema.ts:16-78`, `:178-217`.
- Reconciliation evidence and invocation row: `src/modules/capability-execution/internal/convex-schema.ts:85-110`, `:170-205`.
- External spend and x402 attempt evidence: `src/modules/money/internal/convex-schema.ts:131-265`.
- Transport observation: `src/modules/capability-supply/internal/route-transport-observation.ts:9-28`.
- Readiness timing: `src/modules/capability-supply/internal/readiness-probe.ts:27-116`; `readiness-probe-shared.ts:151-186`.
- Exact publication revalidation and release fence: `src/modules/capability-execution/invocation-worker/runRelease.ts:299-321`, `:396-552`.
- Scheduled reconciliation behavior: `convex/capabilityOperationInvocationWorker.ts:41-42`, `:79-202`; `convex/capabilityOperationInvocations.ts:47-51`, `:191-313`; `convex/crons.ts:7-12`.
- Search and exact-operation admission: `src/modules/capability-supply/internal/operation-search.ts:40-88`; `src/modules/capability-execution/operation-invoke-admit.ts:184-203`.
- Current latency/economic evidence: `convex/marketListingEvidence.ts:144-177`; `src/modules/market/listing-evidence.ts:84-110`; `src/modules/money/internal/pricing-config.ts:37-61`.

## Bottom line

Use `hftbacktest` as a research laboratory and design vocabulary. Its best idea is epistemic: maintain what happened remotely and what the decision-maker could know as separate causal timelines. Its replay kernel, model seams, and local/exchange split are an excellent starting point for an AE microtransaction digital twin.

Do not infer production HFT quality from those strengths and do not copy its live connector. AE's runtime should continue to center durable identity, authority, money reservation, release fencing, unknown-state ownership, and active reconciliation. The twin's job is to expose where those controls fail under real timing and uncertainty—and to make routing and capacity changes earn their way into production with reproducible evidence.

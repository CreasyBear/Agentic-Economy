# NautilusTrader HFT lessons for Agentic Economy microtransactions

## Executive verdict

NautilusTrader is a useful reference for a **deterministic trading-state runtime**, but the inspected source does not establish a full production, bounded-latency HFT gateway. Its strongest transferable ideas are explicit lifecycle state, one authoritative mutation boundary, immutable order-origin claims, priority for safety-relevant work, reconciliation, and replay that rebuilds state without blindly replaying external effects. Its least transferable properties are a global owner loop, unbounded principal queues, static one-adapter routing, asynchronous audit persistence, and microbenchmarks that stop before a real venue round trip.

Agentic Economy (AE) should therefore adopt Nautilus's **state-machine discipline**, adapt its **route pinning and reconciliation**, and reject its **overload and durability boundaries**. AE already has the more important money-safety foundations: material idempotency, a durable invocation/attempt history, a committed-before-network release fence, explicit `possibly_released`/`outcome_unknown` states, exact external-spend identities, and append-oriented ledger facts. The next architecture should add:

1. a policy-aware semantic allocation step that persists an immutable route claim before authority and dispatch;
2. active provider/payment reconciliation rather than repeated local status reads;
3. bounded priority lanes and bulkheads per principal, provider, custody signer, and economic rail;
4. durable inbox/outbox records and monotonic fencing tokens at every worker/provider ownership boundary; and
5. stage-level latency and exposure SLOs that distinguish local control-plane delay from provider/payment finality.

The goal is not microsecond commerce. It is **fast durable acceptance, bounded local queueing, no blind duplicate effects, and explainable economic finality**.

## Pinned source and research method

- Upstream: [`nautechsystems/nautilus_trader`](https://github.com/nautechsystems/nautilus_trader).
- Verified commit: [`13559f053a376bbbd4bdd765cdefe2a635f893e7`](https://github.com/nautechsystems/nautilus_trader/tree/13559f053a376bbbd4bdd765cdefe2a635f893e7).
- Clone inspected at: `/tmp/nautilus-trader-study.epA74o/repo`; `git rev-parse HEAD` matched the commit above.
- Prior sequential passes reviewed: `/tmp/nautilus-trader-study.epA74o/pass1-architecture-map.md`, `pass2-hft-routing-performance-resilience.md`, and `pass3-agent-microtransaction-translation.md`.
- Method: trace executable source from strategy submission through risk, execution, adapters, event application, persistence, and reconciliation; inspect stress/benchmark boundaries; then compare those mechanics with AE's current invocation, money, routing, and workpool code. Claims below are marked **Verified** when directly implemented in source and **Inference** when they are a design consequence or recommendation.
- Scope caveat: no production deployment, hardware, network, or venue measurements were available. Repository prose describing Nautilus as “production-grade” is not treated as proof of production HFT wire-to-wire latency.

## Concise Nautilus runtime architecture

```text
async adapters / timers / persistence workers
                   |
                   v
       seven principal Tokio channels
       (unbounded in the live runner)
                   |
                   v
 one current-thread LiveNode owner loop
   - biased event selection
   - thread-local synchronous message bus
   - Rc<RefCell<_>> kernel components
                   |
     +-------------+-------------+
     |             |             |
 DataEngine    RiskEngine   ExecutionEngine
     |             |             |
     +------> Cache/Portfolio <---+
                                 |
                          execution adapter
                                 |
                       venue reports / recon
```

**Verified.** Live kernel state is owned on the node's current thread through `Rc<RefCell<_>>`; the thread-local bus makes those endpoints current-thread-only. Adapter, timer, and persistence work can run on a shared multithreaded Tokio runtime and enqueue work back to that owner. This is more precise than saying “Nautilus is single-threaded”: the **mutation kernel** is owner-threaded, while I/O producers are not. See the [kernel ownership model](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/system/src/kernel.rs#L16-L35), [kernel components](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/system/src/kernel.rs#L83-L120), [current-thread constraint](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/node/mod.rs#L939-L948), and [global multithreaded runtime](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/common/src/live/runtime.rs#L20-L95).

**Verified.** A normal live submit crosses strategy-to-risk and risk-to-execution deferred queues before adapter handoff; a normal cancel bypasses risk and enters execution directly. This is trading-specific fast-path shortening, not general workflow routing. See [strategy submit](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/trading/src/strategy/mod.rs#L179-L213), [strategy cancel](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/trading/src/strategy/mod.rs#L661-L690), and [risk-to-execution dispatch](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/risk/src/engine/mod.rs#L2217-L2230).

## HFT routing, performance, and resilience assessment

### Routing

**Verified.** Execution resolves one client by explicit client, cached account issuer, venue, then default. The resolver does not consult current connectivity, latency, fees, capacity, or health, and venue registration is effectively single-client. The cached order-to-client origin is write-once, so later actions remain pinned to the source adapter. See [resolver precedence](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/execution/src/engine/mod.rs#L2033-L2063), [venue registration](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/execution/src/engine/mod.rs#L550-L575), and [write-once origin claim](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/common/src/cache/mod.rs#L4672-L4736).

**Inference.** This is deterministic adapter dispatch, not smart order routing or transparent failover. The useful AE analogue is not “pick the fastest provider during send”; it is “persist the exact provider/contract/binding/price decision, then keep all retries, cancels, reconciliation, and receipts attached to that origin.”

### Performance and overload

**Verified.** The seven principal runner channels are unbounded. A biased `select!` checks execution events and commands ahead of data and yields after 64 dispatches, but cancel/modify/submit still share one execution-command FIFO and a running callback cannot be preempted. See [channel construction](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/runner.rs#L149-L257) and [priority/yield loop](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/node/mod.rs#L1679-L1807).

**Inference.** Execution-before-data reduces one starvation mode, but it creates no finite overload wait bound. Under sustained excess ingress, backlog becomes memory growth and tail latency. For AE, every provider, tenant, custody, and reconciliation boundary needs finite admission and an explicit outcome: accept, shed, expire-safe-before-release, retry-after, or manual review.

**Verified.** Python quote/trade/bar callbacks execute synchronously on the owner path. A slow callback delays later owner-loop work; the shown path has no timeout or isolation boundary. See [Python callback invocation](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/trading/src/python/strategy.rs#L1143-L1165).

### Resilience and recovery

**Verified.** Startup mass-status reconciliation is enabled by default and runs before trader startup. Continuous inflight reconciliation exists; periodic open-order and position checks default off unless configured. Fill and state checks are strong but scoped to trading state and in-memory reconciliation horizons, not a durable global exactly-once ledger. See [startup sequence](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/node/mod.rs#L389-L467), [continuous scheduling](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/node/mod.rs#L1624-L1647), and [reconciliation defaults](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/src/execution/manager.rs#L328-L357).

**Verified.** The event-store bus tap runs before subscriber fanout, but normal capture only enqueues to a bounded writer; durable acknowledgement is separate and batching defaults to 100 entries or 5 ms. Capture is therefore not a committed-before-send execution journal. Replay rebuilds state without replaying commands/adapters. See [writer defaults and acknowledgement boundary](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/event_store/src/writer/mod.rs#L48-L78), [enqueue versus durable high-water mark](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/event_store/src/writer/mod.rs#L264-L300), and [state-only replay](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/event_store/src/replay.rs#L16-L21).

**Verified.** Repository stress tests and microbenchmarks exercise synthetic runner/message-bus behavior, not risk-to-real-adapter-to-socket-to-venue-to-ack latency. See the [synthetic stress harness](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/tests/stress.rs#L16-L82), [runner benchmark boundary](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/live/benches/runner.rs#L274-L315), and [hot-loop bus benchmarks](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/common/benches/msgbus.rs#L396-L451).

## Adopt, adapt, or reject

| Nautilus pattern | Decision | AE implementation meaning |
|---|---|---|
| One authoritative mutation path | **Adopt** | Serialize each invocation/economic identity through durable state transitions; do not allow adapters to mutate money truth ad hoc. |
| Explicit order lifecycle and reconciliation | **Adopt** | Keep separate invocation, attempt, external-spend, payment, delivery, and accounting states, linked by immutable identities. |
| Write-once order-to-client origin | **Adapt** | Persist a write-once `RouteClaim` covering provider, exact Operation revision, binding, price, policy, authority, and health snapshot. |
| Execution traffic ahead of market data | **Adapt** | Reserve capacity for reconciliation/refund/revoke and authorized-before-expiry work ahead of new paid calls, free traffic, probes, and analytics. |
| Typed in-process bus | **Adapt selectively** | Use typed commands/events and bounded payloads, but durable inbox/outbox records—not an in-memory bus—must cross crash and side-effect boundaries. |
| State replay without side-effect replay | **Adopt** | Rebuild projections freely; reissue provider/payment effects only after explicit evidence proves `not_released`. |
| Static adapter selection | **Reject** | Allocation must be semantic and policy-aware before authority; dispatch must remain pinned afterward. |
| Global owner loop | **Reject** | Bulkhead by principal/account, provider/binding, custody, economic rail, and reconciliation partition. |
| Unbounded principal queues | **Reject** | Every lane needs a finite bound, maximum queue age, admission result, and oldest-age telemetry. |
| Async event-store capture as safety boundary | **Reject** | Commit idempotency, route claim, money reservation, and release fence before irreversible I/O. |
| Hidden failover after send ambiguity | **Reject** | Once release is possible, reconcile first; never substitute another provider silently. |
| Microsecond/zero-copy optimization as first priority | **Reject for now** | Provider, payment, signing, storage, and reconciliation dominate. Optimize local serialization only after measured evidence. |

## Current Agentic Economy: verified strengths and gaps

### Strengths

- **Material idempotency is durable.** An invocation is indexed by credential and idempotency key; replay requires the same principal, grant generation, environment, exact operation, input digest, request digest, and operation snapshot. Conflicting material is rejected (`convex/capabilityOperationAdmission.ts:146-203`). Pending and reconciliation-required work both count against credential concurrency (`convex/capabilityOperationAdmission.ts:294-336`).
- **Lifecycle truth is explicit.** The canonical control distinguishes leased, retryable, reconciliation-required, terminal, cancelled, and invalidated states. Attempts distinguish `not_released`, `released`, `possibly_released`, uncertain, timed-out, reconciled-not-released, and reconciled-released (`src/modules/action-invocation/internal/convex-schema.ts:16-58`). Attempt identities and append-oriented transition history include effect generation and prior/next digests (`src/modules/action-invocation/internal/convex-schema.ts:178-217`).
- **Provider I/O is fenced durably.** The release-fence command moves the attempt to `possibly_released` and commits a deterministic transition before network release (`src/modules/action-invocation/canonical-claim.ts:252-315`). The worker revalidates grant and the exact current Operation snapshot, persists/read-backs the fence, and refuses closed before send if that fails (`src/modules/capability-execution/invocation-worker/runRelease.ts:263-321,396-449`).
- **Blind retry after uncertainty is blocked.** A duplicate whose state is reconciliation-required, uncertain, or possibly released is refused as reconciliation-required (`src/modules/action-invocation/canonical-claim.ts:480-500`). Integration tests assert the release fence in the workpool path (`tests/integration/capability-operation-workpool.test.ts:330-377`).
- **Managed x402 signing has a durable intent boundary.** Unsigned payment material, payer, nonce, expiry, fingerprint, and signing idempotency key are persisted before signing; partial intent forces reconciliation (`src/modules/capability-execution/invocation-worker/x402Authorization.ts:302-385`).
- **Money identities and unknown states are first-class.** External spend binds invocation, attempt, effect generation, provider, payment identifier, challenge, custody, amount, submission state, evidence, and reconciliation (`src/modules/money/internal/convex-schema.ts:131-265`). Ledger transactions represent reserved/unknown/reversed budget states, while ledger entries retain exact transaction and evidence links (`src/modules/money/internal/convex-schema.ts:29-86`).
- **Search/compare and execution are already separate surfaces.** Search filters and ranks current Operation descriptors, while invocation requires an exact `operationRef` (`src/modules/capability-supply/internal/operation-search.ts:188-279`; `src/modules/capability-execution/operation-invoke-admit.ts:172-203`). This is the right base for explicit allocation rather than hidden dispatch failover.

### Gaps

- **Scheduled reconciliation is not yet active evidence acquisition for ordinary unknowns.** The sweep has leases, bounded selection, backoff, and manual-review promotion, but it calls recovery with `mode: 'status'`, which only projects local durable state (`convex/capabilityOperationInvocationWorker.ts:79-202`; `src/modules/capability-execution/invocation-worker/recover.ts:150-168`). Rich provider/x402 verification exists when evidence is supplied (`src/modules/capability-execution/invocation-worker/recover.ts:468-701`), but the normal sweep does not obtain that evidence itself.
- **Execution-time semantic routing is absent.** Search returns ranked choices and compare returns facts, but the paid dispatcher consumes the already selected exact Operation. The empty `src/modules/routing-kernel/` directory is a natural ownership boundary for the missing allocator. Current text ranking is lexical and deterministic, not a policy/health/economic route decision (`src/modules/capability-supply/internal/operation-search.ts:40-88`).
- **No immutable route-decision record exists.** The invocation stores an Operation snapshot and authority, which pins dispatch materially, but it does not preserve the considered candidates, hard rejection reasons, policy version, health/capacity snapshot, or route-decision digest (`src/modules/capability-execution/internal/convex-schema.ts:170-213`).
- **Capacity is one shared lane.** Market dispatch owns one 32-parallel workpool with generic retries (`convex/marketDispatchWorkpool.ts:5-10`). There is no priority, queue-age deadline, or per-provider/custody/rail bulkhead in that configuration. A one-minute, 25-candidate reconciliation sweep is bounded but cannot provide sub-minute unknown-resolution SLOs (`convex/crons.ts:7-12`; `convex/capabilityOperationInvocationWorker.ts:41-42`).
- **Inbox/outbox coverage is incomplete.** Workpool enqueue is durable, and invocation/money histories are strong, but there is no general provider-event inbox keyed by signed external event ID/digest, nor a unified outbox that owns dispatch/reconciliation intents and their delivery state.
- **Operational telemetry is lifecycle-light.** Audit events contain correlation and evidence references (`src/modules/observability/internal/schema.ts:12-31`), but invocation schemas lack a complete set of admitted/enqueued/claimed/fenced/submitted/observed/finalized timestamps (`src/modules/capability-execution/internal/convex-schema.ts:170-205`).
- **Unknown exposure is not bulkheaded broadly enough.** Credential concurrency counts reconciliation-required invocations, but there are no explicit unknown-count/unknown-value caps per provider, custody signer, or rail in the inspected admission schema.

## Proposed target architecture

```text
Agent request
    |
    v
Authenticated admission + material idempotency inbox
    |
    v
Semantic allocator (read-only candidate projection)
  hard policy gates -> score -> RouteDecision
    |                         |
    |                         +-- immutable candidate/rejection evidence
    v
Authority + budget reservation
    |
    v
Durable RouteClaim + dispatch outbox
    |
    +--> bounded provider/custody/rail lane --> worker lease/fencing token
                                              |
                                      prepare + revalidate
                                              |
                                      durable release fence
                                              |
                                   provider/payment side effect
                                              |
                              signed provider/payment inbox events
                                              |
                           validation + append-only ledger/receipts
                                              |
                         reconciliation lane / manual-review queue
```

Use Convex as the durable coordination substrate, but define **logical failure domains**:

- principal/account: idempotency, budget, concurrency, unknown-dollar cap;
- provider/binding: health circuit, connection generation, active calls, queue;
- custody signer: nonce/signing intent, generation, active/unknown authorizations;
- economic rail: facilitator/RPC capacity and settlement uncertainty;
- invocation: canonical attempt/effect generation and result projection;
- reconciliation: resolver kind, partition/cursor, lease, next check, manual owner.

Cross-domain progress is a saga. Do not seek a fictitious transaction with the remote provider; make the release fence the irreversible boundary and every later correction an appended fact.

## Semantic and policy-aware routing

### Allocation versus dispatch

Allocation chooses an exact Operation/provider. Dispatch executes that frozen choice. Keep direct `operationRef` invocation for agents that already chose; add an optional intent-based allocator that returns or persists the exact selection. Never substitute a provider invisibly inside an existing invocation.

Candidate processing should be lexicographic before scoring:

1. contract, effect, data-use, location/jurisdiction, environment, and authority compatibility;
2. current publication, binding, price, provider approval, and readiness generation;
3. principal budget, provider/custody/rail capacity, and open-circuit policy;
4. then score expected useful value.

An initial score can be:

```text
expected_useful_value
- all_in_buyer_cost
- latency_penalty(operation_class)
- unknown_outcome_penalty
- fraud_or_trust_penalty
- reconciliation_support_cost
```

Price or latency cannot compensate for violating a hard gate. For cent-scale Operations, payment/network/support cost may exceed provider value; the allocator should be able to reject, aggregate, or use prepaid internal credit.

### Immutable route claim

Persist `RouteDecision` before authority consumption:

```text
routeDecisionRef, invocationRef, intentDigest, scoringPolicyVersion,
candidateSnapshotDigest, considered[{operationRef, revision, digests, rejectionCodes}],
selected{operationRef, providerRef, bindingId, publicationRevision,
         contractDigest, bindingDigest, priceDigest, qualificationDigest,
         connectionGeneration, economicRail},
healthSnapshotRef, capacitySnapshotRef, decidedAt, expiresAt, routeDecisionDigest
```

Then create a write-once `RouteClaim` at dispatch. Modify/cancel/reconcile/receipt commands must present the same `routeDecisionDigest`, selected Operation/binding, attemptRef, effectGeneration, and provider identity. A route change creates a new decision and—after any authority-relevant material changes—a new authority decision.

Failover rules:

- before reservation/authority: freely choose another eligible candidate;
- after decision but before release fence: require a new route decision and re-evaluate changed price/provider/effect/data/authority;
- after durable fence or any ambiguous transport: **no failover**; reconcile first;
- after evidence proves `not_released`: a new provider may be attempted with a new attemptRef/effectGeneration if policy permits;
- racing/hedging: disallow for paid or consequential effects unless providers share an enforceable cross-route idempotency/compensation contract.

## Transaction state machine

Keep invocation, payment, and accounting truth separate; compose them in the public receipt.

```text
INVOCATION / ATTEMPT

ADMITTED -> ROUTE_DECIDED -> AWAITING_AUTHORITY -> AUTHORIZED
         -> ENQUEUED -> CLAIMED -> PREPARED
         -> RELEASE_FENCED(possibly_released)
         -> DISPATCH_OBSERVED
             |-> DELIVERY_VALID -> COMPLETED
             |-> DEFINITELY_NOT_RELEASED -> RETRYABLE_SAFE
             |-> RELEASED_BUT_INVALID -> COMPENSATION_REQUIRED
             `-> OUTCOME_UNCERTAIN -> RECONCILIATION_REQUIRED

RECONCILIATION_REQUIRED
    -> EVIDENCE_NOT_RELEASED -> RETRYABLE_SAFE(new attempt/effect generation)
    -> EVIDENCE_RELEASED -> DELIVERY/SETTLEMENT resolution or compensation
    -> EVIDENCE_INCONCLUSIVE -> backoff -> MANUAL_REVIEW

Cancellation:
    before fence -> CANCELLED_SAFE(not_released)
    after fence  -> RECONCILIATION_REQUIRED, never "cancelled"
```

```text
PAYMENT / EXTERNAL SPEND

NOT_RESERVED -> RESERVED -> AUTHORIZATION_PREPARED
             -> POSSIBLY_SUBMITTED
             -> SETTLED | NOT_SETTLED | OUTCOME_UNKNOWN

OUTCOME_UNKNOWN -> RECONCILED_SETTLED
                -> RECONCILED_NOT_SETTLED
                -> MANUAL_REVIEW

SETTLED -> ACCOUNTED -> REFUND | REVERSAL | CHARGEBACK | LOSS
```

The critical rule is monotonic knowledge: `possibly_released` may become evidence-backed released/not-released, but it must never be rewritten to “safe” merely because a timeout elapsed. Refunds, reversals, loss, dispute, and recovery are compensating entries, not history deletion.

## Idempotency, inbox/outbox, and fencing

- **Client idempotency:** retain the existing `(credentialId, idempotencyKey)` material reservation. Extend its digest to reference `routeDecisionDigest` when allocation is AE-owned. Same key/different intent, route, input, authority, or price is a conflict.
- **Attempt identity:** keep deterministic `invocationRef + attemptRef + effectGeneration + operationKey + materialInputDigest`. A safe retry increments attempt/effect generation only after reconciliation proves not released.
- **Provider inbox:** insert once by `providerRef + connectionGeneration + externalEventId`, with signature/key generation, receivedAt, providerObservedAt, raw-payload digest, attribution identity, and verification result. Duplicate same digest is replay; same ID/different digest is a security incident.
- **Dispatch outbox:** persist exact route claim, command digest, priority, queue deadline, attempt/effect identity, and state `pending -> leased -> released_or_possible -> observed -> finalized`. The worker may perform I/O only after a successful lease and release-fence mutation.
- **Reconciliation outbox:** persist resolver kind, external identity, provider/rail cursor, nextAttemptAt, maximum age, lease owner/token, and manual-review owner. Reconciliation capacity must remain available when new dispatch is circuit-open.
- **Fencing:** leases need a monotonic token/generation, not only owner and expiry. Provider/custody/result mutations must compare the token and route claim. A stale worker may report evidence to the inbox but may not release a new effect or finalize authority.
- **Atomic boundary:** when possible, create/update the invocation, route claim, budget reservation, and outbox intent in one Convex mutation. Remote calls remain outside; their uncertainty is represented, not hidden.

## Bounded queues, priority, bulkheads, and backpressure

| Priority | Work | Capacity rule |
|---|---|---|
| P0 | unknown-effect/payment reconciliation, refund/reversal, pre-release revoke, expired authorization cleanup | Dedicated reserved pool; never blocked by probes or new calls. |
| P1 | authorized, definitely-not-released work approaching authority/route expiry | Provider/custody/principal limits; expire safely before fence. |
| P2 | new paid invocation allocation/dispatch | Bounded queue; refuse early with `retryAfterMs` when saturated. |
| P3 | free/keyless/replayable reads | Separate quota so they cannot consume paid safety capacity. |
| P4 | readiness probes, discovery refresh, analytics, aggregates | Shed or defer first. |

Every boundary should define maximum depth, maximum oldest age, concurrency, per-item deadline, and overload outcome. Bulkheads should exist for provider/binding, custody signer/generation, economic rail/region, principal/account, and reconciliation partition. Open a provider circuit on timeout/transport-unknown rates and stale readiness, but keep its P0 resolver open. Cap both **unknown count** and **unknown value** per principal, provider, custody, and rail.

Backpressure must be semantic:

- before fence: refuse/expire safely and release holds;
- after fence: never generic-retry; enqueue reconciliation;
- provider saturation: reject only that provider lane and re-run allocation only before authority/fence;
- storage/fence unavailable: fail closed before release;
- analytics unavailable: continue after the safety mutation, with a bounded telemetry outbox.

## Realistic latency budgets

Do not combine local control-plane latency with provider/payment latency.

### Local control plane (AE-owned, normal admitted load)

| Stage | Initial objective | Boundary |
|---|---:|---|
| Authentication, validation, idempotency reservation | p50 < 100 ms; p99 < 300 ms | Return durable accepted/pending, not provider completion. |
| Candidate filter + route decision from cached projections | p50 < 25 ms; p99 < 100 ms | No synchronous fan-out to providers. |
| Existing mandate/authority evaluation | p99 < 100 ms | Human approval excluded. |
| Enqueue to worker claim, fast paid lane | p50 < 100 ms; p99 < 500 ms | Hard pre-release queue expiry, initially 2 s. |
| Prepare, revalidate, reserve, and commit release fence | p99 < 500 ms | Must fail closed. |
| Pre-release cancel/revoke application | p99 < 1 s | Only while definitely not released. |

### External/provider/payment (class-specific)

| Stage | Initial objective | Boundary |
|---|---:|---|
| Managed x402 signing | p50 < 500 ms; p99 < 2 s | Measure custody separately. |
| Fast data-provider Operation | p95 < 3 s; p99 < 5 s | Per Operation class/provider, not global. |
| Long compute/human/physical work | Contract deadline | Return accepted/pending; poll or continue asynchronously. |
| Initial payment observation | p99 < 2 s after provider response | Economic finality may still be pending. |
| Automatic unknown resolution | 99% < 5 min; 99.9% < 1 h | Requires a faster trigger than the current one-minute sweep for urgent classes. |

Track p50/p95/p99/p99.9 and queue age. `T_total` should be decomposed as:

```text
T_authn + T_admission + T_route + T_authority + T_queue + T_fence
+ T_sign + T_provider + T_payment_observation + T_validation + T_accounting
```

Microsecond in-process dispatch is irrelevant until the measured local components are a material share of total cost or threaten queue bounds.

## Observability and SLOs

Propagate a non-secret correlation set through logs, metrics, traces, receipts, and inbox/outbox rows:

```text
correlationId, invocationRef, routeDecisionRef, operationRef, providerRef,
bindingId, attemptRef, effectGeneration, workId, queueLane, fencingToken,
economicRail, custodyRefHash, paymentIdentifier, transactionRef, reconciliationRef
```

Record timestamps for request received, idempotency reserved, route decided, authority decided, enqueued, worker claimed, attempt claimed, money reserved, fence committed, signing started/completed, submission started/marked, provider headers/body received, output validated, payment observed, accounting finalized, reconciliation queued/claimed/resolved, and compensation completed.

Minimum metrics:

- stage latency histograms and end-to-end class latency;
- queue depth, oldest age, admission refusal/expiry by lane and provider;
- active calls and circuit state by provider/binding/custody/rail;
- unknown count/value, reconciliation backlog/oldest age, and manual-review ownership;
- duplicate/conflicting idempotency, stale-fence attempts, provider inbox conflicts;
- ledger imbalance, projection lag, refund/loss/chargeback outcomes;
- useful-delivery, schema-valid-delivery, paid-but-invalid, and dispute rates kept separate.

Initial service objectives:

- durable invocation admission availability: 99.95% monthly, excluding policy/validation refusals;
- request to durable accepted/pending: p99 < 300 ms;
- accepted to worker claim under admitted fast-lane load: p99 < 500 ms;
- automatic unknown resolution: 99% < 5 minutes, 99.9% < 1 hour or explicit manual ownership;
- no automatic reconciliation item older than 1 hour; no manual item unowned for 24 hours;
- one-provider outage does not breach unrelated-provider latency/error SLOs.

Safety invariants are stricter than SLOs: zero blind resend after `possibly_released`; zero conflicting material under one idempotency key; zero ledger imbalance; zero delivery/payment attribution without exact invocation/attempt/effect/route identity; and every unknown dollar has an owned resolver or manual-review record.

## Prioritized roadmap

### P0 — money/effect correctness and containment

1. **Make automatic reconciliation acquire evidence.** Add resolver modes for provider status, x402 chain/facilitator state, and accounting/refund state. Replace ordinary `mode: 'status'` in `convex/capabilityOperationInvocationWorker.ts:163-169`. Extend `src/modules/capability-execution/invocation-worker/recover.ts`, `convex/moneyX402PaymentObservation.ts`, `convex/moneyExternalSpendReconcile.ts`, and `convex/capabilityOperationInvocations.ts`. Persist resolver kind/external identity/cursor beside the current lease/backoff fields in `src/modules/capability-execution/internal/convex-schema.ts:153-167`.
2. **Split safety work from new dispatch.** Replace the single shared configuration in `convex/marketDispatchWorkpool.ts` with dedicated dispatch, reconciliation/refund, and free/probe lanes. Add queue deadlines and per-provider/custody/rail admission around `convex/capabilityOperationDispatch.ts:168-208`, `convex/capabilityOperationAdmission.ts:279-336`, and `src/modules/capability-execution/invocation-worker/runPreparation.ts`.
3. **Add unknown-exposure caps and circuits.** Enforce unknown count/value per principal, provider, custody, and rail in `convex/moneyExternalSpendReserve.ts`, `convex/moneyChargeAdmission.ts`, and `convex/capabilityOperationAdmission.ts`. Add runtime health/circuit tables to `src/modules/capability-execution/internal/convex-schema.ts` or a new routing schema; keep reconciliation capacity open.
4. **Create durable provider inbox and reconciliation outbox.** Add insert-once signed event attribution and explicit resolver ownership. Integrate with `convex/moneyX402PaymentAttempts.ts`, `convex/moneyExternalSpendReconcile.ts`, provider connection modules, and `src/modules/action-invocation/internal/convex-schema.ts`. Add crash/duplicate/conflicting-event tests beside `tests/unit/convex/capability-operation-worker-recover.test.ts` and `tests/integration/money-external-spend.test.ts`.
5. **Instrument lifecycle stages and safety invariants.** Add timestamps/transition metrics to `src/modules/capability-execution/internal/convex-schema.ts`, `convex/capabilityOperationDispatch.ts`, `runPreparation.ts`, `runRelease.ts`, `x402Authorization.ts`, and `convex/marketEvidence.ts`; export redacted correlation through `src/modules/observability/`.

### P1 — semantic routing and immutable provenance

1. **Implement the allocator in `src/modules/routing-kernel/`.** Build candidates from `src/modules/capability-supply/internal/operation-search.ts`, `operation-detail-compare.ts`, readiness, provider approval, money price, and runtime circuits. Use hard gates before scoring.
2. **Persist `RouteDecision` and `RouteClaim`.** Extend `src/modules/capability-execution/internal/convex-schema.ts`, `operation-invoke-admit.ts`, and `convex/capabilityOperationAdmission.ts`. Revalidate the route claim in `runPreparation.ts`/`runRelease.ts`; do not change provider after fence.
3. **Add an explicit intent-to-operation surface.** Keep `src/routes/api.v1.operations.call.ts` exact-operation semantics; add a separate plan/allocate endpoint or extend `src/routes/api.v1.market-operations.inspect-plan.ts` to return an expiring, signed route decision. Expose route decision and selection evidence in `src/modules/capability-execution/invocation-receipt-view.ts`.
4. **Add fencing tokens.** Extend provider connection leases, reconciliation leases, and dispatch claims in `convex/capabilityProviderConnectionLeases.ts`, `convex/capabilityOperationInvocations.ts`, and canonical attempt history. Reject stale finalization even if lease owner strings collide or an expired worker resumes.

### P2 — scale, proof, and economics

1. **Build wire-to-finality load tests.** Traverse HTTP admission, Convex reservation, allocation, workpool, signing, one loopback paid provider send, payment observation, ledger, and final receipt. Test worker crash before/after every fence, provider timeouts, duplicate webhooks, RPC disagreement, and reconciliation saturation. Extend `tests/integration/capability-operation-workpool.test.ts`, `tests/unit/capability-supply/route-transport-x402.test.ts`, and money integration suites.
2. **Add state-machine/property tests.** Generate legal/illegal interleavings of duplicate invoke, cancel, lease expiry, release fence, provider response, payment event, recovery, refund, and manual reconciliation. Assert no duplicate release, bounded holds, balanced ledger, and replay-equivalent projections.
3. **Route on unit economics.** Include provider amount, AE fee, custody/network cost, expected loss, and support/reconciliation cost using `src/modules/money/internal/pricing-config.ts`, charge code, and route scoring. Aggregate or reject structurally unprofitable microtransactions.
4. **Optimize only measured bottlenecks.** If local p99 is material after P0/P1, reduce serialization, projection reads, or cross-action round trips. Do not import CPU affinity, busy polling, or zero-copy complexity without evidence.

## Risks and open questions

- What is the atomic unit of semantic intent: one exact Operation, a capability contract, or a buyer-defined outcome with multiple acceptable effects?
- Which route changes require fresh authority: provider identity, price, data-use, jurisdiction, effect class, evidence posture, or any digest change?
- Which providers expose trustworthy idempotency/status APIs, signed receipts, or webhooks? Providers without them may need lower limits or no consequential retries.
- What is the maximum tolerable unknown value/count per principal, provider, custody, and rail—and who owns manual review?
- Can Convex workpool components support the required lane isolation directly, or should separate components/dispatch tables be used?
- How will provider health be protected from sparse-sample noise, gaming, and feedback loops while remaining fresh enough for routing?
- Which Operations are safe to race or retry? Default should be “none” for paid/consequential effects until a contract proves otherwise.
- What payment model makes cent-scale work economical: prepaid balance, batching, net settlement, x402 per call, or a hybrid?
- How are sanctions, jurisdiction, privacy, and data-retention constraints encoded as hard routing gates rather than ranking hints?
- What evidence is sufficient to distinguish delivery, contract-valid output, Qualified Use, and actual buyer usefulness?

## Validation corrections from the earlier passes

1. “Single-threaded architecture” is too broad: only the live mutation kernel/thread-local bus is owner-threaded; I/O and persistence producers can be multithreaded.
2. Execution priority does not imply cancel-specific priority, preemption, or bounded latency. Cancel/modify/submit share a FIFO and all principal channels are unbounded.
3. Nautilus routing is static deterministic adapter selection, not health-aware smart routing or failover.
4. Reconciliation is implemented and operationally meaningful, but it is scoped trading-state reconciliation with in-memory horizons—not a durable exactly-once ledger.
5. The event store is asynchronous audit/replay, not a committed-before-send side-effect fence; its [halt flag is observable](https://github.com/nautechsystems/nautilus_trader/blob/13559f053a376bbbd4bdd765cdefe2a635f893e7/crates/event_store/src/kernel.rs#L221-L226), but the inspected runtime does not poll it to stop trading.
6. The supplied stress tests/microbenchmarks do not prove production wire-to-wire HFT latency.
7. AE already has a real durable release fence and stronger explicit uncertain-money states than a simple “add outbox/idempotency” recommendation suggests. The priority is to complete active reconciliation, capacity isolation, and route provenance around those foundations.

## Source index

Primary Nautilus sources are the pinned GitHub permalinks embedded above. The most important AE implementation sources are:

- invocation lifecycle/history: `src/modules/action-invocation/internal/convex-schema.ts:16-58,151-217`;
- claim, duplicate classification, release fence: `src/modules/action-invocation/canonical-claim.ts:115-229,252-315,480-500`;
- durable invocation/idempotency/admission: `src/modules/capability-execution/internal/convex-schema.ts:153-213`; `convex/capabilityOperationAdmission.ts:146-203,279-336`;
- workpool/dispatch: `convex/marketDispatchWorkpool.ts:5-10`; `convex/capabilityOperationDispatch.ts:168-208,236-270`;
- worker preparation/release: `src/modules/capability-execution/invocation-worker/runPreparation.ts:258-356`; `runRelease.ts:263-321,396-449,451-607`;
- reconciliation scheduler/recovery: `convex/capabilityOperationInvocationWorker.ts:79-202`; `convex/capabilityOperationInvocations.ts:47-51,191-313`; `src/modules/capability-execution/invocation-worker/recover.ts:150-168,468-701`;
- money/external payment state: `src/modules/money/internal/convex-schema.ts:29-86,131-265`; `src/modules/capability-execution/invocation-worker/x402Authorization.ts:302-385`;
- semantic discovery/compare: `src/modules/capability-supply/internal/operation-search.ts:40-88,188-279`; `operation-detail-compare.ts:131-210`;
- observability: `src/modules/observability/internal/schema.ts:12-49`; `convex/marketEvidence.ts`;
- safety tests: `tests/integration/capability-operation-workpool.test.ts:330-377`; `tests/unit/convex/capability-operation-worker-recover.test.ts:646-793`; `tests/unit/capability-supply/route-transport-x402.test.ts:359-359,906-906`; `tests/integration/money-external-spend.test.ts:278-420`.

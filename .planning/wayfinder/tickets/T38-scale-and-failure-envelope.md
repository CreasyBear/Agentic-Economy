# T38 — Scale + failure envelope for scheduled autonomy

Labels: `wayfinder:research` (closed 2026-08-01). Map: [Framework](../MAP-framework.md).

## Question

Do the arithmetic nobody has done: target envelope (projects × nodes × events × chases/day) vs
documented limits (workpool ≤100 parallelism Pro-tier across ALL pools, workflow 1MB step/8MiB
journal, Convex function/db cost model). Design consequences: chase scheduling shape (per-project
timers vs batched cron sweeps), queue sharding, journal partitioning, cost per active project per
month. Failure domains: OpenRouter outage, Convex regional outage, provider timeout storms —
degradation modes, circuit breakers, and what the person sees. Output: envelope doc + the 3 design
constraints T28/T33 must honor.

## Resolution

Resolved 2026-08-01 (`history://ScaleEnvelope`, source-verified: workpool 0.4.9 README, workflow
README, Convex scheduler/pricing/state docs, repo model-transport).

**Envelope (assumptions: 40 nodes/project, 200 events/project/week, 2 chases/project/day, 3 calls/
chase):** chases/day = 2k / 20k / 200k at 1k / 10k / 100k active projects; events/day ≈ 28.6k / 286k /
2.86M. Against the **global ≤100 workpool slots (Pro, across ALL pools and workflows)**: at 20s/chase
action the ceiling is ~432k chase-executions/day → utilization 0.46% / 4.6% / 46%; at 60s it is 1.4% /
14% / **139% — 100k projects FAILS at 60s chase actions**. Marginal function-call cost ≈ $0.0125/
project/month (~6.3k calls); all-in cost needs payload/IO assumptions (explicitly not claimed).

**Three binding constraints (T28/T33 must honor):**
1. The 100 global slots are a shared budget — reserved lanes/fair queues per workload class; no
   unbounded per-event actions.
2. **Batched sharded cron sweeps, not per-project timers** — scheduler caps (1000 schedules/fn, 8MB
   args) make per-project timer explosion untenable at 100k; hash-sharded due-row sweeps enqueueing
   into bounded pools.
3. Workflow journals carry IDs only; event payloads live in partitioned Convex rows (project + time
   bucket) under the 1MB step / 8MiB journal caps.

**Degradation modes (person-visible):** dialog on provider timeout → deterministic/local answer +
"saved, try again"; chase timeout storm → circuit breaker opens, durable due-state persists,
"follow-up paused, we'll retry"; report on provider outage → last-good report + timestamp; Convex
regional outage → no fake success, client retry, "temporarily unavailable; nothing was lost"
(durability 11-nines, availability target 99.99% — physical outage may affect availability, not data).

**Top-5 risks:** global slot envelope; timer explosion; journal bloat; provider retry storms; cost is
workload/payload-dependent (function calls alone understate).

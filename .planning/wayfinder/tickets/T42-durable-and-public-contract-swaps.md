# T42 — The four adopt-first swaps that change a durable or public contract

Labels: `wayfinder:task` (AFK build, HITL for the slugify decision). Map: [Framework](../MAP-framework.md).
Blocked by: [T37](T37-delivery-pipeline-and-repo-protocol.md) — each item needs a rollback path, and
there is no green committed baseline to roll back to yet.
Predecessor: [T41](T41-handrolling-cutover-backlog.md) (first pass closed; the mechanical 13 are done).

## Question

The remaining adopt-first work is not mechanical. Each item replaces hand-rolled code with a library
or platform feature **and** changes something that outlives the process. They were deliberately not
swept into T41's parallel pass.

### 1. Workpool/workflow for route lease + dispatch (~80 lines)

`convex/customerRequestRouteTransportWorker.ts:17`, `customerRequestRouteExecutionJournalPorts.ts:245`,
`customerRequestRouteExecutionDispatchPorts.ts:35` hand-roll lease/claim/release, retry scheduling and
recovery **next to** the already-adopted `@convex-dev/workpool` + `@convex-dev/workflow` spine.
Adopting the spine changes durable job identity, retry timing, lease expiry and the observable attempt
record. Needs a state/wire migration plan and an answer for in-flight jobs at deploy.

### 2. Convex `.paginate()` for registry and money-ledger (~100 lines)

`convex/registry.ts:731,1229` and `convex/moneyLedger.ts:308,322` carry bespoke cursor/total/hasMore
page assembly. `paginationOptsValidator` + `query.paginate()` replace it — but **registry cursors are
public API**, and the money-ledger one is migration-facing. Either preserve the current response
contract over the new engine, or version the endpoint.

### 3. The two divergent `slugify` implementations — FOUNDER DECISION

`catalog/internal/publish.ts:401` and `storefront/internal/import-draft.ts:487` implement slugification
differently in the same codebase. The divergence is the defect. Unifying on `@sindresorhus/slugify`
(MIT) or on one of the two existing implementations **changes slugs for existing rows, and slugs are
persisted and public URLs**. This is a migration + redirect question, not a refactor.

### 4. `Object.groupBy` / `Map.groupBy` — blocked on ES2024

Three sites (`answer/internal/openrouter-models.ts:124`, `layout/AeRouteCommandMenu.tsx:46`,
`convex/observability.ts:450`). `tsconfig` `lib` was raised ES2022 → ES2023 in T41, which unlocked
`findLast`/`toSorted`. These need ES2024. Raising the lib again requires checking the Convex runtime
and the browser floor, so it is its own decision.

## Method

Same contract as T41: every change labelled provably pure or behaviour-affecting; behaviour-affecting
ships only behind a differential proof; every API claim cites a `.d.ts`, a doc URL, or a file:line.
Difference from T41: each item additionally needs a **rollback statement** and, for 1 and 2, a
statement of what happens to data written by the previous implementation.

## Resolution

(pending)

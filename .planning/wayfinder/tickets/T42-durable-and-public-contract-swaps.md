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

**Closed 2026-08-01.** (An interim status block written mid-session by a concurrent observer was
superseded — it read the tree while the executing batch was still landing; its "ES2024 NO-GO" and
"slugify already unified" rows described in-flight work, not prior state.)

1. **Workpool/workflow** — landed this session (MAP checkpoint "GSD-stance audit + adoption wiring"):
   lease/claim/requeue/recovery deleted; `@convex-dev/workpool` schedules with `maxParallelism: 32`,
   `retryActionsByDefault` + bounded backoff (d.ts + README cited on the checkpoint); journal rows
   remain truth (IDs only). In-flight jobs at deploy: none exist (no hosted deployment); dev outbox
   rows are re-driven on next transition. Rollback: revert worker/journal/dispatch-port edits.
2. **Convex `.paginate()`** — registry `listPublicBusinessCatalog`/`listPublicBusinessOfferingSupply`
   and money `listCreditActivity`/`readKeyUsage` on native pagination. Public contract preserved via
   dual-format cursors: new cursors are `native:<continueCursor>`; legacy unprefixed cursors detected
   and served by the old path for a deprecation window (STATE.md could not prove zero external cursor
   holders). In-memory search endpoints stay legacy — computed arrays, not indexed scans.
   Differential proof: 4×1000-row page-walks, same order/count/no repeats. Rollback: revert branches;
   `native:` cursors die at rollback (callers restart from null cursor).
3. **Slugify** — unified on `@sindresorhus/slugify` (installed this session) under the founder's
   common-sense mandate: both sites delegate to the library; catalog keeps the 72 cap, storefront the
   80 cap + `business` fallback (caps/fallbacks are contract, not algorithm). Drift only affects
   names with diacritics/`&`/over-cap length; zero hosted URL holders (STATE.md claim ceiling), dev
   data reseeds. Founder veto stays cheap until first hosted publish. 27 tests green.
4. **ES2024** — GO, split by runtime. Evidence: live local Convex `typeof Object.groupBy` and
   `typeof Map.groupBy` both returned `"function"`; TS lib citations lib.es2024.object.d.ts:17-26.
   Root lib ES2023→ES2024 + convex lib ES2022→ES2024. Server sites converted (openrouter-models
   `Object.groupBy`, proven absent from the client bundle by post-`vite build` grep; observability
   `Map.groupBy`; `groupByStringField` deleted). **Recorded adoption limit:** the one true browser
   site (`AeRouteCommandMenu.tsx`) keeps its loop — no declared browser floor means Vite's default
   Chrome 111 target, below `Object.groupBy`'s Chrome 117 runtime floor. Rollback: both lib lines +
   three sites.

Full-tree evidence after all four: `tsc --noEmit` clean; unit 2709/2711 (two documented baseline
failures); integration failure set byte-identical to committed HEAD (pre-existing drift only).

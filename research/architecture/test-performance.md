# Test and performance architecture for Operation-boundary migration

**Reviewed:** 2026-08-25  
**Scope:** Verification and performance controls for moving current module boundaries without changing observable behavior or widening the Operation market.  
**Authority:** `PRODUCT.md`, current source and tests at `8c38b57b2`, recent Git history, and `research/WHOP-AE-MATURITY.md`.

The migration should preserve one externally observable loop: search the canonical market, compare and inspect exact Operations, make a controlled call, receive literal output or a durable receipt, continue in the caller's harness, and later return for a new gap. The safest migration unit is therefore a real consumer seam plus its current module boundary, not a package per domain noun.

## Test framework and commands

The checked-in runner for source, contract, component, and Convex tests is **Vitest 4.1.9** (`package.json:111-131`). `vitest.config.ts:14-24` selects `tests/**/*.test.ts`, `tests/**/*.test.tsx`, and `convex/**/*.test.ts`, uses a Node environment, and installs the repository setup files. Convex integration behavior is exercised with `convex-test` (`package.json:121`). Browser tests use **Playwright 1.61.1** (`package.json:112`); `playwright.config.ts:5-36` runs `tests/e2e` in compact and wide Chromium projects, starting the local Vite server unless `PLAYWRIGHT_BASE_URL` points to a hosted deployment.

Checked-in commands relevant to a boundary migration are:

| Purpose | Command | Source |
|---|---|---|
| Focused source verification | `npx vitest run <files> --no-file-parallelism --test-timeout=15000` | Direct use of the configured Vitest runner; appropriate while iterating on one seam. |
| Unit suite | `npm run test:unit` | `package.json:40` |
| Integration and Convex suite | `npm run test:integration` | `package.json:41` |
| Import/module-boundary contracts | `npm run test:imports` | `package.json:47` |
| Browser end-to-end | `npm run test:e2e` | `package.json:43`, `playwright.config.ts:5-36` |
| Paid-operation development UI proof | `npm run test:e2e:paid-operation` | `package.json:44`; this is a labelled local projection, not a hosted paid call. |
| Source release gate | `npm run test:release:source` | `package.json:29-30`; includes conformance, chat, codegen, lint, typecheck, unit, integration, import, browser, package, and build checks. |
| Hosted exact-revision gateway proof | `npm run test:release:live-gateway -- --receipt <path>` then `npm run validate:release:gateway -- <path>` | `package.json:31-34`; validator binds the receipt to expected source and deployment identity at `tools/release/validate-operation-gateway-production-smoke-receipt.ts:21-31`. |

The focused review run passed **53/53 tests in 7 files**:

```text
npx vitest run \
  tests/unit/capability-supply/operation-projection-search.test.ts \
  tests/unit/server/operation-market-routes.test.ts \
  tests/unit/market-terminal/cold-loop.test.ts \
  tests/integration/capability-publication-keyless.test.ts \
  tests/integration/capability-operation-workpool.test.ts \
  tests/unit/capability-execution/operation-receipt-contract.test.ts \
  tests/unit/server/operation-recovery-api.test.ts \
  --no-file-parallelism --test-timeout=15000
```

This is targeted evidence, not a substitute for the full source release gate or live gateway proof.

## Golden journey coverage

### 1. Search the canonical Operation market

The HTTP consumer enters through `POST /api/v1/market-operations/search` (`src/routes/api.v1.market-operations.search.ts:18-34`). The route bounds and validates the body, executes `registryOperationsSearchAction`, strictly validates the returned choice projection, and returns `Cache-Control: no-store` (`src/routes/api.v1.market-operations.search.ts:38-65`). The action delegates to the capability-supply source (`src/modules/registry/operations.actions.ts:19-22`), which makes the public Convex query (`src/modules/capability-supply/operation-source.ts:23-31`). Convex then builds a source port and calls the pure Operation search projection (`convex/capabilitySupplyOperationQueries.ts:324-375`).

Search itself requests at most 257 current publications, refuses source capacity above 256, materializes and filters every source record, ranks the full bounded set, and returns at most 20 results (`src/modules/capability-supply/internal/operation-search.ts:137-140,188-279`). Cursor identity binds query, filters, source snapshot, and last Operation reference; changed snapshots fail closed (`src/modules/capability-supply/internal/operation-search.ts:465-509`).

Coverage is good at the pure contract and one-operation integration levels:

- ranking, filters, sensitive input refusal, pagination, cursor invalidation, wire safety, and search/detail/compare call metadata coherence are covered in `tests/unit/capability-supply/operation-projection-search.test.ts:115-249,251-368`;
- the HTTP adapter is covered with a mocked source at `tests/unit/server/operation-market-routes.test.ts:59-84`;
- an admitted, ready keyless Operation is found through the actual Convex query at `tests/integration/capability-publication-keyless.test.ts:244-286`.

There is no test with more than 256 **current valid** Operations. The test mentioning more than 1,024 prior publications inserts them as withdrawn (`tests/integration/capability-publication-keyless.test.ts:30-75`), so it does not exercise the current-search capacity boundary.

### 2. Compare suppliers and inspect exact commitment facts

Detail, compare, and inspect-plan use separate bounded POST routes with the same validation, rate-limit, correlation, source-error, and no-store policy (`src/routes/api.v1.market-operations.detail.ts:34-78`, `src/routes/api.v1.market-operations.compare.ts:34-78`, `src/routes/api.v1.market-operations.inspect-plan.ts:34-78`). Exact detail loads one current Operation; compare loads up to four current Operations in parallel and projects summary, price, effects, data use, availability, provenance, and recovery (`src/modules/capability-supply/internal/operation-detail-compare.ts:93-175,178-210`). Inspect-plan loads up to four Operations, refuses any that is not currently routeable, resolves at most 32 mappings, and caps plan expiry at the earliest readiness validity (`src/modules/capability-supply/internal/operation-inspect-plan.ts:66-183`).

Unit coverage verifies schemas, navigation, current price evidence, anonymous-vs-authenticated execution affordances, comparison wire values, and routeability refusal (`tests/unit/capability-supply/operation-projection-public.test.ts:92-175,185-307,309-360`). HTTP route tests verify canonical paths but mock the source (`tests/unit/server/operation-market-routes.test.ts:86-124`). The CLI cold-loop test hits search, detail, compare, and inspect-plan as an external consumer, but all responses come from a fetch mock (`tests/unit/market-terminal/cold-loop.test.ts:320-411`). No current integration test seeds two independent suppliers, compares them through Convex, inspects the selected Operation, and carries that exact selection into a call.

### 3. Make a controlled call

The authenticated consumer contract is `POST /api/v1/operations/call` (`src/modules/capability-execution/operation-invoke-entry.ts:15-26`; route binding at `src/routes/api.v1.operations.call.ts:7-20`). The HTTP adapter bounds input at 256 KiB, authenticates the invocation scope, validates the strict action schema, projects typed domain outcomes, and records one bounded gateway timing event (`src/lib/server/operation-invoke-api.ts:356-425`). Its service creates a stable operation key, admits a signed source write, and calls the Convex action (`src/lib/server/operation-invoke-api.ts:58-93`).

The Convex action admits the command before evaluation, reads and validates the exact current published Operation snapshot, evaluates the grant and authority, reserves idempotently with pinned `operationJson` and `inputJson`, and dispatches work (`convex/capabilityOperationInvokeActions.ts:170-209,279-346`). The durable Workpool integration test proves one provider effect, claim/release/terminal ordering, one money transaction and usage record, replay without another provider call, and refusal after grant revocation (`tests/integration/capability-operation-workpool.test.ts:278-427`). HTTP authentication, injected transport rejection, required idempotency identity, typed pending/authority/reconciliation outcomes, and gateway timing are covered at `tests/unit/server/operation-invoke-api.test.ts:31-138`.

Eligible free keyless execution is a second current call path for chat/MCP. A real Convex publication can be searched, read, executed once against a mocked provider, and then withdrawn fail closed (`tests/integration/capability-publication-keyless.test.ts:272-393`). A migration must keep this literal-result path aligned with authenticated invocation without forcing durable-receipt semantics onto an eligible keyless read.

### 4. Return result or receipt and recover uncertainty

Status is `GET /api/v1/operations/{invocationRef}` and cancellation/reconciliation are sibling POST routes (`src/modules/capability-execution/operation-invoke-entry.ts:27-50`). Status authenticates the same scope, validates the invocation reference, strictly validates the recovery result, and marks transport/source exceptions as unknown in telemetry (`src/lib/server/operation-invoke-api.ts:515-569`). Completed output, usage, and the optional durable receipt are strict result fields; receipt states are settled, refunded, or reconciliation-required (`src/modules/capability-execution/operation-invoke-contracts.ts:113-160,172-216`). The stored invocation contains the pinned Operation, input, result, usage, evidence, attempt, and reconciliation fields with indexed lookup paths (`src/modules/capability-execution/internal/convex-schema.ts:170-213`).

Receipt tests exclude sensitive provider/payment material, preserve receipt identity across state changes, and round-trip receipts through terminal and reconciliation projections (`tests/unit/capability-execution/operation-receipt-contract.test.ts:71-215`). Recovery HTTP tests cover scope, principal/correlation propagation, canonical reconciliation evidence, uncertain cancellation, and body/path identity (`tests/unit/server/operation-recovery-api.test.ts:70-190`). The Workpool test covers a completed free-tier result, not the entire paid receipt lifecycle. The strict hosted smoke and validator exist, but `output/release` currently contains only `chat-conformance-vitest.json`; there is no exact-revision production gateway receipt in this checkout.

### 5. Continue and repeat

Two distinct meanings of repeat must not be conflated:

1. **Same-call replay** is well covered. CLI cold-loop replay returns the recorded result and proves one provider effect (`tests/unit/market-terminal/cold-loop.test.ts:382-478`), and the Workpool integration test proves the same property against the durable backend (`tests/integration/capability-operation-workpool.test.ts:382-390`).
2. **A later capability gap returning to the market** is not covered. Market evidence records invocation, completed invocation, settlement, qualified use, and reconciliation-required facts (`convex/marketEvidence.ts:8-13`), while listing evidence aggregates completion count and latency by Operation (`convex/marketListingEvidence.ts:144-177`). Neither establishes a new gap, repeat market search, supplier switching, or bypass. The in-memory liquidity helper can record fill and first-success duration (`src/modules/capability-supply/internal/liquidity.ts:70-100`), but its tests exercise only the helper (`tests/unit/capability-supply/supply-liquidity.test.ts:14-38`).

Repeat-demand verification is therefore a **product-evidence blocker**, not a reason to add a new product spine. The migration must at minimum preserve the existing evidence facts and make it possible to observe a second market allocation without treating idempotent replay as repeat demand.

## Migration regression matrix

| Regression introduced by moving boundaries | Observable failure | Required verification tier | Existing evidence | Migration addition / gate |
|---|---|---|---|---|
| Route, action ID, CLI/MCP descriptor, or schema drifts | Real consumers call a missing path or parse a different envelope | **unit** plus import-contract | `tests/imports/operation-surface-conformance.test.ts:17-112`; market route unit tests | Run `npm run test:imports`; keep one contract fixture generated from the registered action rather than copied schemas. |
| Search uses a different Operation projection from detail/compare | Price, readiness, call path, or supplier facts change after selection | **unit** and **integration** | Pure coherence test at `tests/unit/capability-supply/operation-projection-search.test.ts:336-368` | Seed two current Operations in Convex and assert search/detail/compare/inspect-plan share Operation ref, revision, price digest, readiness window, and call path. |
| A current publication is dropped while joins or projection parsing fail | Viable supply silently disappears or becomes `no_candidates` | **integration** | Some fail-closed keyless drift tests, but no canonical-search omission reason | Corrupt each required join/config in a fixture; assert an explicit diagnostic counter/audit record and no executable result. Block cutover without observability. |
| Inspect-plan says routeable but call reads a divergent snapshot | Caller approves stale price/effects or receives unexplained refusal | **integration** and **end-to-end** | Separate inspect and call tests only | Add a mutation-between-inspect-and-call test and a hosted consumer journey. Preserve refusal/reinspection behavior and never silently execute changed terms. |
| Reservation, worker, or module adapter loses idempotency identity | Duplicate provider effect or duplicate charge | **integration** | Workpool lifecycle and conformance suites | Make the Workpool replay test mandatory for every invocation-boundary change; add a crash/restart replay at the new adapter boundary. |
| Worker completes but result/receipt projection is lost | Status is terminal without usable output or recovery truth | **unit** and **integration** | Receipt projection refuses to invent success; receipt contract tests | Seed paid terminal, refunded, and reconciliation-required rows through the durable backend and assert status and receipt equality at HTTP/MCP/CLI boundaries. |
| Recovery lookup loses principal/credential scoping | One caller reads or reconciles another caller's invocation | **unit** and **integration** | HTTP recovery and Convex recovery suites | Keep cross-principal negative cases at the public adapter and durable query boundary. |
| Search scales by adding more per-Operation joins or copies full descriptors repeatedly | Latency/query count rises with catalogue size; memory pressure appears before the explicit 256 cap | **integration performance** | No query-count or controlled-size benchmark | Benchmark 1, 20, and 256 current valid Operations; record database reads, projection bytes, wall time, and heap high-water. Fail on query-complexity regression, and set an absolute latency budget from a pre-migration baseline. |
| A mocked “cold loop” passes while real modules no longer compose | Unit suite is green but deployed journey is broken | **end-to-end** | CLI cold-loop uses a fetch mock; browser suite does not call the full market loop | Run the packaged CLI or MCP client against a served app and real test backend: search → compare/detail → inspect-plan → call → status/result/receipt → same-call replay. |
| Invocation facts survive but repeat allocation evidence disappears | Migration cannot tell first use from later market return | **integration** and product **end-to-end** | Evidence aggregates only | Assert existing fact writes at completion; separately exercise a second gap/search/allocation with a distinct demand identity. This is a blocker for market proof, not for transaction-kernel correctness. |
| Exact-revision production proof is absent or belongs to another deployment | Local tests pass while hosted money/receipt joins are broken | release **end-to-end** | Strict smoke and validator source exist | Require the validated receipt artifact for the deployed revision before release acceptance; retain rollback deployment identity with it. |

Tests should be organized around these real consumer and module seams. Splitting them into package-per-domain suites would make cross-boundary regressions easier to miss.

## Performance review

### Query fan-out and hot paths

**Search is the dominant architectural risk.** The source query takes up to 257 current publications and calls `operationRecord` for all of them concurrently (`convex/capabilitySupplyOperationQueries.ts:337-370`). For every publication, `operationRecord` first reads offering, binding, business, and contract (`convex/capabilitySupplyOperationShared.ts:51-65`), then calls qualification (`convex/capabilitySupplyOperationShared.ts:81-96`). Qualification reloads the publication and the same business/contract/offering/binding, then may read catalogue revision, access path, and provider connection (`src/modules/capability-supply/internal/graph/qualify-candidate.ts:83-113,138-199,203-249`; port queries at `convex/capabilitySupplyGraphPorts.ts:21-115`). This is bounded N+1-style fan-out with duplicated joins, potentially thousands of indexed reads at the 256-Operation ceiling.

After reads, search materializes every descriptor, keeps source records, projected candidates, ranked candidates, and one result page in memory (`src/modules/capability-supply/internal/operation-search.ts:188-279`). Tokenization is also repeated: `searchableText` joins and tokenizes the same candidate inside exact-match, partial-match, and each score-token reduction (`src/modules/capability-supply/internal/operation-search.ts:49-88,404-455`). The 256 cap prevents unbounded request memory, but it converts catalogue growth into `source_capacity_exceeded` rather than a scalable search path.

Detail is one `loadCurrent`; compare and inspect-plan parallelize at most four loads, and mapping resolution is bounded at 32 (`src/modules/capability-supply/internal/operation-detail-compare.ts:95-175`; `src/modules/capability-supply/internal/operation-inspect-plan.ts:66-147`). Their fan-out is bounded, but each load still reconstructs the Operation and repeats qualification joins.

Call admission has a different hot path: authentication and source-write admission, current published Operation materialization, grant read, idempotency reservation, and dispatch. It caches the current Operation only within one action invocation (`convex/capabilityOperationInvokeActions.ts:184-209`), which is appropriate. The externally visible gateway timing covers the whole call/status request (`src/lib/server/operation-invoke-api.ts:361-380,521-531`), but there is no equivalent search/detail/compare timing event, query-count measure, or projection-drop measure.

### Materialized projections

The repository already stores a publication row with readiness facts and builds a pinned `PublishedOperation` snapshot for invocation. Discovery, however, reconstructs a separate public descriptor from normalized offering, binding, contract, business, catalogue-origin, and readiness records on every read. Invocation independently rebuilds and validates its published snapshot (`convex/capabilitySupplyOperationKeyless.ts:617-727`). This duplication is a migration hazard as well as a performance cost: discovery can advertise one projection while call admission rejects or materializes another.

The recommended boundary is one **current Operation read model** owned by the existing capability-supply/Operation module, not a new product abstraction. Materialize the immutable contract/commercial/transport projection when publication or revision changes, and update only readiness/availability fields when probes change. Search should read a bounded indexed projection containing canonical Operation ref, supplier facts, price/effects/data-use, readiness, pre-tokenized search text, and a digest that can be joined to the invocation snapshot. Detail/compare/inspect may hydrate the exact full descriptor by Operation ref. Call must still revalidate current readiness, authority, price, and effects at commitment; a search cache must never become call authority.

Migrate with shadow reads: generate old and new projections, compare canonical digests and typed outcomes, emit mismatches, then switch reads behind a rollback flag only after zero unexplained mismatches on representative current data. Preserve `operationRef`, schema versions, refusal codes, and receipt/status behavior.

### Caching and freshness

All four public market HTTP reads explicitly return `Cache-Control: no-store` (`src/routes/api.v1.market-operations.search.ts:60-65` and sibling routes). There is no application cache in the traced search path. Do not introduce a time-only cache for price, readiness, effects, or authority. If discovery projection caching is used, key it by the current projection/snapshot digest and expire it no later than the earliest `readinessValidUntil`; cursor validation must continue to reject a changed snapshot. Compare and inspect-plan should remain exact-current reads, and call must remain a fresh commitment read.

### Memory and durable storage

Search memory is capped but inefficient: full source records include contract schemas, full projected descriptors duplicate those schemas, and scoring repeatedly allocates token arrays before returning at most 20 items. Pre-tokenizing the materialized search projection and projecting full JSON only for the selected page would reduce allocations without changing ranking. Keep the explicit source and request bounds while migrating, and add serialized-byte and heap-high-water observations at 1, 20, and 256 current Operations.

Invocation request memory is bounded at 256 KiB (`src/lib/server/operation-invoke-api.ts:42,356-369`), but each durable invocation stores `operationJson`, `inputJson`, result/output, usage, and recovery state (`src/modules/capability-execution/internal/convex-schema.ts:170-205`). No invocation-retention or archival cleanup was found in the current checkout. That is not grounds to delete recovery evidence: first measure row size and growth, then define a retention/archival policy that preserves durable receipt, audit, dispute, and reconciliation obligations. Migration must not prune uncertain or recoverable work.

### Performance controls for cutover

1. Capture a pre-migration controlled benchmark at 1, 20, and 256 current valid Operations: database query/read count, source rows, projected bytes, heap high-water, and wall time for search; wall time for detail/compare/inspect; admission-to-pending and pending-to-terminal for call.
2. Make query complexity the deterministic CI gate. A materialized search should be a bounded indexed projection read plus page hydration, not per-Operation qualification fan-out. Use latency as a relative non-regression gate in CI and set hosted p95/p99 budgets from the captured baseline.
3. Add search/read timing and outcome telemetry with bounded labels: kind, matched-count bucket, source-count bucket, capacity refusal, and projection-drop count. Never attach query text, Operation input, credentials, or raw output.
4. Shadow the new projection and compare canonical digests before cutover. Keep a read-path rollback switch; do not dual-execute calls or provider effects.
5. Run full source release verification, then the exact-revision hosted gateway smoke. Roll back on projection mismatch, elevated `no_candidates`/unavailable rates, latency regression, receipt/status mismatch, duplicate effect, or any increase in reconciliation-required outcomes unexplained by provider behavior.

## Critical silent failures

| Silent failure | Current visibility/coverage | Disposition before migration |
|---|---|---|
| `operationRecord` returns `undefined` for stored-ref drift, missing joins, invalid transport, malformed price breakdown, or unpublished business; list projection then drops the record (`convex/capabilitySupplyOperationShared.ts:51-78,97-117`). | Some keyless omission cases are tested, but canonical search exposes no omission reason or counter. A dropped viable Operation can look like legitimate `no_candidates`. | **BLOCKER:** add bounded projection-drop diagnostics and fixture cases for each cause; distinguish expected ineligibility from corrupt current material. |
| Discovery and call rebuild different representations of the same Operation. | Pure search/detail/compare coherence exists; no actual Convex inspect-to-call snapshot-coherence test. | **BLOCKER:** add digest/identity parity across public descriptor, inspect facts, and pinned invocation snapshot; mutation between inspect and call must refuse/reinspect rather than execute changed terms. |
| The CLI “complete cold loop” is entirely fetch-mocked. | It proves consumer protocol behavior but can pass when Convex/source composition is broken. | **BLOCKER for cutover:** add one real-backend external-consumer end-to-end journey. Keep the mock as a fast unit test. |
| More than 256 current Operations makes search explicitly unavailable, but the threshold has no current-valid catalogue test or telemetry. | The failure is typed, not silent to the caller, but could be operationally invisible and make the whole market unsearchable after growth. | Add 256/257 current-valid integration cases and alert on `source_capacity_exceeded` before cutover. |
| Gateway telemetry covers call/status, while market reads have no comparable latency, source-count, or projection-drop event. | Search degradation or empty-result inflation can go unnoticed. | **BLOCKER:** add privacy-safe read-path metrics and baseline them before switching projections. |
| A terminal state without a completed result could be mistaken for success by consumers. | `tests/unit/capability-execution/invocation-receipt-view.test.ts:92-105` explicitly keeps it incomplete; strict result/status schemas also help. | Covered at unit level; add durable integration fixture through public status before cutover. |
| Same-call replay can be reported as “repeat demand.” | Replay is strongly tested, but evidence facts do not encode a later gap/search/switch/bypass. | **PRODUCT-EVIDENCE BLOCKER:** preserve replay semantics, but never use replay counts as repeat-market proof. Add a distinct demand/allocation identity only within the existing market evidence boundary. |
| Hosted paid behavior may not match the reviewed revision. | Strict smoke/validator tooling exists, but no production receipt artifact is checked in under `output/release`. | **RELEASE BLOCKER:** require a validated exact-revision gateway receipt and retain the rollback deployment identity. |
| Durable invocation payloads grow without an explicit retention/archival policy. | Request size is bounded; durable row growth and long-term storage are not measured. | Performance blocker only if growth measurement breaches operational limits. Do not delete receipts or uncertain outcomes to solve it. |

## Recommended verification sequence

1. **Before moving code:** land the current-valid 256/257 search fixtures, projection-drop diagnostics, real Convex two-supplier compare/inspect test, public status/receipt integration fixtures, and one external-consumer end-to-end golden journey. Capture performance and query-count baselines.
2. **During migration:** keep contract/import tests green; run old/new projection shadow comparison; run focused unit tests per module seam and Convex integration tests per durable boundary. Never shadow provider execution.
3. **At cutover:** run `npm run test:release:source`; compare controlled benchmark and hosted read metrics; then deploy with the old read path available as rollback.
4. **After deployment:** run and validate the exact-revision hosted gateway receipt. Observe search outcomes, projection mismatches, call latency, duplicate effects, reconciliation-required rate, and receipt/status parity. Roll back the read boundary on unexplained movement while leaving durable invocation recovery active.

This sequence verifies the current Operation transaction kernel and golden journey. It does not claim the still-unproven market wedge, supplier density, usefulness, or repeat allocation has been validated.

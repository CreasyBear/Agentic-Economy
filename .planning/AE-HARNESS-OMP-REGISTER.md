# AE Harness OMP Carry-Over Register

**Date:** 2026-07-03
**Audit commit:** `30e795243812e18197df35c0592524ee60eec137`
**OMP reference:** `/Users/skchan/Jcsyc_Projects/oh-my-pi` at `31a8cfc31cf1e467efa76655ded27e64d2295139`
**Mode:** Operational gate, with OMP as reference architecture and AE's public trust contract unchanged.
**Register rule:** no row may reach `5-operational` without named passing commands, browser evidence, promptfoo/eval evidence, graph freshness, and public leakage checks at the same AE commit.

## Status Scale

| Status | Meaning |
| --- | --- |
| `0-not-started` | No AE artifact yet. |
| `1-reference-read` | OMP reference understood and anchored. |
| `2-internal` | Internal AE primitive exists, but is not wired to the product runtime. |
| `3-projected` | Wired into a product path with focused tests or partial evidence. |
| `4-evaled` | Product path has current unit/integration/eval evidence, but at least one operational gate is still pending. |
| `5-operational` | All required gates passed at the same settled commit, with graph freshness and browser evidence. |
| `rejected` | Intentionally not adopted because it violates AE's trust contract. |

## Current Gate Ledger

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck` | Pass |
| Finalization/admin focused tests | `./node_modules/.bin/vitest run tests/unit/answer-thread/answer-harness-operation.test.ts tests/unit/harness/run-loop.test.ts tests/unit/harness/run-viewer-functions.test.ts tests/unit/harness/run-viewer-projection.test.ts tests/unit/harness/session-journal.test.ts` | Pass: 5 files, 28 tests |
| Focused harness/answer tests | `./node_modules/.bin/vitest run tests/unit/answer-thread tests/unit/harness tests/integration/answer-tool-calls.test.ts` | Pass: 24 files, 119 tests |
| Eval coverage | Included in `npm run test:eval` | Pass: 12 cases, 10 turn cases, 2 thread cases |
| Answer eval report | Included in `npm run test:eval` | Pass: 12 cases, 14 turns, 0 failed, min score 9.84/9, avg 9.99 |
| Promptfoo | Included in `npm run test:eval` | Pass: 27/27 |
| Eval Vitest | Included in `npm run test:eval` | Pass: 2 files, 23 tests |
| Combined eval | `npm run test:eval` | Pass; promptfoo PostHog flush warning was non-fatal telemetry |
| UI contract | `npm run test:ui-contract -- tests/ui-contract/public-language-copy.test.ts` | Pass: 6 files, 36 tests |
| Browser continuity | `./node_modules/.bin/playwright test tests/e2e/thread-first.spec.ts --project=compact-chromium --project=wide-chromium --reporter=line` | Pass with elevated local server permission: 3 passed, 1 skipped |
| Graphify rebuild | `graphify update . && cp graphify-out/graph.json .planning/graphs/graph.json && cp graphify-out/GRAPH_REPORT.md .planning/graphs/GRAPH_REPORT.md && node .codex/gsd-core/bin/gsd-tools.cjs graphify build snapshot && node .codex/gsd-core/bin/gsd-tools.cjs graphify status` | Pass: 18,147 nodes, 17,305 edges, built/current `30e7952`, `commit_stale: false` |
| Graph freshness | `npm run test:graph-freshness` | Fail: graph commit matches HEAD, but graph-relevant dirty paths remain |
| Diff hygiene | `git diff --check` | Pass |

## Dirty Tree Classification

This closeout cannot honestly claim graph freshness until the dirty tree is landed or isolated. Current inventory from `git status --short`:

| Group | Count | Notes |
| --- | ---: | --- |
| OMP closeout | 61 | Harness runtime, answer-thread finalization, admin run viewer, eval and focused tests. |
| Generated graph artifacts | 1 | `.planning/graphs/GRAPH_REPORT.md` currently modified. |
| UI/Astryx migration | 202 | Broad design/component/style/route migration; verified by UI contract but still graph-relevant dirty work. |
| Future billing/work | 20 | Billing and future-phase relocation/deletions. |
| Audit artifacts | 15 | React-doctor/domain audit outputs. |
| Mixed support/other | 85 | Docs, Convex modules, package files, routing, catalog/security/observability support. |

## Progress Register

| ID | OMP pattern | AE target | Priority | Status | Current evidence | Exit criteria |
| --- | --- | --- | ---: | --- | --- | --- |
| R0 | Measurable carry-over register | Register rows with commands, dates, status, and blockers | P0 | `4-evaled` | This register now records exact commands, counts, and dirty-tree blocker | Same settled commit has all gates green, including graph freshness |
| R1 | Authoritative run loop | `HarnessRunLoop` owns answer phase/model/tool execution | P0 | `4-evaled` | `streamAnswerTurn()` runs context, intent, route, retrieval, model, gate, assemble, persist, and report through `HarnessRunLoop.run()` handlers; focused tests pass | Same commit passes graph freshness after dirty tree settlement |
| R2 | Passive run collector | Runtime-fed summary, coverage, timings, failures | P0 | `4-evaled` | Runtime events feed `HarnessRunCollector`; phase/tool/model/gate coverage is tested | Same commit graph freshness and browser evidence remain green |
| R3 | Action-to-tool contract | One schema path feeds quiet tools, model tools, validation, eval fixtures | P0 | `4-evaled` | Action tools carry descriptor hashes, validation, allowlists, load mode, hidden flag, concurrency, interruptibility | Descriptor parity and public allowlist stay green in full closeout suite |
| R4 | Approval/read-write policy | Public reads allowed; qualified inquiry write source-admitted; unsupported writes/exec blocked | P0 | `4-evaled` | Approval policy and eval coverage protect public read/write boundary | Add broader refused/blocked write eval cases before operational |
| R5 | Answer runtime migration | Retrieval/model/gate/persist behind live harness | P0 | `4-evaled` | Live answer turns use harness phase handlers; finalization failure blocks normal complete | Same commit graph freshness passes |
| R6 | Durable session journal/replay | Atomic final report patch plus session entries | P0 | `4-evaled` | `finalizeAnswerTurnHarnessRun` patches final evidence and appends journal entries in one Convex mutation; accepted/replayed/conflict/denied are typed; finalization failure becomes a report-phase persistence failure | Source-backed replay/browser/admin smoke plus graph freshness at same commit |
| R7 | Eval coupling | Promptfoo/Vitest/graph gates prove harness invariants | P0 | `4-evaled` | `npm run test:eval` passes, including promptfoo 27/27 and eval Vitest 23/23 | Keep green after dirty tree is settled and graph freshness passes |
| R8 | Graphify freshness | Graph commit matches current HEAD before operational claims | P0 | `3-projected` | Graph artifacts rebuilt at HEAD `30e7952` and `commit_stale: false`; standalone freshness still fails due graph-relevant dirty paths | `npm run test:graph-freshness` passes after landing or isolating dirty work |
| R9 | Admin run viewer | Operator-only raw evidence and replay UI | P1 | `4-evaled` | Admin-only source readback query exists; run-viewer source tests and public projection leakage tests pass | Browser/admin smoke with seeded source-backed evidence |
| R10 | Protected evidence/compaction | Tool evidence protected during replay/finalization | P1 | `2-internal` | Evidence envelope and protected-evidence primitives exist | Runtime compaction/replay integration and leakage evals pass |
| R11 | Advisor/emission guard | Private reviewer notes suppressed/deduped/rate-limited | P2 | `2-internal` | `HarnessEmissionGuard` unit coverage exists | Wired into reviewer/advisor runtime before any note emission feature ships |
| R12 | Public dynamic tool discovery | OMP-style broad tool discovery exposed publicly | P0 | `rejected` | Violates AE public trust contract | Keep rejected |
| R13 | Shell/filesystem/browser/LSP public tools | Terminal-agent tools exposed to product assistants | P0 | `rejected` | Violates AE public trust contract | Keep rejected |

## Remaining P0 Blockers

1. **Graph freshness:** graph artifacts match `HEAD`, but graph-relevant dirty paths remain. This is now the primary operational blocker.
2. **Same-commit landing:** green evidence exists in the working tree, but not yet at a settled commit that also passes graph freshness.
3. **Admin smoke depth:** source-backed admin readback is implemented and unit-tested, but browser/admin smoke with seeded run evidence is still a follow-up before R9 can be called operational.

## Operational Checklist

- [x] `npm run typecheck`
- [x] Focused finalization/admin tests
- [x] Focused harness/answer Vitest suite
- [x] `npm run test:eval`
- [x] Promptfoo 100% pass rate
- [x] `npm run test:ui-contract -- tests/ui-contract/public-language-copy.test.ts`
- [x] Browser thread continuity on compact and wide Chromium, with local-server elevation
- [x] Graph report commit equals current `HEAD`
- [x] Live persisted answer turns have a final `harnessRun` report patched through source finalization
- [x] Finalization conflict/error blocks normal complete
- [x] Admin-only run readback is source-backed and unit-tested
- [x] Public projection tests exclude raw tool ids, inputs, hashes, provider trace names, and internal event labels
- [ ] `npm run test:graph-freshness`
- [ ] Same settled commit has all of the above evidence
- [ ] Admin viewer browser smoke with seeded source-backed evidence
- [x] `git diff --check`

## Next Slice

The remaining closeout slice is **Graph/Same-Commit Settlement**.

Deliverables:

- Land or intentionally isolate the graph-relevant dirty tree.
- Rebuild graphify after the tree is settled.
- Rerun `npm run test:graph-freshness`.
- Rerun the full gate ledger at the settled commit.
- Add browser/admin smoke for `/admin/runs` with seeded source-backed harness evidence.

## Change Log

- 2026-07-02: Reset register against AE commit `8d7d0f8f8d7b6039be2ffa775d03562f59ca5ea0` and OMP commit `31a8cfc31cf1e467efa76655ded27e64d2295139`.
- 2026-07-02: Downgraded operational claims because graph freshness, combined eval, and current browser evidence were not green together.
- 2026-07-02: Added OMP-style private tool metadata, guard-signal propagation, and shared/exclusive `runToolBatch()` scheduling.
- 2026-07-03: Moved live `streamAnswerTurn()` execution under `HarnessRunLoop.run()` phase handlers, deferred visible assembly until after gate, and patched persisted turn evidence with the final run report.
- 2026-07-03: Added atomic source finalization through `finalizeAnswerTurnHarnessRun`, report-phase finalization failure semantics, source-backed admin run readback, current eval/browser/UI evidence, and dirty-tree graph blocker classification.

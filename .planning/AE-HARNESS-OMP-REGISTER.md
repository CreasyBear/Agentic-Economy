# AE Harness OMP Carry-Over Register

Updated: 2026-07-02
Purpose: measurable progress register for carrying OMP engineering-harness discipline into AE.

Reference:

- OMP checkout: `/private/tmp/oh-my-pi`
- OMP commit: `31a8cfc31cf1e467efa76655ded27e64d2295139`
- AE HEAD for this refresh: `d7db54cfa84dd4c02eebc8afd7478252615b0dd5`
- Current AE graph report: `.planning/graphs/GRAPH_REPORT.md`
- Current AE graph size: `18,266` nodes, `17,364` edges, `26` communities

## Register Rules

Statuses:

- `0-not-started`: no AE artifact exists.
- `1-raw-material`: source evidence exists, but no stable AE abstraction.
- `2-internal`: internal abstraction exists and has focused tests.
- `3-projected`: safe projection or human review surface exists.
- `4-evaled`: named tests/evals/browser checks prove behavior and boundary.
- `5-operational`: exact code, browser, promptfoo/eval, graph, and safety evidence are green in the current tree.
- `blocked`: cannot proceed without a product, security, or architecture decision.
- `rejected`: intentionally not copied into AE.

No row may move to `5-operational` unless it names:

- Code evidence: exact file/type/function.
- Test evidence: exact command and pass/fail.
- Browser evidence: exact Playwright/manual route check and pass/fail.
- Eval evidence: exact promptfoo/eval command and pass/fail.
- Graph evidence: graph freshness against current `HEAD` with no graph-relevant dirty paths.
- Safety evidence: proof public projection/copy does not leak raw harness evidence or expand AE's assistant contract.

## Current Gate Snapshot

Green on this refresh:

- `npm run test:eval`: passed after the live-loop follow-up. Coverage audit 12 cases, suite report 12 cases / 14 turns, promptfoo 27/27, eval Vitest 23 tests. Promptfoo telemetry flush warned on DNS after success.
- `./node_modules/.bin/vitest run tests/unit/harness tests/unit/answer-thread tests/integration/answer-tool-calls.test.ts`: passed after the live-loop follow-up, 24 files / 115 tests.
- `./node_modules/.bin/vitest run tests/unit/harness/run-loop.test.ts tests/unit/answer-thread/answer-harness-operation.test.ts tests/unit/answer-thread/tool-runner.test.ts tests/unit/answer/answer-tool-use-agent.test.ts`: passed, 4 files / 30 tests after live answer loop ownership, live model/tool accounting, and runtime-fed journal changes.
- `./node_modules/.bin/vitest run tests/unit/convex/harness-sessions-runtime.test.ts tests/unit/harness/session-journal.test.ts tests/unit/harness/run-viewer-functions.test.ts`: passed, 3 files / 19 tests.
- `./node_modules/.bin/playwright test tests/e2e/thread-first.spec.ts --project=compact-chromium --project=wide-chromium`: passed after rerun with local-server permission, 3 passed / 1 compact-sidebar skip.
- `git diff --check`: passed.
- Current graph artifact is built from AE HEAD `d7db54cfa84dd4c02eebc8afd7478252615b0dd5`.

Red or not yet proven on this refresh:

- `npm run typecheck`: currently fails on unrelated dirty UI/route work (`Button` variant drift, dynamic listing links, and missing `FactGrid` exports). The live harness files no longer report type errors.
- `npm run test:ui-contract -- tests/ui-contract/public-language-copy.test.ts`: currently fails on unrelated dirty public-shell work because `src/components/ae/layout/AePublicShell.tsx` imports `@clerk/tanstack-react-start`, which the public-copy scan flags as an internal identifier on a public surface.
- `npm run test:graph-freshness`: failed with `graph_relevant_worktree_dirty`; the gate now prints `operational evidence: blocked`, the relevant dirty paths, and next actions.
- Admin run viewer has no production source-read port.
- Full `HarnessRunLoop.run()` state-machine ownership is not complete. The live answer path now uses one harness loop for context, intent, route, retrieval, model, assemble, gate, persist, and report events, but `streamAnswerTurn()` still coordinates the SSE-facing state machine.

Historical green evidence remains useful, but it does not promote rows to `5-operational` unless the current gates above are green.

## Progress Dashboard

| ID | OMP pattern | AE target | Priority | Status | Current evidence | Next measurable step |
| --- | --- | --- | --- | --- | --- | --- |
| R0 | Evidence register | Measurable OMP carry-over checklist | P0 | `4-evaled` | This register now names green typecheck/eval/unit/browser/public-copy/diff gates and blocks `5-operational` on graph freshness plus runtime authority gaps | Rerun graphify after source changes settle and make `npm run test:graph-freshness` green |
| R1 | Live run loop + collector | Reusable harness runtime kernel | P0 | `3-projected` | `src/modules/harness/run-loop.ts` now supports streaming lifecycle `startRun()`/`completeRun()`; focused loop tests green | Move the remaining SSE-facing state machine into `HarnessRunLoop.run()` handlers after dirty tree settles |
| R2 | Schema-first tools | Canonical action-to-harness tool path | P0 | `2-internal` | `src/modules/harness/action-tool.ts`, `src/modules/harness/tool-contract.ts`, approval/schema tests in harness slice | Add descriptor parity tests over quiet descriptor, model descriptor, runtime validation, and eval fixture |
| R3 | Answer run migration | Runtime-fed report on every answer turn | P0 | `3-projected` | `streamAnswerTurn()` creates one live answer harness loop; `runAnswerToolCall()` uses `loop.runTool()`; `runAnswerToolUseAgent()` uses `loop.runModel()`; focused live-path regression green | Rerun promptfoo/browser gates after unrelated dirty typecheck failures are cleared |
| R4 | Session journal/replay | Deterministic durable session projection | P0 | `3-projected` | Runtime events now map into source-write-admitted journal entries for turn/context/intent/tool/model/gate/persist/run report with sanitized public summaries | Add admin source-read port and replay browser smoke; keep public projection leakage tests green |
| R5 | Public-safe projection | Sanitized checks only | P1 | `4-evaled` | Eval and unit coverage check public leakage; `npm run test:eval` green | Rerun browser public flows and public-copy scans after loop migration |
| R6 | Eval coupling | Harness gates in baseline eval | P0 | `4-evaled` | `npm run test:eval` green in current tree; harness cases exist in `eval/answer` | Add eval rows that fail if model/tool phases bypass live collector |
| R7 | Graph-aware review | Graphify freshness gate | P0 | `2-internal` | Graph report at current HEAD with 18,266 nodes / 17,364 edges; `npm run test:graph-freshness` exists | Clear graph-relevant dirty paths, rerun graphify, then make the graph freshness test pass |
| R8 | Internal run viewer | Admin/operator raw run evidence viewer | P2 | `2-internal` | `src/modules/harness/run-viewer.functions.ts` and projections exist; source is disabled by default | Add admin-authorized source read and Playwright smoke before exposing navigation |
| R9 | Advisor/emission guard | Bounded reviewer notes with evidence | P2 | `2-internal` | `src/modules/harness/emission-guard.ts` suppresses public/no-evidence/noise/duplicates/cycle overflow | Wire only when reviewer/advisor emissions are added to journal/admin viewer |
| R10 | Dynamic public tools | Public assistant custom tool discovery | P0 safety | `rejected` | AE trust contract exposes only explicit action-backed tools | Do not copy OMP dynamic public discovery |
| R11 | Shell/filesystem/LSP/browser tools | Product answer tools | P0 safety | `rejected` | AE assistant contract is read/compare/qualified inquiry only | Do not expose non-AE engineering tools to product assistants |

## Required Gates Before Any Row Reaches `5-operational`

- `npm run typecheck`
- `npm run test:eval`
- `./node_modules/.bin/vitest run tests/unit/harness tests/unit/answer-thread tests/integration/answer-tool-calls.test.ts`
- `./node_modules/.bin/playwright test tests/e2e/thread-first.spec.ts --project=compact-chromium --project=wide-chromium`
- `npm run test:ui-contract -- tests/ui-contract/public-language-copy.test.ts`
- `npm run test:graph-freshness`
- `git diff --check`

## First Operational Slice Acceptance Criteria

R1-R4 are not operational until all of these are true:

- `streamAnswerTurn()` delegates the complete turn state machine to `HarnessRunLoop.run()` handlers.
- Real and planned answer model calls are recorded through harness model phases.
- Tool begin/end/error/timeout/abort records are captured by the live collector, not reconstructed after the fact.
- Every newly persisted complete/error/refused/blocked answer turn includes private `harnessRun` evidence.
- Harness session entries are co-written from live runtime events at the answer persistence boundary.
- Replay projection can rebuild public-safe thread state without raw tool ids, inputs, hashes, or internal trace names.
- Admin run viewer source reads are authenticated and covered by a browser/admin smoke.
- Graph freshness is green after implementation settles.

## Implementation Evidence Log

- 2026-07-02: Added reusable harness kernel under `src/modules/harness/`.
- 2026-07-02: Added focused unit tests under `tests/unit/harness/`.
- 2026-07-02: Adapted answer tool runner and quiet agent-tools execution toward `runHarnessTool()`.
- 2026-07-02: Added private `FrozenTurnEvidence.harnessRun` and public projection leakage tests.
- 2026-07-02: Created OMP comparison artifacts and wrote the first OMP re-audit.
- 2026-07-02: Rewrote `.planning/AI-SPEC.md` as the discovery + OMP-gold harness implementation contract.
- 2026-07-02: Added live `HarnessRunLoop`, richer collector telemetry, canonical `HarnessToolContract`, AE approval policy modes, pure journal/replay helpers, protected evidence envelope, graph freshness gate, admin run viewer scaffold, and harness emission guard.
- 2026-07-02: Added the answer finalization bridge through `answer-harness-operation.ts`.
- 2026-07-02: Added Convex-backed harness session schema/functions and runtime tests while keeping public answer projection sanitized.
- 2026-07-02: Re-audited against OMP and demoted operational claims that are not supported by the current graph/browser/source-read/runtime evidence.
- 2026-07-02: Sharpened `npm run test:graph-freshness` output so dirty graph-relevant paths explicitly block operational evidence and point to settle/rebuild/rerun actions.
- 2026-07-02: Added source-write-admitted answer journal co-writing for `turn.started`, `gate.evaluated`, `turn.persisted`, and `run.reported`, with a persistence bridge test proving public summaries stay sanitized.
- 2026-07-02: Moved the live answer path onto one `HarnessRunLoop` for context/intent/route/retrieval/model/assemble/gate/persist/report events; answer tools now use `loop.runTool()`, answer model requests use `loop.runModel()`, and the session journal is fed from runtime events rather than the compact finalization spine when a live loop is present.
- 2026-07-02: Fixed `?q=` thread-start idempotence in `AeChat` by moving initial-query startup out of render and reran thread-first browser continuity green.

## Safety Boundary

OMP is architectural reference code, not a vendored dependency. AE remains limited to:

- `registry.search`: read-only public catalog search.
- `registry.detail`: read-only public listing detail.
- `inquiry.submit`: source-write-admitted qualified inquiry only.

This register explicitly rejects OMP-style dynamic public tool discovery, shell/filesystem/browser/LSP product tools, booking, payment, dispatch, arbitrary writes, and autonomous fulfillment.

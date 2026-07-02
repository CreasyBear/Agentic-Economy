# AE Harness OMP Carry-Over Register

Generated: 2026-07-02
Purpose: measurable progress register for carrying OMP engineering-harness discipline into AE.
Primary OMP reference: `/Users/skchan/Jcsyc_Projects/oh-my-pi` commit `31a8cfc31cf1e467efa76655ded27e64d2295139`.
AE baseline: commit `f614a82075365c016da70fe7024e30b2d2885d85`.

## Register Rules

Statuses:

- `0-not-started`: no AE artifact exists.
- `1-raw-material`: source evidence exists, but no stable AE abstraction.
- `2-internal`: internal abstraction exists and has focused tests.
- `3-projected`: safe projection or human review surface exists.
- `4-evaled`: named tests/evals/browser checks prove behavior and boundary.
- `5-operational`: exact code, browser, promptfoo/eval, and graph evidence are green.
- `blocked`: cannot proceed without a product, security, or architecture decision.
- `rejected`: intentionally not copied into AE.

No row may move to `5-operational` unless it names:

- Code evidence: exact file/type/function.
- Test evidence: exact command and pass/fail.
- Browser evidence: exact Playwright/manual route check and pass/fail.
- Eval evidence: exact promptfoo/eval command and pass/fail.
- Graph evidence: graph freshness against current `HEAD`, or explicitly marked stale.
- Safety evidence: proof public projection/copy does not leak raw harness evidence or expand AE's assistant contract.

## Current Gate Snapshot

Green evidence from the first kernel pass:

- `npm run typecheck` passed.
- `./node_modules/.bin/vitest run tests/unit/harness tests/unit/answer-thread/answer-run-summary.test.ts tests/unit/answer-thread/public-projection.test.ts tests/unit/answer-thread/tool-runner.test.ts tests/unit/answer/answer-tool-use-agent.test.ts tests/integration/answer-tool-calls.test.ts tests/integration/agent-tools-api.test.ts` passed: 9 files / 42 tests.
- `npm run test:eval` passed.
- `npm run test:eval:coverage` passed: 12 cases, 10 turn cases, 2 thread cases, broad seed 100.
- `npm run test:eval:report` passed: 12 cases / 14 turns, min score 9.84/9, p95 1133ms.
- `PROMPTFOO_CONFIG_DIR=.promptfoo-home PROMPTFOO_DISABLE_WAL_MODE=true promptfoo eval -c eval/answer/promptfooconfig.yaml --no-cache` passed through `npm run test:eval`: 27/27.
- `./node_modules/.bin/vitest run tests/eval` passed: 18 tests.
- `AE_SCAN_MODE=clean ./node_modules/.bin/vitest run tests/ui-contract/public-language-copy.test.ts` passed: 1 test.
- `./node_modules/.bin/playwright test tests/e2e/thread-first.spec.ts --project=compact-chromium --project=wide-chromium` passed: 3 passed, 1 compact-sidebar skip.
- `git diff --check` passed.
- OMP side graphify build passed: `69,345` nodes, `65,123` edges, built at `31a8cfc`, `commit_stale: false`.
- OMP side `.planning/codebase` map exists with 7 docs / 674 total lines; secret-pattern scan returned no matches.
- AE graphify rebuild passed: `17,343` nodes, `16,489` edges, built at `f614a82`, `commit_stale: false`.

Green evidence from the OMP-gold scaffold pass:

- `.planning/AI-SPEC.md` rewritten as the discovery + harness implementation contract.
- `npm run typecheck` passed after the scaffold integration pass.
- `./node_modules/.bin/vitest run tests/unit/harness tests/eval tests/integration/agent-tools-api.test.ts` passed: 13 files / 88 tests.
- `./node_modules/.bin/vitest run tests/unit/harness tests/unit/answer-thread tests/unit/schema/convex-schema.test.ts tests/unit/convex/harness-sessions-runtime.test.ts tests/eval tests/integration/agent-tools-api.test.ts tests/integration/answer-tool-calls.test.ts` passed: 29 files / 149 tests.
- `npm run test:eval` passed: coverage audit passed, suite report passed, promptfoo passed 27/27, and eval Vitest passed 23 tests.
- `npm run check:convex-codegen` passed with network escalation after sandbox DNS blocked Convex/Sentry telemetry.
- `AE_SCAN_MODE=clean ./node_modules/.bin/vitest run tests/ui-contract/public-language-copy.test.ts` passed: 1 test.
- `./node_modules/.bin/playwright test tests/e2e/thread-first.spec.ts --project=compact-chromium --project=wide-chromium` passed with escalation after sandbox listen/watch limits: 3 passed, 1 compact-sidebar skip.
- Scoped `git diff --check` passed for `.planning/AI-SPEC.md`, `src/modules/harness`, `tests/unit/harness`, `eval/answer`, `tests/eval`, `tests/scripts`, `src/routes/api.agent.tools.ts`, `src/routes/admin.runs.tsx`, `src/components/ae/harness`, `src/lib/operator/navigation.ts`, `src/routeTree.gen.ts`, and `package.json`.
- `npm run test:graph-freshness` exists and is wired into `npm run test:release`.

Known non-green evidence:

- `npm run test:ui-contract -- tests/ui-contract/public-language-copy.test.ts` still expands to the full UI-contract directory and fails `tests/ui-contract/class-scan.test.ts` on pre-existing arbitrary visual-token violations.
- Full `git diff --check` is blocked by unrelated pre-existing EOF whitespace in `src/components/ai-elements/message.tsx` and `src/modules/observability/funnel.capture.server.ts`.
- `npm run test:graph-freshness` correctly fails with `graph_relevant_worktree_dirty` until the graph is rebuilt after the relevant harness/eval/projection changes settle.
- The live `HarnessRunLoop`, journal/replay, protected evidence, admin viewer scaffold, and advisor guard are implemented and tested, but the answer runtime is still only bridged at finalization/report assembly rather than fully orchestrated by the harness loop.

## Progress Dashboard

| ID | OMP pattern | AE target | Priority | Status | Current evidence | Next measurable step |
| --- | --- | --- | --- | --- | --- | --- |
| R0 | Evidence register | Measurable OMP carry-over checklist | P0 | `2-internal` | This file now requires code/test/browser/eval/graph/safety evidence before `5-operational` | Re-run graph freshness and browser session continuity |
| R1 | Live run loop + collector | Reusable harness runtime kernel | P0 | `2-internal` | `src/modules/harness/run-loop.ts`, enriched `HarnessRunCollector`, `tests/unit/harness/run-loop.test.ts`, `tests/unit/harness/run-collector.test.ts`; focused harness/eval/API tests and typecheck green | Wire answer turns through `runHarnessRunLoop()` and demote post-hoc builders to legacy/backfill |
| R2 | Schema-first tools | Canonical `HarnessToolContract` path | P0 | `2-internal` | `src/modules/harness/tool-contract.ts`; quiet `/api/agent/tools` list now uses `describeHarnessToolForQuietAgent()`; descriptor parity and agent-tools tests green | Add parity tests over answer-model tool descriptors and provider-compatible function-name policy |
| R3 | Answer run migration | Persist runtime-fed harness report on answer turns | P0 | `2-internal` | `src/modules/answer-thread/internal/answer-harness-operation.ts` bridges answer finalization into `HarnessRunLoop`; answer-thread tests and evals green | Move intent, retrieval, model tool-use, gates, and persistence behind the live harness loop instead of finalization-only report assembly |
| R4 | Session journal/replay | Deterministic durable session projection | P0 | `2-internal` | Pure journal/replay helpers plus Convex `harnessSessions` / `harnessSessionEntries` schema/functions exist; runtime tests green | Co-write answer turns with journal entries and add browser-backed stale/replay recovery evidence |
| R5 | Public-safe projection | Sanitized checks only | P1 | `4-evaled` | Existing `answerCheckSummary`; tests forbid `harnessRun` / raw tool fields; browser session continuity green | Clear broader UI-contract class scan and graph freshness |
| R6 | Eval coupling | Harness gates in promptfoo/eval baseline | P0 | `4-evaled` | Harness eval metadata, coverage audit, graph freshness test, answer suite, promptfoo 27/27, and eval Vitest are green | Add more promptfoo rows once intent/retrieval/model execution move inside the live harness loop |
| R7 | Graph-aware review | Graphify freshness gate | P0 | `2-internal` | `tests/scripts/assert-graph-fresh.ts`, `npm run test:graph-freshness`, and release-gate wiring exist; gate currently fails on relevant dirty worktree | Rebuild graph after implementation settles, then require freshness in register evidence |
| R8 | Internal run viewer | Admin/operator raw run evidence viewer | P2 | `2-internal` | `/admin/runs` scaffold, projection helpers, UI components, tests green; nav link hidden until production source-read exists | Add admin-authorized Convex/source read and Playwright admin viewer smoke before exposing navigation |
| R9 | Advisor guard | Bounded reviewer/dedupe guard | P2 | `2-internal` | `src/modules/harness/emission-guard.ts` and focused tests green; not wired into answer runtime | Wire only when reviewer/advisor emissions are added to journal/admin viewer |
| R10 | Dynamic public tools | Public assistant custom tool discovery | P0 safety | `rejected` | AE trust contract exposes only explicit actions | Do not copy OMP dynamic tool discovery into public/product assistant tools |
| R11 | Shell/filesystem/LSP/browser tools | Product answer tools | P0 safety | `rejected` | AE assistant contract is read/compare/qualified inquiry only | Do not expose non-AE tools to product assistants |

## R1-R3 Acceptance Criteria

The first rebuild slice is not operational until all of these are green:

- `src/modules/harness/` exports `HarnessRun`, `HarnessEvent`, `HarnessToolDefinition`, `HarnessToolResult`, `HarnessRunSummary`, `HarnessRunCoverage`, `HarnessSessionEntry`, and `HarnessApprovalPolicy` equivalents.
- Run collector tests prove stable sorted coverage, per-tool counters, error/timeout/abort accounting, and empty summary.
- Actions convert to harness tools from their Zod schemas.
- Strict JSON-schema validation rejects incompatible enum/const declarations before model/runtime exposure.
- Approval policy auto-allows reads, blocks writes without source-write admission, and rejects exec tools.
- Answer tool calls run through the harness while preserving existing public answer records.
- Every newly persisted complete/error answer turn includes both `answerRun` and private `harnessRun`.
- Public projection exposes only sanitized counts and never raw tool ids, inputs, hashes, or internal trace names.

## Required Gates Before `5-operational`

- `npm run typecheck`
- `npm run test:eval`
- `./node_modules/.bin/vitest run tests/unit/harness tests/unit/answer-thread tests/integration/answer-tool-calls.test.ts`
- `./node_modules/.bin/playwright test tests/e2e/thread-first.spec.ts --project=compact-chromium --project=wide-chromium`
- `npm run test:ui-contract -- tests/ui-contract/public-language-copy.test.ts`
- `git diff --check`
- Graph freshness check: graph commit/hash must match current `HEAD`, or this register remains graph-stale.

## Implementation Evidence Log

- 2026-07-02: Added reusable harness kernel under `src/modules/harness/`.
- 2026-07-02: Added focused unit tests under `tests/unit/harness/`.
- 2026-07-02: Adapted answer tool runner to execute AE actions through `runHarnessTool()`.
- 2026-07-02: Adapted quiet agent-tools POST execution to `runHarnessTool()` while preserving response compatibility.
- 2026-07-02: Added private `FrozenTurnEvidence.harnessRun` and public projection leakage tests.
- 2026-07-02: Fixed answer-thread navigation for persisted error turns so new threads still route to `/t/$threadId`.
- 2026-07-02: Added sanitized session-storage recent-thread projection to keep sidebar continuity across home/thread remounts without storing session ids.
- 2026-07-02: Browser gate passed after the session continuity fix: 3 passed, 1 compact-sidebar skip.
- 2026-07-02: Created side OMP checkout at `/Users/skchan/Jcsyc_Projects/oh-my-pi`, generated OMP `.planning/codebase`, built fresh OMP graph, rebuilt fresh AE graph, and wrote `.planning/AE-HARNESS-OMP-RE-AUDIT.md`.
- 2026-07-02: Rewrote `.planning/AI-SPEC.md` as the authoritative discovery + OMP-gold harness implementation contract.
- 2026-07-02: Added pure live `HarnessRunLoop`, richer collector telemetry, canonical `HarnessToolContract`, AE approval policy modes, pure journal/replay helpers, protected evidence envelope, graph freshness gate, admin run viewer scaffold, and advisor emission guard.
- 2026-07-02: Reconciled `/api/agent/tools` to list quiet tools through the canonical harness descriptor path and hid the admin run-viewer nav entry until a production source-read is wired.
- 2026-07-02: Added the answer finalization bridge through `answer-harness-operation.ts` so persisted answer evidence is assembled from the harness collector rather than only the legacy answer summary builder.
- 2026-07-02: Added Convex-backed harness session schema/functions and runtime tests while keeping public answer projection sanitized.
- 2026-07-02: Verified the current scaffold with `npm run typecheck`, the 29-file focused Vitest slice, `npm run test:eval`, `npm run check:convex-codegen`, public-copy UI contract, browser thread continuity, and scoped `git diff --check`.

## Safety Boundary

OMP is architectural reference code, not a vendored dependency. AE is still limited to:

- `registry.search`: read-only public catalog search.
- `registry.detail`: read-only public listing detail.
- `inquiry.submit`: source-write-admitted qualified inquiry only.

This register explicitly rejects OMP-style dynamic public tool discovery, shell/filesystem/browser/LSP product tools, booking, payment, dispatch, arbitrary writes, and autonomous fulfillment.

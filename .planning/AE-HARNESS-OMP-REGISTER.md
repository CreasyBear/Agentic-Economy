# AE Harness OMP Carry-Over Register

Generated: 2026-07-02
Purpose: measurable progress register for carrying OMP engineering-harness discipline into AE.
Primary OMP reference: `/private/tmp/oh-my-pi` commit `31a8cfc31cf1e467efa76655ded27e64d2295139`.
AE baseline: commit `1d4ce46a262637cc675b6cc229a9200cb572555e`.

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

Green evidence from this kernel pass:

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

Known non-green evidence:

- `npm run test:ui-contract -- tests/ui-contract/public-language-copy.test.ts` still expands to the full UI-contract directory and fails `tests/ui-contract/class-scan.test.ts` on pre-existing arbitrary visual-token violations.
- Graph evidence is stale until `.planning/graphs/graph.json` is regenerated and its commit/hash matches current `HEAD`.

## Progress Dashboard

| ID | OMP pattern | AE target | Priority | Status | Current evidence | Next measurable step |
| --- | --- | --- | --- | --- | --- | --- |
| R0 | Evidence register | Measurable OMP carry-over checklist | P0 | `2-internal` | This file now requires code/test/browser/eval/graph/safety evidence before `5-operational` | Re-run graph freshness and browser session continuity |
| R1 | Run collector + coverage | Reusable harness kernel | P1 | `4-evaled` | `src/modules/harness/*`, `HarnessRunCollector`, `HarnessRunReport`, focused tests/typecheck/eval/browser green | Add graph freshness and internal viewer before operational claim |
| R2 | Schema-first tools | ActionDefinition to harness tool contract | P1 | `4-evaled` | `actionToHarnessTool()`, `runHarnessTool()`, `resolveHarnessApproval()`, strict schema guard, quiet POST route backed by harness, focused tests green | Add descriptor parity assertions for quiet descriptors vs model tools |
| R3 | Answer run migration | Persist harness report on answer turns | P1 | `4-evaled` | `FrozenTurnEvidence.harnessRun`, `buildHarnessRunReportForAnswer()`, answer tool runner uses harness, tests/eval/browser green | Add eval artifact assertion that every saved complete/error turn has `harnessRun` |
| R4 | Session journal/replay | Deterministic session projection | P1 | `3-projected` | `HarnessSessionEntry`, `appendHarnessSessionEntry()`, `buildHarnessSessionProjection()`, sanitized browser-session recent-thread projection | Wire persisted answer-thread replay to journal and graph it |
| R5 | Public-safe projection | Sanitized checks only | P1 | `4-evaled` | Existing `answerCheckSummary`; tests forbid `harnessRun` / raw tool fields; browser session continuity green | Clear broader UI-contract class scan and graph freshness |
| R6 | Eval coupling | Harness gates in promptfoo/eval baseline | P1 | `1-raw-material` | Eval suite previously green; no harness-specific promptfoo assertions yet | Add eval cases for `harnessRun`, blocked/refused tools, stale replay, leakage |
| R7 | Graph-aware review | Graphify freshness gate | P2 | `1-raw-material` | `.planning/graphs/graph.json` exists but is not proven fresh | Add graph commit/HEAD freshness check and rerun graphify |
| R8 | Internal run viewer | Admin/operator raw run evidence viewer | P2 | `0-not-started` | Private run evidence exists in persisted turn evidence | Add authenticated internal viewer after R1-R5 gates are green |
| R9 | Advisor guard | Bounded reviewer/dedupe guard | P2 | `0-not-started` | OMP `AdvisorEmissionGuard` pattern audited | Implement only after run reports and viewer exist |
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

## Safety Boundary

OMP is architectural reference code, not a vendored dependency. AE is still limited to:

- `registry.search`: read-only public catalog search.
- `registry.detail`: read-only public listing detail.
- `inquiry.submit`: source-write-admitted qualified inquiry only.

This register explicitly rejects OMP-style dynamic public tool discovery, shell/filesystem/browser/LSP product tools, booking, payment, dispatch, arbitrary writes, and autonomous fulfillment.

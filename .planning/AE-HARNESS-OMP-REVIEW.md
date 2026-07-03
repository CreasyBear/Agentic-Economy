# AE Harness Review Through OMP

Generated: 2026-07-02T02:01:00Z
Review frame: `/plan-eng-review`
Scope: AE harness slice, using `can1357/oh-my-pi` as the comparison system.
Status: DONE_WITH_CONCERNS

## Verdict

AE should borrow OMP's control-plane discipline, not its terminal-tool surface.

The highest ROI move is to turn AE's existing answer evidence into a first-class
run summary and coverage object. The code already stores most of the raw material:
tool calls, input JSON, result hashes, timings, gate results, providers, allowed
slugs, work log, and frozen prose. OMP's big win is that it folds those moving
parts into stable per-run values that can be persisted, diffed, shown in debug UI,
and asserted in evals.

Do not copy OMP's shell, file editing, LSP, custom plugin discovery, or dynamic
public tool activation into AE's product surface. AE's trust contract depends on a
small explicit action registry.

## Scope Challenge

### What already exists

```text
AE today

Action contract
  src/modules/common/action.ts
    -> id, summary, boundaries, Zod input/output, readOnly, surfaces
    -> agent descriptor with JSON schema

Action registry
  src/modules/actions/index.ts
    -> explicit imports
    -> listActions/findAction/listAgentToolActions

Quiet agent door
  src/routes/api.agent.tools.ts
    -> list descriptors
    -> invoke exposed actions
    -> schema-parse input

Answer tool runner
  src/modules/answer-thread/internal/tool-runner.ts
    -> only registry.search/detail
    -> rejects unknown/write tools
    -> validates input and output
    -> records inputJson, resultSummaryJson, resultHash, status

Answer turn orchestrator
  src/modules/answer-thread/internal/turn-orchestrator.ts
    -> retrieval-first search
    -> work log
    -> timings
    -> frozen evidence
    -> persisted tool calls before complete event

Answer eval harness
  eval/answer/*
    -> coverage tags
    -> promptfoo config parity
    -> expected tool inputs/gate checks
```

### Minimum complete upgrade

The minimum useful harness upgrade is not a new agent framework. It is four small
internal layers:

```text
1. answer-run-summary.ts
   raw evidence -> stable run summary + coverage

2. action-tool-schema.ts
   Zod action schema -> one model-facing and agent-facing JSON schema path

3. retrieval-plan.ts
   query + searchContext -> explicit display query, service query, location scope,
   actual tool query, divergence reason

4. request-body-limits.ts
   route-level body cap before request.json()
```

This keeps the diff engineered enough: explicit, testable, and close to current
files. It avoids a broad harness rewrite.

### Scope not in this pass

- No terminal shell, filesystem, LSP, browser, or editing tools in AE product flows.
- No dynamic public plugin/tool discovery.
- No multi-agent public answer loop.
- No booking, payment, dispatch, live availability, or autonomous fulfillment.
- No hidden typo correction preprocessor.
- No generated Graphify JSON committed back into the repo.

## Architecture Comparison

### OMP Harness Shape

```text
User / CLI / TUI
      |
      v
+------------------------------+
| Agent session                |
| context files, skills, rules |
+---------------+--------------+
                |
                v
+------------------------------+
| Agent loop                   |
| model call -> tool calls     |
| tool results -> next turn    |
+------+----------+------------+
       |          |
       |          v
       |   +-------------------+
       |   | Tool registry     |
       |   | built-in          |
       |   | custom            |
       |   | discoverable      |
       |   +---------+---------+
       |             |
       |             v
       |   +-------------------+
       |   | Tool execution    |
       |   | validation        |
       |   | approval          |
       |   | concurrency       |
       |   | updates/results   |
       |   +---------+---------+
       |             |
       v             v
+------------------------------+
| Run collector                |
| chats, tools, status, usage  |
| summary + coverage           |
+---------------+--------------+
                |
                v
+------------------------------+
| Session history              |
| compaction, protected reads  |
| advisor notes, replay        |
+------------------------------+
```

OMP is an operating environment for engineering agents. It optimizes for tool
breadth, session survival, recovery, editing, and human operator visibility.

### AE Harness Shape

```text
Human chat / external assistant
      |
      +-----------------------------+
      |                             |
      v                             v
+------------------+       +----------------------+
| /api/answer/turn |       | /api/agent/tools     |
| public answer    |       | quiet assistant door |
+--------+---------+       +----------+-----------+
         |                            |
         v                            v
+----------------------+      +-------------------+
| Answer orchestrator  |      | Action registry   |
| intent, retrieval,   |      | registry.*        |
| SSE, persistence     |      | inquiry.submit    |
+----------+-----------+      +---------+---------+
           |                            |
           v                            v
+----------------------+      +-------------------+
| Read tool runner     |      | Action runner     |
| registry.search      |      | source functions  |
| registry.detail      |      | admission gates   |
+----------+-----------+      +---------+---------+
           |                            |
           v                            v
+------------------------------------------------+
| Convex source state                            |
| answer turns, tool calls, catalog, inquiries   |
+------------------------------------------------+
           |
           v
+------------------------------------------------+
| Public projection                              |
| provider cards, prose, agent JSON URL, gates   |
+------------------------------------------------+
```

AE is not a general agent harness. It is a trust and discovery product with a
small machine surface. The right improvement is a stronger internal run control
plane around that small surface.

## Concept Mapping

| OMP concept | AE equivalent | Recommendation |
| --- | --- | --- |
| `AgentTool` with schema, approval, concurrency, summary | `ActionDefinition` with schema, surfaces, readOnly, boundaries | Keep AE action shape. Add optional harness metadata only when a real answer/eval need appears. |
| Run collector summary/coverage | Tool calls + timings + frozen evidence | Add `AnswerRunSummary` and `AnswerRunCoverage`. Highest ROI. |
| Tool result status: ok/error/skipped/blocked/timeout/aborted | `complete/error/refused` | Extend only if AE starts tracking timeout/aborted distinctly. Do not overfit now. |
| Discoverable tools via BM25 | No public equivalent | Do not copy for external assistants. Maybe use internally for engineering docs/tools later. |
| Hashline snapshots | `snapshotHash`, `resultHash`, frozen evidence | Borrow the philosophy: stale/fabricated evidence is rejected, not patched over. |
| Compaction with protected tool outputs | Public thread projection hides raw tool calls | For AE, compact UI transcript only. Never compact frozen evidence or hashes. |
| Advisor/watchdog | None yet | Add internal read-only reviewer for answer evidence/copy, with code-enforced dedupe. |
| Skills/context files/rules | `AGENTS.md`, `PRODUCT.md`, `DESIGN.md`, `.planning/codebase`, Graphify | Use for engineering harness context. Do not expose as product tools. |

## ROI Ranking

### R1. Answer Run Summary And Coverage

Priority: P1
Confidence: 9/10
Effort: human ~3-5h / CC ~30-60min
Files:
- `src/modules/answer-thread/answer-thread.schema.ts`
- `src/modules/answer-thread/internal/turn-orchestrator.ts`
- new `src/modules/answer-thread/internal/answer-run-summary.ts`
- tests under `tests/unit/answer-thread`

OMP evidence:
- `/private/tmp/oh-my-pi/packages/agent/src/run-collector.ts` defines pure
  `AgentRunSummary` and `AgentRunCoverage`.

AE evidence:
- `AnswerToolCallRecord` already stores tool id, input JSON, result summary,
  result hash, status, and created time.
- `FrozenTurnEvidence` already stores providers, allowed slugs, search context,
  tool calls, timings, and work log.

Target shape:

```ts
type AnswerRunSummary = {
  route: {
    intent: FollowUpIntent
    mode: 'clarify' | 'answer' | 'compare' | 'filter' | 'empty' | 'boundary' | 'error'
    usedModel: boolean
  }
  tools: {
    available: readonly AnswerToolId[]
    invoked: readonly AnswerToolId[]
    unused: readonly AnswerToolId[]
    total: number
    complete: number
    error: number
    refused: number
    byName: Record<AnswerToolId, { total: number; complete: number; error: number; refused: number }>
  }
  evidence: {
    providerCount: number
    allowedSlugCount: number
    resultHashes: readonly string[]
    snapshotHash: string
  }
  gates: {
    ok: boolean
    code?: string
  }
  timings: {
    totalEntries: number
    totalDurationMs: number
    byName: Record<string, { count: number; totalDurationMs: number }>
  }
}
```

Why this pays:
- Debug answer failures without replaying everything.
- Let evals assert run behavior, not only visible prose.
- Build an operator/debug view cheaply later.
- Aggregate answer quality across cases.
- Catch "model called no tools" and "tool unavailable" as first-class states.

### R2. Unify Action Schemas For Model Tools

Priority: P1
Confidence: 9/10
Effort: human ~1-2h / CC ~15-25min
Files:
- `src/modules/common/action.ts`
- `src/modules/answer/internal/action-to-tool-spec.ts`
- `tests/unit/answer/answer-tool-use-agent.test.ts`

Current split:

```text
quiet agent descriptor
  action.schema -> convertSchemaToJsonSchema -> inputJsonSchema

OpenRouter tool descriptor
  action.parameters[] -> hand-built flat object schema
```

The current code intentionally leaves constraints like max length and integer
bounds to server-side Zod validation. Server validation must remain final, but
the model should see the richer schema too. This is low-risk because the quiet
agent descriptor already uses the converter.

### R3. First-Class Retrieval Plan

Priority: P1
Confidence: 9/10
Effort: human ~5-8h / CC ~60-120min
Files:
- new `src/modules/answer/internal/retrieval-plan.ts`
- `src/modules/answer-thread/internal/turn-orchestrator.ts`
- `src/modules/answer/internal/answer-tool-use-agent.ts`
- `tests/unit/answer/retrieval-plan.test.ts`
- `tests/integration/answer-turn-empty-state.test.ts`

Current flow:

```text
query + searchContext
   |
   +-> planAnswerTurn()
   |      missing service/place? clarify
   |
   +-> buildInitialRegistrySearchInput()
   |      inject near_me location if no user place
   |
   +-> runAnswerToolCall(registry.search)
   |
   +-> optional model tool loop
          applySearchContextToRegistrySearchInput()
```

Needed shape:

```text
query + searchContext
   |
   v
+---------------------+
| resolveRetrievalPlan|
+----------+----------+
           |
           +-> displayQuery: original user wording
           +-> serviceQuery: planned registry text
           +-> locationConstraint: optional place + source
           +-> scope: near_me | whole_catalogue
           +-> reason: named, testable
           +-> divergence: actual model tool input, if different
```

This matches the branch design doc and gives tests one stable seam. It also
avoids hidden typo correction while still allowing model-chosen correction as
persisted evidence.

### R4. Body Caps Before JSON Parse

Priority: P1
Confidence: 9/10
Effort: human ~2-3h / CC ~30-45min
Files:
- new `src/lib/server/request-body-limits.ts`
- `src/routes/api.agent.tools.ts`
- `src/routes/api.answer.turn.ts`
- `src/routes/api.chat.ts`
- `src/routes/api.answer.follow-up-chips.ts`
- `src/routes/api.observability.funnel.ts`
- route tests

Current risky pattern:

```text
POST route
  -> request.json()
  -> Zod parse
  -> rate/source/domain checks
```

Target:

```text
POST route
  -> check method/content type
  -> check Content-Length when present
  -> bounded read helper when absent
  -> JSON parse
  -> Zod/domain/rate checks
```

This is not glamorous, but it protects the expensive harness path.

### R5. Internal Evidence Viewer

Priority: P2
Confidence: 8/10
Effort: human ~1 day / CC ~2-3h
Files:
- answer-thread read APIs
- owner/admin/operator route, not public human surface

View:

```text
Turn
  query
  intent
  retrieval plan
  tool calls
    seq, tool, input, status, result hash, slugs
  timings
  gate
  snapshot hash
  public projection
```

This is the human-facing equivalent of OMP's tool execution trace. It should be
operator/admin only.

### R6. Bounded Internal Advisor

Priority: P2
Confidence: 7/10
Effort: human ~1-2 days / CC ~3-5h

Do this only after R1 exists. The advisor should read an `AnswerRunSummary`,
frozen evidence, and final prose, then return structured review findings.

Hard rules:
- read-only
- no action calls
- no inquiry submission
- no public transcript injection
- code-enforced dedupe and noise suppression
- max one advisory per turn

Borrow directly from OMP's `AdvisorEmissionGuard`: prose instructions are not a
control mechanism. The guard must enforce dedupe and suppress content-free notes.

### R7. Durable Rate Limits And Idempotency

Priority: P2
Confidence: 8/10
Effort: human ~1-2 days / CC ~3-5h

The current answer/chat limiter is process-local. For a single instance it is
fine. For production topology, store rate counters and turn idempotency in a
durable backend keyed by session plus IP/origin signals.

### R8. Graphify As Engineering Harness Context

Priority: P3
Confidence: 7/10
Effort: human ~0.5-1 day / CC ~1-2h

Graphify should power internal codebase navigation and review context, not public
answer behavior. The current graph report is commit-stale:

```text
built_at_commit: ecba2fe
current_commit:  1d4ce46
commits_behind:  2
```

Use Graphify to find affected communities before review, produce architecture
maps, and warn when graph artifacts are stale. Do not depend on it for runtime
product truth.

## Test Coverage Diagram

```text
CODE PATHS                                                  CURRENT COVERAGE

[+] Action contract
  defineAction()
    -> [★★ TESTED] descriptors list through agent-tools API
    -> [GAP] full JSON schema parity for model tools

[+] Quiet agent door
  GET /api/agent/tools
    -> [★★ TESTED] exposes registry + inquiry boundaries
  POST /api/agent/tools
    -> [★★ TESTED] content type, unknown tool, invalid input
    -> [★★ TESTED] registry.search literal behavior
    -> [GAP] [CRITICAL] successful inquiry.submit via agent door
    -> [GAP] oversized body rejected before parse

[+] Answer turn route
  POST /api/answer/turn
    -> [★★ TESTED] rate limit happy/limited
    -> [GAP] oversized body rejected before parse
    -> [GAP] durable multi-instance rate limiter

[+] Answer tool runner
  runAnswerToolCall()
    -> [★★★ TESTED] registry.search complete + hash
    -> [★★★ TESTED] literal misspelling empty result
    -> [★★★ TESTED] invalid input error record
    -> [★★★ TESTED] unknown/write tool refused
    -> [GAP] timeout/abort status if route signal cancels tool call

[+] Answer tool-use agent
  real OpenRouter loop
    -> [★★ TESTED] feeds tool JSON back to model
    -> [★★ TESTED] disables tools for frozen follow-up
    -> [★★ TESTED] chosen tool input persisted
    -> [GAP] run summary captures rounds, fallback prose, and failures
  planned test seam
    -> [★★ TESTED] typo recovery through model tool input
    -> [★★ TESTED] near-me context attached to registry.search

[+] Retrieval/location
  provider-location-filter
    -> [★★★ TESTED] user place beats tool/context
    -> [★★★ TESTED] model correction can win for typo
    -> [★★ TESTED] service summary is not location evidence
    -> [GAP] first-class retrieval plan fixture table

[+] Persistence
  append turn + tool calls
    -> [★★ TESTED] buffered tool calls persist with turn
    -> [★★ TESTED] public projection hides raw tool trace
    -> [GAP] summary/coverage persists or derives deterministically

[+] Evals
  answer eval coverage
    -> [★★ TESTED] coverage tags audited
    -> [★★ TESTED] promptfoo config parity checked
    -> [GAP] evals assert run summary and coverage, not only prose/tool inputs

COVERAGE ESTIMATE
  Current harness behavior: good for safety primitives
  Missing harness observability: run summary, schema parity, pre-parse caps,
  retrieval plan fixtures, durable rate topology
```

Legend:
- `★★★` behavior + edge/error coverage
- `★★` happy path plus some boundary coverage
- `GAP` missing coverage or missing artifact

## Failure Modes

| Failure | Current behavior | Gap | Recommendation |
| --- | --- | --- | --- |
| Model calls a write tool from public answer loop | Refused by known tool set and read-only checks | Good | Keep answer loop read-only. |
| Model omits tools and writes plausible prose | Can return empty grounded answer | No run-level signal that tools were unused | R1 summary should flag available-but-unused tools. |
| Model repeatedly fails prose JSON | Throws `prose_failed` | No loop-break summary beyond error | R1 summary should record final failure code and model rounds. |
| Tool output validates but is low-value empty | Stored as complete with zero slugs | No "useless/no-match" classification | Add optional result class in summary, not tool status. |
| External assistant sends huge JSON body | Parsed before route cap | Memory/CPU cost before validation | R4 body cap. |
| Agent-tools write path drifts | Boundaries exist, invalid input tested | Missing success/write admission test | Add successful `inquiry.submit` route test. |
| Search context injection happens in two places | Orchestrator and tool-use agent both apply context | Drift risk | R3 retrieval plan as shared source. |
| Graph report gets stale | Status reports commit stale | Human may read old topology | Make Graphify freshness a review preflight warning. |

## Code Quality Review

### Finding 1. Harness state is observable but not summarized

Severity: P1
Confidence: 9/10

AE has the raw evidence rows, but no stable rollup equivalent to OMP's
`AgentRunSummary`. This makes every debug/eval/dashboard question re-parse
different JSON fields.

Recommendation: add `answer-run-summary.ts` and derive the summary from frozen
turn evidence. Persist it in `evidenceJson.runSummary` or derive on read first,
then promote to a field later if needed.

### Finding 2. Retrieval planning is split across orchestration and agent loop

Severity: P1
Confidence: 9/10

`buildInitialRegistrySearchInput()` injects context for retrieval-first search.
`applySearchContextToRegistrySearchInput()` injects context for model tool calls.
The branch design doc already names the missing abstraction: retrieval plan.

Recommendation: extract a pure resolver and make both paths consume it.

### Finding 3. Model-facing tool schema is lower-fidelity than action schema

Severity: P1
Confidence: 9/10

The quiet agent descriptor uses Zod-derived JSON Schema. The OpenRouter tool path
uses flat `ActionParameter[]`. Server validation still catches bad inputs, but
the model sees a weaker contract.

Recommendation: generate OpenRouter parameters from the same schema path. Keep
`parameters[]` as human/doc metadata if useful.

### Finding 4. Request parsing is ahead of body-size enforcement

Severity: P1
Confidence: 9/10

Multiple public POST routes call `request.json()` before visible app-level body
caps. This is already called out in `.planning/codebase/CONCERNS.md`.

Recommendation: one shared helper, route-specific limits, tests that use a large
body and assert parsing is avoided when possible.

### Finding 5. OMP dynamic discovery is attractive but wrong for AE public tools

Severity: P2
Confidence: 8/10

OMP's discoverable/custom tool system is a good terminal harness feature. In AE,
external assistants need a small named contract. Dynamic discovery would make
the trust boundary harder to audit.

Recommendation: explicit registry stays. If discovery is used, keep it inside
developer/operator tooling.

## Performance Review

```text
Hot path: /api/answer/turn

request body
  -> parse JSON
  -> rate limit
  -> access check
  -> retrieval-first registry.search
  -> optional model loop
  -> gate
  -> persist evidence
  -> SSE complete
```

Performance issues:

1. Body parse before cap can waste CPU/memory before rate limit.
2. Model rounds are timed but not summarized, so latency budgets are hard to see.
3. Tool-call timings exist but need aggregation by phase/name.
4. Registry fallback and source-state concerns are larger product scaling issues,
   but answer run summary would expose when retrieval latency starts drifting.

## Recommended Implementation Tasks

- [ ] T1 (P1, human: ~4h / CC: ~45min) - Answer harness - Add `AnswerRunSummary` and `AnswerRunCoverage`.
  - Surfaced by: Architecture review finding 1.
  - Files: `src/modules/answer-thread/answer-thread.schema.ts`, new `src/modules/answer-thread/internal/answer-run-summary.ts`, unit tests.
  - Verify: `npm run test:unit -- tests/unit/answer-thread`.

- [ ] T2 (P1, human: ~2h / CC: ~20min) - Tool schemas - Generate OpenRouter tool parameters from action Zod schemas.
  - Surfaced by: Architecture review finding 3.
  - Files: `src/modules/answer/internal/action-to-tool-spec.ts`, `tests/unit/answer/answer-tool-use-agent.test.ts`.
  - Verify: `npm run test:unit -- tests/unit/answer/answer-tool-use-agent.test.ts`.

- [ ] T3 (P1, human: ~6h / CC: ~90min) - Retrieval harness - Extract `resolveRetrievalPlan()`.
  - Surfaced by: Architecture review finding 2 and branch design doc.
  - Files: new `src/modules/answer/internal/retrieval-plan.ts`, `turn-orchestrator.ts`, `answer-tool-use-agent.ts`.
  - Verify: resolver fixture tests plus `tests/integration/answer-turn-empty-state.test.ts`.

- [ ] T4 (P1, human: ~3h / CC: ~40min) - HTTP harness - Add pre-parse body limits to public POST routes.
  - Surfaced by: Security/performance review finding 4.
  - Files: new `src/lib/server/request-body-limits.ts`, route handlers, integration tests.
  - Verify: targeted route tests for oversized bodies.

- [ ] T5 (P1, human: ~3h / CC: ~45min) - Agent write safety - Add successful `inquiry.submit` quiet-door test.
  - Surfaced by: `.planning/codebase/CONCERNS.md`.
  - Files: `tests/integration/agent-tools-api.test.ts`, inquiry source test ports if needed.
  - Verify: `npm run test:integration -- tests/integration/agent-tools-api.test.ts`.

- [ ] T6 (P2, human: ~1 day / CC: ~2h) - Operator harness - Add an internal evidence/run summary viewer.
  - Surfaced by: OMP TUI comparison.
  - Files: operator/admin route and answer-thread read seams.
  - Verify: projection tests keep raw trace out of public thread pages.

- [ ] T7 (P2, human: ~1-2 days / CC: ~4h) - Review harness - Add bounded answer advisor after run summary exists.
  - Surfaced by: OMP advisor comparison.
  - Files: new internal reviewer module, tests for dedupe/noise/rate limits.
  - Verify: no advisor output reaches public projection unless explicitly rendered as operator-only diagnostic.

- [ ] T8 (P3, human: ~4h / CC: ~1h) - Graph harness - Add Graphify freshness to review/preflight docs.
  - Surfaced by: stale graph status.
  - Files: `.planning/codebase`, maybe `tools/graphify` docs.
  - Verify: graph status reports stale commit when needed.

## Worktree Parallelization

```text
Lane A: Run summary
  modules: src/modules/answer-thread, tests/unit/answer-thread
  depends on: none

Lane B: Tool schema parity
  modules: src/modules/common, src/modules/answer/internal, tests/unit/answer
  depends on: none

Lane C: Body caps
  modules: src/lib/server, src/routes, tests/integration
  depends on: none

Lane D: Retrieval plan
  modules: src/modules/answer, src/modules/answer-thread
  depends on: none, but coordinate with Lane A on evidence shape

Lane E: Operator evidence viewer
  modules: routes/admin or operator, answer-thread read APIs, components
  depends on: Lane A

Lane F: Advisor
  modules: answer internal reviewer, evals/tests
  depends on: Lane A
```

Execution order:

```text
Launch A + B + C in parallel.
Merge A first.
Run D with A's summary shape visible.
Then E or F, depending on whether the next need is human debugging or automated review.
```

Conflict flags:
- A and D both touch answer-thread evidence. Coordinate or run sequentially.
- E should wait for A to avoid building UI over unstable raw JSON.

## Graphify Recommendation

Use Graphify like this:

```text
Before harness work
  graphify status
    -> if commit_stale, rebuild or mark topology stale

During review
  graph communities
    -> answer-thread
    -> answer
    -> registry
    -> tests/eval

After work
  graph report
    -> changed communities
    -> unexpected dependency edges
```

Do not store large generated graph JSON in Git unless there is a clear release
reason. A report and status are enough for human review.

## OMP Features To Copy Carefully

```text
Copy the discipline:
  run summary
  coverage
  tool result status
  immutable evidence
  protected compaction
  advisor dedupe
  schema-first custom operations
  explicit approvals for writes

Do not copy the product surface:
  shell
  filesystem read/edit
  LSP
  browser automation
  dynamic custom tools for public assistants
  generic subagents in public answer loop
```

## Lake Score

Complete choices recommended: 6/6.

The complete version is still small because it builds on existing seams. The
shortcut would be to add an operator page over raw JSON or add more eval cases
without a summary object. That would help once, but it would not improve the
harness as a system.


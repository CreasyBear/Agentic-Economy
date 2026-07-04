---
phase: 07-answer-thread-ai
plan: "07-01"
type: execute
wave: 1
slug: ae-agent-tool-loop
status: complete
completed_at: 2026-06-30
depends_on:
  - .planning/ROADMAP.md
  - .planning/ANSWER-AI-CONTRACT.md
  - .planning/phases/07-answer-thread-ai/07-CONTEXT.md
  - .planning/phases/07-answer-thread-ai/07-DECISIONS.md
  - .planning/phases/07-answer-thread-ai/07-ENGINEERING-PLAN.md
files_modified:
  - src/modules/registry/registry.actions.ts
  - src/modules/actions/index.ts
  - src/modules/common/action.ts
  - src/routes/api.agent.tools.ts
  - src/routes/api.answer.turn.ts
  - src/routes/api.businesses.search.ts
  - src/routes/api.businesses.$slug.ts
  - src/modules/answer/internal/action-to-tool-spec.ts
  - src/modules/answer/internal/answer-tool-use-agent.ts
  - src/modules/answer/internal/answer-llm-prompts.ts
  - src/modules/answer/internal/evidence-assembler.ts
  - src/modules/answer/internal/answer-gate.ts
  - src/modules/answer/tools/registry-search.tool.ts
  - src/modules/answer-thread/answer-thread.schema.ts
  - src/modules/answer-thread/public.ts
  - src/modules/answer-thread/answer-thread.functions.ts
  - src/modules/answer-thread/internal/tool-runner.ts
  - src/modules/answer-thread/internal/turn-orchestrator.ts
  - src/modules/answer-thread/internal/turn-guard.ts
  - src/modules/answer-thread/internal/convex-schema.ts
  - src/modules/answer-thread/internal/commands.ts
  - convex/answerThreads.ts
  - convex/registry.ts
  - tests/unit/answer/answer-tool-use-agent.test.ts
  - tests/unit/answer-thread/tool-runner.test.ts
  - tests/integration/answer-tool-calls.test.ts
  - tests/integration/agent-tools-api.test.ts
  - tests/integration/answer-turn-empty-state.test.ts
  - tests/integration/registry-api.test.ts
requirements: [P7-R1, P7-R2, P7-R3, P7-R4, P7-R5]
autonomous: true
must_haves:
  truths:
    - id: p7-registry-search-action
      statement: "`registry.search` is a read-only AE action registered beside `inquiry.submit`, exposed through `/api/agent/tools`, and backed by the same public DTO subset as `/api/businesses/search`."
    - id: p7-registry-literal
      statement: "The registry remains literal. Direct `paramata` / `parammata` searches do not silently become Parramatta."
    - id: p7-tool-argument-recovery
      statement: "Misspelling or vague-intent recovery happens only when the answer agent chooses better `registry.search` arguments and the chosen input is persisted."
    - id: p7-no-hidden-rewrite
      statement: "Phase 7 does not ship a hidden LLM query-rewrite preprocessor before catalog search."
    - id: p7-read-tools-only
      statement: "The public answer loop can call read tools only; write actions such as `inquiry.submit` remain explicit qualified-inquiry paths."
    - id: p7-exact-answer-toolset
      statement: "The public answer synthesis toolset is exactly `registry.search` and `registry.detail`, not every read-only action exposed through `/api/agent/tools`."
    - id: p7-real-tool-result-feedback
      statement: "The LLM path feeds actual `registry.search` / `registry.detail` result JSON back to the model before accepting final prose."
    - id: p7-fail-closed-evidence
      statement: "Provider-bearing `complete` cannot emit unless `answerTurns` plus matching `answerToolCalls` are persisted, unless the turn is explicitly non-shareable/error/no-provider."
    - id: p7-reconstructable-tool-results
      statement: "Tool evidence persists validated input and reconstructable safe public result JSON, not only slugs or a hash."
    - id: p7-static-rewrite-guard
      statement: "Static validation blocks hidden rewrite paths and production `retrievalQuery` use before catalog search."
---

# 07-01 — AE Agent Tool Loop Plan

## Objective

Promote catalog search/detail into AE actions and make Phase 7 answer generation tool-led: the answer agent receives the exact public answer read toolset, calls `registry.search` / `registry.detail` with explicit arguments, receives actual tool result JSON before final prose, and the server gates/provider-completes only after persisted evidence exists. This replaces hidden typo/query rewrite with visible, testable tool choice and fail-closed evidence.

## Authority Inputs

- `AGENTS.md`: actions are declared once in `src/modules/*/*.actions.ts` and registered through `src/modules/actions/index.ts`.
- `.planning/ANSWER-AI-CONTRACT.md`: facts come from AE read tool results; prose is gated.
- `07-DECISIONS.md` D-16/D-17/D-18/D-19: action/tool loop, exact answer read-tool set, fail-closed provider evidence, read tools only in public answer loop, and rewrite guardrails.
- Official tool-use architecture references consulted for this plan:
  - OpenAI tools/function calling: https://platform.openai.com/docs/guides/tools
  - Anthropic tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
  - Model Context Protocol tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools

## Scope

### In

- `registry.search` action, read-only, public facts only.
- `registry.detail` action if the existing detail read can be safely exposed with the same public subset as `/api/businesses/$slug`.
- `/api/agent/tools` descriptor and invocation tests for registry read actions.
- Answer-turn tool evidence schema/runner for validated input, safe public result JSON, result slugs/count, result hash, status, and error/refusal state.
- Real LLM tool loop proof: final prose is accepted only after actual registry action result JSON has been returned to the model.
- Provider-bearing completion proof: `answerTurns` and matching `answerToolCalls` persist before a provider-bearing `complete` or shareable answer is accepted.
- Removal or hard-disable of hidden LLM query-rewrite before registry search, with static guard coverage.
- Tests proving direct registry search remains literal while answer-agent tool choice can recover a misspelled user query by calling search with corrected arguments.
- Tests proving the public answer toolset is exactly `registry.search` / `registry.detail`, even if other read-only actions exist for external assistants.

### Out

- Booking, payment, dispatch, or any write action from public answer chat.
- Owner/private data in tool results.
- Open-web search.
- Vector DB, LangChain, LlamaIndex, DSPy runtime.
- Public tool traces using internal architecture vocabulary.

## Implementation Steps

| ID | Change | Files | Acceptance |
| --- | --- | --- | --- |
| 07-01-A | Add registry read actions and exact answer tool whitelist. | `src/modules/registry/registry.actions.ts`, `src/modules/actions/index.ts`, `src/modules/common/action.ts`, `src/routes/api.agent.tools.ts`, `src/modules/answer/internal/action-to-tool-spec.ts`, `src/modules/answer-thread/answer-thread.schema.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `tests/integration/agent-tools-api.test.ts`, `tests/unit/answer-thread/tool-runner.test.ts` | `GET /api/agent/tools` lists `registry.search` and `registry.detail` as read-only external assistant tools; `POST /api/agent/tools` invokes search/detail; the answer tool runner and LLM tool spec expose exactly `registry.search` / `registry.detail` and refuse `inquiry.submit` or any other action. |
| 07-01-B | Make the LLM path a real tool loop with actual result JSON feedback. | `src/modules/answer/internal/answer-tool-use-agent.ts`, `src/modules/answer/internal/answer-llm-prompts.ts`, `src/modules/answer/internal/action-to-tool-spec.ts`, `src/modules/answer-thread/internal/tool-runner.ts`, `tests/unit/answer/answer-tool-use-agent.test.ts`, `tests/unit/answer-thread/tool-runner.test.ts` | Tests prove the model chooses tool calls, the server runs the registry action, the actual action result JSON is returned to the model before final prose, and prose without prior tool result JSON cannot produce provider-bearing completion. |
| 07-01-C | Persist reconstructable tool evidence and fail closed before provider-bearing complete. | `src/modules/answer-thread/internal/turn-orchestrator.ts`, `src/modules/answer-thread/internal/commands.ts`, `src/modules/answer-thread/internal/convex-schema.ts`, `src/modules/answer-thread/answer-thread.functions.ts`, `src/modules/answer-thread/public.ts`, `convex/answerThreads.ts`, `tests/integration/answer-tool-calls.test.ts`, `tests/integration/answer-turn-empty-state.test.ts` | `answerTurns` and matching `answerToolCalls` persist validated input plus safe public result JSON/hash/status before a provider-bearing `complete`; persistence failure emits error or marks the turn non-shareable; no provider-bearing share projection can be reconstructed without tool evidence. |
| 07-01-D | Keep registry search literal and block hidden rewrite paths. | `src/routes/api.businesses.search.ts`, `src/routes/api.businesses.$slug.ts`, `src/modules/registry/registry.actions.ts`, `src/modules/registry/internal/search.ts`, `src/modules/answer/tools/registry-search.tool.ts`, `src/modules/answer/internal/evidence-assembler.ts`, `tests/integration/registry-api.test.ts`, `tests/integration/answer-turn-empty-state.test.ts` | Direct `paramata` / `parammata` registry search stays literal; typo recovery appears only when the tool-use agent chooses corrected `registry.search` arguments; static guard fails on `registry-query-rewrite`, `AE_LLM_QUERY_REWRITE`, or production `retrievalQuery` use before catalog search. |
| 07-01-E | Gate provider artifacts and prose against persisted tool/frozen evidence. | `src/modules/answer/internal/answer-gate.ts`, `src/modules/answer-thread/internal/turn-guard.ts`, `src/modules/answer-thread/internal/turn-orchestrator.ts`, `tests/unit/answer/answer-tool-use-agent.test.ts`, `tests/integration/answer-tool-calls.test.ts` | Every provider slug in prose/artifacts belongs to current registry tool results or permitted frozen evidence; provider-bearing complete cannot bypass persisted evidence; unsupported/write-action requests resolve to boundary copy without invoking write tools. |

## Product Design Pass

- **Primary user/job/object/outcome:** customer or assistant asks a natural-language local-service need; object is a trusted answer turn; outcome is listed providers, comparison, and a safe route to listing or qualified inquiry.
- **States:** no tool called yet, tool input accepted, tool result empty, tool result populated, tool invalid/refused, tool error, grounded prose, gate fallback, evidence persistence failed, non-shareable/error turn.
- **Copy:** human surfaces say "Searching listed businesses" and "Reading listings"; they do not expose tool traces or internal architecture terms.
- **Boundary:** AE reads, compares, summarizes, and routes. It does not book, charge, dispatch, or silently send inquiries from answer chat.

## Verification

```text
./node_modules/.bin/vitest run tests/unit/answer/answer-tool-use-agent.test.ts tests/unit/answer-thread/tool-runner.test.ts
./node_modules/.bin/vitest run tests/integration/answer-tool-calls.test.ts tests/integration/agent-tools-api.test.ts tests/integration/answer-turn-empty-state.test.ts tests/integration/registry-api.test.ts
if rg -n "registry-query-rewrite|AE_LLM_QUERY_REWRITE" src; then exit 1; fi
if rg -n "retrievalQuery" src/modules/answer src/modules/answer-thread src/routes/api.answer.ts src/routes/api.answer.turn.ts; then exit 1; fi
npm run typecheck
```

## Stop Conditions

- `registry.search` exists only as an answer-local helper and is not registered as an AE action.
- The public answer loop inherits arbitrary read-only `/api/agent/tools` actions instead of whitelisting exactly `registry.search` and `registry.detail`.
- LLM final prose is generated without feeding actual `registry.search` / `registry.detail` action result JSON back to the model.
- Tool evidence stores only result slugs/hash without reconstructable safe public result JSON.
- A provider-bearing `complete` event or share projection can emit before `answerTurns` and matching `answerToolCalls` are persisted.
- A hidden LLM query-rewrite step runs before catalog search.
- Static validation allows `registry-query-rewrite`, `AE_LLM_QUERY_REWRITE`, or production `retrievalQuery` before catalog search.
- Direct registry search typo-corrects misspelled suburbs.
- The answer loop calls `inquiry.submit` or any write action without a separate approval/admission decision.
- Tool results expose private owner fields, raw DB rows, prompts, gate internals, or unsupported booking/payment/dispatch claims.

## Closeout Evidence

Create `.planning/phases/07-answer-thread-ai/07-01-SUMMARY.md` with:

- tools/actions added and boundaries,
- exact public answer tool whitelist proof,
- literal registry typo tests,
- answer-agent tool-choice recovery test,
- actual registry result JSON fed back to model before final prose test,
- tool evidence persistence proof,
- provider-bearing fail-closed persistence proof,
- static rewrite guard proof,
- copy/overclaim guard results,
- exact verification command output.

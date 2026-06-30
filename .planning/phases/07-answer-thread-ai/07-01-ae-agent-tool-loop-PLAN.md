---
phase: 07-answer-thread-ai
plan: "07-01"
type: execute
wave: 1
slug: ae-agent-tool-loop
status: ready-for-execution
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
  - src/modules/answer/tools/registry-search.tool.ts
  - src/modules/answer/internal/answer-llm-prompts.ts
  - src/modules/answer/internal/synthesize-with-fallback.ts
  - src/modules/answer/internal/chat-answer-stream.ts
  - src/modules/answer-thread/internal/tool-runner.ts
  - src/modules/answer-thread/internal/convex-schema.ts
  - src/modules/answer-thread/internal/commands.ts
  - src/routes/api.agent.tools.ts
  - tests/unit/actions/registry.test.ts
  - tests/integration/agent-tools-api.test.ts
  - tests/integration/answer-turn-empty-state.test.ts
  - tests/unit/answer/synthesize-with-fallback.test.ts
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
---

# 07-01 — AE Agent Tool Loop Plan

## Objective

Promote catalog search/detail into AE actions and make Phase 7 answer generation tool-led: the answer agent receives typed read tools, calls `registry.search` / `registry.detail` with explicit arguments, and the server gates prose against those tool results. This replaces hidden typo/query rewrite with visible, testable tool choice.

## Authority Inputs

- `AGENTS.md`: actions are declared once in `src/modules/*/*.actions.ts` and registered through `src/modules/actions/index.ts`.
- `.planning/ANSWER-AI-CONTRACT.md`: facts come from AE read tool results; prose is gated.
- `07-DECISIONS.md` D-16/D-17: action/tool loop, read tools only in public answer loop v1.
- Official tool-use architecture references consulted for this plan:
  - OpenAI tools/function calling: https://platform.openai.com/docs/guides/tools
  - Anthropic tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
  - Model Context Protocol tools: https://modelcontextprotocol.io/specification/2025-06-18/server/tools

## Scope

### In

- `registry.search` action, read-only, public facts only.
- `registry.detail` action if the existing detail read can be safely exposed with the same public subset as `/api/businesses/$slug`.
- `/api/agent/tools` descriptor and invocation tests for registry read actions.
- Answer-turn tool evidence schema/runner for validated input, result slugs/count, result hash, status, and error/refusal state.
- Removal or hard-disable of hidden LLM query-rewrite before registry search.
- Tests proving direct registry search remains literal while answer-agent tool choice can recover a misspelled user query by calling search with corrected arguments.

### Out

- Booking, payment, dispatch, or any write action from public answer chat.
- Owner/private data in tool results.
- Open-web search.
- Vector DB, LangChain, LlamaIndex, DSPy runtime.
- Public tool traces using internal architecture vocabulary.

## Implementation Steps

| ID | Change | Files | Acceptance |
| --- | --- | --- | --- |
| 07-01-A | Add registry read actions. | `src/modules/registry/registry.actions.ts`, `src/modules/actions/index.ts`, `tests/unit/actions/registry.test.ts`, `tests/integration/agent-tools-api.test.ts` | `GET /api/agent/tools` lists `registry.search` and `registry.detail` as read-only; `POST /api/agent/tools` invokes search; direct misspelled search remains empty/literal. |
| 07-01-B | Make answer-local registry helper delegate to the action. | `src/modules/answer/tools/registry-search.tool.ts`, answer evidence assembler callers | One implementation owns action schema, boundaries, and DTO mapping; no duplicate search semantics. |
| 07-01-C | Add tool evidence for answer turns. | `src/modules/answer-thread/internal/tool-runner.ts`, `convex-schema.ts`, `commands.ts`, answer-thread tests | Turn persistence records tool id, input, result slugs/count, result hash, status, and error/refusal state; public projection omits raw prompts and internal gate logs. |
| 07-01-D | Replace hidden rewrite with explicit tool choice. | `answer-llm-prompts.ts`, `synthesize-with-fallback.ts`, `chat-answer-stream.ts`, tests | No pre-search rewrite path ships. LLM path prompts the model to choose tool arguments. Tests show `paramata` only recovers when the model/tool-choice stub calls `registry.search` with a better query. |
| 07-01-E | Gate prose against tool results. | answer gate / synthesizer tests | Every provider slug in prose/artifacts belongs to current tool results or permitted frozen evidence; failure falls back deterministic or emits safe error. |

## Product Design Pass

- **Primary user/job/object/outcome:** customer or assistant asks a natural-language local-service need; object is a trusted answer turn; outcome is listed providers, comparison, and a safe route to listing or qualified inquiry.
- **States:** no tool called yet, tool input accepted, tool result empty, tool result populated, tool invalid/refused, tool error, grounded prose, gate fallback.
- **Copy:** human surfaces say "Searching listed businesses" and "Reading listings"; they do not expose tool traces or internal architecture terms.
- **Boundary:** AE reads, compares, summarizes, and routes. It does not book, charge, dispatch, or silently send inquiries from answer chat.

## Verification

```text
./node_modules/.bin/vitest run tests/unit/actions/registry.test.ts tests/integration/agent-tools-api.test.ts
./node_modules/.bin/vitest run tests/integration/answer-turn-empty-state.test.ts tests/unit/answer/synthesize-with-fallback.test.ts
npm run typecheck
```

## Stop Conditions

- `registry.search` exists only as an answer-local helper and is not registered as an AE action.
- A hidden LLM query-rewrite step runs before catalog search.
- Direct registry search typo-corrects misspelled suburbs.
- The answer loop calls `inquiry.submit` or any write action without a separate approval/admission decision.
- Tool results expose private owner fields, raw DB rows, prompts, gate internals, or unsupported booking/payment/dispatch claims.

## Closeout Evidence

Create `.planning/phases/07-answer-thread-ai/07-01-SUMMARY.md` with:

- tools/actions added and boundaries,
- literal registry typo tests,
- answer-agent tool-choice recovery test,
- tool evidence persistence proof,
- copy/overclaim guard results,
- exact verification command output.

# Agent stack audit: hand-rolled code vs documented libraries

Date: 2026-08-01

## Decision

Agentic Economy should use each layer for the job it actually owns:

- **Vercel AI SDK 7** owns model transport, typed tools, multi-step tool execution, structured output, retries/abort plumbing, provider metadata, and model errors.
- **OpenRouter's AI SDK provider** owns OpenRouter request/response translation and provider-specific usage metadata.
- **AI Elements** owns reusable chat presentation primitives. Components remain source-vendored because AI Elements is a registry, not a runtime package.
- **Convex** remains AE's source-of-truth persistence and transactional boundary.
- **AE domain modules** continue to own registered-action admission, authority, evidence, refusal, budgets, frozen answer snapshots, Customer Request, and the harness journal.
- **`@convex-dev/agent` is not adopted now.** Latest `0.6.4` peers on AI SDK `^6.0.35`, while this repository uses `ai@7.0.44` and OpenRouter provider 3. More importantly, the component owns message/thread/stream persistence while AE intentionally stores frozen evidence snapshots and append-only harness records. Installing it now would create two lifecycle owners, not remove one.

This is the ponytail cut: delete duplicated transport and presentation plumbing; retain the smaller domain kernel whose invariants the libraries do not provide.

## Sources and installed versions

Primary documentation:

- [OpenAI — A practical guide to building AI agents](https://openai.com/business/guides-and-resources/a-practical-guide-to-building-ai-agents/)
- [Vercel AI SDK](https://ai-sdk.dev/)
- [AI SDK agents](https://ai-sdk.dev/docs/agents/overview)
- [AI SDK tool calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK structured output](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data)
- [AI Elements](https://elements.ai-sdk.dev/)
- [AI Elements Vercel AI frontend guide](https://elements.ai-sdk.dev/docs/vercel-ai-frontend)
- [Convex Agent overview](https://docs.convex.dev/agents/overview)
- [Convex Agent repository](https://github.com/get-convex/agent)
- [Convex Agent streaming](https://docs.convex.dev/agents/streaming)

Audited installed/runtime baseline:

- `ai@7.0.44`
- `@openrouter/ai-sdk-provider@3.x`
- `convex@1.42.0`
- React 19, Tailwind 4
- Convex Agent latest observed: `0.6.4`, not installed

Installed declarations were treated as authority when current web documentation and installed v7 names differed. Notable v7 names: `ToolLoopAgent`, `generateText`, `streamText`, `tool`, `Output.object`, `prepareStep`, `stepCountIs`, and `onStepFinish`. `generateObject` is compatibility-only and deprecated in favor of text generation with `output`.

## Ten-pass direct comparison

### Pass 1 — Agent shape and use-case fit

**Documented pattern:** begin with one model, tools, and instructions; use an execution loop only where the model must choose steps; keep deterministic work deterministic.

**Before:** AE had a valid single-agent domain shape, but generic model-loop mechanics were mixed into domain policy. The answer path included a raw OpenRouter `/chat/completions` loop while the proposal path already used AI SDK.

**After:** one answer agent remains. `src/modules/answer/internal/answer-tool-use-agent.ts` now uses AI SDK multi-step generation. Deterministic retrieval-first, boundary, clarification, inquiry, frozen-evidence, gate, assemble, and persistence paths remain ordinary code. No speculative multi-agent graph was added.

**Verdict:** aligned. The LLM chooses read tools where judgment is useful; deterministic constraints still own authority and completion.

### Pass 2 — Provider transport

**Documented pattern:** use the provider adapter rather than hand-crafting provider HTTP payloads.

**Before:** three raw OpenRouter seams duplicated URL construction, request bodies, response parsing, timeout/retry behavior, structured-output configuration, and provider errors:

- `src/modules/answer/internal/answer-tool-use-agent.ts`
- `src/modules/answer-thread/internal/llm-follow-up-chips.ts`
- `src/modules/customer-request/openrouter-transport.ts`

**After:** all three use `ai` plus the shared OpenRouter model gateway. AE-specific request caps, deterministic fallback, model selection, and cost policy remain outside the adapter.

**Verdict:** duplicated transport removed.

### Pass 3 — Tool declaration and execution

**Documented pattern:** use typed `tool` definitions, schemas, SDK-generated tool calls, and an explicit stop condition.

**Before:** AE manually converted actions to OpenRouter tool JSON, parsed assistant `tool_calls`, constructed tool messages, and controlled rounds.

**After:** `answer-tool-use-agent.ts` uses AI SDK `tool`, `ToolSet`, `generateText`, and `stepCountIs`. The SDK owns call encoding and loop continuation. AE still serializes calls through `runAnswerToolCall` because evidence sequence, budget refusals, registered-action validation, and frozen tool records are product invariants.

**Retained intentionally:** `src/modules/harness/action-tool.ts`, `src/modules/harness/tool-contract.ts`, registered-action lookup, read-only enforcement, approval/effect metadata, strict schemas, output validation, and stable evidence hashes.

**Verdict:** library mechanics replaced; domain execution boundary retained.

### Pass 4 — Structured output

**Documented pattern:** in AI SDK 7 use `generateText({ output: Output.object({ schema }) })` rather than manual provider `response_format` JSON or deprecated `generateObject`.

**Before:** prose, follow-up chips, and Customer Request interpretation had custom JSON extraction/parsing paths around provider responses.

**After:** stable structured-output seams use `Output.object` with Zod schemas. A conservative JSON fallback remains only where an explicitly configured model cannot guarantee structured output or where backward-compatible model text must be accepted; the schema remains authoritative.

**Verdict:** aligned with installed v7.

### Pass 5 — Errors, aborts, retries, usage, and cost

**Documented pattern:** use SDK typed errors and abort/retry options; read standard usage and provider-specific metadata.

**Before:** each raw transport had its own transient-status set, timeout controller, JSON/provider error taxonomy, and token/cost extraction.

**After:** model seams use AI SDK error types/guards, `abortSignal`, `maxRetries`, `LanguageModelUsage`, and `ProviderMetadata`. OpenRouter cost remains provider-specific and optional, read through the shared model gateway. AE still records every model attempt into `HarnessModelRequestRecord`, because AI SDK telemetry does not replace AE's customer/evidence journal.

**Verdict:** generic failure plumbing consolidated without weakening audit evidence.

### Pass 6 — Client streaming and chat state

**Documented pattern:** `useChat` plus `DefaultChatTransport` is the default for ordinary AI SDK `UIMessage` streams.

**Before:** AE had a custom fetch/SSE parser, stream-session multiplexer, event reducer, optimistic settlement, and transcript shell.

**After:** the fragile line-oriented parser was replaced with `eventsource-parser`'s `EventSourceParserStream`. The AE reducer and session multiplexer remain because `/api/answer/turn` streams domain events (`thread`, plan, work step, evidence/source, summary delta, artifact, complete), not an AI SDK `UIMessage` stream. Replacing this with `useChat` would require flattening the domain protocol or maintaining an adapter of similar complexity.

**Verdict:** do not force `useChat`. Reuse the standard SSE parser; retain the domain event state machine until the server contract itself becomes `UIMessage`-native.

### Pass 7 — Convex Agent component

**Documented pattern:** `@convex-dev/agent` provides isolated thread/message/stream-delta tables, generation wrappers, thread context, persistent streaming, search, usage hooks, and React helpers.

**AE reality:** Convex stores:

- frozen answer thread/turn snapshots and buffered tool-call evidence;
- append-only harness sessions and entries;
- engine plan revisions/events;
- separate consequential inquiry threads/messages.

It does not store generic streamed chat messages or token deltas. Completion is deliberately gated on source persistence and harness finalization.

**Compatibility finding:** Convex Agent `0.6.4` requires AI SDK 6 peers. This repository is on AI SDK 7. Installing with peer overrides would couple production state to an unsupported dependency combination.

**Verdict:** reject adoption now. Re-evaluate only when (1) Convex Agent supports AI SDK 7, and (2) AE intentionally chooses message/delta persistence as its canonical answer model. Do not run two thread stores in parallel.

### Pass 8 — AI Elements and visual primitives

**Documented pattern:** copy registry components into the app, then compose them; AI Elements is not a runtime black box.

**Before:** a small local subset borrowed AI Elements names but diverged from the official compound APIs, while AE/Astryx wrappers duplicated message, composer, reasoning, suggestion, and conversation behavior.

**After:** the project source-vendors the applicable official primitives under `src/components/ai-elements/` and composes them into AE journeys. Chat composers, conversation scrolling, suggestions, message surfaces, plan/task/tool/reasoning, model selection, confirmation, empty states, and supporting developer surfaces use one primitive family. Obsolete Astryx chat wrappers and duplicate routing helpers were retired.

**Boundary:** public "reasoning" surfaces show sanitized checks and evidence, never hidden chain-of-thought. That AE semantic rule overrides generic component naming.

**Verdict:** aligned with the registry model and AE disclosure policy.

### Pass 9 — Guardrails, authority, and human control

**Documented pattern:** layer deterministic and model guardrails; rate tools by risk; require human oversight for consequential or irreversible actions; stop on limits and failures.

**AE evidence:** registered actions expose effect/read-only metadata; the harness validates schemas and outputs; answer tools are restricted to registered reads; tool/model budgets and timeouts are explicit; snapshots are gated against source-owned provider slugs and evidence; Customer Request owns approval, interruption, recovery, and consequential action state.

**Decision:** none of this should be replaced by AI SDK callbacks or Convex Agent authorization. Those libraries execute tools but do not define AE authority, evidence classes, source-write admission, or customer mandates.

**Gap retained:** broad content moderation/PII classification is not supplied merely by adopting AI SDK. It remains a product/security control to evaluate against concrete risks, not boilerplate to invent in this refactor.

**Verdict:** strong layered domain guardrails; no false claim that a framework supplies authorization.

### Pass 10 — Deep modules, deletion test, and final architecture

Every retained custom seam had to answer: "What invariant would disappear if this code were deleted?"

**Delete/replace:** provider HTTP requests; manual multi-step tool-call protocol; manual structured-output envelopes; duplicate provider error/usage parsing; hand-written SSE framing parser; duplicate chat/presentation wrappers; redundant route and operator-shell UI patterns.

**Keep:** registered actions; Customer Request; evidence and frozen snapshots; source authorization; gates; budget/refusal semantics; deterministic route selection; persistence/finalization ordering; harness accounting; domain event projection; sanitized public reasoning.

**Final shape:**

```text
User request
  -> deterministic route / Customer Request boundary
  -> AI SDK answer agent when model judgment is needed
       -> OpenRouter provider adapter
       -> typed registered read tools
       -> AE action admission + evidence recording
  -> AE gate and frozen answer snapshot
  -> domain SSE events parsed by eventsource-parser
  -> AI Elements presentation
  -> Convex transactional snapshot + harness journal
```

**Verdict:** boring ownership. Libraries own generic mechanics; AE owns AE.

## Keep / replace / defer matrix

| Seam | Decision | Reason |
|---|---|---|
| Raw OpenRouter fetches | Replace | AI SDK provider already owns transport and provider protocol |
| Manual answer tool loop | Replace | AI SDK `generateText` + tools + `stopWhen` owns the loop |
| Manual structured response envelopes | Replace | `Output.object` is the installed v7 API |
| AE registered-action execution | Keep | Owns effects, authority, validation, refusal, evidence |
| Harness run loop/journal | Keep | Product audit/eval semantics, not generic model telemetry |
| Deterministic retrieval and gates | Keep | More reliable and cheaper than agentizing fixed policy |
| Custom SSE line parser | Replace | Standard parser handles framing correctly |
| AE domain event reducer | Keep | Protocol is richer than generic `UIMessage` parts |
| `useChat` | Defer | Requires a server-contract migration, not a component swap |
| AI Elements source components | Adopt selectively | Official registry is designed for source ownership |
| Convex Agent 0.6.4 | Reject for now | AI SDK 6 peer conflict and duplicate lifecycle ownership |
| Multi-agent orchestration | Reject | No measured single-agent tool-selection failure warrants it |

## Verification record

Observed after the cutover:

- Focused regression suite: 83 tests passed across server seams, local source credentials, Customer Request problem states, offering UI, operator shell, and UI contract.
- Full `oxlint`: passed with warnings denied.
- Production Vite/Nitro build: passed.
- Browser smoke on the fixed local stack: `/owner/status`, `/owner/settings`, `/owner/offerings`, `/owner/request-problems/missing`, `/admin/request-problems`, and `/admin/inquiries` all returned HTTP 200 with no page errors. Source-backed Offerings loaded; missing/private reports rendered bounded states; local admin authorization rendered its explicit access boundary.
- Full TypeScript check is blocked outside this work: nine `TS2307` diagnostics reference removed example modules under `examples/routing-provider`, `examples/routing-agent-directory`, and `examples/routing-edge`. No changed source file appears in the diagnostics.

## Re-evaluation triggers

Revisit the deferred choices only when evidence changes:

1. Convex Agent publishes an AI SDK 7-compatible release and AE elects message/delta persistence as canonical.
2. The answer server emits standard AI SDK `UIMessage` parts end to end; then replace the custom client session/reducer with `useChat` and `DefaultChatTransport`.
3. One agent demonstrably fails tool selection after tool names, descriptions, schemas, and prompts are improved; only then split agents.
4. A new public reasoning UI needs capabilities absent from the vendored AI Elements source; update from the registry instead of creating a second primitive family.

# Phase 7: answer-thread-ai — Context

**Gathered:** 2026-06-30  
**Status:** Ready for implementation planning  
**Source:** `.planning/ANSWER-AI-CONTRACT.md`, CEO review 2026-06-30, `/plan-eng-review`

---

## Phase boundary

Phase 7 turns the `/` chat shell from a **single-query URL snapshot** into a **multi-turn answer session** with Convex persistence, public share, session sidebar history, and an AE agent that calls explicit read tools/actions — while preserving AE's trust contract (catalog-grounded facts, no booking agent cosplay).

Phase 7 **does not** ship owner inbox changes, inquiry workflow changes, Phase 6 business actions, auth-backed thread libraries, hidden typo-correction preprocessors, or open-web search.

Planning proceeds now. Implementation waits for `07-*-PLAN.md` slice files that name files, commands, and stop conditions per sub-phase.

---

## Why now

| Signal | Implication |
| --- | --- |
| Chat-first IA shipped on `/` | Shell exists; missing thread substrate |
| `ANSWER-AI-CONTRACT.md` experience contract | CEO + eng alignment on Perplexity-shaped UX |
| User steer: sidebar v1 | Cannot defer history without breaking product feel |
| `/api/chat` structured path ungrounded | Must unify on synthesizer + gate before LLM default |
| `.ui-craft/decisions.md` "stateless v1" | Superseded by D-03 in `07-DECISIONS.md` |
| Current search pipeline retrieves before prose | Superseded by tool-loop architecture: model chooses `registry.search` inputs, server gates results |
| User steer: no typo correction in registry | Misspelling recovery belongs in tool arguments chosen by the answer agent, not in catalog search |

---

## Current code baseline

```text
/                           AeChat — welcome OR live `AeThreadTurnStreamSection` turn via ?q=
/api/answer?stream=1        deterministicSynthesizer SSE (production path)
/api/chat                   TanStack AI structured — providers[] not gated
src/modules/answer/         synthesizer, artifacts, tools, grounding helpers
src/modules/actions/        action registry; agent tools door currently exposes inquiry.submit only
convex/schema.ts            no answerThreads / answerTurns yet
```

**Gaps:**

- Spec targets `/t/$threadId`; code still navigates to `/?q=`.
- Catalog search exists as a local answer helper and public API, but is not registered as an AE action/tool beside `inquiry.submit`.
- The answer path must not rely on hidden LLM query rewrite. The model should call `registry.search` with explicit search arguments, and the registry should remain literal.

---

## Dependencies

| Dependency | Status | Phase 7 use |
| --- | --- | --- |
| Public registry search | Shipped | Backing read for `registry.search` every provider-bearing turn |
| Action registry + `/api/agent/tools` | Shipped for `inquiry.submit` | Phase 7 adds read-only `registry.search` / detail actions and routes answer-agent tool calls through the same contract |
| `AnswerEvent` SSE | Shipped | Per-turn stream contract |
| `AeArtifactRenderer` | Shipped | Transcript render |
| Convex | Shipped | New tables + queries |
| Observability funnel | Shipped | Session id pattern reference |
| Inquiry `pseudonymousSessionId` | Shipped | Pattern reference, separate namespace |
| Promptfoo eval | Not wired | Blocks LLM chip + LLM default |
| Clerk | Shipped | Not required for v1 sidebar |

---

## Trust constraints (non-negotiable)

- Epistemic vocabulary (`KNOWN` / `UNKNOWN` / …) **never** on public human surfaces.
- Provider cards **before** summary prose on every turn.
- No provider slug without current tool results or frozen prior-turn evidence.
- Public share projection: no inquiry PII, no raw prompts, no gate internals.
- Copy: "What to do now" not "Next step" on human surfaces.
- Registry/search stays literal; typo and intent recovery happen when the answer agent selects tool arguments.
- The human answer loop uses read tools only in v1. Write actions such as qualified inquiry stay on explicit listing/agent-tool paths and must not auto-fire from chat prose.

---

## Related artifacts

| File | Role |
| --- | --- |
| `.planning/ANSWER-AI-CONTRACT.md` | API + pipeline authority |
| `.planning/phases/07-answer-thread-ai/07-DECISIONS.md` | Locked decisions |
| `.planning/phases/07-answer-thread-ai/07-ENGINEERING-PLAN.md` | Architecture + phases |
| `.planning/phases/07-answer-thread-ai/07-01-ae-agent-tool-loop-PLAN.md` | First execution slice for AE read tools and tool-led answer turns |
| `.ui-craft/surfaces/chat.md` | Visual composition |
| `PRODUCT.md` / `AGENTS.md` | Trust + agent contract |

---

## Success picture (v1 done)

1. User opens `/`, submits "after hours plumber Preston".
2. AE agent calls `registry.search` through the action registry, streams turn, lands on `/t/abc123`.
3. Sidebar shows that thread; user starts another from `/`, sidebar lists both.
4. User follow-up "which take inquiries?" appends turn 2 on same thread and filters frozen/source-read evidence.
5. User typo "paramata emergency plumber" can recover only when the agent calls `registry.search` with a better catalog query; no registry-side typo correction.
6. Share `/t/abc123` reconstructs transcript for a friend.
7. Deterministic chips on every turn; no LLM chips until eval passes.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| Dual SSE paths (`/api/answer` vs `/api/chat`) | Unify orchestrator; deprecate chat as product API |
| Sidebar without auth = session loss on cookie clear | Accept v1; document; Clerk attach later |
| LLM slug hallucination | Prose-only schema + gate + deterministic default |
| Hidden search rewrite becomes untestable product behavior | Replace with typed tool calls; persist tool input/result evidence per turn |
| Scope creep (rename, delete, search) | Explicit D-03 / D-15 non-goals |
| Stale `.ui-craft` stateless decision | New decision entry + contract update |

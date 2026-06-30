# Phase 7 Answer Thread AI — Decision Record

**Created:** 2026-06-30  
**Status:** Accepted for planning and implementation  
**Decision owner:** Agentic Economy product + engineering  
**Authority chain:** `PRODUCT.md` → `.planning/ANSWER-AI-CONTRACT.md` → this record → `07-ENGINEERING-PLAN.md`

**Supersedes:** `.ui-craft/decisions.md` entry "Stateless chat v1" (2026-06-30).

---

## Summary

Phase 7 ships a **Perplexity-shaped, trust-honest answer thread** on public `/`: multi-turn transcript, share links, deterministic follow-ups, honest thinking steps, **session-scoped sidebar history after the first prompt**, and an AE agent loop that calls explicit read tools/actions for catalog facts. Facts stay server-owned; LLM writes prose only behind gates. No hidden typo-correction preprocessor, no open-web search, no booking agent, no DSPy in runtime.

---

## D-01 Product posture

- AE answers are **read-only synthesis over the public registry through AE actions/tools**, not general chat.
- Primary human loop: ask → see register work → provider cards (citations) → prose → follow-up chips → qualified inquiry on `/$slug`.
- AE does **not** book, charge, dispatch, or imply verified status without a named standard.
- **Approach B (full thread product)** is locked: Convex-backed threads, `/t/$threadId` active session, public share projection.

## D-02 Information architecture

| Route | Role | v1 |
| --- | --- | --- |
| `/` | New thread shell — welcome, empty transcript, query panel | Yes |
| `/t/$threadId` | Active session — scroll transcript, follow-ups, share | Yes |
| `/?q=` | Legacy entry — create thread + first turn, redirect to `/t/…` | Yes (compat) |
| `/q/$answerId` | Legacy deep link → redirect | Yes (compat) |

- Submitting the first query **creates** `answerThreads` + first `answerTurn`, navigates to `/t/$threadId`.
- Follow-ups **append turns** on the same thread; URL stays on `/t/$threadId`.
- Share link is **`/t/$threadId`** (public read-only projection), not raw `?q=`.

## D-03 Sidebar history (v1 — not deferred)

- **After the first prompt completes**, show a **left sidebar** listing threads for the current browser session.
- Sidebar appears when `threadCount >= 1` for the session (including the active thread).
- Each row: truncated first-query title, relative time, active highlight.
- **New thread** affordance returns to `/` (creates fresh thread on next submit).
- Sidebar is **session-scoped** via `pseudonymousSessionId` — not Clerk account history in v1.
- Mobile: collapsible drawer or bottom sheet; same data, no separate product behavior.
- **Not in v1 sidebar:** rename, delete, search across threads, cross-device sync, Clerk attach.

**Rationale:** Perplexity feel requires wayfinding between recent questions without auth. Deferring sidebar to Phase F made v1 feel like a single-query URL product.

## D-04 Session identity

- Issue or reuse **`ae_session` httpOnly cookie** → `pseudonymousSessionId` (UUID v4).
- Same family as inquiry funnel / observability (`funnelEvents.by_session_createdAt`).
- Convex `answerThreads.pseudonymousSessionId` indexes sidebar list query.
- **Clerk attach later (Phase F+):** optional migration of threads to `ownerId`; out of v1 scope.
- Client may mirror active `threadId` in `sessionStorage` for instant paint; **Convex is source of truth**.

## D-05 Persistence model

```text
answerThreads
  threadId          string   public id (nanoid/uuid)
  pseudonymousSessionId  string
  title             string   first query truncated (~80 chars)
  sharePolicy       'public' | 'unlisted'   v1 default: public
  createdAt, updatedAt

answerTurns
  threadId, turnId, seq
  query             string   normalized (trim, max 200)
  intent            FollowUpIntent   v1 first turn: refine_search
  evidenceJson      string   frozen AnswerSource[] + allowedSlugs
  snapshotHash      string
  proseJson         string   oneLine, summary, nextStep
  artifactKinds     string[] render audit
  status            'pending' | 'complete' | 'error'
  createdAt
```

- Public projection for `/t/$threadId` and share: **artifacts + query text only** — no raw LLM prompts, no internal gate logs, no epistemic labels on human surfaces.

## D-06 Turn pipeline (reuse, don't fork)

- **One orchestrator** per turn: intent → tool choice → tool result → assembly → prose → gate → projection → persist.
- Reuse existing:
  - `AnswerSynthesizer` interface + `deterministicSynthesizer`
  - `GET /api/answer?stream=1` SSE event shape (`AnswerEvent`)
  - `buildArtifactsFromSnapshot`, `AeGenerativeAnswer`, `AeThreadTurnStreamSection` streaming consumer
  - `registry.search` backing read / `readPublicRegistrySearchPage`
- **New:** `POST /api/answer/turn` (or extend `/api/answer` with `threadId`) that:
  1. Creates/loads thread
  2. Runs orchestrator with the AE read toolset
  3. Streams SSE
  4. Persists turn on `complete`

- **Do not** keep parallel unstructured `/api/chat` as a second product path on `/`. Structured LLM prose merges into gated synthesizer behind flag.

## D-07 Follow-up intent router

Every follow-up classifies **before** tool selection:

| Intent | Example | Tool/evidence behavior |
| --- | --- | --- |
| `refine_search` | "only in Preston" | Call `registry.search` with revised arguments |
| `filter_known` | "which take inquiries?" | Filter frozen slugs |
| `compare_known` | "compare the first two" | Prose over known slugs |
| `explain_boundary` | "can I book here?" | Template boundary copy |
| `unsupported` | "book it for me" | Refusal + inquiry route |

- LLM **never adds slugs** outside tool results or frozen evidence.
- v1 router: **deterministic keyword/heuristic classifier**; LLM classification only after eval gate.

## D-08 Follow-up chips (hybrid — locked)

- **Deterministic chips always on** — generated from turn evidence (inquiry-capable, suburb narrow, compare top two, AE boundary).
- **LLM chips max 3** — appended only after Promptfoo eval gate passes.
- Each chip must map to a known `FollowUpIntent`; fail gate → deterministic only.

## D-09 Thinking UI

Perplexity-shaped steps with **honest register copy**:

1. Searching listed businesses…
2. Reading listings…
3. Writing answer…

- Map to existing `AnswerEvent.type === 'thinking'` phases (extend if needed for sub-steps).
- **Forbidden:** "Reading 12 web pages", crawl language, fake latency.

## D-10 Fact / prose split (LLM path)

- LLM output schema: **`AnswerProse` only** (`oneLine`, `summary`, `nextStep`).
- Server assembles `AnswerSource[]` from AE tool results — never from model `providers[]`.
- Apply `sanitizeStructuredAnswer` / `runAnswerGate()` before persist and SSE `complete`.
- **Production default:** deterministic synthesizer until eval suite passes.

## D-11 DSPy and prompt frameworks

- **No DSPy, LangChain, or LlamaIndex in runtime.**
- Promptfoo + Vitest for eval; optional offline prompt compile later after metrics exist.

## D-12 Artifact catalog (unchanged v1)

Emit only: `one-line`, `provider-cards`, `location-map` (conditional), `prose`, `what-to-do-now`, `agent-json`, `protected-by-ae`.

**Out of v1:** inline inquiry forms, LLM related-questions block, comparison tables, json-render blocks, artifact side panel.

## D-13 Feature flags

| Env | Meaning |
| --- | --- |
| (unset) | Deterministic SSE |
| `VITE_AE_ANSWER_MODE=structured` | Gated LLM prose (requires `OPENROUTER_API_KEY`) |
| `VITE_AE_ANSWER_MODE=openui` | Experimental OpenUI (same gates) |

No public model picker on `/` without eval sign-off.

## D-14 Testing bar

- Unit: intent router, evidence freeze, gate, chip → intent mapping.
- Integration: thread create → turn persist → public projection; session sidebar query; share readback.
- E2E: first query → `/t/$threadId` → sidebar lists thread → follow-up appends → share URL loads transcript.
- Copy scan + existing injection tests extended to thread path.
- Promptfoo CI before LLM default.

## D-15 Explicit non-goals (Phase 7)

- Open-web search / crawl UX
- Auth-required history / Clerk thread library
- Thread rename, delete, folder, pin
- Booking, payment, dispatch automation
- Write actions from the public answer loop; qualified inquiry stays on explicit listing/agent paths unless a later phase gates it separately
- Phase 6 business-action receipts coupling

## D-16 AE action/tool loop

- Phase 7 answer turns use a model-visible AE read toolset, not hidden preprocessing.
- `registry.search` is promoted to an AE action in `src/modules/registry/registry.actions.ts` and registered in `src/modules/actions/index.ts`.
- The same action powers:
  - `/api/agent/tools` listing/invocation,
  - the Phase 7 answer orchestrator,
  - future agent JSON action descriptors where appropriate.
- `registry.search` is read-only, public-fact-only, and returns the same safe catalog DTO subset as `/api/businesses/search`.
- The turn record persists reconstructable tool evidence: tool id, validated input, safe public result JSON or refusal/error envelope, result summary/slugs, result hash, and refusal/error state.
- The registry itself remains literal. Misspellings such as "paramata" recover only when the answer agent chooses a better tool input such as "Parramatta emergency plumber"; no registry-side typo correction or hidden query-rewrite step.
- The public answer agent toolset is exactly `registry.search` and `registry.detail`; it must not inherit every read-only action listed by `/api/agent/tools`.
- The LLM path is a real tool loop: actual `registry.search` / `registry.detail` result JSON is fed back to the model before final prose is accepted.

## D-17 Human answer loop uses read tools in v1

- The public answer agent may read, compare, summarize, and route.
- It may call read tools (`registry.search`, later `registry.detail`) during answer generation.
- It must not call write actions from the human answer loop in v1.
- `inquiry.submit` remains available through the quiet agent door and explicit qualified-inquiry surfaces, but chat prose must route the person to the listing or qualified inquiry path rather than silently sending one.
- Any later write tool in an answer thread requires a separate decision with approval UI, admission checks, persistence, and copy scans.

## D-18 Provider-bearing answers fail closed on persisted evidence

- A provider-bearing answer turn is not complete until the `answerTurns` row and all matching `answerToolCalls` rows are persisted.
- A shareable public projection must be reconstructable from persisted turn evidence and tool-call evidence. It must not depend on transient stream buffers, LLM memory, or local-only provider arrays.
- If persistence of either the turn or the tool calls fails, the server must emit an error/refusal or mark the turn non-shareable; it must not emit a provider-bearing `complete` event.
- Turns with no provider artifacts may complete without tool-call rows only when the empty/no-provider state is explicit and source-bounded.

## D-19 Rewrite guardrails

- `registry-query-rewrite` and `AE_LLM_QUERY_REWRITE` are forbidden production paths in Phase 7.
- Production use of `retrievalQuery` before catalog search is forbidden. Query repair belongs in model-chosen `registry.search` arguments and the chosen input is persisted as tool evidence.
- Static validation must scan production source for these rewrite paths and fail the implementation if they reappear.

---

## Decision log

| ID | Decision | Date | Notes |
| --- | --- | --- | --- |
| D-01 | Full thread product (Approach B) | 2026-06-30 | CEO review |
| D-03 | Sidebar v1 after first prompt | 2026-06-30 | User steer — supersedes stateless v1 |
| D-08 | Hybrid follow-up chips | 2026-06-30 | CEO review |
| D-09 | Honest thinking steps | 2026-06-30 | CEO review |
| D-11 | No DSPy runtime | 2026-06-30 | Eng review |
| D-16 | AE action/tool loop over hidden rewrite | 2026-06-30 | Architecture correction after tool-use review |
| D-17 | Read tools only in public answer loop v1 | 2026-06-30 | Keeps qualified inquiry explicit |
| D-18 | Provider-bearing answers fail closed on persisted evidence | 2026-06-30 | Validation repair |
| D-19 | Rewrite guardrails | 2026-06-30 | Validation repair |

---

## Open items (resolve in implementation PRs, not block planning)

| Item | Default if silent |
| --- | --- |
| Exact cookie name / max-age | `ae_session`, 400 days, SameSite=Lax |
| `threadId` format | nanoid 21 |
| Sidebar breakpoint | `<960px` drawer |
| Rate limit per session | Reuse inquiry public rate limit pattern |

NO UNRESOLVED DECISIONS

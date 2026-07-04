# Phase 7 Answer Thread AI — Engineering Plan

**Created:** 2026-06-30  
**Status:** Reviewed — ready for slice PRs  
**Decisions:** `.planning/phases/07-answer-thread-ai/07-DECISIONS.md`  
**Contract:** `.planning/ANSWER-AI-CONTRACT.md`

---

## Goal

Ship thread-native answer sessions on `/` with Convex persistence, honest streaming, session sidebar after first prompt, and an AE agent loop that calls explicit read tools/actions for catalog facts — reusing the existing synthesizer/SSE/artifact stack.

---

## Step 0 — Scope challenge (locked)

### Existing code that already solves sub-problems

| Sub-problem | Existing | Reuse |
| --- | --- | --- |
| Catalog read | `readPublicRegistrySearchPage`, `/api/businesses/search`, answer helper `registry-search.tool.ts` | Yes — promote into AE action/tool |
| Agent tools door | `/api/agent/tools`, action registry, `inquiry.submit` | Yes — register `registry.search` beside existing actions |
| SSE streaming | `GET /api/answer`, `AnswerEvent` | Yes — per turn |
| Artifact render | `buildArtifactsFromSnapshot`, `AeArtifactRenderer` | Yes |
| Prose (deterministic) | `deterministicSynthesizer` | Yes — v1 default |
| Grounding helpers | `sanitizeStructuredAnswer`, copy scan | Wire into orchestrator |
| Public shell | `AePublicShell`, `AeQueryPanel` | Extend layout for sidebar |
| Session id pattern | `funnelEvents.pseudonymousSessionId` | Mirror for threads |

### Minimum change set

1. Convex `answerThreads` + `answerTurns` + session query
2. `ae_session` cookie middleware
3. Read-only registry actions (`registry.search`, `registry.detail`) with `/api/agent/tools` parity
4. Turn orchestrator API (SSE + persist) built around tool input/result evidence
5. Routes `/t/$threadId`, redirect `/?q=`
6. Transcript UI + sidebar (session thread list)
7. Follow-up intent router (heuristic v1)
8. Gate wiring before LLM default (can land in slice D/E)

**Defer without blocking v1 feel:** Clerk attach, LLM chips, OpenUI, thread delete/rename.

### Complexity check

**Triggers 8+ files / 2+ new services** — accepted per D-01 (full thread product). Mitigation: one module `src/modules/answer-thread/`, one orchestrator, no parallel chat API.

### Search check [Layer 1]

- **TanStack Router** — file routes `/t/$threadId` — built-in file routing ✓
- **Convex** — `useQuery` for sidebar list + thread hydration — built-in ✓
- **SSE per turn** — `fetch` + `ReadableStream` in `AeThreadTurnStreamSection` via `answer-stream.ts` — extend, don't replace ✓
- **Cookie session** — no framework built-in; small server helper (same as CSRF/session patterns elsewhere) ✓

**[EUREKA]** Perplexity UX does not require a vector DB, hidden typo-rewrite layer, or LLM memory — **frozen tool input/result evidence per turn** is the thread memory. Cheaper and trust-honest.

---

## Architecture

### System context

```text
┌─────────────┐     ae_session cookie      ┌──────────────────┐
│   Browser   │ ────────────────────────────►│ TanStack Start   │
│  AeChat UI  │◄── SSE AnswerEvent ──────────│ /api/answer/turn │
└─────────────┘     Convex subscribe         └────────┬─────────┘
       │                                                │
       │ sidebar: listThreads(sessionId)                │
       └──────────────────────────────────────────────►│ Convex
                                                         │
                    ┌────────────────────────────────────┤
                    ▼                                    ▼
            answerThreads                          AE action registry
            answerTurns                            registry.search/detail
            answerToolCalls                        deterministicSynthesizer
                                                   runAnswerGate (LLM path)
```

### Turn orchestrator (single pipeline)

```text
POST /api/answer/turn
  { threadId?: string, query: string }

  1. resolveSession() → pseudonymousSessionId
  2. if !threadId → createThread(session, query) → threadId
  3. classifyIntent(query, priorTurns) → FollowUpIntent
  4. choose tool behavior:
       - refine_search → registry.search(input chosen by answer agent)
       - filter_known / compare_known → frozen prior-turn evidence
       - explain_boundary / unsupported → boundary template
  5. validate and run read tool through action registry
       - public answer toolset is exactly registry.search / registry.detail
       - actual tool result JSON is returned to the model before final prose
  6. assemble → AnswerSource[], allowedSlugs, persisted reconstructable tool evidence
  7. synthesize → AsyncIterable<AnswerEvent>  (deterministic | gated LLM)
  8. stream thinking/sources/prose events but buffer provider-bearing complete
  9. before complete → persist answerTurns row, answerToolCalls rows, bump thread.updatedAt
  10. emit complete only after persistence succeeds; on persistence failure emit error or mark non-shareable with no provider-bearing complete
  11. return threadId in first SSE meta event (or X-Thread-Id header)
```

### Follow-up router decision tree

```text
                    ┌──────────────┐
                    │  user query  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        booking/pay?   compare N?    location/filter?
              │            │            │
              ▼            ▼            ▼
        unsupported   compare_known  refine_search
                        filter_known
                           │
                           ▼
                    explain_boundary
                    (AE can't book…)
```

### Sidebar data flow

```text
First turn complete
  → thread row exists with pseudonymousSessionId
  → sidebar query: listThreads(sessionId, limit 20, order updatedAt desc)
  → render after prompt (not on empty /)

New thread (/)
  → sidebar still visible if session has prior threads
  → active route / vs /t/id controls highlight
```

### Validation repair gates

These gates are required for Phase 7 to pass validation:

1. Catalog search is an explicit AE action/tool call. `registry.search` must be registered through `src/modules/actions/index.ts` and invoked by the answer loop through the same action contract, not through hidden local retrieval.
2. Registry search remains literal. Direct catalog/API search for misspelled suburbs returns literal results only; typo recovery exists only when the model chooses corrected `registry.search` arguments.
3. Public answer synthesis exposes exactly `registry.search` and `registry.detail`, not every read-only action exposed by `/api/agent/tools`.
4. The LLM path feeds the actual `registry.search` / `registry.detail` result JSON back to the model before accepting final prose.
5. Provider-bearing complete answers fail closed: `answerTurns` and matching `answerToolCalls` must persist before `complete`; otherwise the result is error/non-shareable/no-provider.
6. Static validation fails production source if `registry-query-rewrite`, `AE_LLM_QUERY_REWRITE`, or pre-search `retrievalQuery` usage appears.

---

## Data model (Convex)

New module: `src/modules/answer-thread/internal/convex-schema.ts`

```typescript
// answerThreads
{
  threadId: string,           // index by_threadId
  pseudonymousSessionId: string,  // index by_session_updatedAt
  title: string,              // first query slice 80
  sharePolicy: 'public' | 'unlisted',
  createdAt: number,
  updatedAt: number,
}

// answerTurns
{
  turnId: string,             // index by_turnId
  threadId: string,           // index by_thread_createdAt
  seq: number,
  query: string,
  intent: string,             // FollowUpIntent union
  evidenceJson: string,       // JSON AnswerSource[] + meta
  snapshotHash: string,
  proseJson: string,
  status: 'pending' | 'complete' | 'error',
  errorCopyId?: string,
  createdAt: number,
}

// answerToolCalls
{
  toolCallId: string,         // index by_toolCallId
  turnId: string,             // index by_turn_seq
  seq: number,
  toolId: 'registry.search' | 'registry.detail',
  inputJson: string,          // validated input only
  resultJson: string,         // safe public action result or refusal/error envelope
  resultSummaryJson: string,  // slugs/count/status, not raw prompts
  resultHash: string,
  status: 'complete' | 'error' | 'refused',
  createdAt: number,
}
```

**Public read query** `getPublicThreadProjection(threadId)`:

- Returns `{ threadId, title, turns: [{ seq, query, artifacts }] }`
- Artifacts derived from stored evidence + prose — same as live render
- Strip: internal ids, hashes, gate logs, prompts to LLM

Register in `convex/schema.ts` via `answerThreadTables` export pattern (mirror `inquiryTables`).

---

## API surface

| Endpoint | Method | Role |
| --- | --- | --- |
| `/api/answer/turn` | POST | Create/append turn, SSE stream |
| `/api/answer/turn` | GET | Optional: resume turn by turnId (v1.1) |
| `GET /api/answer` | GET | Keep for agents/scripts; thread-agnostic |
| `/api/chat` | POST | **Deprecate on `/`** — internal dev only until merged |

**SSE extensions (backward compatible):**

```typescript
| { type: 'thread'; threadId: string; turnId: string; seq: number }
| { type: 'thinking'; step: 'search' | 'read' | 'write' }  // extend thinking
```

First event after connect should include `thread` meta so client can `navigate(/t/$threadId)`.

---

## Frontend routes & components

| File | Change |
| --- | --- |
| `src/routes/index.tsx` | Welcome-only; remove `?q=` stream (redirect handled elsewhere) |
| `src/routes/t.$threadId.tsx` | **New** — load thread + transcript |
| `src/routes/index.tsx` or middleware | `/?q=` → create turn API → redirect `/t/id` |
| `src/components/ae/chat/AeChat.tsx` | Thread-aware shell |
| `src/components/ae/chat/AeThreadSidebar.tsx` | **New** — session thread list |
| `src/components/ae/chat/AeThreadTranscript.tsx` | **New** — map turns → stream sections |
| `src/components/ae/chat/AeThreadTurnStreamSection.tsx` | Live turn SSE consumer; replay via `AeThreadTurnReplaySection` |
| `src/components/ae/layout/AePublicShell.tsx` | Two-column layout when sidebar visible |

**Layout sketch:**

```text
┌────────────────────────────────────────────────────────┐
│ AePublicShell header                                   │
├──────────────┬─────────────────────────────────────────┤
│ Sidebar      │ Transcript (scroll)                     │
│ - New        │   [Q1]                                  │
│ - Thread A * │   [A1 artifacts]                        │
│ - Thread B   │   [Q2]                                  │
│              │   [A2 streaming…]                       │
├──────────────┴─────────────────────────────────────────┤
│ AeQueryPanel (follow-up)                               │
└────────────────────────────────────────────────────────┘
```

Sidebar hidden on `/` until first thread exists in session (or show collapsed "History" with empty state — product pick: show after first complete turn only per D-03).

---

## Module layout

```text
src/modules/answer-thread/
  answer-thread.schema.ts       // Zod public DTOs
  answer-thread.functions.ts    // Convex queries/mutations
  internal/
    convex-schema.ts
    commands.ts                 // createThread, appendTurn, listBySession
    session-cookie.ts           // resolve pseudonymousSessionId
    follow-up-intent.ts         // heuristic classifier
    tool-runner.ts              // invokes read actions and records evidence
    public-projection.ts        // share-safe DTO
  route-turn.ts                 // POST handler
```

New registry action module:

```text
src/modules/registry/
  registry.actions.ts           // registry.search, registry.detail
```

Keep synthesis in `src/modules/answer/` — orchestrator imports `getAnswerSynthesizer()` after tool evidence has been assembled.

---

## Implementation slices

| Slice | Deliverable | Files (approx) | Stop condition |
| --- | --- | --- | --- |
| **7A — AE read tools** | `registry.search` / detail actions, `/api/agent/tools` parity, answer tool whitelist, tool evidence types | 5–7 | Agent tools API invokes search and detail; answer toolset is exactly registry search/detail; registry stays literal |
| **7B — Schema + session** | Tables, cookie, createThread, reconstructable answerToolCalls | 7–9 | Unit test insert/query/tool evidence; provider-bearing complete fails if turn/tool-call persistence fails |
| **7C — Turn API + `/t`** | SSE turn, redirect `/?q=`, transcript over tool results | 10–12 | E2E first query lands on `/t/id` |
| **7D — Sidebar v1** | listBySession UI after first turn | 4–6 | E2E two threads in sidebar |
| **7E — Follow-up router** | Intent + search/filter/compare paths | 6–8 | Unit tests all intents and no new slugs without tool/frozen evidence |
| **7F — Gate + unify LLM** | real tool-call prompt loop, `runAnswerGate`, prose-only LLM | 6–8 | Integration proves actual registry result JSON is returned to the model before final prose; gate failures fall back |
| **7G — Eval + LLM chips** | Promptfoo, hybrid chips | 4–6 | CI gate green |
| **7H — Share polish** | Public projection route, OG tags | 3–4 | Share URL loads without auth |

**7C includes sidebar substrate query**; **7D is UI polish** — can merge if schedule tight.

---

## Section 1 — Architecture review (top issues)

| # | Issue | Recommendation | Severity |
| --- | --- | --- | --- |
| A1 | Dual `/api/chat` and `/api/answer` | Single orchestrator; chat internal-only | High |
| A2 | No thread persistence today | Convex tables first — blocks everything | Blocker |
| A3 | `/?q=` couples URL to single answer | Redirect to `/t/id` on submit | High |
| A4 | LLM schema includes `providers[]` | Prose-only; server assembly from tool results | High |
| A5 | Sidebar deferred in old contract | Move to 7C/7D per D-03 | Medium |
| A6 | Stateless ui-craft decision | Supersede in decisions.md | Low |
| A7 | Replay vs live stream duplication | `AeThreadTurnReplaySection` vs `AeThreadTurnStreamSection` | Medium |
| A8 | Rate limit absent on turn API | Apply public inquiry rate pattern | Medium |
| A9 | Registry search is an answer helper, not an AE action | Promote to `registry.actions.ts`; route orchestrator and `/api/agent/tools` through one declaration | High |
| A10 | Hidden LLM query rewrite masks agent behavior | Remove/supersede hidden rewrite; typo recovery only through explicit `registry.search` arguments | High |
| A11 | Provider-bearing complete can bypass durable tool evidence | Persist `answerTurns` and `answerToolCalls` before emitting provider-bearing `complete`; failure resolves as error/non-shareable/no-provider | Blocker |
| A12 | Answer loop could inherit unrelated read actions | Whitelist public answer synthesis to exactly `registry.search` and `registry.detail` | High |

**Recommendation:** Land 7A→7B→7C→7D before router complexity. Read tools and thread evidence are not optional plumbing — they validate the trust contract before follow-up behavior gets clever.

---

## Section 2 — Code quality

| # | Issue | Recommendation |
| --- | --- | --- |
| Q1 | `AeChat` navigate to `/?q=` | Route to turn API + `/t/id` |
| Q2 | Grounding exists but unwired in chat route | Call gate in orchestrator after tool results are assembled |
| Q3 | DRY: inquiry thread naming | Namespace `answerThreads` vs `inquiryThreads` — keep separate tables |
| Q4 | JSON blobs in Convex | Accept for v1; snapshotHash for integrity audit |
| Q5 | Intent router in one file | `follow-up-intent.ts` + exhaustive switch |
| Q6 | `registry-search.tool.ts` duplicates action semantics | Use `registry.actions.ts` as source of tool descriptor and adapt/delete answer-local helper |

---

## Section 3 — Tests

| Layer | Coverage |
| --- | --- |
| Unit | `classifyFollowUpIntent`, `filterKnownSlugs`, `buildPublicProjection`, session cookie parse, registry action schema |
| Integration | `/api/agent/tools` exposes/invokes registry search; turn API persists tool evidence before provider-bearing complete; projection omits forbidden fields; gate fallback |
| E2E | `landing-answer.spec.ts` → thread flow; sidebar 2 threads; share link |
| Copy | extend forbidden patterns to thread summaries |
| Static | production source has no hidden rewrite env/path and no pre-search `retrievalQuery` path |
| Eval | Promptfoo: tool input quality, grounding, overclaim, chip→intent (7F) |

**Test diagram:**

```text
e2e/thread-first.spec.ts
  submit on /
    → expect URL /t/*
    → expect provider-cards before prose
    → submit follow-up
    → expect 2 turns in DOM
  open / in new context (same cookie)
    → sidebar lists prior thread
```

---

## Section 4 — Performance

| Concern | Target | Approach |
| --- | --- | --- |
| First pixel | <400ms thinking event | Keep deterministic path; no extra Convex round-trip before SSE start |
| Sidebar query | <100ms | Index `by_session_updatedAt`, limit 20 |
| Transcript hydration | N turns | Paginate turns if >50 (defer — unlikely v1) |
| Convex writes | 1 per turn | Batch artifact json single row |
| Cookie | every request | Lazy parse once per turn POST |

---

## Outside voice (compressed)

**Product:** Thread + sidebar matches Perplexity mental model without pretending open-web search. Risk: users expect cross-device history — copy must not imply account sync.

**Trust:** Frozen evidence per turn is the right call for AE; avoids "model remembered a plumber we delisted."

**Eng:** Reusing SSE + synthesizer is boring technology — good. Biggest landmine is shipping `/api/chat` providers[] to production.

---

## NOT in scope (Phase 7)

- Clerk thread library
- Thread delete/rename/search
- Open-web crawl copy
- DSPy runtime
- Inline inquiry forms in chat
- Phase 6 receipts

---

## Acceptance checklist

- [ ] `/` starts new thread on first submit → `/t/$threadId`
- [ ] `registry.search` and detail are AE actions exposed through `/api/agent/tools`
- [ ] Public answer synthesis whitelists exactly `registry.search` / `registry.detail`
- [ ] Registry stays literal; misspelling recovery exists only through model/tool arguments
- [ ] Real tool loop feeds actual registry action result JSON back to the model before final prose
- [ ] Provider-bearing turns persist reconstructable tool input/result evidence in `answerTurns` + `answerToolCalls` before `complete`
- [ ] Static guard blocks hidden rewrite paths and pre-search `retrievalQuery`
- [ ] Sidebar lists session threads after first completed turn
- [ ] Follow-up appends turn on same thread
- [ ] Share `/t/$threadId` loads public projection
- [ ] Provider cards before prose every turn
- [ ] Thinking steps: Searching → Reading listings → Writing answer
- [ ] Deterministic chips every turn
- [ ] LLM chips gated behind eval
- [ ] Gate + fallback on LLM path
- [ ] `/?q=` and `/q/*` redirect compat

---

## GSTACK REVIEW REPORT

| Run | Status | Findings |
| --- | --- | --- |
| Step 0 scope | Pass | Reuse synthesizer/SSE; Convex new; sidebar v1 locked |
| Architecture | Pass | 8 issues logged; dual API merge required |
| Code quality | Pass | Grounding wire-up flagged |
| Tests | Pass | Unit/integration/e2e/eval matrix defined |
| Performance | Pass | Index + SSE-first path documented |

**VERDICT:** APPROVED FOR SLICED IMPLEMENTATION — ship 7A→7B→7C→7D before follow-up router and LLM default.

**CROSS-MODEL:** Not run this session.

NO UNRESOLVED DECISIONS

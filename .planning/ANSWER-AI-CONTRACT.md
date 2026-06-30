# ANSWER-AI-CONTRACT — Cited Answer Synthesis

**Status:** authority for answer synthesis, generative UI, and LLM posture on public human surfaces.  
**Scope:** `/` chat shell, `GET /api/answer`, optional gated LLM prose, artifact rendering, share links.  
**Non-scope:** owner/admin surfaces, agent-tools write path (`inquiry.submit`), Phase 6 business-action guardrails, discovery manifest generation (`AI-SPEC.md`).

**Related:** `PRODUCT.md`, `AGENTS.md`, `AI-SPEC.md`, `.ui-craft/surfaces/chat.md`, `src/modules/answer/`.

---

## Purpose

Agentic Economy answers local-service questions by letting the AE answer agent **call explicit read tools/actions for catalog facts**, **synthesizing honest prose**, and **projecting a fixed artifact layout**. Answers must never invent providers, imply booking/payment/dispatch, or use epistemic vocabulary on human surfaces.

The answer system is **not** a general chat product. It is a **read-only synthesis layer** over the public registry with a single primary surface: **AeChat on `/`**.

---

## Public IA (current)

| Surface | Role | Priority |
| --- | --- | --- |
| **`/`** (`AeChat`) | New thread — welcome + empty transcript | P0 |
| **`/t/$threadId`** | Active Perplexity session — transcript, follow-ups, share | P0 |
| **`/?q=`** | Legacy convenience → creates thread + first turn, redirect to `/t/…` | Deprecated |
| **`/q/$answerId`** | Legacy deep link → redirect to `/t/…` or `/?q=` | Deprecated |
| **`/$slug`** | Durable business citation page linked from cards | P1 |
| **`/registry`** | Secondary browse | P2 |
| **`GET /api/businesses/search`** | Agent/human JSON catalog | P1 |
| **`GET /api/answer`** | Programmatic cited answer (JSON or SSE) | P1 |
| **`POST /api/chat`** | Internal LLM prose engine (optional; not a second product API) | P2 |

**Chat-first rule:** Submitting a query appends a **turn** to the active thread on `/`. The transcript scrolls; the URL syncs to **`/t/$threadId`**.

**Thread-first (Perplexity-shaped):** A session is a **thread** of turns, not a single `?q=` snapshot. Share links, refresh, and follow-ups all key off the thread. See **Experience contract** below.

---

## North star

> **Call tools for facts. Synthesize prose. Gate everything. Project once.**

| Class | Source of truth | Who may write |
| --- | --- | --- |
| **Facts** | AE read tool result (`registry.search` → `PublicBusinessCatalogApiDto`) | Server assembly only |
| **Prose** | Template or gated LLM | Synthesizer layer |
| **Layout** | Fixed artifact catalog | `buildArtifactsFromSnapshot` |

Facts include: slugs, names, categories, suburbs, service areas, hours labels, availability labels, trust labels, next-step labels, detail URLs, inquiry URLs, agent JSON URL.

Prose includes: one-line, summary, what-to-do-now (and optional location-map **label** when location intent is detected).

## AE agent tool contract

Phase 7 follows the mainstream tool-use architecture used by current LLM APIs: the model sees typed tool descriptions, chooses a tool and arguments, receives tool results as data, then writes the final answer inside server gates.

**Required v1 tools/actions:**

| Tool/action | Backing source | Mode | Purpose |
| --- | --- | --- | --- |
| `registry.search` | `readPublicRegistrySearchPage` / `/api/businesses/search` parity | read-only | Search public listed businesses by service, suburb, category, area, or mixed natural-language need. |
| `registry.detail` | `readPublicRegistryBusinessDetail` / `/api/businesses/$slug` parity | read-only | Read one public listing already named by a slug or search result. |
| `inquiry.submit` | existing inquiry action | write | Exposed through the quiet agent door and explicit inquiry surfaces; not called by the public answer loop in v1. |

**Rules:**

- The registry stays literal. It does not typo-correct `paramata` into Parramatta.
- The answer agent may recover user typos or vague wording by calling `registry.search` with better arguments.
- Tool input and output are persisted per turn as evidence: id, validated input, result slugs, result hash, and error/refusal state.
- Prose never names a provider unless that provider appears in the current tool result or a prior frozen turn allowed by the follow-up intent.
- Tool traces are not shown with internal architecture vocabulary on human surfaces.

## Experience contract — what the AI path should feel like

**CEO review decisions (2026-06-30):** Approach B (full thread product), hybrid follow-ups, Perplexity-adapted thinking steps with honest register copy.

This is **Perplexity for a bounded, trust-honest catalog** — not open-web search, not general chat.

### The felt outcome

A person opens `/`, asks a need-shaped question, and within a second sees the product **working on their question** (visible steps). Provider cards land **before** prose — those cards *are* the citations. They refine in place ("which take inquiries?", "compare the first two") without starting over. They share one link that reconstructs the whole conversation. Every turn reminds them AE compares and routes; it does not book, charge, or dispatch.

Assistants reading the same thread get frozen evidence per turn, not model monologue.

### Perplexity patterns → AE adaptation

| Perplexity pattern | AE adaptation | Trust rule |
| --- | --- | --- |
| Thread transcript | `answerThreads` + `answerTurns` in Convex; UI scrolls Q→A pairs | Each turn stores frozen `AnswerSource[]`, not freeform model memory |
| Share `/search/{id}` | Share **`/t/$threadId`** (public read-only projection) | No inquiry PII, no raw prompts in public readback |
| Source cards row | **Provider cards first** — citation index on card, links to `/$slug` | Cards only from AE tool results or prior-turn frozen slugs |
| Inline citations | Card index references in summary prose optional v2 | Prose never cites providers not in turn evidence |
| Thinking steps | **Searching listed businesses → Reading listings → Writing answer** | Steps name register work, not web crawl |
| Follow-up chips | **Hybrid:** deterministic chips first; LLM chips only after eval gate | Chips must map to real follow-up intents (see below) |
| Sidebar history | **v1 after first prompt** — session thread list; Clerk attach later | Same pseudonymous session pattern as inquiries; see `07-DECISIONS.md` D-03 |
| Related questions (LLM) | Deferred until Promptfoo passes on chip grounding | No chip that implies booking/payment/verified |

### One turn — interaction beat

```text
USER    [query text]

STATUS  Searching listed businesses…     ← thinking (honest, Perplexity-shaped)
        Reading listings…
        Writing answer…

ASSISTANT
        [one-line — Fraunces]
        [provider-cards — citations, appear BEFORE prose]
        [location-map — if location intent]
        [summary — streams sentence by sentence]
        [what-to-do-now]
        [protected-by-ae]
        [agent-json affordance]

CHIPS   [deterministic follow-ups]
        [optional LLM follow-ups — post-eval only]

INPUT   AeQueryPanel — follow-up, not "start over"
```

Streaming rules unchanged: first pixel <400ms, Stop available, `sources` event before `summary-delta*`.

### Follow-up intent router (server)

Every follow-up classifies before tool selection:

| Intent | Example | Tool/evidence behavior |
| --- | --- | --- |
| `refine_search` | "only in Preston", "after hours" | Call `registry.search` with refined arguments |
| `filter_known` | "which take inquiries?" | Filter prior turn's frozen slugs by catalog field |
| `compare_known` | "compare the first two" | Prose only over 2+ slugs already in thread |
| `explain_boundary` | "can I book here?" | Template boundary copy, no new providers |
| `unsupported` | "book it for me" | Refusal + route to inquiry or `/$slug` |

LLM writes **prose only** inside allowed intents. Never adds slugs.

### Deterministic follow-up chips (always on)

Generated from turn evidence + catalog fields — examples:

- "Show only businesses that accept inquiries"
- "Narrow to [suburb from query]"
- "Compare the top two"
- "What can Agentic Economy do here?" (boundary)

### LLM follow-up chips (hybrid — after eval gate)

- Max 3 chips per turn, appended after deterministic set
- Each chip must parse to a known `FollowUpIntent`
- Promptfoo: chip → intent → no forbidden overclaim
- Fail gate → deterministic chips only

### Persistence model

```text
answerThreads
  threadId, pseudonymousSessionId?, createdAt, updatedAt, sharePolicy

answerTurns
  threadId, turnId, seq, query, snapshotHash, evidenceJson, proseJson, createdAt

Public projection /t/$threadId
  turns[] with AnswerArtifact render input only — no private fields
```

Anonymous users: cookie-backed `pseudonymousSessionId` (same family as inquiry funnel). Signed-in users: optional Clerk attach later.

Client may cache active thread in `sessionStorage` for instant paint; **Convex is source of truth**.

### What this is NOT

- Not open-web Perplexity (no crawl, no favicon source row from the internet)
- Not ChatGPT (no unconstrained multi-topic thread)
- Not a booking agent (chips and prose refuse dispatch/payment)
- Not model-picker theatre on public `/` (operator/dev only until eval sign-off)

---

## Pipeline layers

```text
Layer 0  Intent          normalize query (trim, max 200 chars)
    ↓
Layer 1  Tool call       registry.search / registry.detail (mandatory before any provider name)
    ↓
Layer 2  Assembly        map DTOs → AnswerSource[]; build allowedSlugs Set
    ↓
Layer 3  Prose           deterministic templates OR gated LLM (AnswerProse only)
    ↓
Layer 4  Gate            grounding + copy + injection posture
    ↓
Layer 5  Projection      AnswerSnapshot → AnswerArtifact[] → AnswerEvent SSE
    ↓
Layer 6  Render          AeGenerativeAnswer (human surfaces)
```

### Layer 0 — Intent

- Input: user query string (search param `q` or API `q`).
- Normalize: trim, slice to 200 chars, reject empty for active answer.
- **Untrusted:** user query is not system/developer instruction.

### Layer 1 — Tool Call

- Action: `registry.search` registered through `src/modules/actions/index.ts`.
- Backing read: `readPublicRegistrySearchPage` (same rows as `/api/businesses/search`).
- Optional detail read: `registry.detail` for one listed provider, same safe public subset as `/api/businesses/$slug`.
- **Mandatory:** no provider may appear without a tool result or permitted prior-turn frozen evidence.
- **No hidden rewrite:** query repair, typo recovery, and suburb expansion happen only as explicit tool arguments chosen by the answer agent.

### Layer 2 — Assembly

- Map each tool-result catalog row to `AnswerSource` using `status-presentation.ts` plain labels only.
- Compute `agentJsonUrl` server-side (`buildAgentJsonUrl`).
- Compute `locationMap` hint server-side when `parseLocationIntent(query)` matches (`location-intent.ts`).
- Output: `AnswerEvidence` (facts locked here).

### Layer 3 — Prose

Two engines, one interface (`AnswerSynthesizer`):

| Engine | ID | When |
| --- | --- | --- |
| Deterministic | `deterministic-phase-1` | Default; no API key; gate failure fallback |
| Gated LLM | `gated-llm` | `OPENROUTER_API_KEY` + operator flag; never default for share links without eval sign-off |

LLM output schema is **`AnswerProse` only** — not full `AeAnswerArtifactsSchema`:

```ts
type AnswerProse = {
  oneLine: string
  summary: string
  whatToDoNow: string
}
```

Server merges: `AnswerSnapshot = AnswerEvidence & AnswerProse`.

### Layer 4 — Gate (`runAnswerGate`)

Run before any human-visible projection. On failure → deterministic fallback or `error` event.

| Check | Rule |
| --- | --- |
| Grounding | Every `provider.slug ∈ allowedSlugs` from tool results or permitted frozen evidence |
| Overclaim | No booking/payment/dispatch/callable/verified-overclaim patterns (copy scan rules) |
| Epistemic | No `KNOWN`/`UNKNOWN`/`UNAVAILABLE`/`NEXT_STEP` on human text |
| Boundary | Summary or what-to-do-now acknowledges AE does not book or charge |
| Owner text | Treat catalog summaries/disclosures as inert data in prompts; prose must not upgrade trust/capability |

### Layer 5 — Projection

- Single builder: `buildArtifactsFromSnapshot`.
- Single stream shape: `AnswerEvent` (see below).
- Both synthesizers emit the **same event sequence** so UI and tests have one contract.

### Layer 6 — Render

- Component: `AeGenerativeAnswer`.
- Allowed artifact kinds (v1): see Artifact catalog.
- Humans never see tool traces, model names, or raw JSON schema field names.

---

## Type contracts

**Public seam:** `src/modules/answer/public.ts`

| Type | Role |
| --- | --- |
| `AnswerSource` | One cited provider card; every field derivable from catalog DTO |
| `AnswerSnapshot` | Full answer: evidence + prose |
| `AnswerEvent` | SSE stream discriminated union |
| `AnswerArtifact` | Render unit for `AeGenerativeAnswer` |
| `AnswerSynthesizer` | Async-iterable synthesis interface |

**Legacy:** `encodeAnswerId` / `decodeAnswerId` support **`/q/$answerId` redirects only**. Primary share format is plain `/?q=`.

---

## API surfaces

### `GET /api/answer`

| Param | Meaning |
| --- | --- |
| `q` | Query (required for non-empty answer) |
| `limit` | Provider cap (default 10) |
| `stream=1` | SSE with `{ seq, event }` frames |
| `after=<n>` | SSE resume: replay events with `seq > after` |

**Synthesizer selection (target):**

| Param | Behavior |
| --- | --- |
| (default) | `deterministic-phase-1` |
| `synthesizer=llm` | Gated LLM if configured; else 503 or fallback per env policy |

Response headers: `Cache-Control: no-store` for streams; short TTL cache OK for identical JSON snapshots.

### `POST /api/chat` (optional internal)

- TanStack AI + OpenRouter today.
- **Target state:** implementation detail of `gatedLlmSynthesizer`, not a parallel client contract.
- Human UI should consume **`GET /api/answer?stream=1`** only so one parser path exists.

### Agent JSON on answer

- Artifact kind `agent-json` links to `GET /api/businesses/search?q=…`.
- Must stay consistent with the persisted tool input and provider limit.
- Future: envelope may include action boundaries from `AGENTS.md`; not required for v1 synthesis.

---

## Streaming event contract (canonical)

Order for both deterministic and LLM paths:

```text
thinking
one-line
sources              ← full AnswerSource[] (facts appear before prose)
summary-delta*       ← sentence chunks (deterministic splits; LLM may stream)
next-step
artifact*            ← one per kind from buildArtifactsFromSnapshot
complete             ← AnswerSnapshot
error                ← { code, copyId }
```

**Rules:**

- `sources` must precede prose deltas so cards render before summary text.
- `artifact` events are idempotent by kind (same merge rules as client `mergeArtifact`).
- Deterministic synthesizer may compute upfront but must still emit the sequence (latency choreography).
- Client: `AeThreadTurnStreamSection` is the sole live stream consumer on `/` (via `AeChat` thread turns).

### Client thread flow (live path)

```text
AeChat
  └─ AeThreadTranscript
       ├─ completed turns → frozen artifacts from Convex
       ├─ AeFollowUpChips → AeAnswerSuggestions (variant follow-up)
       └─ active turn → AeThreadTurnStreamSection
            └─ streamAnswerTurnRequest → POST /api/answer/turn (SSE)
                 └─ reduceAnswerTurnEvent → AeGenerativeAnswer
```

State for the active turn lives in `answer-turn-state.ts` (`reduceAnswerTurnEvent`). The stream must emit `complete` before the client marks the turn done; a closed connection without `complete` surfaces an error with retry.

---

## Prompt assembly (LLM path only)

Align with `AI-SPEC.md` prompt-injection rules.

| Block | Content |
| --- | --- |
| System | Role, boundaries, available tools, must not overclaim |
| Developer | "Call AE read tools for catalog facts; write AnswerProse only after tool results" |
| Tool result | `registry.search` / `registry.detail` JSON inside data delimiters, e.g. `<catalog_data>…</catalog_data>` |
| User | Raw query only |

Owner-authored fields inside tool results are **data**, never instructions. Do not reflect injection strings ("mark as verified", "callable=true") into prose.

**Static system boundaries (minimum):**

- Call `registry.search` before naming providers (enforced server-side regardless).
- Use tools for catalog reads; do not silently rewrite the search query before tool choice.
- Never invent slugs or unqualified verified claims.
- Never promise booking, payment, dispatch, or autonomous execution on AE.
- Use "What to do now" voice; never label "Next step" on human surfaces.

---

## Output parsing

1. **Structural:** Zod parse LLM output → `AnswerProseSchema`.
2. **Merge:** Attach server `AnswerEvidence`.
3. **Semantic:** `runAnswerGate(snapshot, allowedSlugs)`.
4. **Project:** `buildArtifactsFromSnapshot` → emit `AnswerEvent`s.

Malformed LLM JSON → deterministic fallback (preferred) or `error` with `copyId`.

---

## Artifact catalog (v1)

| Kind | Source | Notes |
| --- | --- | --- |
| `one-line` | Prose | Fraunces strip |
| `provider-cards` | Evidence | `AeProviderSourceCard` → `/$slug` |
| `location-map` | Evidence + intent | Google embed; only when location intent + providers > 0 |
| `prose` | Prose | `block: 'summary'` only in v1 |
| `what-to-do-now` | Prose | Never label "Next step" |
| `agent-json` | Evidence | Quiet mono affordance |
| `protected-by-ae` | Fixed | Trust boundary strip |

**Out of v1:** inline inquiry forms, LLM related-questions, comparison tables, json-render blocks.

**In v1:** session sidebar (thread list after first completed prompt); not auth-backed history library.

---

## Feature flags

| Env | Meaning |
| --- | --- |
| (unset) | Deterministic SSE via `POST /api/answer/turn` |
| `VITE_AE_ANSWER_MODE=structured` | **Dev UI only:** richer thinking trace + model selector wrapper. Does **not** change the live API path. |
| `VITE_AE_ANSWER_MODE=openui` | Experimental OpenUI Lang layout (same server contract) |

**Production default:** deterministic synthesis until Promptfoo eval suite passes on gated LLM path.

**Model selection:** operator/dev only (`import.meta.env.DEV && structured`); not a public trust signal. No model picker on `/` without eval sign-off.

---

## Eval contract (required before LLM default)

| Metric | Pass |
| --- | --- |
| Grounding | All slugs belong to current tool results or permitted frozen evidence |
| Overclaim | Prose matches copy-scan forbidden patterns = fail |
| Boundary | No booking/payment on AE stated in summary or what-to-do-now |
| Injection | Poisoned owner summaries do not upgrade trust/capability in prose |
| Parity | Same query → LLM evidence matches deterministic provider set |
| Empty | Zero providers → empty state copy, no hallucination |

**Tooling:** extend Vitest fixtures + Promptfoo CI; seed from `tests/unit/answer/`, `tests/integration/discovery-prompt-injection.test.ts`, `tests/copy/`.

**Observability:** log gate failures with `copyId`; never expose raw prompts in public projections (Phase 6 private-evidence pattern).

---

## Implementation phases

| Phase | Deliverable |
| --- | --- |
| **A — Contract** | This doc; `07-DECISIONS.md`; route targets `/t/$threadId` |
| **B — AE read tools** | `registry.search` / detail actions registered beside `inquiry.submit`; answer tool evidence schema |
| **C — Thread + sidebar v1** | Convex tables; `/t/$threadId`; transcript; **session sidebar after first turn** |
| **D — Turn orchestrator** | Follow-up intent router; per-turn read tool calls; frozen evidence |
| **E — Unify synthesis** | `gatedLlmSynthesizer`; thinking steps; single SSE per turn |
| **F — Gate + eval** | `runAnswerGate`; Promptfoo; hybrid follow-up chips |
| **G — Auth attach** | Optional Clerk link for cross-device thread library (post-v1) |
| **H — OpenUI** | Optional; same evidence/prose split |

---

## Non-goals

- DSPy / prompt optimizers in runtime (offline compile only after eval exists).
- LangChain / LlamaIndex orchestration.
- Open-web search or crawl UX copy ("reading 12 web pages").
- LLM-authored provider cards or trust tier changes.
- Tool trace UI with internal architecture words on human surfaces.
- LLM-only follow-up chips before eval gate passes.

---

## Acceptance

- [ ] `/` starts a new thread; follow-ups append turns on `/t/$threadId`
- [ ] Session sidebar lists threads after first completed prompt
- [ ] Share link reconstructs full transcript (public projection)
- [ ] Provider cards appear before summary on every turn
- [ ] Thinking steps use honest register copy (Searching → Reading listings → Writing answer)
- [ ] Deterministic follow-up chips on every turn; LLM chips only after eval gate
- [ ] Follow-up router never adds slugs outside tool results or frozen evidence
- [ ] `registry.search` is an AE action/tool, and every provider-bearing turn persists tool input/result evidence
- [ ] Misspelling recovery happens through tool arguments, never registry-side typo correction or hidden query rewrite
- [ ] Single SSE consumer per turn; artifact catalog v1 only
- [ ] Gate + deterministic fallback on LLM failure
- [ ] `llms.txt` documents thread + answer APIs when production-live

---

*Authority for answer synthesis. When this doc and `AI-SPEC.md` overlap on injection, both apply. When this doc and `.ui-craft/surfaces/chat.md` disagree on IA, this doc wins for API/contracts; chat.md wins for visual composition until merged.*

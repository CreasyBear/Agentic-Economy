# Surface: Chat (AeChat) — Primary Product Shell

Governed by this file. Visual authority: `DESIGN.md` (Daylight Register). UX reference: [Morphic](https://github.com/miurla/morphic) (chat-as-home, generative UI, shareable threads). When this spec and `DESIGN.md` disagree on **visuals**, `DESIGN.md` wins. When they disagree on **IA/journey**, this file wins until `DESIGN.md` is amended (see `.ui-craft/decisions.md` 2026-06-30).

## IA thesis (resolved)

**The product is the chat interface.** Query → generative UI → inline artifacts. Everything else is a citation target, conversion step, or secondary browse path.

| Surface | Role | Priority |
| --- | --- | --- |
| **`/`** (`AeChat`) | Primary shell — ask, stream answer, act on cards | P0 |
| **`/?q={query}`** | Shareable in-place answer (same shell; refresh/back safe) | P0 |
| **`/q/$answerId`** | Legacy deep link → redirects to `/?q=` | Deprecated |
| **`/$slug`** | Stable **business citation page** linked from cards | P1 |
| `/$slug/inquiry` | Conversion — leaves chat | P1 |
| `/registry` | Secondary browse when user prefers scanning | P2 |
| `/claim` | Owner onboarding | P2 |
| `/llms.txt`, agent JSON | Quiet agent door | P2 |

## Hard questions — resolved

### 1. What is the primary surface?

**`/ ` is AeChat** — Morphic pattern: home renders the chat app, not a marketing funnel that redirects.

- **Idle:** compact welcome (hand-drawn mark + one-line kicker + boundary note) + sticky `AeQueryPanel`.
- **Active:** welcome compresses to a single kicker row; message thread fills the viewport; `AeQueryPanel` stays pinned bottom.

### 2. When does the user leave chat?

| Action | Leave chat? | Destination |
| --- | --- | --- |
| Submit query | No | Answer streams inline; URL syncs to `/?q=` |
| Click provider card | Yes | Navigate to `/$slug` |
| Send inquiry | Yes | `/$slug/inquiry` |
| Claim business | Yes | `/claim` |
| Browse all | Yes | `/registry` |
| Get agent JSON | No | Fetch/copy in place |

**No artifact side panel in v1.** Morphic's inspector works because artifacts are web results; AE's deep artifact **is** the business page. Adding a panel duplicates `/$slug` before we have preview-only content. Revisit when inline preview is designed.

### 3. What is `/$slug` for?

A **durable citation artifact**: SEO, sharing, agent grounding, owner correction. Linked from provider cards with citation index. **Not** the primary browse UI and **not** where generative composition happens.

### 4. When does a map appear?

**Generative only — query-shaped, not page-default.**

| Context | Map? | Mechanism |
| --- | --- | --- |
| Chat answer, location-intent query | Yes | `location-map` artifact — Google Maps Embed, geocoded from parsed place in query |
| Chat answer, non-location query | No | Provider cards + prose only |
| `/$slug` listing | No default | Text service area only |
| `/$slug` listing, `officeAddress` published | Optional | Google Maps Embed of **office** (schema follow-up PR) |
| `/registry` | No | Text columns |

Location intent (deterministic v1): suburb, postcode, "near", "in {place}", "directions", AU postcodes 4-digit pattern.

**Non-service businesses:** same card shape; synthesizer skips `location-map` artifact; service-area text still shown when present in catalog.

### 5. What artifacts can generative UI emit? (v1 catalog)

Locked artifact kinds — extend only via `.ui-craft/decisions.md` amendment:

| Kind | P0 | Component | Notes |
| --- | --- | --- | --- |
| `one-line` | Yes | Fraunces answer strip | From synthesizer |
| `provider-cards` | Yes | `AeProviderSourceCard` grid | Cited links to `/$slug` |
| `location-map` | Conditional | `AeGenerativeMap` | Google Embed; env-gated |
| `prose` | Yes | Summary paragraphs | Streamed sentence chunks |
| `what-to-do-now` | Yes | Plain text block | Never label "Next step" |
| `agent-json` | Yes | `AeAgentJsonAffordance` | Mono quiet link |
| `protected-by-ae` | Yes | `AeProtectedByAe` | Beside inquiry CTAs |

**Out of v1:** comparison tables, inline inquiry forms, LLM-generated related questions, json-render spec blocks, chat history sidebar.

### 6. What is `/registry` for?

**Secondary browse** — users who prefer scanning or agents linking humans to the index. Nav/footer placement; not the hero CTA. Column layout (`Provider | Services | Area | Status | Response`). Does not compete with query box on `/`.

### 7. Where does conversion happen?

**Preferred:** provider card in chat → user reads card → **View details** or inquiry path.

1. **Fast path (future):** inquiry CTA on card in stream → `/$slug/inquiry`
2. **Current path:** card → `/$slug` → sticky amber inquiry CTA → `/$slug/inquiry`

One primary action per viewport. Inquiry form includes consent + `AeProtectedByAe`. Never fake booking/payment/dispatch.

### 8. Assistants vs humans

| Audience | Primary entry | Contract |
| --- | --- | --- |
| Human | `/` chat | Plain language, generative cards, boundary copy |
| Assistant | `/llms.txt`, `/api/businesses/search`, agent JSON on answer | Read/compare/route; `inquiry.submit` when admitted |
| Owner | `/owner/*`, `/claim` | Consequence language; epistemic labels OK on admin |

Humans never see `KNOWN`/`UNKNOWN`/`NEXT_STEP` as labels. Assistants never see booking/payment implied.

### 9. Chat history?

**Thread-first v1.** Shareability via `/t/$threadId`. Session sidebar lists recent questions after the first completed thread. Frozen evidence per turn; layout profiles survive replay. Authority: `.planning/ANSWER-AI-CONTRACT.md`.

### 10. Follow-up questions?

**Deterministic index-tab chips** after the last complete turn (`{ label, submitQuery }`). Chips refine the same thread — narrow, filter, compare, boundary. LLM chips only when eval flag is on. No bubble chat transcript.

### 11. Generative layout profiles

Each turn renders through **`AeGenerativeAnswer`** with an explicit **`AnswerLayoutProfile`**:

| Profile | When | Stack |
| --- | --- | --- |
| `discovery_full` | First turn | One-line → cards → map? → prose → what-to-do-now |
| `refinement_compact` | Narrow / filter follow-ups | Delta label → one-line → horizontal card rail → compact next-step |
| `compare_pair` | Compare chip | One-line → cards (max 2) → prose |
| `boundary_explain` | Boundary chip | One-line → prose → compact next-step |
| `empty_state` | Zero providers | One-line → empty state → what-to-do-now |

**Thread footer (once):** `AeProtectedByAe`, agent JSON from **need query**, copy link. Per-turn artifacts omit trust strip and agent JSON.

---

## Composition (shape)

### Desktop — idle

```text
┌────────────────────────────────────────────────────────────┐
│ AePublicShell header                          [Browse][Claim]│
├────────────────────────────────────────────────────────────┤
│                                                            │
│     [hand-drawn hero — compact]                            │
│     kicker · boundary one-liner                            │
│                                                            │
│              (vertical center bias — editorial)             │
│                                                            │
├────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────────────┐ │
│ │ AeQueryPanel (sticky)                                    │ │
│ │ [ What do you need done? .................... ] [Ask]   │ │
│ │ examples: "no hot water Preston" · "electrician …"      │ │
│ └────────────────────────────────────────────────────────┘ │
│ footer · Assistants: /llms.txt                             │
└────────────────────────────────────────────────────────────┘
```

### Desktop — active thread (`/t/$threadId`)

```text
┌────────────────────────────────────────────────────────────┐
│ header                                                     │
├──────────┬─────────────────────────────────────────────────┤
│ sidebar  │ [thread need title · copy link]            sticky │
│ recent   ├─────────────────────────────────────────────────┤
│ questions│ SCROLL transcript                               │
│          │   turn 1 (collapsed) · turn 2 (collapsed)         │
│          │   turn 3 LIVE · thinking rail → generative panel│
│          │ [follow-up index tabs]                          │
│          │ [thread footer: Protected · Agent JSON · Share] │
├──────────┴─────────────────────────────────────────────────┤
│ AeQueryPanel (sticky)                                      │
└────────────────────────────────────────────────────────────┘
```

Older turns default **collapsed** (need + one-line); last complete turn expanded when idle. Mobile: sidebar drawer; compact turns use horizontal card scroll.

URL: `/t/$threadId` after first turn completes. `/?q=` redirects compat only.

Mobile: single column; cards stack or scroll; query panel above safe-area inset.

---

## States (ai-chat contract)

| State | Signal | Required |
| --- | --- | --- |
| Idle | Empty thread, welcome, focused query panel | Yes |
| Composing | User typing; send enabled | Yes |
| Thinking | `thinking` SSE within 400ms; caret or dots | Yes |
| Streaming | Tokens/artifacts arriving; Stop active | Yes |
| Tool-calling | N/A v1 (deterministic catalog search is implicit, not shown as tool trace) | Future |
| Complete | Stop hidden; cards linked; agent JSON live | Yes |
| Stopped | Frozen partial; quiet "Stopped" line | Yes |
| Empty | No matches + refine + `/claim` path | Yes |
| Error | Plain cause + retry | Yes |

Streaming rules from `ai-chat.md`: first pixel <400ms, stop always available, `aria-live="polite"` on one-line only, no fake typewriter slower than stream.

---

## Scroll engineering (locked)

Uses `@shadcn/react` `MessageScroller` via [`AeThreadScroller`](src/components/ae/chat/AeThreadScroller.tsx). Never hand-roll stick-to-bottom.

| Principle | AE behavior |
| --- | --- |
| Never move against intent | `autoScroll` defaults **off**; only on during a live turn |
| Follow only while following | MessageScroller yields on wheel/touch/keyboard/select |
| New turn near top | `scrollAnchor` on live turn; `scrollPreviousItemPeek` 72px keeps prior turn visible |
| Stream offscreen when reading up | Growth does not scroll unless user is at live edge |
| Out-of-view streaming | `AeThreadStreamingIndicator` when `streaming && !scrollable.end` |
| Jump to latest | `MessageScrollerButton` — label "Jump to latest" |
| Reopen saved thread | `defaultScrollPosition="last-anchor"`; last turn carries `scrollAnchor` |
| Layout shifts | Spacer + prepend preservation built into MessageScroller |
| Long threads | `messageId` per turn; `scrollToMessage` via `useMessageScroller` (future search) |

TanStack Virtual is a future option if transcript DOM exceeds ~100 turns; MessageScroller already uses `content-visibility` on items.

---

## Heuristic guardrails (locked)

- **Hick's Law:** one primary action per viewport (Ask, then one card CTA path).
- **Fitts's Law:** query panel sticky bottom; min 44px targets on Ask, Stop, example chips.
- **Doherty:** thinking event before 400ms; never blank 15s spinner.
- **Visibility:** streaming caret; status pills are text+color.
- **Match real world:** "What to do now" not "Next step"; no source-owned/readback on human surfaces.

---

## Acceptance bar

- [ ] `/` renders AeChat; submit stays on `/` with `/?q=` URL sync
- [ ] `/q/$answerId` legacy links redirect to `/?q=`
- [ ] Artifact catalog v1 only; map appears only on location-intent fixture queries
- [ ] Card click → `/$slug`; no side panel
- [ ] Registry reachable but not primary CTA on `/`
- [ ] All ai-chat streaming contract items pass
- [ ] Daylight Register visuals; finish bar on public chat surface

## Related specs

- **Answer synthesis authority:** `.planning/ANSWER-AI-CONTRACT.md`
- Answer stream detail: [landing-query.md](./landing-query.md) (merge into this file over time)
- Business citation page: [listing.md](./listing.md)
- Registry browse: [registry.md](./registry.md)

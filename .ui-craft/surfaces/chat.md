# Surface: Chat — Primary Product Shell

Governed by this file. Visual authority: `DESIGN.md` (Astryx Era). UX reference: Morphic-style chat-as-home, generative UI, and shareable threads. When this spec and `DESIGN.md` disagree on visuals, `DESIGN.md` wins. When they disagree on IA/journey, this file wins until `DESIGN.md` is amended.

## IA thesis (resolved)

**The product is the chat interface.** Query → generative UI → inline artifacts. Everything else is a citation target, conversion step, or secondary browse path.

| Surface | Role | Priority |
| --- | --- | --- |
| **`/`** | Primary shell — ask, stream answer, act on cards | P0 |
| **`/t/$threadId`** | Shareable thread with frozen evidence and replay-stable profiles | P0 |
| **`/?q={query}`** | Compatibility query entry that promotes into the same shell/thread model | P0 |
| **`/q/$answerId`** | Legacy deep link → redirects into the current answer experience | Deprecated |
| **`/$slug`** | Stable **business citation page** linked from cards | P1 |
| `/$slug/inquiry` | Conversion — leaves chat | P1 |
| `/registry` | Secondary browse when user prefers scanning | P2 |
| `/claim` | Owner onboarding | P2 |
| `/llms.txt`, agent JSON | Quiet agent door | P2 |

## Hard questions — resolved

### 1. What is the primary surface?

**`/` is the chat shell** — home renders the query/answer product, not a marketing funnel that redirects.

- **Idle:** Astryx public shell + compact welcome + boundary note + `ChatComposer`-style query panel.
- **Active:** welcome compresses to a single kicker row; `ChatMessageList`-style thread fills the viewport; composer stays pinned near the bottom safe area.

### 2. When does the user leave chat?

| Action | Leave chat? | Destination |
| --- | --- | --- |
| Submit query | No | Answer streams inline; URL/thread state syncs |
| Click provider card | Yes | Navigate to `/$slug` |
| Send inquiry | Yes | `/$slug/inquiry` |
| Claim business | Yes | `/claim` |
| Browse all | Yes | `/registry` |
| Get agent JSON | No | Fetch/copy in place |

**No artifact side panel in v1.** AE's deep artifact is the business page. Adding a panel duplicates `/$slug` before preview-only content is designed.

### 3. What is `/$slug` for?

A **durable citation artifact**: SEO, sharing, agent grounding, owner correction. Linked from provider cards with citation index. **Not** the primary browse UI and **not** where generative composition happens.

### 4. When does a map appear?

**Generative only — query-shaped, not page-default.**

| Context | Map? | Mechanism |
| --- | --- | --- |
| Chat answer, location-intent query | Yes | `location-map` artifact — Google Maps Embed, geocoded from parsed place in query |
| Chat answer, non-location query | No | Provider cards + prose only |
| `/$slug` listing | No default | Text service area only |
| `/$slug` listing, `officeAddress` published | Optional | Google Maps Embed of **office** |
| `/registry` | No | Text columns/cards |

Location intent (deterministic v1): suburb, postcode, "near", "in {place}", "directions", AU postcodes 4-digit pattern.

**Non-service businesses:** same card shape; synthesizer skips `location-map` artifact; service-area text still shown when present in catalog.

### 5. What artifacts can generative UI emit? (v1 budgeted catalog)

Generative artifacts are budgeted by response mode/profile before rendering. The allowlist is the authority, not the raw schema.

| Response/profile | Rendered budget |
| --- | --- |
| `clarify` / `clarification` | `one-line` → optional `prose` → compact `what-to-do-now`; provider artifacts forbidden |
| `answer` / `discovery_full` | `one-line` → `provider-cards` capped at 3 → optional `location-map` → optional `prose` → `what-to-do-now` |
| `filter` / `refinement_compact` | `one-line` → horizontal `provider-cards` capped at 3 → compact `what-to-do-now`; no map |
| `compare` / `compare_pair` | `one-line` → exactly one `provider-compare-table` using 2 providers → optional `prose` → compact `what-to-do-now`; no provider-card wall, tradeoffs, or checklists |
| `empty` / `empty_state` | `one-line` → one compact `recovery-prompts` surface plus empty-state copy; provider artifacts forbidden |
| `boundary` / `boundary_explain` | `one-line` → optional `prose` → compact `what-to-do-now`; provider artifacts forbidden |

Rendered v1 kinds: `one-line`, `provider-cards`, `provider-compare-table`, `location-map`, `prose`, `what-to-do-now`, `recovery-prompts`.

Known schema/renderer kinds not emitted by the v1 budget: `service-area-fit`, `next-step-menu`, `confirmation-checklist`, `route-perspective`, `published-details-rail`, `provider-tradeoff-list`, `message-starter`.

**Thread footer (once):** Protected-by-AE trust line, agent JSON from **need query**, copy link. Per-turn artifacts omit the footer trust strip and agent JSON.

**Out of v1:** artifact side panel, inline inquiry forms, LLM-generated related questions, json-render spec blocks.

### 6. What is `/registry` for?

**Secondary browse** — users who prefer scanning or agents linking humans to the index. Nav/footer placement; not the hero CTA. Column/card layout (`Provider | Services | Area | Status | Response`). Does not compete with query box on `/`.

### 7. Where does conversion happen?

**Preferred:** provider card in chat → user reads card → **View details** or inquiry path.

1. **Fast path (future):** inquiry CTA on card in stream → `/$slug/inquiry`
2. **Current path:** card → `/$slug` → sticky primary inquiry CTA → `/$slug/inquiry`

One primary action per viewport. Inquiry form includes consent + Protected-by-AE. Never fake booking/payment/dispatch.

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

**Deterministic index-tab chips** after the last complete turn (`{ label, submitQuery }`). Chips refine the same thread — narrow, filter, compare, boundary. LLM chips only when eval flag is on. No bubble-chat transcript.

### 11. Generative layout profiles

Each turn renders through the answer renderer with an explicit **`AnswerLayoutProfile`** and the matching artifact budget:

| Profile | When | Stack |
| --- | --- | --- |
| `discovery_full` | First specific answer | One-line → provider cards (max 3) → map? → prose → what-to-do-now |
| `clarification` | Broad/missing detail | One-line → optional prose → compact what-to-do-now; no providers |
| `refinement_compact` | Narrow / filter follow-ups | One-line → horizontal cards (max 3) → compact what-to-do-now |
| `compare_pair` | Compare chip | One-line → one compare table (2 providers) → optional prose → compact what-to-do-now |
| `boundary_explain` | Boundary chip | One-line → prose → compact what-to-do-now; no providers |
| `empty_state` | Zero providers | One-line → compact recovery prompts → empty-state copy |

**Thread footer (once):** Protected-by-AE trust line, agent JSON from **need query**, copy link. Per-turn artifacts omit trust strip and agent JSON.

---

## Composition (shape)

### Desktop — idle

```text
┌────────────────────────────────────────────────────────────┐
│ Astryx AppShell + TopNav                  [Browse][Claim] │
├────────────────────────────────────────────────────────────┤
│ Compact welcome: one-line value prop + boundary note       │
│                                                            │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ChatComposer-style query panel                         │ │
│ │ [ What do you need done? .................... ] [Ask]  │ │
│ │ examples: "no hot water Preston" · "electrician …"   │ │
│ └────────────────────────────────────────────────────────┘ │
│ footer · Assistants: /llms.txt                             │
└────────────────────────────────────────────────────────────┘
```

### Desktop — active thread (`/t/$threadId`)

```text
┌────────────────────────────────────────────────────────────┐
│ Astryx AppShell header                                     │
├──────────┬─────────────────────────────────────────────────┤
│ sidebar  │ [thread need title · copy link]            sticky │
│ recent   ├─────────────────────────────────────────────────┤
│ questions│ ChatMessageList                                 │
│          │   turn 1 (collapsed) · turn 2 (collapsed)         │
│          │   turn 3 LIVE · thinking rail → answer artifacts│
│          │ [follow-up index tabs]                          │
│          │ [thread footer: Protected · Agent JSON · Share] │
├──────────┴─────────────────────────────────────────────────┤
│ ChatComposer-style query panel                             │
└────────────────────────────────────────────────────────────┘
```

Older turns default **collapsed** (need + one-line); last complete turn expanded when idle. Mobile: sidebar drawer; compact turns use horizontal card scroll.

URL: `/t/$threadId` after first turn completes. `/?q=` remains compatibility only.

Mobile: single column; cards stack or scroll; query panel sits above safe-area inset.

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

Use the shared thread scroller already wired in the chat surface; do not hand-roll stick-to-bottom behavior. Presentation should align with Astryx chat primitives while preserving these behaviors.

| Principle | AE behavior |
| --- | --- |
| Never move against intent | `autoScroll` defaults **off**; only on during a live turn |
| Follow only while following | Scroller yields on wheel/touch/keyboard/select |
| New turn near top | Live turn is the scroll anchor; prior turn remains visible |
| Stream offscreen when reading up | Growth does not scroll unless user is at live edge |
| Out-of-view streaming | Show a streaming indicator when content arrives below the viewport |
| Jump to latest | Label "Jump to latest" |
| Reopen saved thread | Restore the last turn anchor |
| Layout shifts | Preserve position during prepend/growth |

Virtualization is a future option if transcript DOM exceeds ~100 turns.

---

## Heuristic guardrails (locked)

- **Hick's Law:** one primary action per viewport (Ask, then one card CTA path).
- **Fitts's Law:** query panel sticky bottom; min 44px targets on Ask, Stop, example chips.
- **Doherty:** thinking event before 400ms; never blank 15s spinner.
- **Visibility:** streaming caret; status pills are text+color.
- **Match real world:** "What to do now" not "Next step"; no source-owned/readback on human surfaces.

---

## Acceptance bar

- [ ] `/` renders the chat shell; submit stays in-shell and preserves URL/thread state
- [ ] `/q/$answerId` legacy links redirect into the current answer experience
- [ ] Artifact budget v1 only; provider cards cap at 3; clarify/boundary turns are provider-free; map appears only on location-intent fixture queries
- [ ] Card click → `/$slug`; no side panel
- [ ] Registry reachable but not primary CTA on `/`
- [ ] All ai-chat streaming contract items pass
- [ ] Astryx Era visuals from `DESIGN.md`; finish bar on public chat surface

## Related specs

- **Answer synthesis authority:** `.planning/ANSWER-AI-CONTRACT.md`
- Answer stream detail: [landing-query.md](./landing-query.md) (merge into this file over time)
- Business citation page: [listing.md](./listing.md)
- Registry browse: [registry.md](./registry.md)

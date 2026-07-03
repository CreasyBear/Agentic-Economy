# Surface Spec — Landing Query → Generative Answer

> **IA superseded by [chat.md](./chat.md)** (2026-06-30). This file retains streaming/answer-panel detail until merged. Journey and artifact rules live in `chat.md`.

The `/` surface is governed by this file for answer-stream mechanics and by `chat.md` for IA. Visual source of truth: `DESIGN.md` (Astryx Era). When this spec and `DESIGN.md` disagree on visuals, `DESIGN.md` wins.

## Intent

A person types a real-world local need and gets a tailored, grounded answer with real local providers — not a browse wall. Different query, different shaped answer. Think clean local search results crossed with a one-line direct answer: provider cards, real fields, one next step. No internal status jargon on the page.

## Composition

```text
+--------------------------------------------------------------------+
| Astryx AppShell + TopNav (AE identity · Browse · List business)    |
+--------------------------------------------------------------------+
|  compact welcome: The home of agentic commerce                     |
|  H1: What do you need done?                                        |
|  lede: Type a need. Get an answer with real local providers,       |
|        what they do, where they work, and the next step.           |
|                                                                    |
|  +--------------------------------------------------------------+  |
|  |  ChatComposer-style query panel                              |  |
|  |  [ What do you need done? .............. ] [Ask]              |  |
|  |  examples: "no hot water in Preston 3072" · …                |  |
|  +--------------------------------------------------------------+  |
+--------------------------------------------------------------------+
|  turn stream section appears on submit                             |
|  +--------------------------------------------------------------+  |
|  |  one-line answer                                             |  |
|  |  provider cards [1] [2] [3]                                  |  |
|  |  optional comparison table or map only when budget allows     |  |
|  |  summary prose — streamed in sentence chunks                  |  |
|  |  "What to do now" — one next step                            |  |
|  |  Get as agent JSON                                           |  |
|  |  [ Stop ] while streaming                                    |  |
|  +--------------------------------------------------------------+  |
+--------------------------------------------------------------------+
|  quiet agent door: "Assistants: read the registry" -> /registry   |
|  footer                                                           |
+--------------------------------------------------------------------+
```

### Regions

| Region | Required | Astryx-era usage | Notes |
| --- | --- | --- | --- |
| Header | Required | `AppShell` + `TopNav` | Identity, Browse, "List your business" (`/claim`). |
| Hero | Required | centered-hero + `ChatComposer` pattern | Welcome copy, boundary note, query composer, example queries. |
| Answer | Required (post-submit) | `ChatMessageList`/answer artifact composition | Turn-based generative answer. |
| Source cards | Required when providers exist | Astryx cards + `Citation`/`CitationSourceList` pattern | Name, category, service area, hours, status text, one link to `/$slug`. |
| Next step | Required | inline answer artifact | One plain "What to do now" line. |
| Agent affordance | Required | quiet link/button | `/api/businesses/search?q=…` or copy/fetch equivalent. |
| Agent door | Required | inline/footer link | "Assistants: read the registry" → `/registry`. |
| Footer | Required | shell footer | — |

### Provider source-card anatomy

A viewer answers in five seconds: Who is this? What do they do? Where do they operate? What can I do next?

- Provider name.
- Category.
- Service area (suburb / radius).
- Hours (real `hoursOrUnknown`, rendered plainly — "Check hours" when unknown).
- Status text/badge (one meaning; status meaning is never color-only).
- Service chips (what they do).
- Citation index + a link to `/$slug`.
- Optional image/evidence only when real catalog evidence exists.

No internal statuses. No badges that are not real. No invented availability or response times.

### One conversion action

The landing has **one** conversion action: submit a query. Secondary paths (`/claim`, `/registry`, `/$slug`) are reachable but do not visually compete with the query box. Squint test: H1 → query box → (after submit) answer line → first source card.

## States

| State | Required | Behavior |
| --- | --- | --- |
| Idle | Required | Hero + query box + examples. No answer panel. |
| Streaming | Required | On submit: paint answer shell + caret within 400ms (`thinking` event). Then `sources` (cards appear), then `summary-delta` chunks (prose assembles sentence-by-sentence), then `next-step`, then `complete`. `aria-live="polite"` on the answer region. A visible **Stop** button cancels the stream. |
| Complete | Required | Caret hidden. Stop hidden. Agent affordance live. Cards linked. |
| Stopped | Required | If the user hits Stop mid-stream, freeze what rendered; show a quiet "Stopped" line; keep the agent affordance if any content arrived. Never partial-mid-word. |
| Empty (no matches) | Required | A truthful "No listed businesses match …" line + an Astryx empty state + a "List your business" (`/claim`) or refine-query path. Never fabricate a provider. |
| Error | Required | Plain-language cause + a recovery action (retry). The `error` event carries a copy-id, never a stack trace. |
| No-JS | Required | With JS off, the query form submits GET to `/registry?q=…` (progressive enhancement). The page never breaks. |

Unknown fields render plainly ("Check hours", "Needs confirmation") — never `null`, `N/A`, or invented certainty.

## Motion

Per `DESIGN.md` and UI Craft motion constraints. Minimal-functional, leaning intentional.

- **First pixel < 400ms.** Emit the `thinking` SSE event immediately so the shell + caret paint before the first content event.
- **Signature assembly.** The answer panel assembles in short staggered steps: answer line → source cards/table/map when allowed → summary prose → next step → agent affordance. Use Astryx-compatible transitions only; GPU-only properties (opacity, transform).
- **Caret.** A steady caret or equivalent streaming signal appears while streaming; hides on `complete`/`stopped`.
- **No fake token latency.** The server emits `summary-delta` as a few real sentence-level chunks (never character-by-character, never server-side sleeps). The client paces reveal honestly.
- **No scroll-jacking.** The answer panel grows in place; the page does not auto-scroll against user intent.
- **Reduced motion.** `prefers-reduced-motion: reduce` → instant render, no caret blink, no stagger. All content appears at once.

## Accessibility

- The answer region is an `aria-live="polite"` landmark so screen readers announce assembled content without interrupting.
- The query box is a labeled form (`<label>`, `<input type="search">`), keyboard-reachable, with a visible focus ring.
- The Stop button is a real `<button>` with `aria-label="Stop"`; focusable and actionable while streaming.
- Each source card is a link to `/$slug` with an accessible name that includes the provider name + citation index (e.g. "Acme Plumbing — source 1").
- The "Get as agent JSON" affordance is a real link/button with an accessible name; its purpose is clear without color.
- Status meaning is never color-only: the availability label is text, not just a pill color.
- Color contrast meets WCAG AA against the active Astryx surface/background tokens.
- Mobile (390px): no horizontal overflow, 16px body text, thumb-reachable Ask + Stop, visible `/claim` path.

## Copy

Plain, warm, exact. The surface reads like local search, not an audit log.

Use: "What do you need done?", "Here’s what’s listed for … near …", "Check hours", "What to do now", "Get as agent JSON", "Assistants can read these published details.", "The business handles timing, price, and availability."

Availability labels come only from real fields (`hoursOrUnknown`, `firstRequest.mode`) via the plain status mapper. Never invent availability, freshness, or a response time. If a field is not known, say so plainly ("Check hours") rather than guessing.

No internal status or protocol jargon on the page. No fake booking, payment, dispatch, reviews, or ratings. No "verified" unless a real trust standard was met.

## Forbidden on this surface

- Retired pre-Astryx visual cues, custom public styling systems, dark command panels, purple-blue AI gradients, glassmorphism, blobs, decorative glow, or route-local component styling.
- Fake booking/payment/dispatch/review/rating UI. Fake dashboards. Fake metrics.
- A browse-wall hero (category grid first). The query box leads.
- Internal status or protocol vocabulary on the page. An audit-log style status wall.
- Hardcoded answer text. Every provider fact must be derivable from a live `PublicBusinessCatalogApiDto`.

## Acceptance bar

Done means every item passes:

- [ ] Query box leads the hero; H1 → query box squint test passes.
- [ ] Submit paints answer shell + caret within 400ms.
- [ ] SSE event order observed: `thinking → sources → summary-delta* → next-step → complete` (or `error`).
- [ ] Stop cancels the stream and freezes rendered content cleanly.
- [ ] Every provider source-card links to a real, resolvable `/$slug`; citation indices match.
- [ ] Rendered copy is plain human language; no internal status or protocol jargon; no fake claims (copy test green).
- [ ] Availability labels derive only from real fields; no invented freshness or response time.
- [ ] "Get as agent JSON" fetches `/api/businesses/search?q=…` and returns the live payload.
- [ ] No-JS submit falls back to `/registry?q=…` and does not break.
- [ ] `prefers-reduced-motion` → instant render, no caret, no stagger.
- [ ] `aria-live="polite"` on the answer region; Stop is a labeled button; cards have accessible names.
- [ ] Astryx Era visuals only: component/template presentation from `DESIGN.md`, Tailwind 4 layout glue, no retired route-local styling system.
- [ ] axe scan passes on the answer surface.

## Finish bar order

Run before reporting this surface done: Hierarchy → Type system → Surface stack → Spacing rhythm → Iconography → State coverage → Motion tuning → Microcopy voice → Pixel honesty → Data formatting. Zero Critical, zero Major findings. Minor findings ship only with a written reason tied to `.ui-craft/brief.md`.

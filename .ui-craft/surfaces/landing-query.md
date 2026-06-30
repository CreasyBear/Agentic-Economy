# Surface Spec — Landing Query → Generative Answer

The `/` surface. Governed by this file. Source of truth for visuals: `DESIGN.md` (Daylight Register, §10–§17). When this spec and `DESIGN.md` disagree, `DESIGN.md` wins.

## Intent

A person types a real-world local need and gets a tailored, grounded answer with real local providers — not a browse wall. Different query, different shaped answer. Think Google Maps search results crossed with a one-line direct answer: clean provider cards, real fields, one next step. No internal status jargon on the page.

## Composition

```text
+--------------------------------------------------------------------+
| AePublicShell header (AE identity · Explore · List your business)  |
+--------------------------------------------------------------------+
|  [ hand-drawn hero: Victorian house + faint skyline, ink on paper ]|
|                                                                    |
|  kicker: The home of agentic commerce                              |
|  H1 (Fraunces): What do you need done?                             |
|  lede: Type a need. Get an answer with real local providers,       |
|        what they do, where they work, and the next step.           |
|                                                                    |
|  +--------------------------------------------------------------+  |
|  |  AeQueryBox  [ What do you need done? .............. ] [Ask]  |  |
|  +--------------------------------------------------------------+  |
|  |  examples (mono, muted): "no hot water in Preston 3072" · …  |  |
|  +--------------------------------------------------------------+  |
+--------------------------------------------------------------------+
|  AeAnswerStream (appears on submit)                                |
|  +--------------------------------------------------------------+  |
|  |  one-line answer (Fraunces)                                  |  |
|  |  provider source-cards (AeProviderSourceCard) [1] [2] [3]    |  |
|  |  summary prose (Hanken Grotesk) — streamed in sentence chunks|  |
|  |  "What to do now" — one next step                            |  |
|  |  Get as agent JSON (AeAgentJsonAffordance, mono)             |  |
|  |  [ Stop ] while streaming                                    |  |
|  +--------------------------------------------------------------+  |
+--------------------------------------------------------------------+
|  quiet agent door: "Assistants: read the registry" -> /registry    |
|  footer (AePublicShell)                                             |
+--------------------------------------------------------------------+
```

### Regions

| Region | Required | Component | Notes |
| --- | --- | --- | --- |
| Header | Required | `AePublicShell` | Identity, Explore, "List your business" (`/claim`). |
| Hero | Required | `AeHandDrawnHero` + `AeQueryBox` | Hand-drawn hero asset, kicker, H1, lede, query box, example queries. |
| Answer | Required (post-submit) | `AeAnswerStream` | The generative answer panel. |
| Source cards | Required when providers exist | `AeProviderSourceCard` | One per provider. Google-Maps-clean: name, category, service area, hours, status pill, one link to `/$slug`. |
| Next step | Required | inline | One plain "What to do now" line. |
| Agent affordance | Required | `AeAgentJsonAffordance` | Quiet mono link → `/api/businesses/search?q=…`. |
| Agent door | Required | inline | "Assistants: read the registry" → `/registry`. |
| Footer | Required | `AePublicShell` | — |

### Provider source-card anatomy (Google-Maps-clean)

A viewer answers in five seconds: Who is this? What do they do? Where do they operate? What can I do next?

- Provider name (Fraunces).
- Category.
- Service area (suburb / radius).
- Hours (real `hoursOrUnknown`, rendered plainly — "Check hours" when unknown).
- Status pill (one pill, one meaning; eucalyptus / muted / slate).
- Service chips (what they do).
- Citation index + a link to `/$slug`.
- Optional: the hand-drawn category mark in place of a photo.

No internal statuses. No badges that aren't real. No invented availability or response times.

### One conversion action

The landing has **one** conversion action: submit a query. Secondary paths (`/claim`, `/registry`, `/$slug`) are reachable but do not visually compete with the query box. Squint test: H1 → query box → (after submit) answer line → first source card.

## States

| State | Required | Behavior |
| --- | --- | --- |
| Idle | Required | Hero + query box + examples. No answer panel. |
| Streaming | Required | On submit: paint answer shell + caret within 400ms (`thinking` event). Then `sources` (cards appear), then `summary-delta` chunks (prose assembles sentence-by-sentence), then `next-step`, then `complete`. `aria-live="polite"` on the answer region. A visible **Stop** button cancels the stream. |
| Complete | Required | Caret hidden. Stop hidden. Agent affordance live. Cards linked. |
| Stopped | Required | If the user hits Stop mid-stream, freeze what rendered; show a quiet "Stopped" line; keep the agent affordance if any content arrived. Never partial-mid-word. |
| Empty (no matches) | Required | A truthful "No listed businesses match …" line + hand-drawn empty-state spot art + a "List your business" (`/claim`) or refine-query path. Never fabricate a provider. |
| Error | Required | Plain-language cause + a recovery action (retry). The `error` event carries a copy-id, never a stack trace. |
| No-JS | Required | With JS off, the query form submits GET to `/registry?q=…` (progressive enhancement). The page never breaks. |

Unknown fields render plainly ("Check hours", "Needs confirmation") — never `null`, `N/A`, or invented certainty.

## Motion

Per `DESIGN.md` §17. Minimal-functional, leaning intentional.

- **First pixel < 400ms.** Emit the `thinking` SSE event immediately so the shell + caret paint before the first content event.
- **Signature assembly.** The answer panel assembles in short staggered steps: answer line → source cards → summary prose → next step → agent affordance. Easing `cubic-bezier(0.16, 1, 0.3, 1)`, durations 150–400ms, GPU-only (opacity, transform).
- **Caret.** A steady caret blinks in the summary region while streaming; hides on `complete`/`stopped`.
- **No fake token latency.** The server emits `summary-delta` as a few real sentence-level chunks (never character-by-character, never server-side sleeps). The client paces the reveal with `requestAnimationFrame`. Total answer time stays honest.
- **No scroll-jacking.** The answer panel grows in place; the page does not auto-scroll the user.
- **Reduced motion.** `prefers-reduced-motion: reduce` → instant render, no caret blink, no stagger. All content appears at once.

## Accessibility

- The answer region is an `aria-live="polite"` landmark so screen readers announce assembled content without interrupting.
- The query box is a labeled form (`<label>`, `<input type="search">`), keyboard-reachable, with a visible focus ring.
- The Stop button is a real `<button>` with `aria-label="Stop"`; focusable and actionable while streaming.
- Each source card is a link to `/$slug` with an accessible name that includes the provider name + citation index (e.g. "Acme Plumbing — source 1").
- The "Get as agent JSON" affordance is a real link/button with an accessible name; its purpose is clear without color.
- Status meaning is never color-only: the availability label is text, not just a pill color.
- Color contrast meets WCAG AA against `--ae-paper` for ink text and amber-on-ink for the primary action.
- Mobile (390px): no horizontal overflow, 16px body text, thumb-reachable Ask + Stop, visible `/claim` path.

## Copy

Plain, warm, exact. The surface reads like Google Maps, not an audit log.

Use: "What do you need done?", "Here's what's listed for … near …", "Check hours", "Needs confirmation", "What to do now", "Get as agent JSON", "Assistants can read these published details.", "No booking or payment on this page."

Availability labels come only from real fields (`hoursOrUnknown`, `firstRequest.mode`) via the `status-presentation.ts` plain mapper. Never invent availability, freshness, or a response time. If a field isn't known, say so plainly ("Check hours") rather than guessing.

No internal status or protocol jargon on the page. No fake booking, payment, dispatch, reviews, or ratings. No "verified" unless a real trust standard was met.

## Forbidden on this surface

- Coral, cream, linen, sand, beige backgrounds. Dark command panels. Purple-blue AI gradients. Glassmorphism. Blobs. Drop shadows as primary hierarchy. Bubble radii on everything.
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
- [ ] Daylight Register visuals only: paper, ink, single amber accent, Fraunces/Hanken Grotesk/IBM Plex Mono, 4px/6px/999px radii, hairline rules.
- [ ] Old dark `.ae-public-answer-card`/`.ae-public-boundary-panel`/`.ae-public-command` CSS is scope-retired on this surface (kept for `/$slug` until its own pass).
- [ ] axe scan passes on the answer surface.

## Finish bar order

Run before reporting this surface done: Hierarchy → Type system → Surface stack → Spacing rhythm → Iconography → State coverage → Motion tuning → Microcopy voice → Pixel honesty → Data formatting. Zero Critical, zero Major findings. Minor findings ship only with a written reason tied to `.ui-craft/brief.md`.

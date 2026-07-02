# Design Decision Log

Append-only, date-stamped record of design decisions that override skill defaults or project conventions. Each entry must include the decision, the rationale, and the consequences.

## 2026-06-30 — Operator nav stage-gating + command palette

- **Decision:** Production operator sidebar shows **core** destinations only (owner: Status + Inquiries; admin: Claims + Inquiries). Advanced routes (billing, business actions, monetization, etc.) appear in dev or when `VITE_AE_OPERATOR_ADVANCED_NAV=true`. **⌘K command palette always exposes all destinations.**
- **Rationale:** L1-005 IA audit — P4/P6 surfaces at equal weight confuse first-time owners (Priya persona). Power operators (Jordan) still need fast jumps without sidebar clutter.
- **Consequences:** `OperatorNavTier` on nav items; `AeOperatorCommandMenu` in shell topbar. Audit: `.ui-craft/reports/heuristic-multiperspective-surfaces.md`.


- **Decision:** Use UI Craft project memory in `.ui-craft/` as the durable design context for Agentic Economy.
- **Rationale:** Per-session re-derivation of color, typography, and voice leads to drift; a committed brief + tokens + specs keeps surfaces consistent.
- **Consequences:** Every public-surface change must run the finish bar (Passes 3, 4, 7, 9 at minimum) and update the relevant surface file.

## 2026-06-30 — Chat-first IA (Morphic-adapted)

- **Decision:** The primary product surface is **AeChat on `/`**, not a marketing landing that redirects. Query → generative UI → inline artifacts. Morphic is the UX reference; Daylight Commerce Routing is the visual/product direction.
- **Rationale:** User feedback + ui-craft `ai-chat.md` + `.ui-craft/brief.md` principle #1 ("Query in, generative answer out"). Building mandatory maps and audit-log listings put cartography and forensic layout ahead of the chat journey.
- **Consequences:** Rebuild `/` as chat shell; extend answer stream with artifact types; demote `/registry` to secondary browse; simplify `/$slug` to citation page. Full spec: `.ui-craft/surfaces/chat.md`; synthesis contract: `.planning/ANSWER-AI-CONTRACT.md`.

## 2026-06-30 — Maps are generative, not listing-default

- **Decision:** Service-area maps appear as **`location-map` artifacts in the chat answer** when the query has location intent. They do **not** appear on every `/$slug` listing. Office location uses **Google Maps Embed** on the listing **only when `officeAddress` exists** in catalog (schema follow-up).
- **Rationale:** Service-area maps are not useful for non-service businesses or non-location queries. Generative UI should compose maps when the user's question is place-shaped (Morphic-style artifacts), not as decorative page chrome.
- **Consequences:** No OSM/Nominatim on listings. `GOOGLE_MAPS_API_KEY` env for embed artifacts. Amend DESIGN.md §9.3/§12 interpretation (see below). `deterministic-synthesizer` gains location-intent heuristic.

## 2026-06-30 — No artifact side panel v1

- **Decision:** Provider card click **always navigates to `/$slug`**. No Morphic-style resizable inspector panel in the first ship.
- **Rationale:** Hick's Law — panel duplicates the citation page without preview-only content designed yet. Morphic's panel works for web search results; AE's deep artifact is the business page itself.
- **Consequences:** Simpler mobile/desktop parity. Revisit panel when inline preview spec exists.

## 2026-06-30 — Thread + sidebar v1 (supersedes stateless chat)

- **Decision:** Multi-turn **`/t/$threadId`** sessions with Convex persistence. **Session sidebar** lists threads after the first completed prompt. Share via `/t/$threadId`. `/?q=` becomes compat redirect only.
- **Rationale:** CEO + eng review — Perplexity-shaped UX requires thread continuity and wayfinding without waiting for Clerk auth. Catalog-grounded frozen evidence per turn preserves trust.
- **Consequences:** Supersedes "Stateless chat v1" below. Implementation: `.planning/phases/07-answer-thread-ai/`. Contract: `.planning/ANSWER-AI-CONTRACT.md`. Locked decisions: `07-DECISIONS.md`.

## 2026-06-30 — Stateless chat v1 (superseded)

- **Decision:** No Postgres chat history / thread sidebar in v1. Shareability via **`/?q=`** on `/`. Legacy `/q/$answerId` redirects to the same shell.
- **Rationale:** Morphic's history requires auth + DB; AE's first loop is catalog discovery + inquiry, not chat retention. Reduces scope for 9/10 pass.
- **Consequences:** ~~No sidebar thread list.~~ **Superseded 2026-06-30** by thread + sidebar v1 decision above.

## 2026-06-30 — Legacy landing rationalized

- **Decision:** Remove `AePublicLanding.tsx`, `AeAnswerStream.tsx`, and ~1.7k lines of `.ae-public-hero*` / `.ae-public-reveal` CSS. Public IA is **`AeChat` only** on `/` and `/q/*`.
- **Rationale:** ui-craft heuristic + finalize passes flagged dead dual stacks, insider marketing copy, 700ms reveal motion, and icon-card landing grammar — all superseded by chat-first brief.
- **Consequences:** ui-contract tests target `ae/chat` and `ae/listing`. Public IA is **`AeChat` on `/`** with `/?q=` share links; `/q/*` redirects only.


- **Decision:** Generative UI emits only: `one-line`, `provider-cards`, `location-map` (conditional), `prose`, `what-to-do-now`, `agent-json`, `protected-by-ae`. No json-render, no LLM related-questions, no inline inquiry form in v1.
- **Rationale:** ui-craft generative UI patterns — skeleton matches shape, fallback to text, progressive render. Scope control for 9/10.
- **Consequences:** `AnswerEvent` type extension in synthesizer; `AeArtifactRenderer` registry.

## 2026-06-30 — DESIGN.md amendment (recommended)

- **Decision:** Interpret DESIGN.md §9.3 "service-area map" as **first-class in generative answer panels when the query is location-shaped**, not a mandatory static element on every listing page. §12 Service-Area Map applies to **answer artifacts and office embeds when address data exists**.
- **Rationale:** Aligns written design spec with chat-first IA without abandoning map as a brand element where it earns its place.
- **Consequences:** Update DESIGN.md §9.3, §12, §14 in a dedicated doc PR after chat shell ships. Until then, `.ui-craft/surfaces/chat.md` governs IA.

## 2026-06-30 — Generative UI thread (AeGenerativeAnswer)

- **Decision:** Ship **`AeGenerativeAnswer`** with explicit **`AnswerLayoutProfile`** per turn. Thread footer owns Protected + agent JSON (need query). Older turns collapse by default. assistant-ui production adoption deferred; native renderer is P0.
- **Rationale:** Generative UI is the product — query shapes the panel. Three render paths (stream, replay, OpenUI) must share one profile contract. Per-turn footer duplication broke follow-up rhythm.
- **Consequences:** `FrozenTurnProse.layoutProfile` persisted. `buildArtifactsFromSnapshot` omits per-turn trust/agent JSON. Review checklist: `.ui-craft/reviews/chat-generative-ui-review.md`. assistant-ui spike remains optional branch compare.

## 2026-06-30 — Copy label: "What to do now"

- **Decision:** Replace all public visible **"Next step"** / **"Next"** labels with **"What to do now"**. Epistemic `NEXT_STEP` remains API/agent-layer only.
- **Rationale:** `.ui-craft/brief.md` principle #2; DESIGN.md §13 banned label list; ui-craft `copy.md` plain language.
- **Consequences:** `$slug.tsx`, `AeAnswerStream`, registry copy, contract-scans extension.

## 2026-06-30 — TanStack AI + OpenUI stack (not Vercel AI SDK)

- **Decision:** Generative chat uses **TanStack AI** (`@tanstack/ai`, `@tanstack/ai-react`) for structured output and **OpenUI Lang** (`@openuidev/react-lang`) for future dynamic layouts. Keep `GET /api/answer` SSE; add `POST /api/chat` AG-UI SSE. Do **not** adopt Vercel AI SDK, `@json-render`, or `@openuidev/react-ui` chat shell.
- **Rationale:** Morphic UX reference on TanStack-native substrate; dual protocol preserves share links, agents, and deterministic fallback.
- **Consequences:** Phase 2A ships AeChat on existing SSE; 2B adds `/api/chat` + grounding; 2C adds lazy OpenUI `ae-library`. Feature flag `VITE_AE_ANSWER_MODE=deterministic|structured`.


- **Decision:** `/registry` is P2 — column browse for scan-oriented users and agent referrals. Header CTA on `/` is Ask, not Browse.
- **Rationale:** Hick's Law — one primary action on home. Brief principle #7 (one conversion action per surface).
- **Consequences:** Registry polish remains in plan but does not block chat shell. Nav label may stay "Browse services" as secondary.

## 2026-07-01 — Visceral commerce copy, not defensive trust posture

- **Decision:** Public surfaces lead with fit and tangible provider evidence, not claims of safety/trust or uncertainty-first caveats. "Register" remains route/data vocabulary only; the public emotional read is commerce routing: ask for a service, see who fits, compare published details, contact the business.
- **Rationale:** User correction: repeated "safe", "trusted", "needs owner confirmation", and "may vary" language makes people less likely to rely on the product. The UI should demonstrate confidence through the artifact — services, service area, photos, response cues, source/freshness, and receipt — not through defensive adjectives.
- **Consequences:** DESIGN.md + `.ui-craft/brief.md` updated. Public copy should remove top-level "safe/trusted/register/needs confirmation" positioning. Boundary copy remains just-in-time: inquiry review/result, help/terms/privacy, agent payload, and refusal when a user asks AE to book/pay/dispatch.

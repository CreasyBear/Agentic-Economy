# L10 A11y / Perf Audit — Landing + Answer Funnel

**[CODE-ONLY REVIEW — no browser, axe, Lighthouse, or screen-reader run]**

**Scope:** WCAG 2.2 AA posture, `prefers-reduced-motion`, responsive layout, CLS on `/` and `/q/$answerId`  
**Evidence:** `tests/e2e/a11y/*`, `tests/e2e/landing-answer.spec.ts`, `src/styles/answer/`, `src/styles/globals.css`, `src/components/ae/chat/AeThreadTurnStreamSection.tsx`, `AeAnswerPromptInput.tsx`, `AeHandDrawnHero.tsx`, `AeProviderSourceCard.tsx`, `src/routes/index.tsx`, `src/routes/t.$threadId.tsx`  
**Date:** 2026-06-30  
**A11y posture:** 62 / C+ (code) — solid primitives on landing query chrome; answer stream live-region design and test gaps are the main WCAG risks.

## Summary

| Area | Verdict | Notes |
|------|---------|-------|
| WCAG AA (code) | **Partial** | Query box, skip link, focus rings, and reduced-motion layering are in good shape; answer stream `aria-live` + heading hierarchy need work. |
| Motion | **Pass (code)** | Global `globals.css` blanket + scoped `answer.css` overrides; entrance animations gated behind `no-preference`. |
| Responsive | **Partial** | Landing hero grid breaks at `56rem`; answer source-card fact grid stays 2-col with no narrow breakpoint; no horizontal-overflow tests on funnel routes. |
| CLS (landing/answer) | **Partial** | Hero image has explicit dimensions; streaming answer mounts sections sequentially with no reserved height — layout shift likely during stream. |
| E2E a11y coverage | **Gap** | `tests/e2e/a11y/*` covers skip link on `/`, claim, inquiry/owner, developer discovery — **not** landing submit or answer stream. |

## Findings

| # | Finding | Production gate? | Conversion lift | Effort | ROI tier | Evidence | Next step |
|---|---------|:---:|:---:|:---:|:---:|---|---|
| 1 | `aria-live="polite"` wraps entire answer stream while `summary-delta` appends per token — screen readers will flood on every chunk | **Yes** (WCAG 4.1.3 / practical SR) | Medium | S | **P0/A** | `AeAnswerStream.tsx` L137–138, L93–94; `applyEvent` summary-delta | Move live region to one-line + completion/status only; mark summary `aria-live="off"` until complete or use `aria-busy` + assertive only on error |
| 2 | No a11y E2E for landing → answer funnel (keyboard, overflow, live region) | **Yes** | Medium | M | **P0/A** | `tests/e2e/a11y/*` (none for `/q/`); `landing-answer.spec.ts` (functional only) | Add `landing-answer-a11y.spec.ts`: Tab order, `expectNoHorizontalOverflow` at 375px, stop button focus, stream complete announcement |
| 3 | Streaming answer mounts one-line → sources → summary → next-step → agent JSON without min-height — CLS on `/q/*` | Soft | **High** (perf UX) | M | **P1/B** | `AeAnswerStream.tsx`; `answer.css` (no skeleton/min-height) | Reserve min-height on `.ae-answer` per phase; optional skeleton for source list slot |
| 4 | Secondary controls under ~44px touch target (Stop, example chips, agent JSON) | Soft | Low | S | **P1/B** | `answer.css` `.ae-answer__stop`, `.ae-query-box__example`, `.ae-agent-json__button` | `min-height: 2.75rem` + padding on interactive chips/buttons |
| 5 | Answer page lacks document heading — query is `<p>`, page uses `section[aria-label="Answer"]` only | Soft | Low | S | **P1/B** | `q.$answerId.tsx` L42–47 | Promote query to `<h1>` (visually unchanged) or add sr-only h1 |
| 6 | Source-card facts grid fixed at 2 columns — narrow viewports may clip/truncate | No | Low | S | **P2/C** | `answer.css` `.ae-source-card__facts` L351–355; no `@media` in `answer.css` | `@media (max-width: 32rem) { grid-template-columns: 1fr; }` |
| 7 | Agent JSON “Copied” feedback is visual-only — no live announcement | No | Low | S | **P2/C** | `AeAgentJsonAffordance.tsx` L32 | `role="status"` + `aria-live="polite"` on copy confirmation |
| 8 | Hero figure duplicates accessible name (`figure[aria-label]` + `img[alt]`) | No | Low | S | **P2/C** | `AeHandDrawnHero.tsx` L9–12 | Remove `aria-label` from `<figure>`; rely on `alt` + `<figcaption>` |
| 9 | No automated axe / Lighthouse a11y gate in CI | Soft | Low | M | **P2/C** | `playwright.config.*` (no axe); a11y specs are manual assertions only | Add `@axe-core/playwright` smoke on `/` and `/q/$fixture` |
| 10 | Font bundles via CSS `@import` — FOUT risk on first paint (minor CLS/LCP) | No | Low | M | **P2/C** | `globals.css` L5–9; `tokens.css` L10–11 | Preload variable font woff2 or `font-display: swap` in build |

## Motion audit (code)

| Mechanism | Location | Reduced-motion handling | Verdict |
|-----------|----------|-------------------------|---------|
| Global animation/transition clamp | `globals.css` L74–82 | `0.01ms !important` on all elements | **Pass** |
| Answer caret blink | `answer.css` L142–155, L597–601 | Explicit `animation: none` in reduce block; also caught by global | **Pass** |
| Answer/source reveal | `answer.css` L578–615 | Gated `no-preference`; disabled in reduce | **Pass** |
| Source-card hover lift | `answer.css` L260–268, L609–611 | Transform cleared on reduce | **Pass** |
| Public marketing ticker (legacy CSS) | `globals.css` L1015–1044, L1893–1896 | Track animation disabled on reduce | **Pass** (not on current `/` landing) |

## Responsive audit (code)

| Surface | Breakpoints | Risk |
|---------|-------------|------|
| Landing hero | `answer.css` `@media (min-width: 56rem)` grid split | **Low** — single column below 56rem; copy precedes hero |
| Query box | `max-width: 40rem`, flex wrap on examples | **Low** |
| Answer head (stop + one-line) | flex wrap | **Low** |
| Source cards | 2-col fact grid always | **Medium** — no narrow override |
| Public shell nav | Tailwind wrap at `md` | **Low** — covered on other routes, not funnel-tested |

## CLS audit (code)

| Element | CLS mitigation | Risk |
|---------|----------------|------|
| Hero illustration | `width="960" height="720"` on `<img>` | **Low** |
| Web fonts | Self-hosted `@fontsource-variable`; no preload in route head | **Medium** FOUT |
| Stream one-line | Text replaces thinking caret in same `<p>` slot | **Low** |
| Source list mount | New `<ul>` after stream event | **High** |
| Summary / next-step / agent JSON | Sequential mount after sources | **High** |
| Entrance animations | `transform` + `opacity` only (`ae-answer-reveal`) | **Low** (no layout-affecting keyframes) |

## E2E a11y inventory

| Spec | Routes exercised | Landing/answer? |
|------|------------------|-----------------|
| `public-owner-a11y.spec.ts` | `/` skip link, `/claim`, inquiry, owner thread, admin | Skip link on `/` only |
| `protected-action-a11y.spec.ts` | Owner/admin protected actions | No |
| `developer-discovery-a11y.spec.ts` | `/developers/discovery` | No |
| `landing-answer.spec.ts` | `/` → `/q/*` stream | Functional, not a11y |

## Top 5 ROI

1. **Fix `aria-live` scope on `AeAnswerStream`** — stop per-token SR announcements during summary stream (P0/A).
2. **Add landing/answer a11y E2E** — keyboard path, mobile overflow, live-region behavior (P0/A).
3. **Reserve vertical space during answer stream** — reduce CLS on shareable answer pages (P1/B).
4. **Bring touch targets to 44px** on Stop, example chips, agent JSON (P1/B).
5. **Restore heading hierarchy on `/q/*`** — h1 for query (P1/B).

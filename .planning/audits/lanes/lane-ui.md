# L2 UI Audit — Design System Compliance (Daylight Register)

**Scope:** `DESIGN.md` vs `src/styles/tokens.css`, `globals.css`, `answer.css`, `src/components/ae/**`, `src/components/ui/**`  
**Date:** 2026-06-30  
**Verdict:** Tokens migrated; public routes split across daylight `answer.css` vs legacy dark `.ae-public-*` marketing CSS.

## Findings

| ID | Finding | Production gate? | Conversion lift | Effort | ROI tier | Evidence | Next step |
|----|---------|-------------------|-----------------|--------|----------|----------|-----------|
| UI-001 | Undefined token aliases in `globals.css` | **Yes** | Low | S | **A** | `globals.css` L213–214; `tokens.css` | Add missing aliases in `tokens.css` |
| UI-002 | Listing page uses dark answer record, not daylight layout | **Yes** | **High** | L | **A** | `$slug.tsx`; `globals.css` `.ae-public-answer-card` | Recompose `$slug` to Google-Maps-clean daylight layout |
| UI-003 | Business names use Hanken not Fraunces | **Yes** | Medium | S | **A** | `globals.css` `@theme`; `registry.tsx` | Map display font on provider names |
| UI-004 | Missing sticky amber inquiry CTA on listing hero | Soft | **High** | M | **A** | `$slug.tsx` hero actions | Add sticky `landingPrimary` inquiry CTA when available |
| UI-005 | shadcn defaults to bubble radius | Soft | Medium | M | **B** | `button.tsx`; `card.tsx` | 6px buttons, 4px panels per DESIGN §17 |
| UI-006 | Dual CSS systems (answer.css vs ae-public-*) | Soft | Medium | L | **B** | `index.tsx` vs `$slug.tsx` | Migrate product routes to `answer.css` primitives |
| UI-007 | Glassmorphism on public chrome | No | Low | S | **C** | `AePublicShell.tsx` | Opaque surface + hairline border |
| UI-008 | Drop shadows as hierarchy | Soft | Low | M | **C** | `answer.css`; `globals.css` | Border-color hover only |
| UI-009 | Status badge walls on listing | Soft | Medium | M | **B** | `$slug.tsx` capability badges | One availability pill + plain service chips |
| UI-012 | Epistemic vocabulary | **Pass** | — | — | — | `AePublicLanding.tsx` `fieldTrust()` | Keep mapping; add UI contract test |

## Top 5 ROI

1. UI-002 — Listing page visual paradigm
2. UI-004 — Above-fold amber inquiry CTA
3. UI-003 — Fraunces on business names
4. UI-001 — Broken CSS variable references
5. UI-006 — Consolidate dual CSS on product routes

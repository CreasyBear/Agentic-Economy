# AE Design System — Astryx Era

This document is the visual/UI authority for Agentic Economy. The previous
identity ("Daylight Register": Fraunces/amber/paper, hand-drawn hero, bespoke
`Ae*` component system, handwritten CSS files) is **retired**. Do not extend it;
migrate away from it.

## 1. The system

- **Component layer:** [Astryx](https://github.com/facebook/astryx)
  (`@astryxdesign/core`) with `@astryxdesign/theme-neutral`, `mode="light"`.
  Providers (`Theme`, `LinkProvider`, `LayerProvider`) are wired once in
  `src/routes/__root.tsx`. Internal navigation goes through
  `src/components/astryx/RouterLink.tsx` (TanStack Router adapter).
- **Utility layer:** Tailwind 4 (CSS-first, no config file) for layout glue —
  spacing, flex/grid arrangement, responsive breakpoints — using the Astryx
  token bridge (`@astryxdesign/core/tailwind-theme.css`).
- **Style entry:** `src/styles/globals.css` owns the layer cascade
  (`reset → theme → base → astryx-base → astryx-theme → components → utilities`).
  `src/styles/legacy.css` is the retiring old system; it only shrinks.

## 2. Rules

1. **Astryx first.** Reach for an Astryx component or pattern before writing
   anything. `npx astryx component <Name>` for docs, `npx astryx template --list`
   for page/block templates. A local clone for source reference lives at
   `/tmp/astryx` during migration.
2. **Tailwind is glue, not a design system.** Utilities arrange Astryx
   components; they do not restyle their internals. Use semantic bridge classes
   (`text-primary`, `text-secondary`, `bg-surface`, `bg-card`, `bg-body`,
   `border-border`, `rounded-md`, `shadow-sm`). Raw hex/oklch literals and
   arbitrary-value classes are prohibited outside a token definition.
3. **No new bespoke CSS files.** No additions to `src/styles/` beyond
   `globals.css`. If a component gap is real, first compose Astryx primitives;
   if that fails, `npx astryx swizzle <Name>` and own the ejected source under
   `src/components/astryx/`.
4. **No parallel component systems.** shadcn/radix/cva components
   (`src/components/ui/*`) are legacy; do not add to them or import them in new
   code. One import per concern: dialogs are Astryx `Dialog`, toasts are Astryx
   `useToast`, tables are Astryx `Table`.
5. **Typography and icons come from the theme.** theme-neutral's type scale and
   Lucide icons. No font packages, no ad-hoc `font-family`.

## 3. Surface conventions

| Surface | Shape |
| --- | --- |
| Public (`/`, `/registry`, `/$slug`, legal) | `AppShell` + `TopNav` (logo heading, nav items, single CTA). Content templates: `centered-hero`, `product-gallery`, `detail-page`. |
| Chat/answer (`/`, `/t/$threadId`, `/q/$answerId`) | Astryx `Chat*` family: `ChatMessageList`, `ChatComposer` (streaming state), `ChatToolCalls` for research/tool traces, `Citation`/`CitationSourceList` for sources, `useStreamingText` for reveal. The answer-contract profiles (`.planning/ANSWER-AI-CONTRACT.md`) still govern structure and budgets. |
| Owner (`/owner/*`) | `AppShell` + `SideNav`; `detail-page` for threads/receipts; `settings` template for account-ish pages; `Table` for lists. |
| Admin (`/admin/*`) | `AppShell` + `SideNav`; `table-page` / `table-grouped` patterns with `Toolbar` filters and `Badge`/`StatusDot` status. |
| Forms (`/$slug/inquiry`, `/claim`) | `FormLayout` + `Field` components; `form-two-column` / `contact-form` shapes; one primary action per viewport. |
| Feedback | `Banner` (persistent), `useToast` (transient), `EmptyState`, `Skeleton`/`Spinner`. |

## 4. What stays custom

Behavioral modules keep their logic and re-skin on Astryx primitives: answer
streaming/turn state (`answer-stream.ts`, `turn-stream-session.ts`), the map
artifact, observability boot/error boundary, funnel attribution. Presentation
belongs to Astryx; state machines belong to AE.

## 5. Product constraints (unchanged)

- Boundary-honest copy everywhere: AE reads, compares, and routes inquiries; it
  does not book, charge, or dispatch. "Verified" only against a named standard.
- `KNOWN/UNKNOWN/UNAVAILABLE/NEXT_STEP` never appear on human surfaces.
- No internal architecture words in public copy (see AGENTS.md).
- One primary action per viewport on conversion paths
  (card → `/$slug` → inquiry CTA → `/$slug/inquiry`).
- Anti-slop still applies: no purple gradients, no 3-column icon grids, no
  centered-everything, no gradient CTAs, no glassmorphism.

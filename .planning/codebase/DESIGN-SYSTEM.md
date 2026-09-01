# Design System

**Analysis Date:** 2026-09-01

This map is grounded in the live token authority `src/styles/globals.css` (the 2026-09-01 Twenty-website grammar rebase), the locked brand authority `.planning/BRAND.md`, `components.json`, and the contract test `tests/ui-contract/ui-contract.test.ts`. The maintained per-concern docs in `.planning/design-system/` are indexed at the end.

**⚠️ Freshness flag:** the per-concern docs (most importantly `FOUNDATIONS.md`) were written against the **pre-rebase** system — they document Inter/DM Mono/Geist Pixel, an OKLCH palette, `--radius-card: 0.9375rem`, and 100/160/220ms motion. `src/styles/globals.css` on disk is the **Twenty-website rebase**: Host Grotesk/Azeret Mono/Aleo, hex neutral palette with `#4a38f5` accent, 2px/4px radii, and 150/220/300ms motion. Where the two disagree, `globals.css` wins and this document quotes globals.css. The per-concern docs' color/typography/geometry/motion sections are stale and need a re-reconcile pass; their component/layout/pattern/a11y/concern content remains accurate.

## Authority chain

1. `.planning/BRAND.md` — locked (2026-08-23, founder direction). Palette direction, type roles, voice rules, forbidden moves (no gradients except one hero glow, no glass, no teal wash, no decorative dashboards/tickers/tilt/number-roll theatre), accessibility commitments.
2. `DESIGN.md` — visual authority (referenced by the globals.css header comment: "DESIGN.md is the visual authority. ... surfaces do not invent their own palettes, type scales, radii, or elevation systems" — `src/styles/globals.css:1-5`).
3. `src/styles/globals.css` — the token manifest and semantic bridge. Layer order: `@layer reset, theme, base, clerk, components, utilities` (`globals.css:6`). Imports Host Grotesk Variable, Azeret Mono Variable, Aleo 300, `./base.css` into `base`, `tw-animate-css`, Tailwind theme/preflight/utilities (`globals.css:8-17`). `@source not "../../.planning"` keeps planning docs out of Tailwind scanning (`globals.css:20`).
4. `src/styles/base.css` — cross-surface structural primitives (reset, `[data-ae-site-button]` construction, reduced-motion blocks, scroll behavior) imported into the `base` layer.
5. `components.json` + components — shadcn generation config and consumers.

There is **no dark mode**: `:root` sets `color-scheme: light` (`globals.css:124`) with no `.dark` block. `tests/unit/styles/theme-token-parity.test.ts` documents this.

## Color

### Core palette (globals.css `:root`, `globals.css:132-155`)

| Role | Token | Value |
| --- | --- | --- |
| Canvas | `--ae-bg` | `#f4f4f4` |
| Ink / foreground | `--ae-fg` | `#1c1c1c` |
| Muted text (AA) | `--ae-muted-fg` | `rgba(28, 28, 28, 0.7)` — comment: "black-70 delivers WCAG AA on light surfaces (black-60 is 4.48:1, FAIL — the Twenty reference flags exactly this)" |
| Decorative/label-only text | `--ae-fg-subtle` | `rgba(28, 28, 28, 0.4)` — "never body/supporting text" |
| White data surface | `--ae-surface` | `#ffffff` |
| Sunken surface | `--ae-surface-sunken` | `#f4f4f4` |
| Work-well/container | `--ae-container` | `var(--ae-surface)` (surface color, not a width) |
| Hairline border | `--ae-border` | `rgba(28, 28, 28, 0.1)` |
| Strong border / input | `--ae-border-strong` | `rgba(28, 28, 28, 0.2)` |

Comment anchor: "Twenty-website grammar (owner rebase 2026-09-01): neutral field behind white data surfaces; near-black ink; hairlines black-10/20" (`globals.css:132-134`).

### Action vs accent

- `--ae-primary: var(--ae-fg)` / `--ae-primary-fg: #ffffff` (`globals.css:157-158`) — **primary actions are near-black ink, not blue**.
- `--ae-brand: #4a38f5`, `--ae-brand-strong: #3b2bd8`, `--ae-brand-muted: rgba(74, 56, 245, 0.12)`, `--ae-on-brand: #ffffff` (`globals.css:159-162`). Blue is reserved for links, selection, focus, and information only (BRAND.md).
- `--ae-ring: var(--ae-brand)` (`globals.css:163`) — **the focus ring is brand blue** in the rebased grammar.

### Status colors (globals.css `:root`, `globals.css:165-176`)

| Meaning | Tokens |
| --- | --- |
| Success | `--ae-success: oklch(0.5423 0.1222 157.98)`, `--ae-success-foreground: oklch(0.32 0.085 150)`, `--ae-success-ring: oklch(0.53 0.12 150 / 0.32)`, `--ae-success-subtle: oklch(0.95 0.025 150)` |
| Warning | `--ae-warning: oklch(0.5948 0.1401 58.96)`, `--ae-warning-foreground: oklch(0.35 0.08 70)`, `--ae-warning-ring: oklch(0.69 0.13 78 / 0.38)`, `--ae-warning-subtle: oklch(0.96 0.035 82)` |
| Danger | `--ae-danger: oklch(0.5408 0.176 27.61)`, `--ae-danger-ring: oklch(0.53 0.18 28 / 0.32)`, `--ae-danger-subtle: oklch(0.95 0.03 28)`, plus shadcn `--destructive: var(--ae-danger)`, `--destructive-foreground: oklch(0.985 0.002 106)` (`globals.css:187-188`) |
| Info | `--ae-info: var(--ae-brand)`, `--ae-info-foreground: #2f22c9`, `--ae-info-ring: rgba(74, 56, 245, 0.32)`, `--ae-info-subtle: var(--ae-brand-muted)` (`globals.css:173-176`) |

Statuses carry literal state only; green/amber/red never decorate non-state emphasis (BRAND.md; enforced by voice/CONVENTIONS.md rules).

### Bridge and aliases

`@theme inline` (`globals.css:22-121`) maps every `--ae-*`/shadcn variable to `--color-*` utilities (`--color-brand`, `--color-success-ring`, `--color-sidebar-*`, etc.). Shadcn aliases in `:root`: `--background → var(--ae-bg)`, `--muted/--accent → var(--ae-surface-sunken)`, `--input → var(--ae-border-strong)`, `--ring → var(--ae-ring)`, `--radius: 0.125rem` (`globals.css:178-196`). Sidebar set aliases to bg/fg/border (`globals.css:198-207`).

## Typography

Font imports (`globals.css:8-11`): `@fontsource-variable/host-grotesk`, `@fontsource-variable/azeret-mono`, `@fontsource/aleo/300.css`, `@fontsource/aleo`. Family tokens (`:root`):

| Role | Token | Stack |
| --- | --- | --- |
| Interface body/headings | `--font-family-body` = `--ae-font-sans` = `--font-sans` | `"Host Grotesk Variable", "Host Grotesk", ui-sans-serif, system-ui, sans-serif` |
| Public display | `--font-family-display` = `--ae-font-display` = `--font-display` | `"Aleo", Georgia, "Times New Roman", serif` |
| Data/code | `--font-family-code` = `--ae-font-mono` = `--font-mono` | `"Azeret Mono Variable", "Azeret Mono", ui-monospace, "SFMono-Regular", Menlo, monospace` |

Weights: 400/500/600/700 (`--font-weight-normal|medium|semibold|bold`). Base heading rules (`globals.css:324-335`): h1–h4 use `var(--ae-font-sans)`, weight 600, line-height 1.15, `text-wrap: balance`; h1/h2 letter-spacing −0.025em, h3/h4 −0.015em. `.font-display` is Aleo at weight 300 with `font-synthesis-weight: none` (`globals.css:337-340`). `::selection` = brand-muted background + fg ink (`globals.css:342-345`).

Roles (BRAND.md): Host Grotesk for interface and headings; Azeret Mono for identifiers/data/buttons; Aleo (300) for the single public display statement only. Display type never enters forms, tables, command surfaces, or operational status.

## Geometry

### Radius collapse (the Twenty grammar, `globals.css:59-72`)

```css
/* Collapse Tailwind's default radius/shadow scale onto the Twenty grammar
   so components using rounded-* / shadow-* resolve to it centrally instead
   of writing ad-hoc geometry. Controls 2px; larger surfaces 4px; nothing
   above. Elevation is the donor four-level ladder. */
--radius-card: 0.125rem;   /* 2px */
--radius-nav: 0.125rem;    /* 2px */
--radius-sm: 0.125rem;  --radius-md: 0.125rem;      /* 2px controls */
--radius-lg: 0.25rem;   --radius-xl: 0.25rem;  --radius-2xl: 0.25rem;  /* 4px larger surfaces */
```

`--radius: 0.125rem` (`globals.css:196`) is the shadcn control radius. Status pills stay `rounded-full` (`src/components/ui/badge.tsx`). Public notched actions use SVG geometry in `AeSiteButtonShape.tsx`, not radius tokens.

### Shadow ladder (donor four-level)

| Level | Token | Value |
| --- | --- | --- |
| Low | `--shadow-low` (→ `shadow-soft`, `shadow-xs`/`sm`) | `0 1px 3px 0 rgba(0, 0, 0, 0.06)` |
| Med | `--shadow-med` (→ `shadow-float`, `shadow-md`) | `0 12px 32px rgba(0, 0, 0, 0.08)` |
| High | `--shadow-high` (→ `shadow-float-dark`, `shadow-lg`) | `0 12px 32px rgba(0, 0, 0, 0.4)` |
| Overlay | `--ae-shadow-overlay` (→ `shadow-overlay`, `shadow-xl`/`2xl`) | `0 12px 32px -16px rgba(0, 0, 0, 0.18)` |
| Insets | `--shadow-inset-hover` (1px border-strong), `--shadow-inset-selected` (2px brand), `--shadow-inset-market-row` (1px brand, → `shadow-market-row-hover`) | selected/market-row hover states |
| Scrim | `--ae-overlay-scrim` | `rgba(28, 28, 28, 0.16)` |

### Spacing scale (`globals.css:200-215`, bridged `globals.css:103-118`)

| Token | Value | Utility |
| --- | --- | --- |
| `--ae-nav` | `1160px` | `max-width-nav` / `@utility ae-nav` |
| `--ae-rail` | `1080px` | `max-width-rail` / `@utility ae-rail` (adds gutter, 26px at md) |
| `--ae-gutter` / `--ae-gutter-lg` | `16px` / `26px` | `spacing-gutter`, `spacing-gutter-lg` |
| `--ae-space-intra` | `8px` | `spacing-intra` |
| `--ae-space-related` | `16px` | `spacing-related` |
| `--ae-space-section` | `32px` | `spacing-section` |
| `--ae-space-page` | `48px` | `spacing-page` |
| `--ae-space-hero` | `72px` | `spacing-hero` |
| `--ae-space-band` | `96px` | `spacing-band` |
| `--ae-touch` | `44px` | `spacing-touch` (min-h-touch etc.) |
| `--ae-nav-stack` | `56px` | measured sticky public header stack |
| `--ae-fold-peek` | `48px` | NN/G false-floor rule for hero fold |
| `--ae-anchor` | `calc(nav-stack + 16px)` | scroll offset |
| `--ae-fold` / `--ae-chapter` | `calc(100svh - var(--ae-nav-stack))` | `--min-height-fold`/`chapter` + `@utility min-h-fold`, `min-h-fold-hero` (auto→md calc), `min-h-chapter` (`globals.css:280-321`) |

## Motion

Canonical values (`globals.css:210-214`): `--motion-duration-fast: 150ms`, `--motion-duration-base: 220ms`, `--motion-duration-slow: 300ms`; `--motion-ease-standard: cubic-bezier(0.22, 1, 0.36, 1)`, `--motion-ease-emphasized: cubic-bezier(0.16, 1, 0.3, 1)`. Product aliases `--ae-duration-*` / `--ae-ease-*` (`globals.css:215-217`) and explicit `@utility duration-fast/base/slow` + `ease-standard/ease-emphasized` (`globals.css:225-255`). Focus recipe: `--ae-focus-ring: 0 0 0 2px var(--ae-brand)` (`globals.css:219`) — note this is the rebased single brand-blue ring, not the old ink double-ring (see ACCESSIBILITY.md gap below).

Reduced motion: two `@media (prefers-reduced-motion: reduce)` blocks in `src/styles/base.css` disable smooth scrolling, remove button hover transforms, and clamp all animation/transition durations. No decorative perpetual motion anywhere (BRAND.md forbidden list).

## Component conventions

- **shadcn config** (`components.json`): style `new-york`, `rsc: false`, `tailwind.css: "src/styles/globals.css"`, empty tailwind config (CSS-first Tailwind v4), `baseColor: neutral`, `cssVariables: true`, `iconLibrary: lucide`; aliases `@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, `@/hooks`.
- **Primitive consumption pattern** — `src/components/ui/badge.tsx`: a `cva` variant matrix composed with `cn(...)` from `src/lib/utils.ts`; every class is a semantic token utility (`bg-primary`, `text-success-foreground`, `border-success-ring`, `duration-fast`, `ease-standard`, `focus-visible:ring-ring/50`); Radix `Slot` for `asChild`; `data-slot="badge"`/`data-variant` hooks. Its `success`/`warning`/`info` variants pair the corresponding `*-ring`/`*-subtle`/`*-foreground` tokens — the canonical status-pill pattern.
- **AE component pattern** — product components under `src/components/ae/` (PascalCase `Ae*` names) compose the same semantic utilities over `cn`; domain status mapping is centralized in `src/lib/ui/status-presentation.ts`, state vocabulary in `src/lib/ui/ui-state.ts` (`loading, empty, draft, saving, saved, pending, succeeded, refused, stale, unavailable, outcome_unknown`).
- Buttons: `src/components/ui/button-variants.ts` deliberately narrows `transition-all` to an explicit property list (`transition-[color,background-color,border-color,box-shadow,opacity,scale]`) and adds `max-sm:min-h-touch max-sm:min-w-touch` plus `active:scale-[0.96]`; its comment warns that `shadcn add --overwrite button` restores `transition-all`.
- Radix wrappers (dialog, sheet, select, tabs, etc.) retain primitive behavior and add `data-slot` + AE token classes; overlays use `var(--ae-overlay-scrim)`, `duration-base`, `ease-standard`, `shadow-overlay`.
- Icons: Lucide named imports, decorative ones `aria-hidden`, icon-only controls labeled.
- No raw hex/oklch/arbitrary values in product UI: new cross-surface values go into `:root` + `@theme inline` in globals.css, never a feature file (CONVENTIONS.md; globals.css header comment).

## Accessibility

Committed in `.planning/BRAND.md`: AA text contrast, visible double focus, semantic tables/headings, keyboard operation, 44px mobile touch targets, reduced motion, explicit loading/empty/error/recovery states. Full treatment in `.planning/design-system/ACCESSIBILITY.md`. Known focus-ring gap (verified there): the central `--ae-focus-ring` token is defined in globals.css but component styles spell out ring utilities individually (`focus-visible:ring-[3px] focus-visible:ring-ring/50` in button-variants/badge/input etc.), so the treatment drifts per control; dialog/sheet close buttons use `focus:ring-2` (not `focus-visible`) and lack 44px sizing. Also flagged: a11y E2E coverage is route-smoke only (`tests/e2e/a11y/*.spec.ts`), no axe/automated audit exists.

## Enforcement

`tests/ui-contract/ui-contract.test.ts` enforces two gates via `scanUiContract` from `src/lib/ui/contract-scans.ts`:

1. **Semantic-token gate:** `src/components/ae/**` and `src/routes/**` must produce zero scanner violations (product UI stays on semantic visual tokens; `src/lib/ui/contract-scans.ts:193-248` deliberately excludes `src/components/ui` — a known coverage gap in CONCERNS.md).
2. **Primitive shell gate:** reads `dialog.tsx` + `sheet.tsx` + `sidebar.tsx` source and asserts — no `transition-all`; no `bg-black/\d+` scrim; no `shadow-(sm|md|lg|xl|2xl)`; must contain `duration-base`, `ease-emphasized`, `shadow-overlay`, `active:scale-[0.96]` (`tests/ui-contract/ui-contract.test.ts:16-39`).

Additional guard: `tests/unit/styles/theme-token-parity.test.ts` checks token symmetry and documents the absence of a `.dark` split.

## Per-concern doc index (`.planning/design-system/`)

| Doc | Scope (one line) | Freshness |
| --- | --- | --- |
| `FOUNDATIONS.md` | Token architecture, color/type/shape/space/elevation/motion/focus rules and token-extension procedure | **Stale on color/type/geometry/motion values** (documents pre-rebase Inter/Geist Pixel, oklch, 15px radii, 100/160/220ms); its cascade/ownership/extension rules remain correct |
| `COMPONENTS.md` | File-complete inventory of `src/components/ui/` (shadcn stock + AE extensions), `src/components/ae/` feature components, `src/lib/ui/` helpers, iconography, variant/composition pattern, state vocabulary | Current |
| `LAYOUT.md` | Public/Market/Operator/Chat modes, shells, rails/fold utilities, route-to-surface map, five-step Operation composition, responsive rules, known inset-well divergence | Current |
| `PATTERNS.md` | Interaction patterns: inspect-and-call five-step sequence, evidence classes, browse/compare, chat, command panel, forms, loading/empty/error/recovery, motion patterns, invariants | Current |
| `ACCESSIBILITY.md` | Source-grounded a11y map: focus styling (incl. `--ae-focus-ring` drift gap), keyboard, semantics, ARIA, form wiring, reduced motion, touch targets — with verified/gap labels | Current |
| `CONVENTIONS.md` | Token-first rule, CSS-first Tailwind v4, class composition (`cn`, cva, state selectors), naming/imports, states, copy/voice, density rules, new-UI checklist | Current |
| `CONCERNS.md` | Design debt: market header type drift, operator uppercase labels, shared-control radius/focus bypass, Clerk parallel vocabulary, overlay inconsistency, scanner gaps, fragile areas, perf notes | Current |

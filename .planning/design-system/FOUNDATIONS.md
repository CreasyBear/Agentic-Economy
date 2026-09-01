# Design Foundations

**Analysis Date:** 2026-09-01

This document maps the current light-only token system in `src/styles/globals.css` and the cross-surface rules in `src/styles/base.css`. `DESIGN.md` is the visual authority, with `.planning/BRAND.md` as the locked product and brand authority. The implementation is intentionally compact, neutral, and mechanical: canvas and ink do most of the work, blue is a constrained information accent, and status colors carry literal state only.

## Token architecture

### Ownership and cascade

`src/styles/globals.css` is the token manifest and semantic bridge. Its header explicitly says that surfaces must not invent their own palettes, type scales, radii, or elevation systems. The file establishes the cascade with:

```css
@layer reset, theme, base, clerk, components, utilities;
```

It imports the three product font families, `src/styles/base.css` into the `base` layer, `tw-animate-css`, and Tailwind v4 theme, preflight, and utilities layers. `@source not "../../.planning"` keeps planning documents out of Tailwind source scanning.

The dependency chain is:

1. **Raw semantic values and product aliases:** `:root` in `src/styles/globals.css` owns the light palette, font families and weights, the shared radius, layout measurements, motion values, focus ring, scrim, and shadows.
2. **Tailwind v4 bridge:** the `@theme inline` block in `src/styles/globals.css` maps Tailwind namespaces such as `--color-background`, `--font-sans`, `--shadow-soft`, `--duration-base`, `--max-width-rail`, and `--spacing-related` to the `:root` variables. Because this is `inline`, generated utilities resolve the semantic variable rather than copying a feature-local value.
3. **Explicit reusable utilities:** `@utility duration-*`, `@utility ease-*`, `@utility ae-nav`, `@utility ae-rail`, `@utility min-h-fold`, `@utility min-h-fold-hero`, and `@utility min-h-chapter` in `src/styles/globals.css` encode the reusable behavior that cannot be expressed by a single scalar token, especially the responsive fold rules.
4. **Base responsibilities:** `src/styles/base.css` is imported into the `base` layer. It owns reset behavior, document backgrounds and rendering, numeric alignment, section-scheme joins, the public notched-button primitive, reduced-motion overrides, shared border/outline defaults, font inheritance, and thin scrollbars.
5. **Component linkage:** `components.json` points shadcn generation at `src/styles/globals.css`, selects the `new-york` style and `neutral` base color, enables CSS variables, leaves the Tailwind config empty for CSS-first Tailwind v4, and selects Lucide. Its aliases are `@/components`, `@/lib/utils`, `@/components/ui`, `@/lib`, and `@/hooks`.

A class such as `bg-container`, `text-muted-foreground`, `rounded-card`, `max-w-rail`, `px-gutter`, `duration-base`, or `ease-emphasized` should therefore be treated as a semantic API. Do not replace it with a local hex, arbitrary radius, shadow, or timing value in a feature. Note that `--container` is a **surface color** (`var(--ae-container)`), not the width token; width is exposed separately as `max-w-nav` and `max-w-rail`.

### Light-only mode

There is **no dark mode**. `:root` declares `color-scheme: light` in `src/styles/globals.css`, and the file contains no `.dark` token block or dark palette. The light values below are the complete authority. Stock component selectors containing dormant `dark:` variants do not create a second AE theme; new work must not add or depend on one unless the product authority changes.

## Color

### Surface and ink foundations

`DESIGN.md` defines three surface levels: canvas, sunken work area, and raised surface. `.planning/BRAND.md` names them as the warm canvas, white data surfaces, and near-black ink actions. The source values are all in OKLCH in `src/styles/globals.css`.

| Role | Token | Current value | Use |
| --- | --- | --- | --- |
| Canvas | `--ae-bg` | `oklch(0.9663 0.004 106.47)` | Page chrome and document background; brand hex shorthand is `#f4f4f1`. |
| Ink | `--ae-fg` | `oklch(0.2178 0 0)` | Near-black text and primary action ink; brand shorthand is `#1a1a1a`. |
| Muted ink | `--ae-muted-fg` | `oklch(0.493 0 0)` | Secondary labels and supporting copy. |
| Raised surface | `--ae-surface` | `oklch(1 0 0)` | White data surface, card, and popover. |
| Sunken surface | `--ae-surface-sunken` | `oklch(0.9546 0.0027 106.45)` | Work-area/muted surface and quiet grouping. |
| Raised alias | `--ae-surface-raised` | `var(--ae-surface)` | Named raised-surface seam for future consumers; currently the same white surface. |
| Container/work-well | `--ae-container` | `var(--ae-surface)` | Opaque navigation container and authenticated work well. It is intentionally distinct in name from width utilities. |
| Hairline border | `--ae-border` | `oklch(0.215 0.004 106 / 0.12)` | Structural divider and default border. |
| Strong border/input | `--ae-border-strong` | `oklch(0.215 0.004 106 / 0.22)` | Input borders, stronger separators, and inset hover structure. |

The shadcn semantic aliases in `:root` are the public component vocabulary:

| Utility token | Resolves to |
| --- | --- |
| `--background` / `--color-background` | `var(--ae-bg)` |
| `--foreground` / `--color-foreground` | `var(--ae-fg)` |
| `--container` / `--color-container` | `var(--ae-container)` |
| `--card` / `--color-card` | `var(--ae-surface)` |
| `--card-foreground` / `--color-card-foreground` | `var(--ae-fg)` |
| `--popover` / `--color-popover` | `var(--ae-surface)` |
| `--popover-foreground` / `--color-popover-foreground` | `var(--ae-fg)` |
| `--primary` / `--color-primary` | `var(--ae-primary)` |
| `--primary-foreground` / `--color-primary-foreground` | `var(--ae-primary-fg)` |
| `--secondary` / `--color-secondary` | `var(--ae-surface)` |
| `--secondary-foreground` / `--color-secondary-foreground` | `var(--ae-fg)` |
| `--muted` / `--color-muted` | `var(--ae-surface-sunken)` |
| `--muted-foreground` / `--color-muted-foreground` | `var(--ae-muted-fg)` |
| `--accent` / `--color-accent` | `var(--ae-surface-sunken)` |
| `--accent-foreground` / `--color-accent-foreground` | `var(--ae-fg)` |
| `--destructive` / `--color-destructive` | `var(--ae-danger)` |
| `--destructive-foreground` / `--color-destructive-foreground` | `oklch(0.985 0.002 106)` |
| `--border` / `--color-border` | `var(--ae-border)` |
| `--input` / `--color-input` | `var(--ae-border-strong)` |
| `--ring` / `--color-ring` | `var(--ae-ring)` |

`--primary` is deliberately ink: `--ae-primary: var(--ae-fg)`, while `--ae-primary-fg` is `oklch(0.985 0.002 106)`. Primary buttons are therefore near-black with light labels, not blue. This matches `DESIGN.md` and `.planning/BRAND.md`: use ink for actions and reserve blue for links, information, selection, and focus-related semantic accents.

### Brand blue and status colors

The product accent set is defined once in `:root` and bridged by `@theme inline` in `src/styles/globals.css`:

| Meaning | Token | Current value | Intended use |
| --- | --- | --- | --- |
| Brand/info blue | `--ae-brand` / `--ae-info` | `oklch(0.5553 0.1056 232.01)` / `var(--ae-brand)` | Links, information, selection, and explicit brand affordances. |
| Strong brand blue | `--ae-brand-strong` | `oklch(0.455 0.1056 232.01)` | Stronger link/hover text where contrast requires it. |
| Muted brand blue | `--ae-brand-muted` | `oklch(0.94 0.024 232.01)` | Quiet selection or informational background. |
| On-brand ink | `--ae-on-brand` | `var(--ae-primary-fg)` | Text/icon content on brand blue. |
| Info foreground | `--ae-info-foreground` | `oklch(0.34 0.085 232)` | Readable informational text. |
| Info ring | `--ae-info-ring` | `oklch(0.585 0.105 232 / 0.32)` | Informational border/focus treatment. |
| Info subtle | `--ae-info-subtle` | `var(--ae-brand-muted)` | Informational status background. |
| Success | `--ae-success` | `oklch(0.5423 0.1222 157.98)` | Literal successful/ready state. |
| Success foreground | `--ae-success-foreground` | `oklch(0.32 0.085 150)` | Text on `success-subtle`. |
| Success ring | `--ae-success-ring` | `oklch(0.53 0.12 150 / 0.32)` | Success border/ring. |
| Success subtle | `--ae-success-subtle` | `oklch(0.95 0.025 150)` | Success status background. |
| Warning | `--ae-warning` | `oklch(0.5948 0.1401 58.96)` | Literal warning, pending, or attention state. |
| Warning foreground | `--ae-warning-foreground` | `oklch(0.35 0.08 70)` | Text on `warning-subtle`. |
| Warning ring | `--ae-warning-ring` | `oklch(0.69 0.13 78 / 0.38)` | Warning border/ring. |
| Warning subtle | `--ae-warning-subtle` | `oklch(0.96 0.035 82)` | Warning status background. |
| Danger/destructive | `--ae-danger` / `--destructive` | `oklch(0.5408 0.176 27.61)` | Literal failure, destructive, or invalid state. |
| Danger ring | `--ae-danger-ring` | `oklch(0.53 0.18 28 / 0.32)` | Danger border/ring. |
| Danger subtle | `--ae-danger-subtle` | `oklch(0.95 0.03 28)` | Danger status background. |

The bridge exposes `brand`, `brand-strong`, `brand-muted`, `on-brand`, `success`, `success-ring`, `success-subtle`, `success-foreground`, `warning`, `warning-ring`, `warning-subtle`, `warning-foreground`, `info`, `info-ring`, `info-subtle`, and `info-foreground` as `--color-*` namespaces. Danger is intentionally exposed through the shadcn `destructive` namespace rather than a separate `--color-danger`; use `bg-destructive`, `text-destructive`, and the destructive foreground/ring conventions.

`src/components/ui/badge.tsx` is the concrete status pattern: every badge is `rounded-full`, and its `success`, `warning`, and `info` variants pair the corresponding `*-ring`, `*-subtle`, and `*-foreground` tokens. Status colors are not decorative palette options. Follow the one-accent-plus-status-only rule from `DESIGN.md`: do not use blue as a generic decoration, and do not use green, amber, or red for emphasis that is not literal state.

### Sidebar set

The sidebar tokens are also light-only aliases in `src/styles/globals.css`, then exposed through `--color-sidebar-*` in `@theme inline`:

| Token | Current value |
| --- | --- |
| `--sidebar` | `var(--ae-bg)` |
| `--sidebar-foreground` | `var(--ae-fg)` |
| `--sidebar-primary` | `var(--ae-fg)` |
| `--sidebar-primary-foreground` | `var(--ae-primary-fg)` |
| `--sidebar-accent` | `var(--ae-surface)` |
| `--sidebar-accent-foreground` | `var(--ae-fg)` |
| `--sidebar-border` | `var(--ae-border)` |
| `--sidebar-ring` | `var(--ae-ring)` |

This keeps operator navigation related to the canvas while giving active/sidebar controls the same ink, surface, border, and focus semantics. `src/components/ui/sidebar.tsx` consumes the set rather than inventing a second navigation palette.

## Typography

### Families and weights

The font imports are explicit in `src/styles/globals.css`: `@fontsource-variable/inter`, `@fontsource/dm-mono`, `@fontsource/dm-mono/500.css`, and `@fontsource/geist-pixel`. The `:root` family and weight tokens are:

| Role | Token | Current value |
| --- | --- | --- |
| Normal | `--font-weight-normal` | `400` |
| Medium | `--font-weight-medium` | `500` |
| Semibold | `--font-weight-semibold` | `600` |
| Bold | `--font-weight-bold` | `700` |
| Interface body | `--font-family-body` / `--ae-font-sans` / `--font-sans` | `"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif` |
| Public display | `--font-family-display` / `--ae-font-display` / `--font-display` | `"Geist Pixel", "Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif` |
| Data/code | `--font-family-code` / `--ae-font-mono` / `--font-mono` | `"DM Mono", "SFMono-Regular", Menlo, monospace` |

`DESIGN.md` assigns `font-display` to the public hero and page-level brand statements only, `font-sans` to interface copy, prose, headings, forms, and controls, and `font-mono` to prices, identifiers, code, keyboard hints, and values whose alignment matters. Display type must not enter forms, tables, command surfaces, or operational status. Do not switch typefaces inside one heading, and do not make uppercase tracking the default section-label treatment; a public opening composition may have one marked eyebrow, while operational screens use ordinary labels.

### Heading base

The `@layer base` block in `src/styles/globals.css` applies to `h1` through `h4`:

- `font-family: var(--ae-font-sans)`
- `font-optical-sizing: auto`
- `font-weight: 600`
- `line-height: 1.15`
- `text-wrap: balance`
- `h1`/`h2` letter-spacing: `-0.025em`
- `h3`/`h4` letter-spacing: `-0.015em`

`.font-display` disables synthetic weight with `font-synthesis-weight: none`. `src/styles/base.css` also applies Inter to the document through `font-family: var(--ae-font-sans)` on `html` and makes controls inherit their font. There is no alternate dark-theme type treatment; these families, roles, and weights apply across all three Public, Market, and Operator modes.

## Shape

### Shared geometry

| Geometry | Token/value | Rule |
| --- | --- | --- |
| Card radius | `--radius-card: 0.9375rem` (`15px`) | Use for a real elevated card or self-contained task surface. `src/components/ui/card.tsx` uses `rounded-card`. |
| Public navigation radius | `--radius-nav: 0.875rem` (`14px`) | Reserved for the floating public navigation rail; `src/components/ae/layout/AePublicShell.tsx` uses `rounded-nav`. |
| Shared shadcn/control radius | `--radius: 0.625rem` (`10px`) | Standard control radius selected by the `new-york` component system in `components.json`; ordinary controls use stock `rounded-md`/`rounded-lg` patterns. |
| Status shape | `rounded-full` | Statuses and compact state badges are pills, as implemented by `src/components/ui/badge.tsx`. |
| Market row shape | `rounded-none` | Market tables and rows are square and separated by hairlines/interaction treatment, not card boxes; `src/components/ae/market/AeOperationCard.tsx` uses `rounded-none`. |

`DESIGN.md` permits only the floating public navigation as a persistent rounded shell. Cards are reserved for actual elevation or a self-contained task such as a modal, compare tray, receipt, or execution panel. Do not nest a bordered card inside another bordered card merely to group content; whitespace and a divider come first.

### Notched public geometry

Notches belong to primary public actions and the public footer only. They are implemented with SVG geometry, not a general-purpose radius or `clip-path` token:

- `src/components/ae/website/AeSiteButton.tsx` fixes public action height at `44px`, adds `min-h-touch`, and composes `AeSiteButtonShape` with a hover layer and content layer.
- `src/components/ae/website/AeSiteButtonShape.tsx` is a nine-slice bevel: a 4px left cap with rounded arcs, a flexible `.ae-site-button-middle`, and a 15px right cap whose path tapers into the lower edge. Filled and outlined variants use separate SVG fill/stroke paths.
- `src/styles/base.css` owns the cross-surface geometry variables for `[data-ae-site-button]`: foreground fill, transparent/foreground stroke, color-mix hover fill, 44px height, 1.25rem horizontal padding, mono 12px/500 label, and the active `scale: 0.96` interaction. `.ae-site-button-middle` supplies the center fill and border; `.ae-site-button-hover` reveals the hover shape by translating its child.
- `src/components/ae/website/AeNotchedCard.tsx` supplies the footer's 20px dipped cap using left/right SVG slopes and `bg-container` flat spans. `src/components/ae/website/AeSiteFooter.tsx` composes that shape over the footer surface.

No feature should generalize this notch into cards, operator controls, or market rows. Standard controls remain on the shared shadcn radius; public geometry is a mode-specific identity primitive.

## Space & layout tokens

### Scalar layout tokens

The values below are declared in `:root` in `src/styles/globals.css` and bridged to Tailwind through `@theme inline`:

| Token | Current value | Tailwind name/role |
| --- | --- | --- |
| `--ae-nav` | `1160px` | `max-w-nav`; maximum public navigation rail. |
| `--ae-rail` | `1080px` | `max-w-rail`; comfortable content rail. |
| `--ae-gutter` | `16px` | `gutter`; default page/rail inset. |
| `--ae-gutter-lg` | `26px` | `gutter-lg`; medium-and-up rail inset. |
| `--ae-space-intra` | `8px` | `intra`; spacing inside a related cluster. |
| `--ae-space-related` | `16px` | `related`; spacing between directly related items. |
| `--ae-space-section` | `32px` | `section`; section-level separation. |
| `--ae-space-page` | `48px` | `page`; page-level breathing room. |
| `--ae-space-hero` | `72px` | `hero`; public hero composition spacing. |
| `--ae-space-band` | `96px` | `band`; large public band separation. |
| `--ae-touch` | `44px` | `touch`; minimum interactive target. |
| `--ae-nav-stack` | `56px` | `nav-stack`; measured sticky public header stack. |
| `--ae-fold-peek` | `48px` | `fold-peek`; amount of the next hero band left visible. |
| `--ae-anchor` | `calc(var(--ae-nav-stack) + 16px)` | `anchor`; scroll offset below the sticky header. |
| `--ae-fold` | `calc(100svh - var(--ae-nav-stack))` | `min-h-fold`; remaining viewport after public navigation. |
| `--ae-chapter` | `calc(100svh - var(--ae-nav-stack))` | `min-h-chapter`; below-fold chapter viewport height. |

The ladder is intentionally small: `8 → 16 → 32 → 48 → 72 → 96`. Use the named token that expresses the relationship instead of introducing a new one-off gap. The 44px target is also concrete in `[data-ae-site-button]`, `AeSiteButton`, mobile navigation, and other `min-h-touch` controls.

### Utilities and fold behavior

`@utility ae-nav` in `src/styles/globals.css` sets `width: 100%`, `max-width: var(--ae-nav)`, and centered inline margins. `@utility ae-rail` sets the same width/max-width behavior with `padding-inline: var(--ae-gutter)`, switching to `var(--ae-gutter-lg)` at the `md` variant. These are the only named width rails: do not create a local content max-width for a normal page.

The fold utilities encode responsive intent, not just a height:

- `min-h-fold` applies `min-height: var(--ae-fold)`.
- `min-h-fold-hero` is `auto` on small screens and becomes `calc(var(--ae-fold) - var(--ae-fold-peek))` at `md`, leaving the next band visible.
- `min-h-chapter` is `auto` on small screens and becomes `var(--ae-chapter)` at `md`.

`src/styles/base.css` gives `html` smooth scrolling and `scroll-padding-top: var(--ae-anchor, 72px)`; reduced motion changes scroll behavior to `auto`. The document body is `min-height: 100dvh`. These semantics keep the public fold useful without relying on giant whitespace, and they keep anchor targets below the sticky nav.

## Elevation

### Shadow ladder and overlays

All elevation values are owned by `:root` in `src/styles/globals.css`. `@theme inline` exposes `shadow-soft`, `shadow-float`, `shadow-overlay`, and `shadow-market-row-hover` for the primary utility paths.

| Role | Token | Current value |
| --- | --- | --- |
| Low | `--shadow-low` / `--shadow-soft` | `0 1px 2px oklch(0 0 0 / 0.08)` |
| Medium/floating | `--shadow-med` / `--shadow-float` | `0 1px 2px -1px oklch(0 0 0 / 0.04), 0 4px 6px -1px oklch(0 0 0 / 0.06)` |
| High | `--shadow-high` | `0 1px 2px -1px oklch(0 0 0 / 0.04), 0 4px 6px -1px oklch(0 0 0 / 0.06), 0 8px 16px oklch(0 0 0 / 0.04)` |
| Overlay | `--ae-shadow-overlay` / `--shadow-overlay` | `0 0 0 1px oklch(0.215 0.004 106 / 0.08), 0 2px 4px -2px oklch(0 0 0 / 0.1), 0 16px 40px -12px oklch(0 0 0 / 0.22)` |
| Hover inset | `--shadow-inset-hover` | `inset 0 0 0 1px var(--ae-border-strong)` |
| Selected inset | `--shadow-inset-selected` | `inset 0 0 0 2px var(--ae-brand)` |
| Market-row inset | `--shadow-inset-market-row` / `--shadow-market-row-hover` | `inset 0 0 0 1px var(--ae-brand)` |
| Scrim | `--ae-overlay-scrim` | `oklch(0.215 0.004 106 / 0.16)` |

The rule from `DESIGN.md` is “whitespace first, a hairline for structure second, elevation only when an object must sit above its surroundings.” `src/components/ui/card.tsx` uses `rounded-card bg-card shadow-soft`; `src/components/ui/dialog.tsx` and `src/components/ui/sheet.tsx` use the overlay scrim and `shadow-overlay`; and `src/components/ae/layout/AePublicShell.tsx` starts the floating nav at `shadow-none` and applies `shadow-float` only when its `data-elevated` state is present. `src/components/ae/market/AeOperationCard.tsx` uses the market-row inset on hover rather than lifting each row into a card.

Do not add a local shadow for visual polish, use elevation to compensate for weak grouping, or stack a shadowed/bordered card inside another one. A shadow is justified for a raised card, floating/sticky nav when it has separated from the canvas, modal/sheet/compare/receipt/execution surfaces, or a clear selected/hovered row state.

## Motion

### Timing and easing

The canonical values in `src/styles/globals.css` are:

| Token | Current value | Intended scale |
| --- | --- | --- |
| `--motion-duration-fast` / `--duration-fast` | `100ms` | Small color, opacity, scale, or icon response. |
| `--motion-duration-base` / `--duration-base` | `160ms` | Normal control/state transition. |
| `--motion-duration-slow` / `--duration-slow` | `220ms` | Route, overlay, or larger surface transition. |
| `--motion-ease-standard` / `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Routine state change. |
| `--motion-ease-emphasized` / `--ease-emphasized` | `cubic-bezier(0.16, 1, 0.3, 1)` | Enter/exit or emphasized surface movement. |
| `--ae-duration-fast` | `var(--motion-duration-fast)` | Product alias for fast feedback. |
| `--ae-duration-state` | `var(--motion-duration-base)` | Product alias for state changes. |
| `--ae-duration-route` | `var(--motion-duration-slow)` | Product alias for route transitions. |
| `--ae-ease-out` | `var(--motion-ease-emphasized)` | Product alias for emphasized movement. |
| `--ae-ease-state` | `var(--motion-ease-standard)` | Product alias for routine state movement. |

The explicit `@utility` definitions for `duration-fast`, `duration-base`, `duration-slow`, `ease-standard`, and `ease-emphasized` set transition duration/timing from these variables. Use these utility names for new interaction work. Current implementations demonstrate the intended use in `src/components/ae/market/AeOperationCard.tsx`, `src/components/ae/data/AeCopyCommand.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/sheet.tsx`, and `src/components/ae/command-panel/AeCommandPanel.tsx`.

`DESIGN.md` permits motion that acknowledges interaction or explains state change. Routine pages render at full opacity. There is no decorative page-load, shimmer, orbit, ticker, tilt, shake, perpetual animation, or number-roll theater. A current implementation detail to preserve or converge over time: some older/stock paths still contain literal `duration-200`, `duration-300`, `ease-out`, or `ease-linear` classes, for example the route progress bar and public site links. New code should use the canonical token utilities rather than expanding that literal set.

### Reduced motion

`src/styles/base.css` has two `@media (prefers-reduced-motion: reduce)` blocks. They set document scrolling to `auto`, remove the public button hover translation, and clamp all animations/transitions to `0.01ms` with one animation iteration. Public buttons and motion-heavy Radix surfaces also include explicit `motion-reduce:transition-none`, `motion-reduce:duration-0`, or `motion-reduce:animate-none` classes. Every new transform, opacity, route, overlay, or state animation must retain an equivalent reduced-motion path.

## Focus & interaction

`--ae-focus-ring` in `src/styles/globals.css` is the named double-ring recipe:

```css
0 0 0 2px var(--ae-bg), 0 0 0 4px var(--ae-fg)
```

The general `--ring`/`--color-ring` alias resolves to `var(--ae-ring)`, and `--ae-ring` resolves to near-black `var(--ae-fg)`. `[data-ae-site-button]:focus-visible` in `src/styles/base.css` applies the equivalent two-layer treatment with `var(--background)` and `var(--ring)`, while the base layer gives all elements `@apply border-border outline-ring/50`. Existing controls use semantic ring utilities such as `focus-visible:ring-2 focus-visible:ring-ring`, `focus-visible:ring-[3px] focus-visible:ring-ring/50`, and `focus-visible:outline-ring`; examples include `src/components/ae/layout/AeOwnerMobileNavigation.tsx`, `src/components/ui/badge.tsx`, and `src/components/ui/dialog.tsx`.

The authority still reserves blue for link, selection, focus, and information semantics. In the current implementation the default global ring recipe is ink for a high-contrast double ring, while brand/info blue is available through `--ae-brand`, `--ae-info-ring`, and selected inset tokens. Treat those as semantic variants, not a reason to paint every focus state blue. `::selection` in `src/styles/globals.css` uses `background: var(--ae-brand-muted)` and `color: var(--ae-fg)`, which is the canonical selection treatment.

Interaction rules are compact and stateful:

- Use `:focus-visible` and the semantic ring/outline tokens; never remove focus without supplying an equivalent visible state.
- Preserve the 44px `touch` minimum for public actions, mobile navigation, and compact controls.
- Use ink for primary actions, brand blue for links/information/selection-specific states, and status colors only for literal success, warning, danger, or info states.
- Keep hover, active, disabled, loading, empty, error, and recovery states explicit at the component level. Use the shared transition and easing tokens only when the state change benefits from motion.
- Keep one next valid action in a normal page state; do not add duplicate calls to action merely to increase visual weight.

## Rules for extending tokens

1. **Extend the source of truth, not a feature.** Add a genuinely reusable semantic primitive to the appropriate section of `:root` in `src/styles/globals.css`, then expose it through `@theme inline` when Tailwind utilities need it. Do not put a palette, type scale, radius, shadow, or timing value in a feature component.
2. **Use `src/styles/base.css` only for cross-surface primitives.** Reset behavior, document behavior, public site-button geometry, and global reduced-motion behavior belong there. A feature-specific selector does not.
3. **Prefer the existing ladder and roles.** Start with `bg-background`, `bg-muted`, `bg-card`, `bg-container`, `text-foreground`, `text-muted-foreground`, `border-border`, the brand/status namespaces, `rounded-card`, `rounded-nav`, `gutter`/`related`/`section`, `shadow-soft`/`shadow-overlay`, and `duration-*`/`ease-*` before proposing anything new.
4. **Keep the color contract strict.** One accent plus literal status colors. Primary remains ink. No gradients, teal wash, glass treatment, ornamental serif, or new accent family. There is no dark mode to extend.
5. **Keep geometry mode-specific.** Notches remain on public primary actions/footer. Persistent rounded shells are limited to floating public navigation. Market rows remain square. A new visual primitive requires a second real use, per the hard constraints in `DESIGN.md`.
6. **Keep elevation meaningful.** Use whitespace first, hairline second, and the existing shadow ladder only when an object needs to sit above its surroundings. Never solve grouping by nesting bordered cards.
7. **Keep typography role-pure.** Inter is the interface default, Geist Pixel is public display only, and DM Mono is for aligned machine/data values. Do not create a local heading scale or switch faces inside one heading.
8. **Keep motion purposeful and accessible.** Use 100/160/220ms and the two canonical eases. Add a reduced-motion override for every new transition or animation; do not create decorative perpetual motion.
9. **Update the bridge and consumers together.** If a new token is approved, update `@theme inline`, migrate every relevant caller, and remove the obsolete local value. Keep `components.json` pointed at `src/styles/globals.css` with CSS variables enabled; do not reintroduce a Tailwind config for token ownership.

<!-- refreshed: 2026-09-01 -->

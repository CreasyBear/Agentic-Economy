# Token Spine

AE uses the Astryx Era token spine defined in `DESIGN.md`: `@astryxdesign/core`, `@astryxdesign/theme-neutral`, and the Astryx Tailwind bridge. This document records how UI Craft should reason about tokens without creating a second system.

# Current Layers

## Layer 1: Primitive

Primitive values are owned by Astryx theme-neutral and its token bridge. Active specs should not name raw color, font, radius, shadow, or motion primitives. If a primitive gap is real, resolve it through Astryx configuration or a swizzled Astryx component under `src/components/astryx/`, not through route-local styling.

## Layer 2: Semantic

Use semantic bridge classes and tokens surfaced by the Astryx/Tailwind integration:

- Text: `text-primary`, `text-secondary`, and component-provided label/body styles.
- Surfaces: `bg-body`, `bg-surface`, `bg-card`, and Astryx component containers.
- Structure: `border-border`, `rounded-md`, `shadow-sm`, focus styles from Astryx components.
- Status: Astryx `Badge`, `StatusDot`, `Banner`, `Toast`, `EmptyState`, `Skeleton`, and `Spinner` semantics.

Existing `--ae-*` and `--ae-public-*` values are compatibility bridge values only. They may remain while live code imports them, but new specs should not expand them or treat them as visual authority.

## Layer 3: Component

Component-level presentation belongs to Astryx primitives and templates:

- Public shell: `AppShell` + `TopNav`.
- Chat/answer: Astryx `ChatMessageList`, `ChatComposer`, `ChatToolCalls`, `Citation`, `CitationSourceList`, and streaming helpers.
- Provider/detail pages: `detail-page`, `product-gallery`, cards, badges, citations, and form templates.
- Owner/admin: `AppShell` + `SideNav`, `Table`, `Toolbar`, `Badge`, `StatusDot`, settings/detail templates.
- Forms: `FormLayout`, `Field`, and Astryx form controls.

AE-owned names describe behavior, data, routing, or domain contracts; they should not be used as evidence for a separate presentation system.

# Seven Category Map

| UI Craft category | Astryx Era source | Rule |
| --- | --- | --- |
| Color | theme-neutral + Astryx Tailwind bridge | Use semantic surface/text/border/status roles; no raw literals in specs or new CSS. |
| Spacing | Tailwind 4 utilities | Layout glue only; do not restyle component internals with utilities. |
| Type | theme-neutral type scale | No font packages, no route-local `font-family`, no typeface-specific surface rules. |
| Radii | Astryx component defaults + bridge classes | Use component defaults first; vary only through documented Astryx variants or templates. |
| Shadows/elevation | Astryx component elevation + `shadow-sm` bridge | No decorative glow, glass, or route-local shadow systems. |
| Motion | Astryx component behavior + UI Craft motion constraints | 80–400ms, GPU-only, no scroll-jacking, always honor `prefers-reduced-motion`. |
| Z-index/layers | Astryx `LayerProvider` and overlay primitives | Dialogs, toasts, popovers, and menus use Astryx overlay/layer primitives. |

# Public Surface Token Rules

- Public routes use Astryx shell, navigation, card, citation, and form primitives before any custom styling.
- Tailwind utilities may set layout, spacing, responsive behavior, sticky positioning, and width constraints.
- Provider artifacts use honest metadata, citation links, and product evidence; they are not dense status dashboards.
- Primary actions use the Astryx primary action treatment. Secondary paths stay visually secondary.
- Raw hex/OKLCH literals, arbitrary Tailwind colors, one-off shadows, font declarations, and route-local component namespaces are off-spine values.
- Dark command panels are retired from public surfaces. Boundaries are communicated through plain copy and Astryx feedback/status primitives.

# Exact Next Implementation Guidance

1. Prefer `npx astryx component <Name>` and `npx astryx template --list` before inventing component tokens.
2. If a component gap is real, compose Astryx primitives first; swizzle into `src/components/astryx/` only when composition cannot satisfy the contract.
3. Keep Tailwind 4 as layout glue. Do not use utilities to create a parallel visual language.
4. Shrink compatibility tokens and compatibility styling as routes migrate; do not add new `--ae-*` or `--ae-public-*` names in active design specs.
5. Run the UI Craft finish bar against public-surface changes; token consistency means the result traces to `DESIGN.md`, not to retired route-local styling.

# Token Spine

AE uses a three-layer SmoothUI/UI Craft token spine: primitive, semantic, and component. Existing values live in `src/styles/tokens.css`; this document records how they map to the UI Craft seven categories and where future implementation must extend rather than replace.

# Current Layers

## Layer 1: Primitive

AE does not yet expose full primitive ramps such as `--gray-50`, `--accent-500`, `--space-md`, or `--text-base`. The raw values inside `--ae-*` and `--ae-public-*` currently act as the source values, but most are already named by role, so they should be treated as semantic tokens until true primitives are added.

Next guidance: add primitive ramps only as a compatibility layer under the existing system. Do not rename or remove active `--ae-*` tokens in a landing-page change without a migration plan.

## Layer 2: Semantic

Core AE semantics:

- Surfaces: `--ae-bg`, `--ae-surface`, `--ae-surface-raised`
- Text: `--ae-fg`, `--ae-muted-fg`, `--ae-primary-fg`
- Borders and focus: `--ae-border`, `--ae-ring`, `--ae-focus-ring`
- Accent and status: `--ae-primary` (signage amber), `--ae-primary-strong`, `--ae-success`, `--ae-warning`, `--ae-danger`
- Library bridge: `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, and `--radius`

Public landing semantics:

- Public surfaces: `--ae-public-field`, `--ae-public-surface`, `--ae-public-raised`
- Public text: `--ae-public-ink`, `--ae-public-muted`
- Public accent: `--ae-public-amber`, `--ae-public-amber-deep`, `--ae-public-amber-fg`
- Public structure: `--ae-public-line`, `--ae-public-border-soft`

The public surface is daylight paper. If dark public mode is introduced later, remap `--ae-public-*` semantics explicitly; do not invert light values.

## Layer 3: Component

Existing component-level values are present but partial:

- Public radius: `--ae-public-radius-sm`, `--ae-public-radius-md`, `--ae-public-radius-lg`, `--ae-public-radius-xl`, `--ae-public-radius-pill`
- Public elevation: `--ae-public-card-shadow`, `--ae-public-card-shadow-hover`, `--ae-public-search-shadow`, `--ae-public-focus-ring`
- Core elevation: `--ae-shadow-raised`, `--ae-shadow-border`, `--ae-shadow-border-hover`
- Component usage in code: shared `Button`, `Input`, `Textarea`, `NativeSelect`, `Alert`, `Card`, `Empty`, `AePublicShell`, and `src/components/ae/landing/*` consume these semantics

Next guidance: create component tokens only when a reusable component has variants or multiple states. Priority component tokens are `routing-object`, `paper-cutout`, `source-card`, `listing-card`, `search-bar`, `button-primary`, `input`, and `status-readback`.

# Seven Category Map

| UI Craft category | Existing AE tokens | Layer now | Gap |
| --- | --- | --- | --- |
| Color | `--ae-bg`, `--ae-fg`, `--ae-surface`, `--ae-primary`, `--ae-success`, `--ae-warning`, `--ae-danger`, `--ae-public-*` color tokens | Mostly semantic | Add primitive neutral/accent/status ramps; add named state bg/text/border triads instead of repeating `color-mix(...)` in CSS. |
| Spacing | Tailwind spacing utilities and DESIGN.md scale (`4px` to `96px`) | Primitive by utility, not CSS token | Add `--ae-space-*` only when non-utility CSS needs shared spacing; keep 8pt rhythm and section gaps from UI Craft. |
| Type | `--ae-font-sans`, `--ae-font-mono`; DESIGN.md display/headline/title/body/label/mono roles | Semantic font roles, partial scale | Add `--ae-text-*`, `--ae-leading-*`, `--ae-font-weight-*`, and semantic `--ae-font-body`, `--ae-font-display`, `--ae-font-mono` aliases if component CSS needs them. |
| Radii | `--ae-radius-sm`, `--ae-radius-md`, `--ae-radius-lg`, `--ae-radius-pill`, `--ae-public-radius-*`, `--radius` | Primitive plus component alias | Keep compact product surfaces at `--ae-radius-sm`; reserve larger radii for cards and panels. Avoid uniform radius across all elements. |
| Shadows | `--ae-shadow-raised`, `--ae-shadow-border`, `--ae-shadow-border-hover`, `--ae-focus-ring`, `--ae-public-card-shadow`, `--ae-public-card-shadow-hover`, `--ae-public-search-shadow` | Semantic and component | Add dark-mode elevation replacements for any new surfaces. Do not add single-layer decorative glows. |
| Motion | `--ae-ease-out`, `--ae-ease-state`, `--ae-duration-fast`, `--ae-duration-state`, `--ae-duration-route`, `--ae-public-ease` | Primitive-ish duration/ease | Add semantic motion tokens when repeated: `--ae-motion-hover`, `--ae-motion-panel-in`, `--ae-motion-route`. Always honor `prefers-reduced-motion`. |
| Z-index | Tailwind values such as `z-30` in shells | Off-spine | Add `--ae-z-header`, `--ae-z-dropdown`, `--ae-z-modal`, `--ae-z-toast`, and `--ae-z-tooltip` before adding more layered overlays. |

# Public Landing Token Rules

- Public route CSS must use `ae-public-*` classes plus root AE tokens. Do not add a new route-local namespace.
- Public routing objects use public semantic surfaces, amber action moments, paper cut-outs, image-first evidence, and honest metadata. They are not dense status dashboards.
- Signage amber remains the primary action accent. Eucalyptus is limited to available/checked/success states and must never replace the primary CTA color.
- Raw hex, arbitrary Tailwind colors, and one-off shadows are off-spine values unless they are immediately promoted into tokens.
- Dark command panels are retired from public surfaces. Boundaries are communicated through warm text and badges, not dark authority blocks.

# Exact Next Implementation Guidance

1. Extend `src/styles/tokens.css` with primitive ramps only after an implementation needs cross-surface reuse.
2. Add semantic state triads for status UI: `--ae-status-*-bg`, `--ae-status-*-text`, and `--ae-status-*-border`.
3. Add `--ae-space-*`, `--ae-text-*`, and `--ae-z-*` before introducing any new raw values in shared CSS.
4. Promote repeated listing-card values into component tokens such as `--ae-listing-card-bg`, `--ae-listing-card-border`, `--ae-listing-card-radius`, and `--ae-listing-card-shadow`.
5. Keep shadcn bridge tokens as aliases to AE semantics. Do not create a parallel design system.
6. Run the UI Craft finish bar against any public-surface change; Passes 3, 4, 7, and 9 are the token consistency gates.

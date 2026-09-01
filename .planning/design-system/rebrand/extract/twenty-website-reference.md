# Twenty Website Design System — Authoritative Reference

**Extracted:** 2026-09-01 from `/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/donor-repos/twenty/packages/twenty-website/src` (commit 4fc35523). This is the WEBSITE system (not the CRM app — the CRM is deliberately out of scope; the site is the distinctive design).

## Design read (what makes it feel familiar + intentional)

Monochrome canvas (white/neutral fields), near-black ink where it matters, ONE violet-blue accent (`#4a38f5`) used sparingly (focus, links, selection). Type is stepped and generous — display serif/ally and grotesque sans; the website runs **Host Grotesk** (sans variable), **Aleo** (serif, weight 300), **Azeret Mono** (mono variable), plus **VT323** (retro, sparse). Buttons are **uppercase mono 12px** pills/rectangles in solid ink with a sliding hover wash. Radii are TINY (`2px` base) — near-square, crisp. Hierarchy runs on contrast + whitespace, not on shadow or gradient. Shadows are barely-there (`0 12px 32px -16px rgba(0,0,0,.18)` card). No gradient glows except one hero radial. Data-heavy surfaces (like a catalog) would use mono figures + hairlines.

## Tokens (exact, as authored)

### Palette (`tokens/palette.ts`)
| Token | Value |
|---|---|
| white | `#ffffff` |
| black | `#1c1c1c` |
| black-hover | `#333333` |
| white-hover | `#e8e8e8` |
| graphite | `#424242` |
| silver | `#dbdbdb` |
| neutral | `#f4f4f4` |
| blue | `#4a38f5` |
| pink | `#ed87fc` |
| green | `#89fc9a` |
| yellow | `#feffb7` |
| error | `#ff9a9a` (validation red on dark surfaces) |
| ash / fog / charcoal / stone / iron / chalk | artwork grays (halftone dashes) |

### Alpha scale (`tokens/alpha-scale.ts`)
`black`, `blue`, `white` each can take alpha steps: 80→`cc`, 70→`b3`, 60→`99`, 40→`66`, 20→`33`, 10→`1a`, 5→`0d`.
(CSS var names like `--color-black-10`, `--color-black-60`, `--color-blue-70`.) Note: **70 exists for WCAG AA muted ink** — 60 misses 4.5:1 on light surfaces.

### Schemes (`tokens/scheme.ts`) — semantic, scheme-driven via `[data-scheme]`
- **light:** surface `white`, ink `black`, inkMuted `black-60`, inkSubtle `black-40`, line `black-10`, lineStrong `black-20`, divider `black-40`
- **muted:** surface `neutral`, ink `black`, inkMuted `black-60`, inkSubtle `black-40`, line `black-10`, lineStrong `black-20`, divider `black-40`
- **dark:** surface `black`, ink `white`, inkMuted `white-60`, inkSubtle `white-40`, line `white-10`, lineStrong `white-20`, divider `white-40`

### Units (`tokens/units.ts`)
- spacing base: **4px** (`spacing(n) = calc(4px * n)`)
- font base: **0.25rem** (4px) — `fontSize(3)` = 12px, `fontSize(4.5)` = 18px
- radius base: **2px** — `radius(1)` = 2px, `radius(4)` = 8px (`--radius-base → 2px`)

### Fonts (`tokens/font-family.ts` + `fonts/`)
- sans: `var(--font-sans)` → **Host Grotesk** (variable latin woff2)
- serif: `var(--font-serif)` → **Aleo** (weight 300 only)
- mono: `var(--font-mono)` → **Azeret Mono** (variable)
- retro: `var(--font-retro)` → **VT323** (weight 400)
- Inter is isolated to the app-preview (product-in-browser mock), NOT the site.
- Weights: light 300, regular 400, medium 500 (`tokens/font-weight.ts`).

### Type scale (`tokens/type-scale.ts`) — stepped (not viewport-fluid), fluid only via clamp between 390px and md
Values are `fontBase × multiplier` (0.25rem each), `lineHeight: null` ⇒ unitless 1.55 (running text).
| Ramp | base (px) | md (px) | line-height |
|---|---|---|---|
| display | 80 | 120 | 92/132 |
| headingXl | 60 | 80 | 66/86 |
| headingLg | 40 | 60 | 46/66 |
| headingMd | 40 | 48 | 46/56 |
| headingSm | 32 | 32 | 40 |
| headingXs | 18 | 22 | 24/28 |
| eyebrow | 18 | 18 | 24 (flat, never scales) |
| bodyMd | 16 | 18 | 1.55 |
| bodySm | 16 | 16 | 1.55 |
| bodyXs | 12 | 12 | 1.55 |
Heading line-heights are TIGHT (≈1.075–1.1× size). Body keeps 1.55. Both interpolate fluidly between base and md viewports.

### Layout + rhythm (`tokens/rhythm.ts`, `max-content-width.ts`, `breakpoints.ts`)
- Max content width: **1512px** (`MAX_CONTENT_WIDTH_PX`)
- Breakpoints: sm 768, md 921, lg 1281
- Rhythm classes (padding-block, ×4px): section `12→16` (48/64px), hero `7.5→12` (30/48px), flush `0`, spacious `30` (120px). Adjacent same-scheme sections collapse top rhythm to `spacing(1.5)` = 6px.
- SectionShell: background layer clipped at max-width, `z-0`; content layer `z-1`; `data-scheme` restyles surface/ink/lines; `connectUp` lets sections overlap.

### Elevation (`tokens/shadow.ts`)
- header: `0 1px 3px 0 rgba(0,0,0,0.06)`
- popup: `0 12px 32px rgba(0,0,0,0.08)`
- popupDark: `0 12px 32px rgba(0,0,0,0.4)`
- card: `0 12px 32px -16px rgba(0,0,0,0.18)` (tight focused lift)

### Motion (`tokens/easing.ts`, `tokens/duration.ts`)
- Easing: standard `cubic-bezier(0.22,1,0.36,1)` (slides/transforms); smooth `(0.4,0,0.2,1)` (expand/collapse); gentle `(0.16,1,0.3,1)` (colors/opacity); spring `(0.2,0.8,0.2,1)` (playful scale)
- Durations: 150/200/220/300/400/600ms (xxs..xl). Button slide = 260ms standard.
- Reduced motion: `REDUCED_MOTION` media query kills transitions.

### Gradient (`tokens/gradient.ts`)
- heroGlow: `radial-gradient(ellipse 80% 60% at 50% 40%, rgba(245,243,240,0.6) 0%, transparent 70%)` — the ONE background glow.

## Component grammar (from `src/ui/`)

### Button (`ui/Button.tsx`)
- Shape: mono font, `font-size: 12px` (3), weight medium, **uppercase**, `letter-spacing: 0`, height **40px regular / 32px small**, padding `0 20px` (regular) / `0 16px` (small), `radius(1)` = 2px.
- Variants: `filled` → solid ink (`--button-fill: black`, label white); `outlined` → 1px ink stroke, transparent fill, hover = 5% ink wash (`black-5`).
- Dark scheme: filled → white bg, black label; outlined → white stroke/label.
- **Signature hover:** a sliding layer (`span` inside) transitions `translateX(-100% - 16px)` → `0` at `260ms standard` — the fill sweeps in from the left. `[data-slot='hover-layer']`.
- Focus-visible: `outline: 1px solid blue; outline-offset: 1px` — the accent.
- Disabled: `opacity: .5; cursor: not-allowed`.

### SectionShell / Container
Scheme context via `[data-scheme]` on the shell; components consume `semanticColor.*` (surface/ink/inkMuted/line...) so nothing scheme-specific appears at call sites. Same-scheme adjacency collides top padding to 6px. Backgrounds can `data-full-bleed`.

## How this maps to Agentic Economy (adaptation doctrine)

1. **Canvas ladder:** white surface on a `neutral` (#f4f4f4) field for public; dark scheme available for market/operator density. Lines at black-10/20, units 4px, radius 2px.
2. **Type:** Host Grotesk (interface + headings), Azeret Mono (Operation refs, prices, calls, latency — ALL aligned data), Aleo 300 (display headlines only, public). Stepped scale; eyebrow = 18px uppercase mono if used, never decorative.
3. **Buttons:** uppercase mono 12px, filled ink primary; outlined secondary; blue focus outline. Slide-hover wash.
4. **Accent:** ONE blue `#4a38f5` — links, selection, focus. Status (ready/pending) gets its own small semantic chips, text+color, never blue.
5. **Data surfaces:** tables with hairline dividers (black-10), mono-aligned figures, tight rows; elevation only for floating/modal; hero glow only on landing.
6. **Iconography/marks:** VT323/retro and halftone artwork sparingly, public only (the site's signature marks).
7. **Do NOT take from CRM:** the CRM's blue-heavy rounded cards, big soft shadows, and dense filled UI are the "lacklustre" part — excluded.

*Prepared by coordinator from direct token-file reads; all values verified against donor files.*
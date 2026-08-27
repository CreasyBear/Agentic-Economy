# AECON design system

**AECON is Agentic Economy.** Same product, same name. AECON is the spoken and written short form; Agentic Economy is the expanded form. Do not treat them as two brands, two wordmarks, or a holding-company lockup.

The product is an Operation market: agents search, compare, inspect, and buy bounded outside tools.

This file is the implementable system. Dual surface: **light product** is default; **dark field** is brand lockups, headers, and night marketing only.

## Product (do not drift)

- Consuming customer is an agent. Humans use a thin public site (Ask / Discover / Connections / Activity) and an authenticated operator workspace.
- Operator settings is a workspace platform (User / Workspace / Developers), not a second product.
- No Frosted UI / twenty-ui. No fake catalog counts, waitlists, YC, or fee claims.
- Primary actions stay **ink fills**, never green or gold buttons.

## Dual surface

| Surface | Where | Field | Type | Accent |
| --- | --- | --- | --- | --- |
| **Light** | Public site, operator, chat | Cream paper | Near-black ink | Forest green (links, info, focus) |
| **Dark** | AECON lockups, wide headers, brand film | Green-black field | Cream | Gold node in the mark only |

Do not invert the product chrome to dark. Do not paint operator toolbars gold.

## Color

Sampled from the AECON mark, wordmark, and wide header.

| Role | Hex | Notes |
| --- | --- | --- |
| Field | `#101914` | Green-black charcoal. Dark surface only. |
| Field mid | `#141D18` | Raised dark panels on field. |
| Paper / cream | `#F8F6F0` | Mark loops and wordmark. Aligns with product canvas `#f4f4f1` / `oklch(0.9663 0.004 106.47)`. |
| Ink | `#141D18` | Body on paper. Prefer this over pure black. |
| Mute | `#4D534D` | Secondary text. |
| Line | `#141D18` at 12% | Hairlines on paper. |
| **Accent green** | `#2E5C42` | Links, info, focus rings, selected ticks. Replaces blue. |
| Accent hover | `#1E4730` | |
| Accent well | `#E8EEE9` | Soft sage on paper. Never a page fill. |
| **Gold node** | `#C89D4D` | The square in the mark. Not a UI fill, not a link color, not a chart series. |
| Gold deep | `#876B2F` | Anti-alias of the node. Do not use as a fill. |
| Danger | `oklch(0.5408 0.176 27.61)` | Destructive only. |

**Rules**

- Green is the only chromatic accent on light UI.
- Gold lives inside the mark. If a layout needs a single point of chroma besides green, it is that square — not a gold button.
- Blue (`oklch(0.5553 0.1056 232.01)`) is retired as brand/info.

## Logo

Three source files in `public/brand/aecon/`:

1. **Mark** — three cream loops converging on the gold square, on field. Use at 32px+ in chrome. Never replace with initials, emoji, or a generic icon.
2. **Wordmark** — mark + tracked `AECON` in cream on field.
3. **Header** — wordmark left, topographic field, second gold node where lines converge. Marketing / cover only.

**On light paper:** use a field-backed mark in a square (do not invert the loops to green or gold). Wordmark in ink is allowed only as typeset `AECON` next to the field-backed mark — do not recolor the raster loops.

**Clear space:** one loop-height on all sides. Do not add slogans into the lockup. Do not stretch. Do not rotate. Do not swap the gold square for another color.

**Name:** AECON = Agentic Economy. Chrome may show AECON. Sentences may say Agentic Economy. Never “AECON by Agentic Economy,” never a second logo for the long name.

## Type

- Root 14px.
- Body / UI: Inter Variable.
- Mono: DM Mono.
- Public display: Geist Pixel.
- Brand wordmark in raster lockups is the supplied AECON drawing — do not fake it in Inter.
- Tracked uppercase labels: `0.12em`, `text-xs`, mute or ink — never gold.

Operator titles: `text-base font-semibold tracking-tight`. Descriptions: `text-sm` mute.

## Space

Gutter 16px, intra 8px, related 16px, section 32px, page 48px, touch 44px.

Radius: 0.625rem default, 0.9375rem cards.

## Motion

100 / 160 / 220ms, `cubic-bezier(0.2, 0, 0, 1)`. No glass blur, no aurora, no portal heroes.

## Operator frame (one workspace)

The live app nests `AeOperatorShell` twice: `_operator` layout ("Workspace / Loading…") then each page wraps another shell. That is the "page in a page": skip link + sidebar + 44px top bar + record header (icon box + title + description) + settings groups + another section heading.

Stitch to **one frame**:

1. One sidebar, one inset, one scroll. Never a second sidebar, second top bar, or a card that looks like another app.
2. Top bar: sidebar trigger + breadcrumbs + command. No extra toolbar.
3. One title row per route. Drop the 32px nav-icon box. Do not repeat the current tab as a second H1/H2.
4. Settings tabs (User / Workspace / Developers) live in that title band. They are not a nested product.
5. Credit is one surface whether opened from Records or from Settings — same chrome, Credit tab current, sidebar Credit current.
6. Record lists (Operations, Calls) use the same frame: title + optional ink action, then the table/empty state in the well. No inner page chrome.

## Public vs operator

**Public (light):** cream canvas, white cards, Geist Pixel headings, notched uppercase buttons in ink. Green for text links and info only.

**Operator (light):** inset sidebar on cream, white main well, 14px Inter, ink primary buttons, green only on links/focus. Settings: grouped underline tabs, current tab 2px ink underline.

**Brand field (dark):** `#101914`, cream type, topographic hairlines at low opacity, gold nodes from the mark. Not an operator theme.

## Do not

- Green or gold primary buttons.
- Gold as a second brand color in tables, charts, or badges.
- Glassmorphism, neural-net ornaments, or Playfair/luxury serif.
- Recoloring the mark loops to accent green.
- Putting the wide header behind dense operator tables.

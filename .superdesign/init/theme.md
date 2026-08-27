# Theme tokens

## Compact summary

**Canvas:** `oklch(0.9663 0.004 106.47)`  
**Ink / primary:** `oklch(0.2178 0 0)`  
**Muted fg:** `oklch(0.493 0 0)`  
**Surface / card:** white `oklch(1 0 0)`  
**Sunken / muted:** `oklch(0.9546 0.0027 106.45)`  
**Border:** `oklch(0.215 0.004 106 / 0.12)`  
**Brand/info (blue, links only):** `oklch(0.5553 0.1056 232.01)`  
**Danger:** `oklch(0.5408 0.176 27.61)`

**Fonts:** Inter Variable (sans), Geist Pixel (public display), DM Mono (code). Root 14px.

**Space:** gutter 16px, intra 8px, related 16px, section 32px, page 48px, touch 44px.

**Radius:** `--radius` 0.625rem, `--radius-card` 0.9375rem.

**Sidebar tokens:** `--sidebar` = canvas, `--sidebar-accent` = white surface.

**Motion:** fast 100ms, base 160ms, slow 220ms, ease `cubic-bezier(0.2, 0, 0, 1)`.

Source of truth: `src/styles/globals.css` `:root` block (lines ~125–244). Tailwind v4 via `@theme` mapping in the same file. No separate `tailwind.config.ts` theme.extend for these AE tokens.

## Raw source (token block only)

See `src/styles/globals.css` from `--ae-font-sans` through `--shadow-inset-market-cell`. Do not pass the whole file as generation context; this summary is the budget-friendly set.

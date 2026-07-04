# Astryx token map for AE Eucalyptus brand

Source authority: `.planning/brand/BIBLE.md` v1 is locked. This file is the implementation map for ticket 004: bind the Bible palette to Astryx theme-neutral without creating a second design system.

## 1. Non-bespoke mechanism

Use the existing Astryx theme-neutral token surface that is already imported in `src/styles/globals.css` and applied by `src/routes/__root.tsx`:

- `src/routes/__root.tsx` wraps the app in `<Theme theme={neutralTheme} mode="light">`.
- `@astryxdesign/theme-neutral/theme.css` declares the theme in `@layer astryx-theme` under `@scope ([data-astryx-theme="neutral"]) to ([data-astryx-theme])`.
- `@astryxdesign/core/tailwind-theme.css` maps those custom properties to Tailwind v4 utilities: `text-primary`, `text-secondary`, `bg-body`, `bg-surface`, `bg-card`, `border-border`, `rounded-md`, `shadow-sm`, `bg-accent-bg`, `text-accent`, `text-on-accent`.

Therefore the exact mechanism is: add one scoped override block to the existing `src/styles/globals.css` cascade, after the current import block and after the existing `@theme inline` compatibility mappings, in the same `astryx-theme` layer. Do not add a CSS file, do not add shadcn/radix/cva, do not expand `tokens.css`, and do not introduce `Ae*` presentation components.

```css
@layer astryx-theme {
  @scope ([data-astryx-theme="neutral"]) to ([data-astryx-theme]) {
    :scope {
      /* AE Bible palette: Astryx semantic token overrides. */
      --color-background-body: #F4EFE6;    /* Bone → bg-body */
      --color-background-surface: #FBF8F1; /* Paper → bg-surface */
      --color-background-card: #FBF8F1;    /* Paper → bg-card */
      --color-background-popover: #FBF8F1;
      --color-background-muted: #ECE6DC;   /* Mist → muted fills/chips */

      --color-text-primary: #17201F;       /* Ink → text-primary */
      --color-text-secondary: #5B6360;     /* Slate → text-secondary */
      --color-text-disabled: #8AA396;      /* Dust only for disabled/muted marks, never body text */

      --color-border: #D8CFC2;             /* Stone → border-border */
      --color-border-emphasized: #8AA396;  /* Dust → hairline accent / active proof rule */
      --color-skeleton: #D8CFC2;

      --color-accent: #40614F;             /* Eucalyptus → accent / CTA fill */
      --color-text-accent: #40614F;        /* text-accent / links / kickers */
      --color-icon-accent: #40614F;
      --color-on-accent: #F4EFE6;          /* Bone on Eucalyptus passes AA */
      --color-accent-muted: color-mix(in oklch, #8AA396 24%, #FBF8F1);

      --radius-inner: 4px;
      --radius-element: 6px;
      --radius-container: 6px;
      --radius-page: 6px;
      --radius-chat: 6px;

      --shadow-low: 0 1px 2px oklch(23.44% 0.0131 187.94 / 0.04),
        inset 0 0 0 1px oklch(23.44% 0.0131 187.94 / 0.06);
      --shadow-med: 0 2px 8px oklch(23.44% 0.0131 187.94 / 0.06),
        inset 0 0 0 1px oklch(23.44% 0.0131 187.94 / 0.08);
      --shadow-high: 0 8px 24px oklch(23.44% 0.0131 187.94 / 0.08),
        inset 0 0 0 1px oklch(23.44% 0.0131 187.94 / 0.10);
      --shadow-inset-hover: inset 0 0 0 2px oklch(46.14% 0.0486 159.87 / 0.22);
      --shadow-inset-selected: inset 0 0 0 2px oklch(46.14% 0.0486 159.87 / 0.40);
    }
  }
}
```

Notes:

- `--color-accent` is the brand-accent token. Because the Astryx bridge already maps `bg-accent-bg` to it and Astryx components consume it, no bespoke `--ae-eucalyptus` token is needed.
- `--color-text-accent` and `--color-icon-accent` are set to the same Eucalyptus value so `text-accent`, links, mono kickers, proof-step labels, and active stamps remain one-accent.
- Dust is intentionally not a body-text color. It is a muted mark / hairline-accent value; Dust-on-Bone is only `2.36:1`, so it fails WCAG AA for text.
- Keep status red/orange/yellow semantics on Astryx defaults unless there is a separate status-token decision. Eucalyptus is brand/proof progress, not success/warning/error.

## 2. Palette conversion

Hex remains the source of truth from the Bible. Use these OKLCH values when a token requires OKLCH or alpha variants.

| Bible token | Hex | OKLCH |
|---|---:|---:|
| Ink | `#17201F` | `oklch(23.44% 0.0131 187.94)` |
| Bone | `#F4EFE6` | `oklch(95.35% 0.0131 82.40)` |
| Paper | `#FBF8F1` | `oklch(97.95% 0.0098 87.47)` |
| Stone | `#D8CFC2` | `oklch(85.82% 0.0203 77.30)` |
| Mist | `#ECE6DC` | `oklch(92.69% 0.0149 80.71)` |
| Slate | `#5B6360` | `oklch(49.17% 0.0110 171.42)` |
| Eucalyptus | `#40614F` | `oklch(46.14% 0.0486 159.87)` |
| Eucalyptus-dust | `#8AA396` | `oklch(69.24% 0.0337 162.80)` |
| Clay | `#A85C3A` | `oklch(55.66% 0.1104 44.02)` |

## 3. Astryx/Tailwind binding table

| Intended utility / role | Astryx token to set | Bible value | Rationale |
|---|---|---|---|
| `text-primary` | `--color-text-primary` | Ink `#17201F` | Primary copy, seal, receipt text. |
| `text-secondary` | `--color-text-secondary` | Slate `#5B6360` | Secondary copy that still passes on Bone. |
| `bg-body` | `--color-background-body` | Bone `#F4EFE6` | Page canvas. |
| `bg-surface` | `--color-background-surface` | Paper `#FBF8F1` | Raised sections, forms, detail surfaces. |
| `bg-card` | `--color-background-card` | Paper `#FBF8F1` | Receipt cards, ledgers, comparison rows. |
| `bg-muted` | `--color-background-muted` | Mist `#ECE6DC` | Chips and quiet fills. |
| `border-border` | `--color-border` | Stone `#D8CFC2` | Hairline rules/table lines. |
| Strong/accent hairline | `--color-border-emphasized` | Dust `#8AA396` | Active proof-spine rules or stamp outlines. |
| `bg-accent-bg`, Astryx primary affordances | `--color-accent` | Eucalyptus `#40614F` | The single brand accent / CTA fill. |
| `text-accent` / `icon-accent` | `--color-text-accent`, `--color-icon-accent` | Eucalyptus `#40614F` | Links, kickers, active proof steps. |
| `text-on-accent` | `--color-on-accent` | Bone `#F4EFE6` | CTA text over Eucalyptus. |
| `bg-accent-muted` | `--color-accent-muted` | Dust tint | Tinted accent wash; do not use solid Dust as text/background pair. |
| `rounded-md` / Astryx controls | `--radius-element` | `6px` | Controls/buttons. |
| Astryx cards/dialogs/pages/chat | `--radius-container`, `--radius-page`, `--radius-chat` | `6px` | Keeps the Bible's 4–6px strictness; avoids bubbly defaults. |
| `shadow-sm` / elevation | `--shadow-low` | Ink alpha hairline | Hairline elevation, not decorative drop shadow. |

## 4. WCAG contrast check

AA thresholds: normal text `4.5:1`; large text/UI graphics `3:1`.

| Combo | Ratio | AA normal | AA large/UI | Decision |
|---|---:|---|---|---|
| Ink `#17201F` on Bone `#F4EFE6` | `14.52:1` | Pass | Pass | Primary copy is safe. |
| Bone `#F4EFE6` on Eucalyptus `#40614F` | `6.03:1` | Pass | Pass | CTA text is safe. |
| Eucalyptus `#40614F` on Bone `#F4EFE6` | `6.03:1` | Pass | Pass | Links/kickers/proof labels are safe. |
| Slate `#5B6360` on Bone `#F4EFE6` | `5.40:1` | Pass | Pass | Secondary text is safe. |

No requested combo fails AA, so no palette adjustment is required.

Guardrail: Eucalyptus-dust `#8AA396` on Bone is `2.36:1` and Stone `#D8CFC2` on Bone is `1.35:1`; both fail for text. Use Dust/Stone only for borders, dividers, muted fills, disabled marks, or non-text ornamental proof lines. If Dust must carry text, the minimal correction is to use Eucalyptus `#40614F` instead of darkening Dust into a second accent.

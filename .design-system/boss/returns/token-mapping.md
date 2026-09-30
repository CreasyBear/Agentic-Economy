Status: not actionable (gap threshold)
Commit: none

# Token mapping: `/market?view=discover`

The installed `token-mapping` procedure mapped literal style values in the current buyer discover surface by purpose before numeric value. Of 8 counted occurrences, 4 exactly match a purpose-compatible token and 4 are gaps. Seven token-plus-alpha uses and three decorative gradient stops were not mapped. Four gaps exceed the skill's 30% gap threshold, so this is evidence for token-source reconciliation rather than an automatic value-swap list.

| Value | Source | Job | Result |
|---|---|---|---|
| 44px, 1.02, −0.055em | `src/components/ae/market/DirectoryHero.tsx:28` | Display size, leading, tracking | Exact `text-display`, `leading-display`, `tracking-display` |
| 0.12em | `DirectoryHero.tsx:27` | Eyebrow tracking | Gap vs `tracking-eyebrow` 0.16em; active design contract names this component as lived reference |
| 432px | `DirectoryHero.tsx:33` | Large-screen artwork-card height | Gap; no purpose-compatible fixed-height token |
| 32px | `DirectoryHomeDiscovery.tsx:24` | Mobile navigation bottom clearance | Gap; `space-section` has same value but a different job |
| 16px, total 80px | `DirectoryHomeDiscovery.tsx:26` | Header scroll offset | Gap vs `spacing-anchor` 72px |
| 16px plus safe area, total 72px plus safe area | `DirectoryHomeDiscovery.tsx:26` | Mobile navigation scroll clearance | Exact `spacing-anchor` |

The public hero's responsive `text-6xl`/`text-7xl` have no matching responsive display-size role in the list. This is a mapping gap, not a violation of the `DESIGN.md` rule against 7xl **operator** heroes. The eyebrow's live `font-medium` (500) also conflicts with `--ae-weight-eyebrow:700` in `src/styles/globals.css`. `DESIGN.md` both names DirectoryHero as the lived visual reference and says values come from globals, leaving source precedence unresolved.

Do not substitute `space-section` for the bottom inset solely because the numbers match. No ambiguous counted rows were found. Decisions needed: whether the eyebrow token or live reference wins, and whether layout-specific values warrant token roles.

Source: `src/styles/globals.css`, `DESIGN.md`, `src/routes/market.tsx`, `AeX402Directory.tsx`, `DirectoryHero.tsx`, `DirectoryHomeDiscovery.tsx`, the referenced cards and identities, read 2026-09-30. Light-mode source only; no computed browser styles. Operator, admin, auth and other market tabs were outside scope. No product file changed and no tests were run.

Coverage: `/market?view=discover` literal values and matching team tokens in light mode; not a whole-app token audit.

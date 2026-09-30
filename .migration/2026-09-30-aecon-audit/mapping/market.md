Status: not actionable (gap threshold)
Commit: none

## Summary

The market has a small number of exact typography matches, but most inventoried raw values are component-specific layout geometry without a matching named token, so this is not an actionable conversion list.

Rows: 38 occurrences (raw 38, palette 0). Exact 3, semantic 1, ambiguous 0, gap 34, do not use 0. Gap share: 89.5%, above the 30% threshold. Not mapped: token + alpha 0; graphic 0.

Modes: light and dark. The typography tokens used by these rows are unchanged between modes; none of the scoped values are colours or palettes.

## Mapping

Jobs below are inferred from the utility name and adjacent JSX/layout unless the component's semantic role is explicit in the row. Values normalize to px, unitless ratios, or em where applicable (rem root 16px).

| Value | Location | Job | Token | Class | Reason |
|---|---|---|---|---|---|
| 0.6875rem (11px) | `src/components/ae/command-panel/AeCommandPanel.tsx:82` | Keyboard hint font size (inferred) | `text-caption` (12px) | Semantic | Caption purpose fits keyboard hint text; 1px under the token, at the 1px font-size tolerance. |
| `calc(100dvh - 1rem)` | `src/components/ae/command-panel/AeCommandPanel.tsx:92` | Full-height dialog with a viewport inset (inferred) | — | Gap | No declared token covers viewport-relative dialog height. |
| `min(42rem, calc(100dvh - 3rem))` | `src/components/ae/command-panel/AeCommandPanel.tsx:92` | Responsive dialog height cap (inferred) | — | Gap | No declared token covers this combined viewport and fixed-height bound. |
| `calc(100% - 1rem)` | `src/components/ae/command-panel/AeCommandPanel.tsx:92` | Narrow-screen dialog width (inferred) | — | Gap | No declared token covers a parent-relative overlay width formula. |
| 10px | `src/components/ae/command-panel/AeCommandPanel.tsx:161` | Keyboard-key glyph size (inferred) | `text-caption` (12px) | Gap | Caption purpose fits; value is 2px under, outside the 1px font-size tolerance. |
| 10px | `src/components/ae/command-panel/AeCommandPanel.tsx:167` | Keyboard-key glyph size (inferred) | `text-caption` (12px) | Gap | Caption purpose fits; value is 2px under, outside the 1px font-size tolerance. |
| 10px | `src/components/ae/command-panel/AeCommandPanel.tsx:173` | Keyboard-key glyph size (inferred) | `text-caption` (12px) | Gap | Caption purpose fits; value is 2px under, outside the 1px font-size tolerance. |
| 10px | `src/components/ae/command-panel/AeCommandPanel.tsx:180` | Keyboard-key glyph size (inferred) | `text-caption` (12px) | Gap | Caption purpose fits; value is 2px under, outside the 1px font-size tolerance. |
| `calc(100dvh - 2rem)` | `src/components/ae/landing/AeAgentJsonAffordance.tsx:76` | Data-preview dialog maximum height (inferred) | — | Gap | No declared token covers this viewport-relative overlay bound. |
| `min(42rem, calc(100vw - 2rem))` | `src/components/ae/landing/AeAgentJsonAffordance.tsx:76` | Data-preview dialog maximum width (inferred) | — | Gap | No declared token covers the viewport-bound dialog width. |
| 50dvh | `src/components/ae/landing/AeAgentJsonAffordance.tsx:89` | Maximum code-preview height (inferred) | — | Gap | No declared token covers a viewport-relative code-pane height. |
| 18rem (288px) | `src/components/ae/listing/AeProviderListingPage.tsx:45` | Provider-page sidebar column width (inferred) | — | Gap | `max-width-rail` is for page rails, not a sidebar column; no sidebar-width token is declared. |
| 18rem (288px) | `src/components/ae/listing/public-business/AePublicBusiness.tsx:66` | Public-business sidebar column width (inferred) | — | Gap | `max-width-rail` is for page rails, not a sidebar column; no sidebar-width token is declared. |
| `minmax(0, 1fr) auto` | `src/components/ae/market/AeX402Directory.tsx:461` | Browse-tabs and companion-control columns (inferred) | — | Gap | No declared token covers this intrinsic two-column grid template. |
| `minmax(0, 1fr) auto minmax(0, 1fr)` | `src/components/ae/market/AeX402Directory.tsx:567` | Pager content alignment columns (inferred) | — | Gap | No declared token covers the symmetric three-column grid template. |
| 85dvh | `src/components/ae/market/DirectoryComparison.tsx:27` | Comparison-dialog maximum height (inferred) | — | Gap | No declared token covers a viewport-relative overlay height. |
| `calc(100% - 2rem)` | `src/components/ae/market/DirectoryComparison.tsx:27` | Comparison-dialog width (inferred) | — | Gap | No declared token covers this parent-relative overlay width. |
| -0.035em | `src/components/ae/market/DirectoryHero.tsx:22` | Compact hero heading tracking (inferred) | `tracking-display` (-0.055em) | Gap | Closest display-purpose token fits the shared hero heading role; -0.035em is 0.020em less negative, beyond the 0.01em tolerance. |
| `1.05fr 0.95fr` | `src/components/ae/market/DirectoryHero.tsx:25` | Responsive hero text/artwork columns (inferred) | — | Gap | No declared token covers this proportional grid template. |
| 0.12em | `src/components/ae/market/DirectoryHero.tsx:27` | Uppercase market eyebrow tracking | `tracking-eyebrow` (0.16em) | Gap | Eyebrow purpose fits; value is 0.04em under, beyond the 0.01em tolerance. |
| 1.02 | `src/components/ae/market/DirectoryHero.tsx:28` | Display-heading line height | `leading-display` (1.02) | Exact | The display token purpose fits and the normalized ratio is identical. |
| 2.75rem (44px) | `src/components/ae/market/DirectoryHero.tsx:28` | Display-heading font size | `text-display` (44px) | Exact | The public display token purpose fits and the normalized size is identical. |
| -0.055em | `src/components/ae/market/DirectoryHero.tsx:28` | Discover display-heading tracking | `tracking-display` (-0.055em) | Exact | The display token purpose fits and the value is identical. |
| 27rem (432px) | `src/components/ae/market/DirectoryHero.tsx:33` | Wide hero artwork minimum height (inferred) | — | Gap | No declared token covers this component-specific minimum height. |
| `calc(var(--ae-mobile-nav-height) + env(safe-area-inset-bottom, 0px) + 2rem)` | `src/components/ae/market/DirectoryHomeDiscovery.tsx:24` | Mobile page bottom inset for the persistent nav (inferred) | — | Gap | The formula includes existing runtime values, but no declared token covers this combined page inset. |
| `calc(var(--ae-mobile-nav-height) + env(safe-area-inset-bottom, 0px) + 1rem)` | `src/components/ae/market/DirectoryHomeDiscovery.tsx:26` | Collection scroll margin above mobile navigation (inferred) | — | Gap | No declared token covers the combined safe-area and navigation scroll margin. |
| `calc(var(--header-height) + 1rem)` | `src/components/ae/market/DirectoryHomeDiscovery.tsx:26` | Collection scroll margin below the sticky header (inferred) | — | Gap | No declared token covers the header-relative scroll margin. |
| 85% | `src/components/ae/market/DirectoryHomeDiscovery.tsx:42` | Mobile carousel card basis (inferred) | — | Gap | No declared token covers the responsive fractional item width. |
| 85% | `src/components/ae/market/DirectoryIndexDiscovery.tsx:51` | Mobile carousel card basis (inferred) | — | Gap | No declared token covers the responsive fractional item width. |
| `auto 1fr auto` | `src/components/ae/market/DirectoryProviderCards.tsx:25` | Provider-card header/body/footer rows (inferred) | — | Gap | No declared token covers this component grid template. |
| `auto minmax(0, 1fr)` | `src/components/ae/market/DirectoryProviderCards.tsx:26` | Provider avatar and identity columns (inferred) | — | Gap | No declared token covers this intrinsic grid template. |
| `auto minmax(0, 1fr) auto` | `src/components/ae/market/DirectoryProviderHeader.tsx:34` | Provider avatar, identity and count columns (inferred) | — | Gap | No declared token covers this intrinsic grid template. |
| `minmax(0, 1fr) auto` | `src/components/ae/market/DirectoryProvidersIndex.tsx:84` | Provider-index pager columns (inferred) | — | Gap | No declared token covers this two-column grid template. |
| `auto 1fr auto` | `src/components/ae/market/DirectoryToolCard.tsx:29` | Tool-card header/body/footer rows (inferred) | — | Gap | No declared token covers this component grid template. |
| `auto minmax(0, 1fr) auto` | `src/components/ae/market/DirectoryToolCard.tsx:30` | Tool-card icon, identity and actions columns (inferred) | — | Gap | No declared token covers this intrinsic grid template. |
| 32rem (512px) | `src/components/ae/market/DirectoryToolPlayground.tsx:102` | Maximum JSON example/code-block height (inferred) | — | Gap | No declared token covers this component-specific maximum height. |
| `minmax(0, 1fr) auto` | `src/components/ae/market/tool-detail/AeToolDecision.tsx:21` | Decision summary and action columns (inferred) | — | Gap | No declared token covers the responsive decision-section grid template. |
| `min(100vw, 46rem)` | `src/components/ae/market/tool-detail/AeToolInspector.tsx:136` | Technical-contract sheet width (inferred) | — | Gap | No declared token covers the viewport-bounded overlay width; the adjacent `sm:max-w-2xl` also caps the effective width and should be checked for redundancy. |

## Do not use

None. No in-scope value was an exact value match to a token with a different declared purpose.

## Ambiguous

None. Each gap has either no purpose-matching declared token or one closest token whose value is outside the stated tolerance.

## Gaps

- 28 layout values: modal/sheet/pane bounds, sidebar widths, grid templates, scroll offsets, carousel fractions and component-specific heights. These are not covered by the current token purposes. Their component jobs differ, so centralizing every value into generic spacing or width tokens would be unsupported by the current contract.
- Four 10px keyboard-key sizes: `text-caption` is the sole purpose-compatible size token, but each value is 2px below its 12px size, outside tolerance.
- Two tracking values: compact hero `-0.035em` is 0.020em less negative than `tracking-display`; the eyebrow `0.12em` is 0.04em below `tracking-eyebrow`. Both exceed the 0.01em tolerance.

## For a person to decide

- Should the 28 geometry values remain local implementation details, or should system ownership identify a component-level pattern for a later migration? Default: preserve them pending system-owner direction; do not invent general tokens.
- Should the four 10px key glyphs use the existing 12px `text-caption` scale or keep their compact size? Default: preserve current rendering; any size change needs parity review.
- Should the compact hero and eyebrow tracking values be retained or aligned with their nearest semantic tokens? Default: preserve current rendering; mapped visual changes require a separate decision and capture.

## Source

Token list: active product system in `src/styles/globals.css`, CSS custom properties exposed through Tailwind `@theme inline`; purpose/roles from `DESIGN.md` and comments adjacent to declarations. Read directly from the pinned checkout on 2026-09-30 at 02:32 UTC. The scope contains typography and layout values only; light/dark typography values are the same. Relevant declared values include `--ae-text-caption: 0.75rem`, `--ae-text-display: 2.75rem`, `--ae-leading-display: 1.02`, `--ae-tracking-eyebrow: 0.16em`, and `--ae-tracking-display: -0.055em`. `DESIGN.md` names `font-mono` for keyboard hints and the display/eyebrow jobs. `--max-width-rail` is a rail width, not a sidebar or overlay width. No `docs/system/decisions.md`, `tokens.json`, or separate token source was present. No color conversion was needed (0 color rows). Rem root: 16px. Assumption: row jobs are inferred from the class and nearby markup as marked; no rendered browser values were measured.

Coverage: all 38 raw findings assigned to `market` in `inventory/current.tsv`, covering the 18 files in the table; light and dark modes read for the shared typography values. No market palette or color rows exist. Source-only review; no browser capture, runtime styles, computed values, or non-arbitrary framework typography utilities were measured. The hero's `lg:text-6xl` and `xl:text-7xl` are outside this arbitrary-value inventory and remain a static blind spot for the declared display scale.

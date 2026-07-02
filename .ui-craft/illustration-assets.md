# Illustration Assets — Hand-Drawn Pen-and-Ink Prompts

The signature brand asset for Agentic Economy (Daylight Commerce Routing). "Drawn by hand. Read by agents." — human craft as the counterpoint to the machine-readable underside. These 20 assets are the visual form of that thesis.

## Shared style lock (applies to every prompt below)

Every asset in this plan is the same hand, the same ink, the same paper. Do not vary the medium between assets.

- **Medium:** pen-and-ink line drawing, hand-drawn. Consistent nib weight, confident outlines, light cross-hatching for shade, no fills, no flat color blocks.
- **Ink:** black ink only (`#14161A` on the page; render as pure black line in the source asset).
- **Ground:** sunlit drafting paper `#ECEAE1` as the visible paper background (or transparent PNG with paper-tone matting so it composites on `--ae-paper` without a hard edge). Never white. Never cream. Never a gradient.
- **No text in the art.** No letters, no numbers, no signage lettering, no fake labels. The UI supplies all type.
- **No color accents in the line art.** Amber/eucalyptus/oxide are applied by the UI layer (pins, pills), never baked into the illustration. The illustration is ink-only.
- **No vector-flat-illustration look, no corporate cartoon, no isometric, no 3D, no gradients, no blobs, no drop shadows.** It must read as a person drew it with a pen on paper. Allow faint construction lines and the occasional wobble — that is the point.
- **Subject register:** local Australian suburban/civic vernacular — Victorian and Edwardian timber-and-brick houses, verandahs, pitched slate roofs, civic buildings, faint city skylines, trades tools. Region-true, not generic American suburbia.
- **Density:** open compositions with generous paper breathing room. The line does the work; the paper carries warmth.

## Generation notes

- Generate at high resolution (≥2048px on the long edge) and downscale for the web. Export PNG with the paper background (hero, category marks) or transparent (map pin, dividers, end-marks) per each asset's "Background" line.
- Keep a master `.svg`-traceable version where a clean vector stroke is feasible (map pin, dividers, end-marks, ledger mark). The hero and category marks stay raster to preserve the hand-drawn imperfection.
- One stroke language across the set. If a generated asset comes back too clean/vector, regenerate with explicit "rough pen nib, visible hand-drawn construction lines, paper grain" prompts.

## Output location

Generated assets land in `public/images/illustration/` with the filenames below. `AeHandDrawnHero` and the category/empty-state components reference them by these paths.

---

## 1. Hero — Victorian house + faint skyline

- **Filename:** `public/images/illustration/hero-victorian-house.png`
- **Purpose:** the landing hero illustration beside the query box. The single most important brand image.
- **Subject:** a detached Victorian-era Australian suburban house — pitched slate roof, cast-iron lace verandah, double-fronted brick facade, a single chimney. Behind it, a low, faint city skyline (a few spare skyline silhouettes) sitting on the horizon line, drawn much lighter and thinner so the house dominates.
- **Composition:** house centered-left, skyline hugging the right horizon, generous sky (paper) above. A low picket or low front fence suggested at the base. Maybe one small trades van silhouette parked at the curb, optional and very small.
- **Aspect ratio:** 16:9 (landscape), composable beside or behind the query box on desktop; crops to a 4:3 or 1:1 on mobile without losing the house.
- **Background:** sunlit paper `#ECEAE1`, visible.
- **Avoid:** lettering on the house number or shop sign, people faces, cars in focus, any color.

## 2. Plumbing — category line mark

- **Filename:** `public/images/illustration/cat-plumbing.png`
- **Purpose:** service-category mark for plumbing.
- **Subject:** a spanner crossed with a section of pipe, a small dripping tap, and a pipe bend. Trades-tools still life.
- **Composition:** compact, centered, fits a ~96px square chip at small size but drawn at large size.
- **Aspect ratio:** 1:1.
- **Background:** transparent (composites on paper and on raised card `#F4F3EC`).

## 3. Electrical — category line mark

- **Filename:** `public/images/illustration/cat-electrical.png`
- **Subject:** a hand-drawn lightbulb outline with a simple filament, a short cable, and a wall outlet. No lightning bolt cliché.
- **Aspect ratio:** 1:1. **Background:** transparent.

## 4. Locksmith — category line mark

- **Filename:** `public/images/illustration/cat-locksmith.png`
- **Subject:** a classic pin-tumbler key and a padlock, key partly inserted. Spare, clean line.
- **Aspect ratio:** 1:1. **Background:** transparent.

## 5. Cleaning — category line mark

- **Filename:** `public/images/illustration/cat-cleaning.png`
- **Subject:** a bucket with a wrung mop leaning in, a spray bottle outline, a few soap-bubble circles suggested with thin line. No sparkle/starburst cliché.
- **Aspect ratio:** 1:1. **Background:** transparent.

## 6. HVAC — category line mark

- **Filename:** `public/images/illustration/cat-hvac.png`
- **Subject:** a split-system unit mounted on a wall with a short duct, and a thermometer outline. Trades-tools register, not a snowflake icon.
- **Aspect ratio:** 1:1. **Background:** transparent.

## 7. Appliance repair — category line mark

- **Filename:** `public/images/illustration/cat-appliance.png`
- **Subject:** a front-loading washing machine outline with door and dial, a screwdriver beside it. One appliance, clearly drawn.
- **Aspect ratio:** 1:1. **Background:** transparent.

## 8. Gardening — category line mark

- **Filename:** `public/images/illustration/cat-gardening.png`
- **Subject:** a spade and a hand trowel crossed with a small potted shrub. A single drawn leaf, not a flourish.
- **Aspect ratio:** 1:1. **Background:** transparent.

## 9. Pest control — category line mark

- **Filename:** `public/images/illustration/cat-pest.png`
- **Subject:** a drawn termite/silhouette of a small pest creature beside a barrier line, with a bait station box. Clinical-quiet, not cartoon-bug.
- **Aspect ratio:** 1:1. **Background:** transparent.

## 10. Roofing — category line mark

- **Filename:** `public/images/illustration/cat-roofing.png`
- **Subject:** a pitched roof section with tiled lines and a ladder leaning against the gutter edge. A few tiles cross-hatched.
- **Aspect ratio:** 1:1. **Background:** transparent.

## 11. Glazing — category line mark

- **Filename:** `public/images/illustration/cat-glazing.png`
- **Subject:** a sash window with glazing bars and a glass-cutter's wheel, a small pane outlined with a crack-repair line. Quiet, precise.
- **Aspect ratio:** 1:1. **Background:** transparent.

## 12. Civic landmark accent A — post office / town hall

- **Filename:** `public/images/illustration/acc-civic-postoffice.png`
- **Purpose:** a civic accent used in the "how it works" / trust bar area to root AE in local civic life.
- **Subject:** a small Australian country-town civic building — a low post office or town hall with a clock tower and a simple flagpole. Verandah, brick facade.
- **Aspect ratio:** 4:3. **Background:** sunlit paper `#ECEAE1`, visible.

## 13. Civic landmark accent B — corner shop with verandah

- **Filename:** `public/images/illustration/acc-civic-cornershop.png`
- **Subject:** a Victorian-era corner shop with a striped verandah awning (drawn as line, no color stripes), a recessed doorway, a small shopfront. No signboard lettering.
- **Aspect ratio:** 4:3. **Background:** sunlit paper `#ECEAE1`, visible.

## 14. Hand-drawn map pin

- **Filename:** `public/images/illustration/map-pin.png`
- **Purpose:** the active map pin mark. The UI tints it amber at runtime; the source art is ink-only.
- **Subject:** a classic teardrop map pin, hand-drawn, with a small hollow circle at the point where it lands. Slight wobble in the outline so it reads hand-drawn, not a vector pin.
- **Aspect ratio:** 1:2 (tall). **Background:** transparent.

## 15. Service-area mark

- **Filename:** `public/images/illustration/map-service-area.png`
- **Purpose:** a faint drawn boundary used behind/around the service-area map to signal "this is where they work."
- **Subject:** a hand-drawn dashed boundary loop (an organic, slightly irregular closed curve) with a few cross-hatch ticks inside suggesting a suburb area. Not a perfect circle, not a polygon.
- **Aspect ratio:** 16:9, large. **Background:** transparent (the UI applies a eucalyptus-tinted wash under it).

## 16. Section end-mark / divider A

- **Filename:** `public/images/illustration/divider-endmark-a.png`
- **Purpose:** a quiet section divider / end-mark between answer sections.
- **Subject:** a hand-drawn horizontal rule with a small drawn flourish at the center — a tiny gable or a small compass-star, hand-drawn. Thin, restrained.
- **Aspect ratio:** 8:1, wide. **Background:** transparent.

## 17. Section end-mark / divider B

- **Filename:** `public/images/illustration/divider-endmark-b.png`
- **Purpose:** alternate end-mark, used at the foot of the answer panel.
- **Subject:** a hand-drawn rule with a small drawn stamp/seal shape at the right end — a circular stamp outline with a few inner ticks, no lettering.
- **Aspect ratio:** 8:1, wide. **Background:** transparent.

## 18. Empty-state spot art

- **Filename:** `public/images/illustration/empty-state.png`
- **Purpose:** the empty-state illustration shown when the query returns no providers (paired with the truthful "No listed businesses match" line).
- **Subject:** an empty street corner — a bare suburban street sign post with no sign attached, a small drawn wind-suggesting curl, a single leaf drifting. Quiet, not sad-clown. Conveys "nothing here yet" without negativity.
- **Aspect ratio:** 4:3. **Background:** sunlit paper `#ECEAE1`, visible.

## 19. "No results" spot art

- **Filename:** `public/images/illustration/no-results.png`
- **Purpose:** the no-results illustration for the registry/browse path (distinct from the landing empty state).
- **Subject:** a hand-drawn magnifying glass tilted, with a small empty rectangle (a blank listing card) under it and a dashed line connecting them. Conveys "we looked, nothing matched."
- **Aspect ratio:** 4:3. **Background:** sunlit paper `#ECEAE1`, visible.

## 20. Agent / JSON ledger mark

- **Filename:** `public/images/illustration/agent-ledger.png`
- **Purpose:** the visual mark for the "Get as agent JSON" affordance — the human-craft counterpoint to the machine-readable payload. Used beside the mono link.
- **Subject:** a hand-drawn open ledger book with ruled lines and a few drawn "data" ticks (small square checkboxes, some filled with a single ink dot), and a small hand-drawn cable/plug trailing off the page edge suggesting machine-readability. No binary `01` digits, no code glyphs, no chip icon.
- **Aspect ratio:** 1:1. **Background:** transparent.

---

## Acceptance bar for the set

- One stroke language across all 20. A viewer can tell they belong together.
- Ink-only. Zero baked color. Zero text.
- Paper-ground (`#ECEAE1`) where the asset carries its own background; transparent where the UI composites it.
- The hero reads unambiguously as a hand-drawn local Australian house + faint skyline, not a generic stock-house.
- Category marks stay legible at 96px and at 24px line size in the UI.
- No asset triggers the "AI flat vector" read. If it does, regenerate with stronger hand-drawn prompt language.

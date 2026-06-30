# Public Landing Finish-Bar Report

Scope: public landing route, public landing component module, public shell, global public CSS, and public tokens.

Finish verdict: not finish-bar clean. No critical blockers were found in this read-only lane, but the surface has multiple Major findings. The page should not be called "polished" until the first-viewport copy, proof quality, source-fact semantics, motion duration, and type/spacing token discipline are tightened.

Severity count:

| Severity | Count |
|----------|-------|
| Critical | 0 |
| Major | 8 |
| Minor | 5 |

## Pass 1 - Hierarchy

| Severity | Finding | Evidence | Action |
|----------|---------|----------|--------|
| Major | Hero hierarchy splits attention between the giant H1 and the elevated dark answer card/wedge. The answer card is correct as a signature object, but its command surface, hard shadow, and adjacent dark wedge can compete with the intended first read: H1 -> lede -> claim CTA. | `src/routes/index.tsx:148`, `src/styles/globals.css:256`, `src/styles/globals.css:294`, `src/styles/globals.css:452` | Reduce hero record elevation/contrast slightly or tighten the hero copy/CTA stack so the squint order is unambiguous. |
| Minor | Primary / secondary / tertiary hierarchy is not written into the component contract. The system relies on CSS weight rather than named hierarchy roles. | `src/components/ae/landing/AePublicLanding.tsx:167`, `src/styles/globals.css:274` | Document the hero hierarchy in component props or a surface note when `.ui-craft` memory is established. |

## Pass 2 - Type System

| Severity | Finding | Evidence | Action |
|----------|---------|----------|--------|
| Major | The public CSS uses many variable-font weights across one surface: 560, 580, 620, 640, 650, 660, 670, 680, 700, 720, 760, 780. The finish bar expects <=3 visible weights per viewport. | `src/styles/globals.css:289`, `src/styles/globals.css:307`, `src/styles/globals.css:493`, `src/styles/globals.css:522`, `src/styles/globals.css:560`, `src/styles/globals.css:620`, `src/styles/globals.css:707`, `src/styles/globals.css:751`, `src/styles/globals.css:874` | Collapse to a named public type scale, for example 450 body, 600 title, 680 display, with mono/number roles separate only where needed. |
| Minor | Tabular numeral support exists globally via `[data-numeric]`, but landing step/index numerals do not use it. | `src/styles/globals.css:65`, `src/components/ae/landing/AePublicLanding.tsx:244`, `src/components/ae/landing/AePublicLanding.tsx:407` | Add `data-numeric` or a numeric utility to proof steps and service indices. |

## Pass 3 - Surface Stack

| Severity | Finding | Evidence | Action |
|----------|---------|----------|--------|
| Major | Public tokens define a strong light-mode surface system, but no public dark-mode reinterpretation exists even though `.dark` exists for the app shell. In dark mode, shell surfaces can invert while `ae-public-*` surfaces remain light. | `src/styles/tokens.css:34`, `src/styles/tokens.css:40`, `src/styles/tokens.css:84` | Either mark public landing as intentionally light-only with matching shell treatment, or define `.dark` public tokens for canvas/raised/command surfaces. |
| Minor | Surface names are public-specific and clear, but not mapped to the finish-bar canvas/raised/overlay vocabulary. | `src/styles/tokens.css:34`, `src/styles/tokens.css:36`, `src/styles/tokens.css:37`, `src/styles/tokens.css:40` | Add a short token note or aliases so future public components know which layer they are using. |

## Pass 4 - Spacing Rhythm

| Severity | Finding | Evidence | Action |
|----------|---------|----------|--------|
| Major | Public spacing is hand-tuned with many literal rem values instead of a named spacing scale. This makes the rhythm hard to preserve across future public sections. | `src/styles/globals.css:248`, `src/styles/globals.css:270`, `src/styles/globals.css:279`, `src/styles/globals.css:568`, `src/styles/globals.css:589`, `src/styles/globals.css:938` | Introduce public spacing tokens for section, grid, group, row, and inset spacing, then replace repeated literals. |
| Minor | Mobile section spacing drops from `7rem` to `4.8rem`, which is appropriate, but the relationship is implicit rather than tokenized. | `src/styles/globals.css:565`, `src/styles/globals.css:1139` | Name mobile/desktop section spacing tokens. |

## Pass 5 - Iconography

| Severity | Finding | Evidence | Action |
|----------|---------|----------|--------|
| None | Single icon family is used for the landing: Lucide icons imported once and passed through feature/path/CTA components. | `src/routes/index.tsx:2`, `src/components/ae/landing/AePublicLanding.tsx:318`, `src/components/ae/landing/AePublicLanding.tsx:386` | No change required. |
| Minor | The `PEP` monogram is content, not an icon, but it should stay constrained to record identity so it does not become a second icon language. | `src/components/ae/landing/AePublicLanding.tsx:339`, `src/styles/globals.css:776` | Keep monograms only for business identity marks. |

## Pass 6 - State Coverage

| Severity | Finding | Evidence | Action |
|----------|---------|----------|--------|
| None | The landing route is static/read-only, so idle is the primary state and form error/conflict states are not applicable on this surface. Downstream claim states are covered by e2e specs. | `src/routes/index.tsx:144`, `tests/e2e/public-owner-ui.spec.ts:48`, `tests/e2e/a11y/public-owner-a11y.spec.ts:15` | No landing-specific state blocker. |
| Minor | Low-bandwidth/offline behavior is not represented. For a static public page this is not a critical omission, but Adaeze's persona still lacks a stale/offline reassurance. | `src/components/ae/landing/AePublicLanding.tsx:163` | If the app later ships a service worker, add a small offline/stale-shell affordance at the shell level rather than inside every landing section. |

## Pass 7 - Motion Tuning

| Severity | Finding | Evidence | Action |
|----------|---------|----------|--------|
| Major | `.ae-public-reveal` runs for 700ms, above the finish-bar UI motion band of 100-400ms, and it is applied broadly to static informational content. | `src/styles/globals.css:1061`, `src/components/ae/landing/AePublicLanding.tsx:181`, `src/components/ae/landing/AePublicLanding.tsx:264`, `src/components/ae/landing/AePublicLanding.tsx:406` | Remove broad entrance motion or reduce to <=400ms. Prefer no entrance animation for static source-fact records. |
| Major | Hover transforms are not gated to hover-capable fine pointers. Touch browsers can hold hover state or waste work on an affordance that cannot be used. | `src/styles/globals.css:363`, `src/styles/globals.css:403`, `src/styles/globals.css:685` | Wrap hover transform rules in `@media (hover: hover) and (pointer: fine)`. |
| Minor | Reduced-motion handling exists and correctly disables reveal animations. | `src/styles/globals.css:1076` | Keep this when reducing the default motion. |

## Pass 8 - Microcopy Voice

| Severity | Finding | Evidence | Action |
|----------|---------|----------|--------|
| Major | First-viewport copy is too abstract for a cold local-service owner: "Source-owned records for agentic commerce" and "Own the answer agents quote" require product-language decoding before the practical outcome is clear. | `src/routes/index.tsx:149`, `src/routes/index.tsx:151`, `PRODUCT.md:10` | Rewrite the above-fold promise around the concrete job: claim, publish, and correct the public facts assistants and customers read. |
| Major | The proof strip is not proof in the landing-recipe sense. It lists process steps but gives no attributed proof point, named operator, record count, correction time, or before/after metric. | `src/routes/index.tsx:138`, `.agents/skills/ui-craft/references/recipe-landing.md:104` | Add one specific, attributed proof point or rename this block as a path/process strip and add proof elsewhere. |
| Minor | Conversion verb varies between "Claim record", "Claim your answer record", and "Claim the source record". | `src/components/ae/layout/AePublicShell.tsx:37`, `src/routes/index.tsx:172`, `src/routes/index.tsx:242` | Pick one primary verb phrase and reserve variants only when the object changes. |

## Pass 9 - Pixel Honesty

| Severity | Finding | Evidence | Action |
|----------|---------|----------|--------|
| Major | The answer-part section is still close to a generated icon-card pattern: four cards with icons, headings, copy, hover lift, and tone variation. The asymmetry helps, but the pattern conflicts with the AE public grammar that should privilege ledgers/records/rows over feature cards. | `src/components/ae/landing/AePublicLanding.tsx:305`, `src/styles/globals.css:640`, `src/styles/globals.css:647`, `src/styles/globals.css:685`, `DESIGN.md:159` | Convert this section to source-ledger rows, a single answer-record anatomy, or a known/unknown/unavailable comparison object. |
| Minor | Radius is intentionally compact for public cards, but nearly every public panel uses `--ae-public-radius-panel`. Buttons and marks vary, so this is not a uniform-radius blocker. | `src/styles/tokens.css:50`, `src/styles/globals.css:415`, `src/styles/globals.css:458`, `src/styles/globals.css:653`, `src/styles/globals.css:732` | Keep 8px as the default public panel radius, but document the role exceptions. |

## Pass 10 - Data Formatting

| Severity | Finding | Evidence | Action |
|----------|---------|----------|--------|
| Minor | Step numbers and service indices are visually data-like but not marked for tabular numerals. | `src/components/ae/landing/AePublicLanding.tsx:244`, `src/components/ae/landing/AePublicLanding.tsx:407`, `src/styles/globals.css:65` | Add `data-numeric` to numeric spans or style those classes with `font-variant-numeric: tabular-nums`. |
| None | No currency, dates, percentages, or comparative numeric charts appear on this landing route. | `src/routes/index.tsx:55`, `src/routes/index.tsx:138` | No further data-formatting work required. |

## Recipe-Landing Acceptance

| Acceptance item | Verdict | Evidence | Action |
|-----------------|---------|----------|--------|
| One conversion action | PASS | Claim is the single conversion action; registry remains secondary exploration. | Keep claim as the only conversion target. |
| CTA hierarchy | PARTIAL | Nav CTA is smaller and section CTAs are text links, but the closing section reuses `HeroActions` wholesale (`src/routes/index.tsx:229`). | Decide whether final CTA intentionally equals hero CTA; otherwise create a calmer closing CTA treatment. |
| Section grammar | PASS | Each section has a distinct job: stakes, answer anatomy, record preview, path, services, boundary, close. | Keep section count lean; do not add filler. |
| No fake screenshots | PASS | The page uses constructed answer-record objects instead of fake screenshots. | Keep product visuals as records/readbacks, not dashboards. |
| No uniform icon-card grids | PARTIAL | `AeSignalGrid` is asymmetrical but still icon-card based. | Replace with a ledger or answer-record anatomy. |
| Specific proof | FAIL | No attributed metric, named proof, or external credibility point appears. | Add specific proof or lower the claim intensity. |
| Mobile no overflow | PASS by code inspection | Grids collapse and CTAs stretch on small screens (`src/styles/globals.css:1130`, `src/styles/globals.css:1179`, `src/styles/globals.css:1201`). Visual no-overflow was not rerun. | Run Playwright visual/mobile no-overflow before shipping. |
| Reduced motion | PASS | Global and route-level reduced-motion rules exist (`src/styles/globals.css:69`, `src/styles/globals.css:1076`). | Keep reduced-motion while reducing default duration. |
| Every section answers one question | PASS | No obvious filler section found. | Strengthen proof, not section count. |

## Deterministic Checks

Attempted local detector:

```sh
npx --no-install ui-craft-detect src/routes/index.tsx src/components/ae/landing src/styles/globals.css --json
```

Result: unavailable. The command produced no output after approximately 35 seconds and was stopped. `command -v ui-craft-detect` found no binary, and `npm ls ui-craft-detect --depth=0` reported an empty dependency tree.

Existing relevant tests were read, not rerun:

| Test file | Relevant coverage |
|-----------|-------------------|
| `tests/e2e/public-owner-ui.spec.ts` | Home page exposes landing story and claim/registry CTAs (`tests/e2e/public-owner-ui.spec.ts:13`). |
| `tests/e2e/a11y/public-owner-a11y.spec.ts` | Skip link focus and downstream claim form label/error behavior (`tests/e2e/a11y/public-owner-a11y.spec.ts:6`, `tests/e2e/a11y/public-owner-a11y.spec.ts:15`). |
| `tests/ui-contract/class-scan.test.ts` | Route/component UI contract scan for raw visual drift (`tests/ui-contract/class-scan.test.ts:12`). |

## Final Verdict

Do not mark this lane as finish-bar complete. It is a credible public landing foundation, but below a 90-level bar because:

1. First-viewport copy is still insider language.
2. Proof is procedural, not specific or attributed.
3. The answer-part block still resembles an icon-card feature grid.
4. Motion defaults exceed the UI motion band.
5. Type and spacing decisions are not yet token-disciplined enough for a durable public system.

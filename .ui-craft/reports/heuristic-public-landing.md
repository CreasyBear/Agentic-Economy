# Public Landing Heuristic Report

Scope: public landing system at `src/routes/index.tsx`, `src/components/ae/landing/AePublicLanding.tsx`, `src/components/ae/layout/AePublicShell.tsx`, `src/styles/globals.css`, and `src/styles/tokens.css`.

Canonical recipe source: `.agents/skills/ui-craft/references/recipe-landing.md`. The user-provided SmoothUI URL was treated through this installed mirror.

## Heuristic Scorecard

| Heuristic | Score | Finding | Impact |
|-----------|-------|---------|--------|
| Visibility of system status | 4 | The page repeatedly exposes `Known`, `Unknown`, `Unavailable`, and next-step status in the hero record and boundary panel (`src/routes/index.tsx:55`, `src/routes/index.tsx:131`, `src/components/ae/landing/AePublicLanding.tsx:253`), but there is no live state on the landing itself beyond route navigation. | minor-polish |
| Match system and real world | 3 | The first viewport leads with "Source-owned records for agentic commerce" and "Own the answer agents quote" (`src/routes/index.tsx:149`, `src/routes/index.tsx:151`); owners under pressure still have to decode "source-owned", "agentic commerce", and "answer record" before they hear the plain task: claim and correct the public facts customers see. | blocks-conversion |
| User control and freedom | 4 | Primary escape paths exist: claim, registry, and corrections in public nav (`src/components/ae/layout/AePublicShell.tsx:29`) plus repeated registry/correction paths. The landing has no modal or destructive action trap. | minor-polish |
| Consistency and standards | 4 | Link and button patterns are consistent, using native `Link` and shared `Button` primitives (`src/routes/index.tsx:237`, `src/components/ui/button.tsx:46`). The conversion verb varies slightly between "Claim record", "Claim your answer record", and "Claim the source record" (`src/components/ae/layout/AePublicShell.tsx:37`, `src/routes/index.tsx:242`, `src/routes/index.tsx:172`). | minor-polish |
| Error prevention | 5 | The content actively prevents future-capability theatre by naming unavailable bookings/payment promises in the answer record and boundary panel (`src/routes/index.tsx:60`, `src/routes/index.tsx:134`). This is the strongest usability behavior on the page. | minor-polish |
| Recognition over recall | 4 | The answer-record grammar is visible instead of requiring memory (`src/components/ae/landing/AePublicLanding.tsx:264`, `src/components/ae/landing/AePublicLanding.tsx:337`). The registry link still assumes users know what "registry" means before clicking (`src/routes/index.tsx:218`). | minor-polish |
| Flexibility and efficiency | 3 | Users who want to inspect whether their business is already listed cannot search from the landing; every registry CTA sends an empty query object (`src/routes/index.tsx:53`, `src/routes/index.tsx:248`, `src/routes/index.tsx:268`). Add a compact registry lookup or an explicit "check your business" path near the hero. | adds-friction |
| Aesthetic and minimalist | 3 | The page avoids fake dashboards and generic SaaS gradients, but the proof strip is process proof rather than market proof (`src/routes/index.tsx:138`) and the four answer-part cards still read close to an icon-card feature grid despite asymmetric sizing (`src/routes/index.tsx:177`, `src/styles/globals.css:640`). | reduces-trust |
| Error recovery | 4 | The static landing has no form or async error state to recover from. Downstream claim/error behavior is covered in existing e2e specs, but this route itself does not expose retry, failure, or recovery UI. | minor-polish |
| Help and documentation | 4 | Corrections are reachable from nav (`src/components/ae/layout/AePublicShell.tsx:40`), but the footer is two text spans with no legal, correction, registry, or help links (`src/components/ae/layout/AePublicShell.tsx:51`). Bottom-of-page users lose the utility sitemap expected by the recipe. | minor-polish |

## Design Law Audit

| Law | Pass/Fail | Detail |
|-----|-----------|--------|
| Fitts's Law | PASS | Primary CTA is `min-height: 3.25rem` and text links are `min-height: 2.75rem` (`src/styles/globals.css:330`, `src/styles/globals.css:386`); mobile CTAs become full-width (`src/styles/globals.css:1179`). |
| Hick's Law | PASS | Public nav has three choices (`src/components/ae/layout/AePublicShell.tsx:29`) and the hero exposes one primary action plus one secondary registry action (`src/routes/index.tsx:237`). |
| Doherty Threshold | PASS | No user-initiated async interaction is performed on the landing route. The 700ms reveal animation is a finish-bar motion issue, not a response-time failure. |
| Cleveland-McGill | PASS | No comparative chart or quantitative dataviz is used; visual proof is text-led rather than angle/area/color encoded. |
| Miller's Law | PASS | Chunks stay within working-memory limits: 3 claim steps, 4 answer parts, 3 path steps, 4 services (`src/routes/index.tsx:138`, `src/routes/index.tsx:70`, `src/routes/index.tsx:94`, `src/routes/index.tsx:112`). |
| Tesler's Law | PASS | The UI absorbs complexity with the repeated known/unknown/unavailable/next-step grammar instead of exposing backend state or phase gates to public users (`src/routes/index.tsx:55`, `src/routes/index.tsx:131`). |

## Top findings (ranked by impact)

1. Match system and real world (score 3, blocks-conversion) - first-time owners must decode "source-owned records for agentic commerce" before the page plainly says "claim and correct the public business facts customers and assistants see."
2. Aesthetic and minimalist (score 3, reduces-trust) - the landing has distinctive record objects, but its "proof" is internal process proof and one section still behaves like an icon-card feature grid.
3. Flexibility and efficiency (score 3, adds-friction) - no direct registry lookup exists on the landing; every "View the registry" CTA sends users to a blank search state.

## UsabilityScore

**70 / C** (judged) - heuristic base 70 - law penalty 0

| Component | Value |
|-----------|-------|
| Nielsen mean (1-5) | 3.8 |
| Heuristic base (0-100) | 70 |
| Failed design laws | 0 |
| Law penalty | 0 |
| **UsabilityScore** | **70 / C** |

What keeps it below 90: the page is structurally credible, but first-viewport language is still category-insider copy, proof is not specific or attributed, the registry inspection path requires an extra click, and the answer-part section still leans on icon-card grammar.

## Recipe-Landing Acceptance

| Criterion | Verdict | Finding | Impact |
|-----------|---------|---------|--------|
| One conversion action | PASS | Claim is the single conversion action; registry is secondary exploration (`src/routes/index.tsx:237`). | minor-polish |
| CTA hierarchy | PARTIAL | Nav CTA is smaller, hero primary is strongest, and section CTAs are text links. The closing section reuses the full hero CTA row (`src/routes/index.tsx:229`), so the final action ties the hero instead of stepping down or deliberately restating the close. | adds-friction |
| Section grammar | PASS | Stakes, answer record, record preview, path, services, boundary, and closing each answer a distinct question (`src/routes/index.tsx:168`, `src/routes/index.tsx:177`, `src/routes/index.tsx:185`, `src/routes/index.tsx:201`, `src/routes/index.tsx:205`, `src/routes/index.tsx:213`, `src/routes/index.tsx:222`). | minor-polish |
| No fake screenshots | PASS | The page uses an answer-record object and record preview, not a fake dashboard or product screenshot (`src/components/ae/landing/AePublicLanding.tsx:253`, `src/components/ae/landing/AePublicLanding.tsx:327`). | minor-polish |
| No uniform icon-card grids | PARTIAL | The `AeSignalGrid` has asymmetric spans and varied tone, but it is still four icon-led cards (`src/components/ae/landing/AePublicLanding.tsx:305`, `src/styles/globals.css:640`). Convert this section into a source ledger or answer-record row set. | reduces-trust |
| Specific proof | FAIL | The proof strip lists "Claim / Publish / Correct" process steps, not attributed proof, metrics, named operators, or public record evidence (`src/routes/index.tsx:138`). | reduces-trust |
| Mobile no overflow | PASS | Code stacks grids at `max-width: 760px`, turns CTAs full-width, and collapses multi-column record facts (`src/styles/globals.css:1130`, `src/styles/globals.css:1179`, `src/styles/globals.css:1201`). Visual no-overflow was not rerun in this lane. | minor-polish |
| Reduced motion | PASS | Global and route-specific reduced-motion rules are present (`src/styles/globals.css:69`, `src/styles/globals.css:1076`). | minor-polish |
| Every section answers one question | PASS | The section sequence is purposeful and avoids filler. The weak spot is not relevance, it is proof specificity. | minor-polish |

## Persona Walkthroughs

### Priya - First-Timer

| Checklist item | Pass/Fail | Finding | Impact |
|----------------|-----------|---------|--------|
| Above the fold, I understand what this product does in 5 seconds | FAIL | "Source-owned records for agentic commerce" and "Own the answer agents quote" are precise for insiders but not plain enough for a mobile owner arriving cold (`src/routes/index.tsx:149`, `src/routes/index.tsx:151`). | blocks-conversion |
| One primary CTA is obvious | PASS | "Claim your answer record" is the dominant hero button (`src/routes/index.tsx:240`). | minor-polish |
| Terms I do not know have explanations | FAIL | "answer record", "source-owned", "agentic commerce", and "registry" are repeated without inline plain-language explanation above the fold (`src/routes/index.tsx:149`, `src/routes/index.tsx:218`). | adds-friction |
| Error messages explain the problem | PASS | Not applicable on the landing route; downstream claim form tests assert visible validation copy (`tests/e2e/a11y/public-owner-a11y.spec.ts:15`). | minor-polish |

### Kwame - Screen-Reader User

| Checklist item | Pass/Fail | Finding | Impact |
|----------------|-----------|---------|--------|
| Exactly one h1 and sensible heading outline | PASS | The hero owns the only `h1`; subsequent sections use `h2` and cards use `h3` (`src/components/ae/landing/AePublicLanding.tsx:183`, `src/components/ae/landing/AePublicLanding.tsx:220`, `src/components/ae/landing/AePublicLanding.tsx:319`). | minor-polish |
| Landmarks present | PASS | Header, nav, main, and footer are present; skip link targets main content (`src/components/ae/layout/AePublicShell.tsx:17`, `src/components/ae/layout/AePublicShell.tsx:23`, `src/components/ae/layout/AePublicShell.tsx:48`, `src/components/ae/layout/AePublicShell.tsx:51`). | minor-polish |
| Source facts expose semantic relationships | FAIL | The hero answer card renders term/value facts as `div role="list"` instead of a `dl`, while the later record preview uses `dl` correctly (`src/components/ae/landing/AePublicLanding.tsx:273`, `src/components/ae/landing/AePublicLanding.tsx:349`). | adds-friction |
| Every interactive element is reachable by Tab | PASS | CTAs and nav are native links/buttons, not click handlers on divs (`src/routes/index.tsx:241`, `src/routes/index.tsx:260`, `src/components/ae/layout/AePublicShell.tsx:31`). | minor-polish |

### Margo - One-Thumb Mobile

| Checklist item | Pass/Fail | Finding | Impact |
|----------------|-----------|---------|--------|
| Primary info is above the fold on a 390px screen | FAIL | Mobile keeps hero title, lede, description, full CTA row, proof strip, and answer card in sequence (`src/routes/index.tsx:148`, `src/styles/globals.css:1135`, `src/styles/globals.css:1188`); the source-owned record is likely below first viewport. | adds-friction |
| Touch targets are at least 44px | PASS | Nav buttons use `h-11`, primary buttons use `min-height: 3.25rem`, and text links use `min-height: 2.75rem` (`src/components/ui/button.tsx:27`, `src/styles/globals.css:330`, `src/styles/globals.css:386`). | minor-polish |
| No horizontal scroll | PASS | Mobile grids collapse to one column (`src/styles/globals.css:1201`). The nav itself is an intentional horizontal overflow container (`src/components/ae/layout/AePublicShell.tsx:29`), which should be visually checked. | minor-polish |
| Primary CTA is thumb-reachable | PASS | Hero CTAs become full-width on mobile (`src/styles/globals.css:1179`). | minor-polish |

### Adaeze - Low-Bandwidth

| Checklist item | Pass/Fail | Finding | Impact |
|----------------|-----------|---------|--------|
| Text remains readable without images | PASS | The landing uses no external hero image/video; the core story is HTML text and CSS surfaces. | minor-polish |
| First paint is not delayed by decorative motion | FAIL | Every `.ae-public-reveal` block runs a 700ms entrance animation by default (`src/styles/globals.css:1061`), applied across hero, records, cards, lists, and closing objects (`src/components/ae/landing/AePublicLanding.tsx:181`, `src/components/ae/landing/AePublicLanding.tsx:264`, `src/components/ae/landing/AePublicLanding.tsx:406`). | adds-friction |
| Offline state is communicated | FAIL | The static landing has no offline/stale-shell messaging or retry affordance. That may be acceptable for a marketing page, but it does not satisfy the low-bandwidth persona checklist. | adds-friction |
| Bundle avoids image/media weight | PASS | No image/video payload is present in the landing implementation; visual weight comes from CSS. | minor-polish |

## Ranked Persona Findings

1. `blocks-conversion` - Priya cannot decode the above-the-fold promise fast enough; rewrite the first viewport around "claim/correct public business facts" before using AE terminology.
2. `adds-friction` - Margo likely has to scroll before seeing the example answer record on mobile.
3. `adds-friction` - Kwame loses term/value semantics in the hero answer card because the source facts are not a `dl`.
4. `adds-friction` - Adaeze gets 700ms entrance motion across most content by default, which is unnecessary for a low-bandwidth/older-device path.
5. `reduces-trust` - The page claims process credibility but lacks attributed proof or a concrete record-quality metric.

## Deterministic Check

Attempted:

```sh
npx --no-install ui-craft-detect src/routes/index.tsx src/components/ae/landing src/styles/globals.css --json
```

Result: unavailable. The command produced no output after approximately 35 seconds and was stopped. Follow-up checks found no local `ui-craft-detect` binary and `npm ls ui-craft-detect --depth=0` returned an empty dependency tree.

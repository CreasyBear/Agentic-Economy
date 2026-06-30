# Public Landing Accessibility Report

Scope: public landing route and shell only. Downstream claim/registry behavior is referenced where existing tests prove the linked path, but this report does not audit all downstream screens.

Verdict: no obvious critical keyboard trap or missing accessible-name blocker in the landing route. The page is not a clean a11y pass because the core "answer record" facts lose semantic term/value structure in the hero, sections are not named at the section level, and default motion is heavier than needed for a static public page.

## Findings

| Area | Severity | Finding | Action |
|------|----------|---------|--------|
| Semantics | Major | The hero answer record renders source facts as `div role="list"` and `div role="listitem"` (`src/components/ae/landing/AePublicLanding.tsx:273`), while the same fact shape is a proper `dl` in the record preview (`src/components/ae/landing/AePublicLanding.tsx:349`). Screen-reader users lose term/value navigation for the first and most important record object. | Render `AeAnswerRecordCard.fields` as `dl > div > dt/dd`, matching `AeRecordPreview`. |
| Semantics | Major | The boundary panel repeats `Known`, `Unknown`, `Unavailable`, and `Next step` as `div/span/p` rows (`src/components/ae/landing/AePublicLanding.tsx:428`). These are also term/value facts. | Render `AeBoundaryPanel.rows` as `dl` and keep the same visual styling. |
| Semantics | Minor | `AeLandingBand` accepts `ariaLabel`, but most sections call it without a label and without connecting the section to the visible `h2` (`src/components/ae/landing/AePublicLanding.tsx:203`, `src/routes/index.tsx:168`). The inner copy div has `aria-labelledby`, not the section (`src/components/ae/landing/AePublicLanding.tsx:219`). | Pass section labels or refactor `AeLandingBand`/`AeSectionCopy` so each section is labelled by its visible heading. |
| Motion | Major | `.ae-public-reveal` applies a 700ms entrance animation to most content (`src/styles/globals.css:1061`). Reduced motion disables it, but the default path still animates a static information page longer than the UI Craft motion band. | Reduce entrance duration to <= 400ms or remove broad entrance animation from static record objects. |
| Motion | Minor | Hover transforms are defined for primary CTA/text links/answer cards (`src/styles/globals.css:363`, `src/styles/globals.css:403`, `src/styles/globals.css:685`) without a `(hover: hover) and (pointer: fine)` gate. Touch browsers can produce sticky hover states. | Wrap hover transform rules in a hover-capable media query. |
| Help / recovery | Minor | Footer contains only two text spans and no links (`src/components/ae/layout/AePublicShell.tsx:51`). Keyboard and screen-reader users reaching the end do not get a utility sitemap for registry, claim, corrections, or legal pages. | Add footer links with meaningful text. |

## Accessible Names

| Check | Status | Evidence |
|-------|--------|----------|
| Text links have accessible names | PASS | Hero and section CTAs use visible link text (`src/routes/index.tsx:241`, `src/routes/index.tsx:260`, `src/routes/index.tsx:268`). |
| Home link has an explicit name | PASS | Logo/home link has `aria-label="Agentic Economy home"` (`src/components/ae/layout/AePublicShell.tsx:25`). |
| Icon-only controls | PASS | The landing does not expose icon-only interactive controls. Decorative button icon wrapper is `aria-hidden` (`src/components/ae/landing/AePublicLanding.tsx:231`). |
| Decorative icons | PASS | Lucide feature/path icons are `aria-hidden` (`src/components/ae/landing/AePublicLanding.tsx:318`, `src/components/ae/landing/AePublicLanding.tsx:386`). |

## Keyboard

| Check | Status | Evidence |
|-------|--------|----------|
| Native controls | PASS | Navigation and CTAs are native links wrapped by shared button styles, not clickable divs (`src/components/ae/layout/AePublicShell.tsx:31`, `src/routes/index.tsx:241`). |
| Skip link | PASS | Skip link targets `#main-content` and existing a11y test verifies focus moves to main (`src/components/ae/layout/AePublicShell.tsx:17`, `src/components/ae/layout/AePublicShell.tsx:48`, `tests/e2e/a11y/public-owner-a11y.spec.ts:6`). |
| Tab order | PASS | DOM order follows visual order: logo/nav, hero copy, hero CTAs, proof/record, sections. No positive `tabindex` appears in the landing files. |
| Escape behavior | N/A | No modal, drawer, popover, or custom menu exists on the landing route. |

## Focus

| Check | Status | Evidence |
|-------|--------|----------|
| Visible focus | PASS | Global `:focus-visible` uses the AE focus ring (`src/styles/globals.css:39`, `src/styles/tokens.css:32`), and public CTAs add a route-specific ring (`src/styles/globals.css:381`). |
| Focus target for skip link | PASS | `main` is focusable with `tabIndex={-1}` (`src/components/ae/layout/AePublicShell.tsx:48`). |
| Focus not removed without replacement | PASS | `outline: 0` is paired with a box-shadow focus ring (`src/styles/globals.css:39`). |

## Semantics

| Check | Status | Evidence |
|-------|--------|----------|
| One `h1` | PASS | Hero renders a single `h1` (`src/components/ae/landing/AePublicLanding.tsx:183`). |
| Heading order | PASS | Sections use `h2`; card/list items use `h3` where nested (`src/components/ae/landing/AePublicLanding.tsx:220`, `src/components/ae/landing/AePublicLanding.tsx:319`, `src/components/ae/landing/AePublicLanding.tsx:388`). |
| Landmarks | PASS | Header, nav, main, and footer are present (`src/components/ae/layout/AePublicShell.tsx:23`, `src/components/ae/layout/AePublicShell.tsx:29`, `src/components/ae/layout/AePublicShell.tsx:48`, `src/components/ae/layout/AePublicShell.tsx:51`). |
| Term/value facts | FAIL | Hero answer facts and boundary rows should be `dl`, not generic list/div rows (`src/components/ae/landing/AePublicLanding.tsx:273`, `src/components/ae/landing/AePublicLanding.tsx:428`). |
| Lists | PASS | Repeated proof, stakes, feature, path, and service rows are exposed as lists with list items (`src/components/ae/landing/AePublicLanding.tsx:241`, `src/components/ae/landing/AePublicLanding.tsx:294`, `src/components/ae/landing/AePublicLanding.tsx:310`, `src/components/ae/landing/AePublicLanding.tsx:383`, `src/components/ae/landing/AePublicLanding.tsx:404`). Native lists would be simpler, but the ARIA roles are coherent. |

## Forms And Errors

| Check | Status | Evidence |
|-------|--------|----------|
| Landing forms | N/A | The public landing has no form fields, validation, or inline errors. |
| Linked claim path | COVERED ELSEWHERE | Existing e2e a11y coverage verifies labels, required error text, `aria-invalid`, and keyboard submit on `/claim` (`tests/e2e/a11y/public-owner-a11y.spec.ts:15`). This lane did not rerun the test. |
| Error recovery on landing | N/A | No async operation is submitted from the landing route. |

## Contrast

Approximate WCAG contrast checks were calculated from the OKLCH tokens in `src/styles/tokens.css`.

| Pair | Approx. Ratio | Status | Evidence |
|------|---------------|--------|----------|
| Public muted text on public field | 9.49:1 | PASS | `--ae-public-muted` on `--ae-public-field` (`src/styles/tokens.css:34`, `src/styles/tokens.css:39`). |
| Public ink on public field | 18.80:1 | PASS | `--ae-public-ink` on `--ae-public-field` (`src/styles/tokens.css:34`, `src/styles/tokens.css:38`). |
| Command text on command panel | 18.45:1 | PASS | `--ae-public-command-text` on `--ae-public-command` (`src/styles/tokens.css:40`, `src/styles/tokens.css:42`). |
| 78% command text on command panel | 11.28:1 | PASS | Muted command labels use `color-mix(... 78%, transparent)` (`src/styles/globals.css:489`). |
| Lime labels on command panel | 10.39:1 | PASS | Fact labels use lime on command surfaces (`src/styles/globals.css:549`, `src/styles/tokens.css:45`). |
| Ink at 72% alpha on amber-tinted card | 5.17:1 | PASS for normal text, narrow margin | Answer-part copy uses `currentColor 72%` over tinted surfaces (`src/styles/globals.css:712`). Keep this pair under review if font size drops. |

Contrast verdict: no immediate WCAG AA text contrast blocker found from token math. This was not a browser-rendered APCA audit.

## Motion

| Check | Status | Evidence |
|-------|--------|----------|
| Reduced motion honored | PASS | Global and route-level reduced-motion rules are present (`src/styles/globals.css:69`, `src/styles/globals.css:1076`). |
| Duration <= 400ms for UI motion | FAIL | `.ae-public-reveal` is 700ms (`src/styles/globals.css:1061`). |
| Hover gated to hover devices | FAIL | Hover transform rules are not wrapped in `(hover: hover) and (pointer: fine)` (`src/styles/globals.css:363`, `src/styles/globals.css:403`, `src/styles/globals.css:685`). |
| No scroll hijacking | PASS | No scroll-linked animation or custom scroll behavior was found in the landing files. |

## Touch Targets

| Check | Status | Evidence |
|-------|--------|----------|
| Primary CTAs >= 44px | PASS | Primary public button uses `min-height: 3.25rem` (`src/styles/globals.css:330`). |
| Text links >= 44px | PASS | Public text links use `min-height: 2.75rem` (`src/styles/globals.css:386`). |
| Nav targets >= 44px | PASS | Shared button sizes use `h-11` for default/sm/xs/icon variants (`src/components/ui/button.tsx:27`). |
| Mobile layout avoids cramped CTA row | PASS | CTA row stretches children full-width on narrow screens (`src/styles/globals.css:1179`). |

## A11y Verdict

Ship risk: medium. The page is keyboard-reachable and named well enough for basic navigation, but the signature answer record should not be semantically weaker than the secondary preview. Fix the `dl` semantics and section labelling before considering this polished.

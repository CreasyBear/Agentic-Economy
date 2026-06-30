# Public Surfaces Heuristic Report

Scope: `/` and `/q/*` (`AeChat`, `AeChatWelcome`, `AeQueryPanel`, `AeThreadTurnStreamSection`), `/$slug` (`AeProviderListingPage`), `/registry`, `AePublicShell`, `src/styles/answer/`.

Prior landing report (`heuristic-public-landing.md`) is **superseded** — home is chat-first, not `AePublicLanding`.

## Heuristic Scorecard

| Heuristic | Score | Finding | Impact |
|-----------|-------|---------|--------|
| Visibility of system status | 4 | Query submit disables the Ask button while streaming; reconnecting and error states are explicit in `AeThreadTurnStreamSection`. `AeGenerativeAnswer` owns per-block busy states. | minor-polish |
| Match system and real world | 5 | Welcome copy: "Ask for a local service. Get a cited answer." and "No booking, no payment." No insider vocabulary on human surfaces. | minor-polish |
| User control and freedom | 4 | Stop control during stream; back to Ask via nav and listing "Ask another"; URL share on `/q/*`. No modal traps. | minor-polish |
| Consistency and standards | 4 | Nav verbs stable: Ask, Browse services, Corrections, List/claim. Primary CTA is amber `landingPrimary` across query, listing, registry. | minor-polish |
| Error prevention | 4 | Empty query blocked on submit; inquiry/listing surfaces state when inquiry unavailable with reason, not a dead button. | minor-polish |
| Recognition over recall | 4 | Example queries on query box; registry search pre-fills from URL `q`. Footer duplicates nav for bottom-of-page users (fixed in shell). | minor-polish |
| Flexibility and efficiency | 4 | Example chips one-click submit; registry searchable; answer cards link to listing and inquiry. | minor-polish |
| Aesthetic and minimalist | 4 | Chat layout is editorial (hero illustration + query dock), not icon-card grid. Listing is citation ledger, not capability badge wall. | minor-polish |
| Error recovery | 3 | Stream errors offer registry browse link but no one-click retry of the same query on-page. | adds-friction |
| Help and documentation | 4 | `/llms.txt` linked from welcome and footer; agent JSON affordance on answers and listings. | minor-polish |

## Design Law Audit

| Law | Pass/Fail | Detail |
|-----|-----------|--------|
| Fitts's Law | PASS | Nav and Ask buttons ≥ 2.75rem; query submit and listing primary CTA full-width on narrow viewports. |
| Hick's Law | PASS | Public nav: 4 items with one primary (Ask). Query box: one field + one submit + optional examples. |
| Doherty Threshold | PASS | Streaming shows thinking caret immediately; reconnecting label under 400ms backoff. |
| Cleveland-McGill | PASS | Map artifact is geographic, not chart-encoded quantities. |
| Miller's Law | PASS | Listing sections chunked (services, area, hours, about, not offered, provenance). |
| Tesler's Law | PASS | Trust/epistemic complexity lives in JSON API and owner surfaces, not public labels. |

## Top findings (ranked by impact)

1. Error recovery (score 3, adds-friction) — add same-query retry on stream error/stopped without retyping.
2. Visibility of system status (score 4, minor-polish) — optional skeleton min-height on answer region to reduce CLS while artifacts load.
3. Consistency (score 4, minor-polish) — registry empty state could echo chat welcome boundary copy ("not a booking tool").

## UsabilityScore

**88 / B** (judged) · heuristic base 88 − law penalty 0

| Component | Value |
|-----------|-------|
| Nielsen mean (1–5) | 4.1 |
| Heuristic base (0–100) | 88 |
| Failed design laws | 0 |
| Law penalty | 0 |
| **UsabilityScore** | **88 / B** |

Improvement vs prior landing report (70/C): chat-first copy, footer sitemap, and removal of epistemic labels on human surfaces.

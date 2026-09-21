# Platform design package

**Status:** wave 2 mapped. All eight registers are on disk. This package does not authorise implementation.  
**Date:** 2026-09-21  
**Authority:** PRODUCT.md journeys 1–6; CONTEXT.md vocabulary; live-page coverage in [`buyer-ia-coverage.md`](./buyer-ia-coverage.md)  
**Ideal target:** [`2026-09-21-ideal-app.md`](../designs/2026-09-21-ideal-app.md) — dests and screens derived from jobs. This file remains the current-state map.  
**Buyer check:** [`buyer-journey-baseline.md`](./buyer-journey-baseline.md). **How we assign:** [`ux-coverage-protocol.md`](./ux-coverage-protocol.md) (SEE → NAME → REACH → HOLD → SEND, then AGREE/CARRY). Journey proof only: [`buyer-journey-protocol.md`](./buyer-journey-protocol.md). **Board:** [`platform-experience-register.md`](./platform-experience-register.md).  
**Full walk (21 Sep, unsigned):** [`ux-full-walk-2026-09-21/INDEX.md`](./ux-full-walk-2026-09-21/INDEX.md).  
**Chrome later:** [`ia-rationalisation-protocol.md`](./ia-rationalisation-protocol.md) is PARKED until those seven buyer pages pass.

Design the platform around the decisions people need to make and the outcomes they need to reach. Derive navigation, routes, and screens from those journeys. Do not start from `/owner/*` path names.

Grades used in every register:

| Grade | Meaning |
| --- | --- |
| `CHARTER` | PRODUCT.md / CONTEXT.md require it; source may not |
| `IMPLEMENTED` | Current source and tests establish it |
| `PARTIAL` | Source exists; journey or states incomplete |
| `SEEN` | Live product page this session |
| `OPEN` | Not decided; do not implement from interpolation |
| `DOCS` | First-party docs named it; not walked on the product |

The withdrawn Search / Keys / Trips dest law is not used here.

## Package (keep connected)

| Part | Register | Job |
| --- | --- | --- |
| 1. Jobs | [`platform-job-map.md`](./platform-job-map.md) | Circumstance → progress → outcome → anxiety |
| 2. Journeys | [`platform-journey-blueprint.md`](./platform-journey-blueprint.md) | Need → … → return, including after payment |
| 3. Objects & states | [`platform-object-states.md`](./platform-object-states.md) | What users must understand; payment ≠ delivery ≠ purchase resolution |
| 4. Destinations & routes | [`platform-nav-route-map.md`](./platform-nav-route-map.md) | Stable dests derived from jobs; current path is evidence, not the dest name |
| 5. Screen specs | [`platform-screen-specs.md`](./platform-screen-specs.md) | User → job → decision → actions → state → recovery |
| 6. Friction | [`platform-friction-register.md`](./platform-friction-register.md) | Hostility → design response, costed |
| 7. Ergonomics | [`platform-ergonomics-register.md`](./platform-ergonomics-register.md) | Acceptance criteria, not polish |
| 8. Validation | [`platform-validation-register.md`](./platform-validation-register.md) | Complete tasks both sides |

Live-page dest evidence stays in `buyer-ia-coverage.md`. Human route census stays there §7. This package does not replace those; it asks *why* a dest exists.

## Vocabulary (do not Airbnb-rename objects)

Customer, Agent, Account, Spending policy, Tool, Tool version, Quote, Call, Purchase resolution, Provider, Seller, payment recipient, Charge, Provider obligation, Payout, Publication, Listing, Source. Definitions: `CONTEXT.md`.

## Wave 1 questions each register must answer

- What decision does this serve?
- What outcome proves it worked?
- What is CHARTER vs IMPLEMENTED?
- What must not be collapsed (funding ≠ authority ≠ purchase ≠ delivery ≠ resolution)?

## Wave 2 questions each register must answer

- What information does the screen need for the decision, and which states are missing?
- Which hostility is a specific cost, and what is the design response?
- Which ergonomic criteria are acceptance, not polish, and who already owns them?
- Which complete tasks on both sides have evidence, and which are still OPEN walks?

## Inventory (this mapping)

| Part | Count | Notes |
| --- | --- | --- |
| 1. Jobs | 16 (`J-B01`–`J-S02`) | No `J-P` for Get paid — VAL-08 uses the journey-blueprint stage |
| 2. Journey stages | Buyer 8 + Provider 7 + journey 5 | After-payment stages are PARTIAL/CHARTER |
| 3. Objects | 28 | 11 OPEN machines (reserved credit, comparison record, resolution row, …) |
| 4. Destinations | KEEP Market / Agents / Calls; Credit rail; Supply demote | `/owner/market` and Overview **FOLD**; My tools **DEMOTE** |
| 5. Screens | 23 specified | J-B04 has no screen; listing has no Quote/Call |
| 6. Friction | 4 P1 + 9 P2 | Guest browse and same-Call recovery are strengths |
| 7. Ergonomics | 16 findings | Weakest keyboard: Market, Shared account, Calls |
| 8. Validation | 8 tasks | All have contract tests; all OPEN human walks |

## Connected findings (do not implement twice)

The same decision failures appear in more than one register. Use the existing owner.

| Gap | Jobs / dests | Objects | Screens | Friction | Ergonomics | Validation | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Card opens unavailable detail | J-B01, J-B02 · `RES-TOOL` | Directory import ≠ Tool | Listing inspect states | **FR-01** = EX-01 | ERG-10 | VAL-01 | EX-01 / JI |
| Chat invents a purchasing principal | J-B03, J-A01 · `RES-ASK-THREAD` | Quote/Call caller-bound | Ask thread | **FR-03** = EX-04 | ERG-15 | VAL-01, VAL-02 | JI-04b |
| Indexed directory dressed as callable | J-B01, J-P01 · Market + listing | Tool vs Listing trap | No purchase machine on listing | **FR-04**, FR-07 | — | VAL-01 | PRODUCT x402 clarification |
| ABN asked, not saved | J-P01 · Supply | Publication ≠ profile save | Wizard vs workspace | **FR-02** = EX-02, FR-13 | ERG-14 | VAL-04 | W-30 |
| No human dest for no-fit / withdraw | J-B04 · Market S6 | Service request `not_found` collapse | **No screen** | **FR-11** | — | VAL-06 | JI-08a |
| Compare tray evaporates | J-B02 · Market | No stored comparison record | Compare memory gap | **FR-05**, FR-06 | — | VAL-01 | JI-04b / DS |
| Available credit hides reserved | J-B06 · Credit | Prepaid reserved OPEN | Credit card | FR-08 (dest mix) | ERG-09 | VAL-05, VAL-07 | W-20 |
| Listing has no Quote/Call | J-B03 · `RES-TOOL` | Quote ≠ catalog price | No commit states | FR-07 | ERG-10 | VAL-01, VAL-02 | JI-04b; listing walk OPEN |
| Purchase resolution often presentation-only | J-B07, J-B08 · `RES-CALL` | Materializer can no-op | Purpose unrecorded | — | — | VAL-02, VAL-03 | capability-execution; CHARTER AU record |
| Provider earnings ≠ Payout | J-P02 / Get paid · Supply | Obligation ≠ Payout | Workspace summary | — | — | VAL-08 | money / W payout |
| Unwired dest skeletons / sub-44px controls | Cross-dest | — | Credit / listing / Add Tool | — | ERG-01–ERG-06, ERG-09 | EX-03 | Existing DS / W owners |

## What this package does not do

- It does not rename chrome or reopen Search / Keys / Trips.
- It does not add a Jev release gate for journeys 5–6.
- It does not authorise source changes. Implementation stays with EX / JI / W / DS owners after a signed-in walk of AE header and listing (`buyer-ia-coverage.md` §9).

## Sequencing (from friction; design only)

1. Truthful inspect (FR-01 / EX-01).
2. Existing authorised Agent, not a chat principal (FR-03 / EX-04).
3. Callable vs indexed, then listed price vs Quote (FR-04, FR-07).
4. Keep comparison out of memory (FR-05, FR-06).
5. Store Provider facts you ask for (FR-02 / EX-02), then relax premature payout (FR-13).
6. Keep funding and authority on their dests (FR-08).
7. Recovery stays on `callRef` (FR-10). Gap withdraw (FR-11) waits on JI-08.

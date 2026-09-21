# Platform design package

**Status:** wave 1 stopped. Jobs, journeys, and dests are on disk. Object-states was not written. Wave 2 (screens, friction, ergonomics, validation) was not started.  
**Date:** 2026-09-21  
**Authority:** PRODUCT.md journeys 1–6; CONTEXT.md vocabulary; live-page coverage in [`buyer-ia-coverage.md`](./buyer-ia-coverage.md)

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
| 5. Screen specs | wave 2 | User → job → decision → actions → state → recovery |
| 6. Friction | wave 2 | Hostility → design response, costed |
| 7. Ergonomics | wave 2 | Acceptance criteria, not polish |
| 8. Validation | wave 2 | Complete tasks both sides |

Live-page dest evidence stays in `buyer-ia-coverage.md`. Human route census stays there §7. This package does not replace those; it asks *why* a dest exists.

## Vocabulary (do not Airbnb-rename objects)

Customer, Agent, Account, Spending policy, Tool, Tool version, Quote, Call, Purchase resolution, Provider, Seller, payment recipient, Charge, Provider obligation, Payout, Publication, Listing, Source. Definitions: `CONTEXT.md`.

## Wave 1 questions each register must answer

- What decision does this serve?
- What outcome proves it worked?
- What is CHARTER vs IMPLEMENTED?
- What must not be collapsed (funding ≠ authority ≠ purchase ≠ delivery ≠ resolution)?

# Phase 4 source and data map

This map separates current source truth from D-011 target design. Classification means: **exists/reuse**, **bounded extension**, **new source owner/read model**, **projection only**, or **retire/redirect**.

## Current-to-target source-gap map

| Customer fact or view | Current inspected source | Classification | Target owner / WP |
|---|---|---|---|
| Business identity and public profile | `src/modules/business/**`, `convex/business.ts` | exists/reuse, with bounded authorization migration where required | business owner; WP3 composes its customer view |
| Public listing and service discovery facts | `src/modules/catalog/**`, `convex/catalog.ts` | exists/reuse and bounded extension | catalog/business owners; WP3 |
| Capability contract | `src/modules/capability-contract-registry/**` | exists/reuse | capability-contract owner; WP3/WP4 consume references |
| Offering, binding, publication, eligibility and readiness | `src/modules/capability-supply/**`, `convex/capabilitySupply*.ts` | exists/reuse and bounded extension | capability-supply owner; WP3/WP4 |
| Inquiry messages and conversation state | `src/modules/inquiries/**` | exists/reuse and bounded extension for account scope/linking | inquiry owner; WP8 |
| Work action, attempt, uncertainty and result truth | registered action / Action Invocation and operation-owned result modules | exists/reuse and bounded extension for account-scoped reads | action and operation result owners; WP7 |
| Paid digital information facts | paid-operation source owner | exists/reuse | operation owner; never generalized into shared payment truth |
| Membership, invitations, additive responsibility grants and protected Ownership | current `owners` compatibility record is insufficient | new source owner/read model | Business Account; WP1 |
| Business relationship, customer-visible support, commercial references/export and closure | no complete owner | new source owner/read model | Business Account; WP2 |
| Domain-owned availability | domain facts vary; no narrow shared account projection | new source owner plus projection | each domain owns facts; WP3 owns only the shared discriminated projection |
| Integration-to-offering relationship and account connection check | capability-supply facts exist but the account relation/read model is incomplete | bounded extension | capability-supply/integration owner; WP4 |
| Home status, attention and next action | no complete bounded account read model | projection only | removable Business Account projection; WP5 |
| Work list and evidence history | source facts exist; account projection incomplete | projection only | removable indexed projection referencing action/result owners; WP5/WP7 |
| Offerings list and service detail | source facts exist; account projection incomplete | proposed projection only | removable projection over business/catalog/supply owners; WP3/WP10 |
| Integrations list/detail | source facts exist; account projection incomplete | proposed projection only | removable projection over integration/supply owners; WP4/WP10 |
| Portfolio/switcher and founder account summary | no complete bounded read model | new read model / projection only | Business Account relationship projections; WP5/WP11 |
| Team, settings and Help views | source owners above are incomplete | new read models composed from WP1/WP2 | WP9 |
| `/owner/**` destinations | compatibility routes | retire/redirect | WP6 redirects to `/businesses/:businessId/**` or account switcher |
| Three-quote and quote-to-close programme | earlier planning proposal only | retire from active Phase 4 authority | preserve as historical/future research, not D-011 source work |

## WP1–WP12 ownership

| WP | Source-owned outcome |
|---|---|
| WP1 | Business Account identity relationship seam, membership, invitation, responsibility grants and protected Ownership |
| WP2 | Relationship lifecycle, customer-visible support, commercial references/export and closure; preserves WP1 public exports |
| WP3 | Profile/services composition and a discriminated, domain-owned availability projection across three domain shapes |
| WP4 | Many-to-many integrations relation, credential-safe connection status and bounded diagnostics |
| WP5 | Removable bounded Home, Work and portfolio projections with one attention computation |
| WP6 | Canonical shell, current-business context and `/owner/**` redirects |
| WP7 | Work list/detail over source-owned action, attempt, uncertainty and result truth |
| WP8 | Inbox/conversation over inquiry truth with explicit, reconstructable Work links |
| WP9 | Team/access, security, notifications, commercial references/export, Help and closure UI |
| WP10 | Offerings and canonical Business settings/Integrations UI with contextual many-to-many links |
| WP11 | Founder/customer-success account detail without impersonation or source rewriting |
| WP12 | Integrated comprehension, accessibility-contract, responsive and horizontal acceptance evidence |

## Projection and query rules

- Business and operation facts remain with their current source owners; projections store references, summaries, observed time and currentness only.
- Deleting and rebuilding a projection cannot delete or change canonical business, inquiry, action, result, catalog, publication, readiness or integration facts.
- Home owns the single `needs attention` computation. Work owns operational counts; Inbox owns unread conversation counts. A linked conversation/work pair contributes once to Home.
- Every growing list is account-scoped, indexed, paginated or cap-plus-one bounded. WP5 proves unrelated 1,000/10,000-record growth does not change one-page query counts.
- Stale or incomplete source evidence produces partial/stale/uncertain UI state and a safe refresh, inspect, or reconcile continuation; it never becomes success.
- Availability shares only discriminants and customer-safe summaries. Appointment slots, dispatch coverage/capacity, and digital delivery windows remain domain-owned.
- Integrations and Offerings are many-to-many. Neither owns or embeds the other's canonical records.
- Public inputs never select the owner/principal. URL knowledge, projection membership or source reference possession is not authority.

## Current liabilities to preserve as liabilities

Current owner routes are Status/Inquiries/Settings-shaped and incomplete; membership is singular/compatibility-shaped; some catalog, inquiry and supply reads require bounded account-scoped extensions; and credential/readiness custody remains technical source truth rather than customer navigation. These are implementation gaps, not authority to weaken the accepted target.

This source map makes no claim that the target owners, queries, routes or views are implemented.

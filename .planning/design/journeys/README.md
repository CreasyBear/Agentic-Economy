# Journey Register

Journeys are the management unit. Pages are delivery surfaces that serve journeys; completing a page does not ship a journey. A journey ships only when its end-to-end ship test and blind-persona re-run gate clear.

## Journeys ↔ pages matrix

Source: `../JOURNEYS-TO-BUILD.md` §1 and the 16-spec inventory in `../README.md`. “Flagged” means the page is not assigned to a named J1–J7 build journey and needs an explicit management decision before work on it is treated as journey progress.

| Page spec | Journey(s) served | Why / view served |
|---|---|---|
| `pages/home.md` | J2 | Ask, durable-thread entry, urgent routing, R0 start |
| `pages/thread.md` | J2, J5 | Decision aid, shortlist/export, sequential episodes and comparison entry |
| `pages/private-record.md` | J3, J4, J5 | Sent record, reply loop, export, comparison evidence |
| `pages/activity.md` | J2, J4 | Resume decision work; record handles and needs-attention re-entry |
| `pages/registry.md` | J1, J2, J3 | Cold browse, early posture facts, listing/review entry |
| `pages/listing.md` | J1, J2, J3 | Cold trust facts, direct call, decision evidence, request entry |
| `pages/confirm-and-send.md` | J3, J5 | One governed review; carried-brief diff for later sequential sends |
| `pages/compare.md` | J5 | Read-only comparison of at least two attributable replies |
| `pages/owner-inbox.md` | J4, J6 | Owner re-entry, triage, dispositions, clarification and reply |
| `pages/owner-status.md` | J6 | Explainable readiness and `R1TargetAdmitted` posture |
| `pages/owner-settings.md` | J4, J6 | Notification channel, cessation, destination and suppression posture |
| `pages/admin-runs.md` | **Flagged — no named journey** | Operator evidence workspace is outside the J1–J7 page lists |
| `pages/admin-readback.md` | **Flagged — no named journey** | Operator readback is outside the J1–J7 page lists |
| `pages/trust-pages.md` | **Flagged — no named journey** | Supporting editorial surface; no J1–J7 ship test names it |
| `pages/claim.md` | J6 | Claim, publish, verify destination, activate request receipt |
| `pages/for-agents.md` | J7 | Machine discovery and v1 API entry |

## Register format

Every `J*.md` register has exactly these management sections:

1. **Identity** — ID, canonical name, and one-line customer story.
2. **Status** — current status with evidence, not aspiration.
3. **Persona proof** — named blind critic and the exact walkout the journey must repair or preserve.
4. **Ship test** — the canonical test made observable and checkable.
5. **Pages & views** — every serving page and the sections/views that carry the journey.
6. **Stage map** — exercised `JOURNEY.md` stages.
7. **Kernel dependencies** — required K-refs from `JOURNEYS-TO-BUILD.md` §3.
8. **Open items** — relevant G/CS refs and their explicit state.
9. **Hedge & common-sense checklist** — facts-before-hedges and obvious-transition review, including named failures.
10. **Re-run gate** — the blind-persona simulation required before the journey is called shipped.

## Status vocabulary

- **designed** — the end-to-end contract and serving views are specified; implementation is not asserted.
- **building** — implementation is in progress, but the journey ship test has not cleared.
- **shipped** — the concrete ship test passes end to end in the product.
- **persona-cleared** — after shipping, the named blind-persona re-simulation clears the prior walkout point. This is additive to `shipped`, not a substitute for it.

## Change rule

Update a journey register whenever any page, contract, or ship test used by that journey changes. The change must update the affected page/view mapping, stage/K-ref dependencies, open-item status, ship test, and re-run gate together so page delivery cannot silently masquerade as journey delivery.

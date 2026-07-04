# Phase 01 Internal Alpha Readiness Evidence

**Status:** not alpha-ready; deferred as execution debt.
**Reason:** five friendly-owner evidence rows do not exist. `01-ALPHA-EVIDENCE.md` records 0 of 5 real owner rows. User explicitly accepted this as non-blocking for Phase 2-5 execution on 2026-06-28.

## Gate Decision

Phase 1 can be used for local founder-assisted rehearsal, technical deploy readback, and Phase 2-5 execution. It must not be called internal-alpha ready, launch-ready, or public-ready until real owner evidence exists.

Deferred owner-evidence debt as of 2026-06-28T15:26:38Z:

1. Fewer than five friendly-owner attempts have been recorded.
2. No live channel-attribution rows exist for real owners.
3. No real owner share/interest evidence exists.
4. No real owner friction/failure notes exist.
5. The external Standards/Spec review is executed; its remaining Spec finding is this same five-owner evidence gap.

Technical evidence that is now green:

- Local non-browser suite passed.
- Local browser suite passed with command-scoped Clerk bypass.
- Convex codegen passed against `loyal-peacock-107`.
- Live deploy smoke passed against Vercel/Convex/Clerk storage states.

## Required Alpha Evidence Shape

Each friendly-owner row must include these fields before the internal founder-assisted alpha gate can pass:

| Field | Required evidence |
|---|---|
| Owner attempt | Pseudonymous owner label, source/channel, timestamp, and support owner |
| Activation row | Query result containing `businessId`, `stage`, `publishSeen`, `statusSeen`, `capabilityHealthSeen`, `sharedOrInterestSubmitted`, `attributionRecorded`, `lastEventAt` |
| Share or interest | `share_url_copied` or `owner_interest_submitted` evidence with consent flag where follow-up is allowed |
| Friction/failure | `frictionCode` and/or `failureCode` when blocked, or explicit `none_observed` after successful activation |
| No-P0 evidence | Local/deployed gates for claim, publish, index, security, copy, and discovery have no unresolved P0 issue |
| Claims register link | Public copy claim maps to route/API/discovery/SEO/GTM evidence and passes copy scan |

## Current Row Inventory

| Attempt | Evidence status | Activation row | Share/interest | Friction/failure | No-P0 evidence | Decision |
|---:|---|---|---|---|---|---|
| 1 | Not attempted. | Missing. | Missing. | Missing. | Technical gates green; no owner row. | Not alpha-ready. |
| 2 | Not attempted. | Missing. | Missing. | Missing. | Technical gates green; no owner row. | Not alpha-ready. |
| 3 | Not attempted. | Missing. | Missing. | Missing. | Technical gates green; no owner row. | Not alpha-ready. |
| 4 | Not attempted. | Missing. | Missing. | Missing. | Technical gates green; no owner row. | Not alpha-ready. |
| 5 | Not attempted. | Missing. | Missing. | Missing. | Technical gates green; no owner row. | Not alpha-ready. |

## Existing Instrumentation

- `src/modules/observability/public.ts` exports `OwnerActivationState`, `OwnerActivationReadback`, `initialOwnerActivationState`, `applyFunnelEvent`, and `buildOwnerActivationReadback`.
- `src/modules/observability/internal/funnel.ts` records publish, status readback, capability health, share/interest, attribution, friction, and failure fields.
- `src/modules/observability/internal/schema.ts` stores `frictionCode` and `failureCode` on `ownerActivationState`.
- `tests/unit/observability/funnel.test.ts` proves activated and blocked journeys.

This proves the row shape can be computed locally. It does not prove five real owner attempts happened.

## Claims Register Links

Evidence currently covered by tests:

- Route copy and component copy: `tests/copy/claims-register.test.ts`
- SEO/AEO output: `tests/seo/public-business-seo.test.ts`, `tests/seo/discovery-files.test.ts`
- API/discovery output: `tests/integration/registry-api.test.ts`, `tests/integration/discovery-routes.test.ts`, `tests/integration/discovery-route-parity.test.ts`
- GTM readiness copy: `.planning/GTM-READINESS.md`, asserted by `tests/copy/claims-register.test.ts`
- Optional product-marketing draft, if present: `.agents/product-marketing.md`, asserted as non-public draft by `tests/copy/claims-register.test.ts`

## Later Evidence Needed

1. Recruit five friendly owners through founder outreach only.
2. For each owner, collect activation readback, share/interest event, friction/failure note, source/channel attribution, and support-owner signoff.
3. Keep broad launch, paid ads, developer launch, and protocol launch blocked until the GTM stage evidence is actually green.

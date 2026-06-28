# Phase 01 Internal Alpha Readiness Evidence

**Status:** not alpha-ready.  
**Reason:** five friendly-owner evidence rows do not exist. This artifact records the current evidence shape and the missing proof without editing the already-dirty top-level GTM file.

## Gate Decision

Phase 1 can be used for local founder-assisted rehearsal, but it must not be called internal-alpha ready, launch-ready, or public-ready yet.

Blocking evidence gaps:

1. Fewer than five friendly-owner attempts have been recorded.
2. Real Clerk session/auth and Convex codegen evidence are blocked by missing real Clerk issuer configuration and explicit network approval.
3. Deployment/readback smoke for Vercel/Convex/Clerk and public HTTP headers is still Plan 01-09 work.
4. No live channel-attribution rows exist for real owners.

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

## Current Activation Query Evidence

Implemented query/readback surface:

- `src/modules/observability/public.ts` exports `OwnerActivationState`, `OwnerActivationReadback`, `initialOwnerActivationState`, `applyFunnelEvent`, and `buildOwnerActivationReadback`.
- `src/modules/observability/internal/funnel.ts` records publish, status readback, capability health, share/interest, attribution, friction, and failure fields.
- `src/modules/observability/internal/schema.ts` stores `frictionCode` and `failureCode` on `ownerActivationState`.
- `tests/unit/observability/funnel.test.ts` proves:
  - activation requires `visitor_attributed`, `publish_succeeded`, `owner_status_viewed`, `capability_status_viewed`, and `share_url_copied`;
  - blocked journeys preserve `slug_conflict` and `publish_failed` readbacks.

Representative query call for rehearsal evidence:

```ts
const readback = buildOwnerActivationReadback(
  events.reduce(
    (state, event) => applyFunnelEvent(state, event),
    initialOwnerActivationState(businessId, startedAt)
  )
)
```

## Friendly-Owner Evidence Attempts

| Attempt | Evidence status | Activation row | Share/interest | Friction/failure | No-P0 evidence | Decision |
|---:|---|---|---|---|---|---|
| 1 | Local Sam route rehearsal only; not a real friendly owner. | Instrumentation path exists; no durable real-owner row. | Not collected from a real owner. | Local blocked-path unit test exists; no real friction note. | Local gates are being run in Plan 01-08; Convex codegen and deployment smoke are not green. | Not alpha-ready. |
| 2 | Not attempted. | Missing. | Missing. | Missing. | Missing. | Not alpha-ready. |
| 3 | Not attempted. | Missing. | Missing. | Missing. | Missing. | Not alpha-ready. |
| 4 | Not attempted. | Missing. | Missing. | Missing. | Missing. | Not alpha-ready. |
| 5 | Not attempted. | Missing. | Missing. | Missing. | Missing. | Not alpha-ready. |

## Local Rehearsal Evidence

Local Sam rehearsal coverage exists but is not a substitute for owner evidence:

- `tests/e2e/public-owner-ui.spec.ts` covers claim, success, public page, registry search, and route states under local route rendering.
- `tests/e2e/a11y/public-owner-a11y.spec.ts` covers skip-link and claim-form keyboard/focus behavior.
- `tests/copy/claims-register.test.ts` traces route/API/discovery/SEO output claims to source-owned states and asserts GTM readiness copy stays evidence-gated.
- `tests/imports/source-mining.test.ts` maps Phase 1 mined invariants to public seams and executable tests.
- `.planning/phases/01-ten-star-spine-foundation/01-FABLE-CLOSEOUT.md` maps accepted Fable findings to implementation evidence and residual risk.
- `.planning/phases/01-ten-star-spine-foundation/01-MATT-REVIEW-CONTEXT.md` keeps Standards and Spec review axes separate.

Local browser proof uses local-only environment variables and does not write fake Clerk keys to `.env.local`:

```bash
VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E=true \
VITE_CLERK_PUBLISHABLE_KEY=pk_test_Y2xlcmsuZXhhbXBsZS5jb20k \
CLERK_SECRET_KEY=sk_test_placeholder \
npm run test:e2e
```

The same local-only Clerk bypass applies to `npm run test:a11y`.

## Claims Register Links

Evidence currently covered by tests:

- Route copy and component copy: `tests/copy/claims-register.test.ts`
- SEO/AEO output: `tests/seo/public-business-seo.test.ts`, `tests/seo/discovery-files.test.ts`
- API/discovery output: `tests/integration/registry-api.test.ts`, `tests/integration/discovery-routes.test.ts`, `tests/integration/discovery-route-parity.test.ts`
- GTM readiness copy: `.planning/GTM-READINESS.md`, asserted by `tests/copy/claims-register.test.ts`
- Optional product-marketing draft, if present: `.agents/product-marketing.md`, asserted as non-public draft by `tests/copy/claims-register.test.ts`

## No-P0 Evidence Status

| Area | Current evidence | Status |
|---|---|---|
| Claim/publish/security | Unit and integration tests cover CSRF, rate limit, wrong-owner, duplicate, no-ABN publish, idempotency, and suppression. | Local evidence present. |
| Public routes/e2e | Local Playwright route rendering passes with local-only Clerk bypass. | Local evidence present; real Clerk proof missing. |
| Registry/API/discovery | Unit, integration, SEO, copy, and route parity tests pass locally. | Local evidence present. |
| Copy/GTM claims | Claims register tests cover route/API/discovery/SEO/GTM and optional product-marketing draft. | Local evidence present. |
| Convex codegen | `npm run check:convex-codegen` is a real command but currently blocked by missing Clerk issuer and network/telemetry approval. | Not green. |
| Deploy/readback smoke | Not in Plan 01-08 scope; expected in Plan 01-09. | Missing. |
| Five-owner activation | No real owner rows exist. | Missing. |

## Next Evidence Needed

1. Configure real Clerk issuer and obtain explicit approval for networked Convex CLI/codegen verification.
2. Run deployed Vercel/Convex/Clerk smoke in Plan 01-09.
3. Recruit five friendly owners through founder outreach only.
4. For each owner, collect activation readback, share/interest event, friction/failure note, source/channel attribution, and support-owner signoff.
5. Keep broad launch, paid ads, developer launch, and protocol launch blocked until the GTM stage evidence is actually green.

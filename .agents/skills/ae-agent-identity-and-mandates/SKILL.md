---
name: ae-agent-identity-and-mandates
description: "Trace or change AE caller identity and bounded authority. Use when working on external-agent authentication, Customer Request agent keys, service assertions, preparation authority, Approval Grants, RouteMandates, per-step grants, or action/invocation authority."
---

# AE agent identity and mandates

The invariant is:

> Identity attributes a caller. Authority permits one bounded consequence.

Never treat a verified signature, API key, authenticated session, action
reference, invocation reference, Request ownership, model output, or prior
approval as authority for a different action.

## 1. Locate the live authority path

Read `AGENTS.md`, `PRODUCT.md`, and the relevant terms in
`UBIQUITOUS_LANGUAGE.md`. Then trace the exact operation:

1. Find its public route or host and authentication check.
2. Follow it through `src/lib/server/customer-request-*-api.ts` or the current
   server adapter into `src/modules/customer-request/application/**`.
3. Locate the authority object and the final enforcement point immediately
   before protected-data or provider release.
4. Find the focused tests for issuance, expiry, mismatch, replay, and refusal.

Do not start from retired architecture. `src/modules/clearance/**`,
`convex/clearance.ts`, the old agent-door authority files, and executable
`handshake-protocol-kernel` imports are retired. Their absence is enforced by
`tests/imports/routing-authority-retirement.test.ts`.

Completion: caller identity, principal, authority object, authority scope,
enforcement point, and refusal path are identified from live source.

## 2. Keep identity and authority separate

Current identity mechanisms have distinct scopes:

- `src/modules/customer-request/agent-access.ts` issues and revokes scoped
  Customer Request agent API keys for the authenticated owner.
- `src/modules/customer-request/service-auth-envelope.ts` authenticates
  short-lived internal service commands; it is not customer approval.
- `src/modules/routing-kernel/caller-identity.ts` contains Web Bot Auth
  verification code, but the public V1 routing runtime is retired. Treat this
  as dormant/reference code unless a live ingress trace proves otherwise.

Authentication failure, ownership failure, and authority failure remain
different typed outcomes. Expand a refusal taxonomy when a materially new
reason exists; do not collapse it to a boolean or generic exception.

## 3. Use the authority object that matches the consequence

Current Customer Request authority includes:

- **Preparation Authority** for bounded disclosure during option preparation;
- **Approval Grant** for the legacy exact Prepared Action;
- **RouteMandate** for one exact selected RoutePlan and its material limits;
- **RouteStepGrant** attenuated from a RouteMandate for one exact step;
- standing repeat permission only within its declared low-risk scope.

Inspect the live definitions before changing them:

- `src/modules/customer-request/preparation-authority.ts`
- `src/modules/customer-request/route-mandate.ts`
- `src/modules/customer-request/route-mandate-admission.ts`
- `src/modules/customer-request/application/authorize-preparation/`
- `src/modules/customer-request/application/standing-route/`

Authority is independently authenticated, expiring, principal-bound, and
materially scoped. Derive provider, action, cost, data, effect, evidence, and
recovery limits from the current authoritative proposal; do not accept those
limits again from the caller at execution time.

Completion: a changed material input, route, generation, recipient, purpose,
effect, spend limit, or expiry cannot reuse the prior authority.

## 4. Extend authority to Action Invocation without weakening it

ADR-009/010 evaluate Action Invocation as the shared control identity for one
registered action/version. Action Invocation is not an authority token.

For a consequential invocation, authority must bind:

- invocation reference and version;
- registered action and immutable action-contract version;
- prepared-input digest and material provenance;
- principal, target, consequence, data and spend limits;
- expiry and invalidation conditions.

Request-owned and standalone callers must reach the same enforcement rule.
Preserve existing Request-owned records and adapt them; do not make historical
lineage broadly optional. A completed standalone result may be referenced by a
Request, but its authority is not inherited and its effect is not repeated.

## 5. Preserve retry, uncertainty, and concurrency semantics

Authority does not make retry safe. The registered action declares whether work
is replayable, attributable-retry, or reconcile-before-retry.

- Keep every provider release attributable to an attempt and generation.
- Bind idempotency to the exact operation payload.
- Use compare-and-swap, leases, and generation fences where concurrent workers
  can act.
- After an uncertain external effect, reconcile before a new effect attempt.
- A stale worker may contribute attributable evidence but cannot overwrite the
  current generation.
- Cancellation after release reports what is known; it does not claim reversal.

Completion: focused scenarios prove cross-principal refusal, stale-authority
invalidation, idempotency conflict, interruption before and after release, and
safe continuation.

## 6. Close the loop

Implement through the current source owner. Run the narrow authority tests plus
`npm run test:imports` when retirement or module boundaries are touched, and
`npm run typecheck` for contract changes. Use labelled mock/sandbox principals
and effects so the decision state is inspectable.

Tests are feedback, not a reason to pause implementation for unrelated suite
cleanup. Report evidence as local/dev unless the intended production surface
was actually exercised. Return working source and an executable authority
scenario, or the earliest reproducible failed enforcement transition.

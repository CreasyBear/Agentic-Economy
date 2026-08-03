# T51 — Hosted parity release proof

Labels: `wayfinder:task`, `tdd:red`, `hosted-evidence`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source tickets: T27, T37.
Status: framework cutover and T51 harness are merged on `main` through `3706b4a4c0933c236faa83d223daeaf136ffc8f7`; the workflow fails closed instead of skipping hosted proof. GitHub Actions run `30780955431` passed the complete credential-free source job, exact-revision Vercel deploy, and production Convex schema/function deploy after the compatibility widening. The acceptance seed then correctly refused reuse of an immutable sandbox Offering identity whose registered content predates the current source. Sandbox option Offering/binding identities are now rotated, the exact prior owner-scoped bindings are retired through the governed eligibility command, provider version routing and hosted readiness refs are advanced, and migration replay is executable. Local focused integration tests (54), typecheck, lint, and the complete credential-free post-codegen source contract pass. No hosted parity claim is made until a new exact-SHA run passes the production lifecycle and T51 parity jobs and retains the sanitized packet.

Blocked by: T44, T47, T49, T50.

## Outcome

A cold person and cold authenticated agent use one real preview deployment/backend and prove the same WorkTree, refusal and receipt semantics at an exact commit.

## Public seam

Preview `/`, authenticated agent action/HTTP endpoint, public WorkTree readback. The proof may seed labelled supply only through its owning public/admin setup seam.

## Red

Current hosted smoke proves an older Customer Request lifecycle with stale selectors. It does not create/read WorkTree, exercise both hosts, test stale/unauthorized/replay behavior, or retain exact-SHA evidence.

## Minimal green

1. Deploy Vercel + Convex from the exact candidate SHA using scoped temporary credentials.
2. Seed a labelled BAS development cohort through source-owned admin/setup APIs; never write tables directly.
3. Drive a cold browser outcome → inbox → Lock receipt and reload readback.
4. Drive a cold external agent create/inspect/propose/decide and confirm human readback of the same result.
5. Exercise stale revision, conflicting replay and wrong-principal/authority refusals through public seams.
6. Capture sanitized JSON readback/receipts, Playwright trace/screenshots and release metadata; label evidence `hosted + development-mock`, not provider/customer proof.
7. Tear down temporary credentials and record deployment identifiers.

## TDD tracer

Implement as one hosted Playwright/API scenario with source-owned setup and public assertions. The first red run must fail at the first missing public seam, not be bypassed with fixture/table access.

## Adopted seams

Existing deploy-smoke Playwright harness, Vercel/Convex deployment workflow, registered action client and GitHub Actions artifacts. No second smoke framework.

## Acceptance

- Evidence names Git SHA, Vercel deployment and Convex deployment.
- Human → agent and agent → human parity both pass.
- Stale, replay-conflict and unauthorized attempts refuse without state change.
- Reload/readback works without transcript or warm session state.
- Artifacts contain no secret and make no provider fulfilment/customer-value claim.

## End condition

The exact cutover SHA has a retained hosted evidence packet proving shared source semantics; T53 may begin recruitment/external runs.

## Source evidence

`.github/workflows/kernel-release-gate.yml`; `tests/deploy-smoke`; WorkTree registered actions/readback from T45–T49; ADR-010.

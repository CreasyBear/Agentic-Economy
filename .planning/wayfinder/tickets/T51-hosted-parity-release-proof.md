# T51 — Hosted parity release proof

Labels: `wayfinder:task`, `tdd:red`, `hosted-evidence`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source tickets: T27, T37.
Status: framework cutover and T51 harness are merged on `main` through `b6cd0204b00879889f51ca78e1ce4eb896604b29`; the credential-free source contract passes locally, including 39 integration files / 259 tests, and the workflow now fails closed instead of skipping hosted proof. GitHub Actions run `30777998420` verified committed Convex codegen, then found two timezone-dependent assertions in `tests/unit/customer-request/customer-request-workspace.test.tsx` (local `Australia/Sydney` expected `8:00 am`; Ubuntu UTC rendered `12:00 am`) and skipped the hosted job. The assertions now preserve the user-visible cancellation-copy contract without fixing the viewer to the developer's timezone, and pass all 36 workspace tests under `TZ=UTC`. No hosted parity claim is made until a new exact-SHA run passes the production deploy/readback job and retains the sanitized T51 packet.

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

# T51 — Hosted parity release proof

Labels: `wayfinder:task`, `tdd:red`, `hosted-evidence`. Parent: [T43](T43-human-agent-framework-parity-spec.md). Source tickets: T27, T37.
Status: landed + verified at the source/local harness boundary — hosted parity config, credential, seed and evidence harness pieces are landed in `tools/release/work-tree-parity-release.ts`, `tools/release/work-tree-parity-credential.ts`, `tools/release/work-tree-parity-seed.ts` and `tools/release/work-tree-parity-evidence.ts`; local WorkTree smoke is green in `output/release/work-tree-smoke.json.log`; `.planning/research/2026-08-02-hosted-parity-attempt.md` records preview deployment `dpl_F83yP9wsudjvVqrLQjB6Z65iVbYp` Ready but protected by Vercel HTTP 401, expired `VERCEL_OIDC_TOKEN`, no hosted Convex credentials/ID, and Playwright hosted-spec discovery `No tests found` before the spec body; open: hosted `/api/v1/work-tree/setup` seam plus hosted Convex deployment/evidence run remain open, and no hosted parity claim is made.

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

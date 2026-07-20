# Phase 3C Plan 07E release-safety source closure

## Decision and outcome

This cut removes the duplicate-Vercel release hazard for the one Phase 3C
marker release while preserving the existing Customer Request production path
for ordinary main pushes. The marker is `[phase3c-hosted-trial]`.

The source transition is deliberately asymmetric. Vercel Git integration owns
creation of the Phase 3C production deployment. The GitHub workflow only
observes that deployment through GET requests, then deploys Convex once,
configures the already-owned Phase 3C admission record once, and records the
already-owned Convex deployment receipt. This cut does not run the hosted
lifecycle and does not create or use temporary Clerk credentials.

## Base and custody

- Required base commit: `8a6b5a2a249ac1d65c904059e96ed9df9a3237f4`
- Required base tree: `bf04631da01c1e87d07558b4c0af6b90a3257f3e`
- Parent branch: `codex/phase3c-execution`
- Parent custody manifest: `/tmp/ae-phase3c-parent-custody-8a6b5a2a.json`
- Raw manifest SHA-256:
  `7a5cbf67d1ed76f8fd80f3ce11b8a550c00792e3a198770c19e04eb2a23bcd49`
- Canonical manifest SHA-256:
  `7cc66c98404914459a5302a9a48a9c90856d9840ae8eb62fb1c33da132b1e17b`
- Entries-only stable SHA-256:
  `1591c52ecb943bab01aea9781ad55fd5a9dc6275eb202363d62b950ab9000fc1`
- Inherited entry count: `66`

The child began clean at the exact base. Parent custody verified before source
work and again after the first source transition. No parent entry changed.

## Named RED evidence

The TDD loop captured intended failures before implementation:

| Boundary | Command | Intended failure |
| --- | --- | --- |
| Marker workflow | `vitest run tests/unit/release/paid-operation-hosted-release.test.ts` | `AssertionError: [P3C_RED:phase3c_marker_absent]` with the other 27 tests green. |
| Read-only observer | `vitest run tests/unit/release/observe-vercel-git-source-deployment.test.ts` | Fourteen cases stopped at `[P3C_RED:vercel_observer_absent]`, before dynamic import. |
| Customer Request compatibility | Filtered `customer-request-source-completeness.test.ts` | `AssertionError: [P3C_RED:customer_request_marker_split_absent]`. |
| Closure inventory | Filtered `paid-operation-trial-residue.test.ts` | `[P3C_RED:closure_07e_artifact_absent]` for this summary; Git derived 96 paths before it existed. |
| Closure classification | Filtered `paid-operation-trial-residue.test.ts` after all files existed | `[P3C_RED:closure_artifact_unclassified]` named exactly five missing rows and zero extras before classification. |
| Build isolation | Filtered `paid-operation-hosted-release.test.ts` after the first scratch build | `[P3C_RED:phase3c_build_isolation_absent]` proved a direct CI build would dirty the checkout. |
| Evaluator secret binding | Filtered `paid-operation-hosted-release.test.ts` during parent audit correction | `[P3C_RED:phase3c_customer_request_evaluator_secret_absent]` exposed the nonexistent paid-operation secret binding before configuration. |
| Pre-attempt payment owner gate | Filtered `paid-operation-hosted-release.test.ts` during parent audit correction | `[P3C_RED:phase3c_release_owner_test_absent] tests/unit/action-invocation/paid-operation-application-service.test.ts`. |
| Temporary-credential owner gate | The same filtered test after the first gate repair | `[P3C_RED:phase3c_release_owner_test_absent] tests/unit/release/customer-request-production-credential.test.ts`. |

The pre-change Customer Request completeness file also had three unrelated
stale source-shape assertions plus its old workflow-order assertion. They are
baseline fixture drift, not evidence about this release transition. The
allowed test file is minimally re-grounded during final verification so the
focused gate can exercise its live source owners.

## Selected and rejected recovery paths

Selected: rely on the already-enabled Vercel Git integration, poll
`GET /v6/deployments` with exact project, team, production target and source
SHA, then validate the single candidate through
`GET /v13/deployments/{id}`. This preserves one deployment creator and gives
the workflow a fail-closed duplicate/identity/terminal-state gate.

Rejected: retain the explicit Vercel `POST`/`forceNew` helper for the marker
path. Source audit established that this would be a second creator and could
duplicate the production deployment.

Rejected: let `workflow_dispatch` reach the legacy hosted job. That event is
not a release push and would permit production mutation without the marker
contract. It now reaches source proof only.

Rejected: reuse the legacy temporary-Clerk lifecycle in the Phase 3C job. The
parent owns later hosted readback; this cut needs only the pre-existing
authenticated Customer Request evaluator subject as the admission principal.

## Workflow decision table

| Event | Marker present | Source behavior | Production behavior |
| --- | --- | --- | --- |
| Pull request to main | Not applicable | Existing full source proof | None |
| Manual dispatch | Not applicable | Existing full source proof | None |
| Main push | No | Existing full source proof | Existing Customer Request hosted release path |
| Main push | Yes | Focused Phase 3C source gate, then a separate build step | Observe one Vercel Git deployment, one Convex deploy, one admission configuration, one final receipt write |

## Exact source transition

`tools/release/observe-vercel-git-source-deployment.ts` is a typed, read-only
observer with injected fetch and wait functions. It emits only deployment ID,
deployment URL, exact source revision and creation time. It rejects zero or
duplicate candidates, terminal failure, unexpected state, wrong SHA/ref/repo,
wrong project/target/alias, malformed responses and invalid configuration.
Every request is explicitly GET. Errors are code-only and never include the
bearer token or response body.

`.github/workflows/kernel-release-gate.yml` now makes the ordinary and marker
paths mutually exclusive. The marker source job checks the exact clean
checkout, uses a frozen install, runs `verify:phase3c:release-source`, runs
`build` separately, and refuses generated-file drift. Its production successor
observes Vercel, runs exactly one Convex deploy, configures totals `3/1/3` for
about four hours through `2026-08-21T00:00:00.000Z` retention with kill-switch
owner `Phase 3C release owner`, and ends at the exact named receipt step. Parent
names-only GitHub readback established that the configured evaluator secret is
`AE_CUSTOMER_REQUEST_CLERK_SUBJECT`; the production job now binds that existing
name end-to-end and contains no paid-operation-specific secret reference.

`package.json` adds the focused Phase 3C release-source command. It crosses the
current source/persistence/projection/server/auth/route/card/UI/release/
observer/residue boundaries plus the Customer Request workflow compatibility
fixture, the Plan 07C pre-attempt payment owner, and the scoped temporary-
credential owner. Build remains a separate workflow step.

## Verification results

The required focused sequence passed after the build-isolation and parent-audit
corrections:

| Command | Result |
| --- | --- |
| `vitest run tests/unit/release/observe-vercel-git-source-deployment.test.ts` | 1 file, 14 tests passed. |
| `vitest run tests/unit/release/paid-operation-hosted-release.test.ts` | 1 file, 28 tests passed. |
| `vitest run tests/imports/customer-request-source-completeness.test.ts` | 1 file, 9 tests passed. |
| `vitest run tests/imports/paid-operation-trial-residue.test.ts` | 1 file, 4 tests passed, including exact 97-path classification and removal/import falsifiers. |
| `npm run verify:phase3c:release-source` | 17 files, 167 tests passed. |
| Changed-path `oxlint --deny-warnings` | Passed with no diagnostics. |
| `git diff --check` | Passed. |
| YAML parse plus source-count extraction | Four jobs parsed; marker present; Phase 3C production has one observer, one Convex deploy, zero Vercel mutation/create paths, one admission configuration and one receipt write; receipt is the final step. |

`npm run typecheck` was run only for diagnostic extraction. It exited `2` with
108 inherited repository diagnostics, led by existing Convex capability-supply
and Customer Request port/type mismatches. Zero diagnostic names a changed
TypeScript path. The log is
`/tmp/ae-phase3c-07e-typecheck-b738.log`; this cut does not broaden into those
baseline failures.

`npm run build` passed against a Git-archive scratch copy overlaid with the
exact nine-path candidate and the lock-identical installed dependency tree.
The build produced Vercel output and mechanically rewrote only
`src/routeTree.gen.ts` inside scratch. That rewrite was not copied, restored or
staged in the candidate; the complete scratch tree and its dependency symlink
were moved to macOS Trash. The workflow now uses the same archive-isolated
mechanism, so its post-build clean guard observes the exact checkout rather
than generated scratch churn.

Final stage/commit and post-commit custody checks remain outside this record's
self-contained source identity. No hosted or control-plane command was run.

## Observable release behavior

Static workflow evidence now encodes four event outcomes rather than allowing
two production creators. Mocked observer evidence demonstrates the success and
fail-closed cases without contacting Vercel. Convex source inspection confirms
that admission and receipt ownership remains in
`hostedPaidOperation:configurePhase3CAdmission` and
`hostedPaidOperation:recordPhase3CDeploymentReceipt`; this cut does not edit
those functions or create another lifecycle.

## Evidence and claim ceiling

Evidence is source inspection, static workflow contract, focused unit/import/UI
fixtures, mocked Vercel responses, and the local build only. It cannot
prove a Git push, workflow run, Vercel or Convex deployment, served revision,
credential identity, hosted reachability, provider fulfilment, payment,
settlement, comprehension or accessibility in use, production safety, demand,
or customer value.

The next safe action is parent audit of the exact committed candidate, followed
by a separately authorized marker push and parent-owned hosted readback. This
child performs neither external action.

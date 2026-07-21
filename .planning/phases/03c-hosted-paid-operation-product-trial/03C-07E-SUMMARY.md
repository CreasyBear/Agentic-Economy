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

The targeted full-history correction resumed clean at
`d27591d04a8e2f694055400522aeefda235abc2a` / tree
`28fc67c0ff2c6ff749050cdba6b3845f55222639`. Its parent custody manifest is
`/tmp/ae-phase3c-parent-custody-d27591d0.json`, with canonical digest
`58322771ff39d31a0b278b4a0cf3bf6ac4c8cedbcf153c7df0518d278438dfcf`
and entries-only digest
`1591c52ecb943bab01aea9781ad55fd5a9dc6275eb202363d62b950ab9000fc1`
across the same 66 inherited entries.

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
| Full-history source checkout | Filtered `paid-operation-hosted-release.test.ts` after the first authorized marker run | `[P3C_RED:phase3c_full_history_checkout_absent]` proved the Phase 3C source job did not bind `fetch-depth: 0`. |
| Convex deploy typecheck boundary | Filtered `paid-operation-hosted-release.test.ts` after the third authorized marker run | `[P3C_RED:phase3c_convex_deploy_typecheck_boundary_absent]` proved the Phase 3C deploy still adopted the unrelated repository-wide TypeScript baseline. |

The pre-change Customer Request completeness file also had three unrelated
stale source-shape assertions plus its old workflow-order assertion. They are
baseline fixture drift, not evidence about this release transition. The
allowed test file is minimally re-grounded during final verification so the
focused gate can exercise its live source owners.

## First authorized marker attempt ledger

The parent-provided external ledger records that main advanced from
`a91a37a3d8da09546994e70af92d6e532a4471e6` to
`d27591d04a8e2f694055400522aeefda235abc2a`. GitHub run `29788718518`
failed only in Phase 3C source proof, before build or production, because
`paid-operation-trial-residue.test.ts` invoked
`git diff --name-only 2debf4b9f65ce228491f7d3d17ed1654a23bb496` in the default shallow
`actions/checkout@v6` clone and Git reported `fatal: bad object`. Sixteen files
loaded and 163 tests passed; the residue suite ran zero tests because its import
failed.

Vercel Git integration created exact deployment
`dpl_3D4hsxUbTRVvrwSKQW4f48nhby88` and moved the production alias before the
source job failed. The parent executed the recorded rollback; subsequent
inspection established that `agentic-economy-phi.vercel.app` again resolved to
prior READY deployment `dpl_4Y9pqP1UwVNNwSAXaEgzZpDh9Vm1` at `a91a37a3`.
The first Vercel deployment occurred and was rolled back.

The Phase 3C Convex job was skipped: zero Convex deploy, admission
configuration, temporary credential creation or use, hosted lifecycle, or
hosted readback occurred. The one-Vercel attempt count is consumed. Any retry
requires fresh parent external authorization.

## Second authorized marker attempt and observer correction

The founder authorized one corrected marker push. `origin/main` advanced to
`f45a09e57937104dfdba05d94e0eaf8d99b1d115`, and Vercel Git integration
created exact READY production deployment
`dpl_H1UscNWxGfGK6uV5m3nYSy4eyPWg`. GitHub run `29790147219` passed the clean
source and build job. Its first production attempt stopped at the read-only
Vercel observer while the production alias remained pinned to the prior
rollback target. No later production step ran.

The founder then authorized promotion of that existing deployment and a rerun
of only the failed job. Readback established that
`agentic-economy-phi.vercel.app` resolved to `dpl_H1UscNWxGfGK6uV5m3nYSy4eyPWg`
and that the deployment was READY, production-targeted and bound to exact SHA
`f45a09e57937104dfdba05d94e0eaf8d99b1d115`, ref `main`, repository
`CreasyBear/Agentic-Economy` and the configured project. Run attempt 2 still
failed at the observer. Its Convex deploy, admission configuration and receipt
steps were skipped.

The exact defect was a false assumption about Vercel metadata after rollback
and promotion. The live alias registry and alias lookup both mapped the
canonical hostname to the correct deployment, but the deployment-detail
`alias[]` retained its creation-time aliases. Explicitly setting the already
correct alias did not alter that snapshot. The parent therefore rolled
production back to prior READY deployment
`dpl_4Y9pqP1UwVNNwSAXaEgzZpDh9Vm1`; exact alias readback confirmed the rollback.
Across both attempts there remains zero Phase 3C Convex deploy, admission
configuration, receipt, temporary credential use or hosted lifecycle.

The source correction keeps the observer GET-only. It validates the unique
SHA-bound candidate and its deployment detail as before, then resolves
`GET /v13/deployments/agentic-economy-phi.vercel.app` and requires that live
canonical route to return the same deployment ID, URL, creation time, state,
project, target and repository metadata. It no longer treats a creation-time
`alias[]` snapshot as routing authority.

## Third authorized marker attempt and Convex deploy correction

The founder authorized one exact push of
`7ba9ad63460c2d0c77abfcb815e3580434fed723`. Vercel Git integration created
the single replacement deployment
`dpl_5GtqBqxankBuRnSTNkWTZhqFy1Av`; it reached `READY`, targeted production and
carried exact source SHA `7ba9ad63460c2d0c77abfcb815e3580434fed723` on
`main`. The parent promoted that deployment, and direct canonical-hostname
resolution returned the same deployment ID and source SHA.

GitHub run `29793418807` passed Phase 3C source proof, the archive-isolated
build and the exact Vercel observer. Its production job then stopped at
`npx convex deploy` before source upload: Convex CLI invoked the repository-wide
TypeScript check and reported 41 diagnostics across 21 existing files, led by
`convex/capabilitySupply.ts:583`. Admission configuration and deployment receipt
were skipped. No temporary credential or hosted lifecycle was created or run.

The smallest correction keeps Convex schema validation and deployment
ownership in the existing CLI while making the known broad TypeScript baseline
an explicit release boundary:
`npx convex deploy --typecheck=disable --message "GitHub ${AE_RELEASE_SOURCE_REVISION}"`.
The ordinary Customer Request deployment remains unchanged. A focused static
RED requires that exact Phase 3C command and refuses the flag on the ordinary
release path.

## Selected and rejected recovery paths

Selected: rely on the already-enabled Vercel Git integration, poll
`GET /v6/deployments` with exact project, team, production target and source
SHA, then validate the single candidate through
`GET /v13/deployments/{id}` and independently resolve the canonical hostname
through `GET /v13/deployments/{alias}`. This preserves one deployment creator
and gives the workflow a fail-closed duplicate/identity/terminal-state and
live-route gate.

Rejected: retain the explicit Vercel `POST`/`forceNew` helper for the marker
path. Source audit established that this would be a second creator and could
duplicate the production deployment.

Rejected: let `workflow_dispatch` reach the legacy hosted job. That event is
not a release push and would permit production mutation without the marker
contract. It now reaches source proof only.

Rejected: reuse the legacy temporary-Clerk lifecycle in the Phase 3C job. The
parent owns later hosted readback; this cut needs only the pre-existing
authenticated Customer Request evaluator subject as the admission principal.

Rejected: continue manually with Convex after the failed observer. The proof
contract requires a successful exact GitHub production job and its final named
receipt step; bypassing that job would manufacture the deployment chain.

Rejected: treat alias reassignment as a substitute for the source correction.
The canonical route already resolved correctly and an explicit alias set did
not update Vercel's creation-time deployment alias snapshot.

Rejected: run Convex manually after GitHub failed. The accepted proof collector
requires the exact GitHub production job and final receipt step to succeed; a
manual deploy would sever that provenance.

Rejected: suppress or rewrite the failed GitHub observation. That would turn a
real release failure into evidence theatre without changing deployed source.

Rejected for the current authorization: push this correction immediately. A
main push would create another Vercel Git deployment, exceeding the single
replacement build authorized for the third attempt.

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
wrong project/target, a canonical alias that resolves to another deployment,
malformed responses and invalid configuration. Every request is explicitly
GET. Errors are code-only and never include the bearer token or response body.

`.github/workflows/kernel-release-gate.yml` now makes the ordinary and marker
paths mutually exclusive. The marker source job checks the exact clean
checkout with full Git history (`fetch-depth: 0`) so the Git-derived residue
gate can resolve its declared Phase base. It uses a frozen install, runs
`verify:phase3c:release-source`, runs `build` separately, and refuses
generated-file drift. The other checkout steps remain unchanged. Its
production successor observes Vercel, runs exactly one Convex deploy with the
known unrelated repository typecheck explicitly disabled,
configures totals `3/1/3` for
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
| `vitest run tests/unit/release/observe-vercel-git-source-deployment.test.ts` | 1 file, 15 tests passed, including a promoted deployment whose creation-time alias snapshot omits the live canonical route. |
| `vitest run tests/unit/release/paid-operation-hosted-release.test.ts` | 1 file, 28 tests passed. |
| `vitest run tests/imports/customer-request-source-completeness.test.ts` | 1 file, 9 tests passed. |
| `vitest run tests/imports/paid-operation-trial-residue.test.ts` | 1 file, 4 tests passed, including exact 97-path classification and removal/import falsifiers. |
| `npm run verify:phase3c:release-source` | 17 files, 168 tests passed. |
| Changed-path `oxlint --deny-warnings` | Passed with no diagnostics. |
| `git diff --check` | Passed. |
| YAML parse plus source-count extraction | Four jobs parsed; marker present; only Phase 3C source checkout has `fetch-depth: 0`; Phase 3C production has one observer, one Convex deploy, zero Vercel mutation/create paths, one admission configuration and one receipt write; receipt is the final step. |

`npm run typecheck` was run only for diagnostic extraction. It exited `2` with
108 inherited repository diagnostics, led by existing Convex capability-supply
and Customer Request port/type mismatches. Zero diagnostic names a changed
TypeScript path. The log is
`/tmp/ae-phase3c-07e-typecheck-b738.log`; this cut does not broaden into those
baseline failures.

The observer correction reran that diagnostic at the corrected source. It
again exited `2` with 108 inherited diagnostics and zero diagnostics naming
either corrected observer path. Its log is
`/tmp/ae-phase3c-07f-typecheck.log`.

`npm run build` passed against a Git-archive scratch copy overlaid with the
exact nine-path candidate and the lock-identical installed dependency tree.
The build produced Vercel output and mechanically rewrote only
`src/routeTree.gen.ts` inside scratch. That rewrite was not copied, restored or
staged in the candidate; the complete scratch tree and its dependency symlink
were moved to macOS Trash. The workflow now uses the same archive-isolated
mechanism, so its post-build clean guard observes the exact checkout rather
than generated scratch churn.

The targeted full-history correction did not rerun `npm run build`: it changes
checkout metadata, one static workflow assertion, and this ledger only. No
executable application source or build command changed, so the existing exact-
candidate build evidence remains the applicable build result.

The third marker run exercised Vercel and GitHub as recorded above. Its Convex
command stopped before upload, and it performed no admission, credential or
hosted-lifecycle mutation. The typecheck-boundary correction itself is proven
only by source and local fixtures until a later authorized release carries it.

## Observable release behavior

Static workflow evidence now encodes four event outcomes rather than allowing
two production creators. Mocked observer evidence demonstrates the success and
fail-closed cases without contacting Vercel. Convex source inspection confirms
that admission and receipt ownership remains in
`hostedPaidOperation:configurePhase3CAdmission` and
`hostedPaidOperation:recordPhase3CDeploymentReceipt`; this cut does not edit
those functions or create another lifecycle.

## Evidence and claim ceiling

The attempt, deployment, alias, failed-job and skipped-step statements above are
exact external ledger/readback. The deploy correction's own evidence is source
inspection, a static workflow contract and focused local fixtures. It does not
prove a successful corrected release, Convex deployment, served paid-operation
revision, credential identity, hosted lifecycle, provider fulfilment, payment,
settlement, comprehension or accessibility in use, production safety, demand,
or customer value.

## Fourth marker release and first hosted lifecycle finding

The founder subsequently authorized and the parent released exact revision
`f1d57784a621f3769d8006300705188fb65f0568`. Vercel Git integration created
READY production deployment `dpl_9dbJNLRgbZVeLCiqhzS3oVT2pFLF`; independent
canonical-hostname resolution returned that same deployment and revision.
GitHub run `29794190263` passed source proof, archive-isolated build, exact
Vercel observation, one Convex production deploy, admission configuration and
the final deployment-receipt write against `prod:formal-jaguar-441`.

The first hosted lifecycle then stopped before authority at a real UI
checkpoint mismatch. Both authenticated projections were otherwise valid and
semantic-digest equal at invocation version 1. The card correctly exposed two
permission controls, `Authorize` and `Refuse`, while the journey collector's
old assertion expected one control. No mock effect was released. The durable
generation-1 residue is one version-1 invocation, one active admission
reservation and zero effects. The temporary smoke credential pair and the
separate read-only diagnostic credential pair were revoked, with independent
revocation readback; no active trial credential was retained.

## Generation-2 source-owned recovery

The selected recovery keeps the failed pre-authority invocation as durable
evidence and creates a new admission generation. It does not rewrite the row,
reuse revoked caller identity, or pretend the first lifecycle completed.
Generation 2 atomically disables the exact prior policy, releases only its
bounded active reservations, reduces its concurrency counter to zero and then
creates the new policy. The proof query accepts prior-generation headers only
when their policy is disabled, principal and policy digest still match, and
their reservations are released. It continues to refuse an extra current-
generation header or any inconsistent prior residue.

The journey contract now requires the actual permission surface: two controls
at version 1, both bound to the expected permission command, and one execute
control after authority at version 2. The current source-owned policy and
deployment-receipt references are versioned to `g2`; the original rows remain
queryable as retained trial residue.

The generation-2 correction passed `verify:phase3c:release-source` with 17
files and 168 tests, changed-path lint, `git diff --check`, and changed-path
TypeScript filtering. Repository-wide typecheck remains red only on the
pre-existing baseline. These are source and local-fixture results until the
generation-2 revision is deployed and the three hosted paths, shutdown and
packet verification complete.

## Current claim ceiling

Revision `f1d57784` proved exact Vercel and Convex deployment, authenticated
human/agent projection reachability, durable pre-authority reconstruction and
honest no-effect failure preservation. It did not complete a hosted paid
operation. The generation-2 repair is not hosted evidence yet. Neither result
proves real provider fulfilment, payment, settlement, production safety,
real-human comprehension, demand or customer value.

## Generation-2 deployment and surface-ownership finding

Exact revision `0c00f56d252522739fa4a5926638eb82e9c1ef9d` passed GitHub run
`29795699488`. Vercel production deployment
`dpl_EFLSPguGao2ArJpiBNwFE9Vrr6FR` reached READY and the canonical hostname
resolved to that exact source. The run then performed one Convex production
deploy, atomically retired generation 1, configured generation 2 and recorded
the generation-2 deployment receipt against `prod:formal-jaguar-441`.

The next bounded hosted lifecycle stopped after the human operation reached
version 2 with accepted authority and a durable prepared payment. No external
mock effect was released. Raw readback showed generation 2 at one admission,
one active reservation and one retained version-2 invocation. The temporary
session and key were revoked with readback.

The failure was in the proof collector: it attempted to inspect the
human-session-owned invocation with the distinct agent-key caller. Live source
correctly requires both principal and caller identity for reconstruction, so
that cross-surface read was refused. Local route fixtures had proved semantic
parity only when both projections used the same actor; they did not authorize
one credential to assume another credential's caller identity.

Three source-compatible recoveries were evaluated. Widening ownership to the
principal alone was rejected because it would weaken caller attribution and
the accepted non-enumeration boundary. Reusing or impersonating the human
session from the agent adapter, or copying one observed projection into the
other surface's evidence slot, was rejected as false attribution. Adding a
trial-only parity API was rejected because it would broaden the product
transport solely to satisfy evidence machinery.

The selected correction makes the hosted evidence honestly surface-specific.
The protected human detail embeds its already-authorized closed rich
projection as non-executable escaped JSON beside the rendered card; the live
collector records warm/cold human projection and DOM truth from that route.
The agent golden and uncertainty paths record warm/cold structured projection
through the scoped agent route only. Both remain the same closed
`agentic-paid-operation:v1` semantic contract, and raw operator observation
independently binds each invocation to its actual caller, transitions, payment
row and one mock effect. No caller gains access to another caller's record.

Generation 3 keeps both failed invocations and their payment state as retained
evidence. Its admission transaction disables generations 1 and 2, releases
only their bounded active reservations, and creates a fresh three-operation
cohort. The operator proof accepts those older headers only when their exact
policies are disabled and their reservations are released. Source proof covers
both retained generations plus the current cohort under the cap-plus-one
fence.

The generation-3 correction passed 17 release-source files / 168 tests,
changed-path lint, diff checks and changed-path TypeScript filtering. These
remain source and local-fixture results until a later exact generation-3
deployment completes the human, structured-agent and uncertainty paths,
revocation, admission shutdown and packet verification.

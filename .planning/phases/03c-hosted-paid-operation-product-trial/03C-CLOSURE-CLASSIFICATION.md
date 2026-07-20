# Phase 3C closure classification and retirement boundary

This record classifies the Phase 3C delta, not the whole purpose of a
pre-existing shared file. It is source and local-fixture evidence only. It
does not claim that the sandbox is deployed, reachable, configured, exercised,
safe for production, or useful to a customer.

`paid-operation-owned` means the artifact may be reused only inside the
paid-operation class. `trial-only` means the artifact or Phase 3C delta exists
for this labelled hosted trial and is a retirement target or retained phase
provenance. `candidate-shared-after-second-use` remains paid-operation-local
unless a second non-BTC paid operation demonstrates the same contract without
branching and a separate accepted decision promotes it. No artifact below is
classified as shared.

## Artifact inventory

The inventory is the exact 89-path Git-derived Phase 3C delta from
`2debf4b9f65ce228491f7d3d17ed1654a23bb496` through this replacement Plan 07B
tip, including tracked changes and untracked owned files during TDD. The import
test derives this set directly from Git; there is no second hand-maintained
inventory capable of hiding an omission.

| Artifact | Classification | Closure treatment |
| --- | --- | --- |
| `.planning/REQUIREMENTS.md` | `trial-only` | Revert only the Phase 3C planning delta when the milestone is archived. |
| `.planning/ROADMAP.md` | `trial-only` | Revert only the Phase 3C planning delta when the milestone is archived. |
| `.planning/STATE.md` | `trial-only` | Revert only the Phase 3C planning delta when the milestone is archived. |
| `.planning/adr/ADR-021-hosted-paid-operation-trial-boundaries.md` | `paid-operation-owned` | Retain as accepted architectural provenance even after runtime retirement. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-01-PLAN.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-01-SUMMARY.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-02-PLAN.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-02-SUMMARY.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-03-PLAN.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-03-SUMMARY.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-03A-SUMMARY.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-04-PLAN.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-04-SUMMARY.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-05-PLAN.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-05-SUMMARY.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-06-PLAN.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-06-SUMMARY.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-07-PLAN.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-07-SUMMARY.md` | `trial-only` | Retain the exact source/local handoff and later append only independently earned evidence. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-07A-SUMMARY.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-AGENT-RUNBOOK.md` | `trial-only` | Retire as an executable runbook after the declared review; retain as provenance. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-CLOSURE-CLASSIFICATION.md` | `trial-only` | Retain this retirement manifest as phase provenance. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-EVAL.md` | `trial-only` | Retain the instrument as provenance; do not reuse as proof of human comprehension. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-COMPREHENSION-RESULTS.json` | `trial-only` | Retain the automated-adjunct result under its non-human label. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-CONTEXT.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-PLAN-REVIEW.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-RED-REPORT.json` | `trial-only` | Retain the classified RED history as local-fixture provenance. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-RESEARCH.md` | `trial-only` | Retain as phase provenance; it has no runtime authority. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-UI-SPEC.md` | `trial-only` | Phase provenance only at closure; it is not promoted into `DESIGN.md`. |
| `.planning/phases/03c-hosted-paid-operation-product-trial/03C-VALIDATION.md` | `trial-only` | Retain as phase provenance; its source checks are not hosted proof. |
| `convex/hostedPaidOperation.ts` | `trial-only` | Remove the trial persistence, policy, counters, and proof query through a separate migration cut. |
| `convex/hostedPaidOperationGateway.ts` | `trial-only` | Remove the trial-only service gateway after policy disablement. |
| `docs/hosted-paid-operation-trial.md` | `trial-only` | Archive with the trial; do not present it as a current hosted capability. |
| `package.json` | `trial-only` | Revert only the Phase 3C/Plan 07B scripts after retirement. |
| `playwright.paid-operation-hosted.config.ts` | `trial-only` | Remove the evaluator-only hosted Playwright configuration. |
| `src/components/ae/action-invocation/AePaidOperationCard.tsx` | `paid-operation-owned` | Revert the Phase 3C card delta if the paid-operation class is retired. |
| `src/lib/server/hosted-paid-operation-agent-api.ts` | `trial-only` | Remove the protected trial agent transport. |
| `src/lib/server/hosted-paid-operation-agent-auth.ts` | `trial-only` | Remove the protected trial agent authentication adapter. |
| `src/lib/server/hosted-paid-operation-human-api.ts` | `trial-only` | Remove the protected trial human transport. |
| `src/lib/server/hosted-paid-operation-runtime.ts` | `trial-only` | Remove the trial runtime composition. |
| `src/modules/action-invocation/hosted-paid-operation-composition.ts` | `trial-only` | Remove the labelled-trial composition after record retirement. |
| `src/modules/action-invocation/hosted-paid-operation-creation.ts` | `trial-only` | Remove the source-owned BTC trial creation fixture. |
| `src/modules/action-invocation/hosted-paid-operation-port.ts` | `trial-only` | Remove the trial persistence port with its implementation. |
| `src/modules/action-invocation/hosted-paid-operation-service-auth.ts` | `trial-only` | Remove the trial-only trusted service bridge. |
| `src/modules/action-invocation/hosted-sandbox-effect-adapter.ts` | `trial-only` | Remove labelled Provider A/B mock effects. |
| `src/modules/action-invocation/hosted-sandbox-reconciliation.ts` | `trial-only` | Remove labelled Provider B trusted reconciliation fixture. |
| `src/modules/action-invocation/internal/convex-schema.ts` | `trial-only` | Revert only the Phase 3C tables and indexes through a reviewed schema migration. |
| `src/modules/action-invocation/paid-operation-card-contract.ts` | `candidate-shared-after-second-use` | Keep paid-operation-local; remove if no second non-BTC use is accepted. |
| `src/modules/action-invocation/paid-operation-semantics.ts` | `paid-operation-owned` | Revert only the Phase 3C semantic delta if the trial contract is retired. |
| `src/routeTree.gen.ts` | `trial-only` | Regenerate after removing the trial setup/detail/API routes. |
| `src/routes/actions.paid.$invocationRef.tsx` | `trial-only` | Remove the protected trial detail route. |
| `src/routes/actions.paid.new.tsx` | `trial-only` | Remove the evaluator Sandbox setup route. |
| `src/routes/api.v1.paid-operations.$invocationRef.commands.ts` | `trial-only` | Remove the protected trial command route. |
| `src/routes/api.v1.paid-operations.$invocationRef.ts` | `trial-only` | Remove the protected trial inspect route. |
| `src/routes/api.v1.paid-operations.ts` | `trial-only` | Remove the protected trial create route. |
| `tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts` | `trial-only` | Remove the one-run live admission source after review. |
| `tests/e2e/paid-operation-development-surface.spec.ts` | `paid-operation-owned` | Revert only the Phase 3C assertions if the class is retired. |
| `tests/e2e/paid-operation-hosted-sandbox.spec.ts` | `trial-only` | Remove the hosted trial browser fixture. |
| `tests/imports/hosted-paid-operation-boundaries.test.ts` | `trial-only` | Remove with the hosted trial production paths. |
| `tests/imports/paid-operation-trial-residue.test.ts` | `trial-only` | Retain until the removal cut passes, then archive with this manifest. |
| `tests/ui-contract/hosted-paid-operation-contract.test.tsx` | `trial-only` | Remove the Phase 3C hosted card contract fixture. |
| `tests/unit/action-invocation/convex-handler-contract.test.ts` | `trial-only` | Revert only Phase 3C persistence/proof-query fixtures after schema retirement. |
| `tests/unit/action-invocation/hosted-paid-operation-contract-red.test.ts` | `trial-only` | Retain the RED provenance; remove from active suites after retirement. |
| `tests/unit/action-invocation/hosted-paid-operation-creation.test.ts` | `trial-only` | Remove with the source-owned trial creation fixture. |
| `tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts` | `trial-only` | Remove after the persistence migration proves no active rows remain. |
| `tests/unit/action-invocation/hosted-paid-operation-reconciliation.test.ts` | `trial-only` | Remove with the labelled reconciliation fixture. |
| `tests/unit/action-invocation/hosted-paid-operation-red-harness.test.ts` | `trial-only` | Retain RED provenance; remove from active suites after retirement. |
| `tests/unit/action-invocation/hosted-sandbox-effect-adapter.test.ts` | `trial-only` | Remove with labelled mock effects. |
| `tests/unit/action-invocation/paid-operation-application-service.test.ts` | `paid-operation-owned` | Revert only the Phase 3C behavior delta if the class is retired. |
| `tests/unit/action-invocation/paid-operation-card.test.tsx` | `paid-operation-owned` | Revert only the Phase 3C card assertions if the class is retired. |
| `tests/unit/action-invocation/paid-operation-development-surface.test.tsx` | `paid-operation-owned` | Revert only the Phase 3C development assertions if the class is retired. |
| `tests/unit/action-invocation/paid-operation-projection.test.ts` | `paid-operation-owned` | Revert only the Phase 3C projection assertions if the class is retired. |
| `tests/unit/release/customer-request-production-credential.test.ts` | `trial-only` | Revert only the paid-scope Plan 07B fixture; preserve Customer Request defaults. |
| `tests/unit/release/paid-operation-hosted-release.test.ts` | `trial-only` | Remove the packet/live-admission falsifier suite after final review. |
| `tests/unit/server/hosted-paid-operation-agent-auth.test.ts` | `trial-only` | Remove with the protected trial agent authentication adapter. |
| `tests/unit/server/hosted-paid-operation-api.test.ts` | `trial-only` | Remove with the protected trial routes. |
| `tests/unit/server/hosted-paid-operation-auth-contract-red.test.ts` | `trial-only` | Retain RED provenance; remove from active suites after retirement. |
| `tests/unit/server/hosted-paid-operation-creation-api.test.ts` | `trial-only` | Remove with the protected trial create route. |
| `tests/unit/server/hosted-paid-operation-runtime.test.ts` | `trial-only` | Remove with the trial runtime. |
| `tools/dev/paid-operation-browser/main.tsx` | `paid-operation-owned` | Revert only Phase 3C fixture changes if the paid-operation class is retired. |
| `tools/dev/paid-operation-browser/paid-operation-browser-fixture.ts` | `paid-operation-owned` | Revert only Phase 3C fixture changes if the paid-operation class is retired. |
| `tools/dev/paid-operation-surface-host.tsx` | `paid-operation-owned` | Revert only Phase 3C fixture changes if the paid-operation class is retired. |
| `tools/dev/score-paid-operation-comprehension.ts` | `trial-only` | Remove the automated adjunct scorer after review. |
| `tools/dev/verify-phase-3c-red-contract.ts` | `trial-only` | Remove the Phase 3C-only RED classifier after archival. |
| `tools/release/customer-request-production-credential.ts` | `trial-only` | Revert only the paid-scope option; preserve default Customer Request behavior. |
| `tools/release/paid-operation-hosted-journey.ts` | `trial-only` | Remove the module-owned three-operation checkpoint journey after the declared review. |
| `tools/release/paid-operation-hosted-live-collector.ts` | `trial-only` | Remove the temporary-credential, control-plane, and raw-observation admission collector after review. |
| `tools/release/paid-operation-hosted-proof-contract.ts` | `trial-only` | Remove the packet schema and offline integrity verifier after the retained packet review window. |
| `tools/release/verify-paid-operation-hosted-release.ts` | `trial-only` | Remove the small offline-integrity CLI/export facade after the record-review window. |

## Removal boundary

Retirement is a separate, reviewed change; this cut deletes nothing. The
removal set is:

| Group | Required retirement action |
| --- | --- |
| Setup/detail/API surface | Remove `/actions/paid/new`, `/actions/paid/:invocationRef`, all three `/api/v1/paid-operations` route files, then regenerate the route tree. |
| Labelled providers and source fixture | Remove Provider A/B mock effects, trusted Provider B reconciliation, and the source-owned BTC consequence fixture. |
| Operation-owned persistence and policy | Disable the exact policy first; require zero active reservations; retire the two Convex owners and only their Phase 3C tables/indexes through a reviewed migration. |
| Trial auth and runtime | Remove human/agent adapters, service bridge, hosted composition/port, and trial Playwright configuration. |
| Evaluator credentials and proof tooling | Revoke temporary human/agent access immediately after the run; later revert the paid-scope helper delta, hosted scripts, smoke, verifier, and active trial tests. |
| Paid card delta | Revert the Phase 3C host/card changes. Do not move the candidate card contract into neutral Action Invocation or `DESIGN.md`. |

The import test performs a no-write simulation against the exact pre-Phase-3C
tree. Added Phase 3C production files are absent, modified production files use
their pre-phase bytes, and the neutral Action Invocation entry graph must still
resolve. It also scans every non-paid module plus booking, inquiry, dispatch,
communication, and cancellation routes for imports of hosted paid-operation
DTOs, paid semantics, or the paid card panel. No source file is deleted or
rewritten by that test.

## Retention, owner, and records left

| Control | Declared posture |
| --- | --- |
| Retention review date | `2026-08-21` |
| Kill-switch owner | `Phase 3C release owner` |
| Temporary credentials | Create only for the single authorized run, least privilege, then revoke in `finally`; retain no API key, session token, authorization header, or credential preimage in packets or logs. |
| Sandbox account | Disable new admission immediately after the one authorized run; retain only the operator-owned account reference through review, then retire it. |
| Sandbox records | Retain the three declared invocation aggregates and sanitized evidence references through the review date; after review the kill-switch owner retires them through an approved migration/retention action. |
| Expected residual records | Git/ADR/phase provenance; the sanitized packet if independently admitted; deployment/audit identifiers; revocation audit; and historical digests required to explain the trial. No active reservation, live trial credential, raw provider response, payment payload, custody preimage, or trusted evidence value may remain. |
| Objective retirement trigger | After the single authorized three-operation run has either been reviewed or abandoned, there is no approved rerun, and `2026-08-21` is reached: the Phase 3C release owner disables policy/admission, verifies zero active reservations, retires credentials/account/records, and opens the source-removal cut. Any safety, identity, counter, reservation, or duplicate-effect contradiction disables admission immediately rather than waiting for the date. |

## Evidence admission and open dependency

An offline or checksum-valid packet can establish only
`local_packet_integrity_only`. `verifyPacketIntegrity` cannot mint a hosted
evidence class. Only a concrete live collection/admission path that itself
cross-links the Vercel deployment/alias/Git identity, authenticated human DOM
and readback, independently recomputed agent semantics, and the raw
operator-invoked bounded Convex observation may return
`authenticated_exact_revision_hosted_sandbox`.

That live path is not ready to run from this source revision. The current
application-service reconstruction omits a durable prepared payment when the
version-2 aggregate has no attempt, so it projects payment authorization as not
created. The smoke remains strict on `Payment prepared`, `not_submitted`, and
execute-only. A separate parent-owned application-service plus hosted
composition/gateway TDD correction is required before deployment or live
admission; this closure record does not fabricate that state.

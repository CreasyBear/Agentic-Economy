# Phase 3C Plan 07B exact-revision proof-source record

This is the bounded source/local verification cut for the later hosted trial.
It does not record a deployment, hosted reachability, credential creation,
provider outcome, payment, settlement, human comprehension result, or final
hosted evidence class. The parent remains the sole integrator and live-run
owner.

## Custody gate

| Check | Observed result |
| --- | --- |
| Child base revision | `5d5c76db4b3470949ffb2db9b606692bb7217e9d` |
| Child base tree | `bf3769890c9940ae259fab9777fdca8b25f686d7` |
| Child worktree | Clean before the first write |
| Parent branch and checkout | `codex/phase3c-execution` at `/Users/joelchan/.codex/worktrees/41f0/Agentic-Economy` |
| Parent custody manifest | Raw SHA-256 `975565a9ddc8ce0fe22b666ff4f42e539d2bc56d0ee558be4119ee8fa208b0aa`; canonical digest `4e2f1538d0974d1d06ff93f19b5d541223652b074c8ca3e9671f3d0caf46c8a0` |
| Parent custody entries | Exactly 66; sorted canonical entries digest `96e26a67b5566b8ddb40b0bd2fdf73639d60d28fb9a2026da300f41ea078bfe9` |
| Candidate intersection | Zero candidate allowlist paths intersect the parent custody entries |
| Parent authority bytes | `AGENTS.md` `aa7452da000316280704627326fbdbb089a56da7c13470a276416fbc5a06b067`; `PRODUCT.md` `909b28837430522726bf827020c4abe7ed63c0b69bbfcd4cfdba12a363f51073`; `DESIGN.md` `3adb8ff25f793a4bbd0aa1048ce4a17db14623b3d9422a92ec8814ca8c04dcfb` |

## Source-owner decisions made before editing source

### A. Trusted proof observation

| Candidate path | Decision | Reason and blast radius |
| --- | --- | --- |
| Treat the public projection or packet as its own proof | Rejected | A renderer or packet producer cannot independently prove the durable rows from which it was derived. |
| Add a public administrator/readback route | Rejected | This expands surface and authorization policy solely for evidence collection. |
| Add one internal, bounded, sanitized query to `convex/hostedPaidOperation.ts` | Selected | The existing persistence owner can observe exact declared invocation references without a new route. The query remains private, accepts only 1–3 exact references, uses indexed cap-plus-one reads, and returns digests/counters rather than custody or evidence material. A later authenticated operator CLI—not this cut—may invoke it. |

### B. Least-privilege temporary credential source

| Candidate path | Decision | Reason and blast radius |
| --- | --- | --- |
| Give a paid-operation key both `customer_requests:create` and a paid scope | Rejected | It grants unrelated Customer Request authority to the hosted paid-operation trial. |
| Parameterize the required scope in the existing temporary-key helper while keeping `customer_requests:create` as the default | Selected | Existing callers retain their exact behavior. A paid-operation caller can request only `paid_operation:invoke`, while the same create/run/finally-revoke lifecycle remains the single owner. |
| Add a second paid-operation Clerk client | Rejected | It duplicates instance pinning, identity admission, expiration, and revocation behavior. |

### C. Packet authority

| Candidate path | Decision | Reason and blast radius |
| --- | --- | --- |
| Accept renderer/caller assertions or a checksum as truth | Rejected | A checksum detects packet mutation only; it cannot establish source, deployment, actor, provider, projection, or durable-state truth. |
| Reuse the Customer Request verifier unchanged | Rejected | Customer Request is a different aggregate and claim. Reuse would either weaken the paid-operation checks or distort the existing verifier. |
| Add a Phase 3C verifier for `agentic-paid-operation-hosted-proof:v1` | Selected | The verifier independently recomputes checksums and projection semantics, and cross-checks exact Git/deployment identity, both authenticated surfaces, the internal source observation, fixed scenario order, counters, reservations, versions, commands, effects, and the claim ceiling. Only its one concrete live collection/admission path may return `authenticated_exact_revision_hosted_sandbox`, after every independent check succeeds. |

Parent adversarial review narrowed that selected path further before verifier
implementation. Packet integrity and live evidence admission are separate
operations:

- `verifyPacketIntegrity` may validate strict schema, checksum, recomputed
  semantics, scenario invariants, and internal consistency. Its strongest
  result is local/integrity status. A checksum-valid packet, including one with
  forged but internally consistent control-plane fields, is never hosted
  evidence.
- The final hosted evidence class is reserved for a live collection/admission
  path that performs and cross-links the authoritative Vercel deployment,
  alias, Git SHA, ref, and repository read; the authenticated human DOM and
  readback; the independently recomputed authenticated-agent semantics; and
  the operator-invoked raw bounded Convex observation. Caller-provided packet
  fields cannot substitute for any of those reads.
- Synthetic unit packets are falsifiers for integrity logic only. They never
  exercise or describe a successful hosted-evidence admission.

### D. Hosted run shape

| Candidate path | Decision | Reason and blast radius |
| --- | --- | --- |
| Four or more invocations | Rejected | It exceeds the declared lifetime cap and adds unnecessary consequence attempts. |
| One mixed human/agent invocation | Rejected | It cannot independently demonstrate the two caller surfaces plus the response-lost recovery path. |
| Exactly three invocations, total cap 3, concurrency 1, rate 3 | Selected | Ordered scenarios are: shared human/agent Provider A golden; agent Provider A golden; Provider B response-lost uncertainty goblin. Each invocation owns one attempt/effect generation and one effect, for exactly three total effects. Reconciliation is intent-only, no ambiguous retry/provider switch occurs, and all reservations must be released before verification. |

## Candidate-correction decisions recorded before corrected source

Parent audit rejected candidate `222516ae874dad7cddc6c41300828c29ddcffdb0`
(tree `77ed55733d57652dc14693993d32155115ad5cfb`) as incomplete. The
replacement remains based on that commit and adds one correction commit; the
original parent base, 66-entry custody manifest, zero-intersection rule and
source/local evidence ceiling remain unchanged.

### E. Exact Convex deployment provenance

| Candidate path | Decision | Reason and blast radius |
| --- | --- | --- |
| Treat the admission policy `sourceRevision` as deployment provenance | Rejected | The row is useful policy state but is written by application source and cannot independently identify the code installed in the current Convex deployment. |
| Drop exact-revision admission and describe the run only as a hosted candidate | Rejected | The founder accepted one exact-revision run, and a narrower independently cross-linked provenance path exists. |
| Persist one exact-SHA GitHub Actions deployment receipt in the target Convex deployment and cross-check it with public run/job metadata plus live `ctx.meta.getDeploymentMetadata()` | Selected | One internal, idempotent, conflict-refusing mutation records the fixed repository, ref, workflow, dedicated job and step contract together with source revision/tree, run identity and the deployment name obtained from `ctx.meta`. The proof query returns that one receipt and current deployment metadata. The collector independently checks the public GitHub run/jobs responses. This cut defines and locally tests the contract only; the workflow remains a separately owned release-safety cut. |

The fixed future workflow contract is repository
`CreasyBear/Agentic-Economy`, ref `main`, workflow
`.github/workflows/kernel-release-gate.yml`, dedicated job name
`Phase 3C exact-revision Convex deployment`, and receipt step name
`Record Phase 3C Convex deployment receipt`. A later workflow cut must use
those exact case-sensitive names rather than improvise another provenance
shape.

### F. Authenticated access to the private proof query

| Candidate path | Decision | Reason and blast radius |
| --- | --- | --- |
| Create or require a production admin/deploy key | Rejected | No such local credential exists, creating one is outside this source cut, and the configured authenticated operator account already provides a narrower path. |
| Make the proof query public | Rejected | That would expand the application surface and authorization policy solely for evidence collection. |
| Use the existing authenticated Convex CLI account and configured project binding with `npx convex run hostedPaidOperation:phase3CHostedProofObservation ... --prod` | Selected | The function stays internal. The source requires the configured `CONVEX_DEPLOYMENT` project binding, invokes the exact query under `--prod`, and cross-checks the returned `ctx.meta` name and deployment receipt. Tests inject the process runner; this cut never invokes the CLI or reads, prints, copies or packets the local Convex access token/configuration. |

### G. Early lifecycle evidence

| Candidate path | Decision | Reason and blast radius |
| --- | --- | --- |
| Infer Ready and Payment prepared checkpoints from a terminal projection | Rejected | A terminal response cannot prove that either pre-command state was served, and it can conceal the known version-2 reconstruction defect. |
| Accept a caller-supplied transcript | Rejected | A transcript is another self-assertion and is not the authenticated human or agent surface. |
| Capture module-owned authenticated human DOM and independently parsed agent projections at versions 1 and 2 before each command | Selected | The live journey owns the three invocations and records exact pre-command checkpoints. Admission requires version 1 Ready for permission and version 2 Payment prepared, payment not submitted, no settlement evidence, no result, and only the expected next command. Terminal-only collection has no final-class emitter. |

### H. Raw cohort completeness

The corrected private observation enumerates the evaluator principal's entire
header cohort with `take(4)` and requires it to equal the three requested
references. For each invocation it enumerates every source, payment, command,
attempt, effect and evidence row under cap-plus-one bounds. It also enumerates
the policy/principal reservation cohort with `take(4)`, requires its exact
reference set to match the three headers, and derives active reservations from
those rows. Control/header caller identity and effect/payment identity are
cross-linked before redacted cohort-scoped digests are returned. This closes
the prior candidate's ability to hide a fourth header, second source/payment,
orphan reservation, old generation, caller drift or payment drift.

### I. Temporary credential lifecycle

The final live path itself nests `withTemporaryClerkUserSession` and a
`withTemporaryClerkApiKey` request whose required and complete scope set is
exactly `paid_operation:invoke`. Both credentials are revoked in `finally`,
including when the journey fails. A sanitized admission receipt is accepted
only after Clerk readback reports the exact observed session and key IDs as
non-active/revoked for the same subject. Existing Customer Request callers
retain their default `customer_requests:create` behavior and accepted companion
scope; secrets and raw tokens never enter the packet, attachment or log.

## Working contract

The packet remains `hosted_candidate` while it is collected. Local tests may
construct a complete synthetic packet to falsify the integrity verifier, but no
local or runtime fixture may preclaim the final hosted label. The internal
observation enumerates every command, attempt, and mock-effect row for each
exact invocation prefix under cap-plus-one bounds; it does not look only at the
current tuple, so hidden prior generations or duplicates cannot disappear. It
does not expose raw API/session keys, authorization headers, provider
responses, payment payloads, custody values, trusted evidence, or opaque
evidence preimages.

The implementation loop and final command/evidence record are appended below
after focused RED and GREEN verification. Until then, the claim ceiling is
source inspection plus local unit/import fixtures only.

## Required pre-hosted dependency outside this allowlist

Parent source review found a P1 contradiction at
`src/modules/action-invocation/paid-operation-application-service.ts:121-129`.
`createPaidOperationApplicationService.reconstruct` loads payment state only
when `view.attempts.at(-1)` exists. The durable hosted version-2 aggregate has
zero attempts and a prepared payment row owned by the hosted
composition/gateway, so the live projection currently reports payment
authorization as not created. The accepted Phase 3C card contract requires
version 2 to show payment authorization created, payment submission not
submitted, and execute as the only consequential continuation.

This Plan 07B cut does not own that application-service/composition/gateway
repair and will not fabricate the state in its query, packet, or browser
assertions. The hosted smoke remains strict and therefore cannot pass until the
parent integrates a separate focused TDD correction over those source owners.
That correction is a required dependency before release-safety approval or any
authorized deployment/live run.

## Implemented source contract

### Packet integrity and live admission

`tools/release/verify-paid-operation-hosted-release.ts` is now a 38-line
export/CLI facade. `paid-operation-hosted-proof-contract.ts` owns the strict
`agentic-paid-operation-hosted-proof:v1` schema and offline integrity policy;
`paid-operation-hosted-journey.ts` owns authenticated human/agent lifecycle
collection; and `paid-operation-hosted-live-collector.ts` owns Git/Vercel/
GitHub/Convex transports, temporary credential nesting, authoritative
comparison and the sole final-class return. The split removes the rejected
1,592-line combined verifier without adding a second admission seam.

`verifyPacketIntegrity` returns only `packet_integrity_verified` with
`local_packet_integrity_only`. It recomputes the packet checksum and every
public semantic digest; verifies exact scenario order and distinct invocation
references; cross-links provider/operation revisions, source observation,
actors, command versions and hashed command IDs, attempts, effects, counters,
reservations and final semantics; pins the exact automated-adjunct instrument
digest and residual review posture; and scans arbitrary semantic JSON for raw
secret-shaped material. A forged but checksum-valid Vercel section can pass
offline integrity because a checksum cannot observe Vercel. It is then refused
when compared with an authoritative control-plane collection.

Only `collectAndAdmitLivePaidOperationHostedEvidence` can return
`authenticated_exact_revision_hosted_sandbox`. It captures HEAD, derives the
tree from that captured SHA, then rereads HEAD and status to refuse a torn Git
observation. It cross-links the Vercel deployment/production alias and exact
`main`/`CreasyBear/Agentic-Economy` metadata, the public successful GitHub
run/job/step, the Convex deployment receipt plus current `ctx.meta`, fresh
authenticated human DOM/readbacks, independently recomputed structured-agent
semantics, exact v1/v2 checkpoints, and the raw private Convex observation.
It creates the human session and singleton paid-only key inside the path,
revokes both in `finally`, requires Clerk revoked-state readback, and only then
runs the raw observation. Injected dependencies return
`local_live_collector_fixture_only`; they cannot return the final class.
After the journey, both revocation readbacks, raw Convex observation, packet
integrity check and authoritative comparison, the collector immediately takes
a second torn-safe clean Git observation. Neither the injected local-success
class nor the final hosted class can be returned unless that observation still
matches the original observation and the exact target revision/tree. A
clean-to-dirty checkout transition or stable HEAD/tree drift during the live
sequence therefore refuses as `live_source_mismatch`.
`compareAuthoritativeLiveEvidence` returns only `live_evidence_matches`, never
the hosted evidence class. There is no direct terminal-packet admission helper.

The packet verifier failure codes are:

- integrity/shape: `packet_schema_invalid`,
  `packet_checksum_mismatch`, `final_evidence_class_preclaimed`,
  `raw_material_forbidden`, `caller_reconciliation_truth_forbidden`;
- bound identity/semantics: `source_assertion_mismatch`,
  `deployment_assertion_mismatch`, `convex_identity_mismatch`,
  `actor_identity_mismatch`, `scenario_order_mismatch`,
  `transition_invariant_mismatch`, `projection_semantics_mismatch`,
  `internal_observation_mismatch`, `effect_count_mismatch`,
  `active_reservation_mismatch`, `unsafe_uncertainty_continuation`;
- live admission: `live_admission_context_required`,
  `live_source_mismatch`, `live_source_torn`,
  `live_vercel_control_plane_mismatch`,
  `live_github_deployment_mismatch`, `convex_cli_binding_mismatch`,
  `live_convex_observation_mismatch`, `live_human_readback_mismatch`,
  `live_agent_readback_mismatch`, `journey_checkpoint_mismatch`,
  `deployment_receipt_mismatch`, `credential_revocation_mismatch`, and
  `live_collection_failed`.

### Internal proof observation

The new symbol is
`hostedPaidOperation:phase3CHostedProofObservation`, declared only as an
`internalQuery` in `convex/hostedPaidOperation.ts`. It accepts one through
three non-empty, distinct invocation references. Policy lookup uses
`by_policyRef` with `take(2)` to reject zero or multiple policies. The complete
evaluator header cohort uses the owner index with `take(4)` and must equal the
requested reference set. The policy/principal reservation cohort uses the new
compound index with `take(4)` and must equal the header reservation set; active
count is derived from those rows. For each exact invocation, source, payment,
command, attempt, mock effect and evidence-reference prefixes use their indexes
with `take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)`; the control uses `take(2)`.
Exactly one source/payment/control is required. The query cross-links the
control owner caller to the header and every effect payment identifier to its
payment row. A fourth header, orphan reservation, second source/payment,
cap-plus-one child, missing row, counter mismatch, lineage mismatch, hidden old
generation or requested-set mismatch cannot disappear from the observation.

`recordPhase3CDeploymentReceipt` is the companion internal mutation. It is
idempotent for one byte-identical receipt and conflict-refusing otherwise. It
records exact source revision/tree, GitHub run ID/attempt and canonical source
clock plus the fixed repo/ref/workflow/job/step constants; the deployment name
comes only from live `ctx.meta.getDeploymentMetadata()`. The proof query
requires exactly one receipt, returns its digest and current deployment
metadata, and refuses deployment-name or fixed-contract drift.

Its refusal codes include `invocation_ref_count_invalid`,
`proof_deployment_receipt_not_exact`, `proof_deployment_receipt_mismatch`,
`proof_policy_not_exact`, `proof_header_cohort_mismatch`,
`proof_reservation_cohort_mismatch`, `proof_row_missing`,
`proof_row_cardinality_mismatch`, `proof_rows_inconsistent`, and
`proof_child_cap_exceeded`. Returned material is limited to deployment,
policy/counter posture, dates and digests; exact invocation references;
cohort-scoped principal/caller/command/attempt/payment/reservation/kill-owner
digests; provider, operation, revision and environment labels; current truth;
row counts; and sanitized command/attempt/effect observations with canonical
digests. The same principal or caller is intentionally unlinkable across two
different invocation cohorts. It returns no raw owner, command ID, custody
value, evidence value, credential, provider response or payment payload. It
contains no `.collect()`, query `.filter()` or scheduler path.

The collector invokes this still-internal function only as
`npx convex run hostedPaidOperation:phase3CHostedProofObservation ... --prod`
with the explicit configured `CONVEX_DEPLOYMENT` binding and the existing
authenticated CLI account. Its child environment omits deploy/admin keys and
tokens. No Convex URL, admin key or proof truth is accepted from a packet
caller, and no CLI or network command ran in this cut.

### Temporary credential behavior

`withTemporaryClerkApiKey` now accepts an optional `requiredScope`. Omitting it
preserves the existing `customer_requests:create` requirement and the existing
optional `customer_requests:standing_authority` path. A paid-operation caller
may require only `paid_operation:invoke`; unrelated Customer Request,
administrator, wildcard, malformed, missing and oversized scope sets refuse
before key creation. Duplicate permitted scopes are reduced to one. The
existing instance/user checks and create/run/finally-revoke behavior remain the
default for every existing caller. The paid-only evidence overload fixes the
expiration at 3,600 seconds and returns only credential ID, subject, singleton
scope and revoked status after an exact Clerk readback. The matching temporary
user-session overload similarly returns only session ID, subject and revoked
status after readback; both cleanup paths still run when the journey fails.
The paid collector may pass its pinned primary email, while legacy callers
retain the existing acceptance-email default. No Clerk request was made in
this cut.

### Hosted smoke source

`tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts` is inert unless
every exact live input exists. The package command additionally sets
`AE_PAID_OPERATION_REQUIRE_LIVE=1`, so missing input throws instead of
skipping. Before the first lifecycle POST, the source checks that the base URL
is the declared production alias, obtains the exact Vercel deployment and
confirms production state, alias, Git SHA, `main` and
`CreasyBear/Agentic-Economy`, cross-checks the successful public GitHub run,
then authenticates a GET of `/actions/paid/new` and requires the served Vercel
response binding. Trace, video and screenshots are disabled for this
secret-bearing spec; its only attachment is the schema-sanitized packet.

The source performs exactly three sequential creations: human Provider A,
agent Provider A, and agent Provider B response-lost. Each path requires
version 1 ready for permission, version 2 payment authorization created with
payment not submitted and execute as the sole consequential continuation, one
execute, and one effect generation. Provider B exposes only reconcile,
receives exactly `{command, commandId, expectedInvocationVersion}`, and then
exposes only inspect. The human path asserts reload and fresh-context restore;
the collector obtains warm/cold human and agent readbacks for all three. No
retry, provider switch, fourth invocation or caller-supplied truth exists in
the source. The smoke accepts no precreated agent key, human session or Convex
admin key: the collector creates and revokes the first two itself and uses the
existing configured authenticated Convex CLI account for the private query.
Playwright was not run in this cut.

### Closure and residue

`03C-CLOSURE-CLASSIFICATION.md` classifies the Git-derived 89-path Phase 3C
delta: 11 `paid-operation-owned`, 77 `trial-only`, and one
`candidate-shared-after-second-use`. The candidate card contract remains
paid-operation-local; neither it nor `03C-UI-SPEC.md` is promoted to
`DESIGN.md` or a shared contract. The UI spec is phase provenance only.

The no-write import fixture independently derives committed/tracked changes
from the exact Phase 3B base and unions untracked owned files during TDD. It
asserts the derived count/set against the classification, and its omission
falsifier proves a missing classification row cannot be hidden by deleting the
same path from a second manual list. It then simulates exact pre-Phase-3C bytes:
added production paths are absent and modified production paths use
`2debf4b9f65ce228491f7d3d17ed1654a23bb496`. Neutral Action Invocation still
resolves, the hosted Convex owner and Sandbox setup route are absent, and all
non-paid modules plus booking/inquiry/dispatch/communication/cancellation
routes remain unable to import hosted paid-operation DTOs, paid semantics or
the paid card.

Retention review is `2026-08-21`; the kill-switch owner is the Phase 3C release
owner. Temporary credentials are revoked immediately after any later single
run. Admission is then disabled; the three aggregates and sanitized evidence
references remain only through review, after which the owner retires the
account/records and opens the source-removal cut. Expected residuals are
Git/ADR/phase provenance, a sanitized independently admitted packet,
deployment/audit identifiers, revocation audit and necessary historical
digests—never an active reservation, live credential, provider response,
payment payload, custody preimage or trusted evidence value.

## TDD evidence and disposition

Focused REDs were written before each source slice:

| Slice | Primary RED | Disposition |
| --- | --- | --- |
| Credential helper | Paid-only issuance still required Customer Request authority; broad/unrelated or non-singleton scope sets, active/mismatched revocation readback and journey-failure cleanup were not enforced. | Intended failures closed with paid-only evidence overloads while preserving legacy defaults; final credential suite 16/16. One callback-arity fixture mismatch and one edit-splice parse error were mechanical repairs, not accepted semantic REDs. |
| Internal query and receipt | The rejected candidate lacked a deployment receipt, admitted an incomplete header/source/payment/reservation cohort, used cross-run-linkable digests, and could hide prior rows. | Receipt/schema tests first failed on the missing table. Cohort tests then produced three intended failures: missing returned cohort/deployment data, accepted fourth header, and equal digests across cohorts. Hidden header/source/payment/orphan-reservation, caller/payment drift, receipt drift, old-row and cap-plus-one falsifiers now close; final handler suite 24/24. A single expected-code mismatch was a fixture repair. |
| Packet/live admission | The candidate hard-coded the wrong repo/ref, exposed a direct terminal-only admission helper, synthesized early transitions, accepted precreated credentials/admin-key input, combined all responsibilities in one file, and observed the proof checkout only before the long live sequence. | The correct `main`/`CreasyBear/Agentic-Economy` fixture failed first. Strict receipt/run/job, v1/v2 checkpoint, torn-Git, configured-CLI, post-revocation, journey-failure cleanup, self-consistent-raw-contradiction and single-emitter falsifiers then guided the split. Two final REDs proved that clean-to-dirty and stable HEAD/tree drift after raw observation still emitted local success; the second pre-return Git observation closes both. Offline and injected packets remain local-only; final release suite 25/25. |
| Residue | The candidate's hand-maintained artifact list and classification table could omit the same path together. | Replaced with a Git-derived exact Phase 3B delta including untracked owned files. The derived 89-path set, omission falsifier, no-write removal graph and non-paid import scan pass 4/4. |
| Package commands | Artifact integrity and live admission naming could still be conflated. | Exact source/local, `hosted-packet-integrity`, and required-live hosted smoke commands remain distinct and fail closed; no deployment/workflow command was added. |

No RED was accepted from an import/configuration/infrastructure accident. No
network, hosted browser, server, Clerk, Convex CLI/control plane, Vercel,
provider or payment action was used to turn a RED green.

## Focused verification record

| Command | Result |
| --- | --- |
| `npm run verify:paid-operation:hosted-source-local` | PASS — 4 files, 69 tests. |
| `./node_modules/.bin/vitest run tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts tests/unit/action-invocation/hosted-paid-operation-creation.test.ts tests/unit/server/hosted-paid-operation-runtime.test.ts tests/unit/server/hosted-paid-operation-api.test.ts tests/imports/hosted-paid-operation-boundaries.test.ts` | PASS — 5 affected Plan 07A files, 33 tests. |
| `./node_modules/.bin/oxlint` over the twelve cumulative changed TypeScript paths and a correction-specific rerun over the collector/test with `--deny-warnings` | PASS — no diagnostics. |
| `./node_modules/.bin/tsc --noEmit --pretty false` | Broad baseline remains exit 2 with 108 diagnostics/331 output lines; zero diagnostics match an owned TypeScript path. |
| Query-slice scan for `.collect()`, `.filter()`, scheduler, raw custody and raw evidence access | PASS — no matches. |
| Final-label source scan | PASS — the literal is declared once in the proof contract and has exactly one return use in the default live collector; facade, journey, smoke, Convex owner and package contain no literal or bypass helper. |
| Git-derived residue/allowlist/custody audits | PASS — exact 89-path Phase 3C delta; all current changes inside the 15-path allowlist; zero allowlist intersection with the verified 66-entry parent custody manifest. |
| `env -u AE_PAID_OPERATION_HOSTED_PACKET_JSON npm run verify:paid-operation:hosted-packet-integrity` | Expected fail-closed result — `AE_PAID_OPERATION_HOSTED_PACKET_JSON is required`. |
| `git diff --check` over the allowlist | PASS before staging; staged form is rechecked in the Git handoff. |

The inherited broad `test:release:source` command was not used as an
implementation loop or rerun here: it includes the recorded repository-wide
type/lint baseline and build-adjacent work beyond this cut. Codegen, deployment,
hosted/local Playwright, and every external/control-plane command were also not
run.

## Evidence ceiling and remaining external work

This cut establishes only source inspection plus focused local unit/import
fixtures: packet falsification logic, concrete-but-unexecuted collection code,
bounded/redacted proof-query source, least-privilege credential-helper source,
strict smoke source shape, and a simulated retirement boundary.

It does not establish configured policy, temporary credential creation or
revocation, a deployed revision, Vercel/Convex/Clerk reachability, an
authenticated browser or agent run, Provider A/B execution, payment or
settlement, human comprehension, production safety, demand, value, onboarding
or fulfilment. Human comprehension remains `NOT_RUN`; the prior automated
instrument is an adjunct only.

Before any live run the parent must:

1. integrate this bounded commit and the separate P1 payment-reconstruction
   correction described above;
2. add the separately owned exact-SHA workflow job/step contract, run
   release-safety review, configure the exact 3/1/3 policy and owner/dates,
   deploy the exact revision and persist its internal Convex receipt;
3. provide the already authorized Clerk creation authority and exact evaluator
   identity to the smoke. The live path itself must create the one temporary
   human session and paid-only agent key, run once, revoke both in `finally`,
   and prove revoked readback before admission;
4. stop at the first revision, identity, policy, projection, raw-observation,
   counter, reservation, effect or secret contradiction.

Only a successful concrete live admission after those steps may upgrade the
evidence class. The child commit and tree cannot self-identify inside their own
bytes; they are reported with the exact name-status and clean-status custody
handoff after this record is committed.

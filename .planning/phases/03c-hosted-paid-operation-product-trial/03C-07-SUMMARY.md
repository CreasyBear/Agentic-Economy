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
| Add a Phase 3C verifier for `agentic-paid-operation-hosted-proof:v1` | Selected | The verifier independently recomputes checksums and projection semantics, and cross-checks exact Git/deployment identity, both authenticated surfaces, the internal source observation, fixed scenario order, counters, reservations, versions, commands, effects, and the claim ceiling. Only its concrete live collection/admission paths may return `authenticated_exact_revision_hosted_sandbox`, after every independent check succeeds. |

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
`src/modules/action-invocation/paid-operation-application-service.ts:121`.
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

`tools/release/verify-paid-operation-hosted-release.ts` exports typed packet
collection, parsing, integrity verification, authoritative-evidence comparison,
and concrete live collection/admission helpers. The strict packet schema is
`agentic-paid-operation-hosted-proof:v1`.

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

Only `collectAndAdmitLivePaidOperationHostedEvidence` and
`admitLivePaidOperationHostedEvidence` can return
`authenticated_exact_revision_hosted_sandbox`. Both perform a fresh clean Git
revision/tree read, Vercel deployment/alias/Git/ref/repository collection,
independently digested structured-agent readbacks, fresh authenticated human
DOM/readbacks with exact visible payment/settlement/result truth, and the raw
operator-only Convex observation. `compareAuthoritativeLiveEvidence` is
exported for falsification but returns only `live_evidence_matches`, never the
hosted evidence class.

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
  `live_source_mismatch`, `live_vercel_control_plane_mismatch`,
  `live_convex_observation_mismatch`, `live_human_readback_mismatch`,
  `live_agent_readback_mismatch`, `live_collection_failed`.

### Internal proof observation

The new symbol is
`hostedPaidOperation:phase3CHostedProofObservation`, declared only as an
`internalQuery` in `convex/hostedPaidOperation.ts`. It accepts one through
three non-empty, distinct invocation references. Policy lookup uses
`by_policyRef` with `take(2)` to reject zero or multiple policies. Exact
header/source/control/payment/reservation/counter rows use indexed `unique()`
lookups. Every command, attempt, mock effect and evidence-reference row for
each invocation prefix uses its existing index and
`take(HOSTED_PAID_OPERATION_CHILD_CAP + 1)`. A cap-plus-one row, missing row,
counter mismatch, lineage mismatch, or requested-set mismatch refuses instead
of projecting a partial aggregate.

Its refusal codes are `invocation_ref_count_invalid`,
`proof_policy_not_exact`, `proof_row_missing`,
`proof_rows_inconsistent`, and `proof_child_cap_exceeded`. Returned material
is limited to policy/counter posture, dates and digests; exact invocation
references; principal/caller/command/attempt/reservation digests; provider,
operation, revision and environment labels; current truth; row counts; and
sanitized command/attempt/effect observations with canonical digests. It
returns no raw owner, command ID, custody value, evidence value, credential,
provider response or payment payload. It contains no `.collect()`, `.filter()`
or scheduler path.

### Temporary credential behavior

`withTemporaryClerkApiKey` now accepts an optional `requiredScope`. Omitting it
preserves the existing `customer_requests:create` requirement and the existing
optional `customer_requests:standing_authority` path. A paid-operation caller
may require only `paid_operation:invoke`; unrelated Customer Request,
administrator, wildcard, malformed, missing and oversized scope sets refuse
before key creation. Duplicate permitted scopes are reduced to one. The
existing instance/user checks and create/run/finally-revoke behavior are
unchanged. No Clerk request was made in this cut.

### Hosted smoke source

`tests/deploy-smoke/paid-operation-hosted-sandbox-smoke.spec.ts` is inert unless
every exact live input exists. The package command additionally sets
`AE_PAID_OPERATION_REQUIRE_LIVE=1`, so missing input throws instead of
skipping. Before the first lifecycle POST, the source checks that the base URL
is the declared production alias, obtains the exact Vercel deployment and
confirms production state, alias, Git SHA, branch and repository, then
authenticates a GET of `/actions/paid/new`.

The source performs exactly three sequential creations: human Provider A,
agent Provider A, and agent Provider B response-lost. Each path requires
version 1 ready for permission, version 2 payment authorization created with
payment not submitted and execute as the sole consequential continuation, one
execute, and one effect generation. Provider B exposes only reconcile,
receives exactly `{command, commandId, expectedInvocationVersion}`, and then
exposes only inspect. The human path asserts reload and fresh-context restore;
the collector obtains warm/cold human and agent readbacks for all three. No
retry, provider switch, fourth invocation or caller-supplied truth exists in
the source. Playwright was not run in this cut.

### Closure and residue

`03C-CLOSURE-CLASSIFICATION.md` classifies all 86 Phase 3C/Plan 07B artifacts:
11 `paid-operation-owned`, 74 `trial-only`, and one
`candidate-shared-after-second-use`. The candidate card contract remains
paid-operation-local; neither it nor `03C-UI-SPEC.md` is promoted to
`DESIGN.md` or a shared contract. The UI spec is phase provenance only.

The no-write import fixture simulates the exact pre-Phase-3C source bytes:
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
| Credential helper | Paid-only issuance still required Customer Request authority; broad/unrelated scope sets were admitted. | Two intended failures; source corrected; final credential suite 13/13. |
| Internal query | Missing query/ref bounds, partial child reads, hidden prior rows and cap-plus-one acceptance. | Four intended failures. One accidental rate-limit fixture mismatch was mechanical and repaired without weakening the assertions; final handler suite 20/20. |
| Packet/live admission | Missing verifier import was a mechanical file-creation RED; the first typed stub then trusted checksum/self-assertion and missed identity, projection, raw-observation, uncertainty, count and live-context falsifiers. | Mechanical import repaired; intended semantic REDs closed. Later checksum-valid provider/attempt/residue/instrument/command-ID, semantic-continuation, hidden-secret and base-alias REDs all failed before their independent cross-links were added; final release suite 15/15. |
| Residue | Missing 86-row classification and absent retention/owner/trigger posture. | Two intended failures. Directory-as-file and over-broad paid-route scanning were fixture mechanics and repaired first; final residue suite 4/4. |
| Package commands | No distinct source, integrity-only packet and required-live smoke commands. | One intended failure; exact scripts added without changing existing release semantics. |

No RED was accepted from an import/configuration/infrastructure accident. No
network, hosted browser, server, Clerk, Convex CLI/control plane, Vercel,
provider or payment action was used to turn a RED green.

## Focused verification record

| Command | Result |
| --- | --- |
| `npm run verify:paid-operation:hosted-source-local` | PASS — 4 files, 52 tests. |
| `./node_modules/.bin/vitest run tests/unit/action-invocation/hosted-paid-operation-persistence.test.ts tests/unit/action-invocation/hosted-paid-operation-creation.test.ts tests/unit/server/hosted-paid-operation-runtime.test.ts tests/unit/server/hosted-paid-operation-api.test.ts tests/imports/hosted-paid-operation-boundaries.test.ts` | PASS — 5 affected Plan 07A files, 33 tests. |
| `./node_modules/.bin/oxlint` over the eight changed TypeScript paths with `--deny-warnings` | PASS — no diagnostics. |
| `./node_modules/.bin/tsc --noEmit --pretty false` | Broad baseline remains exit 2 with 331 output lines; zero diagnostics match an owned TypeScript path. |
| Query-slice scan for `.collect()`, `.filter()`, scheduler, raw custody and raw evidence access | PASS — no matches. |
| Final-label source scan | PASS — the literal and its two return sites exist only in the verifier's concrete live-admission module; the smoke, Convex owner and package contain no literal. |
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
2. run release-safety review, configure the exact 3/1/3 policy and record its
   owner/dates without widening it;
3. create the one temporary human session and paid-only agent key through the
   existing helper, authorize and perform one exact deployment/run, and revoke
   them in `finally`;
4. stop at the first revision, identity, policy, projection, raw-observation,
   counter, reservation, effect or secret contradiction.

Only a successful concrete live admission after those steps may upgrade the
evidence class. The child commit and tree cannot self-identify inside their own
bytes; they are reported with the exact name-status and clean-status custody
handoff after this record is committed.

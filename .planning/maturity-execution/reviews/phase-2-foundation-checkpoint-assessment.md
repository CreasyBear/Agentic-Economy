---
assessment_date: 2026-08-26
verdict: SAFE_REBASELINE_INPUT_EVIDENCE_OPEN
phase_2_status: INCOMPLETE_NOT_ACCEPTED_NOT_MATURE
assessment_base: 6a56ae64794362a0f387102884112bbaffdda363
candidate_checkpoint: f293325c87934e5fefc52c1dbc8cb3b799d00aa0
preserved_partial_source: a0ced993c729738ef6833b0291f4d9502f9481af
accepted_phase_1_source: ae284871d9d5bad40245182aefd6f2050d53b556
phase_1_handoff: d20d62d8255ee7a38ce7cb8f1c618b1e0393d4e0
inventory_ref: 85486e84fb46c775c64b177f9ddd85d76146bc11
product_finding_input: 22f4930ec6a56b27f246f6c8c010d6dc71c40e80
implementation_authorization: WITHHELD
---

# Phase 2 foundation checkpoint independent assessment

## Single verdict

**SAFE_REBASELINE_INPUT_EVIDENCE_OPEN**

Checkpoint `f293325c87934e5fefc52c1dbc8cb3b799d00aa0` is safe input to a maturity
rebaseline because it preserves the exact incomplete state, names the failed
foundation gates, withholds the 298-registration migration, separates hosted
evidence, and makes no Phase 2 acceptance claim. It is **not** safe to adopt as an
accepted Phase 2 source baseline. Phase 2 is incomplete, unaccepted and not mature.

The rebaseline should preserve the checkpoint and inventory as historical evidence;
keep accepted Phase 1; replace the load-bearing registrar capability analyzer with
documented runtime Convex patterns; and exclude or revert the 17-file partial-source
patch initially, selectively re-landing only changes that survive owner-level review
and tests. Open source, integration, hosted and product-operability evidence is why
the verdict carries `EVIDENCE_OPEN`.

## Scope and review discipline

This was an assessment, not implementation or repair. No registrar repair, checker
expansion, source migration, hosted credential use, Phase 3 design or full release
close was performed.

The required GSD workflow prerequisite check returned `phase_found:false`,
`roadmap_exists:false`, no canonical phase directory and no plans. The complete
`gsd-code-review` workflow would have emitted a phase REVIEW artifact, while
`gsd-secure-phase` applies to a completed phase with `SECURITY.md` or a PLAN threat
model. Those prerequisites do not fit this deliberately incomplete checkpoint or
the two-artifact constraint. No ROADMAP, phase metadata, REVIEW or SECURITY artifact
was fabricated. The installed `gsd-code-reviewer` and `gsd-security-auditor` roles
were used as bounded report-only reviewers instead.

The architecture review used the installed Codebase Design module/interface/seam/
depth/locality framework. Convex review followed the full installed reviewer and
expert skills plus the repository-specific `convex/_generated/ai/guidelines.md`
before implementation inspection. Unlazy orchestrated mode used the companion gate
artifact as the only ledger because the task permits exactly two new files.

Four non-overlapping report-only reviews were received and independently integrated:

| Review leaf | Boundary | Result |
| --- | --- | --- |
| architecture/domain | Phase 1–2 coherence, modules, seams, registrar design | Phase 1 coherent; selected Phase 2 domain modules salvageable; production foundation not coherent; replace the load-bearing static capability analyzer. |
| authority/security/Convex | all 17 preserved files, authz, validators, runtime trust boundaries | Mostly defensive hardening, but unsafe as an accepted aggregate patch; exclude/revert initially and re-land selectively; registrar static control has two high-severity migration blockers. |
| evidence/tests/gates | failure reproduction, coverage, stale/substituted evidence, source/hosted boundary | Evidence is bounded and useful, not acceptance-grade; two bypasses and coverage failure reproduced; further diagnostic and artifact attribution weaknesses found. |
| product operability | canonical control-plane UI/support and AE-PAP-024 | AE-PAP-024 confirmed; high risk for an operated-platform claim, but explicitly post-Phase-2 rebaseline scope. |

Every leaf reported no edits and stopped at its assigned end condition. The driver
reran the deciding bypass, coverage, inventory, gate and attribution checks.

## Exact refs, state and changed inventory

- `codex/ae-maturity-phase-2` resolves exactly to
  `f293325c87934e5fefc52c1dbc8cb3b799d00aa0`.
- The assessment checkout began detached at that exact commit. Tracked, staged and
  ordinary untracked status was empty before assessment artifacts were added.
- Supplied refs resolve and ancestry is linear through accepted Phase 1, inventory,
  foundation verdict, preserved source and checkpoint. In particular,
  `85486e84 -> 6a56ae64 -> a0ced993 -> f293325c`, and accepted Phase 1 is an
  ancestor of the checkpoint.
- `a0ced993^..a0ced993` changes exactly 17 source files: 554 insertions and 69
  deletions. `a0ced993..f293325c` adds only
  `.planning/maturity-execution/PHASE-2-FOUNDATION-CHECKPOINT.md`; therefore
  `6a56ae64..f293325c` is exactly 18 files.
- The broader accepted-Phase-1-to-checkpoint delta is 370 files: 51 planning, 75
  Convex, 56 `src`, 177 tests, seven tools and four root/config files, with 173,751
  insertions and 1,343 deletions. That is blast-radius context, not a claim that all
  370 files are accepted Phase 2 work.
- No 298-registration migration commit exists after the stop-line. The checkpoint
  states this at `PHASE-2-FOUNDATION-CHECKPOINT.md:1-5,65-76`.

### Measured gates

The named Unlazy checker and direct checkbox counts agree:

| Ledger | Measured state | Interpretation |
| --- | ---: | --- |
| Start built-dispatcher leaf | 8/8 | Source-only build/negative-middleware foundation met; hosted positive identity still open. |
| registrar/capability foundation leaf | 3/8 | G3, G4, G5, G7 and G8 open. |
| authority foundation node | 1/6 | Only inventory checked; G2–G6 open. |
| Phase 2 root | 0/6 | No phase integration or acceptance gate checked. |

All five original P2 leaf ledgers display 7/7 checked, but those marks are not phase
acceptance evidence. P2-02's surface adapters have no production consumer and its
tests exercise the interface only; P2-05's earlier generated matrix was part of the
projection/reachability evidence failure. The later authority-repair tree correctly
keeps runtime families, close, release and migration integration red. The 0/6 root
ledger outranks leaf self-certification.

## What genuinely works

### Accepted Phase 1

Phase 1 is the coherent foundation to preserve. Its Principal, Account, ownership,
membership, external-identity, Credential and workload-context registries expose
small domain interfaces over injected stores and concentrate lifecycle, provenance,
replay and canonical-context rules. `src/modules/principal-account/public.ts:1-15`
is the public composition seam; the registries and workload admission retain real
depth because deleting them would spread substantial invariants into callers.

Accepted Phase 1 remains `SOURCE_ACCEPTED_EVIDENCE_OPEN`, not hosted-complete. Its
open Clerk/cloud, live reset-adapter and later production-wiring evidence remains
open under the later gates; none is silently promoted here.

### Reusable but unaccepted Phase 2 material

- The deterministic registration inventory is reproducible as **static registration
  identity**: 298 registrations across 52 files, 119 public, 172 internal, seven
  HTTP, 208 ordinary and 90 Generic, with 298 classified and zero unresolved or
  duplicate identities. The test and tool explicitly name their scope as
  `registration_identity_only`; it proves neither migration nor runtime authority.
- The current Start build/dispatcher repair is a real source capability within its
  stated credential-free boundary: production middleware composition loads and
  missing/invalid credentials fail closed. Genuine Clerk-issued positive execution
  remains hosted P9-01 evidence.
- `DelegationService`, `ConnectionLifecycleService` and `SecretPlane` are promising
  deep domain modules over injected ports. They are salvageable review candidates,
  not an integrated platform verdict.
- Typecheck passes on the checkpoint bytes. Focused registrar tests pass 9/9 and
  the runner prints `safe=6 unsafe=24 diagnostics=26`; that establishes the covered
  cases only.

## What is incomplete, false, overbuilt or insufficiently integrated

- No production file consumes `convex/lib/authorityRegistrars.ts`; only definitions,
  fixtures and generated typing refer to it. No registration migration occurred.
- Only the interactive protected registrar has runtime canonical admission.
  Narrow-system/dev registrars add a classification label, explicitly not authority
  (`convex/lib/authorityRegistrars.ts:374-442`).
- The nine named cross-surface adapter creators are shallow aliases over one boundary
  and have no production instantiation. They are hypothetical seams and test-only
  proof, not HTTP/MCP/CLI/callback/job/cron/reconciliation composition.
- Interactive and agent authority independently re-query the Phase 1 credential,
  principal, Account, ownership and membership chain. The preserved patch adds
  near-duplicate row converters in catalog and cron code and duplicates interactive
  authority conversion in chat. This loses locality and multiplies schema/invariant
  repair sites.
- Storage/schema composition is not runtime integration. No 242-surface actual-
  handler denial/isolation matrix, cross-leaf close, post-checkpoint release,
  housekeeping close or Phase 2 acceptance exists.
- The eight-mode registrar vocabulary and large manifests were designed before
  concrete migrated callers and before the capability proof survived elementary
  JavaScript syntax. That is overbuilt relative to the verified runtime seam.

## Registrar/static-rule architecture decision

**Decision: retain the inventory and official runtime custom-function idea; replace
the bespoke ESLint capability/dataflow checker as a load-bearing security control.**

The current checker makes authorization depend on spelling JavaScript within a
finite grammar. Each alias, destructure, aggregate object, cast or escaped value
adds a second interface that maintainers must learn and another whack-a-mole repair.
The rule may remain only for facts it can prove locally: raw builder import
confinement, allowed registrar imports and literal registration categories.

The rebaseline should use the documented mature patterns:

1. Use Convex Helpers `customQuery`, `customMutation` and `customAction` to perform
   concrete authentication/authorization before the handler and inject checked
   canonical facts. The installed helper merges `{ ...ctx, ...added.ctx }`; it does
   **not** natively delete raw context fields. A least-privilege membrane therefore
   requires explicit wrapper objects or an additional enforced boundary, plus tests
   that prove raw `db`, scheduler and `run*` capabilities are unavailable where the
   design claims they are unavailable.
2. Keep registered functions thin and co-locate authorization with the endpoint's
   concrete resource intent; move domain behavior into plain TypeScript modules.
3. Use internal functions for server-only work, but validate durable authority and
   invariants again because scheduling does not propagate authentication.
4. Where row-level rules genuinely fit, use the documented Convex Helpers database
   wrapper with `defaultPolicy: "deny"`; do not invent another policy engine.
5. Prove each vertical slice through the actual registered reference and real domain
   adapter, with consequence-time revalidation for delayed/external work.
6. Use standard ESLint `no-restricted-imports` or an equivalently narrow local rule
   for import discipline, not AST alias inference as runtime confinement proof.

References:

- [Convex authorization in practice](https://stack.convex.dev/authorization)
- [Convex custom functions](https://stack.convex.dev/custom-functions)
- [Convex Helpers custom-function source](https://github.com/get-convex/convex-helpers/blob/main/packages/convex-helpers/server/customFunctions.ts)
- [Convex row-level security pattern](https://stack.convex.dev/row-level-security)
- [Convex internal functions](https://docs.convex.dev/functions/internal-functions)
- [Convex scheduled functions](https://docs.convex.dev/scheduling/scheduled-functions)
- [Convex best practices](https://docs.convex.dev/understanding/best-practices/)
- [ESLint no-restricted-imports](https://eslint.org/docs/latest/rules/no-restricted-imports)

These sources document runtime authorization and discoverable endpoint seams. They
do not certify AE's custom registrar design; AE still owns its business rules and
tests.

## Known failures independently reproduced

### Protected-context destructuring

Using ESLint 10, the installed TypeScript parser and the unchanged project config,
an in-memory protected handler containing:

```ts
const { db } = ctx;
await db.insert("owners", value);
```

returned `errorCount:0` and no `ae/phase-2-authority-entry` diagnostics. The rule's
alias check requires an identifier declarator, and direct capability recognition is
rooted at the original `ctx` identifier.

### Aggregate registrar selection

An in-memory source containing:

```ts
const modes = { protectedInteractiveMutation, narrowSystemMutation };
const selected = modes[key];
```

also returned no diagnostic. `containsAuthorityBinding` covers identifiers,
conditionals and logical expressions, not aggregate-object members. Because the
exemption registrar performs no admission, this is a high-severity migration
blocker even though it is not currently reachable production behavior.

### Coverage shortfall

The focused two-file Istanbul run measured:

| Load-bearing file | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `convex/lib/authorityRegistrars.ts` | 100% (62/62) | 100% (2/2) | 100% (28/28) | 100% (62/62) |
| `tools/eslint-rules/phase-2-authority-entry.mjs` | 84.11% (180/214) | 74.45% (204/274) | 100% (25/25) | 88.08% (170/193) |
| `tools/eslint-rules/run-phase-2-authority-entry.mjs` | 73.91% (34/46) | 55.55% (20/36) | 75% (9/12) | 75.55% (34/45) |

This reproduces the verifier table and fails the literal 100% changed-critical-path
gate. The checkpoint and leaf ledger repeat an older `83.64/74.08/100/87.56`
measurement for the rule. The failure is stable, but the packet's numeric coverage
claim is unreconciled.

## Evidence and gate trust audit

### Exact-diagnostic substitution

The runner compares sorted message/capability/target signatures by filename, but
discards registration identity and location. A driver-owned in-memory probe left
the intended registration clean, moved the same `db_write` diagnostic to a
registration named `substitute`, and produced:

```text
actual message: Registration '...protected-db-write.ts:substitute' uses ... 'db_write'
runner signature: unlistedCapability:db_write
expected signature: unlistedCapability:db_write
wouldRunnerAccept: true
```

Thus the improved runner prevents cross-message substitution but does not prove
that the intended registration/invariant failed at the intended source location.
The checkpoint's “exact diagnostic identity” wording is too broad.

### Test-only paths and mocks

- Registrar “actual references” are registrations in
  `tests/fixtures/phase-2-authority-entry-foundation/registered.ts`, loaded by
  `convex-test`. This proves wrapper behavior but not migrated production refs.
- Tests insert canonical rows directly and use `withIdentity`; they do not prove
  hosted Clerk JWT issuance, the Clerk/Convex template, live account isolation or
  deployed revision binding.
- External Infisical HTTP/OIDC is mocked at its supported transport seam. This is
  appropriate source testing but not live vault, rotation or audit evidence.
- The inventory proves symbol registration identity only. Its large exact counts
  must not be promoted into dominance, effect-path or runtime behavior claims.

### Stale and misattributed artifacts

The retained pre-fix Start worktree is actually at
`787396e15b1d7c3e769b00843d3bcc8326e80d19`, while
`PHASE-2-START-BUILT-DISPATCHER-EVIDENCE.md:10` labels its candidate as the later
inventory ref `85486e84...`. The unchanged regression tool re-read the retained
worktree HEAD, returned candidate `787396e1...`, reproduced HTTP 500 and
`ReferenceError: setErrorThrowerOptions is not defined`, then emitted
`START_BUILT_DISPATCHER_REGRESSION_REPRODUCED`. It is useful historical defect
evidence, not exact-candidate proof for `85486e84` or `f293325c`.

The checkpoint says ignored `output/` was retained, but this fresh assessment
checkout contains no such evidence tree. Ignored, worktree-local coverage/release
output therefore cannot be treated as durable checkpoint evidence without a fresh
run or a committed digest-bound record. No full release was run because the
checkpoint explicitly leaves it open and no disputed source claim required it.

### Source versus external evidence

| Category | Supported at this checkpoint |
| --- | --- |
| source-proven | exact Git refs/ancestry and 17-file scope; typecheck; 298/52 static inventory; current Start credential-free negative boundary; two registrar escapes; load-bearing coverage failure; ledger state. |
| test-harness-only | fixture registrar behavior through `convex-test`; injected local identities and canonical rows; isolated domain services; mocked external seams. |
| hosted/external | genuine Clerk session/template and deployed isolation; live Infisical OIDC/vault/rotation/audit; production provider consequences and audit streams; revision/freshness-bound operational proof. |
| open/unproven | 298-registration migration; 242-surface actual-handler matrix; production cross-surface composition; release/housekeeping/zero-ABANDON close; Phase 2 acceptance. |

## Audit of the 17 preserved partial-source edits

The patch is mostly defensive type/validator/fail-closed hardening, and checkpoint
typecheck passes. It is nevertheless a cross-cutting, unaccepted slice spanning
identity, invocations, journals, catalog, chat, cron, secrets and internal HTTP. It
closes no Phase 2 integration gate and duplicates canonical conversion logic.

| File | Assessment |
| --- | --- |
| `convex/agentAccessPrincipals.ts` | Fail-closed array narrowing; retain only with its agent-registration tests. |
| `convex/capabilityOperationInvocations.ts` | Fail-closed row narrowing, but canonical authority resolution precedes signed source admission on public actions, exposing a validity/oracle and pre-admission query surface (`:627-717,831-867,948-988,1132-1154`). Rebaseline admission order explicitly. |
| `convex/capabilityProviderConsequenceJournal.ts` | Replaces `v.any` with exact observation and depth-bounded JSON validation (`:649-719,854-990`); useful hardening but compatibility must be exercised against every operation result. |
| `convex/catalogOfferingMutations.ts` | Replaces unsafe casts with branded row conversion (`:230-344`) but duplicates canonical Phase 1 adapters also added to cron. Centralize before retaining. |
| `convex/chatGenerate.ts` | Explicit scheduled authority conversion/revalidation (`:24-44,71-110`), but duplicates interactive conversion logic. |
| `convex/interactiveAuthority.ts` | Mostly fail-closed ambiguity and branded reconstruction (`:205-238,408-502,579-697`); remains one of multiple duplicated canonical resolvers. |
| `convex/lib/canonicalAgentAuthority.ts` | Strong fail-closed canonical chain (`:42-140`), but duplicates the interactive chain and should consume one canonical Convex adapter. |
| `convex/providerConsequenceHttp.ts` | Bounded/authenticated HTTP and tighter result typing (`:13-58,191-315`); runtime compatibility still needs operation-level proof. |
| `convex/recoveryBreakGlass.ts` | Missing Account now fails closed before effect (`:445-451`); source remains unaccepted recovery material. |
| `convex/secretLifecycleHttp.ts` | Constant-time comparison now rejects missing bytes (`:59-71`); targeted hardening. |
| `convex/workloadCron.ts` | Depth-bounded JSON and explicit domain reconstruction (`:227-383,417-643,763-821`); duplicates catalog conversion and can reject previously accepted deep/non-JSON results. |
| `src/modules/capability-execution/invocation-worker/jitProviderConsequence.ts` | Type-only JSON narrowing; the union with `Record<string, unknown>` is not runtime proof (`:83-97,186-203`). |
| `src/modules/capability-execution/invocation-worker/providerConsequenceBridge.ts` | Missing invocation digest refuses before ticket issue (`:124-151`); targeted hardening. |
| `src/modules/secrets/infisical-cloud.ts` | Validates external JSON (`:44-60,377-387`) but recursively walks an externally sized response without a visible byte/depth bound; availability risk. |
| `src/modules/secrets/vercel-oidc.ts` | Missing JWT payload segment fails closed (`:100-148`); targeted hardening. |
| `src/routes/api.internal.provider-consequence.ts` | JSON/result validation and guarded dispatch (`:42-51,257-329,536-621`); targeted hardening. |
| `src/routes/api.internal.secret-lifecycle.ts` | Exact journal parsing and explicit advance fields (`:85-124,267-334,377-405`), but pointer-read fields are coerced without equivalent exact validation (`:311-320`). |

**Retention decision:** retaining commit `a0ced993` as immutable review evidence is
safe. Treating its aggregate bytes as an accepted baseline is not. Begin the
rebaseline from accepted Phase 1 plus explicitly retained checkpoint artifacts,
exclude/revert these 17 source edits, then re-land the worthwhile fail-closed
changes in small owner-scoped commits with canonical adapter reuse, exact runtime
validators and focused tests. This avoids losing genuine hardening while refusing
an unverified cross-cutting composition.

## Product operability and support

Root-only commit `22f4930ec6a56b27f246f6c8c010d6dc71c40e80`
adds only AE-PAP-024 to the papercut registry. It was inspected and not cherry-picked.
The finding is confirmed: existing UI is shaped around Clerk profile/settings,
legacy caller keys/approvals, marketplace/supplier flows and specialized provider
connections, not the canonical control plane.

| Canonical operator need | Current UI/support state | Rebaseline implication |
| --- | --- | --- |
| Principal lifecycle and identity continuity | no Principal inventory/detail/lifecycle surface | post-Phase-2 canonical projection and support runbook |
| Account inspection and switching | “Account” settings are Clerk `UserProfile`; no canonical selector | high priority; current exact-one authority resolver can reject a legitimate multi-Account Principal as `account_access_ambiguous` |
| ownership and membership | no list/invite/end/transfer/succession UI | self-service and staff escalation classification required |
| external binding and Credential generation/rotation/revocation | Clerk session and legacy key UI do not expose canonical binding/Credential facts | safe status/correlation diagnostics and rotation workflow required |
| autonomous-agent/workload/Harness identity | agent-key UI exists; canonical ownership/workload/Harness control does not | define whether Harness remains a distinct noun, then provide human oversight |
| delegation/grant ancestry | legacy scopes/budgets only; no canonical tree, narrow or revoke workflow | approval and revocation control plane required |
| Connection sharing/lifecycle | supplier x402 add/reconnect/revoke UI only; no general shares/leases/delete | preserve as labelled adapter, not canonical truth |
| RecoveryPolicy and break-glass | recovery copy and post-event audit only; no policy/dual-control/freeze/isolate ceremony | incident-critical staff/human workflow required |
| secret lifecycle | internal automation only; no operator status/reconcile view | machine automation plus human oversight/support boundary required |

This is **not Phase 2 repair scope**. Add a post-Phase-2 product-operability
workstream to the rebaseline with a canonical capability-to-UI/CLI/MCP/API/staff/
support matrix and explicit self-service, dual-control, staff-only and machine-only
classifications. Preserve existing keyboard, landmark, labelled-control, live-status
and touch-target accessibility strengths when the coherent console is designed.

## Process failures and concrete GSD-forensics inputs

1. **The proof property was wrong before repair began.** Reachability and 27
   representative sinks were projected across 207 protected handlers; one
   `saveOwnerOfferingServer` example collapsed five effect dispatches and reused an
   unrelated test. Forensics should reconstruct when reachability became described
   as dominance and why per-registration/effect-path proof was not frozen first.
2. **Mechanical green was treated as semantic green.** Checkboxes, exact counts and
   a diagnostic corpus passed while the intended trust boundary and registration
   identity could still be substituted. Require hostile semantic counterexamples
   and independent trust-boundary review before marking a security leaf complete.
3. **The checker became the architecture.** Each missed JavaScript form invited
   one more alias/dataflow repair. Forensics should identify the decision that made
   a bounded lint rule load-bearing and apply a stop criterion: keep only locally
   decidable lint facts; move authority to runtime seams.
4. **Leaf interfaces were not production composition.** P2-02 and P2-05 checked
   service/fixture ledgers without production consumers, while root integration
   stayed red. Later plans need vertical slices through one actual registered
   endpoint, production adapter, effect and rollback unit.
5. **Canonical facts lost locality.** Shared-file ownership and parallel repair
   produced repeated Principal/Account/ownership/membership converters and separate
   authority resolvers. Assign one integration-owned Convex adapter and parser seam.
6. **Unlazy invocation contaminated evidence.** AE-PAP-014 records that a positional
   checker invocation scanned/wrote sibling ledgers. Continue requiring one named
   ledger with `--status --timeout 120`, then inspect planning diffs and rerun a raw
   check before accepting evidence.
7. **Stale local artifacts carried claims.** Coverage numbers diverged and a retained
   Start artifact was labelled with the wrong candidate. Every durable artifact
   needs exact commit/build digest, command, freshness and source/external class.
8. **Product operation entered after backend architecture.** Machine surfaces were
   inventoried at 242 rows plus edges without an equivalent human inspect/change/
   recover/escalate matrix. Add a post-Phase-2 operability gate to the rebaseline;
   do not retrofit UI into the current incomplete phase.
9. **Terminology drift obscured the gap.** Legacy Account/Principal/Credential/
   Connection/Recovery labels referred to Clerk, money, caller keys and provider
   adapters while canonical entities lacked projections. Require ubiquitous-language
   review across source, UI, support and evidence.
10. **Dispatch/tool state added noise.** Missing GSD ROADMAP prerequisites, missing
    routed Clerk skills, stale child-goal display and Ox/provider rate limits were
    preserved as tool/process evidence. Do not manufacture metadata or reinterpret
    tool failures as source verdicts.

## Ox Alpha adversarial challenge

A fresh version-matched Ox Alpha process ran through Codex CLI `0.149.0` with the
installed `ox-alpha` profile (`stealth/ox-alpha`, OpenRouter), read-only sandbox and
`never` approval policy. The first high-effort run independently reproduced both
registrar escapes and verified the refs, ledgers and artifact attribution, but the
provider returned HTTP 429 before a final response. One bounded medium-effort retry
completed successfully with session `01a03db0-5671-7b51-a023-1a0b79aa9e34`.

Ox found no blocking defect and independently upheld
`SAFE_REBASELINE_INPUT_EVIDENCE_OPEN`. It confirmed the exact lineage, 298/52
inventory, 17-file scope, bypass severity, exclude/re-land decision, evidence split
and AE-PAP-024 scope. Its one material challenge was correct: Convex Helpers merges
custom context into the original context rather than removing raw fields. The
architecture recommendation above is corrected to require explicit wrappers or an
additional enforced membrane and proof; the assessment no longer attributes native
context removal to the helper. Ox also noted residual reliance on bounded prior-run
reports, which remains carried by `EVIDENCE_OPEN`. No verdict change is warranted.

This challenge judges rebaseline-input safety only. It does not accept or complete
Phase 2.

## Rebaseline contract implied by this verdict

- Preserve accepted Phase 1 and this checkpoint/evidence lineage.
- Do not accept or continue Phase 2 from the old checked leaf marks.
- Preserve the 298/52 inventory as static scope input; regenerate after any source
  decision and never call it runtime proof.
- Replace capability/dominance lint as a security boundary with documented runtime
  custom-function/domain seams and actual-reference vertical tests.
- Exclude/revert the 17 partial files initially; re-land reviewed hardening only.
- Re-establish one canonical Convex Principal/Account adapter and parser locality.
- Define a smaller sequence of authority modes/endpoints, each with a production
  caller, seven-shape authority tests where applicable, effect-path evidence,
  rollback and release ownership.
- Carry hosted Clerk, Infisical/provider and audit evidence with exact revision and
  freshness owners; do not turn missing hosted access into a source pass or fail.
- Add the post-Phase-2 canonical operator-console/support workstream without adding
  UI scope to this Phase 2 checkpoint.
- Feed the ten process findings above into a later GSD forensics task. This assessment
  does not start that task.

No migration, later phase or source repair is authorized by this verdict.

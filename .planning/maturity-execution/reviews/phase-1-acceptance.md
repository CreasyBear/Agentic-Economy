# AE Full-Maturity Phase 1 acceptance review

Date: 2026-08-25 (Australia/Perth)

## Verdict

**CHANGES_REQUIRED. Phase 2 remains blocked.**

The candidate is the expected ref with the required ancestry, the worktree began clean, all 34 frozen checkboxes are mechanically marked met, the four raw leaf suites pass 18/18, the combined Phase 1 sweep passes 112/112, and the exact Node 22 release command passes in the prepared local environment. Those green results do not satisfy the source-acceptance rule because three source-level acceptance failures remain:

1. Account succession accepts a caller-constructed authorization with no trusted provenance or threshold-approval proof. A focused acceptance test reproduces Account takeover.
2. Legacy reset replay trusts a syntactically valid receipt supplied by the execution port and reports deletion that did not occur. A focused acceptance test reproduces the false `already-applied` result.
3. The frozen Phase 1 G3 check and exact release wrapper are not hermetic from a clean checkout: `test:imports` consumes the ignored `packages/cli/dist/ae.js` before the release wrapper's later `test:cli-package` step builds it. The raw G3 command failed until an undeclared manual CLI build supplied that artifact.

This review applies the corrected three-way policy:

- `SOURCE_ACCEPTED`: source outcomes and checks pass; Phase 2 may start.
- `SOURCE_ACCEPTED_EVIDENCE_OPEN`: source acceptance passes and named external evidence remains open at its eventual gate; Phase 2 may start.
- `CHANGES_REQUIRED`: a source defect, false Phase 1 gate, authority/isolation violation, or unsafe dependency for Phase 2 remains; Phase 2 is blocked.

Cloud authorization, hosted consequence proof, vendor credentials, legal work, soak time, and commercial metrics are not used as Phase 1 blockers. Deferred live legacy deletion is also not a blocker by itself: the frozen blast-radius contract explicitly retains legacy compatibility until a later migration, and Ox found no present authorization bypass created by that deferral. Those items are recorded under **Open external evidence**.

## Exact review boundary

- Candidate branch: `agent-p1-01-principal`
- Expected candidate HEAD: `1cf8cd82a2817137ee3e0bc4e0540a12b53c4225`
- Observed branch ref: `1cf8cd82a2817137ee3e0bc4e0540a12b53c4225`
- Observed worktree HEAD: `1cf8cd82a2817137ee3e0bc4e0540a12b53c4225` (detached at the candidate)
- Baseline: `868c2fc673f35340dd2079176ab7f913ca665efb`
- Ancestry: `git merge-base --is-ancestor <baseline> HEAD` exited 0
- Candidate commits above baseline: 24
- Starting worktree: clean (`git status --porcelain` produced no output before review artifacts were created)
- Scoped diff: 36 files, 5,663 insertions, 54 deletions

`AGENTS.md` and `convex/_generated/ai/guidelines.md` were read before Convex inspection. The authoritative source contract was `.planning/maturity-execution/PLAN.md`; exact acceptance ledgers were the four `leaf-P1-*` files and `phase-1.md`. No milestone, roadmap, requirements set, replacement plan, production repair, or Phase 2 work was created.

## Candidate changed-file inventory

The exact `git diff --name-only 868c2fc673f35340dd2079176ab7f913ca665efb...1cf8cd82a2817137ee3e0bc4e0540a12b53c4225` inventory is:

```text
.planning/maturity-execution/PHASE-1-BLAST-RADIUS.md
.planning/maturity-execution/PLAN.md
.planning/maturity-execution/gates/leaf-P1-01.md
.planning/maturity-execution/gates/leaf-P1-02.md
.planning/maturity-execution/gates/leaf-P1-03.md
.planning/maturity-execution/gates/leaf-P1-04.md
.planning/maturity-execution/gates/phase-1.md
convex/schema.ts
src/modules/principal-account/account/convex-schema.ts
src/modules/principal-account/account/public.ts
src/modules/principal-account/account/registry.ts
src/modules/principal-account/external-identity/convex-schema.ts
src/modules/principal-account/external-identity/public.ts
src/modules/principal-account/external-identity/registry.ts
src/modules/principal-account/principal/convex-schema.ts
src/modules/principal-account/principal/public.ts
src/modules/principal-account/principal/registry.ts
src/modules/principal-account/public.ts
src/modules/principal-account/workload-context/public.ts
src/modules/principal-account/workload-context/workload-context.ts
tests/maturity/leaf-P1-01.test.ts
tests/maturity/leaf-P1-02.test.ts
tests/maturity/leaf-P1-03.test.ts
tests/maturity/leaf-P1-04.test.ts
tests/maturity/phase-1-principal-account-integration.test.ts
tests/unit/principal-account/account/account-registry.test.ts
tests/unit/principal-account/external-identity/external-identity-registry.test.ts
tests/unit/principal-account/principal/principal-registry.test.ts
tests/unit/principal-account/workload-context/legacy-identity-reset.test.ts
tests/unit/principal-account/workload-context/workload-context.test.ts
tests/unit/release/coverage-source-classification.test.ts
tests/unit/schema/convex-schema.test.ts
tools/maturity-reset/legacy-identity-reset.ts
tools/maturity-reset/public.ts
tools/release/coverage-source-classification.ts
tools/release/verify-coverage-ratchet.ts
```

## Independently measured frozen gates

The installed Unlazy checker was run separately for every scoped ledger, with `--status` placed before each file to avoid the known positional-argument quirk.

| Ledger | Mechanical status | Raw acceptance execution | Semantic result |
|---|---:|---:|---|
| P1-01 Principal registry | 7/7 `ALL MET` | leaf suite 3/3 | Source outcome sustained |
| P1-02 Account lifecycle | 7/7 `ALL MET` | leaf suite 5/5 | **Refuted by caller-forgeable succession** |
| P1-03 External identity/credentials | 7/7 `ALL MET` | leaf suite 5/5 | Source outcome sustained |
| P1-04 Workload/reset | 7/7 `ALL MET` | leaf suite 5/5 | **Refuted by forged reset receipt**; live deletion itself deferred/non-blocking |
| Phase 1 integration | 6/6 `ALL MET` | combined suite 112/112 in 10 files | **G3 false from clean source due undeclared CLI build prerequisite** |

Total mechanical count: **34/34**. Operational `ABANDON` entries: **0** (the only string occurrence is prose stating that none were found). Total raw leaf assertions: **18/18**. The acceptance-only exploit suite passes **2/2** because each test successfully reproduces its defect.

All four raw leaf test files were run independently under Node 22.22.0. The placeholder scans and typecheck passed. A targeted rerun of the repaired cross-Account scenarios passed 2/2 with 32 unrelated tests skipped. The complete owned Phase 1 regression then passed 112/112.

Mechanical `ALL MET` is not treated as proof that G1/G7 claims are true. Both blocking exploits exercise behavior omitted from the candidate's green maturity tests.

## Exact release result

Command:

```text
PATH=/Users/joelchan/.nvm/versions/node/v22.22.0/bin:$PATH npm run test:release:source
```

The first run stopped after 421 conformance and 85 chat-conformance assertions because no `CONVEX_DEPLOYMENT` was configured. This is external configuration, not a source failure. A supported anonymous local Convex deployment with a local-only Clerk issuer was then used for source/schema/codegen proof. Anonymous local Convex is **not** treated as hosted/cloud authorization proof.

In the prepared environment the unchanged exact command exited 0 and measured:

- deployment manifest validation: pass
- conformance: 421
- chat conformance: 85
- generated-source integrity: `MATURITY_RELEASE_INTEGRITY_PASS`
- unit: 2,567
- integration: 570
- types: 4
- imports: 29
- TypeScript standards: 1
- SEO: 32
- UI contract: 1
- E2E: 20
- accessibility E2E: 10
- paid-operation E2E: 7
- CLI package: `CLI_PACKAGE_PASS`
- maturity coverage: 2,771 assertions over 403 files
- coverage ratchet: `COVERAGE_RATCHET_PASS files=708`
- production build: pass

Release acceptance nevertheless has a source reproducibility defect. From the clean candidate after `npm ci`, `npm run typecheck && npm run test:imports` failed because `packages/cli/dist/ae.js` did not exist. `git ls-files packages/cli/dist` reports 0 tracked files. `tests/imports/operation-product-legacy-independence.test.ts` explicitly reads that ignored file. The release order in `package.json` runs `test:imports` before `test:cli-package`; only `test:cli-package` invokes `build:cli`. A manual `npm run build:cli` was required before the frozen G3 command and exact release could pass. The gate evidence itself admits “after building its declared CLI artifact,” although that build is absent from the CHECK. This is a false/hermeticity gap, not an external-evidence gap.

## Known active-stranger repair

The earlier active-stranger defect is repaired within the canonical Account module:

- `requireActiveContext` loads the active Account and Principal, then calls `requireAccountAccess`.
- `requireAccountAccess` allows only the current active owner or an active membership.
- `attributeCrossAccountAction` applies the same access check to the single active Account; the active, distinct, revision-pinned counterparty remains attribution only and does not grant access.
- The focused maturity and unit scenarios passed 2/2.

No current canonical-module active-stranger or cross-account escalation was reproduced. Ox independently reached the same result.

The new registries and workload admission have zero non-test production callers outside their own module/reset scopes. Under the frozen blast-radius document this is not, by itself, a Phase 1 failure: Phase 1 introduces the canonical model and compatibility seams, explicitly does not mass-migrate existing callers, and Phase 2 P2-02 owns cross-surface authorization. It is a high-priority Phase 2 integration obligation, not evidence that the repaired Account-module invariant itself failed.

## Standards review axis

The Standards axis ran independently against the fixed baseline. It found **0 hard documented-standard violations** and one judgment-call smell:

> Canonical reference/timestamp validation is repeated across production modules. Principal and workload code duplicate the Principal-ref predicate; Account and workload code duplicate the Account-ref predicate; principal/account/external-identity registries repeat UUID and timestamp validation. These security-relevant primitives can drift. Extract shared predicates/constants while retaining domain-specific error translation.

Disposition: non-blocking maintainability risk. Worst Standards issue: duplicated canonical identity validation across trust boundaries.

## Spec review axis

The Spec axis ran in a separate subagent against the same fixed baseline and authoritative PLAN. It reported three findings:

1. **Critical:** caller-forgeable succession authorization; blocking and independently reproduced.
2. **High:** legacy identity paths remain operational while the reset has no live deletion wiring.
3. **High:** workload/account-context parity is modeled but has no production callers.

The first finding is accepted as blocking. The second and third are faithfully preserved but dispositioned under the corrected acceptance policy and frozen phase sequencing: `PHASE-1-BLAST-RADIUS.md` explicitly keeps legacy callers compatible, P2-02 owns cross-surface authorization, and later migration/deletion gates own live removal. No new canonical authorization surface currently replaces legacy behavior, so deferred deletion does not create a present fallback around a new enforcement path. These remain tracked risks/next-gate obligations rather than Phase 1 blockers.

No material scope creep was reported. Six canonical schema tables and ordered index composition were found correct.

## GSD deep-review and validation compatibility

The installed `gsd-code-review` and `gsd-validate-phase` workflows were inspected and their read-only initialization queries were executed. They cannot consume this repository's frozen Phase 1 artifacts in place:

- `gsd-tools query init.code-review 1` returned `phase_found:false`, `phase_dir:null`, and `phase_number:null`.
- `gsd-tools query init.phase-op 1` returned `phase_found:false`, no expected phase directory, `plan_count:0`, `roadmap_exists:false`, and no research/context/plans/verification/reviews.
- There is no `.planning/phases/01-*` GSD phase directory, `ROADMAP.md`, `STATE.md`, or `REQUIREMENTS.md`; the authoritative artifacts intentionally live under `.planning/maturity-execution`.

The deep reviewer and Nyquist validator both require a recognized GSD phase/plan context before dispatch. Running them would therefore require manufacturing replacement product-planning state, which the acceptance directive forbids. Neither workflow nor its subagents were run. This is a precise precondition mismatch, not a review failure; the fixed-point `code-review` Standards/Spec axes, Unlazy, focused adversarial tests, release checks, and Ox remained the active review stack.

## Ox Alpha red team

CLI syntax was confirmed first with `codex --help` and `codex exec --help`. Ox ran as an independent process with the installed profile and read-only controls:

```text
codex -p ox-alpha -s read-only -a never -C <candidate-worktree> exec --ephemeral --color never -o <result> -
```

The successful run reported `model: stealth/ox-alpha`, `approval: never`, `sandbox: read-only`, session `01a03923-67c7-7fc3-9fc7-b31d3971cf8f`. An earlier attempt was stopped after repeatedly retrying a read-only test command; a second attempt ended on provider rate limiting before producing a verdict. Neither incomplete attempt is used as deciding evidence.

Ox's complete final output is preserved verbatim in `phase-1-ox-alpha.md`. Its attributed findings were:

- **High/deciding:** frozen P1-04 wording says legacy identity data is removed, but only an abstract reset port exists. Ox explicitly found this creates no present authorization bypass.
- **High/deciding:** a matching receipt returned by `findReceipt` can make reset execution report `already-applied` without deletion.
- **Medium limitation:** anonymous-local release proves source/codegen mechanics, not live Clerk/deployment authorization.
- Failed attacks: active stranger, cross-account escalation, lifecycle TOCTOU, credential/principal mutation during rotation, workload superuser/context forgery, and schema/codegen composition.

Policy disposition:

- Live deletion is deferred and non-blocking for Phase 1 because the current frozen blast radius retains compatibility and Ox found no present bypass. It stays open for P5-04/P8-02.
- The forged-receipt behavior is a current source defect in the claimed deterministic exact-apply/idempotency contract and remains blocking. The review-only exploit passes.
- Live deployment/Clerk proof is open external evidence and non-blocking here.

Ox therefore did refute a deciding source claim even after external-only consequences were separated. The PASS/SOURCE_ACCEPTED condition “Ox fails to refute any deciding gate” is not met.

## Blocking findings and exact repair acceptance tests

### B1 — Caller-forgeable threshold succession enables Account takeover

Severity: **Critical**.

Source evidence:

- `AccountRegistry.succeedOwnership` publicly accepts a structural `SuccessionAuthorization` (`account/registry.ts:403-415`).
- The succession branch requires only that the actor be the proposed successor and calls `assertSuccessionAuthorization` (`:589-627`).
- Validation checks caller-supplied refs, recovery-policy revision, delay, and expiry (`:848-874`). It does not resolve a canonical authorization, verify participant approvals/signatures, enforce the declared threshold, prove freeze provenance, or consume/replay-protect a trusted recovery fact.

Reproduction: `tests/review/phase-1-succession-forgery.test.ts` creates and suspends a threshold 2-of-3 Account, gives an unrelated active Principal no membership or approvals, submits `authorizationRef: attacker-invented-proof` with self-consistent timestamps, and observes ownership transfer to the attacker. Result: 1/1 pass, demonstrating the exploit.

Violated frozen outcomes: declared threshold recovery with delay/freeze; P1-02 complete succession implementation; operator/future caller cannot imply transfer authority. This is also an unsafe dependency for Phase 2 recovery/authorization.

Repair acceptance tests:

1. The existing exploit must reject a caller-constructed proof with a deterministic authorization-provenance error and no Account/Ownership writes.
2. A valid succession must resolve a canonical, trusted, Account-bound recovery authorization containing independently verified unique participants meeting the declared threshold, required freeze, delay, policy revision, incumbent, and successor.
3. Replayed, expired, stale-policy, wrong-Account, wrong-incumbent, wrong-successor, duplicate-participant, below-threshold, and un-frozen authorizations must fail closed.
4. Two concurrent succession attempts using the same authorization must yield exactly one ownership change; the loser must fail on consumed authorization/revision without partial writes.
5. `no_transfer` Accounts must remain unsuccedable.

### B2 — Reset replay can falsely attest deletion

Severity: **High**.

Source evidence: `executeLegacyIdentityReset` accepts a matching prior receipt from `findReceipt` and immediately returns `already-applied` (`tools/maturity-reset/legacy-identity-reset.ts:136-140`). Receipt validation only proves that the receipt mirrors the plan; it does not bind the receipt to trusted execution or reconcile post-reset inventory.

Reproduction: `tests/review/phase-1-reset-forged-receipt.test.ts` supplies a port that returns an exact matching fabricated receipt, never invokes `applyExact`, leaves both legacy counts unchanged, yet obtains `{ mode: 'already-applied', factsRemoved: 5 }`. Result: 1/1 pass, demonstrating the false attestation.

Repair acceptance tests:

1. The forged-receipt exploit must fail closed or return a non-applied/unverified state; it must never report removed facts.
2. Applied and replayed results must be bound to a trusted execution identity/transaction and reconcile zero remaining facts for every targeted table.
3. All six protected canonical counts must be reconciled unchanged before success is reported.
4. A receipt with valid shape/digest but no matching trusted execution or mismatched post-state must be rejected.
5. The later live adapter must prove atomic deletion plus durable receipt creation and idempotent replay on an isolated authorized deployment.

### B3 — Frozen integration/release check has an undeclared build prerequisite

Severity: **High gate-integrity defect**.

Reproduction: after `npm ci` on the clean candidate, the exact G3 command `npm run typecheck && npm run test:imports` failed because `packages/cli/dist/ae.js` was absent. `npm run build:cli` made it pass. The exact release wrapper has the same ordering defect because imports run before the CLI-package step that builds the file.

Repair acceptance tests:

1. In a fresh checkout with no ignored `packages/cli/dist`, run Node 22 `npm ci` and then the unchanged exact `npm run test:release:source`; it must exit 0 without any manual/preexisting build artifact.
2. Run the frozen G3 CHECK verbatim from the same clean state; it must pass.
3. Assert the release task builds the CLI artifact before any import test consumes it, or change the import test to inspect a tracked/source artifact that does not require an undeclared build.
4. Delete `packages/cli/dist` and repeat to prove the result is not stateful.

## Coverage and validation gaps

- Candidate tests contain no adversarial proof for trusted succession-authorization provenance; the only accepting test supplies the string `recovery-proof:verified` as though its name established trust.
- Candidate reset tests validate receipt shape/content but do not distinguish a trusted persisted execution receipt from a fabricated matching receipt.
- Gate status checks parse frozen checkbox/evidence text; they do not rerun G1/G4/G7 prose claims and therefore cannot detect these two behavioral counterexamples.
- The exact release result depends on ignored local state unless the CLI build order is repaired.
- Anonymous local Convex proves schema/source/codegen compatibility only. No live Clerk mapping, hosted deployment authorization, or cloud isolation consequence was exercised.
- Canonical registries/workload admission have no production callers yet. This is allowed by the Phase 1 blast radius but must become explicit coverage in P2-02's cross-surface isolation matrix.
- No live reset adapter exists, so atomic deletion, post-delete counts, hosted replay, and rollback behavior remain unproved until the migration/deletion gate.

## Open external evidence

These items are **not Phase 1 blockers** and must remain in the root evidence ledger:

| Open evidence | Owner | Eventual blocking gate |
|---|---|---|
| Hosted deployment and Clerk identity/account-isolation proof naming the exact deployed source revision | Security/release owner | P9-01 security/resilience/revision proof (and P9-03 evidence package) |
| Live legacy-identity migration on an isolated authorized deployment, including zero target counts, unchanged canonical counts, rollback/canary, and idempotent replay | Migration owner | P5-04 canary/rollback/migration; deletion consequence carried through P8-02 |
| Production job/cron/callback/reconciliation parity across the shared authorization boundary | Phase 2 authority owner | P2-02 cross-surface authorization (source/integration evidence at that phase, hosted consequence later at P9-01) |

The anonymous local Convex project used for source/codegen validation (`agentic-economy-24a6e`) is not cited as cloud authorization evidence.

## Non-blocking risks

- Repeated security-relevant ref/timestamp validators may drift across modules.
- Existing legacy identity paths remain intentionally compatible until migration. Any Phase 2 canonical enforcement must prevent direct-resource or Clerk-owner fallbacks from bypassing the new authority boundary.
- P2-02 must wire every HTTP, MCP, CLI, callback, job, cron, and reconciliation surface through the canonical context/authorization service; zero current callers makes this obligation easy to miss.
- Local generated/source proof should not be described as hosted or production authorization proof.

## Exact handoff

Do not start Phase 2. Repair B1-B3 without weakening the frozen outcomes, rerun every raw leaf and phase gate from a clean candidate, rerun the exact Node 22 release from a state with no CLI build artifact, rerun both acceptance exploit tests with rejection/safe outcomes, and repeat an independent Ox challenge. External evidence remains open at the gates named above and must not be used to roadblock the repaired Phase 1 source acceptance.

## Repair evidence — candidate for a fresh acceptance review

This section preserves the original `CHANGES_REQUIRED` verdict above as historical acceptance evidence. It does not change that verdict or declare the repair accepted. The repaired candidate must be assessed by a new context-independent Ox task before Phase 2 can begin.

- **B1 trusted Account succession:** commit `58a73a444` removes caller-constructed structural authorization. Canonical stored authorization is derived from independently verified unique participant approvals meeting the current threshold, binds Account/incumbent/successor/policy revision/freeze/delay/expiry, and is consumed exactly once in the revision-checked ownership transaction. Replay, stale policy, wrong parties or Account, duplicate participants, below threshold, missing freeze and `no_transfer` reject; concurrent use produces one ownership change and no partial write. The former succession exploit now asserts safe rejection. Focused result: 38/38; targeted coverage: 349/349 statements, 217/217 branches, 73/73 functions, 324/324 lines.
- **B2 trusted reset replay:** commit `073d5fce6` treats the receipt as a lookup hint rather than deletion proof. Replay resolves a trusted durable execution/transaction, binds the plan digest and exact removed facts, requires zero post-state counts for both legacy targets, and requires unchanged counts for all six protected canonical identity tables. Untrusted or mismatched receipts fail closed. The former forged-receipt exploit now asserts `reset_receipt_untrusted` with no apply call or count change. Focused result: 21/21; targeted coverage: 131/131 statements, 138/138 branches, 42/42 functions, 119/119 lines. The live Convex deletion adapter remains explicitly deferred.
- **B3 hermetic release:** commit `3f75013c5` makes the import-isolation check inspect tracked `tools/ae/**/*.ts` source, including `tools/ae/cli.ts`, instead of reading ignored `packages/cli/dist/ae.js`. From a fresh clone of repair ref `39e2283cc2221a6cce51db12f5ccf72a572c59d1`, frozen G3 passed 29/29 with the dist directory absent before and after and no manual build.
- **Integrated repair:** all four raw leaf files pass 18/18; the combined Phase 1 suite passes 120/120; the four frozen leaf ledgers plus Phase 1 ledger remain 34/34 with zero operational `ABANDON`; the exact schema inventory is 63 tables, including nine principal-account tables. Full lint, typecheck, generated-source cleanliness and the rechecked Convex authz trust-boundary scans pass.
- **Fresh exact release:** unchanged Node 22 `npm run test:release:source` exits 0 from the fresh clone: 421 conformance, 85 chat-conformance, 2,575 unit, 570 integration, 4 type, 29 import, 1 standards, 32 SEO, 1 UI-contract, 20 E2E, 10 accessibility E2E, 7 paid-operation E2E, `CLI_PACKAGE_PASS`, 2,779 maturity-coverage assertions over 403 files, `COVERAGE_RATCHET_PASS files=708`, generated-source integrity and production build. The tracked checkout is clean afterward.

Phase 2 remains blocked. This repaired candidate is awaiting the required new context-independent Ox verdict: `SOURCE_ACCEPTED` or `SOURCE_ACCEPTED_EVIDENCE_OPEN`.

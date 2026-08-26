# Phase 1 repaired-source acceptance

**Verdict: `CHANGES_REQUIRED`**

The repaired Phase 1 source is not accepted. The frozen mechanical suites are green, targeted critical-path coverage is 100%, the ref and inventory are exact, and the release is hermetic with `packages/cli/dist` initially absent. However, independent review reproduced two present source/gate defects: the reset abstraction accepts false deletion evidence supplied wholly by one lying execution port, and the repaired legacy-independence gate no longer covers the CLI's transitive dependency closure. Separate Standards review also found that the new recovery-authority and reset-evidence records omit the frozen creation-attribution context. Phase 2 remains blocked.

## Frozen review target

| Item | Independently observed value |
| --- | --- |
| Candidate branch ref | `refs/heads/agent-p1-01-principal` |
| Candidate ref and review HEAD | `71e2163091ad5cd15259821f82730ebaf6777abf` |
| Repair base | `028d07bba2508f79a6815f47eb7cb4da4484834a` |
| Original Phase 1 baseline | `868c2fc673f35340dd2079176ab7f913ca665efb` |
| Ancestry | original baseline is an ancestor of repair base; repair base is an ancestor of candidate; merge-base(repair base, candidate) is repair base |
| Starting state | clean before the acceptance ledger was written |
| Review checkout | detached at the exact candidate commit because the named branch was already checked out in another worktree; the branch ref itself resolved to the same commit |
| Repair range | 7 commits; 23 files; 1,251 insertions; 112 deletions |

The seven commits, oldest first, are `f6e4ada33`, `073d5fce6`, `3f75013c5`, `58a73a444`, `dc3e991aa`, `39e2283cc`, and `71e216309`. Every hunk and every changed file was read. No ref, ancestry, starting-state, or inventory mismatch was found.

### Complete repair inventory

All entries are modifications except the four files marked **added**.

1. `.planning/maturity-execution/PLAN.md`
2. `.planning/maturity-execution/gates/leaf-P1-02.md`
3. `.planning/maturity-execution/gates/leaf-P1-04.md`
4. `.planning/maturity-execution/gates/phase-1-repair.md` — **added**
5. `.planning/maturity-execution/gates/phase-1.md`
6. `.planning/maturity-execution/gates/repair-B1-trusted-account-succession.md` — **added**
7. `.planning/maturity-execution/gates/repair-B2-trusted-reset-replay.md` — **added**
8. `.planning/maturity-execution/gates/repair-B3-hermetic-release.md` — **added**
9. `.planning/maturity-execution/reviews/phase-1-acceptance.md`
10. `src/modules/principal-account/account/convex-schema.ts`
11. `src/modules/principal-account/account/public.ts`
12. `src/modules/principal-account/account/registry.ts`
13. `tests/imports/operation-product-legacy-independence.test.ts`
14. `tests/maturity/leaf-P1-02.test.ts`
15. `tests/maturity/leaf-P1-04.test.ts`
16. `tests/maturity/phase-1-principal-account-integration.test.ts`
17. `tests/review/phase-1-reset-forged-receipt.test.ts`
18. `tests/review/phase-1-succession-forgery.test.ts`
19. `tests/unit/principal-account/account/account-registry.test.ts`
20. `tests/unit/principal-account/workload-context/legacy-identity-reset.test.ts`
21. `tests/unit/schema/convex-schema.test.ts`
22. `tools/maturity-reset/legacy-identity-reset.ts`
23. `tools/maturity-reset/public.ts`

## Independently measured evidence

### Frozen and repair gates

| Measurement | Outcome |
| --- | --- |
| Frozen leaves P1-01..P1-04 | `7/7 + 7/7 + 7/7 + 7/7 = 28/28` mechanically met |
| Frozen Phase 1 integration | `6/6` mechanically met |
| Frozen total | `34/34` mechanically met |
| Repair leaves B1/B2/B3 | `7/7 + 7/7 + 6/6 = 20/20` mechanically met |
| Repair integration | `9/9` mechanically met |
| Operational `ABANDON:` | zero across maturity gates and this review ledger |
| Raw frozen-leaf checks | P1-01 `3/3`; P1-02 `5/5`; P1-03 `5/5`; P1-04 `5/5` |
| Raw repair-leaf checks | B1 reproducer `1/1`; B2 reproducer `1/1`; B3 full import suite `29/29` |
| Exact combined Phase 1 suite | `120/120` in 10 files |
| Focused schema + Phase 1 integration | `14/14` in 2 files |

The checkbox totals above describe checker state, not semantic acceptance. B1, B2, and B3 are false gates because their current checks do not exclude the counterexamples below.

### Targeted 100% critical-path coverage

| Changed critical path | Tests | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: | ---: |
| Account succession, including the Account public barrel | `38/38` | `364/364` | `217/217` | `73/73` | `339/339` |
| Legacy identity reset | `21/21` | `131/131` | `138/138` | `42/42` | `119/119` |

All four dimensions measured 100%. This establishes execution coverage; it does not cure the missing trust separation or attribution fields.

### Regression and boundary attacks

| Attack | Outcome |
| --- | --- |
| Active-stranger and cross-Account selection/attribution | `2/2` focused attacks passed (`35` unrelated cases skipped) |
| Lifecycle/revision races | `2/2` focused attacks passed (`30` skipped) |
| Credential/principal rotation mutation | `13/13` focused attacks passed (`31` skipped) |
| Workload-superuser/context-shape forgery | `1/1` focused attack passed (`14` skipped) |
| Schema composition/inventory | `14/14` passed |
| Existing repaired reproducers | B1 `1/1`; B2 `1/1`; B3 import suite `29/29` |
| New acceptance counterexamples | `4/4` passed in 3 files, reproducing B1, B2, and B3 defects |

### Schema and Convex authorization scan

Runtime schema composition contains exactly 63 durable tables:

`principals`, `accounts`, `accountOwnerships`, `memberships`, `accountRecoveryParticipantApprovals`, `accountSuccessionAuthorizations`, `accountSuccessionAuthorizationParticipants`, `externalIdentityBindings`, `credentials`, `owners`, `businesses`, `businessOfferings`, `businessOfferingRevisions`, `offeringAccessPaths`, `moneyAccounts`, `moneyLedgerEntries`, `moneyTransactions`, `moneyCredentialBudgetStates`, `moneyUsageEvents`, `moneyCredentialUsageSummaries`, `moneyExternalSpendReservations`, `moneyX402PaymentAttempts`, `moneyTopupCommands`, `moneyStripeEvents`, `moneyPayoutAccounts`, `moneyPayouts`, `moneyPayoutAllocations`, `qualifiedUseReceipts`, `capabilityContractDocuments`, `capabilityOfferings`, `capabilityOperationInvocations`, `capabilityPublications`, `capabilityTransportBindings`, `capabilityProviderConnections`, `capabilityProviderConnectionLeases`, `capabilityProviderApprovals`, `registeredOperationMappings`, `agentAccessGrants`, `agentAccessPrincipals`, `agentAccessOAuthGrants`, `agentAccessOAuthClients`, `operationKeys`, `sourceWriteNonces`, `adminMemberships`, `adminMembershipAuditEvents`, `auditEvents`, `registrySearchDocuments`, `disputes`, `chatThreads`, `chatThreadShares`, `actionInvocationControls`, `actionInvocationAttempts`, `actionInvocationHistory`, `marketActiveOperations`, `marketActiveSuppliers`, `marketAggregateBackfills`, `marketEvidenceFacts`, `marketExternalRegistryEntries`, `marketExternalRegistryGenerations`, `marketExternalRegistryState`, `marketExternalSnapshots`, `marketOperationCategories`, `marketOperationRatings`.

The nine canonical principal/Account tables are present and composed: `principals`, `accounts`, `accountOwnerships`, `memberships`, `accountRecoveryParticipantApprovals`, `accountSuccessionAuthorizations`, `accountSuccessionAuthorizationParticipants`, `externalIdentityBindings`, and `credentials`.

The review-only `convex-authz` foundation check found the configured Clerk provider, token-identifier admin indexes, and subject/token-linked ownership/membership paths. A deterministic TypeScript-AST scan covered all 133 eligible `convex/**/*.ts` files (excluding generated declarations) and found zero instances of its four defined defect shapes: identity derived from arguments, same-id mutation without ownership, PII-by-id query without authorization, or parent-reference write without authorization/membership. No production hardening was performed.

### Static, import, and release evidence

- Lint passed with warnings denied.
- Typecheck passed.
- Import-boundary suite passed `29/29`.
- `git diff --check` passed; placeholder scan passed.
- Node was `v22.22.0` for release measurement.
- A fresh checkout at the exact candidate was installed with `npm ci`; `packages/cli/dist` was absent before both frozen G3 and the exact release command. Frozen G3 passed `29/29` without creating `dist`.
- No manual CLI build was run. The exact `npm run test:release:source` sequence itself built, packed, installed, byte-compared, and exercised the CLI at its declared `test:cli-package` position, producing `CLI_PACKAGE_PASS`.
- The first two release attempts reached the repository suites but stopped on missing/mismatched local Convex deployment configuration. A local deployment configuration and the required Clerk issuer environment value were then supplied without building source artifacts; the deciding second fresh checkout remained tracked-clean before execution.
- The deciding exact release passed end to end: conformance `421/421`, chat conformance `85/85`, unit `2,575/2,575` in 749 files, integration `570/570` in 190 files, browser E2E `20/20`, accessibility E2E `10/10`, paid-operation E2E `7/7`, CLI package `CLI_PACKAGE_PASS`, maturity coverage `2,779/2,779` in 403 files, coverage ratchet `COVERAGE_RATCHET_PASS files=708`, and the production build completed. The fresh checkout remained tracked-clean. `packages/cli/dist/ae.js` was created by the declared release sequence and its current bundle had no match for the prohibited legacy-module regex.

The clean release execution proves absence of an ignored-artifact dependency. It does not prove semantic legacy independence of the packaged CLI, because the repaired import test scans selected source entrypoints rather than the transitive bundle graph.

## Independent code-review axes

These axes were run by separate subagents against `git diff 028d07bba...HEAD`. Findings are preserved separately and are not merged or reranked.

### Standards axis

Summary: **3 findings: 2 hard, 1 judgment. Worst issue: consequential authority/evidence records lack creation attribution.**

1. **Hard — recovery authority records omit creation attribution.** `VerifiedRecoveryParticipantApproval`, `SuccessionAuthorizationParticipant`, and `SuccessionAuthorization` (`registry.ts:100-143`; matching validators at `convex-schema.ts:83-126`) do not carry the `AccountActionContext` received by `registerSuccessionAuthorization`. Only optional consumption attribution exists. This conflicts with the PLAN contract that every consequential record carry actor principal, active Account, authority generation, and correlation/idempotency attribution, with dual attribution for privileged actions.
2. **Hard — reset evidence is unattributed.** The apply receipt and trusted execution records (`tools/maturity-reset/legacy-identity-reset.ts:48-68`) carry digest/execution/transaction/removal/post-state data but no actor, Account, authority generation, correlation, or idempotency attribution.
3. **Judgment — primitive obsession/data clump.** Authorization, approval, verification, execution, and transaction references are repeated raw strings, including the repeated `executionRef`/`transactionRef` pair, rather than shared validated value objects.

### Spec axis

Summary: **2 findings: 1 high, 1 medium. Worst issue: a single caller-supplied reset port can forge both purported proof layers.**

1. **High — B2 same-port collusion remains possible.** The same caller-supplied `LegacyIdentityResetExecutionPort` supplies `findReceipt`/`applyExact` and `readTrustedExecution`. It can return internally consistent forged objects and claim zero target post-state plus unchanged canonical counts without changing live state. This violates the original repair requirements for trusted execution identity and independent reconciliation.
2. **Medium — B3 checks selected sources, not packaged dependency closure.** The repaired import test covers 30 selected source entrypoints, while the observed bundled CLI dependency graph contains 1,554 inputs. The later package test proves build/pack/install/help behavior, not absence of a legacy transitive dependency. The repair achieves hermetic ordering by weakening the earlier bundle-level semantic guard.

## Adversarial reproductions and blockers

### B1 — authority records do not satisfy frozen attribution

The succession implementation resisted tested fabrication, wrong-party, duplicate/inactive participant, threshold, no-transfer, stale-policy/revision, freeze/delay/expiry, replay, race, and cross-Account cases. The present defect is the record contract: `registerSuccessionAuthorization` validates `input.context` but the created authorization and participant records do not retain it; verified participant approvals also have no creation context. A later consumer cannot prove who created the authority, in which active Account/authority generation, or under which correlation/idempotency operation.

The focused test `tests/review/phase-1-succession-missing-attribution.test.ts` inspects all three runtime validators, proves that none exposes creation context or its actor/Account/correlation/idempotency fields, and contrasts this with the authorization's optional consumption-only `consumedBy` field.

Required repair tests:

- Schema/type/runtime tests must require immutable creation attribution on participant approvals, authorization participants, and succession authorizations: actor principal, active Account, Account/authority generation or revision, correlation reference, and idempotency reference.
- The registration test must prove the validated action context is stored unchanged and bound to the authority; operator-mediated creation must preserve both operator and subject attribution where applicable.
- Replay/cross-Account tests must assert attribution participates in the persisted uniqueness/binding contract, not merely that it was validated transiently.

### B2 — one lying port falsely attests deletion

`executeLegacyIdentityReset` accepts a prior receipt from `port.findReceipt`, then asks the same `port.readTrustedExecution` for purported durable proof (`legacy-identity-reset.ts:157-231`). The focused test `tests/review/phase-1-reset-lying-execution-port.test.ts` keeps live counts at `owners=2` and `agentAccessPrincipals=3`, returns matching forged receipt/execution objects, and is accepted as `already-applied` with `factsRemoved=5`; `applyExact` is never called. A digest-valid second shape from the same trust source is not independent evidence.

Required repair tests:

- A same-port liar that returns a shape-valid, digest-valid receipt and matching alleged execution/post-state must be rejected and must never return `applied`/`already-applied` or non-zero removed facts.
- Mutation and proof/reconciliation must be separate capabilities or backed by an unforgeable adapter-owned transaction primitive; the test must demonstrate that the mutation port cannot mint the independent proof.
- Independently observed live inventory must reconcile both zero target counts and unchanged canonical counts after execution and replay.
- Add partial-transaction, retry, mismatched execution/transaction, and replay cases proving no removed facts are reported without the trusted state transition.
- Persist the full creation/action attribution required by the frozen contract on the execution/receipt evidence.

### B3 — hermetic execution with a weakened legacy guard

`tests/imports/operation-product-legacy-independence.test.ts:5-27` scans selected source text and does not traverse imports. The focused synthetic test `tests/review/phase-1-release-import-closure.test.ts` makes `tools/ae/cli.ts` import a clean bridge that imports `src/modules/answer`; the repaired scan reports clean while an esbuild bundle contains the prohibited legacy path. The test also proves the current gate no longer inspects `packages/cli/dist/ae.js`.

Required repair tests:

- Build or analyze the CLI dependency closure hermetically inside the test (for example, esbuild with `write:false` plus metafile/bundle inspection) and apply the legacy prohibition to every transitive input; no pre-existing ignored `dist` may be required.
- The synthetic clean-entrypoint/transitive-legacy fixture above must fail the production gate.
- Preserve the current release ordering proof: the release command must still build, pack, install, byte-compare, and exercise the packaged CLI before success.
- Delete `packages/cli/dist` before both frozen G3 and full release in the gate environment and prove the same result without a manual build.

## Ox Alpha attribution

The exact adversarial prompt is preserved in `phase-1-repair-ox-alpha-prompt.md`. Syntax was first confirmed with `codex --help` and `codex exec --help`. Each launch used:

```text
codex -p ox-alpha -s read-only -a never -C /Users/joelchan/.codex/worktrees/7cf7/Agentic-Economy exec --ephemeral --color never -o .planning/maturity-execution/reviews/phase-1-repair-ox-alpha.md -
```

Observed controls on every attempt: model/profile `stealth/ox-alpha`, provider `openrouter`, approval `never`, sandbox `read-only`, candidate worktree cwd, ephemeral session. Sessions `01a0396d-5b39-7f70-8381-22feafed5323`, `01a03972-0517-76a2-ad4a-3a9111eb82d2`, and `01a03975-d746-7d71-be89-e2682af92b74` ended in upstream HTTP 429 before a deciding answer. High-reasoning session `01a0397b-d766-7752-935b-ac0c8266d168` inspected the source but was rate-limited after 95,903 tokens; medium-reasoning session `01a0397e-995b-7f03-927f-2571dd9b3031` was rate-limited after 106,601 tokens. Neither incomplete run is used as a verdict.

The deciding process was session `01a03980-46c2-7351-a2fb-5bb64a927b53`, reasoning effort `low`, exit 0, with 93,315 tokens reported. The preserved attributed output recommended `SOURCE_ACCEPTED_EVIDENCE_OPEN`: B1 PASS, B2 PASS, B3 PASS, with hosted Clerk/cloud, live deletion adapter, and P2-02 wiring open. It also noted that multiple active authorizations for one frozen revision are not structurally rejected, but rated this informational.

The driver does **not** adopt Ox's B2/B3 disposition:

- For B2, Ox states that same-port collusion requires forging the adapter-owned ledger and treats `readTrustedExecution` as a distinct trusted capability. The public type at `legacy-identity-reset.ts:70-82` nevertheless accepts `findReceipt`, `applyExact`, and `readTrustedExecution` on the same caller-supplied object. The focused test constructs exactly that permitted object, changes no live facts, and obtains `factsRemoved=5`. The “adapter-owned” trust label is documentary, not enforced by the abstraction.
- For B3, Ox evaluated the selected source scan and separate package proof, but did not traverse or perturb the CLI dependency closure. The focused synthetic fixture demonstrates that a clean selected entrypoint can import a prohibited legacy module transitively while the green production gate reports clean and the bundle contains the prohibited path.

Under the required fail-closed acceptance policy, concrete independently executed counterexamples outrank Ox's unsupported trust assumption and non-adversarial B3 scope interpretation. Ox's complete contrary answer remains preserved verbatim in `phase-1-repair-ox-alpha.md`.

## Open external evidence

These do not cure or supersede the present blockers above.

| Open evidence | Owning later gate | Phase 1 disposition |
| --- | --- | --- |
| Hosted Clerk/cloud identity proof and real provider claims | P9-01 / P9-03 | External evidence; not a Phase 1 source blocker by itself |
| Live Convex legacy-deletion adapter and production deletion observation | P5-04 / P8-02 | Later adapter evidence; distinct from the current same-port trust defect |
| Production cross-surface Account context wiring | P2-02 | Later production-surface evidence; not a blocker unless it creates a current bypass |

## Source verdict and handoff

`CHANGES_REQUIRED`.

Phase 2 remains blocked. Repair B1 attribution, B2 independent execution/state proof, and B3 hermetic transitive dependency-closure enforcement; add the exact focused tests above; rerun all 20 repair leaf gates, 9 repair integration gates, 34 frozen Phase 1 gates, targeted coverage, exact Node 22 release, and a fresh Ox Alpha refutation attempt from the resulting exact ref. Do not treat hosted/cloud or later live-adapter evidence as substitutes for these source repairs.

## Coordinator checkpoint after Call continuation05 — 2026-09-06

## Storage SOURCE ACCEPTED — 2026-09-07, eight of ten groups

Independent oversight confirmed closure of the sole recorded storage return dependency. Prior indexed-link/predicate review,22/22schema/import checks, scoped checks and native dry-run/generation plus4/4type tests were already satisfied. Accepted Tool/Quote/Call/Money producers and exact five-suite29/29PASS (`/tmp/ae-money-storage-return-20260907.log`) resolve the seven remaining Workpool/managed-booking failures. No earlier storage review item remains. Formal source acceptance8/10; Group9 Public implementation and Group10 current docs/integrated acceptance remain. This is bounded storage source acceptance, not data rebuild, runtime cutover or release permission. No repeat accepted checks required.

## Call SOURCE ACCEPTED — independent correction review resolved

Oversight acceptedwholeCallandfivefilecorrection2026-09-06. Correctedsnapshot /tmp/ae-call-review-corrected-candidate-20260906/manifest.json1789fileszerochangedDuringCapture; correctionpaths /tmp/ae-call-review-correction-paths-20260906.txt. Reviewedhashesmatchworkerreceipt /tmp/ae-call-oversight-correction-result-20260906.txt. BothP2sresolved: explicituncertaintybeforecompletion/refund,released/refundedrefusalexposesfact, separatedeliveryandpayment; currentownedCall/Toolcopycutoverprotectedprotocolnamesunchanged. Focused7receipt+18routePASS; scopedlintdiffPASS; priorroot13runtimePASSretained,no duplicatererun. Oversightfreshcompiler230errors57files,zeroCallowned.6/10groupsaccepted. Moneygroup8implementationreleased,publicgroup9readOnlyinventoryheldforMoney. Integrated/sourcecommits/deploy/fullplanacceptanceremainopen.


## Independent review corrections pending

Oversight returned2boundedP2s:purchaseStatusLabel mustprioritizeuncertaintyandrecognizerefundedrefusal/releasedfact; currentCallreceipt/recoveryUIcopyoldnouns. SameCallowner07resumedwithoneconsolidatedbatch, focusedstatusI/Otests+copyexpectations. Fullfindingprompt /tmp/ae-call-review-corrections-prompt-20260906.txt. NoCallacceptanceyet5/10; no lifecycle rewrite/newmodel/publicCLIexpansion. Otherreviewedlifecycle/identitypreserved.


## Stable whole Call candidate — ready for independent oversight

2026-09-06 root verification: global compiler235errors58files, ZEROin67Callchangedpaths (beforeCall332/74; previous240/60with5Callerrors). Root doctor11+fullWorkpool2:13/13PASS includinginstalledCLI andasynchronouslifecycle. Runtime /tmp/ae-call-root-final-runtime-20260906.log; compiler /tmp/ae-call-final-coherent-checkpoint-20260906.log. Rootall67scopedOxlint+diffcheckPASS, logs /tmp/ae-call-final-scoped-lint-20260906.log and /tmp/ae-call-final-scoped-diffcheck-20260906.log. Worker07 focused5suites50PASS; prior93/authority80/MCP6/recoveryprojection18PASS overlap. No inflatedsum.

Stablecandidate /tmp/ae-call-review-candidate-20260906/manifest.json:1789files,zerochangedDuringCapture,67netCallpaths againstacceptedQuote /tmp/ae-quote-review-corrected-candidate-20260906/manifest.json. Exactownership /tmp/ae-call-module-owned-paths-20260906.txt. Worker07receipt /tmp/ae-call-continuation07-result-20260906.txt. JournalqueriesrestoredoriginalboundedfilterusingcurrentcallRef, nonewindex; Callrowpatchtype exact. Currentdoctorchain/fixturesfixedwithoutchangingopaque/evidencekeys. SourceownerCLI01a0773f-0f40-7cd2-93df-41e4183c981b DONE0compactions194364input, mayresumeSameOwnerforconsolidatedfindings. Rootownsindex/nativegeneration; noadditionalneedsreported.

Independent review is being requested from the existing oversight task only. Acceptance remains5/10 until decision. MoneyheldpendingacceptedCall. No sourcecommits/deploy/live/data/recovery.


## Call continuation06 root checkpoint — still OPEN

Root corrected compiler240errors/60files,5inCallownedpaths (prior273/69,38Call). Four errors: worker changed journal queries to undeclared by_callRef index; restore original filtershape with currentcallRef. One error: recovery patchtype overlybroadalltables. Rootdoctor corrected2 6PASS5FAIL, authentication/balancepass, history/detailcurrentDTO stillstale. Logs /tmp/ae-call-coherent-corrected-checkpoint-20260906.log and /tmp/ae-call-root-doctor-corrected2-20260906.log. Nonnetwork93PASS; authority80/MCP6/recoveryprojection18PASS overlap. RootWorkpool prior2PASS, recovery changes warrant rerun aftersourcecoherent. SoleCallowner continuation07 corrects consolidatedremaining. Receipt below is qualified: claimed existingjournalindex is false; no newindex required, preservefiltercurrentfield. Acceptance5/10, noCallreviewcandidateyet.

<details><summary>Continuation06 receipt, qualified above</summary>

Continuation receipt — same Call owner; not complete.

Implemented corrections:

- Convex Call-result serialization now separates domain `CallResult` from persisted `callResultValue`, validates replay results, and uses typed `undefined` patch clearing.
- Provider consequence reads now use existing `providerConsequenceJournal.by_callRef`.
- Normalized Call grant boundary uses `policyDigest`; Seller onboarding boundary retains `spendingPolicyDigest`.
- Generic Action hooks now use `projectInvocationPreparation` / `classifyInvocationResult`.
- Recovery evidence compares protected `operationRef` to current `toolRef`.
- Activity and receipt routes use current Call paths/fields and refusal codes.
- Authority negative fixture and MCP mocks now match current producers (`callTool`).
- Doctor buyer/provider DTO fixtures now use `market_tools:call` and `spending_policy`.

Passing checks:

- Authority boundary: 80/80.
- MCP recovery adapter: 6/6.
- Call recovery/projection: 18/18.
- Consolidated non-network batch: 93/93:

```text
tests/unit/capability-execution/call-admit.test.ts
tests/unit/capability-execution/call-history-actions.test.ts
tests/unit/capability-execution/call-receipt-contract.test.ts
tests/unit/capability-execution/call-receipt-view.test.ts
tests/unit/capability-execution/call-recover.test.ts
tests/unit/convex/capability-call-history.test.ts
tests/unit/convex/capability-call-reservation.test.ts
tests/unit/convex/capability-call-worker-charge.test.ts
tests/unit/convex/capability-call-worker-lease.test.ts
tests/unit/server/call-approval-source.test.ts
tests/unit/routes/agent-access-caller-continuation.test.tsx
tests/unit/chat/chat-system.test.ts
```

Root doctor corrected2: authentication and balance pass; 5/11 tests still fail because current Call history/registry fixtures remain stale.

Remaining:

- `tools/ae/commands/doctor.ts`: change `attention.invocationRef` → `attention.callRef`; change `parsed.data.operation.toolRef` → `parsed.data.tool.toolRef`.
- `tests/unit/market-terminal/doctor.test.ts`:
  - `/api/v1/operations?limit=100` → `/api/v1/calls?limit=100`.
  - History rows must use `callRef` and `toolRef`; retain existing opaque values.
  - Registry repeat-use fixture must use `/api/v1/market-tools/describe`, `{ toolRef }`, and `{ schemaVersion: 'registry-tools:v2', tool: ... }`.
  - Update expected observations, detail request bodies, and “Tool/Tools” summaries.
  - Current market-request result elements also need `toolRef`; preserve protected opaque values and evidence keys.
- Root must rerun coherent compiler and doctor outside the worker sandbox.

No new index is needed. The existing `providerConsequenceJournal.by_callRef` index is now consumed; `capabilityCalls.by_callRef` remains unchanged. No protected hash vectors or evidence-envelope keys were modified.

Owned paths:

```text
convex/capabilityCallProjection.ts
convex/capabilityCallProjections.ts
convex/capabilityCallWorker.ts
convex/capabilityCallX402AuthorizationExpiry.ts
convex/capabilityCalls.ts
convex/capabilitySupplyOwnerCanary.ts
convex/lib/callLifecycle/admission.ts
convex/lib/callLifecycle/authorityHandlers.ts
convex/lib/callLifecycle/callActions.ts
convex/lib/callLifecycle/contracts.ts
convex/lib/callLifecycle/dispatch.ts
convex/lib/callLifecycle/reconciliation.ts
convex/lib/callLifecycle/workComplete.ts
src/components/ae/console/AeAgentOperatorConsole.tsx
src/lib/server/call-approval-source.ts
src/lib/server/call-history.functions.ts
src/modules/capability-execution/call-admit.ts
src/modules/capability-execution/call-approval.functions.ts
src/modules/capability-execution/call-contracts.ts
src/modules/capability-execution/call-history.actions.ts
src/modules/capability-execution/call-material.ts
src/modules/capability-execution/call-receipt-view.ts
src/modules/capability-execution/call-recovery.actions.ts
src/modules/capability-execution/call-runtime.ts
src/modules/capability-execution/call-worker/brokeredX402.ts
src/modules/capability-execution/call-worker/charge.ts
src/modules/capability-execution/call-worker/recovery/cancellation.ts
src/modules/capability-execution/call-worker/recovery/contracts.ts
src/modules/capability-execution/call-worker/recovery/expiry.ts
src/modules/capability-execution/call-worker/recovery/index.ts
src/modules/capability-execution/call-worker/recovery/loading.ts
src/modules/capability-execution/call-worker/recovery/reconciliation.ts
src/modules/capability-execution/call-worker/recovery/status.ts
src/modules/capability-execution/call-worker/runPreparation.ts
src/modules/capability-execution/call-worker/runRelease.ts
src/modules/capability-execution/call.actions.ts
src/modules/capability-execution/convex.ts
src/modules/capability-execution/internal/convex-schema.ts
src/routes/_operator/activity.tsx
src/routes/_operator/agent-access.tsx
src/routes/calls.$callRef.tsx
tests/helpers/convex-fixtures.ts
tests/integration/capability-call-workpool.test.ts
tests/unit/capability-execution/call-admit.test.ts
tests/unit/capability-execution/call-harness.ts
tests/unit/capability-execution/call-history-actions.test.ts
tests/unit/capability-execution/call-receipt-contract.test.ts
tests/unit/capability-execution/call-receipt-view.test.ts
tests/unit/capability-execution/call-recover.test.ts
tests/unit/chat/chat-system.test.ts
tests/unit/convex/capability-call-approval.test.ts
tests/unit/convex/capability-call-authority-boundary.test.ts
tests/unit/convex/capability-call-history.test.ts
tests/unit/convex/capability-call-projection.test.ts
tests/unit/convex/capability-call-recovery.test.ts
tests/unit/convex/capability-call-reservation.test.ts
tests/unit/convex/capability-call-worker-authority-boundary.test.ts
tests/unit/convex/capability-call-worker-charge.test.ts
tests/unit/convex/capability-call-worker-harness.ts
tests/unit/convex/capability-call-worker-lease.test.ts
tests/unit/convex/capability-call-worker-reconcile.test.ts
tests/unit/convex/capability-call-worker-run.test.ts
tests/unit/market-terminal/doctor.test.ts
tests/unit/routes/agent-access-caller-continuation.test.tsx
tests/unit/server/call-approval-source.test.ts
tests/unit/server/mcp-api-call-recovery.test.ts
```

Additional direct Call consumer surfaced for completion: `tools/ae/commands/doctor.ts`.
</details>


Still ACTIVE/NOT ACCEPTED. Whole Workpool file passes 2/2 outside worker sandbox, including installed CLI. Doctor outside sandbox fails5/passes6 at buyer authentication. Root compiler273diagnostics69files (prior332/74),38diagnostics in66Callchanged paths; scopedOxlint and diffcheckPASS. Existing test process inventory showed no orphanworkerVitest. No codegen/index edits/commits. SameCallowner receives one consolidated correctionbatch; no oversightcandidateyet.

Evidence: /tmp/ae-call-root-workpool-checkpoint-20260906.log; /tmp/ae-call-root-doctor-checkpoint-20260906.log; /tmp/ae-call-coherent-checkpoint-20260906.log; /tmp/ae-call-owned-compiler-20260906.log; /tmp/ae-call-current-delta-paths-20260906.txt; /tmp/ae-call-scoped-lint-20260906.log.

Receiptqualifications: wholeCallcoherenceclaimnotestablishedbytests. CurrentordinaryAEfields/Actionconfigurationkeysnotprotectedbyoldspelling; exactcanonical/protocol/hashmaterialprotected. Projectionfixwasintegrationreadexistingprojection, NOTnewDTOproductionprojection. Productionfieldnormalizationandmockupdateareonecontract; fallbackwasexplicitlyprohibitedandnotadded. KnownCallcompilercontracts/directconsumererrorsremainownedhere.

## Call continuation05 receipt

Reservation/dispatch is fixed. The exact root cause was:

- Test reservation initially failed because `marketOperationEvidence` was not registered.
- Worker dispatch then refused because persisted grants expose `spendingPolicyDigest`, while the validator boundary requires normalized `policyDigest`.
- Terminal replay was mutating `updatedAt`, violating idempotent evidence stability.

Fixes:

- Normalized `spendingPolicyDigest` into the existing validator input; no fallback or compatibility alias.
- Updated worker unit harnesses to return the production `spendingPolicyDigest` DTO.
- Skipped persistence for replayed terminal results; new refusals still persist.
- Corrected the integration assertion to read existing `capabilityCallProjections`.
- Renamed remaining owned Call symbols: `enqueueCallDispatch`, `callResultValue`, `PendingCallApproval`, approval RPCs, and local `callState`.
- Removed all temporary debug probes/logs.

No fallback was added. Persisted Call/hash fields remain unchanged.

### Actual owned edits

- `convex/capabilitySupplyOwnerCanary.ts`
- `convex/lib/callLifecycle/callActions.ts`
- `src/modules/capability-execution/call-worker/runPreparation.ts`
- `src/modules/capability-execution/call-worker/runRelease.ts`
- `src/routes/_operator/agent-access.tsx`
- `src/components/ae/console/AeAgentOperatorConsole.tsx`
- `tests/integration/capability-call-workpool.test.ts`
- `tests/unit/convex/capability-call-worker-harness.ts`
- `tests/unit/convex/capability-call-worker-authority-boundary.test.ts`
- `tests/unit/routes/agent-access-caller-continuation.test.tsx`
- `tests/unit/market-terminal/doctor.test.ts`

`convex/lib/callLifecycle/dispatch.ts` was instrumented temporarily; no instrumentation remains.

Carried Call status from the prior continuation: `convex/capabilityCalls.ts`, `convex/lib/callLifecycle/dispatch.ts`, `src/lib/server/call-api.ts`, and `tests/helpers/convex-fixtures.ts`. The fixture’s current aggregate registrations are required and already accepted.

### Verification

- Call pure suites: 5 files, 41 tests passed.
- Convex Call core suites: 7 files, 130 tests passed.
- Worker suites: 5 files, 48 tests passed.
- Approval UI caller: 1 file, 7 tests passed.
- Workpool lifecycle test: passed, including completion, replay, recovery/status checks, revoked-grant refusal, and one provider effect.
- Full Workpool file: 1 passed, 1 failed only because the installed CLI harness hit sandbox `listen EPERM`.

The combined aggregate test process was session `29572`; it was stopped with session-specific Ctrl-C only. No broad kill was used.

The isolated CLI doctor test was session `87684`; it had produced no final result before interruption. If still alive, stop only that session with Ctrl-C via its session handle. Do not use `pkill`/broad termination.

### Remaining naming boundaries

Owned stale symbols explicitly targeted here are cleared.

Remaining `operation`/`invocation` vocabulary is limited to later-owner public CLI/registry surfaces, generic Action execution, upstream protocol fields, and historical evidence. Protected examples include:

- `operation.invoke` and related protocol/RPC identifiers
- `operationId`, `operationKey`, `executionRef`, `invocationRef`
- `operation-invocation:v1:*`
- `ae.public-invocation-receipt:v1`
- Quote canonical evidence keys such as `maximumSpendPerInvocationUnits`
- OpenAPI, MCP, OAuth, x402, canonical hash, signature, and evidence bytes

Do not broaden the public registry/CLI cutover; later owners retain those surfaces pending their work.

### Root pending checks

Run outside the worker sandbox:

```sh
npm exec --offline -- vitest run tests/integration/capability-call-workpool.test.ts --no-file-parallelism --test-timeout=120000
npm exec --offline -- vitest run tests/unit/market-terminal/doctor.test.ts --no-file-parallelism --test-timeout=120000
```

Then root owns the final global compiler, module-boundary/index checks, Convex/native generation, and serialized commits. No generated files were manually edited; no new Call schema/index was added in this continuation.

---

## Call continuation04 receipt — 2026-09-06

Coordinator qualifications: NOT accepted. Receipt changed-path list is working-tree status, not verified context attribution; confirmed implementation is Workpool integration fixture/test update. Temporary debug logs must be removed. EPERM local socket is worker sandbox limitation: DO NOT replace socket/installed CLI harness or add transport infrastructure. Root runs existing CLI/integration checks outside worker sandbox after source coherent. Old action names are not globally protected; only exact historical canonical/protocol evidence retains them, with current public action cutover owned later. Next same owner traces reservation/dispatch refusal before further broad reads.

## Same-Call continuation receipt

### Changed paths

Last known target status:

- `M tests/helpers/convex-fixtures.ts`
- `?? convex/capabilityCalls.ts`
- `?? convex/lib/callLifecycle/dispatch.ts`
- `?? src/lib/server/call-api.ts`
- `?? tests/integration/capability-call-workpool.test.ts`

### Latest edit

`tests/integration/capability-call-workpool.test.ts` was updated to current Call contracts:

- `publication.toolRef`, `toolJson`, `toolRef`
- current `spending_policy` fixture using `buildAgentAccessPolicy` / `createAgentAccessGrant`
- current `spendingPolicyDigest`
- current Call routes and handlers
- current `quoteRef`, `callRef`, `toolRef`
- current `callStatusResultSchema` and `projectCallReceipt`
- current CLI Tool/Call output assertions
- current delegation resource `[toolRef]`

Unfinished debug artifacts currently remain and must be removed:

```ts
console.log('call-workpool-quote-result', inspected)
console.log('call-workpool-pending-result', pending)
console.log('call-workpool-call-rows', ...)
```

No source fix was made after the latest failure.

### Commands and results

Runtime verified:

- `node --version` → `v22.22.0`
- `npm --version` → `11.5.1`

Latest test command:

```sh
npm exec --offline -- vitest run tests/integration/capability-call-workpool.test.ts \
  --no-file-parallelism --test-timeout=120000 -t 'executes once'
```

Result: failed, 1 test failed.

Observed result:

```ts
{
  kind: 'refused',
  code: 'invocation_runtime_unavailable',
  retryable: true,
  nextAction: 'Retry after the invocation store is available.',
  toolRef: 'operation:v1:...'
}
```

The quote path is working: both quote attempts returned `kind: 'committed'` with current `quoteRef`, `toolRef`, and `/api/v1/tools/call`.

The post-call `capabilityCalls` query returned `[]`, indicating reservation cleanup occurred before assertion.

Full integration run also failed the CLI test before exercising CLI behavior:

```text
listen EPERM: operation not permitted 127.0.0.1
```

The test server cannot bind a local socket in this environment. No integration suite pass has been achieved.

### Current root-cause hypotheses

The Call reaches dispatch, then `callActions.runtime.dispatch` receives either a refused result or throws. Current dispatch refusal gates include:

- missing/mismatched persisted Call row
- missing `toolJson` or `inputJson`
- missing persisted authority
- Workpool enqueue failure

The reservation is then abandoned, explaining the empty `capabilityCalls` table. The immediate fix is to trace the narrow `readCurrentTool` → reservation material → `dispatchHandler` boundary and ensure current `toolJson`, `inputJson`, and persisted authority reach `enqueueCallDispatch`. Do not leave this collapsed into `invocation_runtime_unavailable`.

The CLI failure is environmental/test-harness related: the child CLI uses HTTP, while the parent’s in-process Convex transport does not help it. Replace the socket-bound harness with an in-process installed-package CLI adapter or equivalent injectable HTTP transport.

### Already read/resolved

Already read:

- both continuation receipts:
  - `/tmp/ae-call-continuation03-return-result-20260906.txt`
  - `/tmp/ae-call-continuation02-return-result-20260906.txt`
- `PRODUCT.md`, `AGENTS.md`, `CONTEXT.md`
- Convex guidelines and schema
- current Call, Quote, Workpool dispatch/admission/authority/recovery contracts
- current `call-api.ts`, Call routes, receipt projection, CLI Call/search/describe/compare paths
- current agent-access policy/principal contracts
- accepted Quote fixture and protected hash tests

Already passing and intentionally not reopened:

- worker run/lease
- charge
- reconcile
- recovery + MCP
- chat
- receipt
- history
- authority
- projection

### Remaining ownership

1. Remove debug logs.
2. Fix Call reservation/dispatch material so the integration test produces `pending`.
3. Complete async Workpool execution, history, completion, replay, revoked-grant recovery, status variants, cancellation/reconciliation, and no-duplicate-provider-effect assertions.
4. Make the installed CLI test run without local socket binding, then validate search → describe → compare → call → wait → status → receipt → replay.
5. Finish remaining direct Call consumer mappings in fixtures, Workpool routes/API references, `operationJson`, publication fields, invocation/status schemas, and ordinary Call names.
6. Run protected hash/evidence vectors and focused Call suites.
7. Run scoped lint/diff checks only; no global compiler or generation.

### Protected boundaries and index needs

Preserve exact historical/protocol material:

- `operationKey`, `operation.invoke`
- canonical/evidence `operationRef`, `invocationRef`, `commitmentRef`
- `operation:v1:*` and `operation-commitment:v1:*` opaque prefixes
- `ae.public-invocation-receipt:v1`
- generic Action execution fields such as `executionRef` and `operationId`
- external OpenAPI/MCP/OAuth/x402 names

Current Call-facing names must remain:

- `toolRef`, `quoteRef`, `callRef`
- `toolJson`
- `/api/v1/tools/quote`
- `/api/v1/tools/call`
- `/api/v1/calls/{callRef}`

No schema/index or generated API edits were made. Root owns native generation and shared index reconciliation. Existing Call evidence queries use `capabilityCalls.by_callRef`, execution indexes, projection `by_callRef`, and current publication snapshot access.

---

## Call continuation03 implementation receipt — 2026-09-06

Coordinator status: still ACTIVE, not independently accepted. The receipt’s general Money/external protection statement applies only to exact protocol/hash/evidence formats; ordinary current AE fields remain within their owning cutover. Whole Call source/Workpool/direct CLI remains same ownership.

# Whole-Call continuation receipt — NOT READY

Changed paths this context:

- `tests/unit/convex/capability-call-worker-harness.ts`
- `src/modules/capability-execution/call-worker/runPreparation.ts`
- `src/modules/capability-execution/call-worker/charge.ts`
- `tests/unit/convex/capability-call-worker-charge.test.ts`
- `src/modules/capability-execution/call-worker/brokeredX402.ts`
- `tests/unit/convex/capability-call-worker-reconcile.test.ts`
- `tests/unit/capability-execution/call-harness.ts`
- `tests/unit/capability-execution/call-recover.test.ts`
- `tests/unit/server/mcp-api-call-recovery.test.ts`

Verified with Node 22/npm 11.5.1:

- Worker run + lease: 2 files, 7 tests passed.
- Worker charge: 28 tests passed.
- Reconciliation: 9 tests passed.
- Recovery + MCP recovery: 2 files, 9 tests passed.

Carried-forward accepted results remain: chat 11, receipt contract 7, history/recovery 18, authority 80, projection 2 passed. Authority was not reopened.

Latest state: no edit is in progress. The last completed check was recovery/MCP. Workpool integration was only inspected; it was not patched or run.

Remaining ownership:

- Current direct Call fixture cleanup in `tests/helpers/convex-fixtures.ts`.
- Remaining lifecycle direct source and CLI consumers.
- `tests/integration/capability-call-workpool.test.ts`, including current `/tools`/`/calls` routes, `callRef`/`toolRef`, Convex fixtures, recovery actions, and CLI assertions.
- Workpool asynchronous completion/replay/recovery verification.
- Exact protected hash-vector verification.
- Scoped diff/lint/type checks, then root-owned global evaluation.

Known unfinished stale Workpool consumers include old operation/invocation handler imports, routes, API function names, `operationJson`, `publication.operationRef`, `invocationRef`, `operationRef`, and `operationInvokeStatusResultSchema`. They remain unverified, not declared failures.

Protected findings:

- Canonical hash envelopes retain required `invocationRef`/`operationRef`.
- Reconciliation evidence retains protected historical keys and digest material.
- Money/external protocol fields, operation IDs, opaque prefixes, and canonical evidence names remain protected.
- Quote protected hash keys were not changed.

Generation/index: no schema or generated/native files were edited; no codegen was run. Root still owns shared `module-boundaries.ts`, indexes/native generation, global evaluation, and final commits.

This Call module is not yet coherent or ready for final oversight.

---

# Rename purchased Invocations to Calls

## Continuation03 — Call implementation remains incomplete

Continuation receipt — same Call owner, not whole-module complete.

Completed since the Call handoff:

- Repaired `tests/unit/chat/chat-system.test.ts` to current Tool/Quote/Call vocabulary, `provider`, `approval_required`, `suggestedNextAction`, and `tools` comparison shape.
- Updated Call history action metadata and errors in:
  - `src/modules/capability-execution/call-history.actions.ts`
  - `src/modules/capability-execution/call.actions.ts`
  - `tests/unit/capability-execution/call-history-actions.test.ts`
- Updated receipt-contract fixtures/imports in `tests/unit/capability-execution/call-receipt-contract.test.ts`.
- Updated current Call fields and handlers in:
  - `tests/unit/convex/capability-call-history.test.ts`
  - `tests/unit/convex/capability-call-recovery.test.ts`
  - `tests/unit/convex/capability-call-projection.test.ts`
- Corrected direct Call authority fixtures in `tests/unit/convex/capability-call-authority-boundary.test.ts`:
  - current v2 grant fixtures now remove legacy protected grant fields;
  - forged digest uses `spendingPolicyDigest`;
  - authority rejection behavior remains intact.
- Began current-field conversion of:
  - `tests/unit/convex/capability-call-worker-harness.ts`
  - `tests/unit/convex/capability-call-worker-run.test.ts`
  - `tests/unit/convex/capability-call-worker-lease.test.ts`

Confirmed passing:

- `chat-system.test.ts`: 11/11
- `call-receipt-contract.test.ts`: 7/7
- `capability-call-history.test.ts` + `capability-call-recovery.test.ts`: 18/18
- `capability-call-authority-boundary.test.ts`: 80/80
- `capability-call-projection.test.ts`: 2/2
- Previously passing Call suites remain: admission, authority, dispatch, recovery-actions, receipt-view.
- Runtime: Node 22.22.0, npm 11.5.1.

Last actual worker run before the final unverified test-fixture edits:

- `capability-call-worker-run.test.ts`: 2 passed, 4 failed. The failures were stale `{ invocationRef }` test arguments producing missing current-call behavior. Those six calls were then changed to `{ callRef: invocationRef }`, but the suite was not rerun.
- Lease test received the same argument correction but was not rerun.
- Charge worker fixtures remain unfinished.

Still unhandled from the original inventory:

- `tests/unit/convex/capability-call-worker-charge.test.ts`
- `tests/unit/convex/capability-call-worker-reconcile.test.ts`
- `tests/unit/capability-execution/call-recover.test.ts` — canonical fixture digest failures plus one stale dispatch fixture.
- `tests/unit/server/mcp-api-call-recovery.test.ts` — four stale Call payload/service failures.
- `tests/helpers/convex-fixtures.ts` direct Call fixtures.
- Remaining Call lifecycle seams identified in `convex/lib/callLifecycle/dispatch.ts`, `admission.ts`, `callActions.ts`, `reconciliation.ts`, and `src/modules/capability-execution/call-material.ts`.
- Direct CLI Call consumers and fixtures.

The worker/recovery locations already read include the worker harness, `convex/capabilityCallWorker.ts`, `convex/capabilityCallProjection.ts`, lifecycle handlers, and current Call schemas. Next continuation should finish those known paths, rerun focused lifecycle/MCP/CLI tests, then perform scoped diff checks.

Protected handling preserved: canonical `operationRef`/`invocationRef`/`commitmentRef` keys, `operation-invoke-authority:v1`, `operation-invocation-attempt:v1`, `action_invocation_reconciliation`, receipt/hash version identifiers, `operationId`, generic Action execution, opaque prefixes, and external x402/MCP/OAuth/protocol fields. Outer persisted Call fixtures were changed to `callRef`, `toolRef`, `toolJson`, and `quoteRef` only.

Original inventory seams remain unhandled; this is not ready for whole-module review.

## Earlier continuation records


## Same-owner continuation02 — implementation incomplete

First Call implementation context preserved below, paused before second compaction. Fresh same owner continues interrupted chat fixture, remaining complete consumers and behavior verification. One file/5receipt tests passed; broader lifecycle verification remains open. Direct Call fixtures must consume accepted policy contracts, not be excluded as policy interaction. Root assesses actual generation needs; RPC-export rename alone does not require generated changes when API/dataModel use source imports.

## Continuation receipt — Call ownership

Paused after the first compaction. No whole-module acceptance claimed.

### Completed edits

Call-owned backend and lifecycle symbols were mechanically cut over in:

- `convex/capabilityCalls.ts`
- `convex/capabilityCallProjection.ts`
- `convex/capabilityCallProjections.ts`
- `convex/capabilityCallWorker.ts`
- `convex/lib/callLifecycle/{contracts,admission,authorityHandlers,callActions,dispatch,reconciliation}.ts`
- `src/modules/capability-execution/{convex.ts,internal/convex-schema.ts,call-admit.ts,call-contracts.ts,call-material.ts,call-runtime.ts,call-receipt-view.ts,call-approval.functions.ts}`
- `src/modules/capability-execution/call-worker/{runPreparation.ts,runRelease.ts,recover.ts,recovery/*}`
- `src/lib/server/{call-approval-source.ts,call-history.functions.ts}`
- `src/routes/_operator/activity.tsx`
- `src/routes/calls.$callRef.tsx`

Key changes:

- `operationResultValue` → `callResultValue`
- `operationDispatch*` → `callDispatch*`
- invocation state/summary/authority helper families → Call names
- `PendingOperationApproval` and approval RPCs → Call names and `capabilityCalls:*`
- `operationLabel` → `toolLabel`
- internal Call argument, reconciliation, dispatch, preparation, recovery, and row names updated
- owner history RPCs now target `capabilityCallProjections:*`
- reconciliation no longer suggests a fresh `tool.call` after uncertain dispatch
- Call receipt now derives presentation-only Purchase status and Outcome record labels from existing status/result/receipt facts; no persisted Purchase or Outcome state was added
- route and receipt copy now uses Call/Tool language while retaining protected receipt identity

Tests/fixtures mechanically updated or touched:

- `tests/unit/capability-execution/call-receipt-view.test.ts`
- `tests/unit/capability-execution/call-recover.test.ts`
- `tests/unit/capability-execution/call-dispatch.test.ts`
- `tests/unit/convex/capability-call-{approval,authority-boundary,projection,recovery}.test.ts`
- `tests/unit/convex/capability-call-worker-{authority-boundary,harness,reconcile,run}.test.ts`
- `tests/unit/server/call-approval-source.test.ts`

The last mechanical rewrite of `tests/unit/chat/chat-system.test.ts` was interrupted by the user pause; treat that file as unverified and inspect it first next context.

### Protected identities preserved

No intentional changes were made to:

- `operation-invoke-authority:v1`
- `operation-invocation-attempt:v1`
- `current_operation_commitment:v1`
- `ae.operation-commitment:v1`
- `ae.public-invocation-receipt:v1`
- `action_invocation_reconciliation`
- protected canonical `operationRef`, `invocationRef`, and `commitmentRef` keys
- `chatTools` protected command-digest keys
- `operation.invoke` / `operationKeyFor` material
- opaque Tool/Quote/attempt prefixes
- generic Action execution fields and `executionRef`
- external OpenAPI, MCP, OAuth, x402, and financial protocol fields

No compatibility aliases, migrations, new dependencies, generated-file edits, commits, deployment, data reset, AgentMux, or comparison `a19f` writes occurred.

### Verification

Passed after the edits:

```sh
npm exec --offline -- vitest run \
  tests/unit/capability-execution/call-receipt-view.test.ts \
  --no-file-parallelism
```

Result: 1 file, 5 tests passed.

Pre-edit baseline focused run remained:

- 142 tests
- 7 failures across 3 files
- `capability-call-recovery.test.ts`: `projectRecovery` handler lookup undefined
- `call-recover.test.ts`: canonical digest fixture failures plus one stale environment/operation fixture
- `capability-call-authority-boundary.test.ts`: agent-access registration/forged-digest failures, attributed to policy-group interaction

Not yet run after the edits:

- full focused Call lifecycle suites
- workpool/integration tests
- scoped lint or `git diff --check`
- compiler/typecheck
- Convex codegen

### Remaining implementation

Known remaining Call-owned seams from the completed inventory:

- `tests/unit/convex/capability-call-history.test.ts` and related history fixtures
- `tests/helpers/convex-fixtures.ts`
- `convex/marketDispatchWorkpool.ts`
- `convex/capabilityCallX402AuthorizationExpiry.ts`
- `src/modules/capability-supply/internal/route-transport-call.ts`
- `src/lib/server/call-api.ts` direct envelope/telemetry consumers
- chat structured-card tests, especially:
  - `tests/unit/chat/chat-system.test.ts`
  - `tests/unit/chat/chat-agent-tools.test.ts`
  - `tests/unit/chat/operation-call-handback.test.tsx`
- CLI Call/status/history consumers and fixtures under `tools/ae/`
- known later-owner telemetry/MCP/CLI/public-contract names remain explicit handoffs; protected telemetry keys must not be recursively renamed

The `operation` usage-dimension value remains intentionally pending the later money/usage owner.

### Root handoff

Root must own and serialize:

- `src/modules/module-boundaries.ts`
- shared indexes and any native source export updates
- Convex generated API/data-model artifacts from the renamed exports in:
  - `convex/capabilityCalls.ts`
  - `convex/capabilityCallProjections.ts`
- schema/codegen checkpoint and final generation
- global compiler and final serialized commits

Next context should begin by checking the interrupted chat test rewrite, then run the focused Call suites and repair failures before claiming module readiness.

## Prior implementation/inventory record


## Current implementation — 2026-09-06

Quote independently SOURCE ACCEPTED (5/10). Same Call module owner is now implementing from the completed inventory below; all held Quote/Call seams are released. Baseline is `/tmp/ae-quote-review-corrected-candidate-20260906/manifest.json`. Whole lifecycle, direct consumers, Suggested next action and derived presentation stay one assignment. Root owns shared index/generated/tracker and global checkpoints.

## Current Call module — inventory complete, implementation held

The complete read-only preparation below is ready for the same Call ownership
once Quote is accepted. No targeted read remains. Do not start a new inventory
or split the boundary into fixture/compiler micro-projects. Quote/shared producer
seams remain held; no Call source change or test run occurred in this preparation.

Coordinator qualification: generated API/dataModel files derive source imports.
Root will assess concrete generation needs after source completion; renaming an
export alone does not establish stale generated output. Root owns shared index,
generation and compiler coordination. Preserve canonical chat command digest
keys `operationRef`/`commitmentRef` and the `chat-invoke` idempotency prefix, as
well as the protected evidence formats below. Current DTO fields remain canonical.
The latest Quote probe also found old Call worker harness fields and helper
imports; these are existing whole-Call fixture work, not new assignments.

### Prepared Call inventory receipt — 2026-09-06

Call inventory complete. No source changes, tests, compiler, generation, tracker, deploy, or live actions were performed.

### Ownership and held seam

Call remains one accepted Tool use under an accepted Quote. The same Call owner retains this entire boundary after Quote acceptance:

- `src/modules/capability-execution/call*.ts`
- `src/modules/capability-execution/call-worker/**`
- `convex/capabilityCalls.ts`
- `convex/capabilityCallIdentity.ts`
- `convex/capabilityCallProjection.ts`
- `convex/capabilityCallProjections.ts`
- `convex/capabilityCallWorker.ts`
- `convex/capabilityCallLiveX402.ts`
- `convex/capabilityCallX402AuthorizationExpiry.ts`
- `convex/lib/callLifecycle/{contracts,admission,authorityHandlers,callActions,dispatch,reconciliation,workComplete}.ts`
- `convex/marketDispatchWorkpool.ts` and Call-owned workload-cron dispatch

Quote is still the sole source writer. Hold the mixed Quote/Call seam in:

- `convex/capabilityQuotes.ts`, including `readForCall`
- `convex/lib/callLifecycle/admission.ts`, including Quote lookup, consumption, and abandonment
- `src/modules/capability-execution/quote.ts`
- `src/modules/capability-execution/quote.actions.ts`
- direct Quote callers in `convex/chatTools.ts` and `src/lib/server/call-api.ts`

Current source already contains `quoteRef` and `consumedCallRef` in parts of this seam, while fixtures and compatibility symbols remain old. Treat that as Quote-owned work in progress, not a new Call defect.

### Current mappings

- Purchased Invocation → Call
- purchased `invocationRef` → `callRef`
- purchased `commitmentRef` → `quoteRef`
- purchased `operationRef` → `toolRef`
- `operationRevision` → `toolVersion`
- `operationMaterialDigest` → `toolMaterialDigest`
- `operationJson` → `toolJson`
- `operationLabel` → `toolLabel`
- `capabilityOperationInvocations` → `capabilityCalls`
- `capabilityOperationCallProjections` → `capabilityCallProjections`
- `maximumSpendPerInvocation` → `maximumSpendPerCall`
- `maximumConcurrentInvocations` → `maximumConcurrentCalls`
- `per_invocation_exceeds_daily` → `per_call_exceeds_daily`
- `SuggestedContinuation` → `SuggestedNextAction`
- structured card `continuation` → `suggestedNextAction`
- Call detail route → `/calls/$callRef`
- Call actions → `tool.call`, `call.list`, `call.status`, `call.cancel`, `call.reconcile`

Target HTTP route files already exist under:

- `/api/v1/tools/call`
- `/api/v1/calls`
- `/api/v1/calls/$callRef`
- `/api/v1/calls/$callRef/cancel`
- `/api/v1/calls/$callRef/reconcile`

Physical renames are not completion. Remaining stale AE-owned families include `operationResultValue`, `operationDispatch*`, `invocationState`, `invocationSummary*`, `resolveInvocation*`, `reconcileInvocation*`, `PendingOperationApproval`, `listPendingOperationApprovals`, `decideOperationApproval`, old `operationLabel`, and old backend source-action strings.

The approval cutover is specifically:

- `PendingOperationApproval` → `PendingCallApproval`
- `OperationApprovalDecisionResult` → `CallApprovalDecisionResult`
- `listPendingOperationApprovals*` → `listPendingCallApprovals*`
- `decideOperationApproval*` → `decideCallApproval*`
- `capabilityOperationInvocations:*` → `capabilityCalls:*`

### Storage and codecs

`capabilityCallTables` currently defines:

- `capabilityCallProjections`
- `capabilityQuotes`
- `capabilityCalls`
- `sellerOnboardingCanaryRearmAudits`
- `providerConsequenceJournal`

Required indexed links are:

- projection: `by_callRef`, account/tool/time indexes
- Quote: `by_quoteRef`
- Call: `by_callRef`, `by_principalId_and_callRef`, `by_toolRef_and_state`, idempotency/state/reconciliation indexes
- canary audit: `by_callRef`
- money/provider/qualified-use consumers: `by_callRef` and Tool/time indexes

`src/modules/capability-execution/schema.ts` already re-exports the Call tables and `convex/schema.ts` already merges them. No compatibility alias or new table is required.

Current validators/codecs cover Call input, authority, receipt, usage, result, recovery, reconciliation, status, and JSON evidence. The receipt view is `CallReceiptView`; its protected version remains `ae.public-invocation-receipt:v1`.

### Lifecycle and evidence boundary

The complete lifecycle is:

1. Quote-bound admission: current Tool, input, authority, environment, policy, and idempotency validation.
2. Reservation: exact Quote match, concurrency/budget checks, Call row creation, Quote consumption.
3. Authority: approval or policy decision, grant revalidation, current Tool revalidation.
4. Dispatch: Workpool enqueue, durable `callRef`, `workId`, dispatch state, lease and attempt fencing.
5. Preparation/release: provider connection, charge/reservation, x402 authorization, provider consequence, transport, settlement/release.
6. Completion: output validation, usage, evidence hash, delivery/payment/provider-obligation projection.
7. Recovery: status, cancel, reconcile, authorization expiry, automatic reconciliation and retry.
8. Receipt/history: Call status, receipt stages, owner history, usage, suggested next action.

The durable evidence chain is:

`callRef → executionRef/actionExecution control → attemptRef/effectGeneration → provider lease → x402/payment evidence → provider consequence journal → usage/qualified-use evidence → receipt/projection`.

Uncertain payment, delivery, provider effect, release, or output remains `reconciliation_required`/unknown. Recovery reuses the same Call identity and cannot create another Call or duplicate a charge.

### Direct callers and presentation

Server/API adapters:

- `src/lib/server/call-api.ts`
- `src/lib/server/call-history.functions.ts`
- `src/lib/server/call-recovery.functions.ts`
- `src/lib/server/call-approval-source.ts`
- `src/lib/server/mcp-api.ts`
- `src/lib/server/gateway-telemetry.ts`

Direct UI/readbacks:

- `src/routes/calls.$callRef.tsx`
- `src/routes/_operator/activity.tsx`
- `src/routes/_operator/agent-access.tsx`
- `src/components/ae/console/AeAgentOperatorConsole.tsx`
- `src/modules/chat/tool-card.ts`
- `src/components/ae/chat/ToolCard.tsx`
- chat transcript/share projections
- Call links in command panel, activity and recovery surfaces

Direct chat/CLI consumers:

- `convex/chatTools.ts`
- `tools/ae/commands/call.ts`
- `tools/ae/commands/status.ts`
- `tools/ae/commands/wait.ts`
- `tools/ae/commands/cancel.ts`
- `tools/ae/commands/recover.ts`
- `tools/ae/commands/history.ts`
- `tools/ae/lib/suggested-continuation-adapter.ts`

Catalogue presentation is already accepted and is not part of this inventory.

### Tests and fixtures

Call-owned focused suites:

- `tests/unit/capability-execution/call-{admit,authority,dispatch,recover,recovery-actions,history-actions,receipt-contract,receipt-view}.test.ts`
- `tests/unit/convex/capability-call-{approval,authority-boundary,history,identity,projection,recovery,reservation,work-completion}.test.ts`
- `tests/unit/convex/capability-call-worker-{authority-boundary,charge,lease,reconcile,run}.test.ts`
- `tests/integration/capability-call-workpool.test.ts`
- `tests/integration/capability-supply-owner-funnel-call-events.test.ts`
- Call transport, x402, provider-consequence, seller-canary and schema tests

Cross-area consumers requiring the Call contract:

- `tests/unit/convex/money-managed-call.test.ts`
- `tests/unit/convex/money-x402-payment-attempts.test.ts`
- `tests/integration/money-formance-boundary.test.ts`
- `tests/unit/chat/chat-system.test.ts`
- `tests/unit/chat/operation-call-handback.test.tsx`
- `tests/unit/routes/call-status-route.test.tsx`
- `tests/unit/server/call-api.test.ts`
- `tests/unit/server/call-history-api.test.ts`
- `tests/unit/server/call-recovery-api.test.ts`
- `tests/unit/server/mcp-api-call-recovery.test.ts`
- CLI Call, wait, recovery, history and Suggested next action tests
- `tests/helpers/convex-fixtures.ts` and development Tool fixtures

Some target test filenames exist while their contents still retain old route, RPC, fixture, or protected compatibility names.

### Protected exceptions

Do not rename or reserialize:

- `operation-invoke-authority:v1`
- `operation-invocation-attempt:v1`
- `current_operation_commitment:v1`
- `ae.operation-commitment:v1`
- `ae.public-invocation-receipt:v1`
- `action_invocation_reconciliation`
- canonical hash/signature keys such as `commitmentRef`, `operationRef`, `invocationRef`
- `operationKeyFor` material and protected `operation.invoke` bytes
- opaque prefixes such as `operation:v1`, `operation-commitment:v1`, attempt/lease identifiers
- generic `actionExecution*`, `executionRef`, attempts and history
- upstream OpenAPI `operationId`, MCP methods, OAuth fields, x402 fields and arbitrary Tool/Provider input
- financial `operationKey`, Formance namespaces and external transaction references
- Provider/Seller/payee, Charge/Provider obligation/Payout, delivery/payment and purchase-resolution distinctions

No persisted `Purchase`, `OutcomeRecord`, closure table, or parallel recovery state machine is authorized. Purchase resolution/status and Outcome presentation remain derived from existing Call result, receipt, usage, delivery, payment, provider-obligation and qualified-use evidence.

### Money, public and generated dependencies

Money consumers remain issue18-owned:

- `convex/moneyManagedCall.ts`
- `convex/moneyManagedCallLifecycle.ts`
- `convex/moneyBillingAuthorization.ts`
- `convex/moneyProviderObligations.ts`
- `convex/moneyX402PaymentAttempts.ts`
- `convex/qualifiedUse.ts`
- provider-consequence and canary audit consumers

Call supplies/consumes `callRef`, `quoteRef`, `toolRef`, attempt identity and evidence links; it does not own money semantics or reseller accounting.

Issues19–22 own later HTTP/MCP, CLI, discovery/plugin, package and generated-machine cutovers. `convex/_generated/api.d.ts` already references target Call modules but must be regenerated after source RPC/file completion. `src/routeTree.gen.ts` already contains target Call routes and must remain generated. `src/modules/module-boundaries.ts` needs the final target path/test receipt. `src/modules/capability-execution/index.ts` currently exposes seller-canary exports only; current Call consumers use explicit entry files, so no new root alias/export is indicated.

### Storage-return ownership

The recorded storage checkpoint passed the schema/import portion: 22/22 tests. The full five-suite storage return remains open with seven documented failures:

- `tests/integration/capability-call-workpool.test.ts`: old publication/Tool fixture produces an undefined Tool resource around line 339. This is Call Workpool/fixture propagation, dependent on accepted Tool/Quote shapes; it is not a money failure.
- `tests/unit/convex/money-managed-call.test.ts`: fixture inserts old Quote/Call shapes at lines 113, 220 and 244 and retains old Call RPC arguments. The missing `quoteRef`/`callRef` producer contract is held by Quote/Call; managed booking, reservation, obligation and RPC consumer updates belong to money issue18.

The same existing five-suite rerun is the return point after Quote, Call and managed-money contract propagation. No isolated fixture micro-project is warranted.

Targeted read remaining: none.

### Earlier Call issue records

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee:
Assigned role: Luna Max / paid Call lifecycle and recovery implementation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 29, 30

## Outcome

### Active storage group — complete indexed-link boundary, 2026-09-06

This section supersedes earlier reactive source claims, not the fixed contract
or full issue acceptance. One root cause: new index names retain removed field
names in schema arrays or indexed predicates. The same owner repairs definitions,
readers and existing test expectations together. The parallel secret-lifecycle
slice is disjoint and remains owned by the durable-record issue.

Exact schema corrections, preserving all other fields/indexes and order:

| Table / index | Field array |
| --- | --- |
| capabilityCallProjections / by_accountRef_and_toolRef_and_createdAt | accountRef, toolRef, createdAt |
| capabilityCallProjections / by_toolRef_and_createdAt | toolRef, createdAt |
| capabilityQuotes / by_quoteRef | quoteRef |
| capabilityCalls / by_callRef | callRef |
| capabilityCalls / by_principalId_and_callRef | principalId, callRef |
| capabilityCalls / by_toolRef_and_state | toolRef, state |
| sellerOnboardingCanaryRearmAudits / by_callRef | callRef |
| moneyProviderObligations / by_callRef | callRef |
| moneyUsageEvents / by_callRef | callRef |
| qualifiedUseReceipts / by_callRef | callRef |
| qualifiedUseReceipts / by_toolRef_and_qualifiedAt | toolRef, qualifiedAt |

Source allowlist (schema arrays and the matching lookup predicates only):

- `src/modules/capability-execution/internal/convex-schema.ts`
- `src/modules/money/internal/convex-schema.ts`
- `convex/capabilitySupplyToolQueries.ts`
- `convex/capabilitySupplyCurrentTool.ts`
- `convex/capabilityProviderTools.ts`
- `convex/lib/providerOffboardingFreeze.ts`
- `convex/capabilityProviderOffboarding.ts`
- `convex/capabilityCallProjections.ts`
- `convex/capabilityQuotes.ts`
- `convex/moneyManagedCall.ts`
- `convex/moneyManagedCallLifecycle.ts`
- `convex/moneyBillingAuthorization.ts`
- `convex/capabilityCallX402AuthorizationExpiry.ts`
- `convex/workloadCron.ts`
- `convex/lib/callLifecycle/reconciliation.ts`
- `convex/lib/callLifecycle/dispatch.ts`
- `convex/lib/callLifecycle/callActions.ts`
- `convex/lib/callLifecycle/authorityHandlers.ts`
- `convex/lib/callLifecycle/workComplete.ts`
- `convex/lib/providerConnections/leases.ts`
- `convex/qualifiedUse.ts`
- `convex/capabilitySupplyOwnerCanary.ts`
- `convex/capabilityProviderConsequenceJournal.ts`
- `convex/lib/qualifiedUsePayout/authority.ts`

For existing renamed indexes, predicate keys become `callRef`, `quoteRef` or
`toolRef` according to the table's declared field. The indexed comparison value,
range order, limits and lookup behavior stay unchanged. Provider consequence's
two non-index row filters on the renamed Call link are included. Do not rename
local variables, other object fields, lifecycle behavior or canonical encodings.
Existing schema re-exports are inspected read-only; they already export the
renamed table definitions. No new export or alias is needed.

Test allowlist:

- `tests/unit/schema/convex-schema.test.ts`
- `tests/unit/schema/money-schema.test.ts`
- `tests/imports/capability-supply-boundaries.test.ts`
- `tests/integration/capability-call-workpool.test.ts`
- `tests/unit/convex/money-managed-call.test.ts`

Update the corresponding index names/lookup predicates and runtime fixtures
only. In the schema test, the **current runtime** approval fixture must use
`approval_required`; `approve_each` remains only where the protected canonical
projection requires it. The frozen run establishes this distinction (8 passed,
2 failed before repair). Preserve assertion meaning; extend the existing schema
expectations to verify the eleven exact field arrays, not names alone.

Run under Node 22/npm 11.5.1:

`npm exec --offline -- vitest run tests/unit/schema/convex-schema.test.ts tests/unit/schema/money-schema.test.ts tests/imports/capability-supply-boundaries.test.ts tests/integration/capability-call-workpool.test.ts tests/unit/convex/money-managed-call.test.ts --no-file-parallelism`

Run narrow Oxlint on changed files and whitespace checks. Expected: schema and
indexed read assertions pass without weakened guards. If a selected suite is
blocked by a separately queued policy/Call contract, return the exact failing
input/output and required producer; do not silently expand to that group's code
or claim this group complete. Root records the dependency and return point.

Explicit exclusions: secret-lifecycle files; signed reconciliation keys;
`operation-invoke-authority:v1`; original digest formats/opaque refs;
`consumedInvocationRef` pending its complete Quote/Call field contract;
`dimensionKind: 'operation'` pending its usage-contract group; upstream x402 and
OpenAPI fields; financial `operationKey`, portfolio `serviceRef`; generic IAM;
generated files; package/config changes; deployment/recovery/data/Git operations.

After source tests, native generation is serialized under the existing artifact
issue; root refreshes integrated counts under the verification issue. This
bounded storage acceptance cannot by itself close the complete Call issue.

**Storage source checkpoint — 2026-09-06:** the eleven arrays, matching
allowlisted indexed predicates and schema/index fixtures are repaired. The
three schema/import suites passed (22/22 tests); narrow Oxlint and whitespace
checks passed. Worker compactions 0, no running test processes, ownership
released. No generator or deployment was run by the source owner.

The combined five-suite run still has **7 failures** in the two broader suites:
`capability-call-workpool.test.ts` supplies an undefined Tool resource at line
339 from its old fixture contract; `money-managed-call.test.ts` inserts old
Quote/Call fixtures without required `quoteRef` (lines 113, 220, 244). Root
confirmed the latter fixtures also retain old Call RPC arguments. These are
producer/consumer contract dependencies, not more index-name failures.

The storage group is **not closed**. Native generation can now be attempted
to verify the repaired schema; it cannot make these tests pass by association.
Return point: rerun the same complete five-suite command after the Tool fixture,
Quote, Call and managed-money contract groups repair those inputs/callers.
Those existing group owners retain the tests; do not dispatch an isolated
fixture-renaming batch, weaken validation or call this a pre-refactor failure.

### Call-list backend claim — 2026-09-05

`vocab_call_list_rpc_05` owns exactly `convex/capabilityCalls.ts`,
`convex/lib/callLifecycle/callActions.ts`,
`convex/lib/callLifecycle/authorityHandlers.ts`, `src/lib/server/call-api.ts`,
`tests/unit/server/call-history-api.test.ts` and
`tests/unit/server/call-recovery-api.test.ts`. Fixed backend names:
`listInvocations` → `listCalls`, `listAgentInvocationSummaries` →
`listAgentCallSummaries` (including Handler), `listAgentInvocationsHandler` →
`listAgentCallsHandler`. Preserve filtering, pagination and identity material.
Update corresponding history-service fixtures and repeat both API suites.
Other backend families and schema-validator symbols stay separately owned.

### Recovery backend claim and service handoff — 2026-09-05

Recovery backend handoff received: exact seven files, recovery API suite 7/7
passed and scoped lint passed, zero compactions. Route mock exports were
updated but the route suite remains unrun. The other backend invoke/list/
workload-authority families and deferred test callers remain open source work.

Call service batch handed back: exact nine files, two suites / 23 tests passed,
narrow lint/whitespace passed, zero compactions. Six request identity vectors
remain unchanged. Other module fixtures still require their own propagation.

`vocab_recovery_rpc_04` now owns exactly `convex/capabilityCalls.ts`,
`convex/lib/callLifecycle/callActions.ts`,
`convex/lib/callLifecycle/authorityHandlers.ts`, `src/lib/server/call-api.ts`,
`src/modules/capability-execution/call-recovery.functions.ts`,
`tests/unit/server/call-recovery-api.test.ts` and
`tests/unit/routes/call-status-route.test.tsx`. Rename the six agent/owner
status, cancel and reconcile RPC families from Invocation to Call, together
with corresponding Handler/SourceAction/Server symbols and exact RPC strings.
The existing service methods and public Call route names are already target
names. Leave invoke/list/workload-authority RPC families for separate batches.
Repeat recovery API tests; route test only receives mock-export propagation.

### Current bounded service claim — 2026-09-05

`vocab_call_service_03` owns one interface propagation through exactly
`src/modules/capability-execution/call-authority.ts`, `call-recover.ts`,
`call-recovery.actions.ts`, `quote.actions.ts`, `call-history.actions.ts`
(all five in the same capability-execution directory),
`src/lib/server/call-api.ts`, `convex/lib/callLifecycle/callActions.ts`,
`tests/unit/server/call-recovery-api.test.ts` and
`tests/unit/capability-execution/call-recovery-actions.test.ts`.

Fixed service members: `invokeOperation` → `callTool`, `inspectOperation` →
`quoteTool`, `listInvocations` → `listCalls`, `readInvocationStatus` →
`readCallStatus`, `cancelInvocation` → `cancelCall`, `reconcileInvocation` →
`reconcileCall`. Backend RPC strings/exported handlers remain separate queued
work. Original hash keys, literals and six request-identity vectors stay fixed.
The two assigned suites previously passed 7 + 16 tests; repeat after this rename.
Remove the two newly introduced optional-method non-null assertions in the
identity test using explicit failure guards, without weakening assertions.
No other lifecycle/model/permission change or generation is assigned.

Rename the AE-owned purchased invocation lifecycle to Call from Quote
admission through reservation, dispatch, provider effect, delivery/payment
observation, recovery, receipt/history and read models. A Call is one accepted
use of a Tool. Preserve effect identity, idempotency, leasing, concurrency,
cancellation, uncertain outcomes, reconciliation and all authority/money
boundaries. The worker must update definitions and every listed caller/test in
one coherent patch after the Quote checkpoint; a definition-only Call rename is
not complete.

## Fixed mappings

| Existing AE-owned name | Replacement | Rule |
| --- | --- | --- |
| Purchased Invocation | Call | One accepted Tool use; never create a second purchase object. |
| `invocationRef` on a purchased Call | `callRef` | Rename the API/storage field only at the paid lifecycle boundary. |
| purchased `commitmentRef` | `quoteRef` | Consume issue 15's Quote field; preserve opaque Quote identifier bytes. |
| purchased `operationRef` | `toolRef` | Consume issue 13's Tool field; preserve opaque Tool identifier bytes. |
| purchased `operationRevision` | `toolVersion` | Preserve revision/version value and stale-version refusal. |
| purchased `operationMaterialDigest` | `toolMaterialDigest` | Rename surrounding field; digest bytes stay unchanged. |
| purchased `operationJson` | `toolJson` | Rename API/storage field; use existing snapshot codecs. |
| purchased `operationLabel` | `toolLabel` | Rename the AE-owned presentation/read-model field. |
| `capabilityOperationInvocations` | `capabilityCalls` | Physical table, validators, indexes, readers, writers and queued payloads move together. |
| `capabilityOperationCallProjections` | `capabilityCallProjections` | Physical projection table/index and rebuild path move together. |
| `capabilityOperationInvocationIdentity.ts` | `capabilityCallIdentity.ts` | Rename AE-owned module; preserve attempt identity material bytes. |
| `capabilityOperationInvocationProjection.ts` | `capabilityCallProjection.ts` | Rename AE-owned projection module; preserve delivery/payment/provider states. |
| `capabilityOperationInvocationWorker.ts` | `capabilityCallWorker.ts` | Rename AE-owned worker module; preserve leases/retry/recovery. |
| `capabilityOperationLiveX402.ts` | `capabilityCallLiveX402.ts` | Rename AE-owned module; preserve x402 protocol fields. |
| `capabilityOperationX402AuthorizationExpiry.ts` | `capabilityCallX402AuthorizationExpiry.ts` | Rename AE-owned recovery module; preserve authorization/expiry semantics. |
| `operation-invoke` family in paid execution | `call` family | Exact file mappings below; public action IDs/routes are issue 19's cutover. |
| `operationInvocations` Convex helper family | `callLifecycle` | Rename the AE-owned helper boundary; retain file responsibilities and existing sequencing. |
| AE-owned budget `maximumSpendPerInvocation` | `maximumSpendPerCall` | Call-facing source/storage field; preserve the existing policy digest bytes through its current encoder. |
| AE-owned budget `maximumConcurrentInvocations` | `maximumConcurrentCalls` | Call-facing source/storage field; preserve limit and concurrency behaviour. |
| `per_invocation_exceeds_daily` | `per_call_exceeds_daily` | AE-owned validation error; preserve refusal semantics and existing canonical digest basis. |

Post-11 generic Action execution is not part of these replacements. Its
`actionExecution*` source/table family and `executionRef` remain generic
execution concepts (issue 11). Do not turn them into paid Calls. Any legacy
invocation wording in the pre-11 source is consumed by issue 11's post-cutover
`action-execution` files, controls, attempts and `executionRef`; it is not a
paid Call field. Only an explicitly paid Call record is mapped to `callRef`.

## Exact owned file mapping

All paths are literal. Rename the paid execution file stems and update their
known importers/tests in the same patch. Do not use a directory-wide wildcard.

### Paid execution source

- `src/modules/capability-execution/invocation-material.ts` → `src/modules/capability-execution/call-material.ts`
- `src/modules/capability-execution/invocation-runtime.ts` → `src/modules/capability-execution/call-runtime.ts`
- `src/modules/capability-execution/invocation-receipt-view.ts` → `src/modules/capability-execution/call-receipt-view.ts`
- `src/modules/capability-execution/operation-invoke-admit.ts` → `src/modules/capability-execution/call-admit.ts`
- `src/modules/capability-execution/operation-invoke-contracts.ts` → `src/modules/capability-execution/call-contracts.ts`
- `src/modules/capability-execution/operation-invoke-entry.ts` → `src/modules/capability-execution/call-entry.ts`
- `src/modules/capability-execution/operation-invoke-recover.ts` → `src/modules/capability-execution/call-recover.ts`
- `src/modules/capability-execution/operation-invoke.actions.ts` → `src/modules/capability-execution/call.actions.ts`
- `src/modules/capability-execution/operation-invoke.ts` → `src/modules/capability-execution/call-authority.ts`
- `src/modules/capability-execution/operation-history.actions.ts` → `src/modules/capability-execution/call-history.actions.ts`
- `src/modules/capability-execution/operation-approval.functions.ts` → `src/modules/capability-execution/call-approval.functions.ts`
- `src/modules/capability-execution/operation-recovery-contracts.ts` → `src/modules/capability-execution/call-recovery-contracts.ts`
- `src/modules/capability-execution/operation-recovery.actions.ts` → `src/modules/capability-execution/call-recovery.actions.ts`
- `src/modules/capability-execution/operation-recovery.functions.ts` → `src/modules/capability-execution/call-recovery.functions.ts`
- `src/modules/capability-execution/invocation-worker/brokeredX402.ts` → `src/modules/capability-execution/call-worker/brokeredX402.ts`
- `src/modules/capability-execution/invocation-worker/charge.ts` → `src/modules/capability-execution/call-worker/charge.ts`
- `src/modules/capability-execution/invocation-worker/jitProviderConsequence.ts` → `src/modules/capability-execution/call-worker/jitProviderConsequence.ts`
- `src/modules/capability-execution/invocation-worker/lease.ts` → `src/modules/capability-execution/call-worker/lease.ts`
- `src/modules/capability-execution/invocation-worker/providerConsequenceBridge.ts` → `src/modules/capability-execution/call-worker/providerConsequenceBridge.ts`
- `src/modules/capability-execution/invocation-worker/recover.ts` → `src/modules/capability-execution/call-worker/recover.ts`
- `src/modules/capability-execution/invocation-worker/runPreparation.ts` → `src/modules/capability-execution/call-worker/runPreparation.ts`
- `src/modules/capability-execution/invocation-worker/runRelease.ts` → `src/modules/capability-execution/call-worker/runRelease.ts`
- `src/modules/capability-execution/invocation-worker/sellerCanaryReceipt.ts` → `src/modules/capability-execution/call-worker/sellerCanaryReceipt.ts`
- `src/modules/capability-execution/invocation-worker/x402Authorization.ts` → `src/modules/capability-execution/call-worker/x402Authorization.ts`
- `src/modules/capability-execution/invocation-worker/x402Route.ts` → `src/modules/capability-execution/call-worker/x402Route.ts`
- `src/modules/capability-execution/invocation-worker/x402Settlement.ts` → `src/modules/capability-execution/call-worker/x402Settlement.ts`
- `src/modules/capability-execution/invocation-worker/recovery/cancellation.ts` → `src/modules/capability-execution/call-worker/recovery/cancellation.ts`
- `src/modules/capability-execution/invocation-worker/recovery/contracts.ts` → `src/modules/capability-execution/call-worker/recovery/contracts.ts`
- `src/modules/capability-execution/invocation-worker/recovery/expiry.ts` → `src/modules/capability-execution/call-worker/recovery/expiry.ts`
- `src/modules/capability-execution/invocation-worker/recovery/index.ts` → `src/modules/capability-execution/call-worker/recovery/index.ts`
- `src/modules/capability-execution/invocation-worker/recovery/loading.ts` → `src/modules/capability-execution/call-worker/recovery/loading.ts`
- `src/modules/capability-execution/invocation-worker/recovery/managedSigning.ts` → `src/modules/capability-execution/call-worker/recovery/managedSigning.ts`
- `src/modules/capability-execution/invocation-worker/recovery/preSubmission.ts` → `src/modules/capability-execution/call-worker/recovery/preSubmission.ts`
- `src/modules/capability-execution/invocation-worker/recovery/reconciliation.ts` → `src/modules/capability-execution/call-worker/recovery/reconciliation.ts`
- `src/modules/capability-execution/invocation-worker/recovery/status.ts` → `src/modules/capability-execution/call-worker/recovery/status.ts`
- `src/modules/capability-execution/invocation-worker/recovery/x402.ts` → `src/modules/capability-execution/call-worker/recovery/x402.ts`
- `src/modules/capability-supply/internal/route-transport-invoke.ts` → `src/modules/capability-supply/internal/route-transport-call.ts` (Call transport boundary; preserve external MCP/x402 names)
- `src/modules/registry/tool-action-contracts.ts` (post-13 target; issue 13
  owns the filename move, and this issue updates only paid Call fields while
  issue 19 owns public action IDs)
- `src/modules/registry/tool-choice-contracts.ts` (post-13 target; Call-field
  consumer only, with public action ownership retained by issue 19)
- `src/modules/registry/tool-detail-route.functions.ts` (post-13 target;
  Call-field consumer only, with public route ownership retained by issue 19)
- `src/modules/registry/tools.actions.ts` (post-13 target; Call-field
  consumer only, with public action ownership retained by issue 19)
- `src/modules/registry/tool-entry.ts` (post-13 target; Call-field consumer
  only, with public action ownership retained by issue 19)
- `src/modules/common/tool-ref.ts` (post-13 target; map paid Call references
  only and preserve the opaque `operation:v1:` prefix)
- `src/modules/common/market-tool-paths.ts` (post-13 target; Call-field
  consumer only, with route values owned by issue 19)
- `src/modules/registry/tool-paths.ts` (post-13 target; Call-field consumer
  only, with route values owned by issue 19)

The explicit worker mappings above are the complete worker allowlist;
`providerConsequence`, seller and x402 names retain their separate meanings.

### Convex Call tables, identity and workers

- `convex/capabilityOperationInvocations.ts` → `convex/capabilityCalls.ts`
- `convex/capabilityOperationCalls.ts` → `convex/capabilityCallProjections.ts`
- `convex/capabilityOperationInvocationIdentity.ts` → `convex/capabilityCallIdentity.ts`
- `convex/capabilityOperationInvocationProjection.ts` → `convex/capabilityCallProjection.ts`
- `convex/capabilityOperationInvocationWorker.ts` → `convex/capabilityCallWorker.ts`
- `convex/capabilityOperationLiveX402.ts` → `convex/capabilityCallLiveX402.ts`
- `convex/capabilityOperationX402AuthorizationExpiry.ts` → `convex/capabilityCallX402AuthorizationExpiry.ts`
- `convex/lib/operationInvocations/admission.ts` → `convex/lib/callLifecycle/admission.ts`
- `convex/lib/operationInvocations/authorityHandlers.ts` → `convex/lib/callLifecycle/authorityHandlers.ts`
- `convex/lib/operationInvocations/contracts.ts` → `convex/lib/callLifecycle/contracts.ts`
- `convex/lib/operationInvocations/dispatch.ts` → `convex/lib/callLifecycle/dispatch.ts`
- `convex/lib/operationInvocations/invokeActions.ts` → `convex/lib/callLifecycle/callActions.ts`
- `convex/lib/operationInvocations/reconciliation.ts` → `convex/lib/callLifecycle/reconciliation.ts`
- `convex/lib/operationInvocations/workComplete.ts` → `convex/lib/callLifecycle/workComplete.ts`
- `src/modules/capability-execution/internal/convex-schema.ts`
- `src/modules/capability-execution/convex.ts`
- `src/modules/capability-execution/schema.ts`
- `convex/schema.ts`
- `convex/convex.config.ts`
- `convex/marketDispatchWorkpool.ts` (Call payload field names only; preserve queue/retry infrastructure)
- `src/modules/agent-access/policy.ts` (Call budget source fields and existing policy-digest adapter)
- `src/modules/agent-access/production-policy.ts` (Call budget defaults/limits)
- `src/modules/agent-access/sandbox-policy.ts` (Call budget defaults/limits)
- `src/modules/agent-access/agent-access.ts` (Call budget readbacks)
- `src/modules/agent-access/agent-access.functions.ts` (Call budget validation/readbacks)
- `src/modules/agent-access/internal/convex-schema.ts` (Call budget schema fields)
- `src/modules/agent-access/internal/oauth-convex-schema.ts` (Call budget schema fields)
- `src/modules/agent-access/oauth-state.ts` (Call budget OAuth state)
- `src/lib/server/agent-access-oauth-api.ts` (Call budget contract consumer)
- `src/lib/server/agent-access-oauth-store.ts` (Call budget storage consumer)
- `src/lib/server/agent-access-oauth/protocol.ts` (Call budget protocol consumer)
- `convex/agentAccessPolicy.ts` (Call budget storage projection)
- `convex/agentAccessOAuth.ts` (Call budget grant consumer)
- `convex/capabilityQuotes.ts` (post-15 Quote consumer of Call budget)
- `convex/capabilitySupplyCanaryFunding.ts` (Call budget guard consumer)
- `convex/capabilitySupplyOwnerCanary.ts` (Call budget guard consumer)
- `convex/lib/callLifecycle/admission.ts` (post-16 Call budget admission consumer)
- `src/components/ae/console/AeAgentOperatorConsole.tsx` (Call budget UI field consumer)
- `tests/unit/agent-access-functions.test.ts`
- `tests/unit/agent-access-oauth-state.test.ts`
- `tests/unit/agent-access-policy.test.ts`
- `tests/unit/agent-access-production-policy.test.ts`
- `tests/unit/agent-access-sandbox-policy.test.ts`
- `tests/unit/agent-access.test.ts`
- `tests/unit/authority/context/consequence-authority.test.ts`
- `tests/unit/convex/authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-approval.test.ts`
- `tests/unit/convex/capability-operation-authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-reservation.test.ts`
- `tests/unit/convex/capability-supply-readiness-authority.test.ts`
- `tests/unit/convex/money-managed-call.test.ts`
- `tests/unit/convex/seller-onboarding-canary-funding-readiness.test.ts`
- `tests/unit/routes/agent-access-caller-continuation.test.tsx`
- `tests/unit/routes/agent-access-console.test.ts`
- `tests/unit/server/agent-access-oauth-api.test.ts`
- `tests/unit/ui/agent-access-owner-console.test.tsx`
- `tests/unit/ui/demand-console.test.tsx`
- `tests/integration/capability-operation-workpool.test.ts`
- `tests/integration/capability-supply-owner-funnel-harness.ts`
- `src/modules/module-boundaries.ts`
- Root `package.json` is a handoff only; issue 22 is the sole manifest writer
  at the early generator checkpoint and final integration. This issue supplies
  exact affected key/path receipts below and does not edit the root manifest.

The Convex schema mappings include all indexes and function references, not
only table declarations:

- `capabilityOperationInvocations` → `capabilityCalls`
- `capabilityOperationCallProjections` → `capabilityCallProjections`
- Call-row `invocationRef` → `callRef`
- Call-row `commitmentRef` → `quoteRef`
- Call-row `operationRef` → `toolRef`
- Call-row operation snapshot/version fields → Tool snapshot/version fields

Do not rename the generic action tables or Convex component internals. Issue
18 owns the operation-bearing `sellerOnboardingCanaryRearmAudits` and
`providerConsequenceJournal` audit/journal rows; this issue hands Call fields
to it without taking ownership of those tables.

### Known Call callers and tests

Update all listed paid Call callers. Rename the Call-focused test files as
shown and update downstream public/financial tests in place; do not leave
stale imports or fixtures merely because issue 19 or issue 18 owns later
semantics.

- `tests/unit/capability-execution/invocation-receipt-view.test.ts` → `tests/unit/capability-execution/call-receipt-view.test.ts`
- `tests/unit/capability-execution/operation-invoke-admit.test.ts` → `tests/unit/capability-execution/call-admit.test.ts`
- `tests/unit/capability-execution/operation-invoke-authority.test.ts` → `tests/unit/capability-execution/call-authority.test.ts`
- `tests/unit/capability-execution/operation-invoke-dispatch.test.ts` → `tests/unit/capability-execution/call-dispatch.test.ts`
- `tests/unit/capability-execution/operation-invoke-recover.test.ts` → `tests/unit/capability-execution/call-recover.test.ts`
- `tests/unit/capability-execution/operation-history-actions.test.ts` → `tests/unit/capability-execution/call-history-actions.test.ts`
- `tests/unit/capability-execution/operation-recovery-actions.test.ts` → `tests/unit/capability-execution/call-recovery-actions.test.ts`
- `tests/unit/capability-execution/operation-receipt-contract.test.ts` → `tests/unit/capability-execution/call-receipt-contract.test.ts`
- `tests/unit/capability-execution/operation-invoke-harness.ts` → `tests/unit/capability-execution/call-harness.ts`
- `tests/unit/capability-supply/route-transport-invoke.test.ts` → `tests/unit/capability-supply/route-transport-call.test.ts`
- `tests/unit/convex/capability-operation-approval.test.ts` → `tests/unit/convex/capability-call-approval.test.ts`
- `tests/unit/convex/capability-operation-authority-boundary.test.ts` → `tests/unit/convex/capability-call-authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-call-projection.test.ts` → `tests/unit/convex/capability-call-projection.test.ts`
- `tests/unit/convex/capability-operation-history.test.ts` → `tests/unit/convex/capability-call-history.test.ts`
- `tests/unit/convex/capability-operation-invocation-identity.test.ts` → `tests/unit/convex/capability-call-identity.test.ts`
- `tests/unit/convex/capability-operation-recovery.test.ts` → `tests/unit/convex/capability-call-recovery.test.ts`
- `tests/unit/convex/capability-operation-reservation.test.ts` → `tests/unit/convex/capability-call-reservation.test.ts`
- `tests/unit/convex/capability-operation-work-completion.test.ts` → `tests/unit/convex/capability-call-work-completion.test.ts`
- `tests/unit/convex/capability-operation-worker-authority-boundary.test.ts` → `tests/unit/convex/capability-call-worker-authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-worker-charge.test.ts` → `tests/unit/convex/capability-call-worker-charge.test.ts`
- `tests/unit/convex/capability-operation-worker-harness.ts` → `tests/unit/convex/capability-call-worker-harness.ts`
- `tests/unit/convex/capability-operation-worker-lease.test.ts` → `tests/unit/convex/capability-call-worker-lease.test.ts`
- `tests/unit/convex/capability-operation-worker-reconcile.test.ts` → `tests/unit/convex/capability-call-worker-reconcile.test.ts`
- `tests/unit/convex/capability-operation-worker-run.test.ts` → `tests/unit/convex/capability-call-worker-run.test.ts`
- `tests/integration/capability-operation-workpool.test.ts` → `tests/integration/capability-call-workpool.test.ts`
- `tests/integration/canonical-tool-reads.test.ts` (post-13 Tool consumer; update only paid Call fields)
- `tests/integration/capability-publication-publish.test.ts` (Call continuation consumer)
- `tests/integration/capability-supply-owner-funnel-read.test.ts` (Call read consumer)
- `tests/integration/money-formance-boundary.test.ts` (issue 18 financial consumer)
- `tests/unit/convex/money-managed-call.test.ts` (issue 18 financial consumer)
- `tests/unit/convex/money-x402-payment-attempts.test.ts` (issue 18 financial consumer)
- `tests/unit/convex/x402-orphan-unplug.test.ts`
- `tests/unit/convex/x402-route-authorization.test.ts`
- `tests/unit/convex/x402-route-rpc-consensus.test.ts`
- `tests/unit/capability-execution/jit-provider-consequence.test.ts`
- `tests/unit/capability-execution/provider-consequence-bridge.test.ts`
- `tests/unit/capability-execution/provider-consequence-http.test.ts`
- `tests/unit/capability-execution/seller-onboarding-canary.test.ts`
- `tests/helpers/convex-fixtures.ts`
- `tests/unit/schema/convex-schema.test.ts`

Known public and installed-client consumers must receive mechanical
`callRef`/`quoteRef`/`toolRef` updates even though later tickets own their
route, action ID, copy or package semantics:

- `src/lib/server/call-history.functions.ts`
- `src/lib/server/operation-invoke-api.ts`
- `src/lib/server/mcp-api.ts`
- `src/lib/server/gateway-telemetry.ts`
- `src/modules/registry/tool-action-contracts.ts` (post-13 Tool path)
- `src/modules/registry/tool-choice-contracts.ts` (post-13 Tool path)
- `src/modules/registry/tool-detail-route.functions.ts` (post-13 Tool path)
- `src/modules/registry/tool-entry.ts` (post-13 Tool path)
- `src/modules/registry/tools.actions.ts` (post-13 Tool path)
- `src/modules/registry/registry.actions.ts`
- `src/routes/api.v1.operations.call.ts`
- `src/routes/api.v1.operations.inspect.ts`
- `src/routes/api.v1.operations.$invocationRef.ts`
- `src/routes/api.v1.operations.$invocationRef.cancel.ts`
- `src/routes/api.v1.operations.$invocationRef.reconcile.ts`
- `src/routes/api.v1.operations.ts`
- `src/routes/operations.invocations.$invocationRef.tsx`
- `src/modules/market/suggested-continuation.ts`
- `src/modules/chat/tool-card.ts`
- `convex/chatTools.ts`
- `convex/catalogOfferingMutations.ts` (seller-canary/Call field consumer)
- `convex/capabilityProviderConsequenceJournal.ts` (issue 18 owns journal meaning; this ticket updates its paid `callRef`/`quoteRef`/`toolRef` consumer fields)
- `convex/moneyManagedCall.ts` (issue 18 owns money meaning; this ticket updates its paid Call refs for typecheck)
- `convex/moneyManagedCallLifecycle.ts` (issue 18 owns money meaning; this ticket updates its paid Call refs for typecheck)
- `convex/moneyProviderObligations.ts` (issue 18 owns obligation meaning; this ticket updates its paid Call refs for typecheck)

## Protected bytes, protocol fields and status boundaries

Use existing encoders/decoders. Renaming surrounding API/storage fields must
not change canonical JSON keys, field ordering, hash material, signatures,
format literals, opaque identifier prefixes or vector bytes:

- `src/modules/capability-execution/operation-invoke.ts` → post-rename
  `call-authority.ts`: preserve `operation-invoke-authority:v1`, including its
  accepted-basis canonical field names/values. Issue 12's AE permission mode
  names may change in source, but the existing authority encoder must map them
  to the old canonical basis payload before hashing.
- `convex/capabilityOperationInvocationIdentity.ts` → post-rename
  `capabilityCallIdentity.ts`: preserve `operation-invocation-attempt:v1`, its
  JSON keys/order, identity inputs and digest vectors.
- `src/modules/capability-execution/current-operation-commitment.ts` → post-15
  `current-tool-quote.ts`: preserve `current_operation_commitment:v1`, current
  digest material and vectors; issue 15 owns the codec boundary.
- `convex/capabilityOperationCommitments.ts` → post-15
  `capabilityQuotes.ts`: preserve `ae.operation-commitment:v1`, canonical
  Quote evidence keys/order and digest; issue 15 owns the codec boundary.
- `src/lib/server/operation-invoke-api.ts:81-90,114-126,184-242,618-632` has
  protected command-key material. When source fields become `quoteRef`,
  `toolRef` or `callRef`, project them back to the existing canonical
  `commitmentRef`, `operationRef` and `invocationRef` keys before
  `operationKeyFor`/recovery-body hashing and mismatch checks. Preserve the
  existing operation-key and recovery vectors in
  `tests/unit/server/operation-invoke-api.test.ts`; assert that nested
  `input.input` remains an opaque Tool/Provider argument payload and is never
  recursively renamed, even if it contains `operationRef`, `requestMandate` or
  another old term. `operationKeyFor` includes
  `contract: OPERATION_INVOKE_ACTION_ID`; issue 19 may expose `tool.call`, but
  the protected hash projection must retain the old `operation.invoke` literal.
  Public route/path names are issue 19's later surface, not permission to
  change these bytes.
- `src/modules/agent-access/policy.ts` and `convex/agentAccessPolicy.ts` own
  the protected `agentAccessPolicyDigest`. Call-facing source fields
  `maximumSpendPerCall` and `maximumConcurrentCalls`, plus
  `per_call_exceeds_daily`, must map through the existing digest owner to the
  old canonical budget keys `maximumSpendPerInvocation`,
  `maximumConcurrentInvocations` and `per_invocation_exceeds_daily` before
  hashing. Preserve the existing policy vectors in the listed agent-access
  tests. Issue 12 owns permission modes; no generic compatibility mapper is
  introduced.
- `operation-commitment:v1:<digest>` Quote identifier and
  `operation:v1:<digest>` Tool identifier prefixes remain exact opaque bytes,
  even when exposed through `quoteRef`/`toolRef`.

Preserve `attemptRef`, `effectGeneration`, idempotency keys, provider identity,
Seller/payment-recipient fields, charge/refund/settlement data, and x402/OAuth/
MCP/OpenAPI protocol fields. Keep these Call facts separate: `deliveryState`,
`paymentState`, `providerObligationState`, and purchase resolution/status.
Terminal failure, uncertain payment or pending delivery must not become
success, and recovery must not create a second purchase or duplicate charge.

## Explicit exclusions

- Do not rename or reshape generic Action execution files/tables under
  `src/modules/action-invocation/`, `convex/actionInvocationControl.ts`, or
  their generic `invocationRef`/`executionRef` fields; issue 11 owns them.
- Do not own money/financial tables, Provider-obligation accounting,
  `sellerOnboardingCanaryRearmAudits` or `providerConsequenceJournal`; issue
  18 consumes the explicit Call field handoff.
- Do not redesign public HTTP/MCP routes, action IDs, CLI/discovery/plugin
  output or UI copy; issue 19–27 own those consumers after this internal
  contract cutover.
- Do not edit generated `_generated` artifacts, deploy, reset data, add a
  dependency, create aliases or build a compatibility/migration engine.

## Dependencies and sequencing

- Baseline 08, reviews 29/30 and core identity/action/authorization issues
  10–12 must be closed before dispatch. Tool catalogue 13, Provider 14 and
  Quote 15 are strict predecessors.
- This ticket is the sole paid Call lifecycle/table/worker writer. Issue 17
  (next actions/outcomes) and issue 18 (money/durable records) wait for its
  `callRef`/`quoteRef`/`toolRef` schema checkpoint. Issue 19 owns public routes
  and action IDs, but cannot receive stale internal field names.
- Shared `convex/schema.ts`, capability-execution schema, module boundaries,
  workpool payloads and generated consumers are serialized. Issue 22 must run
  its intermediate generated checkpoint after table/function/file names and
  its final generator pass after public contracts; do not edit `_generated`.
- The operation-invoke API test is a shared serialized boundary established by
  issue 13 and extended by issue 15. Add only the paid Call/recovery envelope
  projections and vectors here; preserve the earlier opaque `input.input`
  assertion and Quote projection evidence.
- Generic Action execution remains issue 11's separate family. The coordinator
  must resolve any ambiguous cross-boundary `invocationRef` before dispatch;
  this ticket does not choose a new compatibility or migration strategy.
- Hosted cutover/live QA and Package 6/7 remain held by their accepted issues;
  no deployment, data reset or external financial mutation is authorized here.

## Verification commands and expected results

Run with Node `22.x` and npm `11.5.1`, using the existing runner only:

```sh
npm exec vitest run \
  tests/unit/capability-execution/call-receipt-view.test.ts \
  tests/unit/capability-execution/call-admit.test.ts \
  tests/unit/capability-execution/call-authority.test.ts \
  tests/unit/capability-execution/call-dispatch.test.ts \
  tests/unit/capability-execution/call-recover.test.ts \
  tests/unit/capability-execution/call-recovery-actions.test.ts \
  tests/unit/capability-execution/call-receipt-contract.test.ts \
  tests/unit/convex/capability-call-identity.test.ts \
  tests/unit/convex/capability-call-projection.test.ts \
  tests/unit/convex/capability-call-recovery.test.ts \
  tests/unit/convex/capability-call-reservation.test.ts \
  tests/unit/convex/capability-call-work-completion.test.ts \
  tests/unit/convex/capability-call-worker-run.test.ts \
  tests/unit/convex/capability-call-worker-reconcile.test.ts \
  tests/unit/convex/x402-route-authorization.test.ts \
  tests/integration/capability-call-workpool.test.ts \
  tests/unit/schema/convex-schema.test.ts \
  tests/unit/server/operation-invoke-api.test.ts
npm run typecheck
```

Expected: Call admission, reservation, dispatch, lease/retry, provider effect,
delivery/payment observation, cancellation, uncertain outcome and recovery
tests pass; repeated recovery remains idempotent and does not duplicate
charges; Call/Quote/Tool refs and table/index codecs round-trip; the
operation-invoke API test proves Call/recovery envelope projection preserves
canonical hash and recovery vectors while nested `input.input` remains opaque;
the protected `operation.invoke` contract literal remains unchanged for issue
19; protected authority, attempt and current/Quote digest vectors remain
byte-identical; typecheck passes. The 26 pre-existing `test:ts-standards` findings remain
separate baseline evidence. Issue 22 separately runs
`npm run check:convex-codegen` after generator checkpoints.

## Acceptance

- [ ] Every literal paid Call source, Convex table/index, worker, helper,
      caller, fixture and test path above is updated or explicitly handed off;
      no definition-only half or stale paid `invocationRef` remains.
- [ ] `capabilityOperationInvocations` → `capabilityCalls` and
      `capabilityOperationCallProjections` → `capabilityCallProjections` are
      complete with readers, writers, indexes, leases and queued arguments.
- [ ] Quote and Tool references use `quoteRef`/`toolRef`, Call uses `callRef`,
      and generic Action execution remains on its separate issue-11 fields and
      tables.
- [ ] Effect identity, idempotency, reservation, concurrency, cancellation,
      reconciliation, uncertain payment/delivery and recovery behaviour are
      unchanged; recovery cannot create a second purchase or duplicate charge.
- [ ] Delivery, payment, Provider obligation and purchase resolution/status
      remain separate; terminal failure is never projected as success.
- [ ] `operation-invoke-authority:v1`, `operation-invocation-attempt:v1`,
      `current_operation_commitment:v1`, `ae.operation-commitment:v1`, opaque
      prefixes, protocol fields and canonical vectors remain byte-stable.
- [ ] Issue 17, issue 18, issue 19 and issue 22 receive explicit handoffs;
      no alias, compatibility engine, migration, dependency, deployment or
      data reset is introduced.

## Closure evidence

Attach the reviewable Call source/schema/worker patch, focused test and
typecheck output, old→new file/table/field mapping, protected-vector receipt,
generic-action-versus-paid-Call classification, and the handoff to issue 17
and issue 18 plus issue 22's intermediate generator checkpoint. Record any
ambiguous occurrence for the coordinator instead of choosing a new term.

## Coordinator decision: Call web route and link propagation

Issue 16 owns the exact Call receipt/status route cutover, before issue 24's
presentation pass:

- `src/routes/operations.invocations.$invocationRef.tsx` → `src/routes/calls.$callRef.tsx`
- `tests/unit/routes/invocation-status-route.test.tsx` → `tests/unit/routes/call-status-route.test.tsx`

Use `/calls/$callRef` and the `callRef` route parameter. Preserve loader,
refresh, cancellation, reconciliation, duplicate-submission protection, focus
and feedback behavior. Keep the existing recovery identity digest's serialized
`invocationRef` and `operationRef` keys in the existing builder even though
its input fields become `callRef` and `toolRef`. Add an exact old/new vector
and opaque evidence-payload check in the existing renamed route test. Do not
add an old route alias or a new `/calls` web index.

The finite additional mechanical Call-link/import allowlist is:

- `src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx`
- `src/components/ae/command-panel/CommandPanelProvider.tsx`
- `src/components/ae/console/AeAgentOperatorConsole.tsx`
- `src/components/ae/console/AeOwnerCredit.tsx`
- `src/components/ae/market/AeMarketComparisonView.tsx`
- `src/components/ae/market/AeMarketPage.tsx`
- `src/components/ae/market/AeOperationCard.tsx`
- `src/components/ae/market/AeOperationTable.tsx`
- `src/components/ae/market/market-return-context.ts`
- `src/components/ae/market/operation-detail/AeOperationPosition.tsx`
- `src/components/ae/operation-chat/OperationCard.tsx`
- `src/components/ae/supply/AeSupplyAgentProof.tsx`
- `src/modules/capability-execution/call-entry.ts`
- `src/modules/market/suggested-continuation.ts`
- `src/routes/_operator/activity.tsx`
- `src/routes/api.v1.operations.$invocationRef.ts`
- `src/routes/api.v1.operations.$invocationRef.cancel.ts`
- `src/routes/api.v1.operations.$invocationRef.reconcile.ts`
- `tests/e2e/application-recovery.spec.ts`
- `tests/unit/chat/chat-system.test.ts`
- `tests/unit/chat/operation-call-handback.test.tsx`
- `tests/unit/command-panel/command-panel.test.tsx`
- `tests/unit/layout/public-shell-command-panel.test.tsx`
- `tests/unit/market-terminal/cold-loop.test.ts`
- `tests/unit/market/market-comparison-view.test.tsx`
- `tests/unit/market/market-page.test.tsx`
- `tests/unit/market/suggested-continuation.test.ts`
- `tests/unit/routes/home-catalogue.test.tsx`
- `tests/unit/server/operation-recovery-api.test.ts`
- `tests/unit/ui/agent-access-owner-console.test.tsx`
- `tests/unit/ui/owner-operations-workspace.test.tsx`
- `tools/release/operation-gateway-production-smoke-invocation.ts`
  (Call fields/imports only before issue 21's filename move; issue 21 owns the
  `tool-gateway-production-smoke-call.ts` target and release-tooling tests)

Only the Call web URL/reference/import slice is owned here. Issue 13 already
owns `/tools/$toolRef` and the `/tools` redirect; issue 19 still owns the HTTP
API route/action cutover. Issue 22 generates route types before accepting this
source patch. Add the focused command:

`NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/routes/call-status-route.test.tsx tests/unit/chat/operation-call-handback.test.tsx tests/unit/ui/agent-access-owner-console.test.tsx --no-file-parallelism`

Expected: new receipt URL, existing status/recovery results and exact identity
vectors pass; no new purchase or duplicate recovery effect.

## Queue correction: approval, x402 policy and Call-budget coverage — 2026-09-05

The following paid-Call helper families were omitted from the original
filename allowlist. They are part of this issue's finite mechanical cutover.
The worker applies these changes after the post-15 Quote checkpoint and updates
all direct callers below in the same coherent source/type/test pass. This does
not rename generic Action execution or any upstream x402 field.

### Exact helper mappings

- `src/lib/server/operation-approval-source.ts` →
  `src/lib/server/call-approval-source.ts`
- `tests/unit/server/operation-approval-source.test.ts` →
  `tests/unit/server/call-approval-source.test.ts`
- `src/modules/capability-supply/internal/x402-invocation-policy.ts` →
  `src/modules/capability-supply/internal/x402-call-policy.ts`
- `tests/unit/capability-supply/x402-invocation-policy.test.ts` →
  `tests/unit/capability-supply/x402-call-policy.test.ts`

Within the approval source and its paid execution contract, apply the exact
AE-owned symbol mappings:

- `PendingOperationApproval` → `PendingCallApproval`
- `OperationApprovalDecisionResult` → `CallApprovalDecisionResult`
- `listPendingOperationApprovalsThroughSource` →
  `listPendingCallApprovalsThroughSource`
- `decideOperationApprovalThroughSource` →
  `decideCallApprovalThroughSource`
- `listPendingOperationApprovalsQuery` → `listPendingCallApprovalsQuery`
- `decideOperationApprovalMutation` → `decideCallApprovalMutation`
- `capabilityOperationInvocations:listPendingOperationApprovals` →
  `capabilityCalls:listPendingCallApprovals`
- `capabilityOperationInvocations:decideOperationApproval` →
  `capabilityCalls:decideCallApproval`

Paid approval fields in these helpers become `callRef`; the existing authority
and recovery encoders still project their protected canonical
`invocationRef`/`operationRef` keys where required. Do not recursively rename
the opaque request payload.

Within `x402-call-policy.ts`, rename the AE-owned
`economicRailForInvocation` function to `economicRailForCall` and update its
direct test/importer references. Keep `X402ExecutionContext`, settlement and
payment profile values, `seller_onboarding_canary`, `canaryCommitmentDigest`,
`fundingBudgetRef`, all upstream x402 field names and the existing
`provider_direct_x402`/`brokered_x402`/`managed_testnet_canary` rail values
unchanged. This filename is an AE execution-policy boundary, not permission
to alter the x402 protocol.

### Approval and policy direct callers

Update these exact callers to the post-move helper paths and Call symbols;
later issues retain ownership of their public routes or presentation copy:

- `src/modules/capability-execution/operation-approval.functions.ts` → its
  post-16 `src/modules/capability-execution/call-approval.functions.ts`
- `convex/capabilityOperationInvocations.ts` → post-16
  `convex/capabilityCalls.ts`
- `convex/lib/operationInvocations/admission.ts` → post-16
  `convex/lib/callLifecycle/admission.ts`
- `convex/lib/operationInvocations/authorityHandlers.ts` → post-16
  `convex/lib/callLifecycle/authorityHandlers.ts`
- `src/components/ae/console/AeAgentOperatorConsole.tsx`
- `src/routes/_operator/agent-access.tsx`
- `tests/unit/convex/capability-operation-approval.test.ts` →
  `tests/unit/convex/capability-call-approval.test.ts`
- `tests/unit/convex/capability-operation-authority-boundary.test.ts` →
  `tests/unit/convex/capability-call-authority-boundary.test.ts`
- `tests/unit/routes/agent-access-caller-continuation.test.tsx`
- `tests/unit/server/call-approval-source.test.ts` (post-move path)

Update these exact x402 policy callers to import from
`x402-call-policy.ts` and to use `economicRailForCall`:

- `src/modules/capability-supply/public.ts`
- `src/modules/capability-supply/server.ts`
- `src/modules/capability-supply/internal/operation-project.ts` (post-13
  `src/modules/capability-supply/internal/tool-project.ts`)
- `tests/unit/capability-supply/x402-call-policy.test.ts` (post-move path)

### Call-budget source/schema and fixture propagation

The public Call budget fields are not a protected exception. In every already
listed policy, OAuth, Convex, grant, UI and fixture consumer, change only the
AE-owned names below while preserving the existing policy digest bytes through
the current digest owner:

- `maximumSpendPerInvocation` → `maximumSpendPerCall`
- `maximumConcurrentInvocations` → `maximumConcurrentCalls`
- `per_invocation_exceeds_daily` → `per_call_exceeds_daily`

The finite budget consumer set is:

- `src/modules/agent-access/policy.ts`
- `src/modules/agent-access/production-policy.ts`
- `src/modules/agent-access/sandbox-policy.ts`
- `src/modules/agent-access/agent-access.ts`
- `src/modules/agent-access/agent-access.functions.ts`
- `src/modules/agent-access/internal/convex-schema.ts`
- `src/modules/agent-access/internal/oauth-convex-schema.ts`
- `src/modules/agent-access/oauth-state.ts`
- `src/lib/server/agent-access-oauth-api.ts`
- `src/lib/server/agent-access-oauth-store.ts`
- `src/lib/server/agent-access-oauth/protocol.ts`
- `convex/agentAccessPolicy.ts`
- `convex/agentAccessOAuth.ts`
- `convex/capabilityQuotes.ts` (post-15 Quote consumer)
- `convex/capabilitySupplyCanaryFunding.ts`
- `convex/capabilitySupplyOwnerCanary.ts`
- `convex/lib/callLifecycle/admission.ts` (post-16 Call consumer)
- `src/components/ae/console/AeAgentOperatorConsole.tsx`
- `tests/helpers/convex-fixtures.ts`
- `tests/unit/agent-access-functions.test.ts`
- `tests/unit/agent-access-oauth-state.test.ts`
- `tests/unit/agent-access-policy.test.ts`
- `tests/unit/agent-access-production-policy.test.ts`
- `tests/unit/agent-access-sandbox-policy.test.ts`
- `tests/unit/agent-access.test.ts`
- `tests/unit/authority/context/consequence-authority.test.ts`
- `tests/unit/convex/authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-reservation.test.ts` →
  `tests/unit/convex/capability-call-reservation.test.ts`
- `tests/unit/convex/capability-supply-readiness-authority.test.ts`
- `tests/unit/convex/money-managed-call.test.ts`
- `tests/unit/convex/seller-onboarding-canary-funding-readiness.test.ts`
- `tests/unit/routes/agent-access-console.test.ts`
- `tests/unit/server/agent-access-oauth-api.test.ts`
- `tests/unit/ui/agent-access-owner-console.test.tsx`
- `tests/unit/ui/demand-console.test.tsx`
- `tests/integration/capability-supply-owner-funnel-harness.ts`

The existing `agentAccessPolicyDigest` adapter must project these new source
keys to the old canonical digest keys
`maximumSpendPerInvocation`, `maximumConcurrentInvocations` and
`per_invocation_exceeds_daily` before hashing, with literal existing vectors
in the listed tests. No alias or generic compatibility mapper is permitted.

### Release-tooling and root-manifest handoff

Issue 21 is the sole filename/import owner for active release smoke tooling.
This issue may update only paid Call fields/imports in the pre-move
`tools/release/operation-gateway-production-smoke-invocation.ts`; issue 21
owns its `tool-gateway-production-smoke-call.ts` move and all smoke-test
renames. Root `package.json` is not editable here; issue 22 is the sole writer
and receives this exact existing `test:conformance` key/path receipt:

- `tests/unit/capability-execution/operation-invoke-admit.test.ts` →
  `tests/unit/capability-execution/call-admit.test.ts`
- `tests/unit/capability-execution/operation-invoke-dispatch.test.ts` →
  `tests/unit/capability-execution/call-dispatch.test.ts`
- `tests/unit/capability-execution/operation-invoke-recover.test.ts` →
  `tests/unit/capability-execution/call-recover.test.ts`
- `tests/unit/capability-execution/operation-recovery-actions.test.ts` →
  `tests/unit/capability-execution/call-recovery-actions.test.ts`
- `tests/unit/convex/capability-operation-recovery.test.ts` →
  `tests/unit/convex/capability-call-recovery.test.ts`
- `tests/unit/convex/capability-operation-worker-run.test.ts` →
  `tests/unit/convex/capability-call-worker-run.test.ts`
- `tests/unit/convex/capability-operation-worker-reconcile.test.ts` →
  `tests/unit/convex/capability-call-worker-reconcile.test.ts`
- `tests/unit/convex/capability-operation-worker-charge.test.ts` →
  `tests/unit/convex/capability-call-worker-charge.test.ts`
- `tests/unit/convex/capability-operation-worker-lease.test.ts` →
  `tests/unit/convex/capability-call-worker-lease.test.ts`
- `tests/integration/capability-operation-workpool.test.ts` →
  `tests/integration/capability-call-workpool.test.ts`
- `tests/unit/capability-supply/route-transport-invoke.test.ts` →
  `tests/unit/capability-supply/route-transport-call.test.ts`

Preserve every other `test:conformance` path, script key, dependency and
lockfile entry; no new script, dependency or alias is introduced.

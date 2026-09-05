# Rename Commitments to Quotes

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee:
Assigned role: Luna Max / Quote contract and storage implementation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 29, 30

## Outcome

Rename the AE-owned purchasing Commitment contract and storage family to
Quote. A customer Quote remains caller-bound, input-bound, price/terms-bound,
permission-bound, expiring and subject to the existing retry conditions. It is
not a purchased Call and is not the qualified `SuppliedQuote` supply concept.
Update its codecs, validators, storage readers/writers, indexes, continuations,
fixtures and known consumers as one source-to-schema cutover before issue 16
renames the paid Call lifecycle.

## Fixed mappings

| Existing AE-owned name | Replacement | Rule |
| --- | --- | --- |
| Commitment (purchase precondition) | Quote | Preserve binding, expiry, price ceiling, terms, permissions and retry conditions. |
| `commitmentRef` in AE-owned Quote/Call contracts | `quoteRef` | Rename the API/storage field; preserve the opaque identifier bytes below. |
| Quote's `operationRef` | `toolRef` | Rename the AE-owned Tool reference field; Tool/version semantics come from issue 13. |
| `operationRevision` in a Quote row | `toolVersion` | Preserve the numeric revision value and stale-version refusal. |
| `operationMaterialDigest` | `toolMaterialDigest` | Rename the surrounding field only; preserve digest bytes. |
| `currentOperationDigest` | `currentToolDigest` | Rename the surrounding field only; preserve current commitment material and vectors. |
| `operationJson` snapshot in a Quote row | `toolJson` | Rename the storage/API field; use the existing snapshot encoder/decoder. |
| `capabilityOperationCommitments` | `capabilityQuotes` | Physical table, indexes, validators and all readers/writers move together. |
| `by_commitmentRef` | `by_quoteRef` | Physical index rename on the Quote table. |
| No current `operationRef` index on `capabilityOperationCommitments` | No new `toolRef` index | The current Quote table has only `by_commitmentRef`, `by_credentialId_and_createdAt` and `by_state_and_expiresAt`; rename those exact existing indexes only where mapped below and do not invent a Tool-reference index. |
| Operation commitment file/export/function names | Quote file/export/function names | Use the exact file mappings below; no old-name aliases. |

Public `operation.inspect` → `tool.quote` and HTTP/action route changes are
owned by issue 19. This issue updates internal Quote result/continuation
fields and leaves an explicit public-contract handoff. It does not alter
upstream OpenAPI `operationId`, MCP methods, OAuth fields or x402 fields.

## Exact owned file mapping

All paths are literal. Rename the Quote definition and its direct source
consumer files together; later Call files consume `quoteRef` after this
ticket closes.

### Quote definition, codecs and schema

- `src/modules/capability-execution/operation-commitment.ts` → `src/modules/capability-execution/quote.ts`
- `src/modules/capability-execution/operation-commitment.actions.ts` → `src/modules/capability-execution/quote.actions.ts`
- `src/modules/capability-execution/current-operation-commitment.ts` → `src/modules/capability-execution/current-tool-quote.ts`
- `src/modules/capability-execution/index.ts`
- `src/modules/capability-execution/convex.ts`
- `src/modules/capability-execution/schema.ts`
- `src/modules/capability-execution/internal/convex-schema.ts`
- `src/modules/capability-supply/current-tool.ts` (post-13 Tool snapshot source)
- `src/modules/capability-supply/public.ts` (post-13 published Tool snapshot parser/export)
- `convex/capabilityOperationCommitments.ts` → `convex/capabilityQuotes.ts`
- `convex/schema.ts`
- `convex/convex.config.ts`
- `src/modules/module-boundaries.ts`
- `package.json` (only affected existing command/source paths; no new script or dependency)

In the Convex schema, rename the complete `capabilityOperationCommitments`
definition to `capabilityQuotes`, including its validators, indexes,
`commitmentRef`/Tool snapshot fields and internal function references. Do not
rename the generic `capabilityOperationInvocations` or
`capabilityOperationCallProjections` tables here; issue 16 owns those paid Call
tables and waits for this Quote checkpoint.

### Direct Quote callers and field propagation

Update these exact files so a definition-only half cannot compile against old
Quote fields. The files marked “Call consumer” receive the mechanical
`quoteRef`/Tool snapshot update but remain issue 16's lifecycle ownership.

- `src/modules/capability-execution/operation-invoke-contracts.ts` (Call consumer)
- `src/modules/capability-execution/operation-invoke-admit.ts` (Call admission consumer)
- `src/modules/capability-execution/operation-invoke-entry.ts` (Call entry consumer)
- `src/modules/capability-execution/operation-invoke.ts` (protected authority consumer; no hash-material rename)
- `src/modules/capability-execution/invocation-material.ts` (Call consumer)
- `src/modules/capability-execution/operation-recovery-contracts.ts` (Call recovery consumer)
- `convex/capabilityOperationInvocations.ts` (Call consumer; issue 16 owns eventual file/table rename)
- `convex/capabilityOperationInvocationProjection.ts` (Call projection consumer)
- `convex/capabilityOperationCalls.ts` (Call projection consumer)
- `convex/capabilityOperationInvocationWorker.ts` (Call worker consumer)
- `convex/capabilityOperationLiveX402.ts` (Call transport consumer)
- `convex/capabilityOperationX402AuthorizationExpiry.ts` (Call recovery consumer)
- `convex/lib/operationInvocations/admission.ts` (Call consumer)
- `convex/lib/operationInvocations/authorityHandlers.ts` (Call authority consumer)
- `convex/lib/operationInvocations/contracts.ts` (Call contract consumer)
- `convex/lib/operationInvocations/dispatch.ts` (Call dispatch consumer)
- `convex/lib/operationInvocations/invokeActions.ts` (Call action consumer)
- `convex/lib/operationInvocations/reconciliation.ts` (Call recovery consumer)
- `convex/lib/operationInvocations/workComplete.ts` (Call completion consumer)
- `convex/chatTools.ts` (continuation consumer; issue 19/20 own public labels)
- `src/modules/discovery/internal/operation-contract.ts` (discovery consumer; issue 21 owns output instructions)
- `src/modules/market/suggested-continuation.ts` (continuation consumer; issue 17 owns next-action language)
- `src/modules/market/tool-view-model.ts` (post-13 Tool view consumer; source path is renamed by issue 13)
- `src/modules/registry/tool-action-contracts.ts` (post-13 Tool path; issue 19 owns action IDs)
- `src/modules/registry/tool-choice-contracts.ts` (post-13 Tool path; issue 19 owns action IDs)
- `src/modules/registry/tool-detail-route.functions.ts` (post-13 Tool path; issue 19 owns route)
- `src/modules/registry/tools.actions.ts` (post-13 Tool path; issue 19 owns action IDs)
- `src/modules/registry/registry.actions.ts` (public action consumer; issue 19 owns action IDs)
- `src/lib/server/operation-invoke-api.ts` (HTTP consumer; issue 19 owns route)
- `src/lib/server/mcp-api.ts` (MCP consumer; issue 19 owns target action classifier)
- `src/modules/money/formance-workflows.ts` (financial handoff consumer; issue 18 owns money semantics)
- `src/modules/money/server.ts` (financial handoff consumer; issue 18 owns money semantics)
- `convex/moneyManagedCall.ts` (durable money consumer; issue 18 owns file/financial semantics)
- `convex/moneyManagedCallLifecycle.ts` (durable money consumer; issue 18 owns file/financial semantics)
- `convex/moneyProviderObligations.ts` (Provider obligation consumer; issue 18 owns distinction)
- `convex/providerConsequenceHttp.ts` (Provider consequence consumer; issue 18 owns durable fields)

### Qualified supply boundary (read-only distinction)

Do not merge `SuppliedQuote` into customer Quote. These files must continue to
use their qualified concept; only a genuine customer Quote reference passed at
an explicit boundary is mapped to `quoteRef`:

- `src/modules/capability-supply/supplied-quote.ts`
- `src/modules/capability-supply/supplied-quote.actions.ts`
- `tests/unit/capability-supply/supplied-candidate-qualification.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-authority.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-disclosure.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-harness.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-outcomes.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-qualification.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-reconciliation.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-transfer.test.ts`

## Protected bytes, identifiers and protocol exceptions

The following are byte-level protected. Use the existing encoders/decoders and
adapt new API/storage names at their boundary; do not rename JSON keys,
property order, format literals, hash inputs, signatures or vectors inside
these materials:

- `convex/capabilityOperationCommitments.ts` evidence material literal
  `ae.operation-commitment:v1` and its canonical field keys/order.
- `src/modules/capability-execution/current-operation-commitment.ts` and
  `src/modules/capability-supply/current-operation.ts` material literal
  `current_operation_commitment:v1`, including the current digest key set and
  existing digest vectors. The post-13 Tool field adapter must preserve the
  old canonical material bytes.
- `operation-commitment:v1:<digest>` opaque Quote identifier prefix, even when
  exposed through the renamed `quoteRef` field.
- `operation-invoke-authority:v1` and
  `operation-invocation-attempt:v1` are Call/authority protections owned by
  issue 16; this Quote ticket must not alter or re-encode them.
- `src/lib/server/operation-invoke-api.ts:81-90,114-126` contains the
  Quote-facing portion of the protected `operationKeyFor` command. Project
  source `quoteRef`/`toolRef` envelope fields back to canonical
  `commitmentRef`/`operationRef` keys before hashing and preserve the existing
  vector in `tests/unit/server/operation-invoke-api.test.ts`. The nested
  `input.input` value is an opaque Tool/Provider argument payload; do not
  recursively rename keys or values inside it, including an incidental
  `operationRef` or `requestMandate`. Because the command also contains
  `contract: OPERATION_INVOKE_ACTION_ID`, retain the old `operation.invoke`
  literal in protected hash material when issue 19 exposes `tool.call`; do not
  change that byte sequence as part of the Quote rename.
- `operation:v1:<digest>` and other opaque Tool/reference prefixes remain
  exact bytes under issue 13's Tool field rename.

Preserve evidence, canonical hash material, signatures, external financial
namespaces, OpenAPI `operationId`, MCP methods, OAuth fields and x402 payment
fields. No compatibility engine, alias API, duplicate table or hand-edited
backup is allowed.

## Explicit exclusions

- Do not rename generic Action execution files/tables or their
  `invocationRef`; issue 11 owns that boundary.
- Do not rename paid Call tables/workers or collapse Quote into a Call; issue
  16 consumes the Quote checkpoint.
- Do not alter public routes/action IDs, installed clients, discovery/plugin
  copy, UI, money/durable ownership, generated `_generated` output, deployment
  state or test data; their owning issues consume this contract.
- Do not merge qualified `SuppliedQuote`, portfolio Service/Offering/
  Publication/Listing/Source, Provider, Seller or payment-recipient records.

## Known tests and fixtures

Rename the Quote-focused test files shown; update the remaining direct callers
in place. These tests must retain literal vector values and add/keep fail-closed
coverage for stale terms, changed input, expiry and corrupted snapshots.

- `tests/unit/capability-execution/operation-inspect-continuations.test.ts` → `tests/unit/capability-execution/quote-inspect-continuations.test.ts`
- `tests/unit/capability-execution/current-operation-commitment.test.ts` → `tests/unit/capability-execution/current-tool-quote.test.ts`
- `tests/unit/capability-execution/operation-invoke-admit.test.ts` (Call consumer)
- `tests/unit/capability-execution/operation-invoke-authority.test.ts` (protected authority consumer)
- `tests/unit/capability-execution/operation-invoke-dispatch.test.ts` (Call consumer)
- `tests/unit/capability-execution/operation-receipt-contract.test.ts` (Quote/Call contract consumer)
- `tests/unit/convex/capability-operation-approval.test.ts`
- `tests/unit/convex/capability-operation-authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-invocation-identity.test.ts` (protected attempt vector; no format rename)
- `tests/unit/convex/capability-operation-reservation.test.ts`
- `tests/unit/convex/capability-operation-recovery.test.ts`
- `tests/unit/convex/capability-operation-call-projection.test.ts`
- `tests/unit/convex/capability-operation-worker-authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-worker-run.test.ts`
- `tests/unit/convex/money-managed-call.test.ts` (issue 18 consumer)
- `tests/integration/capability-operation-workpool.test.ts`
- `tests/integration/canonical-tool-reads.test.ts` (post-13 Tool path)
- `tests/integration/current-tool-snapshot-stability.test.ts` (post-13 Tool path)
- `tests/integration/capability-publication-publish.test.ts`
- `tests/integration/money-formance-boundary.test.ts` (issue 18 consumer)
- `tests/unit/schema/convex-schema.test.ts`
- `tests/unit/market-terminal/cold-loop.test.ts` (later public consumer)
- `tests/unit/market-terminal/invoke.test.ts` (later public consumer)
- `tests/unit/market-terminal/recovery.test.ts` (later public consumer)
- `tests/unit/server/operation-invoke-api.test.ts` (issue 19 consumer)
- `tests/unit/server/mcp-api-operation-invoke.test.ts` (issue 19 consumer)
- `tests/unit/chat/operation-chat-agent-tools.test.ts` (later consumer)

## Dependencies and sequencing

- Baseline 08, reviews 29/30 and core identity/action/authorization issues
  10–12 must be closed before dispatch. Tool catalogue issue 13 and Provider
  issue 14 are strict predecessors.
- This ticket is the sole Quote definition/storage writer. Issue 16 is blocked
  until the Quote schema, codecs, `quoteRef` fields and vectors are complete;
  issue 18 consumes the durable fields after both Quote and Call boundaries.
- Shared files (`src/modules/capability-execution/internal/convex-schema.ts`,
  `convex/schema.ts`, `src/modules/module-boundaries.ts` and the central action
  consumers) are serialized. Issue 22 must run its intermediate generated
  checkpoint after the physical table/function names, then final regeneration
  after public contracts; do not edit `_generated` outputs here.
- The operation-invoke API test is a shared serialized boundary: issue 13
  establishes the Tool envelope and opaque-payload assertion, this issue adds
  only its `quoteRef`/`toolRef` protected-key projection and vector, and issue
  16 then adds paid Call/recovery coverage. Preserve earlier assertions at
  every checkpoint.
- Issue 19 owns public action/HTTP/MCP names and issue 20/21 own installed
  clients/discovery. Their dependencies are recorded above; this issue cannot
  leave old internal fields simply because public cutover is later.

## Verification commands and expected results

Run with Node `22.x` and npm `11.5.1`, using existing tooling only:

```sh
npm exec vitest run \
  tests/unit/capability-execution/current-tool-quote.test.ts \
  tests/unit/capability-execution/quote-inspect-continuations.test.ts \
  tests/unit/capability-supply/current-tool-contract.test.ts \
  tests/unit/capability-supply/supplied-candidate-quote-authority.test.ts \
  tests/unit/convex/capability-operation-approval.test.ts \
  tests/unit/convex/capability-operation-reservation.test.ts \
  tests/unit/convex/capability-operation-authority-boundary.test.ts \
  tests/unit/schema/convex-schema.test.ts \
  tests/integration/current-tool-snapshot-stability.test.ts \
  tests/integration/capability-operation-workpool.test.ts \
  tests/unit/server/operation-invoke-api.test.ts
npm run typecheck
```

Expected: Quote admission/inspection, current Tool snapshot matching,
expiry/input/version invalidation, Convex Quote rows/indexes, qualified
`SuppliedQuote` boundaries and downstream quoteRef consumers pass; the
protected digest/opaque-prefix vectors are unchanged; the operation-invoke API
test proves Quote envelope projection preserves the canonical hash while an
`input.input` payload containing incidental old keys is unchanged; the
protected `operation.invoke` contract literal remains unchanged for issue 19;
typecheck passes. The
26 pre-existing `test:ts-standards` findings remain separate baseline evidence
and are not fixed or reclassified here. Issue 22 separately runs
`npm run check:convex-codegen` after regeneration.

## Acceptance

- [ ] Quote source files, exports, validators, codecs, Convex table/indexes,
      direct callers, fixtures and tests use the fixed Quote/Tool vocabulary in
      one coherent cutover, with no definition-only half.
- [ ] `capabilityOperationCommitments` → `capabilityQuotes`, all Quote indexes,
      readers and writers, and `commitmentRef` → `quoteRef` fields are complete;
      Call tables remain issue 16's separate ownership.
- [ ] Quote expiry, bound input, Tool version/material/current digest, pricing,
      permissions, limits and retry/refusal behaviour are unchanged.
- [ ] `SuppliedQuote` stays qualified and distinct; Quote is not a Call, and
      Provider/Seller/payment/delivery facts remain separate.
- [ ] `ae.operation-commitment:v1`, `current_operation_commitment:v1`,
      `operation-invoke-authority:v1`, `operation-invocation-attempt:v1`,
      opaque prefixes, canonical hash material and vectors remain byte-stable.
- [ ] Public route/action changes are handed to issue 19, generated output is
      handed to issue 22 at its intermediate checkpoint, and no alias,
      compatibility engine, migration, dependency, deployment or data reset is
      introduced.

## Closure evidence

Attach the reviewable Quote source/schema patch, focused test and typecheck
output, a field/index/table old→new receipt, protected-vector comparison, and
the explicit `quoteRef` handoff to issue 16 plus generator checkpoint to issue
22. Record any unresolved semantic occurrence for the coordinator rather than
choosing another term.

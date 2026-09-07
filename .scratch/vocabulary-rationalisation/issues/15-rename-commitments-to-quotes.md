# Rename Commitments to Quotes


## SOURCE ACCEPTED — independent correction review 2026-09-06

Oversight accepted the whole Quote module plus its exact two-file correction delta. Real preparation/issuance/read test verifies current policy and persistence, generation/per-Call refusals, expiry and protected full identities. Final correction receipts:4files33testsPASS, scoped lint and whitespacePASS. Corrected immutable candidate `/tmp/ae-quote-review-corrected-candidate-20260906/manifest.json`; no capture changes. Total5/10accepted. Call implementation released. Overall and hosted acceptance remain open.

## Consolidated independent correction pass — 2026-09-06

Whole-module review requires two corrections in the same Quote assignment: preserve historical Quote/funding canonical hash keys while retaining current DTO/storage names, and directly verify real Quote issuance, policy refusals, TTL/expiry and fixed protected identities using existing test facilities. Receipt: `/tmp/ae-quote-independent-review-20260906.md`. Same owner continues in a fresh context, sole source writer. Call implementation remains held; 4/10 groups accepted. Independent readForCall boundary checks passed 19/19; existing 156 tests passed but do not close issuance coverage.

## Historical candidate — superseded by SOURCE ACCEPTED record above

The complete Quote source candidate is with oversight for one consolidated
independent evaluation. The source owner returned before a second compaction;
no Quote source writer remains active. The completed inventory below remains
authoritative and is not restarted.

- Exact net Quote paths: `/tmp/ae-quote-module-owned-paths-20260906.txt` (13).
- Baseline: `/tmp/ae-quote-review-baseline-20260906/manifest.json`.
- Immutable candidate: `/tmp/ae-quote-review-candidate-20260906/manifest.json`,
  1,788 files, zero capture changes, with accepted Provider corrections excluded.
- Source handoff: `/tmp/ae-quote-return-before-second-result-20260906.txt`.
- Current Quote/readiness/schema/chat/server/reservation/replay evidence passes
  18 files/156 tests. Earlier 45/105 groups overlap. Scoped lint/whitespace pass.
- Coherent compiler: 332 diagnostics/74 files, no Quote-attributed diagnostics.
  The 18 diagnostics in the changed Money test are later Call RPC arguments;
  its Quote-row fields are corrected.
- Protected chat digest keys were restored before this candidate and are locked
  by fixed identity assertions; `convex/chatTools.ts` matches the baseline.
- Direct Convex Quote issuance/refusal/expiry runtime remains unverified because
  broader fixtures fail earlier in Call setup. Oversight is explicitly assessing
  this gap. Call worker, Money, public/installed-client and registry failures
  remain assigned to their existing owners; no integrated green is claimed.

Root's two Quote filename index entries are included. No generated changes were
needed. The complete read-only Call inventory is prepared, with implementation
held until Quote acceptance. Provider's signed bytes and Package5 historical
receipt fields remain accepted and unchanged.

Earlier held/preparation receipts below are historical.

## Complete Quote inventory — prepared, implementation held

The complete read-only inventory below returned with one actual compaction and
no source/test/runtime activity. Continue it without a new conceptual inventory.
Provider-dependent producer/shared files remain serialized. Independent review
is now owned by the oversight task, not another root reviewer.

Coordinator reconciliation: direct Quote schema/export/authority callers remain
within the complete module even if stored in another area. Consume the accepted
policy/connection grant contract consistently in Quote creation; old current
fields are not hash exceptions. Package5 current imports/Tool/Quote/Call fields
are active Provider ownership, so coordinate rather than duplicate. Protected
operation.invoke/commitment literals below mean exact hash/protocol/evidence
material only; they do not permit obsolete current action contracts or aliases.
Generic Action taxonomies remain separate and their later owning issue decides
any current taxonomy cutover. Physical Quote storage consistency includes the
consumed-Call link and its direct reader/writers, coordinated with the Call owner.

## Read-only issue15 receipt — Quote module

Implementation remains **HELD pending Provider acceptance**. Provider remains the sole source writer. No source/tracker files were changed; no tests, compiler, generation, installs, runtime/backend/data/deploy actions, commits, subagents, or AgentMux were used.

Authoritative inputs were [PRODUCT.md](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/PRODUCT.md:1>), [CONTEXT.md](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/CONTEXT.md:1>), [map.md](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/.scratch/vocabulary-rationalisation/map.md:1>), and [issue15](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/.scratch/vocabulary-rationalisation/issues/15-rename-commitments-to-quotes.md:74>).

Checkout and runtime verified:

- `/Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy`
- branch `codex/vocabulary-rationalisation`
- Node `v22.22.0`
- npm `11.5.1`

The worktree was already broadly dirty from prior vocabulary work. The `a19f` comparison worktree was checked read-only; both point at `fe09a6463`. Quote contract/action/backend/schema/HTTP/chat files were byte-equivalent; Provider Tool files, generated route tree, and planning files differed. Current checkout remains authoritative.

### Boundary

`Tool` is the admitted callable supply. `Quote` is the caller-bound, input-bound, price/authority/current-version-bound expiring purchase precondition. `Call` is accepted use. `SuppliedQuote` remains a qualified upstream supply quote. None are interchangeable.

### Quote-owned definitions and codecs

Current paths:

- `src/modules/capability-execution/quote.ts`
  - `TOOL_QUOTE_ACTION_ID = 'tool.quote'`
  - `TOOL_QUOTE_PATH = '/api/v1/tools/quote'`
  - `toolQuoteInputSchema`, `ToolQuoteInput`
  - refusal-code union
  - committed/refused `toolQuoteResultSchema`, `ToolQuoteResult`
  - continuation and required-action schemas
  - `projectToolQuoteRefusal`
- `src/modules/capability-execution/quote.actions.ts`
  - `toolQuoteAction`
  - `TOOL_QUOTE_ROUTE_CONTRACT`
  - `tool.quote:v2`
  - HTTP/MCP/CLI/chat surfaces
  - no Call, reservation, signature, payment, or Provider effect
- `src/modules/capability-execution/current-tool-quote.ts`
  - `currentToolDigest`
  - `currentToolDigestFromSnapshot`
  - `currentToolQuotesMatch`
- `convex/capabilityQuotes.ts`
  - private Convex validators: refusal codes, exact AUD/USDC amounts, continuations, required actions, result, financial snapshot, prepared financial subjects, Call material
  - exported RPC functions:
    - `quote` action
    - `prepareFinancialSubjects` internal mutation
    - `issueQuote` internal mutation
    - `readForCall` internal query
    - `admitCall` internal mutation
- `src/modules/capability-execution/index.ts`
  - currently exports seller-canary symbols only; no new Quote barrel is authorized
- `src/modules/capability-execution/convex.ts`
  - Call validators/serializers only; Quote RPC validators remain local to `convex/capabilityQuotes.ts`
- `src/modules/capability-execution/schema.ts`
  - exports aggregate `capabilityCallTables`; this aggregate must not be split speculatively

JSON boundaries use existing bounded JSON validation, `JSON.stringify`/`JSON.parse`, `materializeRuntimePublishedTool`, `parsePublishedToolSnapshot`, and `canonicalDigest`.

### Quote creation and behavior

Current chain:

```text
HTTP/chat/CLI tool.quote
  -> source-write admission
  -> capabilityQuotes.quote
  -> live x402 observation
  -> prepareFinancialSubjects
  -> Formance capacity/balance reads where required
  -> issueQuote
  -> capabilityQuotes row
  -> tool.call continuation
```

`issueQuoteHandler` preserves:

- current Agent authority via `resolveCurrentAgentAuthority`
- principal, Account, credential, application, environment binding
- grant reference, generation, policy digest, expiry
- current published Tool lookup and Provider offboarding freeze
- exact runtime Tool input validation
- `toolRef`, Tool publication revision/version, Tool material digest, current Tool digest, durable Tool snapshot
- normalized input and input digest
- fixed AUD or managed x402 pricing
- source USDC requirement, x402 requirement/rate evidence
- per-Call price ceiling, account balance, period budget, legal exposure, treasury capacity
- legal Customer and attributed buyer revenue/tax facts
- commercial policy references/digest
- Quote TTL bounded by policy TTL, authority expiry, and rate-evidence expiry
- evidence digest and deterministic opaque Quote reference
- replay/conflict behavior for an existing Quote row

There is no separate Quote refresh record or endpoint. Refresh is a new `tool.quote` request. Refusal continuations preserve retry delays of 5 seconds or 30 seconds, Tool list/search/describe, funding handoff, and required-action behavior.

`readForCall` rejects missing, expired, principal-mismatched, Account-mismatched, credential-mismatched, application-mismatched, environment-mismatched, non-issued, malformed, or corrupted Quotes. A consumed Quote is only reusable when its linked Call and idempotency identity match.

Uncertain outcomes belong to Call/recovery, not Quote.

### Durable storage

[internal/convex-schema.ts](</Users/joelchan/Documents/Coding/App-Dev/live/01. Pre-Implementation/Agentic-Economy/src/modules/capability-execution/internal/convex-schema.ts:327>) defines `capabilityQuotes`.

Fields:

- Identity/authority: `quoteRef`, `principalId`, `accountRef`, `credentialId`, `applicationRef`, `environment`, `grantRef`, `grantGeneration`, `grantPolicyDigest`, `grantExpiresAt`
- Tool binding: `toolRef`, `toolVersion`, `toolMaterialDigest`, `currentToolDigest`, `toolJson`
- Input/pricing: `normalizedInputJson`, `inputDigest`, `pricingJson`, `pricingDigest`, `decisionAudUnits`, optional `sourceUsdcUnits`
- x402/rate evidence: optional `x402RequirementDigest`, `x402RequirementJson`, `x402RequirementObservedAt`, `rateEvidenceJson`, `rateEvidenceDigest`
- Budget/policy: `budgetPolicyRef`, `budgetGeneration`, `maximumSpendPerCallUnits`, `formanceSchemaVersion`, `policyGeneration`
- Commercial/tax: `legalCustomerRef`, `legalCustomerGeneration`, `buyerRevenueUnits`, `buyerTaxUnits`
- Availability: `accountAvailableUnits`, `budgetAvailableUnits`, `legalExposureAvailableUnits`, `balanceUnits`
- Treasury: optional `treasuryCustodyRef`, `treasuryCustodyGeneration`, `treasuryVersion`, `treasuryEvidenceRef`, `treasuryEvidenceDigest`, `treasurySpendableUnits`
- Evidence/lifecycle: `commercialPolicyRefs`, `commercialPolicyDigest`, `evidenceDigest`, `state`, optional `consumedInvocationRef`, `expiresAt`, `createdAt`, `updatedAt`

State is `issued | consumed | expired`.

Existing indexes only:

- `by_quoteRef: ['quoteRef']`
- `by_credentialId_and_createdAt: ['credentialId', 'createdAt']`
- `by_state_and_expiresAt: ['state', 'expiresAt']`

No `toolRef` index is authorized.

Writer/readers:

- Quote insert: `convex/capabilityQuotes.ts:524`
- Quote dedup read: `convex/capabilityQuotes.ts:515`
- Call material read: `convex/capabilityQuotes.ts:800`
- Call reservation read: `convex/lib/callLifecycle/admission.ts:386`
- Call reservation marks Quote `consumed`: `convex/lib/callLifecycle/admission.ts:463`
- Call abandonment reopens an eligible consumed Quote: `convex/lib/callLifecycle/admission.ts:517`
- Money reads: `convex/moneyManagedCall.ts`, `convex/moneyManagedCallLifecycle.ts`

The schema permits `expired`, but current source enforces expiry at read/admission time; no separate Quote expiry sweep writer was found. Do not invent one.

### Provider-owned Tool producer seam to await

Quote consumes, but does not write, the current Tool:

- `convex/capabilitySupplyCurrentTool.ts`
  - `readCurrentPublishedTool`
  - `readCurrentPublishedToolSnapshotHandler`
  - current publication, Offering, transport binding, registered contract, qualification, readiness, connection authority, and exact Tool-ref reconstruction
- `src/modules/capability-supply/current-tool.ts`
  - `CurrentToolQuote`
  - `createCurrentToolQuote`
  - `createCurrentToolQuoteFromMaterial`
  - current digest and Provider-authority validation
- `src/modules/capability-supply/published-tool.ts`
  - `PublishedTool`
  - `RuntimePublishedToolDescriptor`
  - `parsePublishedToolSnapshot`
  - `materializeRuntimePublishedTool`
  - `publishedToolIdentityDigest`
  - `publishedToolMaterialMatches`
- `src/modules/capability-supply/public.ts`
  - Tool projection serializers/deserializers
  - Tool reference creation and published Tool exports
- Provider source writers/readers:
  - `convex/capabilitySupplyPublish.ts`
  - `convex/capabilityProviderTools.ts`
  - Provider connection/admission/lifecycle modules

Provider acceptance must settle publication revision, binding, readiness, connection authority, routeability/offboarding, and exact Tool material. Quote implementation must wait for that acceptance and consume the seam; it must not duplicate or modify Provider fields.

### Direct caller and handoff inventory

HTTP/action:

- `src/routes/api.v1.tools.quote.ts`
- `src/lib/server/call-api.ts`
  - `createCallService.quoteTool`
  - `handleToolQuotePost`
  - `sourceAction('capabilityQuotes:quote')`
  - protected `operationKeyFor` projection
- `src/modules/actions/index.ts`
  - registers `toolQuoteAction`
- `tools/ae/commands/action-adapters.ts`
  - registers the Quote route contract

Chat:

- `convex/chatTools.ts`
  - `chatToolQuoteContract`
  - `api.capabilityQuotes.quote`
  - Quote-before-Call sequencing
- `src/modules/chat/tool-card.ts`
  - Quote price, Account balance, budget ceiling, expiry, Quote reference projection

CLI:

- `tools/ae/commands/call.ts`
  - validates `toolQuoteInputSchema`
  - POSTs `TOOL_QUOTE_PATH`
  - validates `toolQuoteResultSchema`
  - forwards `quoteRef` and idempotency key to Call
- `tools/ae/commands/describe.ts`
- `tools/ae/commands/manifest.ts`
  - textual Quote handoffs

Call consumers, owned by issue16:

- `src/modules/capability-execution/call-contracts.ts`
- `call-admit.ts`
- `call-entry.ts`
- `call-authority.ts`
- `call-material.ts`
- `call-recovery-contracts.ts`
- `call-worker/*`
- `convex/capabilityCalls.ts`
- `convex/capabilityCallIdentity.ts`
- `convex/capabilityCallProjection.ts`
- `convex/capabilityCallProjections.ts`
- `convex/capabilityCallWorker.ts`
- `convex/capabilityCallLiveX402.ts`
- `convex/capabilityCallX402AuthorizationExpiry.ts`
- `convex/lib/callLifecycle/admission.ts`
- `authorityHandlers.ts`
- `contracts.ts`
- `dispatch.ts`
- `callActions.ts`
- `reconciliation.ts`
- `workComplete.ts`

The critical handoff is `authorityHandlers.ts:511-523`:

```text
capabilityQuotes.admitCall
  -> capabilityQuotes.readForCall
  -> Call authority/reservation/dispatch
```

Later consumers:

- `src/modules/market/suggested-next-action.ts`
- `src/modules/market/tool-view-model.ts`
- `src/modules/registry/tool-action-contracts.ts`
- `tool-choice-contracts.ts`
- `tool-detail-route.functions.ts`
- `tools.actions.ts`
- `registry.actions.ts`
- `src/modules/discovery/internal/tool-contract.ts`
- `src/modules/discovery/internal/site-manifest.ts`
- `src/lib/server/mcp-api.ts`
- `convex/moneyFormance.ts`
- `src/modules/money/formance-workflows.ts`
- `convex/moneyManagedCall.ts`
- `convex/moneyManagedCallLifecycle.ts`
- `convex/moneyProviderObligations.ts`
- `convex/providerConsequenceHttp.ts`

These consume Quote/Tool fields but remain later-module ownership. Do not pull broad Call, money, public, installed-client, or Provider-obligation implementation into Quote.

### Fixtures and tests

Quote/current-Tool behavior groups:

- `tests/unit/capability-execution/current-tool-quote.test.ts`
- `tests/unit/capability-execution/quote-inspect-continuations.test.ts`
- `tests/unit/capability-supply/current-tool-contract.test.ts`
- `tests/integration/current-tool-snapshot-stability.test.ts`
- `tests/integration/canonical-tool-reads.test.ts`
- `tests/unit/schema/convex-schema.test.ts`

Call handoff and durable behavior:

- `tests/unit/capability-execution/call-admit.test.ts`
- `call-authority.test.ts`
- `call-dispatch.test.ts`
- `call-receipt-contract.test.ts`
- `call-recover.test.ts`
- `call-recovery-actions.test.ts`
- `tests/unit/convex/capability-call-approval.test.ts`
- `capability-call-authority-boundary.test.ts`
- `capability-call-identity.test.ts`
- `capability-call-reservation.test.ts`
- `capability-call-worker-*.test.ts`
- `tests/integration/capability-call-workpool.test.ts`

Public/chat/discovery consumers:

- `tests/unit/server/call-api.test.ts`
- `tests/unit/server/call-recovery-api.test.ts`
- `tests/unit/server/mcp-api-operation-invoke.test.ts`
- `tests/unit/server/mcp-api-official-client.test.ts`
- `tests/unit/chat/chat-agent-tools.test.ts`
- `tests/unit/actions/registry.test.ts`
- `tests/unit/discovery/site-discovery-manifest.test.ts`
- `tests/unit/market-terminal/call.test.ts`
- `cold-loop.test.ts`
- `recovery.test.ts`

Money/Provider consumers:

- `tests/unit/convex/money-managed-call.test.ts`
- `tests/integration/money-formance-boundary.test.ts`
- `tests/unit/release/package5-provider-operations.test.ts`

Fixtures/evidence:

- `tests/unit/convex/capability-call-worker-harness.ts`
- `tests/integration/capability-call-workpool.test.ts`
- `tools/dev/action-execution-evidence-packet.ts`
- `tools/dev/fixtures/capability-supply/development-evidence-continuity.ts`
- `tools/dev/fixtures/capability-supply/development-evidence-executions.ts`
- `tools/release/package5-provider-operations.ts`
- `src/modules/discovery/internal/tool-contract.ts`

Keep distinct:

- `src/modules/capability-supply/supplied-quote.ts`
- `supplied-quote.actions.ts`
- all `supplied-candidate-quote-*` tests
- `src/modules/money/internal/funding-quote.ts`

### Exact vocabulary mappings

| Existing | Quote target |
|---|---|
| `operation-commitment.ts` | `quote.ts` |
| `operation-commitment.actions.ts` | `quote.actions.ts` |
| `current-operation-commitment.ts` | `current-tool-quote.ts` |
| `capabilityOperationCommitments` | `capabilityQuotes` |
| `commitmentRef` | `quoteRef` |
| Quote `operationRef` | `toolRef` |
| `operationRevision` | `toolVersion` |
| `operationMaterialDigest` | `toolMaterialDigest` |
| `currentOperationDigest` | `currentToolDigest` |
| `operationJson` | `toolJson` |
| `by_commitmentRef` | `by_quoteRef` |

Current physical Quote files/table/indexes already use the target names. Old Quote source files are deleted and target files are present in the broad dirty worktree. This is not closure evidence.

### Protected exceptions

Do not rename or re-encode:

- `ae.operation-commitment:v1` evidence format and canonical field order
- `current_operation_commitment:v1`
- current digest key `operationRef`
- opaque Quote prefix `operation-commitment:v1:<digest>`
- opaque Tool prefix `operation:v1:<digest>`
- OpenAPI/protocol `operationId`
- `operationKey`
- generic Action execution and `invocationRef`
- `operation-invoke-authority:v1`
- `operation-invocation-attempt:v1`
- protected `operation.invoke` contract literal
- `commitmentRef`/`operationRef` keys inside the canonical `operationKeyFor` hash envelope
- nested Tool/Provider payload keys inside `input.input`
- Seller, OAuth, MCP, x402, stored evidence, and external financial namespaces

Current `quote.actions.ts` also retains action/evidence taxonomy such as effect class `commitment` and expected evidence `operation_commitment`; generic Action taxonomy is outside this issue.

### Concrete remaining coverage

1. Await Provider acceptance for the current Tool publication/connection/readiness/routeability seam.

2. Quote owner must reconcile the complete current boundary against issue15:

   - stale `operation-commitment.ts` and `operation-commitment.actions.ts` entries remain in `src/modules/module-boundaries.ts`
   - current `quote.ts` still exposes `operation_*` refusal labels
   - `quote.actions.ts` still contains `operation_inspect_service_unavailable`
   - `tests/unit/discovery/site-discovery-manifest.test.ts` still imports `OPERATION_INSPECT_ROUTE_CONTRACT`
   - `tests/unit/actions/registry.test.ts` still expects `commitmentRef`
   - `tools/release/package5-provider-operations.ts` still imports the deleted old Quote module and expects old inspection fields

   These are direct source/test/Provider handoffs found by source inventory, not compiler-selected work. Resolve only through existing issue mappings; do not invent aliases, APIs, indexes, records, or new refusal designs.

3. Preserve and verify fail-closed behavior for:

   - changed input
   - expired authority or Quote
   - stale grant/policy/budget generation
   - Tool publication/version/material/current digest drift
   - price/rate/x402/treasury drift
   - malformed Tool or normalized-input snapshots
   - Quote replay/conflict and Call idempotency
   - consumed/reopened Quote state
   - protected digest and opaque-prefix vectors

4. Later ownership remains explicit:

   - issue16: Call lifecycle and purchased Call records
   - issue17: suggested next actions and purchase outcomes
   - issue18: money, durable financial records, Provider obligation/Payout
   - issue19: public action IDs, HTTP/MCP contracts and routes
   - issue20: CLI and installed consumers
   - issue21: discovery/plugin output
   - issue22: generated artifacts
   - issue14/Package5: Provider release/source fixtures and Provider-owned fields
   - issues23–26: UI/provider/money presentation

### Minimal targeted reads at implementation start

Only after Provider acceptance:

- `convex/capabilitySupplyCurrentTool.ts`
- `src/modules/capability-supply/current-tool.ts`
- `src/modules/capability-supply/published-tool.ts`
- `src/modules/capability-supply/public.ts`
- `convex/capabilitySupplyPublish.ts`
- `convex/capabilityProviderTools.ts`
- `convex/sourceWriteAdmission.ts`
- `src/lib/server/source-write-admission.ts`
- `convex/capabilityQuotes.ts`
- `src/modules/capability-execution/internal/convex-schema.ts`
- `convex/lib/callLifecycle/admission.ts`
- `convex/lib/callLifecycle/authorityHandlers.ts`
- `convex/lib/callLifecycle/contracts.ts`
- current `src/lib/server/call-api.ts`
- protected MCP/API vector tests
- `tools/release/package5-provider-operations.ts` only for coordination
- generated `convex/_generated/api.d.ts`, `dataModel.d.ts`, and `src/routeTree.gen.ts` as read-only dependency checks

No broad Call/money/public implementation read is required to start Quote work.

**Final status: inventory complete; implementation remains held; Provider acceptance is the next gate.**

## Earlier issue15 history

## Current Quote module — read-only inventory, implementation held

One Luna Max owner prepares the complete existing Quote boundary while Provider
is the sole source writer. Definitions, schema/storage, serialization, exports,
direct callers/fixtures/tests and generated dependencies are inventoried from
current source. Earlier microslice receipts below are historical. No Quote
source edits or tests until Provider acceptance; the resulting inventory is
carried into implementation without a new conceptual inventory.

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Assignee:
Assigned role: Luna Max / Quote contract and storage implementation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 29, 30

## Outcome

### Source batch receipts and claim — 2026-09-06

`vocab_quote_continuations_03` returned the two-file continuation update
(`convex/capabilityQuotes.ts` and the existing Quote continuation test): 12/12
tests, narrow lint and static parity passed, zero compactions. Backend RPC
names remain a queued source rename; this does not close the parent issue.

`vocab_quote_budget_04` claims only `maximumPerInvocation` → `maximumPerCall`
in `convex/capabilityQuotes.ts`, `src/modules/capability-execution/quote.ts`,
`src/modules/chat/tool-card.ts` and these nine exact test consumers:
`tests/unit/release/package5-provider-operations.test.ts`,
`tests/unit/chat/chat-system.test.ts`, `tests/unit/chat/chat-agent-tools.test.ts`,
`tests/unit/server/call-api.test.ts`, `tests/unit/market-terminal/cold-loop.test.ts`,
`tests/unit/server/mcp-api-official-client.test.ts`,
`tests/unit/market-terminal/call.test.ts`,
`tests/unit/market-terminal/recovery.test.ts`, and
`tests/unit/server/call-recovery-api.test.ts`.
Verification: the two existing server suites plus Quote continuation suite,
narrow lint, whitespace and remaining-field search. Other fixture failures
must be returned, not repaired outside this fixed mapping. No generation,
deployment, data operation or broader acceptance is assigned.

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
- `package.json` (read-only; issue 22 is the sole root-package writer. No direct Quote command path exists in this baseline: provide a no-change receipt, not a speculative script edit.)

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

- [x] Quote source files, exports, validators, codecs, Convex table/indexes,
      direct callers, fixtures and tests use the fixed Quote/Tool vocabulary in
      one coherent cutover, with no definition-only half.
- [x] `capabilityOperationCommitments` → `capabilityQuotes`, all Quote indexes,
      readers and writers, and `commitmentRef` → `quoteRef` fields are complete;
      Call tables remain issue 16's separate ownership.
- [x] Quote expiry, bound input, Tool version/material/current digest, pricing,
      permissions, limits and retry/refusal behaviour are unchanged.
- [x] `SuppliedQuote` stays qualified and distinct; Quote is not a Call, and
      Provider/Seller/payment/delivery facts remain separate.
- [x] `ae.operation-commitment:v1`, `current_operation_commitment:v1`,
      `operation-invoke-authority:v1`, `operation-invocation-attempt:v1`,
      opaque prefixes, canonical hash material and vectors remain byte-stable.
- [x] Public route/action changes are handed to issue 19, generated output is
      handed to issue 22 at its intermediate checkpoint, and no alias,
      compatibility engine, migration, dependency, deployment or data reset is
      introduced.

## Closure evidence

Attach the reviewable Quote source/schema patch, focused test and typecheck
output, a field/index/table old→new receipt, protected-vector comparison, and
the explicit `quoteRef` handoff to issue 16 plus generator checkpoint to issue
22. Record any unresolved semantic occurrence for the coordinator rather than
choosing another term.

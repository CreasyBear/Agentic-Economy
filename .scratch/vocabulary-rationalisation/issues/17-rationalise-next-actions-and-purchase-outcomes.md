# Rationalise next actions and purchase outcomes

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee: Luna Max / refactor_next_actions
Assigned role: Luna Max / next-action and purchase-outcome implementation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 14, 15, 16, 29, 30

## Outcome

After the Tool, Provider, Quote and Call checkpoints, replace the AE-owned
structured continuation family with Suggested next action and align the
existing Call/card receipt presentation with Purchase resolution/status and
Outcome records. This is a vocabulary and projection cutover, not a new
workflow: one accepted Call remains one purchased Tool use, and the existing
permitted transitions, retry/recovery conditions and uncertainty rules remain
authoritative.

The worker owns the listed core presentation contract and its direct callers in
one reviewable patch. A definition-only rename is not complete. Do not require
a standing Spending policy for every Quote or Call; use the supported request
authorization/Approval path where the existing flow permits it.

## Fixed mappings

| Existing AE-owned name or field | Replacement | Rule |
| --- | --- | --- |
| `SuggestedContinuation` | `SuggestedNextAction` | One bounded, safe next action; it grants no authority and starts no work by itself. |
| `CommandContinuation` | `CommandNextAction` | Preserve command, warning and retry/reconcile behaviour. |
| `ContinuationState` | `NextActionState` | Preserve the existing state space and permitted transitions; do not add a state machine. |
| `ToolContinuationFacts` (after issue 13's mechanical Tool pass) | `ToolNextActionFacts` | Preserve availability and credential facts; this is not an authorization grant. |
| `continuationForInvocationStatus` (after issue 16's Call pass) | `nextActionForCallStatus` | Preserve pending, cancellable, retryable and reconciliation outcomes. |
| `suggestContinuation` | `suggestNextAction` | Return exactly one structured action for the same input. |
| `continuationForOperationFacts` (after issue 13) | `nextActionForToolFacts` | Preserve query normalization and connection/readiness behaviour. |
| `operationContinuation` | `toolNextAction` | Use Tool language in labels and warnings; no catalogue model change. |
| `invocationContinuation` | `callNextAction` | Use `callRef` after issue 16; no second Call or purchase is created. |
| `supplierContinuation` | `providerNextAction` | Use Provider language while preserving offering/publication/connection records. |
| Structured `continuation` on the execute `OperationCardProjection` (after the issue 13/16 mechanical field pass) | `suggestedNextAction` | There is one executable structured field. The separate explanatory `nextAction?: string` remains text-only and is not a second action object. |
| AE-owned “commercial closure” presentation wording, if an existing listed view contains it | Purchase resolution/status | Derive it from existing receipt/result, delivery, payment and Provider-obligation facts. Do not add a purchase object or parallel status machine. |
| AE-owned “outcome evidence” presentation wording | Outcome records | Preserve attribution and uncertainty. Qualified-use receipts and evidence hashes remain their qualified evidence contracts; issue 18 owns their durable links. |
| Purchased `invocation` subject/ref in this family after issue 16 | `call`/`callRef` | Generic Action execution `executionRef` and any generic `invocationRef` remain issue 11's separate family. |
| Tool detail web link `/operations/$operationRef` | `/tools/$toolRef` | Exact target route consumed from issue 13; issue 13 owns Tool route mechanics. |
| Call detail web link `/operations/invocations/$invocationRef` | `/calls/$callRef` | Exact target route consumed from issue 16; issue 16 owns Call route mechanics. |
| `/operations` web redirect | `/tools` web redirect | Preserve `/market?window=30d` and use the renamed `#tools` section anchor. Route ownership remains with issues 13/16/24. |

The source inventory found no literal `commercialClosure`,
`purchaseResolution`, `purchaseStatus`, `OutcomeEvidence` or `OutcomeRecord`
field in the owned core modules. Therefore the worker must not invent a
persisted field or table to satisfy the words above. Where a listed existing
presentation already has an equivalent label, change that label in place; for
the Call receipt/status view, derive the target vocabulary from its existing
facts and report any proposed new stored field to the coordinator instead of
choosing one.

The existing state boundaries are fixed, not rename candidates:

- Call receipt `state` (`settled`, `refunded`, `reconciliation_required`) and
  result `kind` remain receipt/result facts.
- Usage `chargeState` (`free_tier`, `paid`, `insufficient_credit`,
  `outcome_unknown`, `refunded`) remains charge/payment evidence.
- Call projection `deliveryState`, `paymentState` and optional
  `providerObligationState` remain separate fields with their existing values.
- A receipt is complete only for the existing canonical completed result;
  terminal failure, cancellation and uncertainty are not projected as
  success. A suggested next action may point to status, recovery or a receipt
  without changing any of these facts.

## Exact owned file mapping

All paths below are literal. Shared paths are serialized after the named
predecessor's mechanical work; this ticket owns only the next-action/outcome
slice identified here.

### Core next-action source and direct callers

- `src/modules/market/suggested-continuation.ts` →
  `src/modules/market/suggested-next-action.ts` — rename the family, its
  exported types/functions and the exact Tool/Provider/Call subjects after
  issues 13–16 have updated their references.
- `src/modules/chat/tool-card.ts` — update the structured
  `SuggestedNextAction` import/type, `continuation` property and projection
  builders to `suggestedNextAction`; leave the explanatory text
  `nextAction` field text-only.
- `src/components/ae/operation-chat/OperationCard.tsx` — consume the one
  `suggestedNextAction` structured property. Do not redesign the card or alter
  its separate explanatory `Next:` text.
- `src/routes/operations.invocations.$invocationRef.tsx` →
  `src/routes/calls.$callRef.tsx` — after issue 16 moves the Call detail route,
  update only the imported next-action function, helper/component identifier
  and structured Call link to the target path. Issue 16 owns route/Call
  mechanics and issue 24 owns broader screen copy and presentation.

### Owned tests and focused shared assertions

- `tests/unit/market/suggested-continuation.test.ts` →
  `tests/unit/market/suggested-next-action.test.ts` — rename imports and
  fixtures, preserve every existing safe-action/query/status assertion, and
  add the one-action/no-new-Call and terminal-failure-not-success checks.
- `tests/unit/chat/operation-chat-agent-tools.test.ts` — update the
  structured card property/type assertions after issue 13's Tool pass; do not
  change public action IDs owned by issue 19.
- `tests/unit/chat/chat-system.test.ts` — update the direct structured card
  assertions to `suggestedNextAction`, while retaining the separate text
  `nextAction` assertions and purchase/payment uncertainty expectations.
- `tests/unit/capability-execution/invocation-receipt-view.test.ts` →
  `tests/unit/capability-execution/call-receipt-view.test.ts` — issue 16 owns
  the file and Call field move; this ticket adds only the outcome/purchase
  presentation assertions described below, serialized after that move.

The receipt-view source file
`src/modules/capability-execution/invocation-receipt-view.ts` →
`src/modules/capability-execution/call-receipt-view.ts` is a shared post-16
slice, not an independent Call implementation: issue 16 owns its file move,
receipt contract and mechanical refs; this ticket may touch only existing
presentation labels/derived fields for Purchase resolution/status and Outcome
records. Do not rename its protected receipt format or evidence identifiers.

## Serialized handoffs and known consumers

- Issue 13 must finish Tool fields and the mechanical imports in
  `src/modules/market/suggested-continuation.ts`,
  `src/modules/chat/tool-card.ts`, `src/components/ae/operation-chat/OperationCard.tsx`
  and the listed chat tests before this ticket renames the continuation
  family.
- Issue 14 must finish Provider fields. Provider setup/publication records,
  Offering/Publication/Listing/Source, portfolio Service and Provider/Seller
  roles are not collapsed by this ticket.
- Issue 15 must finish Quote fields/codecs. A Quote remains distinct from a
  Call and from qualified `SuppliedQuote`.
- Issue 16 must finish the Call route/file and receipt checkpoints before
  this ticket updates the Call next-action consumer. Its route mapping is
  `/operations/invocations/$invocationRef` → `/calls/$callRef`; the public
  HTTP mapping remains issue 19's ownership.
- Issue 20 owns the CLI adapter and its direct test
  `tools/ae/lib/suggested-continuation-adapter.ts` and
  `tests/unit/market-terminal/suggested-continuation-adapter.test.ts`; they
  consume the post-17 module and must not retain an old-name compatibility
  alias.
- Issues 19, 21, 22, 23 and 24 own public HTTP/MCP action IDs, discovery and
  generated output, customer/agent screens, and broader catalogue/Call screen
  copy respectively. This ticket hands them the structured target field and
  exact route targets; it does not edit their surfaces.
- Issue 18 owns money, audit, queue and qualified-use durable links. It must
  preserve the independent delivery/payment/Provider-obligation facts used by
  the derived purchase-resolution view.

## Protected names

Retain these occurrences even when they appear near a renamed presentation:

- Generic `Principal`, Account, Business, User, Credential and
  `DelegationGrant`, including generic Action execution `executionRef` and
  `actionExecution*` fields/tables.
- Upstream OpenAPI `operationId`, MCP methods and action-derived tool names,
  OAuth fields, x402 fields and arbitrary Provider/Tool argument keys.
- Opaque identifier prefixes, receipt/evidence format literals,
  `evidenceHash`, canonical hash/signature material and external financial
  namespaces. `ae.public-invocation-receipt:v1` and other protected formats
  remain byte-stable under issue 16/18 ownership.
- `SuppliedQuote`, qualified-use receipts, Provider/Seller/payment-recipient
  distinctions, Charge/Provider obligation/payable/payout, delivery and
  payment fields and their evidence are not reclassified as a purchase.

## Explicit exclusions

The worker must not edit:

- Generic Action execution source, tables, queue controls, attempts or
  history; generic funding, agent-access, Provider-lifecycle and unrelated
  `nextAction` text fields.
- Public API route/action definitions, MCP `/mcp`, CLI/discovery/plugin
  surfaces, generated `_generated` output, package manifests or deployment
  records. Issues 19–22 and 23–24 own those paths.
- `convex/chatShares.ts`: the current structured continuation is regenerated
  from the card and is not a separately persisted action field; issue 13 owns
  its Tool shape and later surface owners consume this contract. Do not add a
  second durable chat action field.
- `qualifiedUseReceipts`, money tables, `sellerOnboardingCanaryRearmAudits`
  or `providerConsequenceJournal`; issue 18 owns their durable vocabulary and
  indexes.
- Any new Purchase/Order/Closure table, status machine, recovery object,
  compatibility alias, migration engine, dependency, or UI interaction
  redesign. Existing Call recovery remains the only recovery path.

## Dependencies and sequencing

- Baseline 08 and independent reviews 29/30 are dispatch gates. Issues 10–16
  are strict predecessors for their respective shared contracts; issue 16's
  Call schema/receipt checkpoint is required before the Call slices here.
- Run this ticket after issue 13's Tool mechanical pass, issue 14's Provider
  pass, issue 15's Quote pass and issue 16's Call pass. Issue 17 then feeds
  issues 19–24 and the generated checkpoint 22. Issue 18 is a separate
  post-16 durable-money owner; no source writer may claim both slices green
  without its own acceptance.
- Shared source and generated writers are serialized. Do not edit generated
  files here; issue 22 runs the existing generators at its checkpoint.
- Hosted cutover, fresh test data, live QA and Package 6/7 remain held by
  issues 31–36 and the accepted plan.

## Verification commands and expected results

Run only after the predecessor file moves exist, with Node 22 and npm 11.5.1
through the project runner:

```sh
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm exec vitest run \
  tests/unit/market/suggested-next-action.test.ts \
  tests/unit/chat/operation-chat-agent-tools.test.ts \
  tests/unit/chat/chat-system.test.ts \
  tests/unit/capability-execution/call-receipt-view.test.ts \
  --no-file-parallelism
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run typecheck
NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npm run test:types
git diff --check -- \
  src/modules/market/suggested-next-action.ts \
  src/modules/chat/tool-card.ts \
  src/components/ae/operation-chat/OperationCard.tsx \
  src/routes/calls.$callRef.tsx \
  tests/unit/market/suggested-next-action.test.ts \
  tests/unit/chat/operation-chat-agent-tools.test.ts \
  tests/unit/chat/chat-system.test.ts \
  tests/unit/capability-execution/call-receipt-view.test.ts
```

Expected results:

- The renamed module and every listed direct caller compile with no old-name
  alias; each input yields at most one structured Suggested next action.
- Tool/Provider/Call labels and the exact web targets agree with the route
  handoffs; no arbitrary Provider/Tool input is rewritten.
- Pending, retryable, cancellable and reconciliation actions preserve their
  existing command/warning/identity behaviour. A retry or reconciliation
  suggestion never creates a fresh Call after dispatch.
- Receipt/result completion is true only for the existing completed result;
  terminal failure, cancellation and outcome uncertainty are not success.
  Purchase resolution/status remains derived and does not collapse delivery,
  payment, Provider obligation, Charge or refund facts.
- Existing Outcome-record/evidence attribution and uncertainty assertions
  remain intact, and the focused tests, typecheck and test-type check pass.
  The historical baseline `test:ts-standards` 26 findings remain separate;
  this ticket does not waive or fix them.

No commands are run during ticket preparation. The coordinator's recorded
pre-refactor evidence is typecheck PASS, unit 459 files/4041 tests PASS,
integration 112 files/1083 tests (1 skipped file, 4 skipped tests) PASS and
`test:ts-standards` 26 findings.

## Acceptance

- [ ] The listed continuation source, direct callers and owned tests are
      renamed/updated together; no definition-only half or old-name alias
      remains in the owned surface.
- [ ] Tool, Provider, Quote and Call target terms are consumed from issues
      13–16, including the exact `/tools/$toolRef`, `/calls/$callRef` and
      `/tools` redirect handoffs; public route/action ownership remains with
      the stated later issues.
- [ ] One Suggested next action is projected without granting authority,
      forcing a standing Spending policy or constructing a second Call or
      purchase object.
- [ ] Purchase resolution/status is a derived presentation of existing facts;
      delivery, payment, Provider obligation, Charge, refund and uncertainty
      remain distinct, and terminal failure is never success.
- [ ] Outcome records preserve attribution and uncertainty without renaming
      qualified-use evidence contracts or protected hashes/format values.
- [ ] Focused tests, typecheck, test-type check and whitespace checks pass;
      generated output, broader public surfaces, data and deployment are
      handed off without mutation.

## Closure evidence

Attach the reviewable old→new symbol/file mapping, changed-path list, direct
caller/typecheck receipt, focused test output and the exact route handoff. Add
the terminal-failure/uncertainty, one-action/no-new-Call and separate
delivery/payment/Provider-obligation evidence. Record any source occurrence
that appears to require a new persisted purchase field as a coordinator
blocker; do not resolve it by inventing a parallel object or state machine.
Issue 20's CLI handoff, issue 18's durable-money handoff and issue 22's
generator checkpoint must be named separately. Do not claim public, generated,
live, hosted-cutover or Package 6/7 completion from this ticket.

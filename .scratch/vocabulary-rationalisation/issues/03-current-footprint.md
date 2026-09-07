# Inventory current names, consumers and data boundaries

Type: task
Label: wayfinder:task
Mode: AFK
Status: resolved
Parent: ../map.md
Blocked by:

## Question

Produce the read-only inventory needed to decide migration scope: where current
names are defined, generated, consumed and stored in the actual dirty checkout.
Trace exported contracts, HTTP/MCP/CLI/plugin/UI surfaces, fixtures, tests,
documentation, table names and IDs, event types, hashes, signatures, idempotency,
queued jobs and recovery references. Separate generic action machinery from
market calls; trace Offering, Publication, Listing and Operation separately.

Identify confirmed versus unknown external consumers and target environments
using existing configuration/evidence without exposing secrets or treating stale
deployment records as live proof. Record dirty paths and ownership overlaps,
generators and relevant existing tests. Do not run migrations, broad tests,
deployments or a production data scan. If deployed metadata access is necessary,
surface the precise read-only evidence still needed as a follow-on decision.

Output a bounded evidence inventory with source references, not a build plan or
a raw occurrence count presented as a migration map.

## Consolidated inventory receipt — 2026-09-05

This receipt consolidates the completed baseline and review evidence rather than
re-running a repository-wide occurrence search. It is intentionally a read-only
boundary record. At the time of the initial receipt, issues 17, 18, 27 and 28
were not yet present in the local issue directory; that absence and the then
missing ownership records are retained as historical evidence below. The
current queue correction at the end of this file supersedes that snapshot.

### Evidence basis

The receipt is based on the execution baseline and issue records `08`, `10`–`16`,
`19`–`22`, `23`–`26`, the engineering review in
`../reports/29-engineering-review.md`, the developer-experience review in
`../reports/30-developer-experience-review.md`, the hosted preflight in
`../reports/31-hosted-cutover-preflight.md`, and the accepted plan in
`docs/designs/vocabulary-rationalisation.md`. The newly prepared verification,
data, live-QA, hosted-cutover and closeout records are `32`–`36`. These records
are evidence and ownership boundaries; they do not authorise implementation in
this inventory issue.

### Recoverable baseline boundary

- Working branch: `codex/vocabulary-rationalisation`.
- Pre-checkpoint baseline `HEAD`: `91a4fff6f68fecd63ac39bbbd4509de0bc0d5b0d`.
- All-dirty checkpoint `HEAD`: `645a348421479510432db4bdc630ed306acd18d8`.
  This checkpoint preserves the captured baseline and is the reproducible
  starting point for refactor dispatch; it does not retroactively classify
  every pre-existing change as refactor-owned.
- The captured checkout had an empty index, 131 modified/staged tracked-path
  entries and 122 untracked entries. They include pre-existing work and must be
  classified before any closeout commit; they are not an implicit refactor
  diff.
- The recoverable source archive is
  `/Users/joelchan/.codex/backups/agentic-economy/vocabulary-20260905-073915/`.
  It is source rollback evidence only, not a Convex or payment-history backup.
- With Node 22 and npm 11.5.1, baseline `npm run typecheck` passed and the
  recorded unit baseline was 459 files / 4,041 tests passed. The integration
  baseline was 112 files / 1,083 tests passed with four Formance skips.
  `npm run test:ts-standards` had 26 pre-existing findings (24 non-null
  assertions, one unknown double-cast and one Convex `any` validator); those
  findings remain separate from vocabulary acceptance.

### Source, contract and storage boundaries

The following are the finite source anchors already identified by the issues and
reviews. A rename owner must update definitions and every listed known consumer;
this is not permission to leave a type-only half that breaks callers.

- Generic action execution is the current `src/modules/action-invocation/`
  family (controls, attempts, history, durable arguments, imports and
  architecture declarations) and the action contracts in
  `src/modules/actions/index.ts`, `src/modules/actions/contract.ts` and
  `src/modules/module-boundaries.ts`. Issue 11 owns the target
  Action-execution naming and its leasing, cancellation, reconciliation and
  authority behaviour. A purchased Call remains separate.
- The callable catalogue currently runs through
  `src/modules/registry/operation-entry.ts`,
  `src/modules/registry/operation-action-contracts.ts`,
  `src/modules/registry/operation-choice-contracts.ts`,
  `src/modules/registry/operation-detail-route.functions.ts`,
  `src/modules/registry/operation-paths.ts`,
  `src/modules/registry/operations.actions.ts`,
  `src/modules/common/operation-ref.ts`,
  `src/modules/common/market-operation-paths.ts` and the supply comparison
  helper `src/modules/capability-supply/internal/operation-detail-compare.ts`.
  Issue 13 owns the mechanical Tool family and its direct importers. The
  accepted explicit move map is:

  ```text
  common/operation-ref.ts                 -> common/tool-ref.ts
  registry/operation-choice-contracts.ts -> registry/tool-choice-contracts.ts
  registry/operation-detail-route.functions.ts -> registry/tool-detail-route.functions.ts
  registry/operation-entry.ts             -> registry/tool-entry.ts
  registry/operation-action-contracts.ts  -> registry/tool-action-contracts.ts
  registry/operation-paths.ts             -> registry/tool-paths.ts
  registry/operations.actions.ts          -> registry/tools.actions.ts
  common/market-operation-paths.ts        -> common/market-tool-paths.ts
  tests/imports/operation-surface-conformance.test.ts ->
    tests/imports/tool-surface-conformance.test.ts
  ```

  These are AE-owned names; they are not protected because an upstream
  `operationId` exists. The public action IDs and route contract remain issue
  19's boundary.
- Provider terminology is owned by issue 14 across setup, connections,
  admission, publication and offboarding. `Offering`, `Publication`, `Listing`,
  `Source`, portfolio `Service`, `Provider`, `Seller` and payment recipient
  remain distinct records or roles. The AE-owned schema label
  `supplier_operations:v1` is in scope for `provider_tools:v1`; upstream
  protocol vocabulary is not.
- Quote/Call execution anchors are
  `src/modules/capability-execution/operation-invoke.ts`,
  `src/modules/capability-execution/current-operation-commitment.ts`,
  `src/lib/server/operation-invoke-api.ts`,
  `convex/capabilityOperationCommitments.ts` and
  `convex/capabilityOperationInvocationIdentity.ts`. Issues 15 and 16 own
  Quote and purchased Call semantics together with their known codecs,
  readers, writers, recovery and read models. The qualified
  `SuppliedQuote` concept remains separate from customer Quotes.
- Public HTTP/MCP/registry anchors are `src/modules/actions/index.ts`,
  `src/lib/server/mcp-api.ts` and `src/routes/api.v1.registry.ts`. CLI and
  distribution anchors are `tools/ae/cli.ts`,
  `tools/ae/commands/manifest.ts`, `tools/ae/commands/invoke.ts`, the CLI
  dist/tarball, and their maintained market-terminal tests. Discovery
  producers are `src/modules/discovery/internal/page-markdown.ts`,
  `offering-discovery-file.ts`, `api-catalog.ts` and `site-manifest.ts`, plus
  the existing plugin skill surface. Issues 19–22 own contract, CLI,
  discovery and generated propagation respectively.
- Durable records needing explicit field/index/reader/writer treatment include
  `sellerOnboardingCanaryRearmAudits` and `providerConsequenceJournal` in
  `src/modules/capability-execution/internal/convex-schema.ts`; issue 18 owns
  their record semantics. They must not be dropped as a consequence of a
  mechanical rename.
- The physical table mapping is fixed and finite:

  ```text
  actionInvocationControls                 -> actionExecutionControls
  actionInvocationAttempts                 -> actionExecutionAttempts
  actionInvocationHistory                  -> actionExecutionHistory
  capabilitySupplierOperationProjections  -> capabilityProviderToolProjections
  registeredOperationMappings              -> registeredToolMappings
  capabilityOperationCommitments           -> capabilityQuotes
  capabilityOperationInvocations           -> capabilityCalls
  capabilityOperationCallProjections      -> capabilityCallProjections
  marketOperationCategories                -> marketToolCategories
  marketOperationRatings                   -> marketToolRatings
  marketActiveOperations                   -> marketActiveTools
  marketActiveSuppliers                    -> marketActiveProviders
  ```

  Generic `principals`, `accounts`, `businesses`, `operationKeys`, financial
  tables and Convex component internals are not in this table map.
- Generated and boundary outputs that must be checked after source changes are
  `convex/_generated/api.js`, `convex/_generated/api.d.ts`,
  `convex/_generated/server.js`, `convex/_generated/server.d.ts`,
  `convex/_generated/dataModel.d.ts`, `src/routeTree.gen.ts`, the CLI dist and
  public archive. Issue 22 owns these shared writers and has a generation
  checkpoint after source table/function names change; it must not wait only
  for the final package.

### Protected names and evidence material

The following are retained exceptions, not missing source ownership:

- Generic IAM `Principal`, `Account`, `Business`, `User`, `Credential`,
  `DelegationGrant`, `AgentAccessPrincipal` and `agentAccessPrincipals` retain
  their identity/access meanings. Product-role replacements are Customer and
  Agent; they do not rename every IAM or legal-business row.
- External registry records and namespaces remain distinct:
  `src/routes/api.v1.registry.ts`, `convex/marketExternalRegistry` and
  `api-registry:v1`. Imported external metadata is not a canonical market Tool
  until admission/publication. Upstream OpenAPI `operationId`, MCP method names,
  OAuth standard fields and x402 payment fields remain exact.
- Opaque identifier prefixes, signatures, canonical hash bytes and external
  financial namespaces remain stable. Existing protected materials include
  `ae.operation-commitment:v1`, `current_operation_commitment:v1`,
  `operation-invoke-authority:v1`, `operation-invocation-attempt:v1` and
  `issued-agent-principal:v2`, plus the existing cancellation digest.
  `acceptedBasis` values inside the authority serialization remain old
  canonical values. Existing encoders/builders may project new AE-owned field
  names back to those old canonical keys; no recursive compatibility mapper or
  new alias API is permitted.
- `src/lib/server/operation-invoke-api.ts` hashes an operation key and carries
  an opaque `input.input` payload. The payload is not recursively renamed.
  Only the AE-owned envelope fields are projected at the existing hash boundary,
  with the current vectors retained. External evidence, historical payments,
  webhooks and durable financial references are preserved.

### Initially missing move or symbol ownership (superseded by queue correction)

The file-name audit was evidence for the finite follow-up list at the time of
the initial receipt, not a migration scope count. The list below is retained as
historical evidence; the current ownership and exact target disposition are in
the queue-correction receipt that follows. No path is classified as protected
merely because it is UI or a helper.

- Presentation family currently associated with issue 24 but lacking a final
  move/symbol map: `src/components/ae/market/AeOperationCard.tsx`;
  `src/components/ae/market/operation-detail/AeOperationCompactDecision.tsx`,
  `src/components/ae/market/operation-detail/AeOperationContinuation.tsx`,
  `src/components/ae/market/operation-detail/AeOperationContractSections.tsx`,
  `src/components/ae/market/operation-detail/AeOperationDecision.tsx`,
  `src/components/ae/market/operation-detail/AeOperationEconomics.tsx`,
  `src/components/ae/market/operation-detail/AeOperationFacts.tsx`,
  `src/components/ae/market/operation-detail/AeOperationIdentity.tsx`,
  `src/components/ae/market/operation-detail/AeOperationInspector.tsx`,
  `src/components/ae/market/operation-detail/AeOperationLatencyChart.tsx`,
  `src/components/ae/market/operation-detail/AeOperationPosition.tsx`,
  `src/components/ae/market/operation-detail/AeOperationTrackRecord.tsx`,
  `src/components/ae/market/operation-detail/index.ts`,
  `src/components/ae/market/operation-detail/operation-inspector-model.ts`;
  and `src/components/ae/operation-chat/ChatTranscript.tsx`,
  `src/components/ae/operation-chat/OperationCard.tsx`,
  `src/components/ae/operation-chat/OperationChat.tsx`,
  `src/components/ae/operation-chat/OperationChatHeader.tsx`,
  `src/components/ae/operation-chat/OperationComposer.tsx`,
  `src/components/ae/operation-chat/OperationHistory.tsx` and
  `src/components/ae/operation-chat/SharedOperationChat.tsx`.
- Their known affected tests also need an explicit owner/target path:
  `tests/unit/chat/operation-chat-agent-tools.test.ts`,
  `tests/unit/chat/operation-chat-header.test.tsx`,
  `tests/unit/chat/operation-chat-provider-boundary.test.tsx`,
  `tests/unit/chat/operation-chat-provider-contract.test.ts`,
  `tests/unit/chat/operation-chat-prune-boundary.test.ts`,
  `tests/unit/operation-chat-ui/chat-presence.test.tsx`,
  `tests/unit/routes/operation-chat-routes.test.tsx`,
  `tests/unit/routes/operation-detail-route.test.tsx` and
  `tests/unit/ui/supplier-operation-detail.test.tsx`.
- Helpers requiring coordinator classification and a finite owner are
  `src/lib/public/operation-icons.ts` with
  `tests/unit/lib/operation-icons.test.tsx`,
  `src/lib/server/operation-approval-source.ts` with
  `tests/unit/server/operation-approval-source.test.ts`,
  `src/lib/server/operation-read-problem.ts`,
  `src/lib/server/operation-read-request.ts`,
  `src/modules/registry/operation-read-problem.ts`, and
  `src/modules/capability-supply/internal/x402-invocation-policy.ts` with
  `tests/unit/capability-supply/x402-invocation-policy.test.ts`.
  The last family must be classified against paid Calls versus generic Action
  execution; it is not an implicit protected protocol name.
- `tools/ae/commands/invoke.ts` is a known CLI consumer, but its final
  filename/export ownership is not explicit in issue 20. It must be mapped
  before the CLI implementation begins; do not invent a new command hierarchy
  or retain an old flag alias.
- `src/modules/registry/operation-detail-route.functions.ts` has the accepted
  mechanical Tool move listed above, while its public route/action ownership
  remains with issue 19. This is a sequencing boundary, not an unresolved
  permission to redesign the route.

### Data and deployment evidence boundary

The current local target recorded by issues 31 and 33 is Convex
`local:local-joel_chan_agentic_economy_ea30d-5` at `http://127.0.0.1:3212`,
with the local site at `http://127.0.0.1:3213` and Vite at
`http://127.0.0.1:3024`. Local work uses only the existing
`npm run dev:local` and `npm run seed:dev` procedures, after issue 31 supplies
the exact supported native backup/restore proof.

The hosted synthetic target recorded in the preflight is the existing
`package4-release` project (`agentic-economy-package4-release`, Vercel project
`prj_ADlGp7Fkox0D2MsAq0RkL3oaNFFn`) with Convex deployment
`fastidious-barracuda-66`; it is not a production or mainnet target. The
preflight census found 25 funding commands (20 pending, four succeeded and one
reversed), including 18 pending rows with external/provider references; Calls,
Quotes, x402 records, Provider obligations, Stripe inbox and reconciliation
were zero. It also recorded 21 Provider connections, 11 money documents and
350 scheduled success rows requiring maintenance accounting. A clean hosted
cutover remains blocked on fresh native Convex backup/restore proof, pending
funding reconciliation and callback/job isolation. No old callback or queued
work may be replayed against a fresh dataset.

### Queue and closure state

The shared source sequence is serialized across issues 10–16, with issue 22's
generated checkpoint after the relevant table/function changes. Public and
surface work is then coordinated through issues 19–28; engineering and
developer-experience reviews 29 and 30 must be resolved before implementation
dispatch is treated as ready. Source verification 32 can proceed once its
source queue is complete and does not require hosted proof. Local data 33 and
live QA 34 depend on the operational gate 31; hosted cutover 35 remains later.
Closeout 36 must preserve the dirty baseline, distinguish a refactor-only
commit from `HEAD`, and hold Package 6 and Package 7 until their own
dependencies and acceptance evidence are satisfied.

Issue 03 is `resolved` for source inventory and dispatch preparation: issues
17, 18, 27 and 28 are now present, and the presentation, CLI and helper
ownership gaps are resolved by the finite queue receipt below. Hosted backup/
restore and pending-funding/callback gates remain operational work under issue
31/35, not missing source inventory. No source, database, generated artifact,
deployment target or historical financial record was changed by this issue.

## Current queue correction and finite disposition — 2026-09-05

The all-dirty checkpoint is now `645a348421479510432db4bdc630ed306acd18d8`.
Issues 17, 18, 27 and 28 are present, and the initial absence note above is
historical only. The following finite queue receipt supersedes the initial
missing-owner list and is the dispatch boundary; it does not authorize source
implementation in this inventory issue.

### Assigned AE-owned families

- **Issue 13 — Tool catalogue:** after issue 11, the direct Action-execution
  consumers are `src/modules/action-execution/canonical-claim.ts`,
  `contracts.ts`, `execution-public.ts`, `reconciliation-evidence.ts` and
  `x402-payment-attempt.ts`; issue 11 retains generic `executionRef` and
  Action-execution semantics. Issue 13 owns the five-file
  `operation-ledger` → `tool-ledger` move (`index.ts`, `commands.ts`,
  `replay.ts`, `types.ts`, `policy.ts`), `operation-icons.ts` →
  `tool-icons.ts`, the server `operation-read-problem.ts`/
  `operation-read-request.ts` → `tool-read-problem.ts`/
  `tool-read-request.ts` helpers, and registry
  `operation-read-problem.ts` → `tool-read-problem.ts`. No registry
  `operation-read-request.ts` exists in the baseline. Its direct fixture,
  action-contract, execution-entry/admit, module-boundary, CLI-read-helper,
  route-helper and test callers are listed literally in issue 13.
- **Issue 14 — Provider supply:** `convex/capabilitySupplyToolPorts.ts` is the
  post-13 editable path (the old `capabilitySupplyOperationPorts.ts` is only
  lineage). Provider workspace ownership is explicit:
  `AeOwnerOperationsWorkspace.tsx` → `AeProviderWorkspace.tsx`,
  `owner-operations-projection.ts` → `provider-workspace-projection.ts`,
  `owner-operations.functions.ts` → `provider-workspace.functions.ts`,
  `supplier-identity.functions.ts` → `provider-identity.functions.ts` and
  `AeSupplierOperationDetail.tsx` → `AeProviderToolDetail.tsx`. Its exact
  downstream test paths are `provider-workspace.test.tsx`,
  `provider-workspace-compatibility-routes.test.ts`,
  `provider-workspace-route.test.ts`, `provider-workspace-functions.test.ts`,
  `provider-tool-detail.test.tsx` and
  `owner-provider-identity-outcome.test.tsx`; issue 25/26 consume these
  names for their surface-owned assertions.
- **Issue 16 — paid Calls:** the original Tool path moves are removed as
  duplicate ownership; Call updates consume issue 13's post-move
  `tool-*` paths. The exact helper moves are
  `operation-approval-source.ts` → `call-approval-source.ts` and
  `x402-invocation-policy.ts` → `x402-call-policy.ts`, with their matching
  tests and direct callers. Its public Call budget names are
  `maximumSpendPerCall`, `maximumConcurrentCalls` and
  `per_call_exceeds_daily`; the existing policy digest maps them to the old
  canonical keys before hashing. Generic Action execution remains issue 11's
  post-11 `executionRef` family.
- **Issue 20 — installed CLI:** `tools/ae/commands/invoke.ts` →
  `tools/ae/commands/call.ts`, with `runCallCommand`,
  `callCommandDescriptor` and `callCommands`; `tools/ae/cli.ts`, action
  adapters, post-13 surface-conformance test and the market-terminal call,
  recovery and cold-loop tests are direct consumers. CLI verbs remain
  `describe`, `search`, `history`, `call`, `status`, `wait`, `cancel` and
  `recover`; `--supplier` becomes `--provider` with no alias.
- **Issue 24 — product UI:** exact market, Tool detail, command-panel and
  `operation-chat` → `chat` file/symbol mappings, plus all direct importers and
  test-stem moves, are recorded in issue 24. It consumes
  `tools.$toolRef.tsx` and `calls.$callRef.tsx`; anonymous Tool detail remains
  distinct from Quote, and ChatHistory remains conversation history.

### Contract, discovery and generated handoffs

- **Issue 19** owns the public `registry.tools`/`tool.quote`/`tool.call`/
  `call.*` and market-tools HTTP routes, including the exact supply inventory
  mapping `src/routes/api.v1.supply.operations.list.ts` →
  `src/routes/api.v1.supply.tools.list.ts`, `operationsList` → `toolsList`,
  `supply.operations.list` → `supply.tools.list`, and
  `/api/v1/supply/operations/list` → `/api/v1/supply/tools/list`; contract
  version suffix remains `v1`. Issue 13 carries the Tool fields, issue 20 the
  CLI doctor consumer and issue 21 the derived discovery output.
- **Issue 21** owns the active discovery/release filename moves:
  `src/modules/discovery/internal/operation-contract.ts` →
  `src/modules/discovery/internal/tool-contract.ts`; the
  `operation-gateway-production-smoke.ts` family moves to the exact
  `tool-gateway-production-smoke*` names, with its invocation subfile becoming
  `tool-gateway-production-smoke-call.ts` and all six matching release tests
  moving by the fixed prefix map. Issues 13 and 16 may update only Tool/Call
  fields/imports in the pre-move release producers; issue 21 owns filenames,
  imports and package producer paths.
- **Issue 22** is the sole root `package.json` writer. It applies exact
  existing script-key path receipts at two stages: an early non-deploying
  generator checkpoint after source table/function names and a final package
  regeneration after public contracts. No source owner edits the root
  manifest, adds a dependency or waits for final generation before its own
  source acceptance.

### Retained exceptions and resolved residuals

The remaining old-term filename occurrences in the audited set have explicit
dispositions rather than a blanket search exception:

- `src/modules/capability-supply/internal/openapi-import/operation.ts` is the
  upstream OpenAPI operation-analysis boundary and retains its protocol
  meaning; its `operationId` field is protected.
- `src/modules/observability/internal/operation-keys.ts` and its tests retain
  generic `OperationKey`/`operationKeys` evidence semantics.
- `convex/secretLifecycleOperations.ts` and its tests retain the generic secret
  lifecycle mutation namespace.
- `tests/fixtures/module-boundaries/src/modules/registry/internal/operation-secret.ts`
  is a private-boundary fixture name and remains unchanged with its test-only
  responsibility.
- `tools/release/package5-provider-operations.ts` and
  `tests/unit/release/package5-provider-operations.test.ts` retain dated
  Package 5 history; only current Tool-link fields may be updated through
  their owning issue.
- `/api/v1/registry`, `marketExternalRegistry`, `api-registry:v1`, portfolio
  `Service`/`Offering`/`Publication`/`Listing`/`Source`, generic IAM names,
  OAuth/x402/MCP protocol fields, opaque prefixes and canonical hash/signature
  bytes remain protected.

The current queue therefore has no unassigned member of the previously
identified ledger/icon/read-helper, Provider-workspace, approval/x402-policy,
CLI-call or catalogue/Call UI families. A future owner must not sweep other
old-term filenames without a literal mapping in its issue; any genuinely
ambiguous occurrence is returned to the coordinator rather than renamed by
inference.

### Inventory closure evidence

All issue files `01`–`37` exist as individual local-Markdown records. The
current issue graph has no dependency cycle, and shared writers are serialized:
core source/schema `13 → 14 → 15 → 16`, public contracts after core, discovery
and active release moves after their contract handoff, generated output via
issue 22's early and final checkpoints, then verification/local data/live QA/
hosted cutover/closeout. The initial 26 standards findings remain baseline
evidence. This issue changed no source, test, generated artifact, deployment,
data, backup or financial record; its inventory is ready for coordinator
closure while hosted backup/restore, pending-funding reconciliation and
callback isolation remain operational gates under issue 31/35.

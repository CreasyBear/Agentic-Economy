# Inventory current names, consumers and data boundaries

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
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
boundary record. Issues 17, 18, 27 and 28 are not yet present in the local issue
directory; their missing ownership records are called out below and keep this
inventory open.

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
- Baseline `HEAD`: `91a4fff6f68fecd63ac39bbbd4509de0bc0d5b0d`.
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

### Missing move or symbol ownership (not retained exceptions)

The file-name audit is evidence for this finite follow-up list, not a migration
scope count. These paths contain AE-owned vocabulary but have no final filename
or exported-symbol owner recorded in the currently saved issues. They must be
assigned explicitly before implementation dispatch; do not classify them as
protected merely because they are UI or helper files.

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

Issue 03 remains `open`: issues 17, 18, 27 and 28 are absent and the presentation,
CLI and helper ownership gaps above are not yet resolved. Once those issue
records and their finite path mappings are saved and linked, the coordinator
can close this inventory with a final old-name exception list. No source,
database, generated artifact, deployment target or historical financial record
was changed by this receipt.

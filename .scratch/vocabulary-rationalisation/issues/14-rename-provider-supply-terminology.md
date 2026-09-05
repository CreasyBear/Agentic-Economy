# Rename Provider supply terminology

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee:
Assigned role: Luna Max / Provider supply implementation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 13, 29, 30

## Outcome

Replace AE-owned Supplier terminology with Provider terminology across supply
setup, connection, admission, publication, availability and offboarding. The
Provider is the party performing a Tool; the existing connection, publication,
readiness, eligibility, withdrawal, reconnect and offboarding transitions must
remain behaviourally identical. This issue follows issue 13's Tool catalogue
rename and consumes its renamed files and fields in one serialized source and
schema pass.

## Fixed mappings

| Existing AE-owned name | Replacement | Rule |
| --- | --- | --- |
| Supplier (performing party) | Provider | Use only for AE-owned product/source contracts and UI-facing source labels. |
| Supplier Operation / supplier operation | Provider Tool / provider tool | A Provider performs a canonical Tool; do not create a second supply object. |
| `supplierRef`, `supplierId`, `supplier` in AE-owned Provider supply fields | `providerRef`, `providerId`, `provider` | Apply only where the field denotes the performing Provider. Preserve separate Seller/payment-recipient fields. |
| `supplier_operations:v1` | `provider_tools:v1` | AE-owned schema label only; do not change an upstream protocol/schema value. |
| `marketActiveSuppliers` | `marketActiveProviders` | Physical table/index rename, completing issue 13's shared schema checkpoint. |
| `capabilitySupplierOperationProjections` | `capabilityProviderToolProjections` | Already physically renamed by issue 13; update Provider-side row semantics/readers here, without a competing table. |
| `capabilitySupplierOperations.ts` | `capabilityProviderTools.ts` | Consume issue 13's renamed file; update remaining Provider terminology and callers here. |
| `capabilitySupplierOperationProjection.ts` | `capabilityProviderToolProjection.ts` | Consume issue 13's renamed file; preserve its Tool projection behaviour. |
| `supplier-operation-status.ts` | `provider-tool-status.ts` | File and exported status vocabulary are renamed. |

The accepted public action and HTTP mappings belong to issue 19. Record the
dependency for `registry.operations.*` → `registry.tools.*` and the market
route cutover, but do not implement public routes or invent Provider-specific
action IDs in this issue. Issue 22 owns generated artifacts and must regenerate
after this shared source/schema checkpoint and again at final integration.

## Exact owned file mapping

Every path below is literal. No whole-directory assignment is implied. Paths
renamed by issue 13 are shown at their post-13 location where this issue must
make the Provider follow-through; shared files are explicitly serialized.

### Supply source and Provider connection/publication

- `src/modules/capability-supply/supplier-operation-status.ts` → `src/modules/capability-supply/provider-tool-status.ts`
- `src/modules/capability-supply/provider-connection.ts`
- `src/modules/capability-supply/provider-connection-handoff.ts`
- `src/modules/capability-supply/provider-approval.ts`
- `src/modules/capability-supply/provider-offboarding.ts`
- `src/modules/capability-supply/supply-actions.ts` (shared with issue 13; issue 13's Tool pass precedes this Provider pass)
- `src/modules/capability-supply/supply-funnel.functions.ts`
- `src/modules/capability-supply/supply-publication-v2.ts`
- `src/modules/capability-supply/source-authority-review.functions.ts`
- `src/modules/capability-supply/source-first-owner.ts`
- `src/modules/capability-supply/published-tool.ts` (the post-13 path for `published-operation.ts`; Provider labels are updated here)
- `src/modules/capability-supply/public.ts` (shared export and Provider-facing source types)
- `src/modules/capability-supply/server.ts` (shared source entry points)
- `src/modules/capability-supply/internal/admit-provider-schema.ts`
- `src/modules/capability-supply/internal/provider-connection/audit.ts`
- `src/modules/capability-supply/internal/provider-connection/command-model.ts`
- `src/modules/capability-supply/internal/provider-connection/lease.ts`
- `src/modules/capability-supply/internal/provider-connection/owner-projection.ts`
- `src/modules/capability-supply/internal/provider-connection/shared.ts`
- `src/modules/capability-supply/internal/provider-connection/types.ts`
- `src/modules/capability-supply/internal/publication/admit.ts`
- `src/modules/capability-supply/internal/publication/draft.ts`
- `src/modules/capability-supply/internal/publication/index.ts`
- `src/modules/capability-supply/internal/publication/lifecycle.ts`
- `src/modules/capability-supply/internal/publication/ports.ts`
- `src/modules/capability-supply/internal/publication/provenance.ts`
- `src/modules/capability-supply/internal/publication/publish.ts`
- `src/modules/capability-supply/internal/publication/refresh.ts`
- `src/modules/capability-supply/internal/publication/source.ts`
- `src/modules/capability-supply/internal/publication/validate.ts`
- `src/modules/capability-supply/internal/publication/withdraw.ts`
- `src/modules/capability-supply/internal/supply-funnel/connections.ts`
- `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff-contract.ts`
- `src/modules/capability-supply/internal/supply-funnel/provider-connection-handoff.ts`
- `src/modules/capability-supply/internal/supply-funnel/publication-admit.ts`
- `src/modules/capability-supply/internal/supply-funnel/publication-import.ts`
- `src/modules/capability-supply/internal/supply-funnel/source-first-owner.ts`
- `src/modules/capability-supply/internal/supply-funnel/types.ts`
- `src/modules/capability-supply/internal/eligibility/decision.ts`
- `src/modules/capability-supply/internal/eligibility/exact.ts`
- `src/modules/capability-supply/internal/eligibility/index.ts`
- `src/modules/capability-supply/internal/eligibility/list.ts`
- `src/modules/capability-supply/internal/eligibility/ports.ts`
- `src/modules/capability-supply/internal/eligibility/projection.ts`
- `src/modules/capability-supply/internal/eligibility/replay.ts`
- `src/modules/capability-supply/internal/eligibility/write.ts`
- `src/modules/capability-supply/internal/graph/ports.ts`
- `src/modules/capability-supply/internal/graph/qualify-candidate.ts`
- `src/modules/capability-supply/internal/graph/read-probe-target.ts`
- `src/modules/capability-supply/internal/graph/record-probe-result.ts`
- `src/modules/capability-supply/internal/readiness-probe-shared.ts`
- `src/modules/capability-supply/internal/readiness-probe.ts`
- `src/modules/capability-supply/internal/route-transport-http-json.ts`
- `src/modules/capability-supply/internal/route-transport-invoke.ts`
- `src/modules/capability-supply/internal/route-transport-x402-payment.ts`
- `src/modules/capability-supply/internal/route-transport-x402.ts`
- `src/modules/capability-supply/internal/publication-importer-agent-plugin.ts`
- `src/modules/capability-supply/internal/publication-importer-mcp.ts`
- `src/modules/capability-supply/internal/publication-importer-openapi.ts`
- `src/modules/capability-supply/internal/publication-importer-types.ts`
- `src/modules/capability-supply/internal/publication-importer-x402-bazaar.ts`
- `src/modules/capability-supply/internal/publication-importer-x402.ts`
- `src/modules/capability-supply/internal/publication-importers.ts`

### Convex Provider supply and shared schema

- `convex/capabilityProviderApprovals.ts`
- `convex/capabilityProviderConnectionAgents.ts`
- `convex/capabilityProviderConnectionAttempts.ts`
- `convex/capabilityProviderConnectionCleanup.ts`
- `convex/capabilityProviderConnectionCleanupAction.ts`
- `convex/capabilityProviderConnectionMigration.ts`
- `convex/capabilityProviderConnections.ts`
- `convex/capabilityProviderOffboarding.ts`
- `convex/capabilityProviderTools.ts` (post-13 path for `capabilitySupplierOperations.ts`; Provider-side callers only)
- `convex/capabilityProviderToolProjection.ts` (post-13 path for `capabilitySupplierOperationProjection.ts`; Provider-side callers only)
- `convex/capabilitySupplyCommands.ts`
- `convex/capabilitySupplyCurrentTool.ts` (post-13 path for `capabilitySupplyCurrentOperation.ts`)
- `convex/capabilitySupplyEligiblePorts.ts`
- `convex/capabilitySupplyGraph.ts`
- `convex/capabilitySupplyGraphPorts.ts`
- `convex/capabilitySupplyIntegrationDrafts.ts`
- `convex/capabilitySupplyLists.ts`
- `convex/capabilitySupplyOwnerFunnel.ts`
- `convex/capabilitySupplyOwnerFunnelCommands.ts`
- `convex/capabilitySupplyOwnerFunnelProjection.ts`
- `convex/capabilitySupplyOwnerFunnelProjection/contracts.ts`
- `convex/capabilitySupplyOwnerFunnelProjection/offering_projection.ts`
- `convex/capabilitySupplyOwnerStaging.ts`
- `convex/capabilitySupplyOwnerSupply.ts`
- `convex/capabilitySupplyOperationPorts.ts` (post-13 path: `convex/capabilitySupplyToolPorts.ts`)
- `convex/capabilitySupplyProjection.ts`
- `convex/capabilitySupplyProbes.ts`
- `convex/capabilitySupplyPublicationPorts.ts`
- `convex/capabilitySupplyPublish.ts`
- `convex/capabilitySupplyReadiness.ts`
- `convex/capabilitySupplyRowMappers.ts`
- `convex/capabilitySupplyShared.ts`
- `convex/capabilitySupplyValues.ts`
- `convex/capabilitySupplyWriterPorts.ts`
- `convex/capabilitySupplyToolQueries.ts` (post-13 path for `capabilitySupplyOperationQueries.ts`)
- `convex/capabilitySupplyToolShared.ts` (post-13 path for `capabilitySupplyOperationShared.ts`)
- `convex/capabilitySupplyTools.ts` (post-13 path for `capabilitySupplyOperations.ts`)
- `convex/capabilitySupplyToolOriginMap.ts` (post-13 path for `capabilitySupplyOperationOriginMap.ts`)
- `convex/marketPresence.ts`
- `convex/marketListingEvidence.ts`
- `convex/convex.config.ts`
- `convex/schema.ts`
- `convex/lib/providerConnections/agent.ts`
- `convex/lib/providerConnections/authority.ts`
- `convex/lib/providerConnections/cleanup.ts`
- `convex/lib/providerConnections/codecs.ts`
- `convex/lib/providerConnections/contracts.ts`
- `convex/lib/providerConnections/leases.ts`
- `convex/lib/providerConnections/lifecycle.ts`
- `convex/lib/providerConnections/owner.ts`
- `convex/lib/providerOffboardingFreeze.ts`
- `convex/providerConsequenceHttp.ts`

`convex/schema.ts`, `convex/marketPresence.ts`, and the capability/market
schema modules are shared writers. Issue 13 completes the Tool-side table
names first; this issue then completes `marketActiveProviders` and Provider
row fields. Issue 15 and issue 16 must wait for this checkpoint. Issue 18 owns
the `providerConsequenceJournal` table and money/durable fields; this ticket
only hands Provider identity through and does not rename its financial or audit
semantics.

### Known callers, fixtures and tests

Rename the two test files whose names carry Supplier terminology; update the
remaining listed tests in place so connection/publication callers are not left
on a definition-only half:

- `tests/unit/capability-supply/supplier-operation-status.test.ts` → `tests/unit/capability-supply/provider-tool-status.test.ts`
- `tests/integration/supplier-business-bootstrap.test.ts` → `tests/integration/provider-business-bootstrap.test.ts`
- `tests/unit/capability-supply/admit-provider-schema.test.ts`
- `tests/unit/capability-supply/owner-x402-connection-environment.test.ts`
- `tests/unit/capability-supply/provider-approval.test.ts`
- `tests/unit/capability-supply/provider-connection-handoff.test.ts`
- `tests/unit/capability-supply/provider-connection.test.ts`
- `tests/unit/capability-supply/provider-offboarding.test.ts`
- `tests/unit/capability-supply/publication-commands-harness.ts`
- `tests/unit/capability-supply/publication-commands-prepare.test.ts`
- `tests/unit/capability-supply/publication-commands-publish.test.ts`
- `tests/unit/capability-supply/publication-commands-refresh.test.ts`
- `tests/unit/capability-supply/publication-commands-republish.test.ts`
- `tests/unit/capability-supply/publication-commands-thinness.test.ts`
- `tests/unit/capability-supply/publication-commands-withdraw.test.ts`
- `tests/unit/capability-supply/publication-importers-harness.ts`
- `tests/unit/capability-supply/publication-importers-mcp.test.ts`
- `tests/unit/capability-supply/publication-importers-openapi.test.ts`
- `tests/unit/capability-supply/publication-importers-x402.test.ts`
- `tests/unit/capability-supply/publication-lifecycle.test.ts`
- `tests/unit/capability-supply/publication-validate.test.ts`
- `tests/unit/capability-supply/supply-funnel.test.ts`
- `tests/unit/capability-supply/supply-publication-v2.test.ts`
- `tests/unit/capability-supply/supply-actions.test.ts` (shared after issue 13)
- `tests/unit/capability-supply/supply-writers.test.ts` (shared after issue 13)
- `tests/unit/capability-supply/eligible-supply.test.ts` (Tool/Provider row consumer)
- `tests/unit/capability-supply/published-tool.test.ts` (post-13 path)
- `tests/unit/convex/provider-connection-agent-lifecycle.test.ts`
- `tests/unit/convex/provider-connection-authority-migration.test.ts`
- `tests/unit/convex/provider-connection-cleanup.test.ts`
- `tests/unit/convex/provider-connection-revocation.test.ts`
- `tests/unit/convex/credentialless-x402-connection-authority.test.ts`
- `tests/integration/capability-provider-offboarding.test.ts`
- `tests/integration/capability-publication-graph.test.ts`
- `tests/integration/capability-publication-owner.test.ts`
- `tests/integration/capability-publication-probe.test.ts`
- `tests/integration/capability-publication-projected-support.test.ts`
- `tests/integration/capability-publication-publish.test.ts`
- `tests/integration/capability-publication-refresh.test.ts`
- `tests/integration/capability-publication-security.test.ts`
- `tests/integration/capability-supply-integration-draft.test.ts`
- `tests/integration/capability-supply-owner-funnel-publish.test.ts`
- `tests/integration/capability-supply-owner-funnel-read.test.ts`
- `tests/integration/capability-supply-owner-funnel-run-test.test.ts`
- `tests/integration/capability-supply-owner-sandbox-staging.test.ts`
- `tests/integration/capability-supply-registration-binding.test.ts`
- `tests/integration/capability-supply-registration-eligibility.test.ts`
- `tests/integration/capability-supply-registration-harness.ts`
- `tests/integration/capability-supply-registration-offering.test.ts`
- `tests/integration/capability-supply-registration-quarantine.test.ts`
- `tests/integration/provider-connection-attempts.test.ts`
- `tests/integration/provider-connection-owner-x402-onboarding.test.ts`
- `tests/integration/provider-business-bootstrap.test.ts` (post-rename path)
- `tests/unit/schema/convex-schema.test.ts`
- `tests/unit/provider-operation-fixture/development-provider-operation.test.ts`
- `tests/unit/provider-operation-fixture/development-provider-operation-packet.test.ts`

The two current fixture test paths above must update their Tool vocabulary in
place or be renamed only with their explicit fixture source mapping below.
The Provider UI, route and historical package tests are later consumers, not
silently omitted callers.

### Current fixture source and generated/consumer handoff

These finite development fixture files are source producers for Provider Tool
examples and must be updated with the source cutover:

- `tools/dev/development-provider-operation-evidence.ts` → `tools/dev/development-provider-tool-evidence.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-context.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-context.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-evidence.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-evidence.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-fixture.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-fixture.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-spending-policy.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-spending-policy.ts` (post-12 path; issue 12 owns the standing-policy rename)
- `tools/dev/fixtures/provider-operation/development-provider-operation-objective.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-objective.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-offset-rule.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-offset-rule.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-packet.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-packet.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-provider.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-provider.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-recovery.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-recovery.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-runner.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-runner.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation-signing-custody.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool-signing-custody.ts`
- `tools/dev/fixtures/provider-operation/development-provider-operation.actions.ts` → `tools/dev/fixtures/provider-tool/development-provider-tool.actions.ts`

Issue 22 regenerates `convex/_generated/api.d.ts`,
`convex/_generated/api.js`, `convex/_generated/dataModel.d.ts` and
`src/routeTree.gen.ts`; do not edit those outputs here. Issue 19/21 own public
routes, installed clients, plugin instructions and external action names.

## Protected boundaries and explicit exclusions

- `Service`, `Offering`, `Publication`, `Listing` and `Source` remain distinct
  records. When their AE-owned callable field is a Tool reference, issue 13's
  `operationRef` → `toolRef` mapping applies; this issue only updates a
  Provider identity field and must not blanket-exclude those Tool references.
- Keep Provider, upstream Seller and payment recipient distinct. The upstream
  `seller` vocabulary in x402/OpenAPI/MCP and these exact source boundaries is
  protected: `src/modules/capability-supply/internal/x402-seller-claim.ts`,
  `src/modules/capability-supply/internal/x402-seller-endpoint-inspector.ts`,
  `src/modules/capability-supply/internal/x402-seller-onboarding/identity.ts`,
  `src/modules/capability-supply/internal/x402-seller-onboarding/types.ts`,
  `src/modules/capability-supply/internal/x402-seller-onboarding/canary.ts`,
  `src/modules/capability-supply/internal/x402-seller-onboarding/promotion.ts`.
  Rename only an AE-owned surrounding Provider field, never the protocol key or
  evidence bytes.
- Keep `/api/v1/registry`, `marketExternalRegistry`,
  `registrySearchDocuments`, `api-registry:v1` and the external registry tests
  unchanged. This issue does not merge external metadata into the market.
- Do not rename generic IAM `Principal`, Account, Business, User, Credential
  or DelegationGrant; generic Action execution remains issue 11. Do not edit
  `src/modules/action-invocation/*` or its tables.
- Issue 18 owns `providerConsequenceJournal`, financial tables, Provider
  obligations, payout/charge fields and durable Call records. Preserve seller,
  payment and authority namespaces while handing Provider references over.
- UI files (`src/components/ae/supply/AeSupplierOperationDetail.tsx`,
  `src/components/ae/offerings/supplier-identity.functions.ts`,
  `src/routes/for-providers.tsx`, `tests/unit/ui/owner-provider-connections.test.tsx`,
  `tests/unit/ui/supplier-operation-detail.test.tsx`,
  `tests/unit/routes/owner-supplier-identity-outcome.test.tsx`) are issue 25's
  finite consumer scope. Do not pre-empt that issue here.
- Historical Package 5/release records and dated research remain issue 28's
  preserve-and-cross-reference scope; do not rewrite
  `research/PACKAGE-5-SUPPLIER-OPERATIONS-PRIMITIVES-RESEARCH.md`,
  `tools/release/package5-provider-operations.ts`, or its package tests.
- No aliases, compatibility framework, migration engine, new dependency,
  generated-file hand edit, deployment, hosted cutover or data reset.

## Dependencies and sequencing

- Baseline 08 and independent reviews 29/30, plus core identity/action/
  authorization issues 10–12, must be closed before dispatch.
- Issue 13 is the preceding shared Tool/schema writer. Issue 14 is the only
  Provider supply writer; issue 15 (Quote) and issue 16 (paid Call) wait for
  this source/schema checkpoint. Shared files such as `supply-actions.ts`,
  `published-tool.ts`, `convex/schema.ts` and `convex/marketPresence.ts` are
  serialized 13 then 14; no worker may claim parallel green halves.
- Issue 19 consumes the final AE-owned Tool/Provider action and route fields;
  issue 22 must run its intermediate generator checkpoint after these physical
  table/function names and its final regeneration later. Issue 18 consumes
  Provider references in money/durable records without moving their ownership.
- The hosted cutover (31/35) and Package 6/7 remain held by their accepted
  dependencies; this ticket does not authorize deployment or reset.

## Verification commands and expected results

Run with Node `22.x` and npm `11.5.1`, using the existing test runner only:

```sh
npm exec vitest run \
  tests/unit/capability-supply/provider-tool-status.test.ts \
  tests/unit/capability-supply/provider-connection.test.ts \
  tests/unit/capability-supply/provider-connection-handoff.test.ts \
  tests/unit/capability-supply/provider-offboarding.test.ts \
  tests/unit/capability-supply/publication-lifecycle.test.ts \
  tests/unit/capability-supply/publication-commands-publish.test.ts \
  tests/unit/capability-supply/publication-commands-refresh.test.ts \
  tests/unit/capability-supply/publication-commands-withdraw.test.ts \
  tests/unit/capability-supply/supply-funnel.test.ts \
  tests/unit/convex/provider-connection-agent-lifecycle.test.ts \
  tests/unit/convex/provider-connection-authority-migration.test.ts \
  tests/unit/convex/provider-connection-cleanup.test.ts \
  tests/unit/convex/provider-connection-revocation.test.ts \
  tests/integration/capability-provider-offboarding.test.ts \
  tests/integration/capability-publication-publish.test.ts \
  tests/integration/capability-publication-refresh.test.ts \
  tests/integration/provider-connection-attempts.test.ts \
  tests/integration/provider-business-bootstrap.test.ts \
  tests/unit/schema/convex-schema.test.ts
npm run typecheck
```

Expected: Provider connection, reconnect, admission, publication, readiness,
withdrawal and offboarding tests pass with unchanged transition and authority
semantics; the active-provider table/index and `provider_tools:v1` label are
present; typecheck passes. Existing baseline `test:ts-standards` findings are
separate evidence and are not reclassified here. Issue 22, not this worker,
runs `npm run check:convex-codegen` against generated outputs.

## Acceptance

- [ ] All literal Provider source, schema, fixture, caller and test paths above
      use the fixed Provider/Tool terms, with no definition-only half.
- [ ] Supplier→Provider fields, status exports, schema label and
      `marketActiveSuppliers`→`marketActiveProviders` table/index mapping are
      complete, while issue 13's Tool mapping remains intact.
- [ ] Provider connection ownership, admission, publication, readiness,
      reconnect, withdraw and offboarding behaviour, leases and authority are
      unchanged.
- [ ] Provider, Seller, payment recipient, Provider obligation and Tool
      reference meanings remain separate; upstream protocol fields/values are
      byte-for-byte unchanged.
- [ ] External registry and portfolio records remain distinct, and Tool
      references inside retained records are mapped only at their AE-owned
      field boundary.
- [ ] Shared schema and generated checkpoints are handed to issues 15, 16 and
      22 in order. No alias, new dependency, custom migration or deployment is
      introduced.

## Closure evidence

Attach the reviewable patch, focused Provider connection/publication/offboarding
test and typecheck output, the final Supplier→Provider/file/table mapping, and
the explicit handoff receipt for issue 15 and issue 22's intermediate generator
checkpoint. Record any occurrence whose meaning is genuinely ambiguous for the
coordinator instead of selecting a new term.

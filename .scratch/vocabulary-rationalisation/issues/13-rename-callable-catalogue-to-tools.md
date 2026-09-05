# Rename callable catalogue supply to Tools

Type: task
Label: wayfinder:task
Mode: AFK
Status: open
Assignee:
Assigned role: Luna Max / callable-catalogue implementation owner
Parent: ../map.md
Blocked by: 08, 10, 11, 12, 29, 30

## Outcome

Cut over the AE-owned callable supply catalogue from Operation language to
Tool language in its definitions, projections, search/comparison contracts,
storage rows, callers and tests. A Tool is the canonical callable supply unit;
its existing revision identifier and admission/publication/eligibility
behaviour remain unchanged. This ticket does not make imported metadata a
market Tool without the existing admission and publication path.

The worker must take the whole listed propagation surface in one patch after
the blocking reviews and queue gate. Do not offer an independently green
definition-only half while callers still use the old contract.

## Fixed mappings

| Existing AE-owned name | Replacement | Rule |
| --- | --- | --- |
| Callable Operation / Operation catalogue | Tool / Tool catalogue | Product and AE-owned source language only. |
| Operation revision | Tool version | Preserve the current revision numbers, comparisons, expiry and replay behaviour. |
| `operationRef`/`operationRefs` in Tool catalogue records | `toolRef`/`toolRefs` | Apply to AE-owned Tool references, including references nested in Offering, Publication, Listing and Source records; do not rename those record concepts. |
| `operationId` from an upstream OpenAPI document | `operationId` | Protected upstream protocol field; do not rename or reinterpret it. |
| `capabilitySupplierOperationProjections` | `capabilityProviderToolProjections` | Physical table/index rename owned here; issue 14 performs its serialized Provider-side follow-through. |
| `registeredOperationMappings` | `registeredToolMappings` | Physical table/index and row-reference rename. |
| `marketOperationCategories` | `marketToolCategories` | Physical table/index and row-reference rename. |
| `marketOperationRatings` | `marketToolRatings` | Physical table/index and row-reference rename. |
| `marketActiveOperations` | `marketActiveTools` | Physical table/index and row-reference rename. |
| `marketActiveSuppliers` | `marketActiveProviders` | Shared schema/table mapping; issue 14 owns the Provider half after this ticket's schema checkpoint. |
| `supplier_operations:v1` | `provider_tools:v1` | Final AE-owned label is required, but the Supplier→Provider portion is issue 14's serialized handoff. It is never applied to an upstream protocol value. |
| AE-owned `operationAccess` selection field | `toolAccess` | Tool selection terminology is this ticket's mechanical ownership; issue 12 preserves authorization semantics. |
| AE-owned `operationRefs` selection field | `toolRefs` | Rename Tool allowlist fields in source, stored policy projections and callers. |
| AE-owned `selected_operations` value | `selected_tools` | Rename the AE-owned selection discriminator; preserve permission ordering and decision behaviour. |

The canonical action/API mappings are issue 19's ownership. This ticket must
leave an explicit handoff for these consumers rather than choosing a second
public name: `registry.operations.*` → `registry.tools.*`,
`operation.inspect` → `tool.quote`, `operation.invoke` → `tool.call`, and
the `operationRef` → `toolRef` public boundary. Issue 19 also owns the exact
HTTP routes. Issue 22 owns generated artifacts after the source checkpoint.

## Exact owned file mapping

These are literal paths, not directory globs. Rename the file and its exported
AE-owned symbols as shown, then update every listed importer in the same patch.

### Catalogue source and public projection

- `src/modules/capability-supply/operation-projection.ts` → `src/modules/capability-supply/tool-projection.ts`
- `src/modules/capability-supply/operation-schemas.ts` → `src/modules/capability-supply/tool-schemas.ts`
- `src/modules/capability-supply/operation-source.ts` → `src/modules/capability-supply/tool-source.ts`
- `src/modules/capability-supply/current-operation.ts` → `src/modules/capability-supply/current-tool.ts`
- `src/modules/capability-supply/published-operation.ts` → `src/modules/capability-supply/published-tool.ts`
- `src/modules/capability-supply/internal/operation-project.ts` → `src/modules/capability-supply/internal/tool-project.ts`
- `src/modules/capability-supply/internal/operation-detail-compare.ts` → `src/modules/capability-supply/internal/tool-detail-compare.ts`
- `src/modules/capability-supply/internal/operation-projection-types.ts` → `src/modules/capability-supply/internal/tool-projection-types.ts`
- `src/modules/capability-supply/internal/operation-projection-wire.ts` → `src/modules/capability-supply/internal/tool-projection-wire.ts`
- `src/modules/capability-supply/internal/operation-projection-wire-types.ts` → `src/modules/capability-supply/internal/tool-projection-wire-types.ts`
- `src/modules/capability-supply/internal/operation-projection-wire-schema.ts` → `src/modules/capability-supply/internal/tool-projection-wire-schema.ts`
- `src/modules/capability-supply/internal/operation-projection-wire-serialize.ts` → `src/modules/capability-supply/internal/tool-projection-wire-serialize.ts`
- `src/modules/capability-supply/internal/operation-projection-wire-deserialize.ts` → `src/modules/capability-supply/internal/tool-projection-wire-deserialize.ts`
- `src/modules/capability-supply/internal/operation-search.ts` → `src/modules/capability-supply/internal/tool-search.ts`
- `src/modules/market/operation-view-model.ts` → `src/modules/market/tool-view-model.ts`
- `src/modules/common/operation-ref.ts` → `src/modules/common/tool-ref.ts` (opaque `operation:v1:` prefixes remain byte-stable)
- `src/modules/common/market-operation-paths.ts` → `src/modules/common/market-tool-paths.ts` (public route values are issue 19's exact mapping)
- `src/modules/registry/operation-paths.ts` → `src/modules/registry/tool-paths.ts` (public route values are issue 19's exact mapping)
- `src/modules/registry/operation-action-contracts.ts` → `src/modules/registry/tool-action-contracts.ts` (mechanical Tool path; issue 19 owns public action IDs)
- `src/modules/registry/operation-choice-contracts.ts` → `src/modules/registry/tool-choice-contracts.ts` (mechanical Tool path; issue 19 owns public action IDs)
- `src/modules/registry/operation-detail-route.functions.ts` → `src/modules/registry/tool-detail-route.functions.ts` (mechanical Tool path; issue 19 owns public route)
- `src/modules/registry/operations.actions.ts` → `src/modules/registry/tools.actions.ts` (mechanical Tool path; issue 19 owns public action IDs)
- `src/modules/registry/operation-entry.ts` → `src/modules/registry/tool-entry.ts` (mechanical Tool path; issue 19 owns public action IDs)
- `tests/imports/operation-surface-conformance.test.ts` → `tests/imports/tool-surface-conformance.test.ts`
- `tests/integration/operation-read-outage-parity.test.ts` → `tests/integration/tool-read-outage-parity.test.ts`
- `tests/unit/server/operation-market-routes.test.ts` → `tests/unit/server/tool-market-routes.test.ts`
- `tests/unit/routes/operation-detail-route.test.tsx` → `tests/unit/routes/tool-detail-route.test.tsx` (route behaviour remains issue 19/24's consumer)

Update, without changing their file names, the finite source callers and
schemas that carry the catalogue vocabulary:

- `src/modules/capability-supply/public.ts`
- `src/modules/capability-supply/convex.ts`
- `src/modules/capability-supply/schema.ts`
- `src/modules/capability-supply/server.ts`
- `src/modules/capability-supply/supply-actions.ts`
- `src/modules/capability-supply/source-authority-review.functions.ts`
- `src/modules/capability-supply/source-first-owner.ts`
- `src/modules/capability-supply/supply-publication-v2.ts`
- `src/modules/capability-supply/internal/convex-schema.ts`
- `src/modules/capability-supply/internal/eligibility/list.ts`
- `src/modules/capability-supply/internal/eligibility/ports.ts`
- `src/modules/capability-supply/internal/eligibility/write.ts`
- `src/modules/capability-supply/internal/graph/ports.ts`
- `src/modules/capability-supply/internal/graph/qualify-candidate.ts`
- `src/modules/capability-supply/internal/graph/read-probe-target.ts`
- `src/modules/capability-supply/internal/graph/record-probe-result.ts`
- `src/modules/capability-supply/internal/binding/registration.ts`
- `src/modules/capability-supply/internal/binding/write.ts`
- `src/modules/capability-supply/internal/readiness-probe-shared.ts`
- `src/modules/capability-supply/internal/readiness-probe.ts`
- `src/modules/capability-supply/internal/publication/lifecycle.ts`
- `src/modules/capability-supply/internal/publication/ports.ts`
- `src/modules/capability-supply/internal/publication/publish.ts`
- `src/modules/capability-supply/internal/publication/refresh.ts`
- `src/modules/capability-supply/internal/publication/source.ts`
- `src/modules/capability-supply/internal/publication/validate.ts`
- `src/modules/capability-supply/internal/admit-provider-schema.ts`
- `src/modules/capability-supply/internal/publication-importer-agent-plugin.ts`
- `src/modules/capability-supply/internal/publication-importer-mcp.ts`
- `src/modules/capability-supply/internal/publication-importer-openapi.ts`
- `src/modules/capability-supply/internal/publication-importer-types.ts`
- `src/modules/capability-supply/internal/publication-importer-x402-bazaar.ts`
- `src/modules/capability-supply/internal/publication-importer-x402.ts`
- `src/modules/capability-supply/internal/publication-importers.ts`
- `src/modules/agent-access/policy.ts` (Tool selection fields and canonical-digest boundary)
- `convex/agentAccessPolicy.ts` (stored policy projection/read/write callers)
- `convex/agentAccessPrincipals.ts` (Agent access grant selection caller)
- `convex/agentAccessOAuth.ts` (OAuth grant selection caller)
- `src/modules/agent-access/agent-access.ts`
- `src/modules/agent-access/agent-access.functions.ts`
- `src/modules/agent-access/agent-access-console.ts`
- `src/modules/agent-access/agent-connection.ts`
- `src/modules/agent-access/consent-read-model.ts`
- `src/modules/agent-access/internal/convex-schema.ts`
- `src/modules/agent-access/internal/oauth-convex-schema.ts`
- `src/modules/agent-access/oauth-state.ts`
- `src/lib/server/agent-access-oauth-store.ts`
- `src/lib/server/agent-access-oauth/protocol.ts`
- `src/modules/actions/contract.ts` (mechanical Tool contract/type propagation; issue 19 owns public action IDs)
- `src/modules/capability-execution/operation-invoke-entry.ts` (mechanical Tool input/reference propagation; issue 16 owns paid Call lifecycle)
- `src/modules/capability-execution/current-operation-commitment.ts` (mechanical Tool snapshot/reference propagation; issue 15 owns Quote digest semantics)
- `src/modules/capability-execution/operation-invoke-admit.ts` (mechanical Tool input/reference propagation; issue 16 owns Call admission semantics)
- `src/modules/module-boundaries.ts` (shared module export/boundary declaration; serialize before issue 14)
- `package.json` (only affected existing test/build/check script paths; no new script or dependency)
- `src/modules/capability-supply/internal/mcp-source-discovery.ts`
- `src/modules/capability-supply/internal/openapi-import/operation.ts`
- `src/modules/capability-supply/internal/openapi-import/document.ts`
- `src/modules/capability-supply/internal/openapi-import/import.ts`
- `src/modules/capability-supply/internal/schema-deref-shared.ts`
- `src/modules/capability-supply/internal/schema-deref.ts`
- `src/modules/capability-supply/operation-health.ts`
- `src/modules/capability-supply/source-preview.ts`
- `src/modules/capability-supply/source-selection-draft.ts`
- `src/modules/capability-supply/integration-draft.ts`
- `src/modules/market/internal/convex-schema.ts`
- `src/modules/market/server.ts`
- `src/modules/market/listing-evidence.ts`
- `src/modules/market/allocation-evidence.ts`
- `src/lib/deployment/manifest.ts`

The following current fixture producers are direct catalogue callers and must
receive the same mechanical Tool type/reference update even though later
issues own their deeper Quote/Call or presentation semantics:

- `tools/dev/fixtures/capability-supply/development-alternate-published-operation-evidence.ts`
- `tools/dev/fixtures/capability-supply/development-published-operation-evidence.ts`

### Direct importers of `capability-supply/public.ts`

The exported public types are a shared contract. Every direct importer below
is part of this mechanical cutover (import/export names and Tool reference
fields), even where a later issue owns its screen copy, public action, Quote,
Call or generic Action semantics. Do not leave typecheck callers on the old
exports or introduce temporary old-name aliases.

- `src/components/ae/command-panel/pages/OperationInspectPage.tsx`
- `src/components/ae/market/market-return-context.ts`
- `src/components/ae/market/operation-detail/AeOperationCompactDecision.tsx`
- `src/components/ae/market/operation-detail/AeOperationContractSections.tsx`
- `src/components/ae/market/operation-detail/AeOperationDecision.tsx`
- `src/components/ae/market/operation-detail/AeOperationEconomics.tsx`
- `src/components/ae/market/operation-detail/AeOperationFacts.tsx`
- `src/components/ae/market/operation-detail/AeOperationIdentity.tsx`
- `src/components/ae/market/operation-detail/AeOperationInspector.tsx`
- `src/components/ae/market/operation-detail/AeOperationPosition.tsx`
- `src/components/ae/market/operation-detail/operation-inspector-model.ts`
- `src/components/ae/supply/AeOwnerProviderConnections.tsx`
- `src/lib/server/agent-access-console.functions.ts`
- `src/lib/server/agent-access-oauth-api.ts`
- `src/lib/server/call-history.functions.ts`
- `src/lib/server/gateway-telemetry.ts`
- `src/lib/server/mcp-api.ts`
- `src/lib/server/operation-invoke-api.ts`
- `src/modules/action-invocation/canonical-claim.ts`
- `src/modules/action-invocation/contracts.ts`
- `src/modules/action-invocation/operation-public.ts`
- `src/modules/action-invocation/reconciliation-evidence.ts`
- `src/modules/action-invocation/x402-payment-attempt.ts`
- `src/modules/actions/index.ts`
- `src/modules/agent-access/account.actions.ts`
- `src/modules/agent-access/agent-access-console.ts`
- `src/modules/agent-access/agent-access.functions.ts`
- `src/modules/agent-access/agent-access.ts`
- `src/modules/agent-access/agent-connection.ts`
- `src/modules/agent-access/consent-read-model.ts`
- `src/modules/agent-access/policy.ts`
- `src/modules/capability-execution/invocation-material.ts`
- `src/modules/capability-execution/invocation-receipt-view.ts`
- `src/modules/capability-execution/invocation-worker/brokeredX402.ts`
- `src/modules/capability-execution/invocation-worker/charge.ts`
- `src/modules/capability-execution/invocation-worker/jitProviderConsequence.ts`
- `src/modules/capability-execution/invocation-worker/lease.ts`
- `src/modules/capability-execution/invocation-worker/providerConsequenceBridge.ts`
- `src/modules/capability-execution/invocation-worker/recovery/loading.ts`
- `src/modules/capability-execution/invocation-worker/runPreparation.ts`
- `src/modules/capability-execution/invocation-worker/runRelease.ts`
- `src/modules/capability-execution/invocation-worker/sellerCanaryReceipt.ts`
- `src/modules/capability-execution/invocation-worker/x402Authorization.ts`
- `src/modules/capability-execution/invocation-worker/x402Route.ts`
- `src/modules/capability-execution/invocation-worker/x402Settlement.ts`
- `src/modules/capability-execution/live-x402-requirement.ts`
- `src/modules/capability-execution/operation-approval.functions.ts`
- `src/modules/capability-execution/operation-commitment.actions.ts`
- `src/modules/capability-execution/operation-commitment.ts`
- `src/modules/capability-execution/operation-invoke-contracts.ts`
- `src/modules/capability-execution/operation-invoke.ts`
- `src/modules/capability-execution/operation-recovery-contracts.ts`
- `src/modules/capability-supply/internal/binding/integrity.ts`
- `src/modules/capability-supply/internal/eligibility/decision.ts`
- `src/modules/capability-supply/internal/eligibility/integrity.ts`
- `src/modules/capability-supply/internal/eligibility/replay.ts`
- `src/modules/capability-supply/internal/graph/quality-gate.ts`
- `src/modules/capability-supply/internal/offering/integrity.ts`
- `src/modules/capability-supply/internal/offering/registration.ts`
- `src/modules/capability-supply/internal/offering/write.ts`
- `src/modules/capability-supply/internal/operation-ledger/commands.ts`
- `src/modules/capability-supply/internal/operation-ledger/replay.ts`
- `src/modules/capability-supply/internal/transport-adapters.ts`
- `src/modules/capability-supply/current-operation.ts` (renamed to the post-13 path above)
- `src/modules/capability-supply/published-operation.ts` (renamed to the post-13 path above)
- `src/modules/capability-supply/supply-publication-v2.ts`
- `src/modules/chat/tool-card.ts`
- `src/modules/common/operation-ref.ts` (only the Tool-reference boundary; opaque prefix remains protected)
- `src/modules/discovery/internal/operation-contract.ts`
- `src/modules/discovery/internal/site-manifest.ts`
- `src/modules/market/allocation-evidence.ts`
- `src/modules/market/server.ts`
- `src/modules/market/suggested-continuation.ts`
- `src/modules/money/formance-workflows.ts`
- `src/modules/money/internal/delivery.ts`
- `src/modules/money/server.ts`
- `src/modules/network-guard/server.ts`
- `src/modules/registry/internal/service-projection.ts`
- `src/modules/registry/internal/services-api-projection.ts`
- `src/modules/registry/operation-choice-contracts.ts`
- `src/modules/registry/operation-detail-route.functions.ts`
- `src/modules/registry/operation-entry.ts`
- `src/modules/registry/operations.actions.ts`
- `src/modules/registry/public.ts`
- `src/modules/registry/registry.actions.ts`
- `src/modules/seo/public-route.ts`
- `src/routes/api.v1.market-operations.compare.ts`
- `src/routes/market.tsx`
- `src/routes/operations.$operationRef.tsx`
- `tests/unit/server/operation-market-routes.test.ts`
- `tests/unit/server/operation-invoke-api.test.ts`
- `tests/fixtures/module-boundaries/src/modules/registry/public.ts`
- `tests/helpers/convex-fixtures.ts`
- `tests/integration/capability-publication-harness.ts`
- `tests/integration/capability-publication-projected-support.test.ts`
- `tests/integration/capability-publication-security.test.ts`
- `tests/integration/capability-supply-owner-funnel-harness.ts`
- `tests/integration/capability-supply-owner-funnel-run-test.test.ts`
- `tests/integration/capability-supply-owner-sandbox-staging.test.ts`
- `tests/integration/capability-supply-registration-harness.ts`
- `tests/integration/capability-supply-registration-quarantine.test.ts`
- `tests/integration/dev-seed-public-catalog-facts.test.ts`
- `tests/integration/discovery-route-parity.test.ts`
- `tests/integration/provider-connection-owner-x402-onboarding.test.ts`
- `tests/unit/action-invocation/operation-public.test.ts`
- `tests/unit/actions/registry.test.ts`
- `tests/unit/agent-access-policy.test.ts`
- `tests/unit/agent-access-production-policy.test.ts`
- `tests/unit/agent-access-sandbox-policy.test.ts`
- `tests/unit/agent-access.test.ts`
- `tests/unit/agent-access-oauth-state.test.ts`
- `convex/agentAccessPolicy.test.ts`
- `convex/agentAccessOAuth.test.ts`
- `convex/agentAccessPrincipals.test.ts`
- `tests/unit/authority/context/consequence-authority.test.ts`
- `tests/unit/capability-execution/current-operation-commitment.test.ts`
- `tests/unit/capability-execution/invocation-receipt-view.test.ts`
- `tests/unit/capability-execution/operation-invoke-authority.test.ts`
- `tests/unit/capability-execution/operation-invoke-harness.ts`
- `tests/unit/capability-execution/operation-receipt-contract.test.ts`
- `tests/unit/capability-execution/seller-onboarding-canary.test.ts`
- `tests/unit/capability-supply/admit-provider-schema.test.ts`
- `tests/unit/capability-supply/binding-helpers.test.ts`
- `tests/unit/capability-supply/capability-supply-contract.test.ts`
- `tests/unit/capability-supply/current-operation-contract.test.ts` (renamed to the post-13 path above)
- `tests/unit/capability-supply/eligible-supply.test.ts`
- `tests/unit/capability-supply/http-credential-readiness.test.ts`
- `tests/unit/capability-supply/offering-helpers.test.ts`
- `tests/unit/capability-supply/openapi-preflight.test.ts`
- `tests/unit/capability-supply/publication-commands-harness.ts`
- `tests/unit/capability-supply/publication-commands-publish.test.ts`
- `tests/unit/capability-supply/publication-commands-refresh.test.ts`
- `tests/unit/capability-supply/publication-importers-harness.ts`
- `tests/unit/capability-supply/publication-importers-mcp.test.ts`
- `tests/unit/capability-supply/publication-importers-openapi.test.ts`
- `tests/unit/capability-supply/publication-importers-x402.test.ts`
- `tests/unit/capability-supply/publication-lifecycle.test.ts`
- `tests/unit/capability-supply/published-operation.test.ts` (renamed to the post-13 path above)
- `tests/unit/capability-supply/supplied-candidate-qualification.test.ts`
- `tests/unit/capability-supply/supplied-candidate-quote-harness.ts`
- `tests/unit/capability-supply/transport-adapter-registry.test.ts`
- `tests/unit/capability-supply/transport-adapters.test.ts`
- `tests/unit/capability-supply/x402-evm-protocol.test.ts`
- `tests/unit/capability-supply/x402-evm-receipt-reader.test.ts`
- `tests/unit/capability-supply/x402-payment-profile.test.ts`
- `tests/unit/capability-supply/x402-seller-claim.test.ts`
- `tests/unit/capability-supply/x402-seller-endpoint-inspector.test.ts`
- `tests/unit/capability-supply/x402-seller-onboarding-lifecycle.test.ts`
- `tests/unit/capability-supply/x402-seller-promotion.test.ts`
- `tests/unit/capability-supply/x402-settlement-verifier.test.ts`
- `tests/unit/catalog/offering-support-derivation.test.ts`
- `tests/unit/command-panel/command-panel.test.tsx`
- `tests/unit/convex/capability-operation-approval.test.ts`
- `tests/unit/convex/capability-operation-recovery.test.ts`
- `tests/unit/convex/capability-operation-worker-harness.ts`
- `tests/unit/convex/provider-connection-agent-lifecycle.test.ts`
- `tests/unit/convex/seller-onboarding-canary-funding-readiness.test.ts`
- `tests/unit/market-terminal/cold-loop.test.ts`
- `tests/unit/market-terminal/compare.test.ts`
- `tests/unit/market/compare-tray.test.tsx`
- `tests/unit/registry/services-api-projection.test.ts`
- `tests/unit/release/operation-gateway-production-smoke-harness.ts`
- `tests/unit/routes/agent-access-console.test.ts`
- `tests/unit/routes/operation-detail-route.test.tsx`
- `tests/unit/schema/convex-schema.test.ts`
- `tools/ae/commands/compare.ts`
- `tools/ae/lib/operation-format.ts`
- `tools/dev/fixtures/capability-supply/development-evidence-fixture.ts`
- `tools/release/operation-gateway-production-smoke-discovery.ts`
- `tools/release/operation-gateway-production-smoke-hosted-owner.ts`
- `tools/release/operation-gateway-production-smoke-invocation.ts`

The corresponding direct importers of the renamed Tool path modules are also
in this mechanical allowlist:

- `src/components/ae/command-panel/CommandPanelProvider.tsx`
- `src/components/ae/command-panel/market-operations-client.ts`
- `src/components/ae/market/AeMarketComparisonView.tsx`
- `src/modules/discovery/internal/offering-discovery-file.ts`
- `src/modules/discovery/internal/page-markdown.ts`
- `src/modules/discovery/internal/site-manifest.ts`
- `src/modules/market-demand/market-demand.actions.ts`
- `src/routes/api.v1.market-operations.compare.ts`
- `src/routes/api.v1.market-operations.describe.ts`
- `src/routes/api.v1.market-operations.list.ts`
- `src/routes/api.v1.market-operations.search.ts`
- `tests/imports/operation-surface-conformance.test.ts`
- `tests/integration/operation-read-outage-parity.test.ts`
- `tests/unit/market-demand/market-demand-actions.test.ts`
- `tests/unit/market-terminal/manifest-oauth.test.ts`
- `tests/unit/server/mcp-api-registry.test.ts`
- `tools/ae/commands/describe.ts`
- `tools/ae/commands/list.ts`
- `tools/ae/commands/doctor.ts`
- `tools/ae/commands/search.ts`
- `tools/ae/commands/manifest.ts`
- `tools/release/package5-provider-operations.ts` (mechanical import path only;
  preserve the dated fixture's historical vocabulary as issue 28 requires)

### Tool-selection policy callers

The policy selection crossing has additional direct callers beyond the public
type imports above. Update these exact paths mechanically with
`toolAccess`/`toolRefs`/`selected_tools`; later issues retain ownership of their
authorization, Call, UI or release semantics:

- `src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx`
- `src/components/ae/console/AeAgentOperatorConsole.tsx`
- `src/components/ae/market/AeCompareTray.tsx`
- `src/components/ae/market/AeMarketPage.tsx`
- `src/components/ae/operation-chat/OperationCard.tsx`
- `src/routes/_operator/agent-access.authorize.tsx`
- `convex/capabilitySupplyCanaryFunding.ts`
- `convex/capabilitySupplyOwnerCanary.ts`
- `convex/capabilitySupplyProbes.ts`
- `convex/catalogOfferingMutations.ts`
- `convex/chatShares.ts`
- `convex/lib/operationInvocations/admission.ts`
- `convex/lib/operationInvocations/authorityHandlers.ts`
- `convex/lib/operationInvocations/invokeActions.ts`
- `src/modules/registry/operation-action-contracts.ts`
- `tests/integration/chat-durable-messaging-share.test.ts`
- `tests/unit/agent-access-oauth-state.test.ts`
- `tests/unit/agent-access-policy.test.ts`
- `tests/unit/agent-access-production-policy.test.ts`
- `tests/unit/agent-access-sandbox-policy.test.ts`
- `tests/unit/agent-access.test.ts`
- `tests/unit/authority/context/consequence-authority.test.ts`
- `tests/unit/capability-supply/operation-projection-public.test.ts`
- `tests/unit/capability-supply/operation-projection-search.test.ts`
- `tests/unit/chat/operation-chat-agent-tools.test.ts`
- `tests/unit/command-panel/command-panel.test.tsx`
- `tests/unit/convex/authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-approval.test.ts`
- `tests/unit/convex/capability-operation-authority-boundary.test.ts`
- `tests/unit/convex/capability-operation-reservation.test.ts`
- `tests/unit/convex/capability-supply-readiness-authority.test.ts`
- `tests/unit/convex/market-demand-signals.test.ts`
- `tests/unit/convex/money-account-funding.test.ts`
- `tests/unit/convex/provider-connection-agent-lifecycle.test.ts`
- `tests/unit/market-terminal/cold-loop.test.ts`
- `tests/unit/market-terminal/compare.test.ts`
- `tests/unit/market/compare-tray.test.tsx`
- `tests/unit/market/market-page.test.tsx`
- `tests/unit/routes/agent-access-authorize.test.tsx`
- `tests/unit/routes/agent-access-caller-continuation.test.tsx`
- `tests/unit/routes/agent-access-console.test.ts`
- `tests/unit/server/mcp-api-tools-list.test.ts`
- `tests/unit/ui/agent-access-owner-console.test.tsx`
- `tests/unit/ui/demand-console.test.tsx`

### Convex source and physical schema

- `convex/capabilitySupplierOperationProjection.ts` → `convex/capabilityProviderToolProjection.ts`
- `convex/capabilitySupplierOperations.ts` → `convex/capabilityProviderTools.ts` (Tool-facing entry points are updated here; issue 14 consumes this renamed file for its Provider vocabulary in sequence.)
- `convex/capabilitySupplyOperationQueries.ts` → `convex/capabilitySupplyToolQueries.ts`
- `convex/capabilitySupplyOperationShared.ts` → `convex/capabilitySupplyToolShared.ts`
- `convex/capabilitySupplyOperations.ts` → `convex/capabilitySupplyTools.ts`
- `convex/capabilitySupplyCurrentOperation.ts` → `convex/capabilitySupplyCurrentTool.ts`
- `convex/capabilitySupplyOperationOriginMap.ts` → `convex/capabilitySupplyToolOriginMap.ts`
- `convex/capabilitySupplyOperationPorts.ts` → `convex/capabilitySupplyToolPorts.ts`
- `convex/capabilitySupplyProjection.ts`
- `convex/capabilitySupplyRowMappers.ts`
- `convex/capabilitySupplyLists.ts`
- `convex/capabilitySupplyPublish.ts`
- `convex/capabilitySupplyCommands.ts`
- `convex/capabilitySupplyIntegrationDrafts.ts`
- `convex/capabilitySupplyEligiblePorts.ts`
- `convex/capabilitySupplyGraphPorts.ts`
- `convex/capabilitySupplyGraph.ts`
- `convex/capabilitySupplyShared.ts`
- `convex/capabilitySupplyValues.ts`
- `convex/capabilitySupplyWriterPorts.ts`
- `convex/capabilitySupplyProbes.ts`
- `convex/capabilitySupplyReadiness.ts`
- `convex/capabilitySupplyOwnerFunnelProjection.ts`
- `convex/capabilitySupplyOwnerFunnelProjection/contracts.ts`
- `convex/capabilitySupplyOwnerFunnelProjection/offering_projection.ts`
- `convex/capabilitySupplyOwnerFunnelCommands.ts`
- `convex/capabilitySupplyOwnerStaging.ts`
- `convex/capabilitySupplyOwnerSupply.ts`
- `convex/marketPresence.ts`
- `convex/marketListingEvidence.ts`
- `convex/convex.config.ts`
- `convex/schema.ts`

`convex/schema.ts`, `convex/marketPresence.ts`,
`src/modules/capability-supply/internal/convex-schema.ts` and
`src/modules/market/internal/convex-schema.ts` are shared schema writers. This
ticket owns the Tool-side entries and the six exact Tool table mappings above;
the `marketActiveSuppliers` → `marketActiveProviders` and Provider fields are
an explicitly serialized issue 14 follow-up. Do not let either worker claim an
independent schema green state.

### Known caller and test propagation

Update or rename these tests together with the source contract. The test
filename mappings are fixed where shown; the other files remain at their path.

- `tests/unit/capability-supply/operation-projection-public.test.ts` → `tests/unit/capability-supply/tool-projection-public.test.ts`
- `tests/unit/capability-supply/operation-projection-search.test.ts` → `tests/unit/capability-supply/tool-projection-search.test.ts`
- `tests/unit/capability-supply/current-operation-contract.test.ts` → `tests/unit/capability-supply/current-tool-contract.test.ts`
- `tests/unit/capability-supply/published-operation.test.ts` → `tests/unit/capability-supply/published-tool.test.ts`
- `tests/unit/capability-supply/published-operation-foundation-boundary.test.ts` → `tests/unit/capability-supply/published-tool-foundation-boundary.test.ts`
- `tests/unit/capability-supply/no-operation-navigation.test.ts` → `tests/unit/capability-supply/no-tool-navigation.test.ts`
- `tests/unit/capability-supply/operation-ledger.test.ts` → `tests/unit/capability-supply/tool-ledger.test.ts`
- `tests/unit/capability-supply/operation-ledger-thinness.test.ts` → `tests/unit/capability-supply/tool-ledger-thinness.test.ts`
- `tests/unit/market/operation-view-model.test.ts` → `tests/unit/market/tool-view-model.test.ts`
- `tests/integration/canonical-operation-reads.test.ts` → `tests/integration/canonical-tool-reads.test.ts`
- `tests/integration/current-operation-snapshot-stability.test.ts` → `tests/integration/current-tool-snapshot-stability.test.ts`
- `tests/helpers/convex-fixtures.ts`
- `tests/unit/capability-supply/eligible-supply.test.ts`
- `tests/unit/capability-supply/operation-projection-search.test.ts`
- `tests/unit/capability-supply/supply-actions.test.ts`
- `tests/unit/capability-supply/supply-writers.test.ts`
- `tests/unit/capability-supply/operation-projection-public.test.ts`
- `tests/unit/capability-supply/published-operation.test.ts`
- `tests/unit/capability-supply/current-operation-contract.test.ts`
- `tests/unit/market/market-listing-evidence.test.ts`
- `tests/unit/market/market-comparison-view.test.tsx`
- `tests/unit/market/compare-tray.test.tsx`
- `tests/unit/market/market-page.test.tsx`
- `tests/unit/market/suggested-continuation.test.ts`
- `tests/integration/capability-supply-integration-draft.test.ts`
- `tests/integration/discovery-route-parity.test.ts`
- `tests/integration/capability-publication-owner.test.ts`
- `tests/integration/capability-publication-publish.test.ts`
- `tests/unit/schema/convex-schema.test.ts`
- `convex/marketListingEvidence.test.ts`

The repeated paths above identify current callers that must be edited in the
same cutover; they are not permission to skip any listed test after a filename
rename. Issue 14 owns Provider-connection/publication lifecycle tests that
also import these Tool types and must consume the renamed exports in order.

## Protected boundaries and explicit exclusions

- Keep `Service`, `Offering`, `Publication`, `Listing` and `Source` as distinct
  records. Rename an AE-owned callable reference field inside one of them to
  `toolRef` when it is a Tool reference; do not blanket-exclude such fields and
  do not turn any record into a Tool.
- Keep the external registry separate. Do not edit
  `src/routes/api.v1.registry.ts`, `convex/marketExternalRegistry.ts`,
  `convex/lib/marketExternalRegistry/contracts.ts`,
  `convex/lib/marketExternalRegistry/validation.ts`,
  `tests/unit/market/external-registry-authority.test.ts`, or
  `tests/integration/registry-api.test.ts` except to retain boundary tests.
  `/api/v1/registry`, `marketExternalRegistry`, `registrySearchDocuments` and
  `api-registry:v1` remain unchanged; no canonical-market merge is allowed.
- Keep upstream OpenAPI `operationId`, MCP methods, OAuth fields, x402 fields,
  external financial namespaces, opaque identifier prefixes, signatures and
  canonical hash material byte-for-byte stable. Use existing codecs only.
- `src/modules/agent-access/policy.ts` and `convex/agentAccessPolicy.ts` own
  the `agentAccessPolicyDigest`/stored-grant digest. Rename source selection
  fields to `toolAccess`/`toolRefs` and `selected_tools`, but adapt the
  existing canonical-digest input back to the old canonical keys/values where
  required so existing policy digest bytes and vectors stay stable. Issue 12
  owns permission-mode names and semantics; this ticket owns only the Tool
  selection field crossing and its explicit handoff. Do not add an alias or a
  generic compatibility codec.
- `src/lib/server/operation-invoke-api.ts:81-126` hashes the whole protected
  command via `operationKeyFor`, including the inspect command's
  `operationRef`. The new source `toolRef` must be projected back to the
  existing canonical `operationRef` key/value before that digest; do not hash
  a renamed JSON key. `input.input` is the opaque Tool/Provider argument
  payload: do not recursively rename keys or values inside it, even when they
  happen to contain `operationRef`, `requestMandate` or another old term.
  `operationKeyFor` also includes `contract: OPERATION_INVOKE_ACTION_ID`; when
  issue 19 changes the public action ID from `operation.invoke` to
  `tool.call`, its protected hash projection must retain the old
  `operation.invoke` literal. Preserve the existing operation-key vector and
  add/keep the opaque-payload assertion in
  `tests/unit/server/operation-invoke-api.test.ts` while updating the typed
  caller. The Quote/Call envelope slices at lines 90–122 and 213–242 are
  serialized to issues 15/16 for their respective protected keys; only those
  schema-owned envelope keys are eligible for projection.
- `SuppliedQuote` remains a qualified supply concept and is not merged into a
  customer Quote by this ticket.
- Do not edit `convex/_generated/api.d.ts`, `convex/_generated/api.js`,
  `convex/_generated/dataModel.d.ts` or `src/routeTree.gen.ts`. Issue 22 runs
  the maintained generators after this source/schema checkpoint and again at
  final integration; it must record both checkpoints.
- Do not rename generic IAM tables, portfolio records, financial tables,
  Convex component internals or `src/modules/action-invocation/*` here.
- Public routes/action IDs, CLI/discovery/plugin output, UI copy, money and
  durable Call records, deployment state, new dependencies, migration or
  compatibility engines and test-data resets are owned by later tickets.

## Dependencies and sequencing

- Do not dispatch until baseline 08, reviews 29 and 30, and core identity,
  generic Action execution and authorization issues 10, 11 and 12 are closed.
- This ticket is the first shared Tool/Provider source-schema writer. Issue 14
  is blocked by this ticket; issue 15 is blocked by 14; issue 16 is blocked by
  15. Issues 17–22 consume this vocabulary. Shared schema, module-boundary and
  action-registry writes are serialized; issue 22 receives the intermediate
  generated-output checkpoint after physical table/function names, not only a
  final regeneration request.
- Issue 18 owns remaining money/durable operation-bearing audit/journal records,
  including `sellerOnboardingCanaryRearmAudits` and
  `providerConsequenceJournal`; this ticket hands their Tool-reference fields
  off without claiming their ownership.

## Verification commands and expected results

Run with Node `22.x` and npm `11.5.1`, using existing tooling only:

```sh
npm exec vitest run \
  tests/unit/capability-supply/tool-projection-public.test.ts \
  tests/unit/capability-supply/tool-projection-search.test.ts \
  tests/unit/capability-supply/current-tool-contract.test.ts \
  tests/unit/capability-supply/eligible-supply.test.ts \
  tests/unit/capability-supply/tool-ledger.test.ts \
  tests/unit/market/tool-view-model.test.ts \
  tests/unit/schema/convex-schema.test.ts \
  tests/integration/canonical-tool-reads.test.ts \
  tests/integration/current-tool-snapshot-stability.test.ts \
  tests/integration/discovery-route-parity.test.ts \
  tests/unit/server/operation-invoke-api.test.ts
npm run typecheck
```

Expected: every named Tool projection, search, comparison, schema, market
read, admission/publication and boundary test passes; typecheck passes. The
operation-invoke API hash test proves that only schema-owned Tool envelope
fields are projected to their protected canonical keys, while nested
`input.input` remains byte-for-byte opaque and the existing `operation.invoke`
contract literal/vector remains stable for issue 19's later action-ID cutover.
Any 26 pre-existing `test:ts-standards` findings remain separately recorded and
are not fixed or reclassified by this ticket. Issue 22 subsequently verifies
generated output with `npm run check:convex-codegen`; no generated file is
hand-edited here.

## Acceptance

- [ ] All literal source, schema, export, caller and test paths above use Tool
      terminology consistently, with no definition-only half.
- [ ] The six Tool-side physical table mappings and their indexes/readers/
      writers/fixtures round-trip through the existing Convex schema patterns;
      the shared Provider mapping is explicitly handed to issue 14.
- [ ] Tool version/revision, admission, publication, search, compare, readiness
      and eligibility behaviour is unchanged.
- [ ] Offering, Publication, Listing, Source, portfolio Service and qualified
      `SuppliedQuote` concepts remain distinct, while their AE-owned Tool
      reference fields are correctly renamed.
- [ ] External registry routes/data/`api-registry:v1` and upstream protocol
      values remain unchanged; issue 19 receives the exact public cutover
      dependency.
- [ ] AE-owned Tool selection fields are `toolAccess`/`toolRefs` and
      `selected_tools`; the existing agent-access policy digest maps renamed
      source fields to the old canonical digest keys/values and all existing
      vectors remain stable. Issue 12's permission-mode ownership is respected.
- [ ] Existing generators are queued for the issue 22 table/function-name
      checkpoint; no alias, compatibility layer, migration engine, dependency,
      deployment or broad test reset is added.

## Closure evidence

Attach the reviewable patch and focused test/typecheck output, the final
old→new file/table/token list, and a short handoff naming the shared schema
writer checkpoint for issue 14 and generated checkpoint for issue 22. Record
the agent-access policy digest/vector comparison and its issue 12 handoff. Record
any source occurrence that cannot be classified without a new semantic choice
for the coordinator; do not invent a replacement term.

## Coordinator decision: Tool web routes and link propagation

Issue 13 owns these exact web route moves in the same patch as Tool fields;
issue 24 is the later presentation pass, not a second route-naming decision:

- `src/routes/operations.$operationRef.tsx` → `src/routes/tools.$toolRef.tsx`
- `src/routes/operations.tsx` → `src/routes/tools.tsx`
- `tests/unit/routes/operation-detail-route.test.tsx` → `tests/unit/routes/tool-detail-route.test.tsx`
- `tests/unit/routes/operations-index-redirect.test.ts` → `tests/unit/routes/tools-index-redirect.test.ts`

The detail path is `/tools/$toolRef`; update its route parameter to `toolRef`.
The index remains a redirect, now at `/tools`, to the same `/market` destination
with `window: '30d'` and the renamed `#tools` section anchor. Rename the actual
market section ID and its links together. Do not add an old route alias, a new
catalogue page, or a new Calls index. Issue 16 owns the separate Call detail
path `/calls/$callRef`; do not change that slice in this issue.

The finite additional mechanical-link/import allowlist is:

- `src/components/ae/agent-access/AeAgentAccessAuthorizeForm.tsx`
- `src/components/ae/command-panel/CommandPanelProvider.tsx`
- `src/components/ae/command-panel/pages/OperationInspectPage.tsx`
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
- `src/modules/capability-execution/operation-invoke-entry.ts`
- `src/modules/market/suggested-continuation.ts`
- `src/routes/_operator/activity.tsx`
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
- `tests/unit/ui/agent-access-owner-console.test.tsx`
- `tests/unit/ui/owner-operations-workspace.test.tsx`
- `tools/release/operation-gateway-production-smoke-invocation.ts`

Update only the Tool URL/parameter/section/import slice in shared files; their
Call, public API action and later presentation slices keep their named owners.
Use issue 22's serialized route generator before the accepting typecheck.
Add this exact focused check to the existing acceptance commands:

`NODE_VERSION=22 "$HOME/.nvm/nvm-exec" npx vitest run tests/unit/routes/tool-detail-route.test.tsx tests/unit/routes/tools-index-redirect.test.ts tests/unit/market/market-return-context.test.ts tests/unit/market/market-page.test.tsx tests/unit/command-panel/command-panel.test.tsx tests/unit/layout/public-shell-command-panel.test.tsx --no-file-parallelism`

Expected: existing detail/refusal, redirect/search/hash, market-return and
command-panel behavior passes under the new URLs; no old web route alias.

/**
 * Target runtime dependency direction (arrows point toward dependencies):
 *
 * adapters/actions -> registry | capability-execution | capability-supply
 * registry -> catalog | capability-supply
 * capability-execution -> capability-supply | action-invocation | money | agent-access
 * capability-supply -> capability-contract | business | security
 * action-invocation -> money | capability-contract
 * all lower layers -> dependency-free common (and guarded I/O -> network-guard)
 */

export type ModuleName =
  | 'action-invocation'
  | 'actions'
  | 'agent-access'
  | 'business'
  | 'capability-contract'
  | 'capability-contract-registry'
  | 'capability-execution'
  | 'capability-supply'
  | 'catalog'
  | 'chat'
  | 'common'
  | 'dev'
  | 'discovery'
  | 'market'
  | 'model-gateway'
  | 'money'
  | 'network-guard'
  | 'observability'
  | 'registry'
  | 'security'
  | 'seo'
  | 'storefront'

export type RuntimeImporter = ModuleName | 'adapter' | 'convex'

export type RemovalTask = 'T3' | 'T4' | 'T5' | 'T6' | 'T7'

export type ModuleDeclaration = Readonly<{
  name: ModuleName
  entrySurfaces: readonly string[]
  allowedDependencies: readonly ModuleName[]
}>

export type RuntimeBoundaryException = Readonly<{
  id: string
  from: RuntimeImporter
  to: ModuleName
  importer: string
  entry: string
  owner: string
  removalTask: RemovalTask
}>

export type TestBoundaryException = Readonly<{
  id: string
  importers: readonly string[]
  to: ModuleName
  entry: string
  owner: string
}>

export type ModuleBoundaryManifest = Readonly<{
  modules: readonly ModuleDeclaration[]
  temporaryRuntimeExceptions: readonly RuntimeBoundaryException[]
  testOnlyWhiteBoxExceptions: readonly TestBoundaryException[]
}>

export const MODULE_BOUNDARY_MANIFEST: ModuleBoundaryManifest = {
  modules: [
    { name: 'common', entrySurfaces: ['action.ts', 'audit-events.ts', 'base64-codec.ts', 'bounded-json.ts', 'canonical-digest.ts', 'convex-literals.ts', 'deep-freeze.ts', 'ed25519-attestation.ts', 'forbidden-signature-key.ts', 'ids.ts', 'is-record.ts', 'json-pointer.ts', 'matching-csrf.ts', 'normalize-search-text.ts', 'normalize-slug.ts', 'random-id.ts', 'runtime-id.ts', 'same-string-list.ts', 'sanitize-text.ts', 'stable-hash.ts', 'trim-trailing-slashes.ts', 'unique-sorted.ts'], allowedDependencies: [] },
    { name: 'network-guard', entrySurfaces: ['public.ts', 'server.ts'], allowedDependencies: ['common'] },
    { name: 'capability-contract', entrySurfaces: ['public.ts'], allowedDependencies: ['common'] },
    { name: 'business', entrySurfaces: ['public.ts'], allowedDependencies: ['common'] },
    { name: 'security', entrySurfaces: ['public.ts', 'source-write-admission.ts', 'admin-readback.functions.ts', 'removal-dispute.functions.ts'], allowedDependencies: ['common', 'business', 'capability-contract'] },
    { name: 'capability-contract-registry', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'capability-contract'] },
    { name: 'agent-access', entrySurfaces: ['public.ts', 'contract.ts', 'agent-access.ts', 'agent-access.functions.ts', 'policy.ts', 'policy.functions.ts', 'production-policy.ts', 'sandbox-policy.ts', 'service-auth-envelope.ts', 'agent-access-console.ts', 'agent-operator-view-model.ts', 'oauth-state.ts'], allowedDependencies: ['common', 'capability-contract', 'security', 'money'] },
    { name: 'money', entrySurfaces: ['public.ts', 'server.ts'], allowedDependencies: ['common', 'security'] },
    { name: 'observability', entrySurfaces: ['public.ts', 'funnel.functions.ts'], allowedDependencies: ['common', 'business'] },
    { name: 'action-invocation', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'capability-contract', 'money', 'security', 'network-guard', 'observability'] },
    { name: 'capability-supply', entrySurfaces: ['public.ts', 'server.ts', 'convex.ts', 'current-operation.ts', 'operation-projection.ts', 'operation-schemas.ts', 'operation-source.ts', 'provider-approval.ts', 'provider-connection.ts', 'published-operation.ts', 'route-transport-runtime.ts', 'supplied-quote.actions.ts', 'supplied-quote.ts', 'supply-actions.ts', 'supply-funnel.functions.ts', 'owner-supply-validators.ts'], allowedDependencies: ['common', 'network-guard', 'capability-contract', 'capability-contract-registry', 'business', 'security', 'agent-access', 'money', 'observability'] },
    { name: 'catalog', entrySurfaces: ['public.ts', 'convex.ts', 'owner-status.functions.ts', 'public-route.functions.ts', 'schema-values.ts'], allowedDependencies: ['common', 'business', 'money'] },
    { name: 'capability-execution', entrySurfaces: ['index.ts', 'convex.ts', 'invocation-receipt-view.ts', 'operation-approval.functions.ts', 'operation-execute-contract.ts', 'operation-execute-mcp.actions.ts', 'operation-execute.actions.ts', 'operation-execute.functions.ts', 'operation-execute.server.ts', 'operation-invoke-entry.ts', 'operation-invoke-contracts.ts', 'operation-invoke.actions.ts', 'operation-invoke.ts', 'operation-recovery-contracts.ts', 'operation-recovery.actions.ts', 'operation-recovery.functions.ts'], allowedDependencies: ['common', 'network-guard', 'capability-contract', 'business', 'security', 'agent-access', 'money', 'observability', 'action-invocation', 'capability-supply'] },
    { name: 'registry', entrySurfaces: ['public.ts', 'operation-entry.ts', 'operation-paths.ts', 'operation-action-contracts.ts', 'operation-choice-contracts.ts', 'registry.actions.ts', 'operations.actions.ts', 'registry.functions.ts', 'operation-detail-route.functions.ts'], allowedDependencies: ['common', 'capability-contract', 'business', 'catalog', 'capability-supply', 'money', 'observability'] },
    { name: 'market', entrySurfaces: ['server.ts', 'contracts.ts', 'agentic-market-source.ts', 'home-catalogue.ts', 'listing-evidence.ts', 'market.functions.ts', 'operation-view-model.ts', 'registry-graduation.ts', 'registry-source-adapters.ts', 'registry-source-contracts.ts'], allowedDependencies: ['common', 'capability-contract', 'business', 'capability-supply', 'money', 'observability'] },
    { name: 'actions', entrySurfaces: ['index.ts', 'contract.ts', 'strict-schema.ts'], allowedDependencies: ['common', 'registry', 'capability-execution', 'capability-supply', 'agent-access', 'security'] },
    { name: 'discovery', entrySurfaces: ['public.ts', 'convex.ts', 'discovery.functions.ts', 'developer-discovery.ts', 'developer-discovery-route.ts'], allowedDependencies: ['common', 'business', 'capability-contract', 'catalog', 'registry', 'capability-supply', 'capability-execution', 'agent-access', 'money', 'actions', 'market', 'observability'] },
    { name: 'seo', entrySurfaces: ['public.ts', 'public-route.ts'], allowedDependencies: ['common', 'business', 'catalog', 'registry'] },
    { name: 'storefront', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'network-guard', 'business', 'catalog', 'registry', 'model-gateway'] },
    { name: 'chat', entrySurfaces: ['share-token.ts'], allowedDependencies: ['common', 'actions', 'registry', 'capability-execution'] },
    { name: 'model-gateway', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'actions'] },
    { name: 'dev', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'business', 'catalog', 'registry', 'capability-supply', 'capability-execution', 'actions'] },
  ],
  temporaryRuntimeExceptions: [
    { id: 'T5-kernel-supply-01', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-adapter-commands.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-02', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-adapter-snapshot.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-03', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-adapter-transact.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-04', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-adapter-transact.ts', entry: 'route-transport-runtime.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-05', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-adapter.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-06', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-adapter.ts', entry: 'route-transport-runtime.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-07', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-contract.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-08', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-execution.ts', entry: 'route-transport-runtime.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-09', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-execution.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-10', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-snapshot-verifier.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-11', from: 'action-invocation', to: 'capability-supply', importer: 'dynamic-published-source.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-12', from: 'action-invocation', to: 'capability-supply', importer: 'host-projection.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-13', from: 'action-invocation', to: 'capability-supply', importer: 'input-application.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-14', from: 'action-invocation', to: 'capability-supply', importer: 'input-work.ts', entry: 'public.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-kernel-supply-15', from: 'action-invocation', to: 'capability-supply', importer: 'x402-payment-attempt.ts', entry: 'route-transport-runtime.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T6-access-supply-01', from: 'agent-access', to: 'capability-supply', importer: 'agent-access-console.ts', entry: 'operation-source.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-access-supply-02', from: 'agent-access', to: 'capability-supply', importer: 'agent-access-console.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T5-execution-kernel-01', from: 'capability-execution', to: 'action-invocation', importer: 'internal/convex-schema.ts', entry: 'canonical-claim.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-02', from: 'capability-execution', to: 'action-invocation', importer: 'invocation-worker/brokeredX402.ts', entry: 'index.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-03', from: 'capability-execution', to: 'action-invocation', importer: 'invocation-worker/charge.ts', entry: 'index.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-04', from: 'capability-execution', to: 'action-invocation', importer: 'invocation-worker/recover.ts', entry: 'dynamic-published-contract.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-05', from: 'capability-execution', to: 'action-invocation', importer: 'invocation-worker/recover.ts', entry: 'index.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-06', from: 'capability-execution', to: 'action-invocation', importer: 'invocation-worker/runPreparation.ts', entry: 'index.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-07', from: 'capability-execution', to: 'action-invocation', importer: 'invocation-worker/runRelease.ts', entry: 'index.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-08', from: 'capability-execution', to: 'action-invocation', importer: 'operation-invoke-admit.ts', entry: 'contracts.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-09', from: 'capability-execution', to: 'action-invocation', importer: 'operation-invoke.ts', entry: 'contracts.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-10', from: 'capability-execution', to: 'action-invocation', importer: 'operation-invoke.ts', entry: 'dynamic-published-contract.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-11', from: 'capability-execution', to: 'action-invocation', importer: 'operation-invoke.ts', entry: 'dynamic-published-adapter.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-12', from: 'capability-execution', to: 'action-invocation', importer: 'operation-invoke.ts', entry: 'application-service.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-execution-kernel-13', from: 'capability-execution', to: 'action-invocation', importer: 'operation-recovery.actions.ts', entry: 'reconciliation-evidence.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T6-supply-catalog-01', from: 'capability-supply', to: 'catalog', importer: 'internal/graph/ports.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T4-supply-registry-01', from: 'capability-supply', to: 'registry', importer: 'internal/operation-project.ts', entry: 'operation-entry.ts', owner: 'operation-read-model', removalTask: 'T4' },
    { id: 'T5-supply-execution-01', from: 'capability-supply', to: 'capability-execution', importer: 'internal/operation-project.ts', entry: 'operation-invoke-entry.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-supply-execution-02', from: 'capability-supply', to: 'capability-execution', importer: 'internal/operation-projection-types.ts', entry: 'operation-invoke-entry.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T6-supply-actions-01', from: 'capability-supply', to: 'actions', importer: 'internal/supply-funnel/landing.ts', entry: 'index.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-supply-registry-01', from: 'capability-supply', to: 'registry', importer: 'internal/supply-funnel/landing.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-supply-registry-02', from: 'capability-supply', to: 'registry', importer: 'internal/supply-funnel/landing.ts', entry: 'registry.actions.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-supply-catalog-02', from: 'capability-supply', to: 'catalog', importer: 'internal/supply-funnel/types.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T5-supply-execution-03', from: 'capability-supply', to: 'capability-execution', importer: 'operation-schemas.ts', entry: 'operation-invoke-entry.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-supply-kernel-01', from: 'capability-supply', to: 'action-invocation', importer: 'supplied-quote.ts', entry: 'index.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T6-catalog-discovery-01', from: 'catalog', to: 'discovery', importer: 'internal/catalog-model.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-catalog-registry-01', from: 'catalog', to: 'registry', importer: 'internal/catalog-model.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-catalog-registry-02', from: 'catalog', to: 'registry', importer: 'internal/owner-status.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-catalog-registry-03', from: 'catalog', to: 'registry', importer: 'owner-status.functions.ts', entry: 'registry.functions.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-catalog-registry-04', from: 'catalog', to: 'registry', importer: 'owner-status.functions.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-catalog-registry-05', from: 'catalog', to: 'registry', importer: 'public-route.functions.ts', entry: 'registry.functions.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-catalog-seo-01', from: 'catalog', to: 'seo', importer: 'public-route.functions.ts', entry: 'public-route.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-catalog-seo-02', from: 'catalog', to: 'seo', importer: 'public-route.functions.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-catalog-registry-06', from: 'catalog', to: 'registry', importer: 'public.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-common-contract-01', from: 'common', to: 'capability-contract', importer: 'bounded-json.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-common-contract-02', from: 'common', to: 'capability-contract', importer: 'canonical-digest.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-common-security-01', from: 'common', to: 'security', importer: 'matching-csrf.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-money-supply-01', from: 'money', to: 'capability-supply', importer: 'internal/payout-http-runtime.ts', entry: 'supply-funnel.functions.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-security-registry-01', from: 'security', to: 'registry', importer: 'removal-dispute.functions.ts', entry: 'public.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T7-adapter-paid-semantics-01', from: 'adapter', to: 'action-invocation', importer: 'src/components/ae/action-invocation/AePaidOperationCard.tsx', entry: 'paid-operation-semantics.ts', owner: 'compatibility-cleanup', removalTask: 'T7' },
    { id: 'T6-adapter-action-tool-01', from: 'adapter', to: 'actions', importer: 'src/components/ae/operation-chat/presentation.ts', entry: 'tool-contract.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T5-convex-kernel-01', from: 'convex', to: 'action-invocation', importer: 'convex/capabilityOperationInvocationProjection.ts', entry: 'index.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-convex-kernel-02', from: 'convex', to: 'action-invocation', importer: 'convex/capabilityOperationInvocationProjection.ts', entry: 'dynamic-published-contract.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-convex-worker-01', from: 'convex', to: 'capability-execution', importer: 'convex/capabilityOperationInvocationWorker.ts', entry: 'invocation-worker/charge.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-convex-worker-02', from: 'convex', to: 'capability-execution', importer: 'convex/capabilityOperationInvocationWorker.ts', entry: 'invocation-worker/runPreparation.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-convex-worker-03', from: 'convex', to: 'capability-execution', importer: 'convex/capabilityOperationInvocationWorker.ts', entry: 'invocation-worker/runRelease.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-convex-worker-04', from: 'convex', to: 'capability-execution', importer: 'convex/capabilityOperationInvocationWorker.ts', entry: 'invocation-worker/recover.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T6-convex-action-tool-01', from: 'convex', to: 'actions', importer: 'convex/chatTools.ts', entry: 'tool-contract.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-convex-schema-business-01', from: 'convex', to: 'business', importer: 'convex/schema.ts', entry: 'internal/schema.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-convex-schema-catalog-01', from: 'convex', to: 'catalog', importer: 'convex/schema.ts', entry: 'internal/schema.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-convex-schema-contract-registry-01', from: 'convex', to: 'capability-contract-registry', importer: 'convex/schema.ts', entry: 'internal/convex-schema.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T4-convex-schema-supply-01', from: 'convex', to: 'capability-supply', importer: 'convex/schema.ts', entry: 'internal/convex-schema.ts', owner: 'operation-read-model', removalTask: 'T4' },
    { id: 'T5-convex-schema-kernel-01', from: 'convex', to: 'action-invocation', importer: 'convex/schema.ts', entry: 'internal/convex-schema.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T5-convex-schema-execution-01', from: 'convex', to: 'capability-execution', importer: 'convex/schema.ts', entry: 'internal/convex-schema.ts', owner: 'call-lifecycle', removalTask: 'T5' },
    { id: 'T6-convex-schema-observability-01', from: 'convex', to: 'observability', importer: 'convex/schema.ts', entry: 'internal/schema.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-convex-schema-registry-01', from: 'convex', to: 'registry', importer: 'convex/schema.ts', entry: 'internal/schema.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-convex-schema-security-01', from: 'convex', to: 'security', importer: 'convex/schema.ts', entry: 'internal/schema.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-convex-schema-money-01', from: 'convex', to: 'money', importer: 'convex/schema.ts', entry: 'internal/convex-schema.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-convex-schema-market-01', from: 'convex', to: 'market', importer: 'convex/schema.ts', entry: 'internal/convex-schema.ts', owner: 'module-graph', removalTask: 'T6' },
    { id: 'T6-convex-schema-chat-01', from: 'convex', to: 'chat', importer: 'convex/schema.ts', entry: 'internal/convex-schema.ts', owner: 'module-graph', removalTask: 'T6' },
  ],
  testOnlyWhiteBoxExceptions: [
    { id: 'test-whitebox-01', importers: ['tests/eval/adr009-composition-direct-control.test.ts', 'tests/eval/support/adr009-transfer-comparison.ts'], to: 'action-invocation', entry: 'transfer-evaluator.ts', owner: 'source-tests' },
    { id: 'test-whitebox-02', importers: ['tests/helpers/x402-payment-attempt.ts', 'tests/unit/action-invocation/dynamic-published-operation-harness.ts', 'tests/unit/action-invocation/dynamic-published-operation-paid.test.ts', 'tests/unit/action-invocation/x402-payment-reconciliation.test.ts'], to: 'action-invocation', entry: 'x402-payment-attempt.ts', owner: 'source-tests' },
    { id: 'test-whitebox-03', importers: ['tests/integration/capability-operation-workpool.test.ts'], to: 'capability-supply', entry: 'internal/graph/qualify-candidate.ts', owner: 'source-tests' },
    { id: 'test-whitebox-04', importers: ['tests/integration/facilitator-discovery.test.ts'], to: 'capability-supply', entry: 'internal/facilitator-discovery-admission.ts', owner: 'source-tests' },
    { id: 'test-whitebox-05', importers: ['tests/integration/facilitator-discovery.test.ts', 'tests/unit/capability-supply/facilitator-discovery-ingest.test.ts', 'tests/unit/capability-supply/publication-importers-x402.test.ts', 'tests/unit/capability-supply/readiness-probe-x402.test.ts', 'tests/unit/market/registry-graduation.test.ts'], to: 'capability-supply', entry: 'internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json', owner: 'source-tests' },
    { id: 'test-whitebox-06', importers: ['tests/types/domain-contracts.test.ts'], to: 'security', entry: 'internal/validators.ts', owner: 'source-tests' },
    { id: 'test-whitebox-07', importers: ['tests/types/domain-contracts.test.ts'], to: 'observability', entry: 'internal/validators.ts', owner: 'source-tests' },
    { id: 'test-whitebox-08', importers: ['tests/unit/action-invocation/application-service-observer.test.ts', 'tests/unit/action-invocation/authoritative-input-work.test.ts', 'tests/unit/action-invocation/development-host-parity.test.ts', 'tests/unit/action-invocation/durable-action-invocation-cancel.test.ts', 'tests/unit/action-invocation/durable-action-invocation-harness.ts', 'tests/unit/action-invocation/durable-action-invocation-lease.test.ts', 'tests/unit/action-invocation/durable-action-invocation-observation.test.ts', 'tests/unit/action-invocation/durable-action-invocation-release.test.ts', 'tests/unit/action-invocation/durable-action-invocation-result.test.ts', 'tests/unit/action-invocation/durable-action-invocation-transact.test.ts', 'tests/unit/action-invocation/dynamic-published-operation-adapter.test.ts', 'tests/unit/action-invocation/dynamic-published-operation-harness.ts', 'tests/unit/action-invocation/dynamic-published-operation-paid.test.ts', 'tests/unit/action-invocation/dynamic-published-operation-recovery.test.ts', 'tests/unit/action-invocation/full-yolo.test.ts', 'tests/unit/action-invocation/in-memory-action-invocation.test.ts', 'tests/unit/action-invocation/neutral-contract-boundary.test.ts', 'tests/unit/action-invocation/operation-public.test.ts', 'tests/unit/action-invocation/paid-operation-application-service.test.ts', 'tests/unit/action-invocation/paid-operation-development-surface.test.tsx', 'tests/unit/action-invocation/paid-operation-projection.test.ts', 'tests/unit/action-invocation/standing-mandate.test.ts', 'tests/unit/action-invocation/x402-payment-reconciliation.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-authority.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-harness.ts', 'tests/unit/capability-supply/supplied-candidate-quote-outcomes.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-reconciliation.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-transfer.test.ts', 'tests/unit/money/metering-seam.test.ts', 'tests/unit/schema/convex-schema.test.ts'], to: 'action-invocation', entry: 'index.ts', owner: 'source-tests' },
    { id: 'test-whitebox-09', importers: ['tests/unit/action-invocation/dynamic-published-operation-harness.ts', 'tests/unit/action-invocation/dynamic-published-operation-paid.test.ts'], to: 'action-invocation', entry: 'dynamic-published-execution.ts', owner: 'source-tests' },
    { id: 'test-whitebox-10', importers: ['tests/unit/action-invocation/operation-public.test.ts'], to: 'action-invocation', entry: 'internal/durable-contracts.ts', owner: 'source-tests' },
    { id: 'test-whitebox-11', importers: ['tests/unit/action-invocation/paid-operation-card.test.tsx', 'tests/unit/action-invocation/paid-operation-contract.test.tsx'], to: 'action-invocation', entry: 'paid-operation-semantics.ts', owner: 'source-tests' },
    { id: 'test-whitebox-12', importers: ['tests/unit/capability-execution/operation-receipt-contract.test.ts'], to: 'capability-execution', entry: 'invocation-worker/brokeredX402.ts', owner: 'source-tests' },
    { id: 'test-whitebox-13', importers: ['tests/unit/capability-supply/admit-provider-schema.test.ts', 'tests/unit/capability-supply/publication-validate.test.ts'], to: 'capability-supply', entry: 'internal/schema-deref.ts', owner: 'source-tests' },
    { id: 'test-whitebox-14', importers: ['tests/unit/capability-supply/binding-helpers.test.ts', 'tests/unit/capability-supply/eligibility-helpers.test.ts', 'tests/unit/capability-supply/eligible-supply.test.ts', 'tests/unit/capability-supply/operation-ledger.test.ts', 'tests/unit/capability-supply/publication-lifecycle.test.ts', 'tests/unit/capability-supply/quarantine-helpers.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-harness.ts', 'tests/unit/capability-supply/supply-writers.test.ts'], to: 'capability-supply', entry: 'internal/binding/index.ts', owner: 'source-tests' },
    { id: 'test-whitebox-15', importers: ['tests/unit/capability-supply/cdp-x402-payment-signer.test.ts'], to: 'capability-supply', entry: 'internal/cdp-x402-payment-signer.ts', owner: 'source-tests' },
    { id: 'test-whitebox-16', importers: ['tests/unit/capability-supply/eligibility-helpers.test.ts', 'tests/unit/capability-supply/eligible-supply.test.ts', 'tests/unit/capability-supply/supply-writers.test.ts'], to: 'capability-supply', entry: 'internal/eligibility/index.ts', owner: 'source-tests' },
    { id: 'test-whitebox-17', importers: ['tests/unit/capability-supply/eligibility-helpers.test.ts', 'tests/unit/capability-supply/eligible-supply.test.ts', 'tests/unit/capability-supply/offering-helpers.test.ts', 'tests/unit/capability-supply/operation-ledger.test.ts', 'tests/unit/capability-supply/publication-lifecycle.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-harness.ts', 'tests/unit/capability-supply/supply-writers.test.ts'], to: 'capability-supply', entry: 'internal/offering/index.ts', owner: 'source-tests' },
    { id: 'test-whitebox-18', importers: ['tests/unit/capability-supply/facilitator-discovery-client.test.ts'], to: 'capability-supply', entry: 'internal/facilitator-discovery-client.ts', owner: 'source-tests' },
    { id: 'test-whitebox-19', importers: ['tests/unit/capability-supply/facilitator-discovery-ingest.test.ts'], to: 'capability-supply', entry: 'internal/x402-bazaar-fixtures/synthetic-post-payment-required.json', owner: 'source-tests' },
    { id: 'test-whitebox-20', importers: ['tests/unit/capability-supply/facilitator-discovery-ingest.test.ts'], to: 'capability-supply', entry: 'internal/facilitator-discovery-ingest.ts', owner: 'source-tests' },
    { id: 'test-whitebox-21', importers: ['tests/unit/capability-supply/facilitator-discovery-ingest.test.ts'], to: 'capability-supply', entry: 'internal/publication-importer-x402-bazaar.ts', owner: 'source-tests' },
    { id: 'test-whitebox-22', importers: ['tests/unit/capability-supply/http-credential-readiness.test.ts', 'tests/unit/capability-supply/readiness-probe-http-json.test.ts', 'tests/unit/capability-supply/readiness-probe-mcp.test.ts', 'tests/unit/capability-supply/readiness-probe-quote.test.ts', 'tests/unit/capability-supply/readiness-probe-x402.test.ts'], to: 'capability-supply', entry: 'internal/readiness-probe.ts', owner: 'source-tests' },
    { id: 'test-whitebox-23', importers: ['tests/unit/capability-supply/operation-ledger.test.ts', 'tests/unit/capability-supply/publication-commands-publish.test.ts', 'tests/unit/capability-supply/publication-commands-republish.test.ts'], to: 'capability-supply', entry: 'internal/operation-ledger/index.ts', owner: 'source-tests' },
    { id: 'test-whitebox-24', importers: ['tests/unit/capability-supply/operation-ledger.test.ts'], to: 'capability-supply', entry: 'internal/shared/index.ts', owner: 'source-tests' },
    { id: 'test-whitebox-25', importers: ['tests/unit/capability-supply/probe-digest.test.ts'], to: 'capability-supply', entry: 'internal/graph/probe-digest.ts', owner: 'source-tests' },
    { id: 'test-whitebox-26', importers: ['tests/unit/capability-supply/provenance-tristate.test.ts'], to: 'capability-supply', entry: 'internal/shared/command-envelope.ts', owner: 'source-tests' },
    { id: 'test-whitebox-27', importers: ['tests/unit/capability-supply/provenance-tristate.test.ts'], to: 'capability-supply', entry: 'internal/publication/provenance.ts', owner: 'source-tests' },
    { id: 'test-whitebox-28', importers: ['tests/unit/capability-supply/publication-commands-harness.ts', 'tests/unit/capability-supply/publication-commands-prepare.test.ts', 'tests/unit/capability-supply/publication-commands-publish.test.ts', 'tests/unit/capability-supply/publication-commands-refresh.test.ts', 'tests/unit/capability-supply/publication-commands-republish.test.ts', 'tests/unit/capability-supply/publication-commands-withdraw.test.ts', 'tests/unit/capability-supply/publication-lifecycle.test.ts', 'tests/unit/capability-supply/publication-validate.test.ts', 'tests/unit/capability-supply/supply-actions.test.ts', 'tests/unit/capability-supply/supply-funnel.test.ts', 'tests/unit/ui/supply-funnel-harness.tsx'], to: 'capability-supply', entry: 'internal/publication/index.ts', owner: 'source-tests' },
    { id: 'test-whitebox-29', importers: ['tests/unit/capability-supply/publication-commands-harness.ts', 'tests/unit/capability-supply/publication-commands-publish.test.ts', 'tests/unit/capability-supply/publication-importers-mcp.test.ts', 'tests/unit/capability-supply/publication-validate.test.ts'], to: 'capability-supply', entry: 'internal/publication/source.ts', owner: 'source-tests' },
    { id: 'test-whitebox-30', importers: ['tests/unit/capability-supply/publication-commands-harness.ts'], to: 'capability-supply', entry: 'internal/binding/registration.ts', owner: 'source-tests' },
    { id: 'test-whitebox-31', importers: ['tests/unit/capability-supply/publication-commands-harness.ts'], to: 'capability-supply', entry: 'internal/offering/registration.ts', owner: 'source-tests' },
    { id: 'test-whitebox-32', importers: ['tests/unit/capability-supply/publication-commands-publish.test.ts', 'tests/unit/capability-supply/publication-commands-refresh.test.ts'], to: 'capability-supply', entry: 'internal/publication-importers.ts', owner: 'source-tests' },
    { id: 'test-whitebox-33', importers: ['tests/unit/capability-supply/publication-commands-refresh.test.ts'], to: 'capability-supply', entry: 'internal/binding/write.ts', owner: 'source-tests' },
    { id: 'test-whitebox-34', importers: ['tests/unit/capability-supply/publication-importers-x402.test.ts', 'tests/unit/capability-supply/publication-validate.test.ts'], to: 'capability-supply', entry: 'internal/admit-provider-schema.ts', owner: 'source-tests' },
    { id: 'test-whitebox-35', importers: ['tests/unit/capability-supply/publication-validate.test.ts'], to: 'capability-supply', entry: 'internal/publication/admit.ts', owner: 'source-tests' },
    { id: 'test-whitebox-36', importers: ['tests/unit/capability-supply/quarantine-helpers.test.ts'], to: 'capability-supply', entry: 'internal/quarantine/index.ts', owner: 'source-tests' },
    { id: 'test-whitebox-37', importers: ['tests/unit/capability-supply/route-transport-x402.test.ts', 'tests/unit/capability-supply/server-credential.test.ts'], to: 'capability-supply', entry: 'internal/server-credential.ts', owner: 'source-tests' },
    { id: 'test-whitebox-38', importers: ['tests/unit/capability-supply/supplied-candidate-qualification.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-harness.ts'], to: 'capability-supply', entry: 'internal/graph/index.ts', owner: 'source-tests' },
    { id: 'test-whitebox-39', importers: ['tests/unit/capability-supply/supply-funnel.test.ts'], to: 'capability-supply', entry: 'internal/supply-funnel/pricing-port.ts', owner: 'source-tests' },
    { id: 'test-whitebox-40', importers: ['tests/unit/capability-supply/supply-liquidity.test.ts'], to: 'capability-supply', entry: 'internal/liquidity.ts', owner: 'source-tests' },
    { id: 'test-whitebox-41', importers: ['tests/unit/capability-supply/x402-offer-receipt.test.ts'], to: 'capability-supply', entry: 'internal/x402-offer-receipt.ts', owner: 'source-tests' },
    { id: 'test-whitebox-42', importers: ['tests/unit/capability-supply/x402-payment-signer.test.ts'], to: 'capability-supply', entry: 'internal/x402-payment-signer.ts', owner: 'source-tests' },
    { id: 'test-whitebox-43', importers: ['tests/unit/capability-supply/x402-settlement-verifier.test.ts'], to: 'capability-supply', entry: 'internal/x402-settlement-verifier.ts', owner: 'source-tests' },
    { id: 'test-whitebox-44', importers: ['tests/unit/convex/capability-operation-worker-recover.test.ts'], to: 'capability-execution', entry: 'invocation-worker/charge.ts', owner: 'source-tests' },
    { id: 'test-whitebox-45', importers: ['tests/unit/convex/capability-operation-worker-recover.test.ts'], to: 'capability-execution', entry: 'invocation-worker/recover.ts', owner: 'source-tests' },
    { id: 'test-whitebox-46', importers: ['tests/unit/convex/capability-operation-worker-recover.test.ts'], to: 'capability-execution', entry: 'invocation-worker/x402Settlement.ts', owner: 'source-tests' },
    { id: 'test-whitebox-47', importers: ['tests/unit/convex/x402-route-authorization.test.ts', 'tests/unit/convex/x402-route-rpc-consensus.test.ts'], to: 'capability-execution', entry: 'invocation-worker/x402Route.ts', owner: 'source-tests' },
    { id: 'test-whitebox-48', importers: ['tests/unit/discovery/offering-llms-index.test.ts'], to: 'discovery', entry: 'internal/discovery-files.ts', owner: 'source-tests' },
    { id: 'test-whitebox-49', importers: ['tests/unit/money/credential-budget.test.ts'], to: 'money', entry: 'internal/credential-budget.ts', owner: 'source-tests' },
    { id: 'test-whitebox-50', importers: ['tests/unit/money/exact-amount.test.ts'], to: 'money', entry: 'internal/exact-amount.ts', owner: 'source-tests' },
    { id: 'test-whitebox-51', importers: ['tests/unit/money/external-spend-policy.test.ts'], to: 'money', entry: 'internal/external-spend.ts', owner: 'source-tests' },
    { id: 'test-whitebox-52', importers: ['tests/unit/money/ledger.test.ts'], to: 'money', entry: 'internal/ledger.ts', owner: 'source-tests' },
    { id: 'test-whitebox-53', importers: ['tests/unit/money/stripe-webhook.test.ts'], to: 'money', entry: 'internal/stripe-webhook.ts', owner: 'source-tests' },
    { id: 'test-whitebox-54', importers: ['tests/unit/observability/audit-redaction.test.ts'], to: 'observability', entry: 'internal/audit.ts', owner: 'source-tests' },
    { id: 'test-whitebox-55', importers: ['tests/unit/observability/audit-redaction.test.ts'], to: 'observability', entry: 'internal/redaction.ts', owner: 'source-tests' },
    { id: 'test-whitebox-56', importers: ['tests/unit/observability/business-action-events.test.ts'], to: 'observability', entry: 'internal/schema.ts', owner: 'source-tests' },
    { id: 'test-whitebox-57', importers: ['tests/unit/observability/operation-keys.test.ts'], to: 'observability', entry: 'internal/operation-keys.ts', owner: 'source-tests' },
    { id: 'test-whitebox-58', importers: ['tests/unit/operation-chat-ui/operation-chat.test.tsx'], to: 'actions', entry: 'tool-contract.ts', owner: 'source-tests' },
    { id: 'test-whitebox-59', importers: ['tests/unit/registry/search-documents.test.ts', 'tests/unit/registry/trade-vocabulary.test.ts'], to: 'registry', entry: 'internal/search-documents.ts', owner: 'source-tests' },
    { id: 'test-whitebox-60', importers: ['tests/unit/security/admin-authority.test.ts'], to: 'security', entry: 'internal/admin-authority.ts', owner: 'source-tests' },
    { id: 'test-whitebox-61', importers: ['tests/unit/server/mcp-api-operation-recovery.test.ts'], to: 'action-invocation', entry: 'reconciliation-evidence.ts', owner: 'source-tests' },
    { id: 'test-whitebox-62', importers: ['tests/unit/ui/journey-events.test.ts'], to: 'observability', entry: 'internal/literals.ts', owner: 'source-tests' },
  ],
}

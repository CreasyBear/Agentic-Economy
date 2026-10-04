/**
 * Target runtime dependency direction (arrows point toward dependencies):
 *
 * adapters/actions -> registry | capability-execution | capability-supply
 * registry -> catalog | capability-supply
 * capability-execution -> capability-supply | action-execution | money | agent-access
 * capability-supply -> capability-contract | business | security
 * action-execution -> money | capability-contract
 * all lower layers -> dependency-free common (and guarded I/O -> network-guard)
 */

export type ModuleName =
  | 'action-execution'
  | 'actions'
  | 'agent-access'
  | 'authority'
  | 'business'
  | 'capability-contract'
  | 'capability-contract-registry'
  | 'capability-execution'
  | 'capability-supply'
  | 'catalog'
  | 'chat'
  | 'chat-sharing'
  | 'common'
  | 'decision-engine'
  | 'dev'
  | 'discovery'
  | 'market'
  | 'market-demand'
  | 'model-gateway'
  | 'money'
  | 'network-guard'
  | 'observability'
  | 'principal-account'
  | 'registry'
  | 'security'
  | 'secrets'
  | 'seo'
  | 'workspace-invitation'
  | 'workspace-membership'

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
    { name: 'common', entrySurfaces: ['action.ts', 'audit-events.ts', 'base64-codec.ts', 'bounded-json.ts', 'canonical-digest.ts', 'convex-literals.ts', 'deep-freeze.ts', 'ed25519-attestation.ts', 'forbidden-signature-key.ts', 'freshness.ts', 'ids.ts', 'is-record.ts', 'json-pointer.ts', 'market-tool-paths.ts', 'matching-csrf.ts', 'normalize-search-text.ts', 'normalize-slug.ts', 'tool-input-binding.ts', 'tool-ref.ts', 'tool-selection-score.ts', 'random-id.ts', 'runtime-id.ts', 'same-string-list.ts', 'sanitize-text.ts', 'search-query.ts', 'stable-hash.ts', 'trim-trailing-slashes.ts', 'unique-sorted.ts', 'truncate-text.ts'], allowedDependencies: [] },
    { name: 'principal-account', entrySurfaces: ['public.ts', 'principal/public.ts', 'account/public.ts', 'external-identity/public.ts', 'workspace-decommission.view-model.ts', 'notification-preferences.view-model.ts'], allowedDependencies: [] },
    { name: 'authority', entrySurfaces: ['delegation/public.ts', 'context/public.ts', 'recovery/public.ts', 'internal/convex-schema.ts'], allowedDependencies: ['common', 'principal-account'] },
    { name: 'secrets', entrySurfaces: ['public.ts', 'secret-plane.ts', 'convex.ts', 'runtime.ts', 'internal/convex-schema.ts'], allowedDependencies: [] },
    { name: 'network-guard', entrySurfaces: ['public.ts', 'server.ts'], allowedDependencies: ['common'] },
    { name: 'capability-contract', entrySurfaces: ['public.ts'], allowedDependencies: ['common'] },
    { name: 'business', entrySurfaces: ['public.ts', 'schema.ts'], allowedDependencies: ['common', 'principal-account'] },
    { name: 'security', entrySurfaces: ['public.ts', 'schema.ts', 'source-write-admission.ts', 'removal-dispute.functions.ts', 'account-security.ts', 'account-security.functions.ts', 'owner-admin-bootstrap.functions.ts', 'rate-limit-policy.ts'], allowedDependencies: ['common', 'business', 'capability-contract'] },
    { name: 'capability-contract-registry', entrySurfaces: ['public.ts', 'schema.ts'], allowedDependencies: ['common', 'capability-contract'] },
    { name: 'agent-access', entrySurfaces: ['public.ts', 'schema.ts', 'contract.ts', 'account.actions.ts', 'issued-agent-binding.ts', 'agent-access.ts', 'agent-access.functions.ts', 'policy.ts', 'production-policy.ts', 'sandbox-policy.ts', 'service-auth-envelope.ts', 'agent-access-console.ts', 'agent-operator-view-model.ts', 'consent-read-model.ts', 'oauth-state.ts', 'agent-connection.ts', 'config-snippets.ts', 'spending-policy-update.ts', 'issue-key.contracts.ts', 'spending-policy.view-model.ts', 'agent-lifecycle.view-model.ts', 'consent.contracts.ts'], allowedDependencies: ['common', 'capability-contract', 'security', 'money', 'principal-account'] },
    { name: 'money', entrySurfaces: ['usage-read-source.ts', 'public.ts', 'schema.ts', 'server.ts', 'money.functions.ts', 'formance.ts', 'formance-workflows.ts', 'formance-treasury.ts', 'formance-treasury-snapshot.ts', 'formance-treasury-audit.ts', 'formance-restore.ts', 'treasury.ts', 'treasury-report.ts', 'payment-readiness.ts', 'funding-handoff.actions.ts', 'reference-rate.ts', 'reference-rate.server.ts', 'x402-payee-screening.server.ts', 'x402-spend-admission.ts', 'internal/organization-monthly-spend-fence.ts', 'tax-profile.view-model.ts', 'invoice-history.view-model.ts', 'funding-return.view-model.ts', 'account-funding.contracts.ts', 'account-history.contracts.ts', 'account-documents.view-model.ts'], allowedDependencies: ['common', 'security'] },
    { name: 'observability', entrySurfaces: ['public.ts', 'schema.ts', 'funnel.functions.ts'], allowedDependencies: ['common', 'business'] },
    { name: 'action-execution', entrySurfaces: ['public.ts', 'runtime.ts', 'schema.ts'], allowedDependencies: ['common', 'capability-contract', 'money', 'security', 'network-guard', 'observability'] },
    { name: 'capability-supply', entrySurfaces: ['public.ts', 'server.ts', 'schema.ts', 'convex.ts', 'current-tool.ts', 'tool-projection.ts', 'tool-schemas.ts', 'tool-source.ts', 'provider-approval.ts', 'provider-connection.ts', 'provider-connection-handoff.ts', 'provider-offboarding.ts', 'published-tool.ts', 'route-transport-runtime.ts', 'source-authority-review.functions.ts', 'source-first-owner.ts', 'source-selection-draft.ts', 'supplied-quote.ts', 'supply-actions.ts', 'supply-funnel.functions.ts', 'owner-supply-validators.ts', 'integration-draft.ts', 'tool-health.ts', 'source-preview.ts', 'provider-tool-status.ts', 'supply-publication-v2.ts', 'provider-connection.contracts.ts', 'supplier-onboarding.contracts.ts', 'provider-tool-actions.contracts.ts', 'tool-test.contracts.ts', 'internal/x402-directory-projection-facts.ts'], allowedDependencies: ['common', 'network-guard', 'capability-contract', 'capability-contract-registry', 'business', 'security', 'agent-access', 'money', 'observability', 'secrets', 'decision-engine'] },
    { name: 'catalog', entrySurfaces: ['public.ts', 'schema.ts', 'convex.ts', 'schema-values.ts'], allowedDependencies: ['common', 'business', 'money'] },
    { name: 'capability-execution', entrySurfaces: ['provider-service-units.ts', 'service-usage-evidence.ts', 'call-attempt-evidence.ts', 'monthly-usage-draft.ts', 'schema.ts', 'convex.ts', 'purchase-resolution.ts', 'current-tool-quote.ts', 'call-receipt-view.ts', 'call-runtime.ts', 'provider-consequence-runtime.ts', 'live-x402-requirement.ts', 'call-approval.functions.ts', 'call-approval-contracts.ts', 'paid-call-report.ts', 'paid-call-report.functions.ts', 'quote.ts', 'quote.actions.ts', 'call-history.actions.ts', 'call-entry.ts', 'call-contracts.ts', 'call.actions.ts', 'call-authority.ts', 'call-recovery-contracts.ts', 'call-recovery.actions.ts', 'call-recovery.functions.ts', 'procure.ts', 'procure.actions.ts', 'procure-engine.ts', 'route-selection.ts'], allowedDependencies: ['common', 'network-guard', 'capability-contract', 'business', 'security', 'agent-access', 'money', 'observability', 'action-execution', 'capability-supply', 'principal-account', 'secrets', 'decision-engine'] },
    { name: 'decision-engine', entrySurfaces: ['public.ts'], allowedDependencies: ['common'] },
    { name: 'registry', entrySurfaces: ['public.ts', 'schema.ts', 'tool-entry.ts', 'tool-paths.ts', 'tool-action-contracts.ts', 'tool-choice-contracts.ts', 'opaque-cursor.ts', 'registry.actions.ts', 'tools.actions.ts', 'registry.functions.ts', 'tool-reranker.ts'], allowedDependencies: ['common', 'capability-contract', 'business', 'catalog', 'capability-supply', 'money', 'observability', 'decision-engine'] },
    { name: 'market', entrySurfaces: ['server.ts', 'schema.ts', 'contracts.ts', 'allocation-evidence.ts', 'home-catalogue.ts', 'listing-evidence.ts', 'market.functions.ts', 'market-tool-search.functions.ts', 'market-route-data.ts', 'market-flow.functions.ts', 'market-flow.server.ts', 'base-facilitator-set.ts', 'flow-tape.ts', 'tool-view-model.ts', 'suggested-next-action.ts', 'x402-directory.ts', 'x402-directory.functions.ts', 'x402-directory.server.ts', 'x402-directory-source.server.ts', 'x402-directory-projection.ts', 'x402-directory-catalogue.ts', 'x402-directory-index.ts', 'x402-directory-index.functions.ts', 'x402-directory-index.server.ts', 'x402-directory-metadata.ts', 'x402-directory-navigation.ts', 'x402-directory-title.ts', 'x402-marketplace-home.ts', 'x402-marketplace-home.server.ts', 'directory-filters.contracts.ts', 'saved-tools.contracts.ts', 'tool-detail-route.functions.ts', 'directory-card.view-model.ts'], allowedDependencies: ['common', 'capability-contract', 'business', 'capability-supply', 'agent-access', 'money', 'observability', 'registry', 'decision-engine'] },
    { name: 'market-demand', entrySurfaces: ['schema.ts', 'market-demand.actions.ts', 'market-demand.functions.ts', 'request-identity.ts'], allowedDependencies: ['common', 'agent-access', 'registry'] },
    { name: 'actions', entrySurfaces: ['index.ts', 'contract.ts', 'tool-contract.ts'], allowedDependencies: ['common', 'registry', 'capability-execution', 'capability-supply', 'capability-contract', 'agent-access', 'market-demand', 'market', 'money', 'security', 'principal-account'] },
    { name: 'discovery', entrySurfaces: ['public.ts', 'convex.ts', 'discovery.functions.ts', 'developer-discovery.ts', 'developer-discovery-route.ts'], allowedDependencies: ['common', 'business', 'capability-contract', 'catalog', 'registry', 'capability-supply', 'capability-execution', 'agent-access', 'money', 'actions', 'market', 'market-demand', 'observability', 'seo'] },
    { name: 'seo', entrySurfaces: ['public.ts', 'public-route.ts'], allowedDependencies: ['common', 'business', 'catalog', 'registry'] },
    { name: 'chat', entrySurfaces: ['model-cost.ts', 'schema.ts', 'tool-card.ts', 'openui-bundle.ts', 'agent-turn.contracts.ts', 'search-presentation.ts', 'run-request.ts'], allowedDependencies: ['common', 'actions', 'registry', 'capability-execution', 'capability-supply', 'market', 'market-demand', 'money', 'principal-account', 'agent-access'] },
    { name: 'chat-sharing', entrySurfaces: ['share-token.ts', 'schema.ts', 'convex.ts'], allowedDependencies: ['common'] },
    { name: 'model-gateway', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'actions'] },
    { name: 'dev', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'business', 'catalog', 'registry', 'capability-supply', 'capability-execution', 'actions'] },
    { name: 'workspace-invitation', entrySurfaces: ['organization-invitation-observation.ts'], allowedDependencies: [] },
    { name: 'workspace-membership', entrySurfaces: ['organization-membership-observation.ts'], allowedDependencies: [] },
  ],
  temporaryRuntimeExceptions: [],
  testOnlyWhiteBoxExceptions: [
    {
      id: 'native-formance-usage-reader-proof',
      importers: ['tests/integration/money-formance-usage-reconciliation.test.ts'],
      to: 'money',
      entry: 'internal/formance-usage-reconciliation.ts',
      owner: 'money',
    },
    {
      id: 'x402-managed-signing-recovery-test',
      importers: ['tests/unit/convex/x402-managed-signing-recovery.test.ts'],
      to: 'capability-execution',
      entry: 'call-worker/recovery/managedSigning.ts',
      owner: 'capability-execution',
    },
    {
      id: 'x402-managed-signing-recovery-fixture',
      importers: ['tests/unit/convex/x402-managed-signing-recovery.test.ts'],
      to: 'capability-execution',
      entry: 'call-worker/recovery/loading.ts',
      owner: 'capability-execution',
    },
    {
      id: 'x402-signing-admission-test',
      importers: ['tests/unit/convex/x402-signing-admission.test.ts', 'tests/unit/convex/x402-signing-authority-reconciliation.test.ts'],
      to: 'capability-execution',
      entry: 'call-worker/x402SigningAdmission.ts',
      owner: 'capability-execution',
    },
    {
      id: 'x402-payment-material-unit-contract',
      importers: ['tests/unit/capability-supply/route-transport-x402.test.ts'],
      to: 'capability-supply',
      entry: 'internal/route-transport-x402-payment.ts',
      owner: 'capability-supply',
    },
    {
      id: 'market-directory-reranker-tests',
      importers: ['tests/unit/market/x402-directory-reranker.test.ts'],
      to: 'market',
      entry: 'x402-directory-reranker.ts',
      owner: 'market',
    },
    {
      id: 'x402-recovery-evidence-order-test',
      importers: ['tests/unit/convex/x402-recovery-evidence-order.test.ts'],
      to: 'capability-execution',
      entry: 'call-worker/recovery/x402.ts',
      owner: 'capability-execution',
    },
    {
      id: 'development-provider-tool-reconciliation-verifier',
      importers: ['tests/unit/action-execution/fixtures/provider-tool/development-provider-tool-runner.ts'],
      to: 'action-execution',
      entry: 'reconciliation-evidence.ts',
      owner: 'action-execution',
    },
    {
      id: 'development-provider-tool-spending-policy-contract',
      importers: [
        'tests/unit/action-execution/fixtures/provider-tool/development-provider-tool-objective.ts',
        'tests/unit/action-execution/fixtures/provider-tool/development-provider-tool-spending-policy.ts',
      ],
      to: 'action-execution',
      entry: 'spending-policy.ts',
      owner: 'action-execution',
    },
    {
      id: 'development-provider-tool-spending-policy-decision',
      importers: ['tests/unit/action-execution/fixtures/provider-tool/development-provider-tool-objective.ts'],
      to: 'action-execution',
      entry: 'spending-policy-evaluation.ts',
      owner: 'action-execution',
    },
    {
      id: 'development-provider-tool-exposure-offset-rule',
      importers: ['tests/unit/action-execution/fixtures/provider-tool/development-provider-tool-provider.ts'],
      to: 'action-execution',
      entry: 'exposure-offset-rules.ts',
      owner: 'action-execution',
    },
  ],
}

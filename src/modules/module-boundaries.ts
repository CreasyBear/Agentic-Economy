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
    { name: 'common', entrySurfaces: ['action.ts', 'audit-events.ts', 'base64-codec.ts', 'bounded-json.ts', 'canonical-digest.ts', 'convex-literals.ts', 'deep-freeze.ts', 'ed25519-attestation.ts', 'forbidden-signature-key.ts', 'freshness.ts', 'ids.ts', 'is-record.ts', 'json-pointer.ts', 'market-tool-paths.ts', 'matching-csrf.ts', 'normalize-search-text.ts', 'normalize-slug.ts', 'tool-ref.ts', 'random-id.ts', 'runtime-id.ts', 'same-string-list.ts', 'sanitize-text.ts', 'stable-hash.ts', 'trim-trailing-slashes.ts', 'unique-sorted.ts'], allowedDependencies: [] },
    { name: 'principal-account', entrySurfaces: ['public.ts', 'principal/public.ts', 'account/public.ts', 'external-identity/public.ts', 'workload-context/public.ts'], allowedDependencies: [] },
    { name: 'authority', entrySurfaces: ['delegation/public.ts', 'context/public.ts', 'recovery/public.ts', 'internal/convex-schema.ts'], allowedDependencies: ['common', 'principal-account'] },
    { name: 'secrets', entrySurfaces: ['public.ts', 'secret-plane.ts', 'convex.ts', 'runtime.ts', 'internal/convex-schema.ts'], allowedDependencies: [] },
    { name: 'network-guard', entrySurfaces: ['public.ts', 'server.ts'], allowedDependencies: ['common'] },
    { name: 'capability-contract', entrySurfaces: ['public.ts'], allowedDependencies: ['common'] },
    { name: 'business', entrySurfaces: ['public.ts', 'schema.ts'], allowedDependencies: ['common', 'principal-account'] },
    { name: 'security', entrySurfaces: ['public.ts', 'schema.ts', 'source-write-admission.ts', 'admin-readback.functions.ts', 'removal-dispute.functions.ts', 'account-security.ts', 'account-security.functions.ts', 'rate-limit-policy.ts'], allowedDependencies: ['common', 'business', 'capability-contract'] },
    { name: 'capability-contract-registry', entrySurfaces: ['public.ts', 'schema.ts'], allowedDependencies: ['common', 'capability-contract'] },
    { name: 'agent-access', entrySurfaces: ['public.ts', 'schema.ts', 'contract.ts', 'account.actions.ts', 'issued-agent-binding.ts', 'agent-access.ts', 'agent-access.functions.ts', 'policy.ts', 'policy.functions.ts', 'production-policy.ts', 'sandbox-policy.ts', 'service-auth-envelope.ts', 'agent-access-console.ts', 'agent-operator-view-model.ts', 'consent-read-model.ts', 'oauth-state.ts', 'agent-connection.ts'], allowedDependencies: ['common', 'capability-contract', 'security', 'money', 'principal-account'] },
    { name: 'money', entrySurfaces: ['public.ts', 'schema.ts', 'server.ts', 'money.functions.ts', 'formance.ts', 'formance-workflows.ts', 'funding-handoff.actions.ts', 'reference-rate.ts'], allowedDependencies: ['common', 'security'] },
    { name: 'observability', entrySurfaces: ['public.ts', 'schema.ts', 'funnel.functions.ts'], allowedDependencies: ['common', 'business'] },
    { name: 'action-execution', entrySurfaces: ['public.ts', 'runtime.ts', 'schema.ts'], allowedDependencies: ['common', 'capability-contract', 'money', 'security', 'network-guard', 'observability'] },
    { name: 'capability-supply', entrySurfaces: ['public.ts', 'server.ts', 'schema.ts', 'convex.ts', 'current-tool.ts', 'tool-projection.ts', 'tool-schemas.ts', 'tool-source.ts', 'provider-approval.ts', 'provider-connection.ts', 'provider-connection-handoff.ts', 'provider-offboarding.ts', 'published-tool.ts', 'route-transport-runtime.ts', 'source-authority-review.functions.ts', 'source-first-owner.ts', 'source-selection-draft.ts', 'supplied-quote.actions.ts', 'supplied-quote.ts', 'supply-actions.ts', 'supply-funnel.functions.ts', 'owner-supply-validators.ts', 'integration-draft.ts', 'tool-health.ts', 'source-preview.ts', 'provider-tool-status.ts', 'supply-publication-v2.ts'], allowedDependencies: ['common', 'network-guard', 'capability-contract', 'capability-contract-registry', 'business', 'security', 'agent-access', 'money', 'observability', 'secrets'] },
    { name: 'catalog', entrySurfaces: ['public.ts', 'schema.ts', 'convex.ts', 'schema-values.ts'], allowedDependencies: ['common', 'business', 'money'] },
    { name: 'capability-execution', entrySurfaces: ['index.ts', 'schema.ts', 'convex.ts', 'current-tool-quote.ts', 'call-receipt-view.ts', 'call-runtime.ts', 'provider-consequence-runtime.ts', 'live-x402-requirement.ts', 'call-approval.functions.ts', 'call-approval-contracts.ts', 'quote.ts', 'quote.actions.ts', 'call-history.actions.ts', 'call-entry.ts', 'call-contracts.ts', 'call.actions.ts', 'call-authority.ts', 'call-recovery-contracts.ts', 'call-recovery.actions.ts', 'call-recovery.functions.ts'], allowedDependencies: ['common', 'network-guard', 'capability-contract', 'business', 'security', 'agent-access', 'money', 'observability', 'action-execution', 'capability-supply', 'principal-account', 'secrets'] },
    { name: 'registry', entrySurfaces: ['public.ts', 'schema.ts', 'tool-entry.ts', 'tool-paths.ts', 'tool-action-contracts.ts', 'tool-choice-contracts.ts', 'opaque-cursor.ts', 'next-action.ts', 'registry.actions.ts', 'tools.actions.ts', 'registry.functions.ts', 'tool-detail-route.functions.ts'], allowedDependencies: ['common', 'capability-contract', 'business', 'catalog', 'capability-supply', 'money', 'observability'] },
    { name: 'market', entrySurfaces: ['server.ts', 'schema.ts', 'contracts.ts', 'allocation-evidence.ts', 'home-catalogue.ts', 'listing-evidence.ts', 'market.functions.ts', 'tool-view-model.ts', 'suggested-next-action.ts', 'x402-directory.ts', 'x402-directory.functions.ts', 'x402-directory.server.ts', 'x402-directory-catalogue.ts', 'x402-directory-index.ts', 'x402-directory-index.functions.ts', 'x402-directory-index.server.ts', 'x402-directory-metadata.ts', 'x402-directory-navigation.ts', 'x402-directory-title.ts', 'x402-marketplace-home.ts', 'x402-marketplace-home.functions.ts', 'x402-marketplace-home.server.ts'], allowedDependencies: ['common', 'capability-contract', 'business', 'capability-supply', 'money', 'observability'] },
    { name: 'market-demand', entrySurfaces: ['schema.ts', 'market-demand.actions.ts'], allowedDependencies: ['common', 'agent-access', 'registry'] },
    { name: 'actions', entrySurfaces: ['index.ts', 'contract.ts', 'strict-schema.ts', 'tool-contract.ts'], allowedDependencies: ['common', 'registry', 'capability-execution', 'capability-supply', 'agent-access', 'market-demand', 'money', 'security'] },
    { name: 'discovery', entrySurfaces: ['public.ts', 'convex.ts', 'discovery.functions.ts', 'developer-discovery.ts', 'developer-discovery-route.ts'], allowedDependencies: ['common', 'business', 'capability-contract', 'catalog', 'registry', 'capability-supply', 'capability-execution', 'agent-access', 'money', 'actions', 'market', 'observability', 'seo'] },
    { name: 'seo', entrySurfaces: ['public.ts', 'public-route.ts'], allowedDependencies: ['common', 'business', 'catalog', 'registry'] },
    { name: 'chat', entrySurfaces: ['schema.ts', 'tool-card.ts'], allowedDependencies: ['common', 'actions', 'registry', 'capability-execution', 'capability-supply', 'market', 'money'] },
    { name: 'chat-sharing', entrySurfaces: ['share-token.ts', 'schema.ts', 'convex.ts'], allowedDependencies: ['common'] },
    { name: 'model-gateway', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'actions'] },
    { name: 'dev', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'business', 'catalog', 'registry', 'capability-supply', 'capability-execution', 'actions'] },
  ],
  temporaryRuntimeExceptions: [],
  testOnlyWhiteBoxExceptions: [],
}

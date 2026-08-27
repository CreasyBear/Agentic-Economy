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
  | 'connections'
  | 'dev'
  | 'discovery'
  | 'market'
  | 'model-gateway'
  | 'money'
  | 'network-guard'
  | 'observability'
  | 'principal-account'
  | 'registry'
  | 'security'
  | 'secrets'
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
    { name: 'principal-account', entrySurfaces: ['public.ts', 'principal/public.ts', 'account/public.ts', 'external-identity/public.ts', 'workload-context/public.ts'], allowedDependencies: [] },
    { name: 'authority', entrySurfaces: ['delegation/public.ts', 'context/public.ts', 'recovery/public.ts', 'internal/convex-schema.ts'], allowedDependencies: ['principal-account'] },
    { name: 'secrets', entrySurfaces: ['public.ts', 'secret-plane.ts', 'convex.ts', 'runtime.ts', 'internal/convex-schema.ts'], allowedDependencies: [] },
    { name: 'connections', entrySurfaces: ['lifecycle/public.ts', 'internal/convex-schema.ts'], allowedDependencies: ['principal-account', 'authority', 'secrets'] },
    { name: 'network-guard', entrySurfaces: ['public.ts', 'server.ts'], allowedDependencies: ['common'] },
    { name: 'capability-contract', entrySurfaces: ['public.ts'], allowedDependencies: ['common'] },
    { name: 'business', entrySurfaces: ['public.ts', 'schema.ts'], allowedDependencies: ['common', 'principal-account'] },
    { name: 'security', entrySurfaces: ['public.ts', 'schema.ts', 'source-write-admission.ts', 'admin-readback.functions.ts', 'removal-dispute.functions.ts'], allowedDependencies: ['common', 'business', 'capability-contract'] },
    { name: 'capability-contract-registry', entrySurfaces: ['public.ts', 'schema.ts'], allowedDependencies: ['common', 'capability-contract'] },
    { name: 'agent-access', entrySurfaces: ['public.ts', 'contract.ts', 'agent-access.ts', 'agent-access.functions.ts', 'policy.ts', 'policy.functions.ts', 'production-policy.ts', 'sandbox-policy.ts', 'service-auth-envelope.ts', 'agent-access-console.ts', 'agent-operator-view-model.ts', 'oauth-state.ts'], allowedDependencies: ['common', 'capability-contract', 'security', 'money'] },
    { name: 'money', entrySurfaces: ['public.ts', 'schema.ts', 'server.ts'], allowedDependencies: ['common', 'security'] },
    { name: 'observability', entrySurfaces: ['public.ts', 'schema.ts', 'funnel.functions.ts'], allowedDependencies: ['common', 'business'] },
    { name: 'action-invocation', entrySurfaces: ['public.ts', 'runtime.ts', 'schema.ts'], allowedDependencies: ['common', 'capability-contract', 'money', 'security', 'network-guard', 'observability'] },
    { name: 'capability-supply', entrySurfaces: ['public.ts', 'server.ts', 'schema.ts', 'convex.ts', 'current-operation.ts', 'operation-projection.ts', 'operation-schemas.ts', 'operation-source.ts', 'provider-approval.ts', 'provider-connection.ts', 'published-operation.ts', 'route-transport-runtime.ts', 'supplied-quote.actions.ts', 'supplied-quote.ts', 'supply-actions.ts', 'supply-funnel.functions.ts', 'owner-supply-validators.ts'], allowedDependencies: ['common', 'network-guard', 'capability-contract', 'capability-contract-registry', 'business', 'security', 'agent-access', 'money', 'observability'] },
    { name: 'catalog', entrySurfaces: ['public.ts', 'schema.ts', 'convex.ts', 'schema-values.ts'], allowedDependencies: ['common', 'business', 'money'] },
    { name: 'capability-execution', entrySurfaces: ['index.ts', 'schema.ts', 'convex.ts', 'current-operation-commitment.ts', 'invocation-receipt-view.ts', 'invocation-runtime.ts', 'provider-consequence-runtime.ts', 'legacy-dynamic/index.ts', 'legacy-dynamic/paid-operation-semantics.ts', 'operation-approval.functions.ts', 'operation-execute-contract.ts', 'operation-execute-mcp.actions.ts', 'operation-execute.actions.ts', 'operation-execute.functions.ts', 'operation-execute.server.ts', 'operation-invoke-entry.ts', 'operation-invoke-contracts.ts', 'operation-invoke.actions.ts', 'operation-invoke.ts', 'operation-recovery-contracts.ts', 'operation-recovery.actions.ts', 'operation-recovery.functions.ts'], allowedDependencies: ['common', 'network-guard', 'capability-contract', 'business', 'security', 'agent-access', 'money', 'observability', 'action-invocation', 'capability-supply', 'principal-account', 'secrets'] },
    { name: 'registry', entrySurfaces: ['public.ts', 'schema.ts', 'operation-entry.ts', 'operation-paths.ts', 'operation-action-contracts.ts', 'operation-choice-contracts.ts', 'registry.actions.ts', 'operations.actions.ts', 'registry.functions.ts', 'operation-detail-route.functions.ts'], allowedDependencies: ['common', 'capability-contract', 'business', 'catalog', 'capability-supply', 'money', 'observability'] },
    { name: 'market', entrySurfaces: ['server.ts', 'schema.ts', 'contracts.ts', 'agentic-market-source.ts', 'allocation-evidence.ts', 'home-catalogue.ts', 'listing-evidence.ts', 'market.functions.ts', 'operation-view-model.ts', 'registry-graduation.ts', 'registry-launch-cohort.ts', 'registry-source-adapters.ts', 'registry-source-contracts.ts'], allowedDependencies: ['common', 'capability-contract', 'business', 'capability-supply', 'money', 'observability'] },
    { name: 'actions', entrySurfaces: ['index.ts', 'contract.ts', 'strict-schema.ts', 'tool-contract.ts'], allowedDependencies: ['common', 'registry', 'capability-execution', 'capability-supply', 'agent-access', 'security'] },
    { name: 'discovery', entrySurfaces: ['public.ts', 'convex.ts', 'discovery.functions.ts', 'developer-discovery.ts', 'developer-discovery-route.ts'], allowedDependencies: ['common', 'business', 'capability-contract', 'catalog', 'registry', 'capability-supply', 'capability-execution', 'agent-access', 'money', 'actions', 'market', 'observability', 'seo'] },
    { name: 'seo', entrySurfaces: ['public.ts', 'public-route.ts'], allowedDependencies: ['common', 'business', 'catalog', 'registry'] },
    { name: 'storefront', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'network-guard', 'business', 'catalog', 'registry', 'model-gateway'] },
    { name: 'chat', entrySurfaces: ['schema.ts', 'tool-card.ts'], allowedDependencies: ['common', 'actions', 'registry', 'capability-execution', 'capability-supply', 'market', 'money'] },
    { name: 'chat-sharing', entrySurfaces: ['share-token.ts', 'schema.ts', 'convex.ts'], allowedDependencies: ['common'] },
    { name: 'model-gateway', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'actions'] },
    { name: 'dev', entrySurfaces: ['public.ts'], allowedDependencies: ['common', 'business', 'catalog', 'registry', 'capability-supply', 'capability-execution', 'actions'] },
  ],
  temporaryRuntimeExceptions: [],
  testOnlyWhiteBoxExceptions: [
    { id: 'test-whitebox-01', importers: ['tests/eval/adr009-composition-direct-control.test.ts', 'tests/eval/support/adr009-transfer-comparison.ts'], to: 'action-invocation', entry: 'transfer-evaluator.ts', owner: 'source-tests' },
    { id: 'test-whitebox-02', importers: ['tests/helpers/x402-payment-attempt.ts', 'tests/unit/action-invocation/dynamic-published-operation-harness.ts', 'tests/unit/action-invocation/dynamic-published-operation-paid.test.ts', 'tests/unit/action-invocation/x402-payment-reconciliation.test.ts'], to: 'action-invocation', entry: 'x402-payment-attempt.ts', owner: 'source-tests' },
    { id: 'test-whitebox-03', importers: ['tests/integration/capability-operation-workpool.test.ts'], to: 'capability-supply', entry: 'internal/graph/qualify-candidate.ts', owner: 'source-tests' },
    { id: 'test-whitebox-04', importers: ['tests/integration/facilitator-discovery.test.ts'], to: 'capability-supply', entry: 'internal/facilitator-discovery-admission.ts', owner: 'source-tests' },
    { id: 'test-whitebox-05', importers: ['tests/integration/facilitator-discovery.test.ts', 'tests/integration/market-graduation-authority.test.ts', 'tests/unit/capability-supply/facilitator-discovery-ingest.test.ts', 'tests/unit/capability-supply/publication-importers-x402.test.ts', 'tests/unit/capability-supply/readiness-probe-x402.test.ts', 'tests/unit/market/registry-graduation.test.ts'], to: 'capability-supply', entry: 'internal/x402-bazaar-fixtures/timezone-payment-required-2026-08-19.json', owner: 'source-tests' },
    { id: 'test-whitebox-06', importers: ['tests/types/domain-contracts.test.ts'], to: 'security', entry: 'internal/validators.ts', owner: 'source-tests' },
    { id: 'test-whitebox-07', importers: ['tests/types/domain-contracts.test.ts'], to: 'observability', entry: 'internal/validators.ts', owner: 'source-tests' },
    { id: 'test-whitebox-08', importers: ['tests/unit/action-invocation/durable-action-invocation-cancel.test.ts', 'tests/unit/action-invocation/durable-action-invocation-harness.ts', 'tests/unit/action-invocation/durable-action-invocation-lease.test.ts', 'tests/unit/action-invocation/durable-action-invocation-observation.test.ts', 'tests/unit/action-invocation/durable-action-invocation-release.test.ts', 'tests/unit/action-invocation/durable-action-invocation-result.test.ts', 'tests/unit/action-invocation/durable-action-invocation-transact.test.ts', 'tests/unit/action-invocation/full-yolo.test.ts', 'tests/unit/action-invocation/in-memory-action-invocation.test.ts', 'tests/unit/action-invocation/neutral-contract-boundary.test.ts', 'tests/unit/action-invocation/operation-public.test.ts', 'tests/unit/action-invocation/standing-mandate.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-authority.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-harness.ts', 'tests/unit/capability-supply/supplied-candidate-quote-outcomes.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-reconciliation.test.ts', 'tests/unit/capability-supply/supplied-candidate-quote-transfer.test.ts'], to: 'action-invocation', entry: 'index.ts', owner: 'source-tests' },
    { id: 'test-whitebox-09', importers: ['tests/unit/action-invocation/dynamic-published-operation-harness.ts', 'tests/unit/action-invocation/dynamic-published-operation-paid.test.ts'], to: 'capability-execution', entry: 'legacy-dynamic/dynamic-published-execution.ts', owner: 'source-tests' },
    { id: 'test-whitebox-10', importers: ['tests/unit/action-invocation/operation-public.test.ts'], to: 'action-invocation', entry: 'internal/durable-contracts.ts', owner: 'source-tests' },
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
    { id: 'test-whitebox-59', importers: ['tests/unit/registry/search-documents.test.ts', 'tests/unit/registry/trade-vocabulary.test.ts'], to: 'registry', entry: 'internal/search-documents.ts', owner: 'source-tests' },
    { id: 'test-whitebox-60', importers: ['tests/unit/security/admin-authority.test.ts'], to: 'security', entry: 'internal/admin-authority.ts', owner: 'source-tests' },
    { id: 'test-whitebox-61', importers: ['tests/unit/server/mcp-api-operation-recovery.test.ts'], to: 'action-invocation', entry: 'reconciliation-evidence.ts', owner: 'source-tests' },
    { id: 'test-whitebox-62', importers: ['tests/unit/capability-execution/provider-consequence-bridge.test.ts'], to: 'capability-execution', entry: 'invocation-worker/providerConsequenceBridge.ts', owner: 'source-tests' },
    { id: 'test-whitebox-63', importers: ['tests/unit/convex/provider-connection-projection.test.ts'], to: 'capability-supply', entry: 'internal/provider-connection/shared.ts', owner: 'source-tests' },
    { id: 'test-whitebox-64', importers: ['tests/unit/convex/provider-connection-projection.test.ts'], to: 'capability-supply', entry: 'internal/provider-connection/types.ts', owner: 'source-tests' },
    { id: 'test-whitebox-65', importers: ['tests/unit/convex/provider-connection-projection.test.ts'], to: 'capability-supply', entry: 'internal/provider-connection/lease.ts', owner: 'source-tests' },
    { id: 'test-whitebox-66', importers: ['tests/unit/capability-supply/readiness-probe-quote.test.ts', 'tests/unit/capability-supply/readiness-probe-http-json.test.ts'], to: 'capability-supply', entry: 'internal/readiness-probe-shared.ts', owner: 'source-tests' },
  ],
}

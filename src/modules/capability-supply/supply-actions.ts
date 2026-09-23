import { MARKET_SUPPLY_MANAGE_SCOPE } from '@/modules/agent-access/contract'
import { defineAction, type ActionParameter } from '@/modules/common/action'
import {
  supplySourceInputSchema,
  supplySourcePreviewSchema,
  type SupplySourceInput,
  type SupplySourcePreview,
} from './source-preview'
import {
  callStateValues,
  providerConnectionLifecycleSchema,
  supplyCallsInputSchema,
  supplyCallsResultSchema,
  supplyConnectionCommandResultSchema,
  supplyConnectionConnectInputSchema,
  supplyConnectionDetailInputSchema,
  supplyConnectionDetailResultSchema,
  supplyConnectionListInputSchema,
  supplyConnectionListResultSchema,
  supplyConnectionTransitionInputSchema,
  supplyEarningsInputSchema,
  supplyEarningsResultSchema,
  supplyOffboardingStatusInputSchema,
  supplyOffboardingStatusResultSchema,
  supplyPublishInputSchema,
  supplyPublishResultSchema,
  supplyRecheckResultSchema,
  supplyStatusInputSchema,
  supplyStatusResultSchema,
  supplyToolsListInputSchema,
  supplyToolsListResultSchema,
  supplyWithdrawInputSchema,
  supplyWithdrawResultSchema,
  supplyRepublishResultSchema,
  type SupplyCallsInput,
  type SupplyCallsResult,
  type SupplyConnectionCommandResult,
  type SupplyConnectionConnectInput,
  type SupplyConnectionDetailInput,
  type SupplyConnectionDetailResult,
  type SupplyConnectionListInput,
  type SupplyConnectionListResult,
  type SupplyConnectionTransitionInput,
  type SupplyEarningsInput,
  type SupplyEarningsResult,
  type SupplyOffboardingStatusInput,
  type SupplyOffboardingStatusResult,
  type SupplyPublishInput,
  type SupplyPublishResult,
  type SupplyRecheckInput,
  type SupplyRecheckResult,
  type SupplyRepublishInput,
  type SupplyRepublishResult,
  type SupplyStatusInput,
  type SupplyStatusResult,
  type SupplyToolsListInput,
  type SupplyToolsListResult,
  type SupplyWithdrawInput,
  type SupplyWithdrawResult,
} from './supply-action-schemas'

export const SUPPLY_ACTION_IDS = Object.freeze({
  sourcePreview: 'supply.source.preview',
  toolsList: 'supply.tools.list',
  status: 'supply.status',
  publish: 'supply.publish',
  withdraw: 'supply.withdraw',
  recheck: 'supply.recheck',
  republish: 'supply.republish',
  earnings: 'supply.earnings',
  calls: 'supply.calls',
  connectionList: 'supply.connection.list',
  connectionDetail: 'supply.connection.detail',
  connectionConnect: 'supply.connection.connect',
  connectionReconnect: 'supply.connection.reconnect',
  connectionRevoke: 'supply.connection.revoke',
  offboardingStatus: 'supply.offboarding.status',
} as const)

export const SUPPLY_ACTION_ROUTE_CONTRACTS = Object.freeze({
  sourcePreview: Object.freeze({ actionId: SUPPLY_ACTION_IDS.sourcePreview, contractVersion: 'supply.source.preview:v1', method: 'POST' as const, path: '/api/v1/supply/sources/preview', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  toolsList: Object.freeze({ actionId: SUPPLY_ACTION_IDS.toolsList, contractVersion: 'supply.tools.list:v1', method: 'POST' as const, path: '/api/v1/supply/tools/list', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  status: Object.freeze({ actionId: SUPPLY_ACTION_IDS.status, contractVersion: 'supply.status:v2', method: 'POST' as const, path: '/api/v1/supply/status', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  publish: Object.freeze({ actionId: SUPPLY_ACTION_IDS.publish, contractVersion: 'supply.publish:v2', method: 'POST' as const, path: '/api/v1/supply/publish', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  withdraw: Object.freeze({ actionId: SUPPLY_ACTION_IDS.withdraw, contractVersion: 'supply-withdrawal:v1', method: 'POST' as const, path: '/api/v1/supply/withdraw', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  recheck: Object.freeze({ actionId: SUPPLY_ACTION_IDS.recheck, contractVersion: 'supply-recheck:v1', method: 'POST' as const, path: '/api/v1/supply/recheck', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  republish: Object.freeze({ actionId: SUPPLY_ACTION_IDS.republish, contractVersion: 'supply-republish:v1', method: 'POST' as const, path: '/api/v1/supply/republish', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  earnings: Object.freeze({ actionId: SUPPLY_ACTION_IDS.earnings, contractVersion: 'supply-earnings:v1', method: 'POST' as const, path: '/api/v1/supply/earnings', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  calls: Object.freeze({ actionId: SUPPLY_ACTION_IDS.calls, contractVersion: 'supply-calls:v1', method: 'POST' as const, path: '/api/v1/supply/calls', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionList: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionList, contractVersion: 'supply.connection.list:v2', method: 'POST' as const, path: '/api/v1/supply/connections/list', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionDetail: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionDetail, contractVersion: 'supply.connection.detail:v2', method: 'POST' as const, path: '/api/v1/supply/connections/detail', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionConnect: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionConnect, contractVersion: 'supply.connection.connect:v3', method: 'POST' as const, path: '/api/v1/supply/connections/connect', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionReconnect: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionReconnect, contractVersion: 'supply.connection.reconnect:v2', method: 'POST' as const, path: '/api/v1/supply/connections/reconnect', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  connectionRevoke: Object.freeze({ actionId: SUPPLY_ACTION_IDS.connectionRevoke, contractVersion: 'supply.connection.revoke:v2', method: 'POST' as const, path: '/api/v1/supply/connections/revoke', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
  offboardingStatus: Object.freeze({ actionId: SUPPLY_ACTION_IDS.offboardingStatus, contractVersion: 'supply.offboarding.status:v1', method: 'POST' as const, path: '/api/v1/supply/offboarding/status', scope: MARKET_SUPPLY_MANAGE_SCOPE }),
})

export {
  callStateValues,
  callStateSchema,
  providerConnectionLifecycleSchema,
  providerConnectionProjectionSchema,
  supplyCallOutcomeSchema,
  supplyCallSummarySchema,
  supplyCallsInputSchema,
  supplyCallsResultSchema,
  supplyConnectionCommandResultSchema,
  supplyConnectionConnectInputSchema,
  supplyConnectionDetailInputSchema,
  supplyConnectionDetailResultSchema,
  supplyConnectionListInputSchema,
  supplyConnectionListResultSchema,
  supplyConnectionTransitionInputSchema,
  supplyEarningsInputSchema,
  supplyEarningsResultSchema,
  supplyOffboardingStatusInputSchema,
  supplyOffboardingStatusResultSchema,
  supplyPublishInputSchema,
  supplyPublishResultSchema,
  supplyRecheckResultSchema,
  supplyRepublishResultSchema,
  supplyStatusInputSchema,
  supplyStatusResultSchema,
  supplyToolsListInputSchema,
  supplyToolsListResultSchema,
  supplyWithdrawInputSchema,
  supplyWithdrawResultSchema,
  type ProviderConnectionProjection,
  type SupplyCallsInput,
  type SupplyCallsResult,
  type SupplyConnectionCommandResult,
  type SupplyConnectionConnectInput,
  type SupplyConnectionDetailInput,
  type SupplyConnectionDetailResult,
  type SupplyConnectionListInput,
  type SupplyConnectionListResult,
  type SupplyConnectionTransitionInput,
  type SupplyEarningsInput,
  type SupplyEarningsResult,
  type SupplyOffboardingStatusInput,
  type SupplyOffboardingStatusResult,
  type SupplyPublishInput,
  type SupplyPublishResult,
  type SupplyRecheckInput,
  type SupplyRecheckResult,
  type SupplyRepublishInput,
  type SupplyRepublishResult,
  type SupplyStatusInput,
  type SupplyStatusResult,
  type SupplyToolsListInput,
  type SupplyToolsListResult,
  type SupplyWithdrawInput,
  type SupplyWithdrawResult,
} from './supply-action-schemas'

export {
  createSupplyManagementService,
  type SupplyManagementService,
} from './supply-management-service'

const publishParameters: readonly ActionParameter[] = [
  { name: 'businessRef', type: 'string', description: 'Business selected by the authenticated Provider principal.', required: true },
  { name: 'source', type: 'object', description: 'The same native source supplied to preview.', required: true },
  { name: 'candidateRef', type: 'string', description: 'Exact candidate returned by preview.', required: true },
  { name: 'expectedSourceDigest', type: 'string', description: 'Exact preview digest used to reject source drift.', required: true },
  { name: 'connectionRef', type: 'string', description: 'Stable Provider connection when the source requires authentication.', required: false },
  { name: 'presentation', type: 'object', description: 'Provider-facing name, description and category.', required: true },
  { name: 'consequences', type: 'object', description: 'Declared effects, data use and evidence requirements.', required: true },
  { name: 'pricing', type: 'object', description: 'Free, fixed AUD or source-derived x402 pricing.', required: true },
  { name: 'validationInput', type: 'object', description: 'Optional source-native validation input.', required: false },
  { name: 'environment', type: 'enum', enum: ['sandbox', 'production'], description: 'Target environment.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
  { name: 'attestation', type: 'object', description: 'Exact Provider publication attestations.', required: true },
]
const maintenanceParameters: readonly ActionParameter[] = [
  { name: 'businessId', type: 'string', description: 'Owner business selected by the authenticated principal.', required: true },
  { name: 'offeringRef', type: 'string', description: 'Current catalog offering reference.', required: true },
  { name: 'offeringRevision', type: 'number', description: 'Current catalog offering revision.', required: true },
  { name: 'offeringSourceHash', type: 'string', description: 'Current catalog offering source hash.', required: true },
  { name: 'publicationRef', type: 'string', description: 'Exact current publication reference.', required: true },
  { name: 'publicationRevision', type: 'number', description: 'Exact current publication revision.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
]
const connectionTransitionParameters: readonly ActionParameter[] = [
  { name: 'connectionRef', type: 'string', description: 'Exact provider connection reference.', required: true },
  { name: 'expectedAuthorityGeneration', type: 'number', description: 'Current authority generation returned by detail.', required: true },
  { name: 'expectedAuthorityDigest', type: 'string', description: 'Current authority digest returned by detail.', required: true },
  { name: 'reasonCode', type: 'string', description: 'Optional bounded lifecycle reason.', required: false },
  { name: 'evidenceRefs', type: 'array', description: 'Durable non-secret evidence references.', required: true },
  { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
]
const supplyBoundaries = [
  `Requires an authenticated owner-bound ${MARKET_SUPPLY_MANAGE_SCOPE} credential.`,
  'Business ownership, lifecycle, source admission, current publication, prices, provider authority, and payment controls are resolved server-side.',
  'Credential and wallet secret material is refused before durable storage; provider authority selectors are revalidated server-side and never returned.',
] as const
const supplySurfaces = ['http', 'mcp', 'cli'] as const
const supplyCredentialAdmission = {
  scope: MARKET_SUPPLY_MANAGE_SCOPE,
  authority: 'descriptor_classified' as const,
}

export const supplySourcePreviewAction = defineAction<SupplySourceInput, SupplySourcePreview>({
  id: SUPPLY_ACTION_IDS.sourcePreview,
  name: 'Preview Provider source',
  summary: 'Discover exact candidate Tools from one native Provider source without publishing or invoking them.',
  boundaries: [
    ...supplyBoundaries,
    'Preview is read-only: it creates no Offering, Tool, buyer authority, payment, or Provider effect.',
    'A public source proves only source contents; Provider authority is established separately.',
  ],
  schema: supplySourceInputSchema,
  outputSchema: supplySourcePreviewSchema,
  parameters: [
    { name: 'kind', type: 'enum', enum: ['openapi', 'mcp', 'agent_plugin', 'x402'], description: 'Native Provider source type.', required: true },
    { name: 'definitionUrl', type: 'string', description: 'Public HTTPS OpenAPI document URL when kind is openapi.', required: false },
    { name: 'serverUrl', type: 'string', description: 'Public HTTPS streamable HTTP MCP server URL when kind is mcp.', required: false },
    { name: 'registryName', type: 'string', description: 'Official MCP Registry name when kind is mcp.', required: false },
    { name: 'pluginJson', type: 'object', description: 'Official Agent Plugins 1.0 plugin.json object when kind is agent_plugin.', required: false },
    { name: 'mcpJson', type: 'object', description: 'Official Agent Plugins 1.0 mcp.json object when kind is agent_plugin.', required: false },
    { name: 'resourceUrl', type: 'string', description: 'Public HTTPS x402 resource URL when kind is x402.', required: false },
    { name: 'method', type: 'enum', enum: ['GET', 'POST'], description: 'x402 resource method.', required: false },
    { name: 'environment', type: 'enum', enum: ['sandbox', 'production'], description: 'Target environment.', required: true },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'provider_system', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.sourcePreview.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['kind', 'definitionUrl', 'serverUrl', 'registryName', 'pluginJson', 'mcpJson', 'resourceUrl', 'method', 'environment'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['source_digest', 'source_revision', 'tool_candidates'],
    safeContinuations: ['supply.connection.connect', 'supply.publish'],
    invalidationConditions: ['source_changed', 'source_authentication_changed', 'environment_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.sourcePreview({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyStatusAction = defineAction<SupplyStatusInput, SupplyStatusResult>({
  id: SUPPLY_ACTION_IDS.status,
  name: 'Read Provider Tool status',
  summary: 'Read one exact Provider Tool through the shared eight-state lifecycle and its single safe next action.',
  boundaries: supplyBoundaries,
  schema: supplyStatusInputSchema,
  outputSchema: supplyStatusResultSchema,
  parameters: [
    { name: 'businessRef', type: 'string', description: 'Business selected by the authenticated Provider principal.', required: true },
    { name: 'toolRef', type: 'string', description: 'Exact Tool reference.', required: true },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.status.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['businessRef', 'toolRef'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['provider_tool_lifecycle'],
    safeContinuations: ['supply.publish', 'supply.recheck', 'supply.withdraw', 'supply.republish'],
    invalidationConditions: ['business_changed', 'tool_changed', 'publication_revision_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.status({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyToolsListAction = defineAction<SupplyToolsListInput, SupplyToolsListResult>({
  id: SUPPLY_ACTION_IDS.toolsList,
  name: 'List Provider Tools',
  summary: 'List one bounded page of Provider Tools through the shared eight-state lifecycle.',
  boundaries: supplyBoundaries,
  schema: supplyToolsListInputSchema,
  outputSchema: supplyToolsListResultSchema,
  parameters: [
    { name: 'businessRef', type: 'string', description: 'Business selected by the authenticated Provider principal.', required: true },
    { name: 'limit', type: 'number', description: 'Page size from 1 through 100; defaults to 50.', required: false },
    { name: 'cursor', type: 'string', description: 'Opaque cursor returned by the previous page.', required: false },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.toolsList.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['businessRef', 'limit', 'cursor'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['provider_tool_collection'],
    safeContinuations: ['supply.status', 'supply.publish'],
    invalidationConditions: ['business_changed', 'cursor_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.toolsList({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyPublishAction = defineAction<SupplyPublishInput, SupplyPublishResult>({
  id: SUPPLY_ACTION_IDS.publish,
  name: 'Publish Provider Tool',
  summary: 'Submit one exact previewed Provider Tool for validation and automatic publication.',
  boundaries: supplyBoundaries,
  schema: supplyPublishInputSchema,
  outputSchema: supplyPublishResultSchema,
  parameters: publishParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: true },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.publish.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessRef', 'source', 'candidateRef', 'expectedSourceDigest', 'connectionRef', 'presentation', 'consequences', 'pricing', 'validationInput', 'environment', 'idempotencyKey', 'attestation'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['source_publication', 'publication_identity'], safeContinuations: ['supply.status'], invalidationConditions: ['source_changed', 'candidate_changed', 'connection_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.publish({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyWithdrawAction = defineAction<SupplyWithdrawInput, SupplyWithdrawResult>({
  id: SUPPLY_ACTION_IDS.withdraw,
  name: 'Withdraw Provider capability',
  summary: 'Withdraw one exact current Provider publication without cancelling running work.',
  boundaries: supplyBoundaries,
  schema: supplyWithdrawInputSchema,
  outputSchema: supplyWithdrawResultSchema,
  parameters: maintenanceParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: true },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.withdraw.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'publicationRef', 'publicationRevision', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['withdrawal_identity'], safeContinuations: ['supply.status', 'supply.republish'], invalidationConditions: ['publication_ref_changed', 'publication_revision_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.withdraw({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyRecheckAction = defineAction<SupplyRecheckInput, SupplyRecheckResult>({
  id: SUPPLY_ACTION_IDS.recheck,
  name: 'Recheck Provider capability',
  summary: 'Schedule readiness revalidation for one exact current Provider publication.',
  boundaries: supplyBoundaries,
  schema: supplyWithdrawInputSchema,
  outputSchema: supplyRecheckResultSchema,
  parameters: maintenanceParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: false },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.recheck.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'publicationRef', 'publicationRevision', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['readiness_recheck_scheduled'], safeContinuations: ['supply.status'], invalidationConditions: ['publication_ref_changed', 'publication_revision_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.recheck({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyRepublishAction = defineAction<SupplyRepublishInput, SupplyRepublishResult>({
  id: SUPPLY_ACTION_IDS.republish,
  name: 'Republish Provider capability',
  summary: 'Republish one exact withdrawn Provider publication from admitted durable material.',
  boundaries: supplyBoundaries,
  schema: supplyWithdrawInputSchema,
  outputSchema: supplyRepublishResultSchema,
  parameters: maintenanceParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'business', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: true },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.republish.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['businessId', 'offeringRef', 'offeringRevision', 'offeringSourceHash', 'publicationRef', 'publicationRevision', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['publication_identity'], safeContinuations: ['supply.status'], invalidationConditions: ['publication_ref_changed', 'publication_revision_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.republish({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyEarningsAction = defineAction<SupplyEarningsInput, SupplyEarningsResult>({
  id: SUPPLY_ACTION_IDS.earnings,
  name: 'Read Provider earnings',
  summary: 'Read exact provider earnings and payout status for one currency.',
  boundaries: supplyBoundaries,
  schema: supplyEarningsInputSchema,
  outputSchema: supplyEarningsResultSchema,
  parameters: [{ name: 'currency', type: 'string', description: 'ISO-like uppercase ledger currency.', required: true }],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.earnings.contractVersion, consequenceClass: 'read_only', materialInputPaths: ['currency'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['earnings_projection'], safeContinuations: ['supply.status'], invalidationConditions: ['currency_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.earnings({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyCallsAction = defineAction<SupplyCallsInput, SupplyCallsResult>({
  id: SUPPLY_ACTION_IDS.calls,
  name: 'List Provider Calls',
  summary: 'List the authenticated Provider’s own bounded page of Quotes/Calls, newest first, across its current Tools.',
  boundaries: [
    ...supplyBoundaries,
    'Returns only Calls against Tools the authenticated Provider currently publishes.',
    'Rows omit buyer identity, credentials, idempotency keys, and Tool input/output payloads.',
  ],
  schema: supplyCallsInputSchema,
  outputSchema: supplyCallsResultSchema,
  parameters: [
    { name: 'state', type: 'enum', description: 'Optional canonical Call state filter.', required: false, enum: callStateValues },
    { name: 'limit', type: 'number', description: 'Page size from 1 through 100; defaults to 20.', required: false },
    { name: 'cursor', type: 'string', description: 'Opaque cursor returned by the previous page.', required: false },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.calls.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['state', 'limit', 'cursor'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['call_summaries'],
    safeContinuations: ['supply.status'],
    invalidationConditions: ['state_filter_changed', 'cursor_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.calls({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionListAction = defineAction<SupplyConnectionListInput, SupplyConnectionListResult>({
  id: SUPPLY_ACTION_IDS.connectionList,
  name: 'List Provider connections',
  summary: 'List the bounded provider connections owned by one Provider business, including lifecycle and recovery state.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionListInputSchema,
  outputSchema: supplyConnectionListResultSchema,
  parameters: [
    { name: 'businessId', type: 'string', description: 'Owner business selected by the authenticated principal.', required: true },
    { name: 'lifecycle', type: 'enum', description: 'Optional exact connection lifecycle filter.', required: false, enum: providerConnectionLifecycleSchema.options },
    { name: 'limit', type: 'number', description: 'Bounded result limit from 1 through 100.', required: false },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionList.contractVersion, consequenceClass: 'read_only', materialInputPaths: ['businessId', 'lifecycle', 'limit'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_collection'], safeContinuations: ['supply.connection.detail', 'supply.connection.connect'], invalidationConditions: ['business_changed', 'lifecycle_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionList({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionDetailAction = defineAction<SupplyConnectionDetailInput, SupplyConnectionDetailResult>({
  id: SUPPLY_ACTION_IDS.connectionDetail,
  name: 'Inspect Provider connection',
  summary: 'Inspect one exact provider connection, its current concurrency identity, availability, and recovery state without exposing credentials.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionDetailInputSchema,
  outputSchema: supplyConnectionDetailResultSchema,
  parameters: [{ name: 'connectionRef', type: 'string', description: 'Exact provider connection reference.', required: true }],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionDetail.contractVersion, consequenceClass: 'read_only', materialInputPaths: ['connectionRef'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_state'], safeContinuations: ['supply.connection.reconnect', 'supply.connection.revoke'], invalidationConditions: ['authority_generation_changed', 'authority_digest_changed', 'lifecycle_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionDetail({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionConnectAction = defineAction<SupplyConnectionConnectInput, SupplyConnectionCommandResult>({
  id: SUPPLY_ACTION_IDS.connectionConnect,
  name: 'Connect Provider service',
  summary: 'Open a secure owner handoff for protected HTTP or MCP supply, or verify x402 wallet control without accepting credential material from the agent.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionConnectInputSchema,
  outputSchema: supplyConnectionCommandResultSchema,
  parameters: [
    { name: 'kind', type: 'enum', description: 'Native authentication lane for the selected source.', required: true, enum: ['http_credential', 'mcp_oauth', 'x402'] },
    { name: 'businessRef', type: 'string', description: 'Business selected by the authenticated Provider principal.', required: true },
    { name: 'sourceUrl', type: 'string', description: 'Protected OpenAPI source URL for an HTTP credential handoff.', required: false },
    { name: 'serverUrl', type: 'string', description: 'Protected MCP server URL for an OAuth handoff.', required: false },
    { name: 'authentication', type: 'object', description: 'HTTP authentication scheme and credential placement, never the credential itself.', required: false },
    { name: 'resourceUrl', type: 'string', description: 'Public HTTPS x402 resource URL.', required: false },
    { name: 'method', type: 'enum', description: 'Exact x402 inspection method.', required: false, enum: ['GET', 'POST'] },
    { name: 'environment', type: 'enum', description: 'Sandbox or Production; it must match the Provider agent credential.', required: true, enum: ['sandbox', 'production'] },
    { name: 'observationDigest', type: 'string', description: 'Exact live x402 observation being claimed.', required: false },
    { name: 'payTo', type: 'string', description: 'Exact x402 payee whose wallet proves control.', required: false },
    { name: 'claimExpiresAt', type: 'number', description: 'Short-lived x402 seller-claim expiry.', required: false },
    { name: 'claimSignature', type: 'string', description: 'Wallet signature over the exact x402 seller claim.', required: false },
    { name: 'evidenceRefs', type: 'array', description: 'Durable non-secret x402 evidence references.', required: false },
    { name: 'idempotencyKey', type: 'string', description: 'Stable replay/conflict command identity.', required: true },
  ],
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['operation_input'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: false },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionConnect.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['kind', 'businessRef', 'sourceUrl', 'serverUrl', 'authentication', 'resourceUrl', 'method', 'environment', 'observationDigest', 'payTo', 'claimExpiresAt', 'claimSignature', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_attempt_or_identity'], safeContinuations: ['supply.connection.detail', 'supply.publish'], invalidationConditions: ['business_changed', 'source_changed', 'authentication_changed', 'environment_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionConnect({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionReconnectAction = defineAction<SupplyConnectionTransitionInput, SupplyConnectionCommandResult>({
  id: SUPPLY_ACTION_IDS.connectionReconnect,
  name: 'Reconnect Provider connection',
  summary: 'Refresh one exact provider connection only when its authority generation and digest are still current.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionTransitionInputSchema,
  outputSchema: supplyConnectionCommandResultSchema,
  parameters: connectionTransitionParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: false },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionReconnect.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['connectionRef', 'expectedAuthorityGeneration', 'expectedAuthorityDigest', 'reasonCode', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['provider_connection_authority'], safeContinuations: ['supply.connection.detail', 'supply.recheck'], invalidationConditions: ['authority_generation_changed', 'authority_digest_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionReconnect({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyConnectionRevokeAction = defineAction<SupplyConnectionTransitionInput, SupplyConnectionCommandResult>({
  id: SUPPLY_ACTION_IDS.connectionRevoke,
  name: 'Revoke Provider connection',
  summary: 'Begin revocation for one exact current provider connection, invalidate active leases, and schedule cleanup.',
  boundaries: supplyBoundaries,
  schema: supplyConnectionTransitionInputSchema,
  outputSchema: supplyConnectionCommandResultSchema,
  parameters: connectionTransitionParameters,
  readOnly: false,
  effect: { class: 'external_state_change', reversible: false, recipientKind: 'provider_system', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'policy_eligible' },
  surfaces: supplySurfaces,
  mcp: { idempotent: true, openWorld: true, destructive: true },
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: { version: SUPPLY_ACTION_ROUTE_CONTRACTS.connectionRevoke.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['connectionRef', 'expectedAuthorityGeneration', 'expectedAuthorityDigest', 'reasonCode', 'evidenceRefs', 'idempotencyKey'], authorityRequirement: 'principal', retryClass: 'reconcile_before_retry', expectedEvidence: ['provider_connection_revocation'], safeContinuations: ['supply.connection.detail'], invalidationConditions: ['authority_generation_changed', 'authority_digest_changed', 'idempotency_key_changed'] },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.connectionRevoke({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

export const supplyOffboardingStatusAction = defineAction<SupplyOffboardingStatusInput, SupplyOffboardingStatusResult>({
  id: SUPPLY_ACTION_IDS.offboardingStatus,
  name: 'Read Provider offboarding status',
  summary: 'Read the durable Provider offboarding case and its one safe next action. Only the Business owner can start or resume offboarding.',
  boundaries: [
    ...supplyBoundaries,
    'This action cannot start, cancel, resume, or widen a Provider offboarding case.',
  ],
  schema: supplyOffboardingStatusInputSchema,
  outputSchema: supplyOffboardingStatusResultSchema,
  parameters: [
    { name: 'businessRef', type: 'string', description: 'Business selected by the authenticated Provider principal.', required: true },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'business', dataClasses: ['usage_evidence'], spendExposure: 'none', approval: 'none' },
  surfaces: supplySurfaces,
  credentialAdmission: supplyCredentialAdmission,
  invocationContract: {
    version: SUPPLY_ACTION_ROUTE_CONTRACTS.offboardingStatus.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['businessRef'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['provider_offboarding_case'],
    safeContinuations: ['supply.offboarding.status'],
    invalidationConditions: ['business_changed', 'offboarding_case_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.supplyManagementService === undefined) throw new Error('supply_management_service_unavailable')
    return await context.supplyManagementService.offboardingStatus({ input: data, principal: context.agentAccessPrincipal, correlationId: context.correlationId ?? globalThis.crypto.randomUUID() })
  },
})

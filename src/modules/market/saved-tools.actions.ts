import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import { defineAction } from '@/modules/common/action'
import {
  savedToolRemoveInputSchema, savedToolRemoveResultSchema,
  savedToolSaveInputSchema, savedToolSaveResultSchema,
  savedToolsListInputSchema, savedToolsListResultSchema,
  type SavedToolIdentity, type SavedToolSaveInput,
  type SavedToolRemoveResult, type SavedToolSaveResult, type SavedToolsListResult,
} from './saved-tools.contracts'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'

export const SAVED_TOOLS_ROUTE_CONTRACTS = Object.freeze({
  list: { actionId: 'market.savedTools.list', contractVersion: 'saved-tools-list:v1', method: 'POST', path: '/api/v1/saved-tools/list', routerPath: '/api/v1/saved-tools/list', scope: MARKET_TOOLS_CALL_SCOPE },
  save: { actionId: 'market.savedTools.save', contractVersion: 'saved-tools-save:v1', method: 'POST', path: '/api/v1/saved-tools/save', routerPath: '/api/v1/saved-tools/save', scope: MARKET_TOOLS_CALL_SCOPE },
  remove: { actionId: 'market.savedTools.remove', contractVersion: 'saved-tools-remove:v1', method: 'POST', path: '/api/v1/saved-tools/remove', routerPath: '/api/v1/saved-tools/remove', scope: MARKET_TOOLS_CALL_SCOPE },
} as const)


export type SavedToolsService = Readonly<{
  list: (principal: AgentAccessPrincipal, correlationId: string) => Promise<SavedToolsListResult>
  save: (identity: SavedToolSaveInput, principal: AgentAccessPrincipal, correlationId: string) => Promise<SavedToolSaveResult>
  remove: (identity: SavedToolIdentity, principal: AgentAccessPrincipal, correlationId: string) => Promise<SavedToolRemoveResult>
}>

declare module '@/modules/common/action' {
  interface ActionContextComposition { savedToolsService?: SavedToolsService }
}

export const savedToolsListAction = defineAction({
  id: SAVED_TOOLS_ROUTE_CONTRACTS.list.actionId, name: 'List saved Tools', summary: 'Read this account’s saved Tool identities with current details.',
  boundaries: ['Owner-scoped. Live price and description are not saved.', 'Missing Tools remain removable.'],
  schema: savedToolsListInputSchema, outputSchema: savedToolsListResultSchema, parameters: [],
  readOnly: true, effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: ['saved_tool_identity'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp', 'cli'], credentialAdmission: { scope: MARKET_TOOLS_CALL_SCOPE, authority: 'descriptor_classified' },
  invocationContract: { version: SAVED_TOOLS_ROUTE_CONTRACTS.list.contractVersion, consequenceClass: 'read_only', materialInputPaths: [], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['saved_tool_identities'], safeContinuations: ['market.savedTools.remove'], invalidationConditions: ['credential_revoked'] },
  run: async ({ context }) => { if (!context.agentAccessPrincipal || !context.savedToolsService) throw new Error('saved_tools_authentication_required'); return context.savedToolsService.list(context.agentAccessPrincipal, context.correlationId ?? crypto.randomUUID()) },
})
export const savedToolsSaveAction = defineAction({
  id: SAVED_TOOLS_ROUTE_CONTRACTS.save.actionId, name: 'Save Tool', summary: 'Save a currently resolved Tool identity to the authenticated account.',
  boundaries: ['Stores identity only, never a price, schema, credential or Call input.', 'Does not Quote or Call.'],
  schema: savedToolSaveInputSchema, outputSchema: savedToolSaveResultSchema,
  parameters: [{ name: 'kind', type: 'string', description: 'ae_callable or external_listing.', required: true }, { name: 'toolRef', type: 'string', description: 'Callable Tool reference.', required: false }, { name: 'resource', type: 'string', description: 'External listing resource URL.', required: false }, { name: 'id', type: 'string', description: 'Compact external result ID; resolves before saving.', required: false }],
  readOnly: false, effect: { class: 'external_state_change', reversible: true, recipientKind: 'none', dataClasses: ['saved_tool_identity'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp', 'cli'], mcp: { idempotent: true, openWorld: false, destructive: false }, credentialAdmission: { scope: MARKET_TOOLS_CALL_SCOPE, authority: 'descriptor_classified' },
  invocationContract: { version: SAVED_TOOLS_ROUTE_CONTRACTS.save.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['kind', 'toolRef', 'resource', 'id'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['saved_tool_identity'], safeContinuations: ['market.savedTools.list'], invalidationConditions: ['tool_identity_changed', 'credential_revoked'] },
  run: async ({ data, context }) => { if (!context.agentAccessPrincipal || !context.savedToolsService) throw new Error('saved_tools_authentication_required'); return context.savedToolsService.save(data, context.agentAccessPrincipal, context.correlationId ?? crypto.randomUUID()) },
})
export const savedToolsRemoveAction = defineAction({
  id: SAVED_TOOLS_ROUTE_CONTRACTS.remove.actionId, name: 'Remove saved Tool', summary: 'Remove an exact saved identity even if the original Tool has gone.',
  boundaries: ['Only the owning account’s identity can be removed.', 'No Quote or Call state is changed.'],
  schema: savedToolRemoveInputSchema, outputSchema: savedToolRemoveResultSchema,
  parameters: [{ name: 'kind', type: 'string', description: 'ae_callable or external_listing.', required: true }, { name: 'toolRef', type: 'string', description: 'Callable Tool reference.', required: false }, { name: 'resource', type: 'string', description: 'External listing resource URL.', required: false }],
  readOnly: false, effect: { class: 'external_state_change', reversible: true, recipientKind: 'none', dataClasses: ['saved_tool_identity'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp', 'cli'], mcp: { idempotent: true, openWorld: false, destructive: true }, credentialAdmission: { scope: MARKET_TOOLS_CALL_SCOPE, authority: 'descriptor_classified' },
  invocationContract: { version: SAVED_TOOLS_ROUTE_CONTRACTS.remove.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['kind', 'toolRef', 'resource'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['saved_tool_removal'], safeContinuations: ['market.savedTools.list'], invalidationConditions: ['tool_identity_changed', 'credential_revoked'] },
  run: async ({ data, context }) => { if (!context.agentAccessPrincipal || !context.savedToolsService) throw new Error('saved_tools_authentication_required'); return context.savedToolsService.remove(data, context.agentAccessPrincipal, context.correlationId ?? crypto.randomUUID()) },
})

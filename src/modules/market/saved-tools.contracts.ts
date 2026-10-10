import { z } from 'zod'
import { MARKET_TOOLS_CALL_SCOPE } from '@/modules/agent-access/contract'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { defineAction } from '@/modules/common/action'

import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import { publicToolDescriptorSchema } from '@/modules/capability-supply/tool-schemas'
import type { X402DirectoryEntry, X402DirectoryInput } from './x402-directory'

export const DIRECTORY_SAVED_TOOLS_LIMIT = 100

// Search cards still use this ephemeral presentation input; nothing from it is persisted.
export type SavedDirectoryTool = Readonly<{ entry: X402DirectoryEntry; search: X402DirectoryInput }>

export const savedToolIdentitySchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ae_callable'), toolRef: z.string().regex(/^operation:v1:[0-9a-f]{64}$/u) }),
  z.strictObject({ kind: z.literal('external_listing'), resource: z.url().max(8192).refine(value => value.startsWith('https://'), 'HTTPS resource required') }),
])
export const savedToolSaveInputSchema = z.union([
  savedToolIdentitySchema,
  z.strictObject({ kind: z.literal('external_listing'), id: z.string().regex(/^registry:[a-f0-9]{64}$/u) }),
])
export const savedToolRemoveInputSchema = savedToolIdentitySchema
export const savedToolsListInputSchema = z.strictObject({})
export type SavedToolIdentity = z.infer<typeof savedToolIdentitySchema>
export type SavedToolSaveInput = z.infer<typeof savedToolSaveInputSchema>
export type SavedToolListItem = Readonly<{
  identity: SavedToolIdentity
  createdAt: number
  detail: Readonly<{ kind: 'found'; tool: PublicToolDescriptor }> | Readonly<{ kind: 'found'; entry: X402DirectoryEntry }>
    | Readonly<{ kind: 'not_found' | 'unavailable' }>
}>
const publicToolSchema = publicToolDescriptorSchema
const directoryFieldSchema = z.strictObject({
  name: z.string(), path: z.string(),
  location: z.enum(['body', 'queryParams', 'pathParams', 'headers', 'output']),
  source: z.enum(['schema', 'example']), type: z.string().optional(),
  required: z.boolean().optional(), description: z.string().optional(),
  enumValues: z.array(z.string()).optional(), defaultJson: z.string().optional(),
  exampleJson: z.string().optional(), constraints: z.array(z.string()).optional(),
})
const directoryContractSchema = z.strictObject({
  fields: z.array(directoryFieldSchema), type: z.string().optional(), schemaJson: z.string().optional(),
  exampleJson: z.string().optional(), schemaOmitted: z.literal(true).optional(),
  exampleOmitted: z.literal(true).optional(), fieldsTruncated: z.literal(true).optional(),
})
const directoryEntrySchema = z.strictObject({
  resource: z.string(), title: z.string(), description: z.string(), protocol: z.string(),
  provider: z.string(), metadataJson: z.string(),
  prices: z.array(z.strictObject({
    network: z.string(), networkLabel: z.string().optional(), scheme: z.string(),
    amount: z.string(), asset: z.string().optional(), symbol: z.string().optional(),
    decimalAmount: z.string().optional(), payTo: z.string().optional(),
  })),
  serviceName: z.string().optional(), iconUrl: z.string().optional(), skillUrl: z.string().optional(),
  category: z.string().optional(), input: directoryContractSchema.optional(), output: directoryContractSchema.optional(),
  method: z.string().optional(), methodLabel: z.string().optional(),
  outputSummary: z.string().optional(), schemaSummary: z.string().optional(),
  tags: z.array(z.string()).optional(), curated: z.literal(true).optional(),
  bundleSlugs: z.array(z.string()).optional(), slug: z.string().optional(),
  provenance: z.strictObject({
    directory: z.literal('Coinbase Bazaar'), metadata: z.literal('provider_declared'), updatedAt: z.string().optional(),
  }).optional(),
  activity: z.strictObject({
    calls30d: z.number().optional(), payers30d: z.number().optional(), lastCalledAt: z.string().optional(),
  }).optional(),
  choice: z.strictObject({
    access: z.enum(['ae_callable', 'setup_required', 'unavailable']),
    toolRef: z.string().optional(), sourceRouteRef: z.string().optional(), reason: z.string().optional(),
  }).optional(),
  audEstimate: z.string().optional(),
})
export const savedToolListItemSchema = z.strictObject({
  identity: savedToolIdentitySchema,
  createdAt: z.number().int().nonnegative(),
  detail: z.union([
    z.strictObject({ kind: z.literal('found'), tool: publicToolSchema }),
    z.strictObject({ kind: z.literal('found'), entry: directoryEntrySchema }),
    z.strictObject({ kind: z.literal('not_found') }),
    z.strictObject({ kind: z.literal('unavailable') }),
  ]),
})
export type SavedToolsListResult = Readonly<{ kind: 'available'; items: readonly SavedToolListItem[] }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }>
export const savedToolsListResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('available'), items: z.array(savedToolListItemSchema).max(DIRECTORY_SAVED_TOOLS_LIMIT) }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
]) as z.ZodType<SavedToolsListResult>
export const savedToolSaveResultSchema = z.union([
  z.strictObject({ kind: z.enum(['saved', 'already_saved']), identity: savedToolIdentitySchema, createdAt: z.number().int().nonnegative() }),
  z.strictObject({ kind: z.literal('refused'), code: z.enum(['unauthenticated', 'limit_reached', 'not_found', 'source_unavailable', 'invalid_identity']) }),
])
export const savedToolRemoveResultSchema = z.union([
  z.strictObject({ kind: z.enum(['removed', 'not_found']) }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])
export type SavedToolSaveResult = z.infer<typeof savedToolSaveResultSchema>
export type SavedToolRemoveResult = z.infer<typeof savedToolRemoveResultSchema>
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
  parameters: [{ name: 'kind', type: 'string', description: 'ae_callable or a saved directory listing.', required: true }, { name: 'toolRef', type: 'string', description: 'Callable Tool reference.', required: false }, { name: 'resource', type: 'string', description: 'Directory listing resource URL.', required: false }, { name: 'id', type: 'string', description: 'Compact external result ID; resolves before saving.', required: false }],
  readOnly: false, effect: { class: 'external_state_change', reversible: true, recipientKind: 'none', dataClasses: ['saved_tool_identity'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp', 'cli'], mcp: { idempotent: true, openWorld: false, destructive: false }, credentialAdmission: { scope: MARKET_TOOLS_CALL_SCOPE, authority: 'descriptor_classified' },
  invocationContract: { version: SAVED_TOOLS_ROUTE_CONTRACTS.save.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['kind', 'toolRef', 'resource', 'id'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['saved_tool_identity'], safeContinuations: ['market.savedTools.list'], invalidationConditions: ['tool_identity_changed', 'credential_revoked'] },
  run: async ({ data, context }) => { if (!context.agentAccessPrincipal || !context.savedToolsService) throw new Error('saved_tools_authentication_required'); return context.savedToolsService.save(data, context.agentAccessPrincipal, context.correlationId ?? crypto.randomUUID()) },
})
export const savedToolsRemoveAction = defineAction({
  id: SAVED_TOOLS_ROUTE_CONTRACTS.remove.actionId, name: 'Remove saved Tool', summary: 'Remove an exact saved identity even if the original Tool has gone.',
  boundaries: ['Only the owning account’s identity can be removed.', 'No Quote or Call state is changed.'],
  schema: savedToolRemoveInputSchema, outputSchema: savedToolRemoveResultSchema,
  parameters: [{ name: 'kind', type: 'string', description: 'ae_callable or a saved directory listing.', required: true }, { name: 'toolRef', type: 'string', description: 'Callable Tool reference.', required: false }, { name: 'resource', type: 'string', description: 'Directory listing resource URL.', required: false }],
  readOnly: false, effect: { class: 'external_state_change', reversible: true, recipientKind: 'none', dataClasses: ['saved_tool_identity'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp', 'cli'], mcp: { idempotent: true, openWorld: false, destructive: true }, credentialAdmission: { scope: MARKET_TOOLS_CALL_SCOPE, authority: 'descriptor_classified' },
  invocationContract: { version: SAVED_TOOLS_ROUTE_CONTRACTS.remove.contractVersion, consequenceClass: 'external_effect', materialInputPaths: ['kind', 'toolRef', 'resource'], authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['saved_tool_removal'], safeContinuations: ['market.savedTools.list'], invalidationConditions: ['tool_identity_changed', 'credential_revoked'] },
  run: async ({ data, context }) => { if (!context.agentAccessPrincipal || !context.savedToolsService) throw new Error('saved_tools_authentication_required'); return context.savedToolsService.remove(data, context.agentAccessPrincipal, context.correlationId ?? crypto.randomUUID()) },
})

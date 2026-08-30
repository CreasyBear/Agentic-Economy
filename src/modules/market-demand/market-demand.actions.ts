import { z } from 'zod'

import { callPublicSourceMutation, sourceMutation } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromRequest, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { MARKET_OPERATIONS_INVOKE_SCOPE } from '@/modules/agent-access/contract'
import type { AgentAccessPrincipal } from '@/modules/agent-access/agent-access'
import { defineAction } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { publicOperationChoiceSchema } from '@/modules/registry/operation-choice-contracts'
import { registryOperationsSearchAction } from '@/modules/registry/operations.actions'

export const MARKET_REQUEST_CREATE_ACTION_ID = 'marketDemand.record' as const
export const MARKET_REQUEST_LIST_ACTION_ID = 'marketDemand.list' as const
export const MARKET_REQUEST_STATUS_ACTION_ID = 'marketDemand.status' as const

export const MARKET_REQUEST_ROUTE_CONTRACTS = Object.freeze({
  create: Object.freeze({
    actionId: MARKET_REQUEST_CREATE_ACTION_ID,
    contractVersion: 'market-demand-record:v1' as const,
    method: 'POST' as const,
    path: '/api/v1/market-requests' as const,
    routerPath: '/api/v1/market-requests' as const,
    scope: MARKET_OPERATIONS_INVOKE_SCOPE,
  }),
  list: Object.freeze({
    actionId: MARKET_REQUEST_LIST_ACTION_ID,
    contractVersion: 'market-demand-list:v1' as const,
    method: 'POST' as const,
    path: '/api/v1/market-requests/list' as const,
    routerPath: '/api/v1/market-requests/list' as const,
    scope: MARKET_OPERATIONS_INVOKE_SCOPE,
  }),
  status: Object.freeze({
    actionId: MARKET_REQUEST_STATUS_ACTION_ID,
    contractVersion: 'market-demand-status:v1' as const,
    method: 'POST' as const,
    path: '/api/v1/market-requests/status' as const,
    routerPath: '/api/v1/market-requests/status' as const,
    scope: MARKET_OPERATIONS_INVOKE_SCOPE,
  }),
})

export const marketRequestCreateInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(1).max(200),
})

export const marketRequestCreateResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.enum(['recorded', 'replayed']),
    requestRef: z.string().min(1).max(300),
    query: z.string().min(1).max(200),
    createdAt: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    code: z.enum([
      'unauthenticated',
      'invalid_request',
      'idempotency_conflict',
      'current_match_exists',
      'source_unavailable',
    ]),
  }),
])

export const marketRequestSummarySchema = z.strictObject({
  requestRef: z.string().min(1).max(300),
  query: z.string().min(1).max(200),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const marketRequestListInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2_000).optional(),
})

export const marketRequestListResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('available'),
    items: z.array(marketRequestSummarySchema).max(100),
    hasMore: z.boolean(),
    nextCursor: z.string().min(1).max(2_000).optional(),
  }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])

export const marketRequestStatusInputSchema = z.strictObject({
  requestRef: z.string().min(1).max(300),
})

export const marketRequestStatusResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('open'),
    requestRef: z.string().min(1).max(300),
    query: z.string().min(1).max(200),
    createdAt: z.number().int().nonnegative(),
    matchedCount: z.literal(0),
  }),
  z.strictObject({
    kind: z.literal('matched'),
    requestRef: z.string().min(1).max(300),
    query: z.string().min(1).max(200),
    createdAt: z.number().int().nonnegative(),
    matchedCount: z.number().int().positive(),
    operations: z.array(publicOperationChoiceSchema).min(1).max(5),
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({ kind: z.literal('error'), code: z.enum(['unauthenticated', 'source_unavailable']) }),
])

export type MarketRequestCreateInput = z.infer<typeof marketRequestCreateInputSchema>
export type MarketRequestCreateResult = z.infer<typeof marketRequestCreateResultSchema>
export type MarketRequestListInput = z.infer<typeof marketRequestListInputSchema>
export type MarketRequestListResult = z.infer<typeof marketRequestListResultSchema>
export type MarketRequestStatusInput = z.infer<typeof marketRequestStatusInputSchema>
export type MarketRequestStatusResult = z.infer<typeof marketRequestStatusResultSchema>

type PrincipalRequest<Input> = Readonly<{
  input: Input
  principal: AgentAccessPrincipal
  correlationId: string
}>

export type MarketDemandService = Readonly<{
  create: (request: PrincipalRequest<MarketRequestCreateInput>) => Promise<MarketRequestCreateResult>
  list: (request: PrincipalRequest<MarketRequestListInput>) => Promise<MarketRequestListResult>
  status: (request: PrincipalRequest<MarketRequestStatusInput>) => Promise<MarketRequestStatusResult>
}>

const recordMutation = sourceMutation<Record<string, unknown>, unknown>('marketDemandSignals:record')
const listMutation = sourceMutation<Record<string, unknown>, unknown>('marketDemandSignals:list')
const readMutation = sourceMutation<Record<string, unknown>, unknown>('marketDemandSignals:read')

export function createMarketDemandService(request: Request, bodyText: string): MarketDemandService {
  async function mutate<T>(
    reference: Parameters<typeof callPublicSourceMutation>[0],
    command: Record<string, unknown>,
    operationKey: string,
    correlationId: string,
  ): Promise<T> {
    const sourceWrite = await sourceWriteAdmissionFromRequest({
      request,
      command,
      body: bodyText,
      scope: 'protected_action',
      operationKey,
      correlationId,
    })
    return await callPublicSourceMutation(reference, {
      ...command,
      sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite),
      sourceWrite,
    }) as T
  }

  return {
    create: async ({ input, principal, correlationId }) => {
      const current = await registryOperationsSearchAction.run({
        data: registryOperationsSearchAction.schema.parse({ query: input.query, limit: 1 }),
        context: { caller: 'http', request },
      })
      if (current.kind === 'unavailable') return { kind: 'refused', code: 'source_unavailable' }
      if (current.kind === 'ok') return { kind: 'refused', code: 'current_match_exists' }
      const operationKey = canonicalDigest({
        action: MARKET_REQUEST_ROUTE_CONTRACTS.create.actionId,
        principalId: principal.principalId,
        credentialId: principal.credentialId,
        query: input.query,
        idempotencyKey: input.idempotencyKey,
      })
      const result = await mutate<unknown>(recordMutation, {
        ...input,
        agentPrincipal: principal,
        operationKey,
        correlationId,
      }, operationKey, correlationId)
      const parsed = marketRequestCreateResultSchema.safeParse(result)
      return parsed.success ? parsed.data : { kind: 'refused', code: 'source_unavailable' }
    },
    list: async ({ input, principal, correlationId }) => {
      const operationKey = canonicalDigest({
        action: MARKET_REQUEST_ROUTE_CONTRACTS.list.actionId,
        principalId: principal.principalId,
        credentialId: principal.credentialId,
        cursor: input.cursor ?? null,
        limit: input.limit,
        correlationId,
      })
      const result = await mutate<unknown>(listMutation, {
        paginationOpts: { numItems: input.limit, cursor: input.cursor ?? null },
        agentPrincipal: principal,
        operationKey,
        correlationId,
      }, operationKey, correlationId)
      if (typeof result !== 'object' || result === null || !('kind' in result)) {
        return { kind: 'error', code: 'source_unavailable' }
      }
      if (result.kind === 'error') {
        const parsed = marketRequestListResultSchema.safeParse(result)
        return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
      }
      if (result.kind !== 'available' || !('requests' in result) || typeof result.requests !== 'object' || result.requests === null) {
        return { kind: 'error', code: 'source_unavailable' }
      }
      const requests = result.requests as Record<string, unknown>
      const projected = {
        kind: 'available' as const,
        items: requests.page,
        hasMore: requests.isDone === false,
        ...(requests.isDone === false && typeof requests.continueCursor === 'string'
          ? { nextCursor: requests.continueCursor }
          : {}),
      }
      const parsed = marketRequestListResultSchema.safeParse(projected)
      return parsed.success ? parsed.data : { kind: 'error', code: 'source_unavailable' }
    },
    status: async ({ input, principal, correlationId }) => {
      const operationKey = canonicalDigest({
        action: MARKET_REQUEST_ROUTE_CONTRACTS.status.actionId,
        principalId: principal.principalId,
        credentialId: principal.credentialId,
        requestRef: input.requestRef,
        correlationId,
      })
      const raw = await mutate<unknown>(readMutation, {
        requestRef: input.requestRef,
        agentPrincipal: principal,
        operationKey,
        correlationId,
      }, operationKey, correlationId)
      if (typeof raw !== 'object' || raw === null || !('kind' in raw)) {
        return { kind: 'error', code: 'source_unavailable' }
      }
      if (raw.kind === 'not_found') return { kind: 'not_found' }
      if (raw.kind === 'error') return { kind: 'error', code: 'unauthenticated' }
      if (raw.kind !== 'found' || !('request' in raw)) return { kind: 'error', code: 'source_unavailable' }
      const requestRecord = marketRequestSummarySchema.safeParse(raw.request)
      if (!requestRecord.success) return { kind: 'error', code: 'source_unavailable' }
      const search = await registryOperationsSearchAction.run({
        data: registryOperationsSearchAction.schema.parse({ query: requestRecord.data.query, limit: 5 }),
        context: { caller: 'http', request },
      })
      if (search.kind === 'unavailable') return { kind: 'error', code: 'source_unavailable' }
      if (search.kind === 'no_candidates') {
        return {
          kind: 'open',
          requestRef: requestRecord.data.requestRef,
          query: requestRecord.data.query,
          createdAt: requestRecord.data.createdAt,
          matchedCount: 0,
        }
      }
      const operations = search.items.slice(0, 5)
      return marketRequestStatusResultSchema.parse({
        kind: 'matched',
        requestRef: requestRecord.data.requestRef,
        query: requestRecord.data.query,
        createdAt: requestRecord.data.createdAt,
        matchedCount: search.matchedCount,
        operations,
      })
    },
  }
}

export const marketRequestCreateAction = defineAction<MarketRequestCreateInput, MarketRequestCreateResult>({
  id: MARKET_REQUEST_CREATE_ACTION_ID,
  name: 'Record missing market demand',
  summary: 'Privately remember one job that current canonical Market Operations did not satisfy.',
  boundaries: [
    'Stores only the bounded job phrase and authenticated credential ownership; it is not a project, task, tender, or supplier message.',
    'The signal never becomes an Operation and grants no supplier authority.',
    'Raw requests remain private to the exact credential profile in this interface.',
  ],
  schema: marketRequestCreateInputSchema,
  outputSchema: marketRequestCreateResultSchema,
  parameters: [
    { name: 'query', type: 'string', description: 'Missing job phrase from a no-result market search.', required: true },
    { name: 'idempotencyKey', type: 'string', description: 'Stable identity for safe retries.', required: true },
  ],
  readOnly: false,
  effect: {
    class: 'external_state_change', reversible: false, recipientKind: 'none',
    dataClasses: ['market_demand'], spendExposure: 'none', approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission: { scope: MARKET_OPERATIONS_INVOKE_SCOPE, authority: 'descriptor_classified' },
  invocationContract: {
    version: MARKET_REQUEST_ROUTE_CONTRACTS.create.contractVersion,
    consequenceClass: 'external_effect', materialInputPaths: ['query', 'idempotencyKey'],
    authorityRequirement: 'principal', retryClass: 'replayable',
    expectedEvidence: ['market_request_identity'], safeContinuations: ['marketDemand.status'],
    invalidationConditions: ['query_changed', 'idempotency_key_changed', 'credential_profile_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.marketDemandService === undefined) throw new Error('market_demand_service_unavailable')
    return await context.marketDemandService.create({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    })
  },
})

export const marketRequestListAction = defineAction<MarketRequestListInput, MarketRequestListResult>({
  id: MARKET_REQUEST_LIST_ACTION_ID,
  name: 'List private market requests',
  summary: 'List the authenticated credential profile’s private missing-job signals, newest first.',
  boundaries: [
    'Returns only signals owned by the exact authenticated principal and credential profile.',
    'Does not expose other buyers, supplier analytics, project context, or raw Operation inputs.',
  ],
  schema: marketRequestListInputSchema,
  outputSchema: marketRequestListResultSchema,
  parameters: [
    { name: 'limit', type: 'number', description: 'Page size from 1 through 100.', required: false },
    { name: 'cursor', type: 'string', description: 'Opaque continuation cursor.', required: false },
  ],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: ['market_demand'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission: { scope: MARKET_OPERATIONS_INVOKE_SCOPE, authority: 'descriptor_classified' },
  invocationContract: {
    version: MARKET_REQUEST_ROUTE_CONTRACTS.list.contractVersion,
    consequenceClass: 'read_only', materialInputPaths: ['limit', 'cursor'], authorityRequirement: 'principal',
    retryClass: 'replayable', expectedEvidence: ['market_request_summaries'], safeContinuations: ['marketDemand.status'],
    invalidationConditions: ['cursor_changed', 'credential_profile_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.marketDemandService === undefined) throw new Error('market_demand_service_unavailable')
    return await context.marketDemandService.list({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    })
  },
})

export const marketRequestStatusAction = defineAction<MarketRequestStatusInput, MarketRequestStatusResult>({
  id: MARKET_REQUEST_STATUS_ACTION_ID,
  name: 'Check private market request',
  summary: 'Check whether current canonical Market Operations now match one private missing-job signal.',
  boundaries: [
    'Reads only a request owned by the exact authenticated principal and credential profile.',
    'A match is recomputed from current canonical Operations; stored demand is never treated as supply.',
    'Checking does not call, reserve, notify, or authorize any Operation.',
  ],
  schema: marketRequestStatusInputSchema,
  outputSchema: marketRequestStatusResultSchema,
  parameters: [{ name: 'requestRef', type: 'string', description: 'Opaque request reference returned by create or list.', required: true }],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: ['market_demand'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission: { scope: MARKET_OPERATIONS_INVOKE_SCOPE, authority: 'descriptor_classified' },
  invocationContract: {
    version: MARKET_REQUEST_ROUTE_CONTRACTS.status.contractVersion,
    consequenceClass: 'read_only', materialInputPaths: ['requestRef'], authorityRequirement: 'principal',
    retryClass: 'replayable', expectedEvidence: ['current_operation_matches'], safeContinuations: ['registry.operations.detail'],
    invalidationConditions: ['request_ref_changed', 'credential_profile_changed', 'market_supply_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.marketDemandService === undefined) throw new Error('market_demand_service_unavailable')
    return await context.marketDemandService.status({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    })
  },
})

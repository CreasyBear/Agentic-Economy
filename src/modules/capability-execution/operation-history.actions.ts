import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import { operationInvokeUsageSchema } from './operation-invoke-contracts'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from './operation-invoke-entry'

export const operationInvocationStateValues = [
  'pending',
  'completed',
  'refused',
  'reconciliation_required',
  'cancelled',
] as const
export const operationInvocationStateSchema = z.enum(operationInvocationStateValues)

export const operationListInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2_000).optional(),
  state: operationInvocationStateSchema.optional(),
})

export const operationInvocationSummarySchema = z.strictObject({
  invocationRef: z.string().min(1).max(300),
  operationRef: z.string().min(1).max(300),
  state: operationInvocationStateSchema,
  resultKind: z.enum(['completed', 'pending', 'needs_authority', 'reconciliation_required', 'refused']).optional(),
  usage: operationInvokeUsageSchema.optional(),
  receiptRef: z.string().min(1).max(300).optional(),
  evidenceHash: z.string().min(1).max(300).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const operationListResultSchema = z.strictObject({
  kind: z.literal('available'),
  items: z.array(operationInvocationSummarySchema).max(100),
  hasMore: z.boolean(),
  nextCursor: z.string().min(1).max(2_000).optional(),
})

export type OperationListInput = z.infer<typeof operationListInputSchema>
export type OperationListResult = z.infer<typeof operationListResultSchema>

const parameters: readonly ActionParameter[] = [
  { name: 'limit', type: 'number', description: 'Page size from 1 through 100.', required: false },
  { name: 'cursor', type: 'string', description: 'Opaque continuation cursor returned by the previous page.', required: false },
  { name: 'state', type: 'enum', description: 'Optional canonical invocation state filter.', required: false, enum: operationInvocationStateValues },
]

export const operationListAction = defineAction<OperationListInput, OperationListResult>({
  id: OPERATION_INVOKE_ROUTE_CONTRACT.list.actionId,
  name: 'List operation invocations',
  summary: 'List the authenticated credential profile’s own bounded invocation summaries, newest first.',
  boundaries: [
    'Returns only invocations owned by the exact authenticated principal and credential profile.',
    'List rows omit operation input, output, provider connection, credentials, and internal recovery material.',
    'Use operation.status with one returned invocationRef for the full admitted receipt and recovery projection.',
    'Cursors are opaque and remain bound to the same credential and state filter.',
  ],
  schema: operationListInputSchema,
  outputSchema: operationListResultSchema,
  parameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: ['invocation_status', 'usage_evidence'],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission: {
    scope: OPERATION_INVOKE_ROUTE_CONTRACT.scope,
    authority: 'descriptor_classified',
  },
  invocationContract: {
    version: OPERATION_INVOKE_ROUTE_CONTRACT.list.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['limit', 'cursor', 'state'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['operation_invocation_summaries'],
    safeContinuations: ['operation.status'],
    invalidationConditions: ['credential_profile_changed', 'state_filter_changed', 'cursor_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.operationInvokeService?.listInvocations === undefined) throw new Error('operation_history_service_unavailable')
    return await context.operationInvokeService.listInvocations({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    })
  },
})

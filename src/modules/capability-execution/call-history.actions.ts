import { z } from 'zod'

import { defineAction, type ActionParameter } from '@/modules/common/action'
import { callUsageSchema } from './call-contracts'
import { CALL_ROUTE_CONTRACT } from './call-entry'

export const callStateValues = [
  'pending',
  'completed',
  'refused',
  'reconciliation_required',
  'cancelled',
] as const
export const callStateSchema = z.enum(callStateValues)

export const callListInputSchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).max(2_000).optional(),
  state: callStateSchema.optional(),
})

export const callSummarySchema = z.strictObject({
  callRef: z.string().min(1).max(300),
  toolRef: z.string().min(1).max(300),
  state: callStateSchema,
  resultKind: z.enum(['completed', 'pending', 'needs_authority', 'reconciliation_required', 'refused']).optional(),
  usage: callUsageSchema.optional(),
  receiptRef: z.string().min(1).max(300).optional(),
  evidenceHash: z.string().min(1).max(300).optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const callListResultSchema = z.strictObject({
  kind: z.literal('available'),
  items: z.array(callSummarySchema).max(100),
  hasMore: z.boolean(),
  nextCursor: z.string().min(1).max(2_000).optional(),
})

export type CallListInput = z.infer<typeof callListInputSchema>
export type CallListResult = z.infer<typeof callListResultSchema>

const parameters: readonly ActionParameter[] = [
  { name: 'limit', type: 'number', description: 'Page size from 1 through 100.', required: false },
  { name: 'cursor', type: 'string', description: 'Opaque continuation cursor returned by the previous page.', required: false },
  { name: 'state', type: 'enum', description: 'Optional canonical Call state filter.', required: false, enum: callStateValues },
]

export const callListAction = defineAction<CallListInput, CallListResult>({
  id: CALL_ROUTE_CONTRACT.list.actionId,
  name: 'List Calls',
  summary: 'List the authenticated credential profile’s own bounded Call summaries, newest first.',
  boundaries: [
    'Returns only Calls owned by the exact authenticated principal and credential profile.',
    'List rows omit Tool input, output, Provider connection, credentials, and internal recovery material.',
    'Use call.status with one returned callRef for the full admitted receipt and recovery projection.',
    'Cursors are opaque and remain bound to the same credential and state filter.',
  ],
  schema: callListInputSchema,
  outputSchema: callListResultSchema,
  parameters,
  readOnly: true,
  effect: {
    class: 'observation',
    reversible: true,
    recipientKind: 'none',
    dataClasses: ['call_status', 'usage_evidence'],
    spendExposure: 'none',
    approval: 'none',
  },
  surfaces: ['http', 'mcp', 'cli'],
  credentialAdmission: {
    scope: CALL_ROUTE_CONTRACT.scope,
    authority: 'descriptor_classified',
  },
  invocationContract: {
    version: CALL_ROUTE_CONTRACT.list.contractVersion,
    consequenceClass: 'read_only',
    materialInputPaths: ['limit', 'cursor', 'state'],
    authorityRequirement: 'principal',
    retryClass: 'replayable',
    expectedEvidence: ['call_summaries'],
    safeContinuations: ['call.status'],
    invalidationConditions: ['credential_profile_changed', 'state_filter_changed', 'cursor_changed'],
  },
  run: async ({ data, context }) => {
    if (context.agentAccessPrincipal === undefined) throw new Error('agent_access_context_missing')
    if (context.callService?.listCalls === undefined) throw new Error('call_history_service_unavailable')
    return await context.callService.listCalls({
      input: data,
      principal: context.agentAccessPrincipal,
      correlationId: context.correlationId ?? globalThis.crypto.randomUUID(),
    })
  },
})

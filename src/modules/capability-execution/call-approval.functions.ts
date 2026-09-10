import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  decideCallApprovalThroughSource,
  listPendingCallApprovalsThroughSource,
} from '@/lib/server/call-approval-source'

import type {
  CallApprovalDecisionResult,
  PendingCallApproval,
} from './call-approval-contracts'

export type { CallApprovalDecisionResult, PendingCallApproval }

const decisionInputSchema = z.strictObject({
  callRef: z.string().min(1),
  decision: z.enum(['approve', 'deny']),
})

export const listPendingCallApprovalsServer = createServerFn({ method: 'GET' })
  .handler(async (): Promise<readonly PendingCallApproval[]> => {
    return listPendingCallApprovalsThroughSource()
  })

export const decideCallApprovalServer = createServerFn({ method: 'POST' })
  .validator((data) => decisionInputSchema.parse(data))
  .handler(async ({ data }): Promise<CallApprovalDecisionResult> => {
    return decideCallApprovalThroughSource(data)
  })

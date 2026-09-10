import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  decideCallApprovalThroughSource,
  listPendingCallApprovalsThroughSource,
} from '@/lib/server/call-approval-source'

import type { PublicAuthorityRequest } from './call-contracts'

export type PendingCallApproval = Readonly<{
  callRef: string
  toolRef: string
  authorityRequest: PublicAuthorityRequest
  createdAt: number
}>

export type CallApprovalDecisionResult =
  | Readonly<{
      kind: 'approved' | 'denied' | 'replayed'
      callRef: string
    }>
  | Readonly<{
      kind: 'refused'
      code:
        | 'authentication_required'
        | 'invocation_not_found'
        | 'authority_not_pending'
        | 'grant_not_current'
        | 'invocation_invalid'
    }>

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

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import {
  decideOperationApprovalThroughSource,
  listPendingOperationApprovalsThroughSource,
} from '@/lib/server/operation-approval-source'

import type { PublicAuthorityRequest } from './operation-invoke'

export type PendingOperationApproval = Readonly<{
  invocationRef: string
  operationRef: string
  authorityRequest: PublicAuthorityRequest
  createdAt: number
}>

export type OperationApprovalDecisionResult =
  | Readonly<{
      kind: 'approved' | 'denied' | 'replayed'
      invocationRef: string
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
  invocationRef: z.string().min(1),
  decision: z.enum(['approve', 'deny']),
})

export const listPendingOperationApprovalsServer = createServerFn({ method: 'GET' })
  .handler(async (): Promise<readonly PendingOperationApproval[]> => {
    return listPendingOperationApprovalsThroughSource()
  })

export const decideOperationApprovalServer = createServerFn({ method: 'POST' })
  .validator((data) => decisionInputSchema.parse(data))
  .handler(async ({ data }): Promise<OperationApprovalDecisionResult> => {
    return decideOperationApprovalThroughSource(data)
  })

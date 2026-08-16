import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

import type {
  OperationApprovalDecisionResult,
  PendingOperationApproval,
} from '@/modules/capability-execution/operation-approval.functions'

const listPendingOperationApprovalsQuery = sourceQuery<Record<string, never>, readonly PendingOperationApproval[]>(
  'capabilityOperationInvocations:listPendingOperationApprovals',
)
const decideOperationApprovalMutation = sourceMutation<
  Readonly<{ invocationRef: string; decision: 'approve' | 'deny' }>,
  OperationApprovalDecisionResult
>('capabilityOperationInvocations:decideOperationApproval')

export async function listPendingOperationApprovalsThroughSource(): Promise<readonly PendingOperationApproval[]> {
  if (isLocalE2EAuthBypassEnabled()) return []
  return callSourceQuery(listPendingOperationApprovalsQuery, {})
}

export async function decideOperationApprovalThroughSource(
  data: Readonly<{ invocationRef: string; decision: 'approve' | 'deny' }>,
): Promise<OperationApprovalDecisionResult> {
  if (isLocalE2EAuthBypassEnabled()) {
    return { kind: 'refused', code: 'authentication_required' }
  }
  return callSourceMutation(decideOperationApprovalMutation, data)
}

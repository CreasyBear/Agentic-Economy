import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'

import type {
  CallApprovalDecisionResult,
  PendingCallApproval,
} from '@/modules/capability-execution/call-approval-contracts'

const listPendingCallApprovalsQuery = sourceQuery<Record<string, never>, readonly PendingCallApproval[]>(
  'capabilityCalls:listPendingCallApprovals',
)
const decideCallApprovalMutation = sourceMutation<
  Readonly<{ callRef: string; decision: 'approve' | 'deny' }>,
  CallApprovalDecisionResult
>('capabilityCalls:decideCallApproval')

export async function listPendingCallApprovalsThroughSource(): Promise<readonly PendingCallApproval[]> {
  return callSourceQuery(listPendingCallApprovalsQuery, {})
}

export async function decideCallApprovalThroughSource(
  data: Readonly<{ callRef: string; decision: 'approve' | 'deny' }>,
): Promise<CallApprovalDecisionResult> {
  return callSourceMutation(decideCallApprovalMutation, data)
}

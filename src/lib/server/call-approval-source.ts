import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

import type {
  CallApprovalDecisionResult,
  PendingCallApproval,
} from '@/modules/capability-execution/call-approval.functions'

const listPendingCallApprovalsQuery = sourceQuery<Record<string, never>, readonly PendingCallApproval[]>(
  'capabilityCalls:listPendingCallApprovals',
)
const decideCallApprovalMutation = sourceMutation<
  Readonly<{ callRef: string; decision: 'approve' | 'deny' }>,
  CallApprovalDecisionResult
>('capabilityCalls:decideCallApproval')

export async function listPendingCallApprovalsThroughSource(): Promise<readonly PendingCallApproval[]> {
  if (isLocalE2EAuthBypassEnabled()) return []
  return callSourceQuery(listPendingCallApprovalsQuery, {})
}

export async function decideCallApprovalThroughSource(
  data: Readonly<{ callRef: string; decision: 'approve' | 'deny' }>,
): Promise<CallApprovalDecisionResult> {
  if (isLocalE2EAuthBypassEnabled()) {
    return { kind: 'refused', code: 'authentication_required' }
  }
  return callSourceMutation(decideCallApprovalMutation, data)
}

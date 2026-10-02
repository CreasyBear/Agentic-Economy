import {
  callSourceMutation,
  callSourceQuery,
  sourceMutation,
  sourceQuery,
} from '@/lib/server/convex-source'
import { readClerkMfaConsequenceProof, type ClerkMfaConsequenceProofInput } from '@/lib/server/clerk-consequence-proof'
import { sourceWriteAdmissionFromContext, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import type { SourceWriteAdmission, SourceWriteAdmissionRequest } from '@/modules/security/source-write-admission'

import type {
  CallApprovalDecisionResult,
  PendingCallApproval,
} from '@/modules/capability-execution/call-approval-contracts'

const listPendingCallApprovalsQuery = sourceQuery<Record<string, never>, readonly PendingCallApproval[]>(
  'capabilityCalls:listPendingCallApprovals',
)
const decideCallApprovalMutation = sourceMutation<
  Readonly<{ callRef: string; decision: 'approve' | 'deny'; operationKey: string; correlationId: string;
    proof?: ClerkMfaConsequenceProofInput; sourceWrite: SourceWriteAdmission; sourceWriteRequest: SourceWriteAdmissionRequest }>,
  CallApprovalDecisionResult
>('capabilityCalls:decideCallApproval')

export async function listPendingCallApprovalsThroughSource(): Promise<readonly PendingCallApproval[]> {
  return callSourceQuery(listPendingCallApprovalsQuery, {})
}

export async function decideCallApprovalThroughSource(
  data: Readonly<{ callRef: string; decision: 'approve' | 'deny' }>,
  context: unknown,
): Promise<CallApprovalDecisionResult> {
  const operationKey = `call-approval:${data.callRef}:${data.decision}`
  const proof = data.decision === 'approve' ? await readClerkMfaConsequenceProof() : undefined
  const command = { ...data, operationKey, correlationId: operationKey, ...(proof === undefined ? {} : { proof }) }
  const sourceWrite = await sourceWriteAdmissionFromContext({ context, command, scope: 'protected_action',
    operationKey, correlationId: operationKey })
  return await callSourceMutation(decideCallApprovalMutation, { ...command, sourceWrite,
    sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) })
}

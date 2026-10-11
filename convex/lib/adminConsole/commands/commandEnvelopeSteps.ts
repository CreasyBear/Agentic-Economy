import type { MutationCtx } from '../../../_generated/server'
import type {
  AdminCommandAction,
  AdminCommandReceipt,
  AdminRefusalCode,
} from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { AuditTargetTypeValues, type AuditTargetType } from '@/modules/observability/public'
import { writeAdminOperationKey } from './idempotency'
import type { AdminCommandWireArgs } from './contracts'

export function refused<A extends AdminCommandAction>(
  args: Pick<AdminCommandWireArgs<A>, 'action' | 'correlationId'>,
  code: AdminRefusalCode<A>,
): Extract<AdminCommandReceipt<A>, { kind: 'refused' }> {
  return { kind: 'refused', action: args.action, code, correlationId: args.correlationId }
}

export async function persistTerminalRefusal<A extends AdminCommandAction>(
  ctx: MutationCtx,
  args: AdminCommandWireArgs<A>,
  actorRef: string,
  operationName: string,
  requestHash: string,
  code: AdminRefusalCode<A>,
): Promise<Extract<AdminCommandReceipt<A>, { kind: 'refused' }>> {
  const receipt = refused(args, code)
  await persistReceipt(ctx, actorRef, operationName, args.operationKey, requestHash, 'failed_terminal', receipt)
  return receipt
}

export async function persistReceipt<A extends AdminCommandAction>(
  ctx: MutationCtx,
  actorRef: string,
  operationName: string,
  key: string,
  requestHash: string,
  status: 'in_progress' | 'succeeded' | 'failed_terminal',
  receipt: AdminCommandReceipt<A>,
): Promise<void> {
  await writeAdminOperationKey(ctx, {
    actorRef,
    operationName,
    key,
    requestHash,
    status,
    resultJson: JSON.stringify(receipt),
    resultHash: canonicalDigest(receipt),
  })
}

type ProofFailureCode = 'reauthentication_required' | 'proof_stale' | 'proof_replayed' | 'command_changed'
const MFA_PROOF_FAILURES: Record<ProofFailureCode, 'mfa_reverification_required'> = {
  reauthentication_required: 'mfa_reverification_required',
  proof_stale: 'mfa_reverification_required',
  proof_replayed: 'mfa_reverification_required',
  command_changed: 'mfa_reverification_required',
}
const PROOF_FAILURE_BY_ACTION: {
  [A in AdminCommandAction]: Record<ProofFailureCode, AdminRefusalCode<A>>
} = {
  review_call_content: MFA_PROOF_FAILURES,
  set_business_suppression: MFA_PROOF_FAILURES,
  close_removal_dispute: MFA_PROOF_FAILURES,
  grant_admin_membership: MFA_PROOF_FAILURES,
  revoke_admin_membership: MFA_PROOF_FAILURES,
  verify_capability_source_authority: MFA_PROOF_FAILURES,
  change_commercial_policy: {
    reauthentication_required: 'mfa_reverification_required',
    proof_stale: 'proof_stale',
    proof_replayed: 'proof_replayed',
    command_changed: 'mfa_reverification_required',
  },
  grant_promotional_credit: MFA_PROOF_FAILURES,
  issue_trial: MFA_PROOF_FAILURES,
  set_payments_paused: MFA_PROOF_FAILURES,
  set_payments_audience: MFA_PROOF_FAILURES,
  change_treasury_thresholds: MFA_PROOF_FAILURES,
}

export function proofFailure<A extends AdminCommandAction>(
  action: A,
  code: ProofFailureCode,
): AdminRefusalCode<A> {
  return PROOF_FAILURE_BY_ACTION[action][code]
}

export function requireAuditTargetType(value: string): AuditTargetType {
  const target = AuditTargetTypeValues.find((candidate) => candidate === value)
  if (target !== undefined) return target
  throw new Error(`invalid_admin_audit_target_type:${value}`)
}

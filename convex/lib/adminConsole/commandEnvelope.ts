import type { MutationCtx } from '../../_generated/server'
import type {
  AdminActionRefusalCodes,
  AdminCommandAction,
  AdminCommandReceipt,
  AdminRefusalCode,
  AdminSuccessCodeByAction,
  AllowedAdminAuthority,
} from '@/lib/operator/admin-console/contracts'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import { validEvidenceRefs } from '@/modules/capability-supply/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import {
  AuditTargetTypeValues,
  validateAuditEvent,
  type AuditEventType,
  type AuditTargetType,
} from '@/modules/observability/public'
import {
  recordAdminActionDenied,
  validateReasonAndEvidence,
} from '@/modules/security/public'

import { readCurrentActiveAdminMembership, resolveAdminAuthority } from '../../authz'
import {
  consumeConsequenceProof,
  deriveStrictConsequenceProof,
} from '../consequenceProof'
import { persistAdminAuthorityMutation, persistAuditEvent } from '../../securityShared'
import { requireSourceRead, requireSourceWrite } from '../../sourceWriteAdmission'
import { resolveApprovalIntent } from './approvals'
import {
  parseAdminOperationReceipt,
  readAdminOperationKey,
  writeAdminOperationKey,
} from './idempotency'
import type { AdminCommandWireArgs } from './validators'
export type AdminCommandSpec<A extends AdminCommandAction> = Readonly<{
  targetType: string
  targetRef: string
  auditEventType: AuditEventType
  currentStateDigest(): Promise<string | null>
  apply(actor: AllowedAdminAuthority): Promise<
    | {
        kind: 'applied'
        code: AdminSuccessCodeByAction[A]
        effectRefs: string[]
        beforeState: string
        afterState: string
      }
    | { kind: 'refused'; code: AdminActionRefusalCodes[A] }
  >
}>


export async function runAdminCommand<A extends AdminCommandAction>(
  ctx: MutationCtx,
  args: AdminCommandWireArgs<A>,
  spec: AdminCommandSpec<A>,
): Promise<AdminCommandReceipt<A>> {
  const operationName = `admin:${args.action}`
  const targetType = requireAuditTargetType(spec.targetType)
  const authority = await resolveAdminAuthority(ctx, ADMIN_ACTION_PERMISSION[args.action])
  if (authority.kind === 'denied') {
    const denied = recordAdminActionDenied(
      { adminMemberships: [], adminMembershipAuditEvents: [], auditEvents: [] },
      {
        actorMembership: await readCurrentActiveAdminMembership(ctx),
        action: ADMIN_ACTION_PERMISSION[args.action],
        targetType,
        targetRef: spec.targetRef,
        reasonCode: authority.reason,
        evidenceRefs: args.evidenceRefs,
        operationKey: args.operationKey,
        correlationId: args.correlationId,
        now: Date.now(),
      },
    )
    await persistAdminAuthorityMutation(ctx.db, denied)
    return refused(args, authority.reason)
  }
  const sourceRead = await requireSourceRead(args, 'admin_operator')
  if (sourceRead.kind === 'rejected') {
    return refused(
      args,
      sourceRead.reason === 'source_write_nonce_replayed'
        ? 'idempotency_conflict'
        : sourceRead.reason,
    )
  }

  const commandDigest = canonicalDigest({
    scope: 'admin_operator',
    action: args.action,
    input: args.input,
    reasonCode: args.reasonCode,
    evidenceRefs: args.evidenceRefs,
    ...(args.expectedStateDigest === undefined
      ? {}
      : { expectedStateDigest: args.expectedStateDigest }),
  })
  const actorRef = authority.membership.clerkUserId
  const requestHash = canonicalDigest({
    commandDigest,
    actorRef,
    approval: args.approval,
  })

  const operation = await readAdminOperationKey(ctx, actorRef, operationName, args.operationKey)
  if (operation.kind === 'replay') {
    if (
      operation.requestHash === requestHash
      && (operation.status === 'succeeded' || operation.status === 'failed_terminal')
      && operation.resultJson !== null
    ) {
      return parseAdminOperationReceipt(
        operation.resultJson,
        operation.resultHash,
        args.action,
      )
    }
    return refused(args, 'idempotency_conflict')
  }

  const sourceWrite = await requireSourceWrite(ctx, args, 'admin_operator')
  if (sourceWrite.kind === 'rejected') {
    return refused(
      args,
      sourceWrite.reason === 'source_write_nonce_replayed'
        ? 'idempotency_conflict'
        : sourceWrite.reason,
    )
  }

  const reason = validateReasonAndEvidence(args.reasonCode, args.evidenceRefs)
  if (reason.kind === 'error') return refused(args, reason.code)
  if (!validEvidenceRefs(args.evidenceRefs)) return refused(args, 'admin_missing_evidence')

  if (args.proof === undefined) return refused(args, 'mfa_reverification_required')
  const proof = deriveStrictConsequenceProof({ ...args.proof, now: Date.now() })
  if (proof.kind === 'refused') return refused(args, proofFailure(args.action, proof.code))
  const consumed = await consumeConsequenceProof(ctx, {
    reverificationId: args.proof.reverificationId,
    actorPrincipalRef: actorRef,
    activeAccountRef: authority.membership.tokenIdentifier,
    commandDigest,
    proof: proof.proof,
    correlationRef: args.correlationId,
    idempotencyRef: args.operationKey,
  })
  if (consumed.kind === 'refused') {
    return refused(args, proofFailure(args.action, consumed.code))
  }

  if (
    args.expectedStateDigest !== undefined
    && args.expectedStateDigest !== await spec.currentStateDigest()
  ) {
    return await persistTerminalRefusal(ctx, args, actorRef, operationName, requestHash, 'target_changed')
  }

  const approval = await resolveApprovalIntent(ctx, authority, args, commandDigest)
  if (approval.kind === 'proposed') {
    await persistReceipt(ctx, actorRef, operationName, args.operationKey, requestHash, 'succeeded', approval.receipt)
    return approval.receipt
  }
  if (approval.kind === 'refused') {
    return await persistTerminalRefusal(ctx, args, actorRef, operationName, requestHash, approval.code)
  }

  const applied = await spec.apply(authority)
  if (applied.kind === 'refused') {
    return await persistTerminalRefusal(ctx, args, actorRef, operationName, requestHash, applied.code)
  }

  const now = Date.now()
  const redactedPayload = {
    permission: ADMIN_ACTION_PERMISSION[args.action],
    reasonCode: reason.reasonCode,
    evidenceRefs: args.evidenceRefs,
    commandDigest,
    approval: approval.approval,
    ownerAdminCountAtDecision: approval.ownerAdminCountAtDecision,
  }
  const eventId = brandNonEmpty(
    `audit:${spec.auditEventType}:${canonicalDigest({ actorRef, operationName, key: args.operationKey, requestHash })}`,
    'AuditEventId',
  )
  const audit = validateAuditEvent({
    eventId,
    eventType: spec.auditEventType,
    actorKind: 'admin',
    actorRef,
    targetType,
    targetRef: spec.targetRef,
    idempotencyKey: brandNonEmpty(args.operationKey, 'OperationKey'),
    correlationId: brandNonEmpty(args.correlationId, 'CorrelationId'),
    beforeState: applied.beforeState,
    afterState: applied.afterState,
    reasonCode: reason.reasonCode,
    evidenceRefs: args.evidenceRefs,
    redactedPayload,
    payloadHash: canonicalDigest(redactedPayload),
    createdAt: now,
  })
  if (!audit.valid) throw new Error(`admin_command_audit_invalid:${audit.reason}`)
  await persistAuditEvent(ctx.db, audit.event)

  const receipt: AdminCommandReceipt<A> = {
    kind: 'completed',
    action: args.action,
    code: applied.code,
    effectRefs: applied.effectRefs,
    auditEventRef: eventId,
    correlationId: args.correlationId,
  }
  await persistReceipt(ctx, actorRef, operationName, args.operationKey, requestHash, 'succeeded', receipt)
  return receipt
}

function refused<A extends AdminCommandAction>(
  args: Pick<AdminCommandWireArgs<A>, 'action' | 'correlationId'>,
  code: AdminRefusalCode<A>,
): Extract<AdminCommandReceipt<A>, { kind: 'refused' }> {
  return { kind: 'refused', action: args.action, code, correlationId: args.correlationId }
}

async function persistTerminalRefusal<A extends AdminCommandAction>(
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

async function persistReceipt<A extends AdminCommandAction>(
  ctx: MutationCtx,
  actorRef: string,
  operationName: string,
  key: string,
  requestHash: string,
  status: 'succeeded' | 'failed_terminal',
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
  set_business_suppression: MFA_PROOF_FAILURES,
  close_removal_dispute: MFA_PROOF_FAILURES,
  grant_admin_membership: MFA_PROOF_FAILURES,
  revoke_admin_membership: MFA_PROOF_FAILURES,
  verify_capability_source_authority: MFA_PROOF_FAILURES,
  change_commercial_policy: {
    reauthentication_required: 'mfa_reverification_required',
    proof_stale: 'proof_stale',
    proof_replayed: 'proof_replayed',
    command_changed: 'authority_mismatch',
  },
}

function proofFailure<A extends AdminCommandAction>(
  action: A,
  code: ProofFailureCode,
): AdminRefusalCode<A> {
  return PROOF_FAILURE_BY_ACTION[action][code]
}

function requireAuditTargetType(value: string): AuditTargetType {
  if (isAuditTargetType(value)) return value
  throw new Error(`invalid_admin_audit_target_type:${value}`)
}

function isAuditTargetType(value: string): value is AuditTargetType {
  return AuditTargetTypeValues.some((candidate) => candidate === value)
}


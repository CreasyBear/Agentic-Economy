import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type {
  AdminApprovalIntent,
  AdminApprovalRefusalCode,
  AdminCommandAction,
  AdminCommandReceipt,
  AdminProposableAction,
  AllowedAdminAuthority,
} from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import { persistAuditEvent } from '../../securityShared'

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1_000
const PROPOSABLE_BY_ACTION = {
  set_business_suppression: true,
  close_removal_dispute: false,
  grant_admin_membership: true,
  revoke_admin_membership: true,
  verify_capability_source_authority: false,
  change_commercial_policy: true,
} satisfies Record<AdminCommandAction, boolean>

export type ApprovalResolution<A extends AdminCommandAction> =
  | {
      kind: 'execute'
      approval: 'not_required' | 'second_approved'
      ownerAdminCountAtDecision: number
    }
  | {
      kind: 'proposed'
      receipt: Extract<AdminCommandReceipt<A>, { kind: 'proposed' }>
    }
  | { kind: 'refused'; code: AdminApprovalRefusalCode }

export async function resolveApprovalIntent<A extends AdminCommandAction>(
  ctx: MutationCtx,
  actor: AllowedAdminAuthority,
  args: Readonly<{
    action: A
    correlationId: string
    approval: AdminApprovalIntent
  }>,
  commandDigest: string,
  now: number = Date.now(),
): Promise<ApprovalResolution<A>> {
  const ownerAdminCountAtDecision = (
    await ctx.db
      .query('adminMemberships')
      .withIndex('by_state_and_role', (query) =>
        query.eq('state', 'active').eq('role', 'owner_admin'))
      .take(3)
  ).length

  if (!isProposableAction(args.action) || ownerAdminCountAtDecision < 2) {
    return { kind: 'execute', approval: 'not_required', ownerAdminCountAtDecision }
  }
  if (args.approval.kind === 'execute') {
    return { kind: 'refused', code: 'approval_required' }
  }

  const actorRef = actor.membership.tokenIdentifier
  if (args.approval.kind === 'propose') {
    const createdAt = now
    const expiresAt = createdAt + APPROVAL_TTL_MS
    const proposalRef = `admin-proposal:${canonicalDigest({
      commandDigest,
      proposerRef: actorRef,
      createdAt,
    })}`
    await ctx.db.insert('adminApprovalProposals', {
      proposalRef,
      action: args.action,
      commandDigest,
      proposerRef: actorRef,
      status: 'awaiting_second_approval',
      createdAt,
      expiresAt,
    })
    await persistApprovalAudit(ctx, {
      eventType: 'admin.action_proposed',
      actorRef,
      proposalRef,
      action: args.action,
      commandDigest,
      correlationId: args.correlationId,
      beforeState: 'none',
      afterState: 'awaiting_second_approval',
      now,
    })
    return {
      kind: 'proposed',
      receipt: {
        kind: 'proposed',
        action: args.action,
        proposalRef,
        expiresAt,
        correlationId: args.correlationId,
      },
    }
  }
  const proposalRef = args.approval.proposalRef

  const proposal = await ctx.db
    .query('adminApprovalProposals')
    .withIndex('by_proposalRef', (query) =>
      query.eq('proposalRef', proposalRef))
    .unique()
  if (proposal === null) return { kind: 'refused', code: 'approval_not_found' }
  if (proposal.status !== 'awaiting_second_approval') {
    return { kind: 'refused', code: 'approval_already_resolved' }
  }
  if (proposal.expiresAt < now) {
    await ctx.db.patch(proposal._id, { status: 'expired', resolvedAt: now })
    return { kind: 'refused', code: 'approval_expired' }
  }
  if (proposal.commandDigest !== commandDigest) {
    return { kind: 'refused', code: 'approval_digest_mismatch' }
  }
  if (proposal.proposerRef === actorRef) {
    return { kind: 'refused', code: 'approval_same_actor' }
  }
  if (actor.membership.role !== 'owner_admin') {
    return { kind: 'refused', code: 'approval_actor_not_owner_admin' }
  }

  await ctx.db.patch(proposal._id, {
    status: 'approved',
    approverRef: actorRef,
    resolvedAt: now,
  })
  await persistApprovalAudit(ctx, {
    eventType: 'admin.proposal_approved',
    actorRef,
    proposalRef: proposal.proposalRef,
    action: proposal.action,
    commandDigest,
    correlationId: args.correlationId,
    beforeState: 'awaiting_second_approval',
    afterState: 'approved',
    now,
  })
  return {
    kind: 'execute',
    approval: 'second_approved',
    ownerAdminCountAtDecision,
  }
}

export async function listOpenApprovalProposals(
  ctx: QueryCtx,
): Promise<readonly {
  proposalRef: string
  action: AdminProposableAction
  proposerRef: string
  createdAt: number
  expiresAt: number
}[]> {
  const proposals = await ctx.db
    .query('adminApprovalProposals')
    .withIndex('by_status_and_expiresAt', (query) =>
      query.eq('status', 'awaiting_second_approval'))
    .order('asc')
    .take(50)
  return proposals.map(({ proposalRef, action, proposerRef, createdAt, expiresAt }) => ({
    proposalRef,
    action,
    proposerRef,
    createdAt,
    expiresAt,
  }))
}

function isProposableAction(action: AdminCommandAction): action is AdminProposableAction {
  return PROPOSABLE_BY_ACTION[action]
}

type ApprovalAuditInput = Readonly<{
  eventType: 'admin.action_proposed' | 'admin.proposal_approved'
  actorRef: string
  proposalRef: string
  action: AdminProposableAction
  commandDigest: string
  correlationId: string
  beforeState: string
  afterState: string
  now: number
}>

async function persistApprovalAudit(
  ctx: MutationCtx,
  input: ApprovalAuditInput,
): Promise<void> {
  const redactedPayload = {
    commandDigest: input.commandDigest,
    action: input.action,
  }
  const eventIdentity = {
    eventType: input.eventType,
    proposalRef: input.proposalRef,
    actorRef: input.actorRef,
    createdAt: input.now,
  }
  await persistAuditEvent(ctx.db, {
    eventId: brandNonEmpty(
      `audit:${input.eventType}:${canonicalDigest(eventIdentity)}`,
      'AuditEventId',
    ),
    eventType: input.eventType,
    actorKind: 'admin',
    actorRef: input.actorRef,
    targetType: 'admin_approval_proposal',
    targetRef: input.proposalRef,
    idempotencyKey: brandNonEmpty(
      `admin-approval:${canonicalDigest(eventIdentity)}`,
      'OperationKey',
    ),
    correlationId: brandNonEmpty(input.correlationId, 'CorrelationId'),
    beforeState: input.beforeState,
    afterState: input.afterState,
    evidenceRefs: [],
    redactedPayload,
    payloadHash: canonicalDigest(redactedPayload),
    createdAt: input.now,
  })
}

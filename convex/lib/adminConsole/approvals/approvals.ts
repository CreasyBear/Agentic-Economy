import type { PaginationOptions, PaginationResult } from 'convex/server'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type {
  AdminActionInput,
  AdminApprovalIntent,
  AdminApprovalRefusalCode,
  AdminCommandAction,
  AdminCommandReceipt,
  AdminProposableAction,
  AdminReasonCodeByAction,
  AllowedAdminAuthority,
} from '@/lib/operator/admin-console/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { brandNonEmpty } from '@/modules/common/ids'
import { persistAuditEvent } from '../../security/audit/persistence'

const APPROVAL_TTL_MS = 24 * 60 * 60 * 1_000
const PROPOSABLE_BY_ACTION = {
  review_call_content: false,
  set_business_suppression: true,
  close_removal_dispute: false,
  grant_admin_membership: true,
  revoke_admin_membership: true,
  verify_capability_source_authority: false,
  change_commercial_policy: true,
  grant_promotional_credit: true,
  issue_trial: true,
  set_payments_paused: true,
  set_payments_audience: true,
  change_treasury_thresholds: false,
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
    input: AdminActionInput[A]
    reasonCode: AdminReasonCodeByAction[A]
    evidenceRefs: readonly string[]
    expectedStateDigest?: string
    correlationId: string
    approval: AdminApprovalIntent
  }>,
  commandDigest: string,
  now: number = Date.now(),
  preflight = false,
): Promise<ApprovalResolution<A>> {
  const ownerAdminCountAtDecision = (
    await ctx.db
      .query('adminMemberships')
      .withIndex('by_state_and_role', (query) =>
        query.eq('state', 'active').eq('role', 'owner_admin'))
      .take(3)
  ).length

  if (!isProposableAction(args.action)) {
    return { kind: 'execute', approval: 'not_required', ownerAdminCountAtDecision }
  }
  if (args.approval.kind !== 'approve'
    && (!await needsSecondApproval(ctx, args) || ownerAdminCountAtDecision < 2)) {
    return { kind: 'execute', approval: 'not_required', ownerAdminCountAtDecision }
  }
  if (args.approval.kind === 'execute') {
    return { kind: 'refused', code: 'approval_required' }
  }
  if (preflight && args.approval.kind === 'propose') {
    return { kind: 'execute', approval: 'not_required', ownerAdminCountAtDecision }
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
      commandJson: JSON.stringify({
        input: args.input,
        reasonCode: args.reasonCode,
        evidenceRefs: args.evidenceRefs,
        ...(args.expectedStateDigest === undefined
          ? {}
          : { expectedStateDigest: args.expectedStateDigest }),
      }),
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
  if (proposal.expiresAt <= now) {
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
  if (preflight) {
    return { kind: 'execute', approval: 'second_approved', ownerAdminCountAtDecision }
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
  includeCommand: boolean,
  paginationOpts: PaginationOptions,
  now: number,
): Promise<PaginationResult<{
  proposalRef: string
  action: AdminProposableAction
  commandJson: string | null
  proposerRef: string
  createdAt: number
  expiresAt: number
}>> {
  const result = await ctx.db.query('adminApprovalProposals')
    .withIndex('by_status_and_expiresAt', (query) =>
      query.eq('status', 'awaiting_second_approval').gt('expiresAt', now))
    .order('asc')
    .paginate(paginationOpts)
  return {
    ...result,
    page: result.page.map(({ proposalRef, action, commandJson, proposerRef, createdAt, expiresAt }) => ({
      proposalRef, action, commandJson: includeCommand ? commandJson : null,
      proposerRef, createdAt, expiresAt,
    })),
  }
}

async function needsSecondApproval(
  ctx: MutationCtx,
  args: Readonly<{ action: AdminCommandAction; input: AdminActionInput[AdminCommandAction] }>,
): Promise<boolean> {
  if (!isProposableAction(args.action)) return false
  if (args.action === 'set_payments_paused' && 'paused' in args.input) return !args.input.paused
  if (args.action === 'set_payments_audience' && 'audience' in args.input) return args.input.audience === 'everyone'
  if (args.action === 'grant_admin_membership' && 'role' in args.input
    && args.input.role === 'owner_admin') return true
  if (args.action !== 'grant_admin_membership' && args.action !== 'revoke_admin_membership') return true
  if (!('targetClerkUserId' in args.input)) return true
  const targetClerkUserId = args.input.targetClerkUserId
  const membership = await ctx.db.query('adminMemberships')
    .withIndex('by_clerkUserId_and_state', (query) =>
      query.eq('clerkUserId', targetClerkUserId).eq('state', 'active'))
    .first()
  return membership === null
    ? args.action === 'revoke_admin_membership'
    : membership.role === 'owner_admin'
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

import { v } from 'convex/values'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { hasFreshMfaFactorVerification } from '../../principalAccount/workspaceSecurity/factorVerification'
import { decideCallApprovalHandler, listPendingCallApprovalsHandler } from './admissionApprovals'
import { cancelOwnerCallHandler, readOwnerCallStatusHandler, reconcileOwnerCallHandler } from './callRecoveryActions'
import { agentRecoveryNotFound, agentStatusNotFound } from './agentCallExecution'
import { approvalDecision, pendingApprovalView } from './admissionApproval'

export const listPendingCallApprovalsArgs = {}
export const decideCallApprovalArgs = { callRef: v.string(), decision: approvalDecision }
export const listPendingCallApprovalsResult = v.array(pendingApprovalView)

type CanonicalOwner = Extract<Awaited<ReturnType<typeof resolveBusinessActor>>, { kind: 'authenticated_owner' }>

async function canonicalOwnerContext<T extends QueryCtx | MutationCtx | ActionCtx>(
  ctx: T,
  actor: CanonicalOwner,
): Promise<T> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) throw new Error('canonical_owner_identity_missing')
  const auth = new Proxy(ctx.auth, {
    get(target, property, receiver) {
      return property === 'getUserIdentity'
        ? async () => ({
            ...identity,
            subject: actor.canonicalPrincipalRef,
            tokenIdentifier: actor.canonicalAccountRef,
          })
        : Reflect.get(target, property, receiver)
    },
  })
  return new Proxy(ctx, {
    get(target, property, receiver) {
      return property === 'auth' ? auth : Reflect.get(target, property, receiver)
    },
  })
}

async function canonicalOwnerActor<T extends QueryCtx | MutationCtx | ActionCtx>(
  ctx: T,
): Promise<{ actor: CanonicalOwner; ctx: T } | null> {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  return { actor, ctx: await canonicalOwnerContext(ctx, actor) }
}

export async function canonicalOwnerApprovalListHandler(ctx: QueryCtx) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null ? [] : await listPendingCallApprovalsHandler(canonical.ctx)
}

export async function canonicalOwnerApprovalDecisionHandler(
  ctx: MutationCtx,
  args: Parameters<typeof decideCallApprovalHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  if (canonical === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
  if (args.decision === 'approve') {
    const row = await canonical.ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', q => q.eq('callRef', args.callRef)).unique()
    if (row?.ownerId === canonical.actor.canonicalAccountRef
      && row.applicationRef === 'ae-owner-chat') {
      const identity = await ctx.auth.getUserIdentity()
      if (!hasFreshMfaFactorVerification(identity?.fva)) {
        return { kind: 'refused' as const, code: 'mfa_reverification_required' as const }
      }
    }
  }
  return await decideCallApprovalHandler(canonical.ctx, args)
}

export async function canonicalOwnerStatusHandler(
  ctx: ActionCtx,
  args: Parameters<typeof readOwnerCallStatusHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentStatusNotFound(args.callRef)
    : await readOwnerCallStatusHandler(canonical.ctx, args)
}

export async function canonicalOwnerCancelHandler(
  ctx: ActionCtx,
  args: Parameters<typeof cancelOwnerCallHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentRecoveryNotFound(args.callRef)
    : await cancelOwnerCallHandler(canonical.ctx, args)
}

export async function canonicalOwnerReconcileHandler(
  ctx: ActionCtx,
  args: Parameters<typeof reconcileOwnerCallHandler>[1],
) {
  const canonical = await canonicalOwnerActor(ctx)
  return canonical === null
    ? agentRecoveryNotFound(args.callRef)
    : await reconcileOwnerCallHandler(canonical.ctx, args)
}


import { v, type Infer } from 'convex/values'
import type { ActionCtx, MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { clerkMfaConsequenceProofValue, consumeConsequenceProof, deriveMfaConsequenceProof } from '../../authority/consequence/proof'
import { requireSourceRead, requireSourceWrite } from '../../security/sourceWrite/admission'
import { sourceWriteArgs } from '../../security/sourceWrite/contracts'
import { decideCallApprovalHandler, listPendingCallApprovalsHandler } from './admissionApprovals'
import { cancelOwnerCallHandler, readOwnerCallStatusHandler, reconcileOwnerCallHandler } from './callRecoveryActions'
import { agentRecoveryNotFound, agentStatusNotFound } from './agentCallExecution'
import { approvalDecision, pendingApprovalView } from './admissionApproval'

export const listPendingCallApprovalsArgs = {}
const decideCallApprovalCommandValue = v.object({
  callRef: v.string(), decision: approvalDecision, operationKey: v.string(), correlationId: v.string(),
  proof: v.optional(clerkMfaConsequenceProofValue), ...sourceWriteArgs,
})
export const decideCallApprovalArgs = decideCallApprovalCommandValue.fields
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
  args: Infer<typeof decideCallApprovalCommandValue>,
) {
  const commandRef = `call-approval:${args.callRef}:${args.decision}`
  if (args.operationKey !== commandRef || args.correlationId !== commandRef
    || (await requireSourceRead(args, 'protected_action')).kind === 'rejected') {
    return { kind: 'refused' as const, code: 'invocation_invalid' as const }
  }
  const canonical = await canonicalOwnerActor(ctx)
  if (canonical === null) return { kind: 'refused' as const, code: 'authentication_required' as const }
  const identity = await ctx.auth.getUserIdentity()
  return await decideCallApprovalHandler(canonical.ctx, args, async (row, now) => {
    if (args.decision === 'deny' || row.applicationRef !== 'ae-owner-chat') {
      return (await requireSourceWrite(ctx, args, 'protected_action')).kind === 'rejected'
        ? { kind: 'refused', code: 'invocation_invalid' } : null
    }
    if (identity === null || args.proof === undefined) return { kind: 'refused', code: 'mfa_reverification_required' }
    const derived = deriveMfaConsequenceProof({ proof: args.proof, subject: identity.subject, now })
    if (derived.kind === 'refused') return { kind: 'refused', code: 'mfa_reverification_required' }
    const commandDigest = canonicalDigest({ action: 'owner-chat:approve-call', idempotencyRef: commandRef,
        callRef: row.callRef, quoteRef: row.quoteRef ?? null, toolRef: row.toolRef,
        inputDigest: row.inputDigest, requestDigest: row.requestDigest, grantRef: row.grantRef,
        grantGeneration: row.grantGeneration, policyDigest: row.policyDigest,
        actorPrincipalRef: canonical.actor.canonicalPrincipalRef, accountRef: canonical.actor.canonicalAccountRef })
    const existing = await ctx.db.query('consequenceProofUses').withIndex('by_reverificationId', q =>
      q.eq('reverificationId', args.proof!.reverificationId)).unique()
    if (existing !== null && (existing.actorPrincipalRef !== canonical.actor.canonicalPrincipalRef
      || existing.activeAccountRef !== canonical.actor.canonicalAccountRef || existing.commandDigest !== commandDigest
      || existing.idempotencyRef !== commandRef)) return { kind: 'refused', code: 'mfa_reverification_required' }
    if ((await requireSourceWrite(ctx, args, 'protected_action')).kind === 'rejected') {
      return { kind: 'refused', code: 'invocation_invalid' }
    }
    const consumed = await consumeConsequenceProof(ctx, {
      reverificationId: args.proof.reverificationId, actorPrincipalRef: canonical.actor.canonicalPrincipalRef,
      activeAccountRef: canonical.actor.canonicalAccountRef, commandDigest,
      proof: derived.proof, correlationRef: args.correlationId, idempotencyRef: args.operationKey,
    })
    // Throwing rolls back the nonce, proof consumption and effects on reuse.
    if (consumed.kind === 'refused') throw new Error('call_approval_proof_replayed')
    return null
  })
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

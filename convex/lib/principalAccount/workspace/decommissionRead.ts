import type { QueryCtx } from '../../../_generated/server'
import { v } from 'convex/values'

import { checkWorkspaceFences } from './decommissionFences'
import { InteractiveAuthorityError } from '../../../interactiveAuthority'
import { accountRef } from '../../../../src/modules/principal-account/account/public'
import { principalRef } from '../../../../src/modules/principal-account/principal/public'
import { callerIsAccountOwner, requireAuthenticatedAccountContext, requireCurrentOwnership } from './accountContext'
import type { WorkspaceDb } from './identity'

const workspaceFenceReasonValue = v.union(
  v.literal('unsettled_provider_obligations'),
  v.literal('unwithdrawn_earnings'),
  v.literal('open_calls'),
  v.literal('unreleased_call_holds'),
  v.literal('in_flight_funding'),
  v.literal('open_reconciliation'),
)

const decommissionEligibilityValue = v.object({
  accountRef: v.string(),
  displayName: v.string(),
  accountRevision: v.number(),
  ownershipRevision: v.number(),
  callerIsOwner: v.boolean(),
  canClose: v.boolean(),
  canTransfer: v.boolean(),
  fences: v.array(workspaceFenceReasonValue),
  transferCandidates: v.array(v.object({
    principalRef: v.string(),
    displayName: v.string(),
    membershipRef: v.string(),
  })),
})

export async function loadTransferCandidates(
  db: WorkspaceDb,
  canonicalAccountRef: ReturnType<typeof accountRef>,
  incumbentPrincipalRef: ReturnType<typeof principalRef>,
): Promise<Array<{ principalRef: string; displayName: string; membershipRef: string }>> {
  const memberships = await db
    .query('memberships')
    .withIndex('by_accountRef_and_lifecycle', (query) => query
      .eq('accountRef', canonicalAccountRef)
      .eq('lifecycle', 'active'))
    .collect()
  const candidates: Array<{ principalRef: string; displayName: string; membershipRef: string }> = []
  for (const membership of memberships) {
    if (membership.memberPrincipalRef === incumbentPrincipalRef) continue
    const memberPrincipal = await db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', membership.memberPrincipalRef))
      .unique()
    if (memberPrincipal === null || memberPrincipal.lifecycle !== 'active') continue
    candidates.push({
      principalRef: membership.memberPrincipalRef,
      displayName: memberPrincipal.displayName,
      membershipRef: membership.membershipRef,
    })
  }
  return candidates
}

export const readWorkspaceDecommissionEligibilityArgs = v.object({})

export const readWorkspaceDecommissionEligibilityResult = decommissionEligibilityValue

export const readWorkspaceDecommissionEligibilityHandler = async (ctx: QueryCtx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (identity === null) throw new InteractiveAuthorityError('identity_invalid')
    const { canonicalPrincipalRef, canonicalAccountRef, account } =
      await requireAuthenticatedAccountContext(ctx.db, identity)

    const currentOwnership = await requireCurrentOwnership(ctx.db, account)
    const callerIsOwner = await callerIsAccountOwner(ctx.db, account, canonicalPrincipalRef)
    const fences = await checkWorkspaceFences(ctx, canonicalAccountRef)
    const transferCandidates = callerIsOwner
      ? await loadTransferCandidates(ctx.db, canonicalAccountRef, canonicalPrincipalRef)
      : []

    return {
      accountRef: canonicalAccountRef,
      displayName: account.displayName,
      accountRevision: account.revision,
      ownershipRevision: currentOwnership.revision,
      callerIsOwner,
      canClose: callerIsOwner && fences.length === 0,
      canTransfer: callerIsOwner && transferCandidates.length > 0,
      fences,
      transferCandidates,
    }
  }

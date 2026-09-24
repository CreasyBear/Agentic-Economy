import { v, type ObjectType } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { agentSpendingLimitsReadResultValue, type AgentSpendingLimitsReadResult, projectAgentAccessGrant } from '@/modules/agent-access/policy'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { loadOwnedAgent, mapLoadFailure, type OwnerAuthority } from './material'

export const readCurrentArgs = { principalRef: v.string() }
export const readCurrentResult = agentSpendingLimitsReadResultValue

/**
 * Owner-authenticated current readback. The query returns only the three
 * editable amounts plus the immutable grant revision/digest needed to issue a
 * fenced update; all other policy material remains server-owned.
 */
export async function readCurrentHandler(
  ctx: QueryCtx, args: ObjectType<typeof readCurrentArgs>,
): Promise<AgentSpendingLimitsReadResult> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return { kind: 'refused', code: 'authentication_required' }
  let owner: OwnerAuthority
  try {
    owner = await resolveInteractiveAuthorityContext(ctx.db, identity)
  } catch (cause) {
    void cause;
    return { kind: 'refused', code: 'authority_unavailable' }
  }
  if (owner.provenance.accessKind !== 'ownership') {
    return { kind: 'refused', code: 'account_ownership_required' }
  }
  const requestedPrincipalRef = args.principalRef.trim()
  if (requestedPrincipalRef.length === 0) return { kind: 'refused', code: 'agent_not_found' }
  const loaded = await loadOwnedAgent(ctx, owner, requestedPrincipalRef, Date.now())
  if (loaded.kind !== 'ok') return mapLoadFailure(loaded) as AgentSpendingLimitsReadResult
  const { admission, grant } = loaded.material
  const budget = projectAgentAccessGrant(grant).budget
  return {
    kind: 'current',
    principalRef: admission.principalId,
    grantRef: grant.grantRef,
    generation: grant.generation,
    spendingPolicyDigest: grant.spendingPolicyDigest,
    maximumSpendPerCall: budget.maximumSpendPerCall,
    maximumDailySpend: budget.maximumDailySpend,
    maximumMonthlySpend: budget.maximumMonthlySpend,
  }
}

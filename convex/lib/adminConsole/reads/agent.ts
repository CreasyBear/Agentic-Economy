import { v } from 'convex/values'

import { parseCallRef } from '@/modules/capability-execution/call-contracts'
import { accountRef } from '@/modules/principal-account/account/public'
import type { PrincipalRef } from '@/modules/principal-account/principal/public'
import type { AdminAgentView } from '@/lib/operator/admin-console/views'
import type { QueryCtx } from '../../../_generated/server'

const credentialLifecycleValue = v.union(
  v.literal('active'),
  v.literal('revoked'),
  v.literal('expired'),
)

export const adminAgentViewValue = v.object({
  kind: v.literal('agent'),
  ref: v.string(),
  workspaceRef: v.union(v.string(), v.null()),
  credentialLifecycle: credentialLifecycleValue,
  spendingPolicyRef: v.union(v.string(), v.null()),
  recentCallRefs: v.array(v.string()),
})

export async function readAdminAgentView(
  ctx: QueryCtx,
  ref: PrincipalRef,
): Promise<AdminAgentView | { kind: 'object_not_found' }> {
  const [principal, agent, calls, grants] = await Promise.all([
    ctx.db
      .query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', ref))
      .unique(),
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', ref))
      .unique(),
    ctx.db
      .query('capabilityCalls')
      .withIndex('by_principalId_and_createdAt', (query) => query.eq('principalId', ref))
      .order('desc')
      .take(10),
    ctx.db
      .query('agentAccessGrants')
      .withIndex('by_principalId', (query) => query.eq('principalId', ref))
      .take(50),
  ])
  if (principal === null || principal.kind !== 'agent' || agent === null) {
    return { kind: 'object_not_found' }
  }

  const activeGrant = grants.find((grant) =>
    grant.lifecycle === 'active'
    && grant.generation === agent.grantGeneration
    && grant.credentialId === agent.credentialId)
  const recentCallRefs = calls.flatMap((call) => {
    const parsed = parseCallRef(call.callRef)
    return parsed.kind === 'valid' ? [parsed.ref] : []
  })

  return {
    kind: 'agent',
    ref,
    workspaceRef: accountRef(agent.ownerId),
    credentialLifecycle: agent.lifecycle,
    spendingPolicyRef: activeGrant === undefined || agent.authorityMode !== 'spending_policy'
      ? null
      : `agent-access-grant:${activeGrant.grantRef}`,
    recentCallRefs,
  }
}

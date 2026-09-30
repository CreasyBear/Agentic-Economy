import { v } from 'convex/values'

import { accountLifecycleValue, type AccountRef } from '@/modules/principal-account/account/public'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import type { AdminWorkspaceView } from '@/lib/operator/admin-console/views'
import type { QueryCtx } from '../../../_generated/server'
import { env } from '../../../_generated/server'

export const adminWorkspaceViewValue = v.object({
  kind: v.literal('workspace'),
  ref: v.string(),
  lifecycle: accountLifecycleValue,
  ownerCount: v.number(),
  memberCount: v.number(),
  createdAt: v.number(),
  externalOrganizationBound: v.boolean(),
  hasActiveSpendingPolicy: v.boolean(),
  paymentEnvironment: v.union(v.literal('sandbox'), v.literal('production'), v.null()),
})

export async function readAdminWorkspaceView(
  ctx: QueryCtx,
  ref: AccountRef,
): Promise<AdminWorkspaceView | { kind: 'object_not_found' }> {
  const account = await ctx.db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', ref))
    .unique()
  if (account === null) return { kind: 'object_not_found' }

  const [memberships, organizationBinding, activeAgents] = await Promise.all([
    ctx.db
      .query('memberships')
      .withIndex('by_accountRef_and_lifecycle', (query) =>
        query.eq('accountRef', ref).eq('lifecycle', 'active'))
      .take(200),
    ctx.db
      .query('accountExternalOrganizationBindings')
      .withIndex('by_accountRef_and_lifecycle', (query) =>
        query.eq('accountRef', ref).eq('lifecycle', 'active'))
      .first(),
    ctx.db
      .query('agentAccessPrincipals')
      .withIndex('by_ownerId_and_lifecycle', (query) =>
        query.eq('ownerId', ref).eq('lifecycle', 'active'))
      .take(50),
  ])

  return {
    kind: 'workspace',
    ref,
    lifecycle: account.lifecycle,
    ownerCount: memberships.filter((membership) => membership.role === 'org:admin').length,
    memberCount: memberships.length,
    createdAt: account.createdAt,
    externalOrganizationBound: organizationBinding !== null,
    hasActiveSpendingPolicy: activeAgents.some(
      (agent) => agent.authorityMode === 'spending_policy',
    ),
    paymentEnvironment: deploymentPaymentEnvironment(env) ?? null,
  }
}

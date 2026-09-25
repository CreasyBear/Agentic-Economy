import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import type { ClerkSecurityObservation } from '../../../../src/modules/security/account-security'

const MACHINE_AGENT_CASCADE_CAP = 64

export async function revokeMachineAgentsForCreator(
  ctx: Pick<MutationCtx, 'db'>,
  observation: ClerkSecurityObservation,
  humanPrincipalRef: string,
  createdAt: number,
): Promise<void> {
  const accountRefs = new Set<string>()
  const ownershipRows = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownerPrincipalRef_and_lifecycle', (index) => index
      .eq('ownerPrincipalRef', humanPrincipalRef)
      .eq('lifecycle', 'active'))
    .collect()
  for (const ownership of ownershipRows) accountRefs.add(ownership.accountRef)

  const membershipRows = await ctx.db.query('memberships')
    .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
      .eq('memberPrincipalRef', humanPrincipalRef)
      .eq('lifecycle', 'active'))
    .collect()
  for (const membership of membershipRows) accountRefs.add(membership.accountRef)

  const matchedAgents: Doc<'agentAccessPrincipals'>[] = []
  for (const accountRef of accountRefs) {
    if (matchedAgents.length >= MACHINE_AGENT_CASCADE_CAP) break
    const agents = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_ownerId_and_lifecycle', (index) => index
        .eq('ownerId', accountRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const agent of agents) {
      if (matchedAgents.length >= MACHINE_AGENT_CASCADE_CAP) break
      if (agent.ownerTokenIdentifier !== observation.providerIdentifier) continue
      matchedAgents.push(agent)
    }
  }

  for (const agent of matchedAgents) {
    await revokeMachineAgentAdmissionAndDependents(ctx, agent, observation, createdAt)
  }
}

async function revokeMachineAgentAdmissionAndDependents(
  ctx: Pick<MutationCtx, 'db'>,
  agent: Doc<'agentAccessPrincipals'>,
  observation: ClerkSecurityObservation,
  createdAt: number,
): Promise<void> {
  if (agent.lifecycle !== 'revoked') {
    await ctx.db.patch(agent._id, { lifecycle: 'revoked', lastSeenAt: createdAt })
  }

  const grants = await ctx.db.query('agentAccessGrants')
    .withIndex('by_principalId', (index) => index.eq('principalId', agent.principalId))
    .collect()
  for (const grant of grants) {
    if (grant.lifecycle !== 'active') continue
    await ctx.db.patch(grant._id, { lifecycle: 'revoked', updatedAt: createdAt })
  }

  const families = await ctx.db.query('agentAccessOAuthRefreshFamilies')
    .withIndex('by_principalRef_and_lifecycle', (index) => index
      .eq('principalRef', agent.principalId)
      .eq('lifecycle', 'active'))
    .collect()
  for (const family of families) {
    await ctx.db.patch(family._id, {
      lifecycle: 'revoked',
      revocationReason: 'clerk_password_reset',
      updatedAt: createdAt,
    })
  }

  for (const lifecycle of ['active', 'stale'] as const) {
    const credentials = await ctx.db.query('credentials')
      .withIndex('by_principalRef_and_lifecycle', (index) => index
        .eq('principalRef', agent.principalId)
        .eq('lifecycle', lifecycle))
      .collect()
    for (const credential of credentials) {
      await ctx.db.patch(credential._id, {
        lifecycle: 'revoked',
        revokedAt: observation.observedAt,
        revision: credential.revision + 1,
        updatedAt: createdAt,
      })
    }
  }

  const delegations = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_subjectPrincipalRef_and_lifecycle', (index) => index
      .eq('subjectPrincipalRef', agent.principalId)
      .eq('lifecycle', 'active'))
    .collect()
  for (const delegation of delegations) {
    await ctx.db.patch(delegation._id, { lifecycle: 'revoked' })
  }
}

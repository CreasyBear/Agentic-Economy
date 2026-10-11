import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { ClerkSecurityObservation } from '../../../../src/modules/security/account-security'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import { persistAgentAudit } from '../../agentAccess/principals/records'

// Sign-in cascades are capped; a scoped removal revokes every agent the member created.
const MACHINE_AGENT_CASCADE_CAP = 64

type CascadeObservation = Pick<ClerkSecurityObservation, 'providerIdentifier' | 'deliveryRefHash' | 'observedAt'>

export async function revokeMachineAgentsForCreatorObservation(
  ctx: Pick<MutationCtx, 'db'>,
  observation: CascadeObservation,
  authority: Readonly<{ principalRef: string }>,
  createdAt: number,
  correlationRef: string,
  onlyAccountRef?: string,
): Promise<void> {
  const accountRefs = new Set<string>()
  const ownershipRows = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownerPrincipalRef_and_lifecycle', (index) => index
      .eq('ownerPrincipalRef', authority.principalRef)
      .eq('lifecycle', 'active'))
    .collect()
  for (const ownership of ownershipRows) accountRefs.add(ownership.accountRef)

  const membershipRows = await ctx.db.query('memberships')
    .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
      .eq('memberPrincipalRef', authority.principalRef)
      .eq('lifecycle', 'active'))
    .collect()
  for (const membership of membershipRows) accountRefs.add(membership.accountRef)
  // A removed member's membership is already ended, so a scoped call names its account directly.
  if (onlyAccountRef !== undefined) {
    accountRefs.clear()
    accountRefs.add(onlyAccountRef)
  }

  const cap = onlyAccountRef === undefined ? MACHINE_AGENT_CASCADE_CAP : Number.POSITIVE_INFINITY
  const matchedAgents: Doc<'agentAccessPrincipals'>[] = []
  for (const accountRef of accountRefs) {
    if (matchedAgents.length >= cap) break
    const agents = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_ownerId_and_lifecycle', (index) => index
        .eq('ownerId', accountRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const agent of agents) {
      if (matchedAgents.length >= cap) break
      if (!await machineAgentCreatedByHuman(ctx, agent, accountRef, authority.principalRef, observation.providerIdentifier)) {
        continue
      }
      matchedAgents.push(agent)
    }
  }

  for (const agent of matchedAgents) {
    await revokeMachineAgentAdmissionAndDependents(ctx, agent, observation, authority, createdAt, correlationRef)
  }
}

async function machineAgentCreatedByHuman(
  ctx: Pick<MutationCtx, 'db'>,
  agent: Doc<'agentAccessPrincipals'>,
  accountRef: string,
  humanPrincipalRef: string,
  providerIdentifier: string,
): Promise<boolean> {
  if (agent.ownerTokenIdentifier === providerIdentifier) return true
  if (agent.ownerTokenIdentifier !== undefined) return false
  const membership = await ctx.db.query('memberships')
    .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (index) => index
      .eq('accountRef', accountRef)
      .eq('memberPrincipalRef', agent.principalId)
      .eq('lifecycle', 'active'))
    .unique()
  return membership?.createdBy.actorPrincipalRef === humanPrincipalRef
}

async function revokeMachineAgentAdmissionAndDependents(
  ctx: Pick<MutationCtx, 'db'>,
  agent: Doc<'agentAccessPrincipals'>,
  observation: CascadeObservation,
  authority: Readonly<{ principalRef: string }>,
  createdAt: number,
  correlationRef: string,
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

  await persistAgentAudit(ctx, {
    eventType: 'agent.disconnected',
    actorPrincipalRef: authority.principalRef,
    activeAccountRef: agent.ownerId,
    agentRef: agent.principalId,
    correlationRef,
    idempotencyRef: canonicalDigest({
      format: 'clerk-machine-cascade-disconnect:v1',
      correlationRef,
      agentPrincipalRef: agent.principalId,
      deliveryRefHash: observation.deliveryRefHash,
    } as never),
    beforeState: 'connected_or_attention',
    outcome: 'disconnected',
    occurredAt: createdAt,
  })
}

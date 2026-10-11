import { v, type Infer } from 'convex/values'
import { internal } from '../../../_generated/api'
import type { Doc } from '../../../_generated/dataModel'
import type { MutationCtx } from '../../../_generated/server'
import type { ClerkSecurityObservation } from '../../../../src/modules/security/account-security'

/** Agents revoked per mutation; each costs about six reads plus patches. */
const MACHINE_AGENT_CHUNK = 25

export const revokeMachineAgentsChunkArgs = {
  providerIdentifier: v.string(),
  observedAt: v.number(),
  accountRefs: v.array(v.string()),
  ownedAccountRefs: v.array(v.string()),
  createdAt: v.number(),
}

type ChunkArgs = Infer<ReturnType<typeof v.object<typeof revokeMachineAgentsChunkArgs>>>

export async function revokeMachineAgentsForCreator(
  ctx: Pick<MutationCtx, 'db' | 'scheduler'>,
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
  const ownedAccountRefs = new Set<string>()
  for (const ownership of ownershipRows) {
    accountRefs.add(ownership.accountRef)
    ownedAccountRefs.add(ownership.accountRef)
  }

  const membershipRows = await ctx.db.query('memberships')
    .withIndex('by_memberPrincipalRef_and_lifecycle', (index) => index
      .eq('memberPrincipalRef', humanPrincipalRef)
      .eq('lifecycle', 'active'))
    .collect()
  for (const membership of membershipRows) accountRefs.add(membership.accountRef)

  await revokeMachineAgentsChunk(ctx, {
    providerIdentifier: observation.providerIdentifier,
    observedAt: observation.observedAt,
    accountRefs: [...accountRefs],
    ownedAccountRefs: [...ownedAccountRefs],
    createdAt,
  })
}

/**
 * Revokes up to one chunk of matching active agents, then reschedules itself until none remain.
 * Revoked agents leave the active index, so each run is idempotent and a retry only sees what is left.
 */
export async function revokeMachineAgentsChunk(
  ctx: Pick<MutationCtx, 'db' | 'scheduler'>,
  args: ChunkArgs,
): Promise<null> {
  const owned = new Set(args.ownedAccountRefs)
  const matchedAgents: Doc<'agentAccessPrincipals'>[] = []
  let more = false
  for (const accountRef of args.accountRefs) {
    const agents = await ctx.db.query('agentAccessPrincipals')
      .withIndex('by_ownerId_and_lifecycle', (index) => index
        .eq('ownerId', accountRef)
        .eq('lifecycle', 'active'))
      .collect()
    for (const agent of agents) {
      const ownerMatches = agent.ownerTokenIdentifier === args.providerIdentifier
        || (agent.ownerTokenIdentifier === undefined && owned.has(accountRef))
      if (!ownerMatches) continue
      if (matchedAgents.length >= MACHINE_AGENT_CHUNK) { more = true; break }
      matchedAgents.push(agent)
    }
    if (more) break
  }

  for (const agent of matchedAgents) {
    await revokeMachineAgentAdmissionAndDependents(ctx, agent, args.observedAt, args.createdAt)
  }
  if (more) await ctx.scheduler.runAfter(0, internal.personalAccount.revokeMachineAgentsChunk, args)
  return null
}

async function revokeMachineAgentAdmissionAndDependents(
  ctx: Pick<MutationCtx, 'db'>,
  agent: Doc<'agentAccessPrincipals'>,
  observedAt: number,
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
        revokedAt: observedAt,
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

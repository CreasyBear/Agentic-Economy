import { v } from 'convex/values'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { toDomain, toLeaseDomain } from './lifecycle'
import { validateCanonicalAgentDelegation } from '../../authority/canonicalAgent/authority'
import { providerLeaseIsCurrent } from './leases'

export const beginLeaseEffectArgs = {
  leaseRef: v.string(),
  callRef: v.string(),
  toolRef: v.string(),
  commandId: v.string(),
} as const

export const leaseEffectAdmission = v.union(
  v.object({
    kind: v.literal('admitted'),
    effectRef: v.string(),
    leaseRef: v.string(),
    connectionRef: v.string(),
    authorityGeneration: v.number(),
    owningAccountRef: v.string(),
    activeAccountRef: v.string(),
    actorPrincipalRef: v.string(),
    grantRef: v.string(),
    grantGeneration: v.number(),
    secretRef: v.string(),
  }),
  v.object({ kind: v.literal('unavailable'), reason: v.string() }),
)

function leaseMatchesEffectRequest(
  lease: ReturnType<typeof toLeaseDomain>,
  args: Readonly<{ callRef: string; toolRef: string }>,
): boolean {
  return [
    lease.callRef === args.callRef,
    lease.toolRef === args.toolRef,
    lease.state === 'active',
  ].every(Boolean)
}

async function invocationAuthorityMatchesLease(
  ctx: MutationCtx,
  invocation: Doc<'capabilityCalls'> | null,
  lease: ReturnType<typeof toLeaseDomain>,
  connection: ReturnType<typeof toDomain>,
  toolRef: string,
  now: number,
): Promise<boolean> {
  if (invocation === null || ![
    invocation.toolRef === toolRef,
    invocation.grantRef === lease.grantRef,
    invocation.grantGeneration === lease.grantGeneration,
    invocation.principalId === lease.actorPrincipalRef,
    lease.owningAccountRef === connection.owningAccountRef,
    lease.activeAccountRef === connection.owningAccountRef,
  ].every(Boolean)) return false
  const snapshot = await validateCanonicalAgentDelegation(ctx, {
    evidenceKind: 'provider-connection-effect',
    evidenceRef: lease.leaseRef,
    principalRef: lease.actorPrincipalRef,
    accountRef: connection.owningAccountRef,
    grantRef: lease.grantRef,
    grantGeneration: lease.grantGeneration,
    requiredScopes: ['connection:begin_effect', 'connection:lease'],
    resourceRefs: [toolRef, `connection:${lease.connectionRef}`],
    now,
  })
  const leaf = snapshot?.ancestry.at(-1)
  return snapshot !== null && leaf !== undefined && [
    snapshot.accountRef === connection.owningAccountRef,
    snapshot.actorPrincipalRef === lease.actorPrincipalRef,
    snapshot.grantRef === lease.grantRef,
    snapshot.generation === lease.grantGeneration,
    leaf.expiresAt === invocation.grantExpiresAt,
  ].every(Boolean)
}

export async function beginLeaseEffectHandler(
  ctx: MutationCtx,
  args: Readonly<{ leaseRef: string; callRef: string; toolRef: string; commandId: string }>,
) {
  const leaseRow = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef))
    .unique()
  if (leaseRow === null) {
    return { kind: 'unavailable' as const, reason: 'lease_inactive' }
  }
  const lease = toLeaseDomain(leaseRow)
  if (!leaseMatchesEffectRequest(lease, args)) {
    return { kind: 'unavailable' as const, reason: 'lease_inactive' }
  }
  const connectionRow = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', leaseRow.connectionRef))
    .unique()
  if (connectionRow === null) return { kind: 'unavailable' as const, reason: 'connection_not_found' }
  const connection = toDomain(connectionRow)
  if (!providerLeaseIsCurrent(lease, connection)) {
    return { kind: 'unavailable' as const, reason: 'lease_inactive' }
  }
  if (connection.secretRef === undefined) {
    return { kind: 'unavailable' as const, reason: 'credential_unavailable' }
  }
  const invocation = await ctx.db.query('capabilityCalls')
    .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef))
    .unique()
  const now = Date.now()
  if (!await invocationAuthorityMatchesLease(ctx, invocation, lease, connection, args.toolRef, now)) return {
    kind: 'unavailable' as const, reason: 'invocation_authority_mismatch',
  }
  return {
    kind: 'admitted' as const,
    effectRef: `effect:${canonicalDigest({
      kind: 'provider-lease-effect:v1',
      leaseRef: lease.leaseRef,
      connectionRef: lease.connectionRef,
      authorityGeneration: lease.authorityGeneration,
    })}`,
    leaseRef: lease.leaseRef,
    connectionRef: lease.connectionRef,
    authorityGeneration: lease.authorityGeneration,
    owningAccountRef: lease.owningAccountRef,
    activeAccountRef: lease.activeAccountRef,
    actorPrincipalRef: lease.actorPrincipalRef,
    grantRef: lease.grantRef,
    grantGeneration: lease.grantGeneration,
    secretRef: connection.secretRef,
  }
}


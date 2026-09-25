import {
  projectProviderConnectionOwner,
  providerConnectionAuthorityProvenanceIsValid,
  reauthorizeProviderConnection,
  type ProviderConnection,
  type ProviderConnectionCommandResult,
} from '../../../../src/modules/capability-supply/provider-connection'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import type { Id } from '../../../_generated/dataModel'
import {
  invalidateActiveLeases,
  resolveProviderConnectionProvenance,
  toDomain,
  toRow,
} from '../providerConnections/lifecycle'
import { ensureOwnerProviderConnectionGrant, type CanonicalActor } from '../providerConnections/authority'
import { resolveBusinessActor } from '../../../authz'
import { accountRef, principalRef } from '../../../../src/modules/principal-account/public'
import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import { type ProviderConnectionActor, type ReauthorizeOwnerArgs } from './contracts'

function providerGrantResources(connection: ProviderConnection): readonly string[] {
  if (connection.adapterId === 'x402-fetch:v2') {
    return [
      'connection-provider:x402',
      `connection-provider:x402:${connection.grantedResources[0] ?? connection.providerAccountRef.replace(/^x402:/u, '')}`,
    ]
  }
  const providerNamespace = `capability-provider/${connection.adapterId}`
  return [
    `connection-provider:${providerNamespace}`,
    `connection-provider:${providerNamespace}:${connection.providerAccountRef}`,
    ...(connection.credentialRef === null ? [] : [`secret:${connection.credentialRef}`]),
  ]
}

export async function exactGrantRefForConnection(
  ctx: MutationCtx,
  actor: ProviderConnectionActor,
  canonicalActor: CanonicalActor,
  connection: ProviderConnection,
  repeatCommand: boolean,
): Promise<string> {
  if (actor.authorityGrantRef !== undefined) return actor.authorityGrantRef
  if (repeatCommand) return connection.authorityGrantRef
  return (await ensureOwnerProviderConnectionGrant(ctx, canonicalActor, {
    connectionRef: connection.connectionRef,
    providerResourceRefs: providerGrantResources(connection),
  })).grantRef
}

export function projectOwnerProjection(connection: ProviderConnection, now: number) {
  const projection = projectProviderConnectionOwner(connection, now)
  return {
    ...projection,
    grantedScopes: [...projection.grantedScopes],
    grantedResources: [...projection.grantedResources],
    evidenceRefs: [...projection.evidenceRefs],
  }
}

export function projectOwnerResult(result: ProviderConnectionCommandResult, now: number) {
  if (result.kind === 'refused') return result
  const connection = projectOwnerProjection(result.connection, now)
  return result.kind === 'applied'
    ? { kind: 'applied' as const, connection, commandDigest: result.commandDigest }
    : { kind: 'duplicate' as const, connection, commandDigest: result.commandDigest }
}
export async function readProviderConnectionForActor(
  ctx: Pick<QueryCtx, 'db'>,
  connectionRef: string,
  actor: ProviderConnectionActor,
  requireUsable = true,
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', connectionRef)).unique()
  if (row === null) return null
  const business = await ctx.db.get(row.businessId)
  if (business === null
    || business.owningAccountRef !== actor.canonicalAccountRef
    || row.owningAccountRef !== actor.canonicalAccountRef) return null
  const connection = toDomain(row)
  if (!providerConnectionAuthorityProvenanceIsValid(connection)
    || (requireUsable && connection.lifecycle !== 'active')) return null
  return { row, connection, actor }
}

export async function readProviderBusinessForActor(
  ctx: Pick<QueryCtx, 'db'>,
  businessId: Id<'businesses'>,
  actor: ProviderConnectionActor,
) {
  const business = await ctx.db.get(businessId)
  return business !== null && business.owningAccountRef === actor.canonicalAccountRef
    ? { business, actor }
    : null
}

export async function reauthorizeProviderConnectionForActor(
  ctx: MutationCtx,
  args: ReauthorizeOwnerArgs,
  actor: ProviderConnectionActor,
  now: number,
) {
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor, false)
  if (owned === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const { row } = owned
  if (await providerRouteabilityIsFrozen(ctx, row.businessId)) {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const current = toDomain(row)
  const canonicalActor = {
    principalRef: principalRef(actor.canonicalPrincipalRef),
    accountRef: accountRef(actor.canonicalAccountRef),
  }
  const expectedGrantRef = await exactGrantRefForConnection(
    ctx, actor, canonicalActor, current, row.lastCommandId === args.commandId,
  )
  const provenance = await resolveProviderConnectionProvenance(
    ctx,
    canonicalActor,
    'refresh',
    [`connection:${current.connectionRef}`],
    current.credentialRef,
    expectedGrantRef,
  )
  if (provenance === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const result = reauthorizeProviderConnection(current, {
    ...current,
    ...args,
    ...provenance,
    businessId: String(current.businessId),
    credentialRef: current.credentialRef,
    requestedScopes: current.grantedScopes,
    grantedScopes: current.grantedScopes,
    requestedResources: current.grantedResources,
    grantedResources: current.grantedResources,
    ...(current.expiresAt === undefined ? {} : { expiresAt: current.expiresAt }),
    ...(args.reasonCode === undefined ? {} : { reasonCode: args.reasonCode }),
    evidenceRefs: args.evidenceRefs,
  }, now)
  if (result.kind === 'applied') {
    await ctx.db.replace(row._id, toRow(result.connection, args.commandId, result.commandDigest))
    await invalidateActiveLeases(ctx, args.connectionRef, 'generation_changed', now, args.commandId)
  }
  return result
}

export async function readOwnerHandler(ctx: QueryCtx, args: { connectionRef: string }) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return null
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor)
  return owned === null ? null : projectOwnerProjection(toDomain(owned.row), owned.row.updatedAt)
}

export async function listProviderConnectionsForActor(
  ctx: Pick<QueryCtx, 'db'>,
  args: Readonly<{
    businessId: Id<'businesses'>
    lifecycle?: ProviderConnection['lifecycle']
    limit: number
  }>,
  actor: ProviderConnectionActor,
) {
  const ownedBusiness = await readProviderBusinessForActor(ctx, args.businessId, actor)
  if (ownedBusiness === null) return null
  const states: readonly ProviderConnection['lifecycle'][] = args.lifecycle === undefined
    ? ['active', 'reauthorization_required', 'revocation_pending', 'cleanup_required', 'revoked']
    : [args.lifecycle]
  const rows = (await Promise.all(states.map(async (state) => (
    await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_businessId_and_lifecycle', (index) => index.eq('businessId', args.businessId).eq('lifecycle', state))
      .take(args.limit)
  )))).flat()
    .filter((row) => row.owningAccountRef === actor.canonicalAccountRef)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, args.limit)
  return rows.flatMap((row) => {
    const connection = toDomain(row)
    return providerConnectionAuthorityProvenanceIsValid(connection)
      ? [projectOwnerProjection(connection, row.updatedAt)]
      : []
  })
}

export async function listOwnerHandler(ctx: QueryCtx) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return []
  const businesses = await ctx.db.query('businesses')
    .withIndex('by_owningAccountRef_and_updatedAt', (index) => index.eq('owningAccountRef', actor.canonicalAccountRef))
    .take(50)
  const rows = (await Promise.all(businesses.map((business) => (
    Promise.all([
      ...['active', 'reauthorization_required', 'revocation_pending', 'revoked', 'cleanup_required'].map((state) => (
        ctx.db.query('capabilityProviderConnections')
          .withIndex('by_businessId_and_lifecycle', (index) => index.eq('businessId', business._id).eq('lifecycle', state as never))
          .take(100)
      )),
    ])
  )))).flat(2)
  return rows.flatMap((row) => {
    const connection = toDomain(row)
    return row.owningAccountRef === actor.canonicalAccountRef
      && providerConnectionAuthorityProvenanceIsValid(connection)
      ? [projectOwnerProjection(connection, row.updatedAt)]
      : []
  })
}


export async function reauthorizeOwnerHandler(ctx: MutationCtx, args: ReauthorizeOwnerArgs) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor, false)
  if (owned !== null && owned.connection.adapterId === 'x402-fetch:v2') {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const now = Date.now()
  return projectOwnerResult(await reauthorizeProviderConnectionForActor(ctx, args, actor, now), now)
}

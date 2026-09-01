import type { WorkId } from '@convex-dev/workpool'
import { v } from 'convex/values'
import {
  beginProviderConnectionRevocation,
  createConnectionHealthAuditEvent,
  createConnectionLifecycleAuditEvent,
  createX402ProviderConnection,
  projectProviderConnectionOwner,
  providerConnectionAuthorityProvenanceIsValid,
  providerConnectionCleanupCommandId,
  providerConnectionCleanupRequestDigest,
  providerConnectionRevocationRef,
  reauthorizeProviderConnection,
  withProviderConnectionAuthority,
  type ProviderConnection,
  type ProviderConnectionCommandResult,
} from '../../../src/modules/capability-supply/provider-connection'
import {
  ConsequenceAuthorityBoundary,
  type AuthorityConsequenceAdmission,
} from '../../../src/modules/authority/context/public'
import {
  canonicalEvmAddress,
  validPublicHttpsEndpoint,
} from '../../../src/modules/capability-supply/convex'
import { canonicalDigest, isCanonicalDigest } from '../../../src/modules/common/canonical-digest'
import type { MutationCtx, QueryCtx } from '../../_generated/server'
import type { Doc, Id } from '../../_generated/dataModel'
import { marketDispatchWorkpool } from '../../marketDispatchWorkpool'
import {
  enqueueCleanupWork,
  invalidateActiveLeases,
  resolveProviderConnectionProvenance,
  toDomain,
  toRow,
} from './lifecycle'
import {
  ensureOwnerProviderConnectionGrant,
  type CanonicalActor,
} from './authority'
import { lifecycle } from './contracts'
import { resolveBusinessActor } from '../../authz'
import { accountRef, ownershipRef, principalRef } from '../../../src/modules/principal-account/public'
import {
  validX402SellerClaimTime,
  x402SellerClaimDigest,
} from '../../../src/modules/capability-supply/public'
import { requireSourceWrite, sourceWriteArgs } from '../../sourceWriteAdmission'
import { persistAuditEvent } from '../../securityShared'
import { assertAuthorityCredentialChangeAdmission } from '../rateLimit'
import {
  consumeConsequenceProof,
  deriveStrictConsequenceProof,
  isValidClerkFactorEvidence,
} from '../consequenceProof'

export const ownerProjection = v.object({
  connectionRef: v.string(),
  businessId: v.string(),
  providerRef: v.string(),
  providerAccountRef: v.string(),
  adapterId: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  authorityGeneration: v.number(),
  authorityDigest: v.string(),
  lifecycle,
  available: v.boolean(),
  credentialConfigured: v.boolean(),
  x402Method: v.optional(v.union(v.literal('GET'), v.literal('POST'))),
  x402Payee: v.optional(v.string()),
  healthStatus: v.optional(v.union(v.literal('healthy'), v.literal('unhealthy'))),
  healthCheckedAt: v.optional(v.number()),
  healthSubject: v.optional(v.string()),
  healthReasonCode: v.optional(v.string()),
  observedAt: v.number(),
  expiresAt: v.optional(v.number()),
  revokedAt: v.optional(v.number()),
  reasonCode: v.union(v.string(), v.null()),
  evidenceRefs: v.array(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
export const ownerCommandResult = v.union(
  v.object({ kind: v.literal('applied'), connection: ownerProjection, commandDigest: v.string() }),
  v.object({ kind: v.literal('duplicate'), connection: ownerProjection, commandDigest: v.string() }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('invalid_identity'), v.literal('invalid_time'), v.literal('invalid_scope'),
      v.literal('invalid_resource'), v.literal('invalid_generation'), v.literal('invalid_digest'),
      v.literal('invalid_transition'), v.literal('command_identity_conflict'),
      v.literal('reauthentication_required'), v.literal('proof_stale'),
      v.literal('proof_replayed'), v.literal('command_changed'), v.literal('rate_limited'),
    ),
  }),
)

export const readOwnerArgs = {
  connectionRef: v.string(),
} as const
export const listOwnerArgs = {} as const
export const revokeOwnerArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
} as const
export const retryOwnerCleanupArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
} as const
export const reauthorizeOwnerArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  reasonCode: v.optional(v.string()),
  evidenceRefs: v.array(v.string()),
} as const
export const connectX402OwnerArgs = {
  businessId: v.id('businesses'),
  resourceUrl: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  observationDigest: v.string(),
  payTo: v.string(),
  claimExpiresAt: v.number(),
  claimDigest: v.string(),
  claimSignature: v.string(),
  proof: v.optional(v.object({
    reverificationId: v.string(),
    firstFactorAgeMinutes: v.number(),
    secondFactorAgeMinutes: v.number(),
  })),
  evidenceRefs: v.array(v.string()),
  ...sourceWriteArgs,
} as const
export const checkX402OwnerArgs = {
  connectionRef: v.string(),
  commandId: v.string(),
  operationKey: v.string(),
  correlationId: v.string(),
  expectedAuthorityGeneration: v.number(),
  expectedAuthorityDigest: v.string(),
  method: v.union(v.literal('GET'), v.literal('POST')),
  resourceUrl: v.string(),
  payee: v.string(),
  status: v.union(v.literal('healthy'), v.literal('unhealthy')),
  checkedAt: v.number(),
  observationDigest: v.string(),
  reasonCode: v.optional(v.string()),
  ...sourceWriteArgs,
} as const
type ReauthorizeOwnerArgs = {
  connectionRef: string
  commandId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  reasonCode?: string
  evidenceRefs: string[]
}

type RevokeOwnerArgs = ReauthorizeOwnerArgs

type RetryOwnerCleanupArgs = {
  connectionRef: string
  commandId: string
}

type ConnectX402OwnerArgs = {
  businessId: Id<'businesses'>
  resourceUrl: string
  commandId: string
  operationKey: string
  correlationId: string
  method: 'GET' | 'POST'
  observationDigest: string
  payTo: string
  claimExpiresAt: number
  claimDigest: string
  claimSignature: string
  proof?: {
    reverificationId: string
    firstFactorAgeMinutes: number
    secondFactorAgeMinutes: number
  }
  evidenceRefs: string[]
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

type CheckX402OwnerArgs = {
  connectionRef: string
  commandId: string
  operationKey: string
  correlationId: string
  expectedAuthorityGeneration: number
  expectedAuthorityDigest: string
  method: 'GET' | 'POST'
  resourceUrl: string
  payee: string
  status: 'healthy' | 'unhealthy'
  checkedAt: number
  observationDigest: string
  reasonCode?: string
  sourceWrite?: unknown
  sourceWriteRequest?: unknown
}

type VerifiedConnectionSellerClaim = Readonly<{
  businessId: string
  endpointUrl: string
  method: 'GET' | 'POST'
  observationDigest: string
  payTo: `0x${string}`
  expiresAt: number
}>

async function verifiedConnectionSellerClaim(
  args: ConnectX402OwnerArgs,
  canonicalResourceUrl: string,
  now: number,
): Promise<
  | Readonly<{ kind: 'verified'; claim: VerifiedConnectionSellerClaim }>
  | Readonly<{ kind: 'refused'; code: 'invalid_identity' | 'invalid_time' | 'invalid_digest' | 'invalid_resource' }>
> {
  const payTo = canonicalEvmAddress(args.payTo)
  if (payTo === undefined || !isCanonicalDigest(args.observationDigest)) {
    return { kind: 'refused', code: 'invalid_identity' }
  }
  if (!validX402SellerClaimTime(args.claimExpiresAt, now)) {
    return { kind: 'refused', code: 'invalid_time' }
  }
  const claim = {
    businessId: String(args.businessId),
    endpointUrl: canonicalResourceUrl,
    method: args.method,
    observationDigest: args.observationDigest,
    payTo,
    expiresAt: args.claimExpiresAt,
  } as const
  if (args.claimDigest !== x402SellerClaimDigest(claim)) {
    return { kind: 'refused', code: 'invalid_identity' }
  }
  return /^0x[0-9a-fA-F]{130}$/u.test(args.claimSignature)
    ? { kind: 'verified', claim }
    : { kind: 'refused', code: 'invalid_digest' }
}

export type ProviderConnectionActor = Readonly<{
  canonicalPrincipalRef: string
  canonicalAccountRef: string
  authorityGrantRef?: string
}>

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

async function exactGrantRefForConnection(
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

function cleanupOwnerCommandDigest(connectionRef: string, commandId: string): string {
  return canonicalDigest({ kind: 'provider_cleanup_owner_retry:v1', connectionRef, commandId })
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

export async function revokeOwnerHandler(ctx: MutationCtx, args: RevokeOwnerArgs) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  return await revokeProviderConnectionForActor(ctx, args, actor)
}

export async function revokeProviderConnectionForActor(
  ctx: MutationCtx,
  args: RevokeOwnerArgs,
  actor: ProviderConnectionActor,
) {
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor)
  const now = Date.now()
  const result = beginProviderConnectionRevocation(owned === null ? undefined : toDomain(owned.row), args, now)
  if (result.kind === 'applied' && owned !== null) {
    const { row } = owned
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
      'revoke',
      [`connection:${result.connection.connectionRef}`],
      result.connection.credentialRef,
      expectedGrantRef,
    )
    if (provenance === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
    const rebound = withProviderConnectionAuthority(result.connection, provenance)
    const revoked = {
      ...rebound,
      revocationRef: providerConnectionRevocationRef({
        connectionRef: rebound.connectionRef,
        expectedAuthorityGeneration: rebound.authorityGeneration,
        expectedAuthorityDigest: rebound.authorityDigest,
        adapterId: rebound.adapterId,
      }),
    }
    await ctx.db.replace(row._id, toRow(revoked, args.commandId, result.commandDigest))
    const hasMore = await invalidateActiveLeases(ctx, args.connectionRef, 'revocation_started', now, args.commandId)
    const cleanupAttempt = Math.max(1, revoked.cleanupAttempt ?? 0)
    const revocationRef = revoked.revocationRef
    const cleanupCommandId = providerConnectionCleanupCommandId(revocationRef, cleanupAttempt)
    const requestDigest = providerConnectionCleanupRequestDigest({
      revocationRef,
      cleanupAttempt,
      connectionRef: args.connectionRef,
      expectedAuthorityGeneration: revoked.authorityGeneration,
      expectedAuthorityDigest: revoked.authorityDigest,
      adapterId: revoked.adapterId,
    })
    const scheduled = await enqueueCleanupWork(ctx, row._id, {
      ...revoked,
      revocationRef,
    }, {
      connectionRef: args.connectionRef,
      commandId: cleanupCommandId,
      expectedAuthorityGeneration: revoked.authorityGeneration,
      expectedAuthorityDigest: revoked.authorityDigest,
      requestDigest,
      cleanupAttempt,
      workKind: hasMore ? 'lease_drain' : 'cleanup',
    }, now)
    await persistAuditEvent(ctx.db, createConnectionLifecycleAuditEvent({
      eventType: 'connection.revoked',
      actorPrincipalRef: actor.canonicalPrincipalRef,
      activeAccountRef: actor.canonicalAccountRef,
      connectionRef: revoked.connectionRef,
      authorityGeneration: revoked.authorityGeneration,
      commandId: args.commandId,
      correlationRef: args.commandId,
      commandDigest: result.commandDigest,
      adapterId: revoked.adapterId,
      beforeState: current.lifecycle,
      outcome: 'revocation_started',
      ...(revoked.x402Method === undefined ? {} : { method: revoked.x402Method }),
      ...(revoked.grantedResources[0] === undefined ? {} : { resourceUrl: revoked.grantedResources[0] }),
      ...(revoked.x402Payee === undefined ? {} : { payee: revoked.x402Payee }),
      ...(args.reasonCode === undefined ? {} : { reasonCode: args.reasonCode }),
      occurredAt: now,
    }))
    return projectOwnerResult({ kind: 'applied', connection: scheduled, commandDigest: result.commandDigest }, now)
  }
  return projectOwnerResult(result, now)
}

async function cleanupWorkIsActive(ctx: MutationCtx, workId: string): Promise<boolean> {
  try {
    const status = await marketDispatchWorkpool.status(ctx, workId as WorkId)
    return ['pending', 'running'].includes(status.state)
  } catch {
    // A missing work item is repairable after the persisted callback grace.
    return false
  }
}

function retryCleanupIsInvalid(
  row: Readonly<{
    lifecycle: string
    cleanupCallbackGraceUntil?: number
  }>,
  commandId: string,
  now: number,
): boolean {
  return [
    commandId.trim().length === 0,
    commandId.length > 256,
    row.lifecycle === 'revoked',
    !['revocation_pending', 'cleanup_required'].includes(row.lifecycle),
    row.cleanupCallbackGraceUntil === undefined,
    row.cleanupCallbackGraceUntil !== undefined && now < row.cleanupCallbackGraceUntil,
  ].some(Boolean)
}

export async function retryOwnerCleanupHandler(ctx: MutationCtx, args: RetryOwnerCleanupArgs) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  return await retryProviderConnectionCleanupForActor(ctx, args, actor)
}

export async function retryProviderConnectionCleanupForActor(
  ctx: MutationCtx,
  args: RetryOwnerCleanupArgs,
  actor: ProviderConnectionActor,
) {
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor, false)
  const now = Date.now()
  if (owned === null) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const { row } = owned
  if ([args.commandId.trim().length === 0, args.commandId.length > 256].some(Boolean))
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  if (retryCleanupIsInvalid(row, args.commandId, now))
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  if (row.cleanupWorkId !== undefined && await cleanupWorkIsActive(
    ctx, row.cleanupWorkId,
  )) return {
    kind: 'duplicate' as const,
    connection: projectOwnerProjection(toDomain(row), now),
    commandDigest: cleanupOwnerCommandDigest(args.connectionRef, args.commandId),
  }
  const current = toDomain(row)
  const cleanupAttempt = (current.cleanupAttempt ?? 0) + 1
  if (!Number.isSafeInteger(cleanupAttempt)) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const revocationRef = current.revocationRef ?? providerConnectionRevocationRef({
    connectionRef: current.connectionRef,
    expectedAuthorityGeneration: current.authorityGeneration,
    expectedAuthorityDigest: current.authorityDigest,
    adapterId: current.adapterId,
  })
  const cleanupCommandId = providerConnectionCleanupCommandId(revocationRef, cleanupAttempt)
  const requestDigest = providerConnectionCleanupRequestDigest({
    revocationRef,
    cleanupAttempt,
    connectionRef: current.connectionRef,
    expectedAuthorityGeneration: current.authorityGeneration,
    expectedAuthorityDigest: current.authorityDigest,
    adapterId: current.adapterId,
  })
  const hasMore = await invalidateActiveLeases(
    ctx,
    current.connectionRef,
    'revocation_started',
    now,
    `${cleanupCommandId}:retry`,
  )
  const ownerDigest = cleanupOwnerCommandDigest(args.connectionRef, args.commandId)
  const prepared = {
    ...current,
    revocationRef,
    cleanupAttempt,
    cleanupCommandId,
    cleanupRequestDigest: requestDigest,
    lastCommandId: args.commandId,
    lastCommandDigest: ownerDigest,
    updatedAt: now,
  }
  await ctx.db.replace(row._id, toRow(prepared, args.commandId, ownerDigest))
  const scheduled = await enqueueCleanupWork(ctx, row._id, prepared, {
    connectionRef: current.connectionRef,
    commandId: cleanupCommandId,
    expectedAuthorityGeneration: current.authorityGeneration,
    expectedAuthorityDigest: current.authorityDigest,
    requestDigest,
    cleanupAttempt,
    workKind: hasMore ? 'lease_drain' : 'cleanup',
  }, now)
  return projectOwnerResult({ kind: 'applied', connection: scheduled, commandDigest: ownerDigest }, now)
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

export async function connectX402OwnerHandler(ctx: MutationCtx, args: ConnectX402OwnerArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  return await connectX402ProviderConnectionForActor(ctx, args, actor, true)
}

export async function checkX402OwnerHandler(ctx: MutationCtx, args: CheckX402OwnerArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const owned = await readProviderConnectionForActor(ctx, args.connectionRef, actor, false)
  if (owned === null) return { kind: 'refused' as const, code: 'invalid_transition' as const }
  const current = toDomain(owned.row)
  const now = Date.now()
  const resource = validPublicHttpsEndpoint(args.resourceUrl)
  const checkedAtIsCurrent = Number.isSafeInteger(args.checkedAt)
    && args.checkedAt >= 0
    && args.checkedAt <= now
    && now - args.checkedAt <= 2 * 60_000
  if (current.adapterId !== 'x402-fetch:v2'
    || current.x402Method === undefined
    || current.x402Payee === undefined
    || current.x402Method !== args.method
    || current.x402Payee !== args.payee
    || resource === undefined
    || resource.hash !== ''
    || current.grantedResources.length !== 1
    || current.grantedResources[0] !== resource.toString()
    || !checkedAtIsCurrent
    || !isCanonicalDigest(args.observationDigest)
    || args.expectedAuthorityGeneration !== current.authorityGeneration
    || args.expectedAuthorityDigest !== current.authorityDigest
    || (args.status === 'healthy' && args.reasonCode !== undefined)
    || (args.status === 'unhealthy' && (args.reasonCode === undefined || args.reasonCode.trim().length === 0))) {
    return { kind: 'refused' as const, code: 'invalid_digest' as const }
  }
  const audit = createConnectionHealthAuditEvent({
    actorPrincipalRef: actor.canonicalPrincipalRef,
    activeAccountRef: actor.canonicalAccountRef,
    connectionRef: current.connectionRef,
    authorityGeneration: current.authorityGeneration,
    commandId: args.commandId,
    correlationRef: args.correlationId,
    method: current.x402Method,
    resourceUrl: resource.toString(),
    payee: current.x402Payee,
    status: args.status,
    observationDigest: args.observationDigest,
    ...(args.reasonCode === undefined ? {} : { reasonCode: args.reasonCode }),
    observedAt: args.checkedAt,
  })
  const existing = await ctx.db.query('auditEvents')
    .withIndex('by_eventId', (index) => index.eq('eventId', audit.eventId))
    .unique()
  if (existing !== null) {
    return existing.activeAccountRef === actor.canonicalAccountRef
      && existing.targetRef === current.connectionRef
      && existing.payloadHash === audit.payloadHash
      ? {
          kind: 'duplicate' as const,
          connection: projectOwnerProjection(current, now),
          commandDigest: audit.payloadHash,
        }
      : { kind: 'refused' as const, code: 'command_identity_conflict' as const }
  }
  await ctx.db.patch(owned.row._id, {
    healthStatus: args.status,
    healthCheckedAt: args.checkedAt,
    healthSubject: current.x402Payee,
    healthObservationDigest: args.observationDigest,
    ...(args.reasonCode === undefined
      ? { healthReasonCode: undefined }
      : { healthReasonCode: args.reasonCode }),
  })
  await persistAuditEvent(ctx.db, audit)
  const updated = await ctx.db.get(owned.row._id)
  if (updated === null) throw new Error('provider_connection_health_write_lost')
  return {
    kind: 'applied' as const,
    connection: projectOwnerProjection(toDomain(updated), now),
    commandDigest: audit.payloadHash,
  }
}

async function prepareX402ConnectionClaim(
  ctx: MutationCtx,
  args: ConnectX402OwnerArgs,
  actor: ProviderConnectionActor,
) {
  const ownedBusiness = await readProviderBusinessForActor(ctx, args.businessId, actor)
  const resourceUrl = validPublicHttpsEndpoint(args.resourceUrl)
  const now = Date.now()
  if (ownedBusiness === null || resourceUrl === undefined || resourceUrl.hash !== '') {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  const canonicalResourceUrl = resourceUrl.toString()
  const verification = await verifiedConnectionSellerClaim(args, canonicalResourceUrl, now)
  return verification.kind === 'refused'
    ? verification
    : {
        kind: 'prepared' as const,
        ownedBusiness,
        resourceUrl,
        canonicalResourceUrl,
        claim: verification.claim,
        now,
      }
}

async function resolveX402ConnectionAuthority(
  ctx: MutationCtx,
  actor: CanonicalActor,
  input: Readonly<{
    connectionRef: string
    canonicalResourceUrl: string
    existing: Doc<'capabilityProviderConnections'> | null
    provisionOwnerGrant: boolean
    commandId: string
    delegatedGrantRef?: string
  }>,
) {
  const installResources = [
    'connection-provider:x402',
    `connection-provider:x402:${input.canonicalResourceUrl}`,
  ]
  const expectedGrantRef = input.existing !== null
    && input.existing.lastCommandId === input.commandId
    ? input.existing.authorityGrantRef
    : input.provisionOwnerGrant
      ? (await ensureOwnerProviderConnectionGrant(ctx, actor, {
          connectionRef: input.connectionRef,
          providerResourceRefs: installResources,
        })).grantRef
      : input.delegatedGrantRef
  if (expectedGrantRef === undefined) return null
  return await resolveProviderConnectionProvenance(
    ctx,
    actor,
    input.existing === null ? 'install' : 'refresh',
    input.existing === null ? installResources : [`connection:${input.connectionRef}`],
    null,
    expectedGrantRef,
  )
}

async function persistX402ConnectionResult(
  ctx: MutationCtx,
  existing: Doc<'capabilityProviderConnections'> | null,
  commandId: string,
  result: ProviderConnectionCommandResult,
) {
  if (result.kind !== 'applied') return
  const row = toRow(result.connection, commandId, result.commandDigest)
  if (existing === null) await ctx.db.insert('capabilityProviderConnections', row)
  else await ctx.db.replace(existing._id, row)
}

export async function connectX402ProviderConnectionForActor(
  ctx: MutationCtx,
  args: ConnectX402OwnerArgs,
  actor: ProviderConnectionActor,
  provisionOwnerGrant = false,
) {
  // Connections are private supplier infrastructure. Publication happens only
  // after the Operation is admitted, so first-party onboarding must work while
  // the supplier business is still unpublished.
  const prepared = await prepareX402ConnectionClaim(ctx, args, actor)
  if (prepared.kind === 'refused') return prepared
  const { ownedBusiness, resourceUrl, canonicalResourceUrl, claim, now } = prepared
  const connectionRef = `connection:x402:${canonicalDigest({ businessId: String(args.businessId), resourceUrl: canonicalResourceUrl })}`
  const providerRef = `provider:x402:${resourceUrl.host}`
  const providerAccountRef = `x402:${canonicalResourceUrl}`
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (index) => index.eq('connectionRef', connectionRef)).unique()
  if (existing !== null && String(existing.businessId) !== String(args.businessId)) {
    return { kind: 'refused' as const, code: 'invalid_identity' as const }
  }
  let proofReplay = false
  if (provisionOwnerGrant) {
    const proofInput = args.proof
    if (proofInput === undefined || !isValidClerkFactorEvidence(proofInput)) {
      return { kind: 'refused' as const, code: 'reauthentication_required' as const }
    }
    const existingProof = await ctx.db.query('consequenceProofUses')
      .withIndex('by_reverificationId', (query) => query.eq('reverificationId', proofInput.reverificationId))
      .unique()
    if (existingProof !== null && existing?.lastCommandId === args.commandId) {
      if (existingProof.actorPrincipalRef !== actor.canonicalPrincipalRef
        || existingProof.activeAccountRef !== actor.canonicalAccountRef) {
        return { kind: 'refused' as const, code: 'proof_replayed' as const }
      }
      proofReplay = true
    } else {
      const admission = await x402ConnectionConsequenceAdmission({
        ctx,
        actor: actor as Parameters<typeof x402ConnectionConsequenceAdmission>[0]['actor'],
        connectionRef,
        canonicalResourceUrl,
        method: claim.method,
        payee: claim.payTo,
        observationDigest: claim.observationDigest,
        claimDigest: args.claimDigest,
        commandId: args.commandId,
        existing,
        now,
      })
      if (admission === null
        || admission.descriptor === undefined
        || admission.proofPolicy?.kind !== 'clerk_reverification'
        || admission.proofPolicy.preset !== 'strict'
        || admission.proofPolicy.uniquePerCommand !== true) {
        return { kind: 'refused' as const, code: 'invalid_transition' as const }
      }
      if (existingProof !== null) {
        if (existingProof.actorPrincipalRef !== admission.actorPrincipalRef
          || existingProof.activeAccountRef !== admission.activeAccountRef) {
          return { kind: 'refused' as const, code: 'proof_replayed' as const }
        }
        return { kind: 'refused' as const, code: existingProof.commandDigest === admission.descriptor.commandDigest
          ? 'proof_replayed' as const
          : 'command_changed' as const }
      }
      const proof = deriveStrictConsequenceProof({ ...proofInput, now })
      if (proof.kind === 'refused') return proof
      const rate = await assertAuthorityCredentialChangeAdmission(ctx, admission.activeAccountRef)
      if (!rate.ok) return { kind: 'refused' as const, code: 'rate_limited' as const }
      const consumed = await consumeConsequenceProof(ctx, {
        reverificationId: proofInput.reverificationId,
        actorPrincipalRef: admission.actorPrincipalRef,
        activeAccountRef: admission.activeAccountRef,
        commandDigest: admission.descriptor.commandDigest,
        proof: proof.proof,
        correlationRef: admission.correlationRef,
        idempotencyRef: admission.idempotencyRef,
      })
      if (consumed.kind === 'refused') return consumed
    }
  }
  const canonicalActor = {
    principalRef: principalRef(ownedBusiness.actor.canonicalPrincipalRef),
    accountRef: accountRef(ownedBusiness.actor.canonicalAccountRef),
  }
  const provenance = await resolveX402ConnectionAuthority(ctx, canonicalActor, {
    connectionRef,
    canonicalResourceUrl,
    existing,
    provisionOwnerGrant,
    commandId: args.commandId,
    ...(actor.authorityGrantRef === undefined
      ? {}
      : { delegatedGrantRef: actor.authorityGrantRef }),
  })
  if (provenance === null) {
    if (provisionOwnerGrant) throw new Error('provider_connection_authority_resolution_failed_after_proof')
    return { kind: 'refused' as const, code: 'invalid_transition' as const }
  }
  const connectionCommand = {
    commandId: args.commandId,
    connectionRef,
    businessId: String(args.businessId),
    providerRef,
    providerAccountRef,
    resourceUrl: canonicalResourceUrl,
    method: claim.method,
    payee: claim.payTo,
    evidenceRefs: [
      ...args.evidenceRefs,
      `x402-payee-claim:${x402SellerClaimDigest(claim)}`,
    ],
    ...provenance,
  }
  const result = existing === null
    ? createX402ProviderConnection(connectionCommand, now)
    : existing.lastCommandId === args.commandId
      ? createX402ProviderConnection(connectionCommand, now, toDomain(existing))
      : reauthorizeProviderConnection({
        ...toDomain(existing),
        evidenceRefs: toDomain(existing).evidenceRefs.filter((ref) =>
          !ref.startsWith('x402-endpoint-inspection:')
          && !ref.startsWith('x402-payee-claim:')),
      }, {
        ...connectionCommand,
        adapterId: 'x402-fetch:v2',
        credentialRef: null,
        x402Method: claim.method,
        x402Payee: claim.payTo,
        requestedScopes: [],
        grantedScopes: [],
        requestedResources: [canonicalResourceUrl],
        grantedResources: [canonicalResourceUrl],
        expectedAuthorityGeneration: existing.authorityGeneration,
        expectedAuthorityDigest: existing.authorityDigest,
      }, now)
  if (result.kind === 'refused') {
    if (provisionOwnerGrant && proofReplay) {
      return { kind: 'refused' as const, code: 'command_changed' as const }
    }
    if (provisionOwnerGrant) throw new Error(`provider_connection_state_refused_after_proof:${result.code}`)
    return result
  }
  if (proofReplay && result.kind !== 'duplicate') {
    throw new Error('provider_connection_proof_replay_state_mismatch')
  }
  await persistX402ConnectionResult(ctx, existing, args.commandId, result)
  if (result.kind === 'applied') {
    await persistAuditEvent(ctx.db, createConnectionLifecycleAuditEvent({
      eventType: existing === null ? 'connection.connected' : 'connection.reauthorized',
      actorPrincipalRef: ownedBusiness.actor.canonicalPrincipalRef,
      activeAccountRef: ownedBusiness.actor.canonicalAccountRef,
      connectionRef: result.connection.connectionRef,
      authorityGeneration: result.connection.authorityGeneration,
      commandId: args.commandId,
      correlationRef: args.correlationId,
      commandDigest: result.commandDigest,
      adapterId: result.connection.adapterId,
      beforeState: existing === null ? 'missing' : toDomain(existing).lifecycle,
      outcome: existing === null ? 'connected' : 'reauthorized',
      method: claim.method,
      resourceUrl: canonicalResourceUrl,
      payee: claim.payTo,
      occurredAt: now,
    }))
  }
  return projectOwnerResult(result, now)
}

async function x402ConnectionConsequenceAdmission(input: Readonly<{
  ctx: MutationCtx
  actor: ProviderConnectionActor & Readonly<{
    authorityRevision?: Readonly<{ account: number; currentOwnership: number }>
    authorityProvenance?: Readonly<{
      accessKind: string
      accessRef: string
      currentOwnershipRef: string
    }>
  }>
  connectionRef: string
  canonicalResourceUrl: string
  method: 'GET' | 'POST'
  payee: string
  observationDigest: string
  claimDigest: string
  commandId: string
  existing: Doc<'capabilityProviderConnections'> | null
  now: number
}>): Promise<AuthorityConsequenceAdmission | null> {
  const provenance = input.actor.authorityProvenance
  const revision = input.actor.authorityRevision
  if (provenance?.accessKind !== 'ownership'
    || provenance.accessRef !== provenance.currentOwnershipRef
    || revision === undefined) return null
  const ownership = await input.ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', provenance.currentOwnershipRef as never))
    .unique()
  if (ownership === null
    || ownership.lifecycle !== 'active'
    || ownership.accountRef !== input.actor.canonicalAccountRef
    || ownership.ownerPrincipalRef !== input.actor.canonicalPrincipalRef
    || ownership.revision !== revision.currentOwnership) return null
  const action = input.existing === null ? 'connection.connect' as const : 'connection.reauthorize' as const
  const boundary = new ConsequenceAuthorityBoundary({
    admitConsequence: async () => {
      throw new Error('provider_connection_owner_delegation_unreachable')
    },
  })
  return await boundary.forSurface('convex', {
    resolveCanonicalBinding: async () => ({
      principalClass: 'interactive',
      actorPrincipalRef: principalRef(input.actor.canonicalPrincipalRef),
      activeAccountRef: accountRef(input.actor.canonicalAccountRef),
      authoritySource: {
        kind: 'account_ownership',
        ownershipRef: ownershipRef(ownership.ownershipRef),
        ownershipRevision: ownership.revision,
        accountRevision: revision.account,
        admittedAt: input.now,
        expiresAt: input.now + 1,
      },
    }),
  }).withCurrentAuthority({
    requiredScopes: [input.existing === null ? 'connection:install' : 'connection:refresh'],
    resourceRefs: [`connection:${input.connectionRef}`, `connection-provider:x402:${input.canonicalResourceUrl}`],
    budgetAmount: 0,
    correlationRef: input.commandId,
    idempotencyRef: input.commandId,
    consequence: {
      action,
      target: {
        targetType: 'provider_connection',
        targetRef: input.connectionRef,
        targetRevision: input.existing?.authorityGeneration ?? 1,
      },
      consequenceSummary: input.existing === null
        ? 'Connect this exact x402 resource and payee authority.'
        : 'Reauthorize this exact x402 resource and payee authority.',
      statusReadbackRef: `provider-connections/${input.connectionRef}`,
      command: {
        version: 'ae.x402-connection-authority:v1',
        action,
        commandId: input.commandId,
        connectionRef: input.connectionRef,
        expectedAuthorityGeneration: input.existing?.authorityGeneration ?? 0,
        expectedAuthorityDigest: input.existing?.authorityDigest ?? null,
        method: input.method,
        resourceUrl: input.canonicalResourceUrl,
        payee: input.payee,
        observationDigest: input.observationDigest,
        claimDigest: input.claimDigest,
      },
    },
  }, async (admission) => admission)
}

import {
  createConnectionHealthAuditEvent,
  type ProviderConnection,
} from '../../../../src/modules/capability-supply/provider-connection'
import { validPublicHttpsEndpoint } from '../../../../src/modules/capability-supply/convex'
import { isCanonicalDigest } from '../../../../src/modules/common/canonical-digest'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { toDomain } from '../providerConnections/lifecycle'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import { persistAuditEvent } from '../../security/audit/persistence'
import { type CheckX402OwnerArgs, type ProviderConnectionActor } from './contracts'
import { projectOwnerProjection, readProviderConnectionForActor } from './reads'

function x402HealthAuthorityMatches(
  current: ProviderConnection,
  args: CheckX402OwnerArgs,
  resource: URL,
  now: number,
): boolean {
  const checkedAtIsCurrent = Number.isSafeInteger(args.checkedAt)
    && args.checkedAt >= 0
    && args.checkedAt <= now
    && now - args.checkedAt <= 2 * 60_000
  return ![
    current.adapterId !== 'x402-fetch:v2',
    current.x402Method === undefined,
    current.x402Payee === undefined,
    current.x402Method !== args.method,
    current.x402Payee !== args.payee,
    resource.hash !== '',
    current.grantedResources.length !== 1,
    current.grantedResources[0] !== resource.toString(),
    !checkedAtIsCurrent,
    !isCanonicalDigest(args.observationDigest),
    args.expectedAuthorityGeneration !== current.authorityGeneration,
    args.expectedAuthorityDigest !== current.authorityDigest,
    args.status === 'healthy' && args.reasonCode !== undefined,
    args.status === 'unhealthy' && (args.reasonCode === undefined || args.reasonCode.trim().length === 0),
  ].some(Boolean)
}

function prepareX402HealthObservation(
  current: ProviderConnection,
  args: CheckX402OwnerArgs,
  actor: ProviderConnectionActor,
  now: number,
) {
  const resource = validPublicHttpsEndpoint(args.resourceUrl)
  if (resource === undefined || !x402HealthAuthorityMatches(current, args, resource, now)) {
    return { kind: 'refused' as const, code: 'invalid_digest' as const }
  }
  return {
    kind: 'prepared' as const,
    audit: createConnectionHealthAuditEvent({
      actorPrincipalRef: actor.canonicalPrincipalRef,
      activeAccountRef: actor.canonicalAccountRef,
      connectionRef: current.connectionRef,
      authorityGeneration: current.authorityGeneration,
      commandId: args.commandId,
      correlationRef: args.correlationId,
      method: args.method,
      resourceUrl: resource.toString(),
      payee: args.payee,
      status: args.status,
      observationDigest: args.observationDigest,
      ...(args.reasonCode === undefined ? {} : { reasonCode: args.reasonCode }),
      observedAt: args.checkedAt,
    }),
  }
}

function projectExistingHealthAuditReplay(
  existing: Doc<'auditEvents'>,
  audit: ReturnType<typeof createConnectionHealthAuditEvent>,
  current: ProviderConnection,
  actor: ProviderConnectionActor,
  now: number,
) {
  const matches = existing.activeAccountRef === actor.canonicalAccountRef
    && existing.targetRef === current.connectionRef
    && existing.payloadHash === audit.payloadHash
  return matches
    ? {
        kind: 'duplicate' as const,
        connection: projectOwnerProjection(current, now),
        commandDigest: audit.payloadHash,
      }
    : { kind: 'refused' as const, code: 'command_identity_conflict' as const }
}

async function persistX402HealthObservation(
  ctx: MutationCtx,
  row: Doc<'capabilityProviderConnections'>,
  current: ProviderConnection,
  args: CheckX402OwnerArgs,
  audit: ReturnType<typeof createConnectionHealthAuditEvent>,
  now: number,
) {
  await ctx.db.patch(row._id, {
    healthStatus: args.status,
    healthCheckedAt: args.checkedAt,
    healthSubject: current.x402Payee,
    healthObservationDigest: args.observationDigest,
    ...(args.reasonCode === undefined
      ? { healthReasonCode: undefined }
      : { healthReasonCode: args.reasonCode }),
  })
  await persistAuditEvent(ctx.db, audit)
  const updated = await ctx.db.get(row._id)
  if (updated === null) throw new Error('provider_connection_health_write_lost')
  return {
    kind: 'applied' as const,
    connection: projectOwnerProjection(toDomain(updated), now),
    commandDigest: audit.payloadHash,
  }
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
  const prepared = prepareX402HealthObservation(current, args, actor, now)
  if (prepared.kind === 'refused') return prepared
  const existing = await ctx.db.query('auditEvents')
    .withIndex('by_eventId', (index) => index.eq('eventId', prepared.audit.eventId))
    .unique()
  if (existing !== null) {
    return projectExistingHealthAuditReplay(existing, prepared.audit, current, actor, now)
  }
  return await persistX402HealthObservation(ctx, owned.row, current, args, prepared.audit, now)
}

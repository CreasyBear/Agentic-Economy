import { type Infer } from 'convex/values'

import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import {
  createProviderConnection,
  createConnectionLifecycleAuditEvent,
  reauthorizeProviderConnection,
} from '../../../../src/modules/capability-supply/provider-connection'
import {
  ensureOwnerProviderConnectionGrant,
  resolveProviderConnectionProvenance,
} from '../providerConnections/authority'
import { invalidateActiveLeases, toDomain, toRow } from '../providerConnections/lifecycle'
import { persistAuditEvent } from '../../security/audit/persistence'
import { providerRouteabilityIsFrozen } from '../providerOffboarding/freeze'
import { canonicalDigest } from '../../../../src/modules/common/canonical-digest'
import {
  finalizeOwnerArgs,
  finalizeOwnerArgsValue,
  finalizeOwnerResult,
} from './contracts'
import { providerConnectionSecretRef, serializableOwnerProjection } from './shared'

type FinalizeOwnerArgs = Infer<typeof finalizeOwnerArgsValue>

export { finalizeOwnerArgs, finalizeOwnerResult }

export async function finalizeOwnerHandler(ctx: MutationCtx, args: FinalizeOwnerArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  if (sourceWrite.kind === 'rejected') {
    return { kind: 'refused' as const, code: 'not_found' as const }
  }
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') {
    return { kind: 'refused' as const, code: 'not_found' as const }
  }
  const attempt = await ctx.db.query('capabilityProviderConnectionAttempts')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
    .unique()
  if (attempt === null || attempt.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'refused' as const, code: 'not_found' as const }
  }
  const consumedConnectionRef = attempt.connectionRef
  if (attempt.lifecycle === 'consumed' && consumedConnectionRef !== undefined) {
    const replay = await ctx.db.query('capabilityProviderConnections')
      .withIndex('by_connectionRef', (query) => query.eq('connectionRef', consumedConnectionRef))
      .unique()
    return replay === null
      ? { kind: 'refused' as const, code: 'connection_conflict' as const }
      : {
          kind: 'replayed' as const,
          connection: serializableOwnerProjection(toDomain(replay), Date.now()),
        }
  }
  const now = Date.now()
  if (attempt.lifecycle !== 'pending') {
    return { kind: 'refused' as const, code: 'not_found' as const }
  }
  if (attempt.expiresAt <= now) {
    await ctx.db.patch(attempt._id, { lifecycle: 'expired', updatedAt: now })
    return { kind: 'refused' as const, code: 'attempt_expired' as const }
  }
  if (await providerRouteabilityIsFrozen(ctx, attempt.businessId)) {
    return { kind: 'refused' as const, code: 'connection_conflict' as const }
  }
  const expectedSecretRef = providerConnectionSecretRef(attempt.owningAccountRef, attempt.attemptRef)
  if (args.secretRef !== expectedSecretRef) {
    return { kind: 'refused' as const, code: 'secret_unavailable' as const }
  }
  const pointer = await ctx.db.query('secretPointers')
    .withIndex('by_secretRef', (query) => query.eq('secretRef', args.secretRef))
    .unique()
  if (pointer === null
    || pointer.owningAccountRef !== actor.canonicalAccountRef
    || (attempt.sourceKind === 'mcp_oauth'
      ? pointer.lastAction.operation !== 'rotate'
      : pointer.lastAction.operation !== 'provision')
    || pointer.lastAction.actorPrincipalRef !== actor.canonicalPrincipalRef
    || pointer.lastAction.idempotencyRef !== args.provisionCommandId) {
    return { kind: 'refused' as const, code: 'secret_unavailable' as const }
  }

  const adapterId = attempt.sourceKind === 'mcp_oauth' ? 'mcp-jsonrpc:v1' : 'http-json:v1'
  const connectionRef = `connection:${canonicalDigest({
    format: 'provider-source-connection:v1',
    businessRef: String(attempt.businessId),
    sourceKind: attempt.sourceKind,
    sourceOrigin: attempt.sourceOrigin,
    authentication: attempt.authentication,
  })}`
  const providerRef = `provider:${attempt.sourceKind}:${new URL(attempt.sourceOrigin).host}`
  const providerAccountRef = `${attempt.sourceKind}:${attempt.sourceOrigin}`
  const existing = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connectionRef))
    .unique()
  if (existing !== null && existing.businessId !== attempt.businessId) {
    return { kind: 'refused' as const, code: 'connection_conflict' as const }
  }
  const providerResourceRefs = [
    `connection-provider:capability-provider/${adapterId}`,
    `connection-provider:capability-provider/${adapterId}:${providerAccountRef}`,
    `secret:${args.secretRef}`,
  ]
  const grant = await ensureOwnerProviderConnectionGrant(ctx, {
    principalRef: actor.canonicalPrincipalRef,
    accountRef: actor.canonicalAccountRef,
  }, { connectionRef, providerResourceRefs })
  const provenance = await resolveProviderConnectionProvenance(
    ctx,
    { principalRef: actor.canonicalPrincipalRef, accountRef: actor.canonicalAccountRef },
    existing === null ? 'install' : 'refresh',
    providerResourceRefs,
    args.secretRef,
    grant.grantRef,
  )
  if (provenance === null) {
    return { kind: 'refused' as const, code: 'connection_conflict' as const }
  }
  const authority = {
    commandId: args.commandId,
    connectionRef,
    ...provenance,
    businessId: String(attempt.businessId),
    providerRef,
    providerAccountRef,
    adapterId,
    credentialRef: args.secretRef,
    sourceOrigin: attempt.sourceOrigin,
    sourceEnvironment: attempt.environment,
    sourceAuthentication: attempt.authentication,
    requestedScopes: [] as string[],
    grantedScopes: [] as string[],
    requestedResources: [attempt.sourceUrl],
    grantedResources: [attempt.sourceUrl],
    evidenceRefs: [`provider-connection-attempt:${attempt.attemptRef}`],
  }
  const result = existing === null
    ? createProviderConnection(authority, now)
    : reauthorizeProviderConnection(toDomain(existing), {
        ...authority,
        expectedAuthorityGeneration: existing.authorityGeneration,
        expectedAuthorityDigest: existing.authorityDigest,
      }, now)
  if (result.kind === 'refused') {
    return { kind: 'refused' as const, code: 'connection_conflict' as const }
  }
  if (result.kind === 'applied') {
    if (existing === null) {
      await ctx.db.insert('capabilityProviderConnections', toRow(result.connection, args.commandId, result.commandDigest))
    } else {
      await ctx.db.replace(existing._id, toRow(result.connection, args.commandId, result.commandDigest))
      await invalidateActiveLeases(ctx, connectionRef, 'generation_changed', now, args.commandId)
    }
    await persistAuditEvent(ctx.db, createConnectionLifecycleAuditEvent({
      eventType: existing === null ? 'connection.connected' : 'connection.reauthorized',
      actorPrincipalRef: actor.canonicalPrincipalRef,
      activeAccountRef: actor.canonicalAccountRef,
      connectionRef,
      authorityGeneration: result.connection.authorityGeneration,
      commandId: args.commandId,
      correlationRef: args.correlationId,
      commandDigest: result.commandDigest,
      adapterId,
      beforeState: existing === null ? 'missing' : toDomain(existing).lifecycle,
      outcome: existing === null ? 'connected' : 'reauthorized',
      resourceUrl: attempt.sourceUrl,
      occurredAt: now,
    }))
  }
  await ctx.db.patch(attempt._id, {
    lifecycle: 'consumed',
    credentialSecretRef: args.secretRef,
    connectionRef,
    consumedAt: now,
    updatedAt: now,
  })
  const draftRef = attempt.draftRef
  if (draftRef !== undefined) {
    const draft = await ctx.db.query('capabilitySupplySourceDrafts')
      .withIndex('by_draftRef', (query) => query.eq('draftRef', draftRef))
      .unique()
    if (draft !== null && draft.owningAccountRef === actor.canonicalAccountRef) {
      await ctx.db.patch(draft._id, {
        lifecycle: 'connected',
        connectionRef,
        updatedAt: now,
      })
    }
  }
  return {
    kind: result.kind === 'duplicate' ? 'replayed' as const : 'connected' as const,
    connection: serializableOwnerProjection(result.connection, now),
  }
}

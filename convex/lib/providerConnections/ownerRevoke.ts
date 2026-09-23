import type { WorkId } from '@convex-dev/workpool'
import { degradeBackend } from '../../../src/lib/observability/degrade-backend'
import {
  beginProviderConnectionRevocation,
  createConnectionLifecycleAuditEvent,
  providerConnectionCleanupCommandId,
  providerConnectionCleanupRequestDigest,
  providerConnectionRevocationRef,
  withProviderConnectionAuthority,
  type ProviderConnection,
  type ProviderConnectionCommandResult,
} from '../../../src/modules/capability-supply/provider-connection'
import {
  ConsequenceAuthorityBoundary,
} from '../../../src/modules/authority/context/public'
import {
  DelegationService,
  delegationGrantRef,
} from '../../../src/modules/authority/delegation/public'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import type { MutationCtx } from '../../_generated/server'
import type { Doc } from '../../_generated/dataModel'
import { marketDispatchWorkpool } from '../../marketDispatchWorkpool'
import {
  enqueueCleanupWork,
  invalidateActiveLeases,
  resolveProviderConnectionProvenance,
  toDomain,
  toRow,
} from './lifecycle'
import { resolveBusinessActor } from '../../authz'
import { accountRef, principalRef } from '../../../src/modules/principal-account/public'
import { persistAuditEvent } from '../../securityShared'
import { admitInteractiveOwnerConsequence } from '../ownerConsequence'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from '../delegationPersistence'
import {
  type ProviderConnectionActor,
  type RetryOwnerCleanupArgs,
  type RevokeOwnerArgs,
} from './ownerContracts'
import {
  exactGrantRefForConnection,
  projectOwnerProjection,
  projectOwnerResult,
  readProviderConnectionForActor,
} from './ownerRead'

function cleanupOwnerCommandDigest(connectionRef: string, commandId: string): string {
  return canonicalDigest({ kind: 'provider_cleanup_owner_retry:v1', connectionRef, commandId })
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
    const consequenceAdmitted = await admitProviderConnectionRevocationConsequence(ctx, {
      args,
      actor,
      current: toDomain(owned.row),
      result,
      now,
    })
    if (!consequenceAdmitted) {
      return { kind: 'refused' as const, code: 'invalid_transition' as const }
    }
    return await applyProviderConnectionRevocation(ctx, args, actor, owned.row, result, now)
  }
  return projectOwnerResult(result, now)
}

type ProviderConnectionRevocationConsequenceInput = Readonly<{
  args: RevokeOwnerArgs
  actor: ProviderConnectionActor
  current: ProviderConnection
  result: Extract<ProviderConnectionCommandResult, { kind: 'applied' }>
  now: number
}>

function providerConnectionRevocationConsequence(
  input: ProviderConnectionRevocationConsequenceInput,
) {
  return {
    action: 'connection.revoke' as const,
    target: {
      targetType: 'provider_connection',
      targetRef: input.current.connectionRef,
      targetRevision: input.current.authorityGeneration,
    },
    requiredScopes: ['connection:revoke'],
    resourceRefs: [`connection:${input.current.connectionRef}`],
    budgetAmount: 0,
    consequenceSummary: 'Revoke this exact supplier connection authority and begin bounded cleanup.',
    statusReadbackRef: `provider-connections/${input.current.connectionRef}`,
    correlationRef: input.args.commandId,
    idempotencyRef: input.args.commandId,
    command: {
      version: 'ae.provider-connection-revoke-consequence:v1',
      commandId: input.args.commandId,
      connectionRef: input.current.connectionRef,
      expectedAuthorityGeneration: input.args.expectedAuthorityGeneration,
      expectedAuthorityDigest: input.args.expectedAuthorityDigest,
      currentAuthorityGeneration: input.current.authorityGeneration,
      currentAuthorityDigest: input.current.authorityDigest,
      revocationCommandDigest: input.result.commandDigest,
      reasonCode: input.args.reasonCode ?? null,
      evidenceRefs: [...input.args.evidenceRefs].sort(),
    },
  } as const
}

async function admitInteractiveProviderConnectionRevocation(
  ctx: MutationCtx,
  input: ProviderConnectionRevocationConsequenceInput & Required<Pick<ProviderConnectionActor, 'authorityRevision' | 'authorityProvenance'>>,
  consequence: ReturnType<typeof providerConnectionRevocationConsequence>,
): Promise<boolean> {
  const admitted = await admitInteractiveOwnerConsequence(ctx, {
    actor: {
      kind: 'authenticated_owner',
      canonicalPrincipalRef: principalRef(input.actor.canonicalPrincipalRef),
      canonicalAccountRef: accountRef(input.actor.canonicalAccountRef),
      authorityRevision: input.authorityRevision,
      authorityProvenance: input.authorityProvenance,
    },
    ...consequence,
    now: input.now,
  })
  return admitted.kind === 'admitted'
    && admitted.admission.consequenceAction === 'connection.revoke'
    && admitted.admission.descriptor !== undefined
    && admitted.admission.proofPolicy?.kind === 'none'
}

function delegatedRevocationGrantIsCurrent(
  grant: Doc<'authorityDelegationGrants'> | undefined,
  input: ProviderConnectionRevocationConsequenceInput,
): grant is Doc<'authorityDelegationGrants'> {
  return grant !== undefined
    && grant.lifecycle === 'active'
    && grant.accountRef === input.actor.canonicalAccountRef
    && grant.subjectPrincipalRef === input.actor.canonicalPrincipalRef
    && grant.expiresAt > input.now
}

async function admitDelegatedProviderConnectionRevocation(
  ctx: MutationCtx,
  input: ProviderConnectionRevocationConsequenceInput,
  consequence: ReturnType<typeof providerConnectionRevocationConsequence>,
): Promise<boolean> {
  const authorityGrantRef = input.actor.authorityGrantRef
  if (authorityGrantRef === undefined) return false
  const grantRows = await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', authorityGrantRef))
    .take(2)
  const grant = grantRows.length === 1 ? grantRows[0] : undefined
  if (!delegatedRevocationGrantIsCurrent(grant, input)) return false

  try {
    const actor = principalRef(input.actor.canonicalPrincipalRef)
    const boundary = new ConsequenceAuthorityBoundary(new DelegationService(
      createConvexDelegationStore(ctx),
      createConvexDelegationContextPort(ctx, actor),
      { now: () => input.now },
    ))
    const admission = await boundary.forSurface('convex', {
      resolveCanonicalBinding: async () => ({
        principalClass: 'interactive',
        actorPrincipalRef: actor,
        activeAccountRef: accountRef(input.actor.canonicalAccountRef),
        grantRef: delegationGrantRef(grant.grantRef),
        grantGeneration: grant.generation,
      }),
    }).withCurrentAuthority({
      requiredScopes: consequence.requiredScopes,
      resourceRefs: consequence.resourceRefs,
      budgetAmount: consequence.budgetAmount,
      correlationRef: consequence.correlationRef,
      idempotencyRef: consequence.idempotencyRef,
      consequence: {
        action: consequence.action,
        target: consequence.target,
        consequenceSummary: consequence.consequenceSummary,
        statusReadbackRef: consequence.statusReadbackRef,
        command: consequence.command,
      },
    }, async (current) => current)
    return admission.consequenceAction === 'connection.revoke'
      && admission.descriptor !== undefined
      && admission.proofPolicy?.kind === 'none'
  } catch (cause) {
    return degradeBackend(cause, false, { site: 'admitDelegatedProviderConnectionRevocation', reason: 'invalid_response' })
  }
}

async function admitProviderConnectionRevocationConsequence(
  ctx: MutationCtx,
  input: ProviderConnectionRevocationConsequenceInput,
): Promise<boolean> {
  const consequence = providerConnectionRevocationConsequence(input)
  const authorityRevision = input.actor.authorityRevision
  const authorityProvenance = input.actor.authorityProvenance
  if (authorityRevision !== undefined && authorityProvenance !== undefined) {
    return await admitInteractiveProviderConnectionRevocation(ctx, {
      ...input,
      authorityRevision,
      authorityProvenance,
    }, consequence)
  }
  return await admitDelegatedProviderConnectionRevocation(ctx, input, consequence)
}

async function applyProviderConnectionRevocation(
  ctx: MutationCtx,
  args: RevokeOwnerArgs,
  actor: ProviderConnectionActor,
  row: Doc<'capabilityProviderConnections'>,
  result: Extract<ProviderConnectionCommandResult, { kind: 'applied' }>,
  now: number,
) {
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
  const cleanupCommandId = providerConnectionCleanupCommandId(revoked.revocationRef, cleanupAttempt)
  const requestDigest = providerConnectionCleanupRequestDigest({
    revocationRef: revoked.revocationRef,
    cleanupAttempt,
    connectionRef: args.connectionRef,
    expectedAuthorityGeneration: revoked.authorityGeneration,
    expectedAuthorityDigest: revoked.authorityDigest,
    adapterId: revoked.adapterId,
  })
  const scheduled = await enqueueCleanupWork(ctx, row._id, revoked, {
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

async function cleanupWorkIsActive(ctx: MutationCtx, workId: string): Promise<boolean> {
  try {
    const status = await marketDispatchWorkpool.status(ctx, workId as WorkId)
    return ['pending', 'running'].includes(status.state)
  } catch (cause) {
    // A missing work item is repairable after the persisted callback grace.
    return degradeBackend(cause, false, { site: 'cleanupWorkIsActive', reason: 'not_found' })
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

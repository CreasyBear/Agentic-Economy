import { marketDispatchWorkpool } from '../../marketDispatchWorkpool'
import { internal } from '../../_generated/api'
import type { MutationCtx } from '../../_generated/server'
import type { Id } from '../../_generated/dataModel'
import {
  invalidateProviderConnectionLease,
  type ProviderConnection,
} from '../../../src/modules/capability-supply/provider-connection'
import { canonicalDigest } from '../../../src/modules/common/canonical-digest'
import {
  cleanupResourceAuthorityMatches,
  readCurrentCleanupResourceAuthority,
} from './authority'
import {
  type AdvanceLeaseDrainArgs,
  type CleanupResourceAuthority,
  type CleanupWorkContext,
  type CleanupWorkKind,
} from './contracts'
import { toDomain, toLeaseDomain, toLeaseRow, toRow } from './codecs'

const CLEANUP_CALLBACK_GRACE_MS = 10_000

export async function invalidateActiveLeases(
  ctx: MutationCtx,
  connectionRef: string,
  reasonCode: 'generation_changed' | 'revocation_started',
  now: number,
  commandPrefix: string,
): Promise<boolean> {
  const rows = await ctx.db.query('capabilityProviderConnectionLeases')
    .withIndex('by_connectionRef_and_state', (index) => (
      index.eq('connectionRef', connectionRef).eq('state', 'active')
    ))
    .take(1001)
  const batch = rows.slice(0, 1000)
  await Promise.all(batch.map(async (row) => {
    const result = invalidateProviderConnectionLease(toLeaseDomain(row), {
      commandId: `${commandPrefix}:lease:${row.leaseRef}`,
      leaseRef: row.leaseRef,
      reasonCode,
      evidenceRefs: [`provider_connection:${reasonCode}`],
    }, now)
    if (result.kind === 'applied') {
      await ctx.db.replace(row._id, toLeaseRow(result.lease, row.lastCommandId, result.commandDigest))
    }
  }))
  return rows.length > batch.length
}

export async function enqueueCleanupWork(
  ctx: MutationCtx,
  rowId: Id<'capabilityProviderConnections'>,
  connection: ProviderConnection,
  context: Omit<CleanupWorkContext, 'workKind' | 'resourceAuthority'> & { workKind: CleanupWorkKind },
  now: number,
): Promise<ProviderConnection> {
  const resourceAuthority = await readCurrentCleanupResourceAuthority(ctx, connection, now)
  if (resourceAuthority === null) throw new Error('provider_cleanup_resource_authority_invalid')
  const workId = await marketDispatchWorkpool.enqueueAction(
    ctx,
    internal.capabilityProviderConnectionCleanup.run,
    {
      connectionRef: connection.connectionRef,
      commandId: context.commandId,
      expectedAuthorityGeneration: context.expectedAuthorityGeneration,
      expectedAuthorityDigest: context.expectedAuthorityDigest,
      requestDigest: context.requestDigest,
      cleanupAttempt: context.cleanupAttempt,
      workKind: context.workKind,
      resourceAuthority,
    },
    {
      retry: false,
      onComplete: internal.capabilityProviderConnectionCleanup.completeWork,
      context: { ...context, resourceAuthority },
    },
  )
  const next = {
    ...connection,
    cleanupAttempt: context.cleanupAttempt,
    cleanupWorkId: workId,
    cleanupWorkKind: context.workKind,
    cleanupCommandId: context.commandId,
    cleanupRequestDigest: context.requestDigest,
    cleanupCallbackGraceUntil: now + CLEANUP_CALLBACK_GRACE_MS,
    updatedAt: now,
  }
  await ctx.db.patch(rowId, toRow(next, context.commandId, canonicalDigest(context)))
  return next
}

async function cleanupWorkMatches(
  ctx: MutationCtx,
  args: Pick<CleanupWorkContext, 'connectionRef' | 'commandId' | 'expectedAuthorityGeneration' | 'expectedAuthorityDigest' | 'requestDigest' | 'cleanupAttempt'>
    & { workId: string; resourceAuthority?: CleanupResourceAuthority },
) {
  const row = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', args.connectionRef)).unique()
  if (row === null) return null
  const matches = [
    row.lifecycle === 'revocation_pending', row.cleanupWorkId === args.workId,
    row.cleanupAttempt === args.cleanupAttempt,
    row.cleanupCommandId === args.commandId,
    row.cleanupRequestDigest === args.requestDigest,
    row.authorityGeneration === args.expectedAuthorityGeneration,
    row.authorityDigest === args.expectedAuthorityDigest,
  ].every(Boolean)
  if (!matches) return null
  const currentAuthority = await readCurrentCleanupResourceAuthority(ctx, toDomain(row))
  if (args.resourceAuthority === undefined || currentAuthority === null) return null
  return cleanupResourceAuthorityMatches(currentAuthority, args.resourceAuthority)
    ? row
    : null
}

export async function advanceLeaseDrainHandler(ctx: MutationCtx, args: AdvanceLeaseDrainArgs) {
  const row = await cleanupWorkMatches(ctx, args)
  if (row === null || row.cleanupWorkKind !== 'lease_drain') return null
  const connection = toDomain(row)
  const hasMore = await invalidateActiveLeases(
    ctx,
    args.connectionRef,
    'revocation_started',
    Date.now(),
    `${args.commandId}:drain:${args.cleanupAttempt}`,
  )
  const nextKind: CleanupWorkKind = hasMore ? 'lease_drain' : 'cleanup'
  await enqueueCleanupWork(ctx, row._id, connection, {
    connectionRef: args.connectionRef,
    commandId: args.commandId,
    expectedAuthorityGeneration: args.expectedAuthorityGeneration,
    expectedAuthorityDigest: args.expectedAuthorityDigest,
    requestDigest: args.requestDigest,
    cleanupAttempt: args.cleanupAttempt,
    workKind: nextKind,
  }, Date.now())
  return null
}



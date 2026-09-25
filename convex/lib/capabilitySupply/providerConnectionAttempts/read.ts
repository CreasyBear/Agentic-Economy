import type { QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import {
  readOwnerArgs,
  readOwnerResult,
  readOwnerSourceDraftArgs,
  readOwnerSourceDraftResult,
} from './contracts'

export { readOwnerArgs, readOwnerResult, readOwnerSourceDraftArgs, readOwnerSourceDraftResult }

export async function readOwnerHandler(
  ctx: QueryCtx,
  args: { attemptRef: string },
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' as const }
  const row = await ctx.db.query('capabilityProviderConnectionAttempts')
    .withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef))
    .unique()
  if (row === null || row.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'not_found' as const }
  }
  const state = row.lifecycle === 'pending' && row.expiresAt <= Date.now()
    ? 'expired' as const
    : row.lifecycle
  return {
    kind: 'available' as const,
    attempt: {
      attemptRef: row.attemptRef,
      businessRef: String(row.businessId),
      sourceKind: row.sourceKind,
      sourceUrl: row.sourceUrl,
      sourceOrigin: row.sourceOrigin,
      authentication: row.authentication,
      environment: row.environment,
      state,
      ...(row.connectionRef === undefined ? {} : { connectionRef: row.connectionRef }),
      expiresAt: row.expiresAt,
      ...(row.draftRef === undefined ? {} : { draftRef: row.draftRef }),
      ...(row.candidateDraftRef === undefined ? {} : { candidateDraftRef: row.candidateDraftRef }),
    },
  }
}

export async function readOwnerSourceDraftHandler(
  ctx: QueryCtx,
  args: { draftRef: string },
) {
  const actor = await resolveBusinessActor(ctx)
  if (actor.kind !== 'authenticated_owner') return { kind: 'not_found' as const }
  const row = await ctx.db.query('capabilitySupplySourceDrafts')
    .withIndex('by_draftRef', (query) => query.eq('draftRef', args.draftRef))
    .unique()
  if (row === null || row.owningAccountRef !== actor.canonicalAccountRef) {
    return { kind: 'not_found' as const }
  }
  const state = (row.lifecycle === 'pending' || row.lifecycle === 'connected')
    && row.expiresAt <= Date.now()
    ? 'expired' as const
    : row.lifecycle
  return {
    kind: 'available' as const,
    draft: {
      draftRef: row.draftRef,
      businessRef: String(row.businessId),
      sourceKind: row.sourceKind,
      sourceDescriptorJson: row.sourceDescriptorJson,
      expectedSourceDigest: row.expectedSourceDigest,
      sourceRevision: row.sourceRevision,
      sourceUrl: row.sourceUrl,
      ...(row.remoteRef === undefined ? {} : { remoteRef: row.remoteRef }),
      environment: row.environment,
      state,
      ...(row.connectionRef === undefined ? {} : { connectionRef: row.connectionRef }),
      expiresAt: row.expiresAt,
    },
  }
}

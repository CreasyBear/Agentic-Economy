import { type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  MARKET_REQUEST_ACTIVE_WINDOW_MS, marketRequestCreateInputSchema, marketRequestScopeSchema, ownerMarketRequestRef,
} from '@/modules/market-demand/request-identity'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../security/sourceWrite/admission'
import {
  ownerFindActiveArgsValue, ownerFindActiveResultValue, ownerListArgsValue, ownerReadArgsValue,
  ownerRecordArgsValue, ownerReplayArgsValue, ownerReplayResultValue, ownerWithdrawArgsValue,
  listResultValue, readResultValue, recordResultValue, withdrawResultValue,
} from './contracts'

async function ownerAccountRef(ctx: QueryCtx | MutationCtx): Promise<string | null> {
  const actor = await resolveBusinessActor(ctx)
  return actor.kind === 'authenticated_owner' && actor.authorityProvenance.accessKind === 'ownership'
    ? actor.canonicalAccountRef : null
}

async function resolveAlias(
  db: QueryCtx['db'],
  alias: Readonly<{ ownerId: string; targetRef: string }>,
  ownerId: string,
  digest: string,
): Promise<Exclude<Infer<typeof ownerReplayResultValue>, { kind: 'not_found' }>> {
  if (alias.ownerId !== ownerId) return { kind: 'refused', code: 'idempotency_conflict' }
  const rows = await db.query('marketDemandSignals')
    .withIndex('by_requestRef', index => index.eq('requestRef', alias.targetRef)).take(2)
  const target = rows[0]
  if (rows.length !== 1 || target === undefined || target.ownerId !== ownerId) {
    return { kind: 'refused', code: 'invalid_request' }
  }
  if (target.schemaVersion !== 'market-demand-owner-signal:v1') return { kind: 'refused', code: 'invalid_request' }
  return target.queryDigest === digest
    ? { kind: 'replayed', requestRef: target.requestRef, query: target.query, createdAt: target.createdAt }
    : { kind: 'refused', code: 'idempotency_conflict' }
}

export async function ownerRecordHandler(
  ctx: MutationCtx, args: Infer<typeof ownerRecordArgsValue>,
): Promise<Infer<typeof recordResultValue>> {
  const source = await requireSourceWrite(ctx, args, 'protected_action')
  if (source.kind === 'rejected') return { kind: 'refused', code: 'unauthenticated' }
  const ownerId = await ownerAccountRef(ctx)
  if (ownerId === null) return { kind: 'refused', code: 'unauthenticated' }
  const input = marketRequestCreateInputSchema.safeParse({
    query: args.query, idempotencyKey: args.idempotencyKey, source: args.source, filters: args.filters,
  })
  if (!input.success) return { kind: 'refused', code: 'invalid_request' }
  const { query, idempotencyKey, source: selectedSource, filters } = input.data
  const queryDigest = canonicalDigest({ query, source: selectedSource ?? null, filters: filters ?? null })
  const requestRef = ownerMarketRequestRef({ ownerId, idempotencyKey })
  const rows = await ctx.db.query('marketDemandSignals')
    .withIndex('by_requestRef', index => index.eq('requestRef', requestRef)).take(2)
  if (rows.length > 1) return { kind: 'refused', code: 'idempotency_conflict' }
  const replay = rows[0]
  if (replay !== undefined && (replay.ownerId !== ownerId
    || (replay.schemaVersion !== 'market-demand-owner-signal:v1'
      && replay.schemaVersion !== 'market-demand-owner-withdrawn:v1'
      && replay.schemaVersion !== 'market-demand-owner-alias:v1'))) {
    return { kind: 'refused', code: 'idempotency_conflict' }
  }
  if (replay !== undefined) {
    if (replay.schemaVersion === 'market-demand-owner-withdrawn:v1') return { kind: 'refused', code: 'invalid_request' }
    if (replay.schemaVersion === 'market-demand-owner-alias:v1') {
      return await resolveAlias(ctx.db, replay, ownerId, queryDigest)
    }
    return replay.queryDigest === queryDigest
      ? { kind: 'replayed', requestRef: replay.requestRef, query: replay.query, createdAt: replay.createdAt }
      : { kind: 'refused', code: 'idempotency_conflict' }
  }
  const active = await ctx.db.query('marketDemandSignals')
    .withIndex('by_ownerId_and_schemaVersion_and_queryDigest', index => index
      .eq('ownerId', ownerId)
      .eq('schemaVersion', 'market-demand-owner-signal:v1')
      .eq('queryDigest', queryDigest)).order('desc').take(1)
  const existingScope = active[0]
  const now = Date.now()
  if (existingScope !== undefined && existingScope.schemaVersion === 'market-demand-owner-signal:v1'
    && existingScope.ownerId === ownerId && existingScope.queryDigest === queryDigest
    && existingScope.createdAt <= now && now - existingScope.createdAt < MARKET_REQUEST_ACTIVE_WINDOW_MS) {
    await ctx.db.insert('marketDemandSignals', {
      schemaVersion: 'market-demand-owner-alias:v1', requestRef, ownerId, idempotencyKey,
      targetRef: existingScope.requestRef, createdAt: now, updatedAt: now,
    })
    return { kind: 'replayed', requestRef: existingScope.requestRef, query: existingScope.query, createdAt: existingScope.createdAt }
  }
  const createdAt = Date.now()
  await ctx.db.insert('marketDemandSignals', {
    schemaVersion: 'market-demand-owner-signal:v1', requestRef, ownerId, idempotencyKey,
    query, queryDigest,
    ...(selectedSource === undefined ? {} : { source: selectedSource }),
    ...(filters === undefined ? {} : { filters }),
    createdAt, updatedAt: createdAt,
  })
  return { kind: 'recorded', requestRef, query, createdAt }
}

export async function ownerReplayHandler(
  ctx: QueryCtx, args: Infer<typeof ownerReplayArgsValue>,
): Promise<Infer<typeof ownerReplayResultValue>> {
  const ownerId = await ownerAccountRef(ctx)
  if (ownerId === null) return { kind: 'refused', code: 'unauthenticated' }
  const input = marketRequestCreateInputSchema.safeParse(args)
  if (!input.success) return { kind: 'refused', code: 'invalid_request' }
  const { query, idempotencyKey, source, filters } = input.data
  const requestRef = ownerMarketRequestRef({ ownerId, idempotencyKey })
  const rows = await ctx.db.query('marketDemandSignals')
    .withIndex('by_requestRef', index => index.eq('requestRef', requestRef)).take(2)
  if (rows.length === 0) return { kind: 'not_found' }
  const row = rows[0]
  if (rows.length !== 1 || row === undefined || row.ownerId !== ownerId
    || (row.schemaVersion !== 'market-demand-owner-signal:v1'
      && row.schemaVersion !== 'market-demand-owner-withdrawn:v1'
      && row.schemaVersion !== 'market-demand-owner-alias:v1')) {
    return { kind: 'refused', code: 'idempotency_conflict' }
  }
  if (row.schemaVersion === 'market-demand-owner-withdrawn:v1') return { kind: 'refused', code: 'invalid_request' }
  const digest = canonicalDigest({ query, source: source ?? null, filters: filters ?? null })
  if (row.schemaVersion === 'market-demand-owner-alias:v1') {
    return await resolveAlias(ctx.db, row, ownerId, digest)
  }
  return row.queryDigest === digest
    ? { kind: 'replayed', requestRef, query: row.query, createdAt: row.createdAt }
    : { kind: 'refused', code: 'idempotency_conflict' }
}

export async function ownerFindActiveHandler(
  ctx: QueryCtx, args: Infer<typeof ownerFindActiveArgsValue>,
): Promise<Infer<typeof ownerFindActiveResultValue>> {
  const ownerId = await ownerAccountRef(ctx)
  if (ownerId === null) return { kind: 'error', code: 'unauthenticated' }
  const input = marketRequestScopeSchema.safeParse(args)
  if (!input.success) return { kind: 'error', code: 'invalid_request' }
  const { query, source, filters } = input.data
  const digest = canonicalDigest({ query, source: source ?? null, filters: filters ?? null })
  const rows = await ctx.db.query('marketDemandSignals')
    .withIndex('by_ownerId_and_schemaVersion_and_queryDigest', index => index
      .eq('ownerId', ownerId)
      .eq('schemaVersion', 'market-demand-owner-signal:v1')
      .eq('queryDigest', digest)).order('desc').take(1)
  const row = rows[0]
  const now = Date.now()
  if (row === undefined || row.schemaVersion !== 'market-demand-owner-signal:v1'
    || row.ownerId !== ownerId || row.queryDigest !== digest
    || row.createdAt > now || now - row.createdAt >= MARKET_REQUEST_ACTIVE_WINDOW_MS) return { kind: 'not_found' }
  return { kind: 'found', request: {
    requestRef: row.requestRef, query: row.query, createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...(row.source === undefined ? {} : { source: row.source }),
    ...(row.filters === undefined ? {} : { filters: row.filters }),
  } }
}

export async function ownerListHandler(
  ctx: QueryCtx, args: Infer<typeof ownerListArgsValue>,
): Promise<Infer<typeof listResultValue>> {
  const ownerId = await ownerAccountRef(ctx)
  if (ownerId === null) return { kind: 'error', code: 'unauthenticated' }
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) return { kind: 'error', code: 'source_unavailable' }
  const requests = await ctx.db.query('marketDemandSignals')
    .withIndex('by_ownerId_and_schemaVersion_and_createdAt', index => index
      .eq('ownerId', ownerId).eq('schemaVersion', 'market-demand-owner-signal:v1'))
    .order('desc').paginate(args.paginationOpts)
  return { kind: 'available', requests: {
    ...requests,
    page: requests.page.flatMap(row => row.schemaVersion === 'market-demand-owner-signal:v1'
      ? [{
          requestRef: row.requestRef, query: row.query,
          createdAt: row.createdAt, updatedAt: row.updatedAt,
          ...(row.source === undefined ? {} : { source: row.source }),
          ...(row.filters === undefined ? {} : { filters: row.filters }),
        }]
      : []),
  } }
}

export async function ownerReadHandler(
  ctx: QueryCtx, args: Infer<typeof ownerReadArgsValue>,
): Promise<Infer<typeof readResultValue>> {
  const ownerId = await ownerAccountRef(ctx)
  if (ownerId === null) return { kind: 'error', code: 'unauthenticated' }
  const rows = await ctx.db.query('marketDemandSignals')
    .withIndex('by_requestRef', index => index.eq('requestRef', args.requestRef)).take(2)
  if (rows.length !== 1) return { kind: 'not_found' }
  const row = rows[0]
  if (row === undefined || row.ownerId !== ownerId
    || (row.schemaVersion !== 'market-demand-owner-signal:v1' && row.schemaVersion !== 'market-demand-owner-withdrawn:v1')) return { kind: 'not_found' }
  if (row.schemaVersion === 'market-demand-owner-withdrawn:v1') return { kind: 'withdrawn' }
  return { kind: 'found', request: {
    requestRef: row.requestRef, query: row.query, createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...(row.source === undefined ? {} : { source: row.source }),
    ...(row.filters === undefined ? {} : { filters: row.filters }),
  } }
}

export async function ownerWithdrawHandler(
  ctx: MutationCtx, args: Infer<typeof ownerWithdrawArgsValue>,
): Promise<Infer<typeof withdrawResultValue>> {
  const source = await requireSourceWrite(ctx, args, 'protected_action')
  if (source.kind === 'rejected') return { kind: 'error', code: 'unauthenticated' }
  const ownerId = await ownerAccountRef(ctx)
  if (ownerId === null) return { kind: 'error', code: 'unauthenticated' }
  const rows = await ctx.db.query('marketDemandSignals')
    .withIndex('by_requestRef', index => index.eq('requestRef', args.requestRef)).take(2)
  const row = rows[0]
  if (rows.length !== 1 || row === undefined || row.ownerId !== ownerId
    || (row.schemaVersion !== 'market-demand-owner-signal:v1' && row.schemaVersion !== 'market-demand-owner-withdrawn:v1')) return { kind: 'not_found' }
  if (row.schemaVersion === 'market-demand-owner-signal:v1') {
    await ctx.db.replace(row._id, {
      schemaVersion: 'market-demand-owner-withdrawn:v1', requestRef: row.requestRef,
      ownerId: row.ownerId, idempotencyKey: row.idempotencyKey,
      createdAt: row.createdAt, updatedAt: Date.now(),
    })
  }
  return { kind: 'withdrawn', requestRef: row.requestRef }
}

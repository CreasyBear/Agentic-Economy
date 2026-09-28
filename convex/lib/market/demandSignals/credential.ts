import { type Infer } from 'convex/values'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  marketRequestCreateInputSchema, marketRequestRef, toConvexToolCatalogFilters,
} from '@/modules/market-demand/request-identity'
import type { MutationCtx, QueryCtx } from '../../../_generated/server'
import { verifyMarketAgentPrincipal } from '../../../agentAccessPrincipals'
import type { AgentPrincipalAdmission } from '../../agentAccess/principals/verification'
import { requireSourceRead, requireSourceWrite } from '../../security/sourceWrite/admission'
import {
  listArgsValue, listResultValue, readArgsValue, readResultValue,
  recordArgsValue, recordResultValue, withdrawResultValue,
} from './contracts'

async function admitForWrite(ctx: MutationCtx, args: Infer<typeof recordArgsValue> | Infer<typeof readArgsValue>): Promise<AgentPrincipalAdmission | null> {
  const source = await requireSourceWrite(ctx, args, 'protected_action')
  if (source.kind === 'rejected') return null
  const principal = await verifyMarketAgentPrincipal(ctx, args.agentPrincipal)
  return principal.kind === 'allowed' ? principal : null
}

async function admitForRead(ctx: QueryCtx, args: Infer<typeof listArgsValue> | Infer<typeof readArgsValue>): Promise<AgentPrincipalAdmission | null> {
  if ((await requireSourceRead(args, 'protected_action')).kind === 'rejected') return null
  const principal = await verifyMarketAgentPrincipal(ctx, args.agentPrincipal)
  return principal.kind === 'allowed' ? principal : null
}

export async function recordHandler(ctx: MutationCtx, args: Infer<typeof recordArgsValue>): Promise<Infer<typeof recordResultValue>> {
  const principal = await admitForWrite(ctx, args)
  if (principal === null || principal.kind !== 'allowed') return { kind: 'refused', code: 'unauthenticated' }
  const parsed = marketRequestCreateInputSchema.safeParse({
    query: args.query, idempotencyKey: args.idempotencyKey, source: args.source, filters: args.filters,
  })
  if (!parsed.success) return { kind: 'refused', code: 'invalid_request' }
  const { query, idempotencyKey, source, filters } = parsed.data
  const queryDigest = canonicalDigest({ query, source: source ?? null, filters: filters ?? null })
  const existing = await ctx.db.query('marketDemandSignals')
    .withIndex('by_credentialId_and_idempotencyKey', index => index
      .eq('credentialId', args.agentPrincipal.credentialId).eq('idempotencyKey', idempotencyKey)).take(2)
  if (existing.length > 1) return { kind: 'refused', code: 'idempotency_conflict' }
  const replay = existing[0]
  if (replay !== undefined) {
    if (replay.schemaVersion === 'market-demand-withdrawn:v1') return { kind: 'refused', code: 'invalid_request' }
    if (replay.schemaVersion !== 'market-demand-signal:v1') return { kind: 'refused', code: 'idempotency_conflict' }
    if (replay.principalId !== principal.principalId) return { kind: 'refused', code: 'invalid_request' }
    const retainedDigest = canonicalDigest({ query: replay.query, source: replay.source ?? null, filters: replay.filters ?? null })
    return retainedDigest === queryDigest
      ? { kind: 'replayed', requestRef: replay.requestRef, query: replay.query, createdAt: replay.createdAt }
      : { kind: 'refused', code: 'idempotency_conflict' }
  }
  const createdAt = Date.now()
  const requestRef = marketRequestRef({ principalId: principal.principalId, credentialId: args.agentPrincipal.credentialId, idempotencyKey })
  await ctx.db.insert('marketDemandSignals', {
    schemaVersion: 'market-demand-signal:v1', requestRef, principalId: principal.principalId,
    ownerId: principal.ownerId, credentialId: args.agentPrincipal.credentialId,
    applicationRef: args.agentPrincipal.applicationRef, environment: args.agentPrincipal.environment,
    query, queryDigest, idempotencyKey,
    ...(source === undefined ? {} : { source }),
    ...(filters === undefined ? {} : { filters: toConvexToolCatalogFilters(filters) }),
    createdAt, updatedAt: createdAt,
  })
  return { kind: 'recorded', requestRef, query, createdAt }
}

export async function listHandler(ctx: QueryCtx, args: Infer<typeof listArgsValue>): Promise<Infer<typeof listResultValue>> {
  const principal = await admitForRead(ctx, args)
  if (principal === null || principal.kind !== 'allowed') return { kind: 'error', code: 'unauthenticated' }
  if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) return { kind: 'error', code: 'source_unavailable' }
  const requests = await ctx.db.query('marketDemandSignals')
    .withIndex('by_principalId_and_credentialId_and_createdAt', index => index
      .eq('principalId', principal.principalId).eq('credentialId', args.agentPrincipal.credentialId))
    .order('desc').paginate(args.paginationOpts)
  return { kind: 'available', requests: {
    ...requests,
    page: requests.page.flatMap(row => row.schemaVersion === 'market-demand-signal:v1'
      ? [{ requestRef: row.requestRef, query: row.query, createdAt: row.createdAt, updatedAt: row.updatedAt,
        ...(row.source === undefined ? {} : { source: row.source }),
        ...(row.filters === undefined ? {} : { filters: row.filters }) }]
      : []),
  } }
}

export async function readHandler(ctx: QueryCtx, args: Infer<typeof readArgsValue>): Promise<Infer<typeof readResultValue>> {
  const principal = await admitForRead(ctx, args)
  if (principal === null || principal.kind !== 'allowed') return { kind: 'error', code: 'unauthenticated' }
  const rows = await ctx.db.query('marketDemandSignals')
    .withIndex('by_requestRef', index => index.eq('requestRef', args.requestRef)).take(2)
  if (rows.length !== 1) return { kind: 'not_found' }
  const row = rows[0]
  if (row === undefined
    || (row.schemaVersion !== 'market-demand-signal:v1' && row.schemaVersion !== 'market-demand-withdrawn:v1')
    || row.principalId !== principal.principalId
    || row.credentialId !== args.agentPrincipal.credentialId) return { kind: 'not_found' }
  if (row.schemaVersion === 'market-demand-withdrawn:v1') return { kind: 'withdrawn' }
  return { kind: 'found', request: {
    requestRef: row.requestRef, query: row.query, createdAt: row.createdAt, updatedAt: row.updatedAt,
    ...(row.source === undefined ? {} : { source: row.source }),
    ...(row.filters === undefined ? {} : { filters: row.filters }),
  } }
}

export async function withdrawHandler(ctx: MutationCtx, args: Infer<typeof readArgsValue>): Promise<Infer<typeof withdrawResultValue>> {
  const principal = await admitForWrite(ctx, args)
  if (principal === null || principal.kind !== 'allowed') return { kind: 'error', code: 'unauthenticated' }
  const rows = await ctx.db.query('marketDemandSignals')
    .withIndex('by_requestRef', index => index.eq('requestRef', args.requestRef)).take(2)
  const row = rows[0]
  if (rows.length !== 1 || row === undefined
    || (row.schemaVersion !== 'market-demand-signal:v1' && row.schemaVersion !== 'market-demand-withdrawn:v1')
    || row.principalId !== principal.principalId
    || row.credentialId !== args.agentPrincipal.credentialId) return { kind: 'not_found' }
  if (row.schemaVersion === 'market-demand-signal:v1') {
    await ctx.db.replace(row._id, {
      schemaVersion: 'market-demand-withdrawn:v1', requestRef: row.requestRef,
      principalId: row.principalId, ownerId: row.ownerId, credentialId: row.credentialId,
      applicationRef: row.applicationRef, environment: row.environment,
      idempotencyKey: row.idempotencyKey, createdAt: row.createdAt, updatedAt: Date.now(),
    })
  }
  return { kind: 'withdrawn', requestRef: row.requestRef }
}

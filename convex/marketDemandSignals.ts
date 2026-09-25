import { type Infer } from 'convex/values'

import { mutation, query, type MutationCtx } from './_generated/server'
import { verifyMarketAgentPrincipal } from './agentAccessPrincipals'
import { requireSourceRead, requireSourceWrite } from './lib/security/sourceWrite/admission'
import {
  listArgsValue,
  listResultValue,
  readArgsValue,
  readResultValue,
  recordArgsValue,
  recordResultValue,
  withdrawResultValue,
} from './lib/market/demandSignals/contracts'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { marketRequestRef } from '@/modules/market-demand/request-identity'

async function admitForWrite(
  ctx: MutationCtx,
  args: Infer<typeof recordArgsValue> | Infer<typeof readArgsValue>,
) {
  const source = await requireSourceWrite(ctx, args, 'protected_action')
  if (source.kind === 'rejected') return null
  const principal = await verifyMarketAgentPrincipal(ctx, args.agentPrincipal)
  return principal.kind === 'allowed' ? principal : null
}

async function admitForRead(
  ctx: Parameters<typeof verifyMarketAgentPrincipal>[0],
  args: Infer<typeof listArgsValue> | Infer<typeof readArgsValue>,
) {
  if ((await requireSourceRead(args, 'protected_action')).kind === 'rejected') return null
  const principal = await verifyMarketAgentPrincipal(ctx, args.agentPrincipal)
  return principal.kind === 'allowed' ? principal : null
}

export const record = mutation({
  args: recordArgsValue.fields,
  returns: recordResultValue,
  handler: async (ctx, args): Promise<Infer<typeof recordResultValue>> => {
    const principal = await admitForWrite(ctx, args)
    if (principal === null) return { kind: 'refused', code: 'unauthenticated' }
    const query = args.query.trim()
    const idempotencyKey = args.idempotencyKey.trim()
    if (query.length < 1 || query.length > 200 || idempotencyKey.length < 1 || idempotencyKey.length > 200) {
      return { kind: 'refused', code: 'invalid_request' }
    }
    const queryDigest = canonicalDigest({ query })
    const existing = await ctx.db.query('marketDemandSignals')
      .withIndex('by_credentialId_and_idempotencyKey', (index) => index
        .eq('credentialId', args.agentPrincipal.credentialId)
        .eq('idempotencyKey', idempotencyKey))
      .take(2)
    if (existing.length > 1) return { kind: 'refused', code: 'idempotency_conflict' }
    const replay = existing[0]
    if (replay !== undefined) {
      if (replay.schemaVersion === 'market-demand-withdrawn:v1') return { kind: 'refused', code: 'invalid_request' }
      return replay.queryDigest === queryDigest
        ? {
            kind: 'replayed',
            requestRef: replay.requestRef,
            query: replay.query,
            createdAt: replay.createdAt,
          }
        : { kind: 'refused', code: 'idempotency_conflict' }
    }
    const createdAt = Date.now()
    const requestRef = marketRequestRef({
      principalId: principal.principalId,
      credentialId: args.agentPrincipal.credentialId,
      idempotencyKey,
    })
    await ctx.db.insert('marketDemandSignals', {
      schemaVersion: 'market-demand-signal:v1',
      requestRef,
      principalId: principal.principalId,
      ownerId: principal.ownerId,
      credentialId: args.agentPrincipal.credentialId,
      applicationRef: args.agentPrincipal.applicationRef,
      environment: args.agentPrincipal.environment,
      query,
      queryDigest,
      idempotencyKey,
      createdAt,
      updatedAt: createdAt,
    })
    return { kind: 'recorded', requestRef, query, createdAt }
  },
})

export const list = query({
  args: listArgsValue.fields,
  returns: listResultValue,
  handler: async (ctx, args): Promise<Infer<typeof listResultValue>> => {
    const principal = await admitForRead(ctx, args)
    if (principal === null) return { kind: 'error', code: 'unauthenticated' }
    if (args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) {
      return { kind: 'error', code: 'source_unavailable' }
    }
    const requests = await ctx.db.query('marketDemandSignals')
      .withIndex('by_principalId_and_credentialId_and_createdAt', (index) => index
        .eq('principalId', principal.principalId)
        .eq('credentialId', args.agentPrincipal.credentialId))
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      kind: 'available',
      requests: {
        ...requests,
        page: requests.page.filter((row) => row.schemaVersion === 'market-demand-signal:v1').map((row) => ({
          requestRef: row.requestRef,
          query: row.query,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      },
    }
  },
})

export const read = query({
  args: readArgsValue.fields,
  returns: readResultValue,
  handler: async (ctx, args): Promise<Infer<typeof readResultValue>> => {
    const principal = await admitForRead(ctx, args)
    if (principal === null) return { kind: 'error', code: 'unauthenticated' }
    const rows = await ctx.db.query('marketDemandSignals')
      .withIndex('by_requestRef', (index) => index.eq('requestRef', args.requestRef))
      .take(2)
    if (rows.length !== 1) return { kind: 'not_found' }
    const row = rows[0]
    if (
      row === undefined
      || row.principalId !== principal.principalId
      || row.credentialId !== args.agentPrincipal.credentialId
    ) return { kind: 'not_found' }
    if (row.schemaVersion === 'market-demand-withdrawn:v1') return { kind: 'withdrawn' }
    return {
      kind: 'found',
      request: {
        requestRef: row.requestRef,
        query: row.query,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    }
  },
})

export const withdraw = mutation({
  args: readArgsValue.fields,
  returns: withdrawResultValue,
  handler: async (ctx, args): Promise<Infer<typeof withdrawResultValue>> => {
    // Requires signed admission and current exact credential ownership.
    // Ensures withdrawal erases the need and atomically prevents resurrection.
    // Invariant: repeat withdrawals preserve the first receipt; no inference/purchase.
    // On violation: unauthenticated or not_found, without disclosing other owners.
    const principal = await admitForWrite(ctx, args)
    if (principal === null) return { kind: 'error', code: 'unauthenticated' }
    const rows = await ctx.db.query('marketDemandSignals')
      .withIndex('by_requestRef', (index) => index.eq('requestRef', args.requestRef))
      .take(2)
    const row = rows[0]
    if (rows.length !== 1 || row === undefined
      || row.principalId !== principal.principalId
      || row.credentialId !== args.agentPrincipal.credentialId) return { kind: 'not_found' }
    if (row.schemaVersion === 'market-demand-signal:v1') {
      await ctx.db.replace(row._id, {
        schemaVersion: 'market-demand-withdrawn:v1',
        requestRef: row.requestRef,
        principalId: row.principalId,
        ownerId: row.ownerId,
        credentialId: row.credentialId,
        applicationRef: row.applicationRef,
        environment: row.environment,
        idempotencyKey: row.idempotencyKey,
        createdAt: row.createdAt,
        updatedAt: Date.now(),
      })
    }
    return { kind: 'withdrawn', requestRef: row.requestRef }
  },
})

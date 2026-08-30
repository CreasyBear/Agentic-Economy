import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v, type Infer } from 'convex/values'

import { mutation } from './_generated/server'
import {
  agentAccessPrincipalValue,
  verifyMarketAgentPrincipal,
} from './agentAccessPrincipals'
import { requireSourceWrite, sourceWriteArgs } from './sourceWriteAdmission'
import { canonicalDigest } from '@/modules/common/canonical-digest'

const demandSignalValue = v.object({
  requestRef: v.string(),
  query: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const requestFields = {
  agentPrincipal: agentAccessPrincipalValue,
  operationKey: v.string(),
  correlationId: v.string(),
  ...sourceWriteArgs,
} as const

const recordArgsValue = v.object({
  query: v.string(),
  idempotencyKey: v.string(),
  ...requestFields,
})

const recordResultValue = v.union(
  v.object({
    kind: v.union(v.literal('recorded'), v.literal('replayed')),
    requestRef: v.string(),
    query: v.string(),
    createdAt: v.number(),
  }),
  v.object({
    kind: v.literal('refused'),
    code: v.union(
      v.literal('unauthenticated'),
      v.literal('invalid_request'),
      v.literal('idempotency_conflict'),
    ),
  }),
)

const listArgsValue = v.object({
  paginationOpts: paginationOptsValidator,
  ...requestFields,
})

const listResultValue = v.union(
  v.object({ kind: v.literal('available'), requests: paginationResultValidator(demandSignalValue) }),
  v.object({ kind: v.literal('error'), code: v.union(v.literal('unauthenticated'), v.literal('source_unavailable')) }),
)

const readArgsValue = v.object({
  requestRef: v.string(),
  ...requestFields,
})

const readResultValue = v.union(
  v.object({ kind: v.literal('found'), request: demandSignalValue }),
  v.object({ kind: v.literal('not_found') }),
  v.object({ kind: v.literal('error'), code: v.literal('unauthenticated') }),
)

async function admit(
  ctx: Parameters<typeof verifyMarketAgentPrincipal>[0],
  args: Infer<typeof recordArgsValue> | Infer<typeof listArgsValue> | Infer<typeof readArgsValue>,
) {
  const source = await requireSourceWrite(ctx, args, 'protected_action')
  if (source.kind === 'rejected') return null
  const principal = await verifyMarketAgentPrincipal(ctx, args.agentPrincipal)
  return principal.kind === 'allowed' ? principal : null
}

export const record = mutation({
  args: recordArgsValue.fields,
  returns: recordResultValue,
  handler: async (ctx, args): Promise<Infer<typeof recordResultValue>> => {
    const principal = await admit(ctx, args)
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
    const requestRef = `market-request:v1:${canonicalDigest({
      principalId: principal.principalId,
      credentialId: args.agentPrincipal.credentialId,
      idempotencyKey,
    }).replace('sha256:', '')}`
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

export const list = mutation({
  args: listArgsValue.fields,
  returns: listResultValue,
  handler: async (ctx, args): Promise<Infer<typeof listResultValue>> => {
    const principal = await admit(ctx, args)
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
        page: requests.page.map((row) => ({
          requestRef: row.requestRef,
          query: row.query,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        })),
      },
    }
  },
})

export const read = mutation({
  args: readArgsValue.fields,
  returns: readResultValue,
  handler: async (ctx, args): Promise<Infer<typeof readResultValue>> => {
    const principal = await admit(ctx, args)
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

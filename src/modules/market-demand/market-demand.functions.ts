import { auth } from '@clerk/tanstack-react-start/server'
import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import { callSourceMutation, callSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { sourceWriteAdmissionFromContext, sourceWriteRequestFromAdmission } from '@/lib/server/source-write-admission'
import { idempotencyKeySchema } from '@/modules/common/action'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { publicToolChoiceSchema, toolCatalogFiltersSchema, type SearchEnvelope } from '@/modules/registry/tool-choice-contracts'
import { registryToolsCompareAction, registryToolsSearchAction } from '@/modules/registry/tools.actions'
import {
  MARKET_REQUEST_ACTIVE_WINDOW_MS,
  marketRequestStatusResultSchema,
  recheckMarketDemandNoMatch,
  type MarketRequestStatusResult,
} from './market-demand.actions'

const recordInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(200),
  idempotencyKey: idempotencyKeySchema,
  source: z.enum(['current', 'coinbase']).optional(),
  filters: toolCatalogFiltersSchema.optional(),
})
const findInputSchema = recordInputSchema.omit({ idempotencyKey: true })
const requestInputSchema = z.strictObject({ requestRef: z.string().trim().min(1).max(300) })
const listInputSchema = z.strictObject({ numItems: z.number().int().min(1).max(100).default(20), cursor: z.string().optional() })

export type OwnerMarketDemandRequest = Readonly<{
  requestRef: string
  query: string
  source?: 'current' | 'coinbase'
  filters?: z.infer<typeof toolCatalogFiltersSchema>
  createdAt: number
  updatedAt: number
}>
export type OwnerMarketDemandRecordResult =
  | Readonly<{ kind: 'recorded' | 'replayed'; requestRef: string; query: string; createdAt: number }>
  | Readonly<{ kind: 'refused'; code: 'unauthenticated' | 'invalid_request' | 'idempotency_conflict' | 'current_match_exists' | 'source_unavailable' }>
export type OwnerMarketDemandListResult =
  | Readonly<{ kind: 'available'; requests: { page: OwnerMarketDemandRequest[]; isDone: boolean; continueCursor: string } }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable' | 'invalid_cursor' }>
type OwnerMarketDemandReadResult =
  | Readonly<{ kind: 'found'; request: OwnerMarketDemandRequest }>
  | Readonly<{ kind: 'withdrawn' }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }>
export type OwnerMarketDemandFindResult =
  | Readonly<{ kind: 'found'; request: OwnerMarketDemandRequest }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'invalid_request' }>
export type OwnerMarketDemandStatusResult = MarketRequestStatusResult
export type OwnerMarketDemandWithdrawResult =
  | Readonly<{ kind: 'withdrawn'; requestRef: string }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'error'; code: 'unauthenticated' | 'source_unavailable' }>

/** The public verdict alone never authorizes writing demand; the server repeats this exact assessment. */
export function isExhaustiveMarketNoMatch(result: SearchEnvelope): boolean {
  return result.kind === 'noMatch'
    && result.assessed.scope === 'complete'
    && result.assessed.coverage === 'complete'
    && !result.partialResults
    && !result.pagination.hasMore
}

const ownerReplay = sourceQuery<z.infer<typeof recordInputSchema>,
  | Readonly<{ kind: 'replayed'; requestRef: string; query: string; createdAt: number }>
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'refused'; code: 'invalid_request' | 'idempotency_conflict' | 'unauthenticated' }>
>('marketDemandSignals:ownerReplay')
const ownerRecord = sourceMutation<Record<string, unknown>, OwnerMarketDemandRecordResult>('marketDemandSignals:ownerRecord')
const ownerList = sourceQuery<{ paginationOpts: { numItems: number; cursor: string | null } }, OwnerMarketDemandListResult>('marketDemandSignals:ownerList')
const ownerRead = sourceQuery<{ requestRef: string }, OwnerMarketDemandReadResult>('marketDemandSignals:ownerRead')
const ownerFindActive = sourceQuery<z.infer<typeof findInputSchema>, OwnerMarketDemandFindResult>('marketDemandSignals:ownerFindActive')
const ownerWithdraw = sourceMutation<Record<string, unknown>, OwnerMarketDemandWithdrawResult>('marketDemandSignals:ownerWithdraw')

export const recordOwnerMarketDemand = createServerFn({ method: 'POST' })
  .validator((data) => recordInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerMarketDemandRecordResult> => {
    setResponseHeader('cache-control', 'private, no-store')
    const identity = await auth()
    if (!identity.isAuthenticated || identity.userId === null) return { kind: 'refused', code: 'unauthenticated' }
    const replay = await callSourceQuery(ownerReplay, data)
    if (replay.kind !== 'not_found') return replay
    const assessed = await recheckMarketDemandNoMatch(getRequest(), {
      query: data.query,
      ...(data.source === undefined ? {} : { source: data.source }),
      ...(data.filters === undefined ? {} : { filters: data.filters }),
    })
    if (assessed !== 'no_match') return { kind: 'refused', code: assessed }
    const operationKey = canonicalDigest({
      action: 'marketDemand.ownerRecord',
      ownerId: identity.userId,
      query: data.query,
      idempotencyKey: data.idempotencyKey,
      source: data.source ?? null,
      filters: data.filters ?? null,
    })
    const correlationId = globalThis.crypto.randomUUID()
    const command = { ...data, operationKey, correlationId }
    const sourceWrite = await sourceWriteAdmissionFromContext({ context, command, scope: 'protected_action', operationKey, correlationId })
    return await callSourceMutation(ownerRecord, { ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) })
  })

export const listOwnerMarketDemand = createServerFn({ method: 'POST' })
  .validator((data) => listInputSchema.parse(data))
  .handler(async ({ data }): Promise<OwnerMarketDemandListResult> => {
    setResponseHeader('cache-control', 'private, no-store')
    const identity = await auth()
    if (!identity.isAuthenticated || identity.userId === null) return { kind: 'error', code: 'unauthenticated' }
    return await callSourceQuery(ownerList, { paginationOpts: { numItems: data.numItems, cursor: data.cursor ?? null } })
  })

export const findOwnerActiveMarketDemand = createServerFn({ method: 'POST' })
  .validator((data) => findInputSchema.parse(data))
  .handler(async ({ data }): Promise<OwnerMarketDemandFindResult> => {
    setResponseHeader('cache-control', 'private, no-store')
    const identity = await auth()
    if (!identity.isAuthenticated || identity.userId === null) return { kind: 'error', code: 'unauthenticated' }
    return await callSourceQuery(ownerFindActive, data)
  })

export const getOwnerMarketDemandStatus = createServerFn({ method: 'POST' })
  .validator((data) => requestInputSchema.parse(data))
  .handler(async ({ data }): Promise<OwnerMarketDemandStatusResult> => {
    setResponseHeader('cache-control', 'private, no-store')
    const identity = await auth()
    if (!identity.isAuthenticated || identity.userId === null) return { kind: 'error', code: 'unauthenticated' }
    const first = await callSourceQuery(ownerRead, data)
    if (first.kind === 'not_found' || first.kind === 'withdrawn') return { kind: 'not_found' }
    if (first.kind !== 'found') return { kind: 'error', code: first.code }
    const saved = first.request
    const expiresAt = saved.createdAt + MARKET_REQUEST_ACTIVE_WINDOW_MS
    if (saved.createdAt > Date.now()) return { kind: 'error', code: 'source_unavailable' }
    if (Date.now() >= expiresAt) return { kind: 'not_found' }
    const request = getRequest()
    const search = await registryToolsSearchAction.run({
      data: registryToolsSearchAction.schema.parse({
        query: saved.query,
        ...(saved.source === undefined ? {} : { source: saved.source }),
        ...(saved.filters === undefined ? {} : { filters: saved.filters }),
        limit: 12,
      }),
      context: { caller: 'http', request },
    })
    if (search.kind === 'unavailable'
      || (saved.source !== undefined && search.assessed.source !== saved.source)) {
      return { kind: 'error', code: 'source_unavailable' }
    }
    const candidates = search.results.flatMap((row) =>
      row.access === 'ae_callable' && row.toolRef !== undefined
        ? [{ ...row, toolRef: row.toolRef }]
        : []).slice(0, 3)
    const tools: z.infer<typeof publicToolChoiceSchema>[] = []
    if (candidates.length > 0) {
      const compared = await registryToolsCompareAction.run({
        data: registryToolsCompareAction.schema.parse({ toolRefs: candidates.map((row) => row.toolRef) }),
        context: { caller: 'http', request },
      })
      if (compared.kind !== 'ok' || compared.tools.length !== candidates.length) {
        return { kind: 'error', code: 'source_unavailable' }
      }
      const byRef = new Map(compared.tools.map((tool) => [tool.toolRef, tool]))
      for (const candidate of candidates) {
        const live = byRef.get(candidate.toolRef)
        if (live === undefined || Array.from(live.title).slice(0, 72).join('') !== candidate.title
          || Array.from(live.provider.name).slice(0, 48).join('') !== candidate.provider
          || Array.from(live.description).slice(0, 100).join('') !== candidate.summary) {
          return { kind: 'error', code: 'source_unavailable' }
        }
        tools.push(live)
      }
    }
    const second = await callSourceQuery(ownerRead, data)
    if (second.kind === 'not_found' || second.kind === 'withdrawn') return { kind: 'not_found' }
    if (second.kind !== 'found') return { kind: 'error', code: second.code }
    const latest = second.request
    if (latest.requestRef !== saved.requestRef || latest.query !== saved.query
      || latest.createdAt !== saved.createdAt || latest.updatedAt !== saved.updatedAt
      || canonicalDigest({ source: latest.source ?? null, filters: latest.filters ?? null })
        !== canonicalDigest({ source: saved.source ?? null, filters: saved.filters ?? null })) {
      return { kind: 'error', code: 'source_unavailable' }
    }
    if (Date.now() >= expiresAt) return { kind: 'not_found' }
    if (tools.length === 0) {
      if (!isExhaustiveMarketNoMatch(search) && search.kind !== 'match') {
        return { kind: 'error', code: 'source_unavailable' }
      }
      if (search.assessed.coverage !== 'complete' || search.assessed.scope !== 'complete'
        || search.partialResults || search.pagination.hasMore) return { kind: 'error', code: 'source_unavailable' }
      return { kind: 'open', requestRef: saved.requestRef, query: saved.query, createdAt: saved.createdAt, matchedCount: 0 }
    }
    return marketRequestStatusResultSchema.parse({
      kind: 'matched', requestRef: saved.requestRef, query: saved.query, createdAt: saved.createdAt,
      matchedCount: tools.length, tools,
    })
  })

export const withdrawOwnerMarketDemand = createServerFn({ method: 'POST' })
  .validator((data) => requestInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerMarketDemandWithdrawResult> => {
    setResponseHeader('cache-control', 'private, no-store')
    const identity = await auth()
    if (!identity.isAuthenticated || identity.userId === null) return { kind: 'error', code: 'unauthenticated' }
    const operationKey = canonicalDigest({ action: 'marketDemand.ownerWithdraw', ownerId: identity.userId, requestRef: data.requestRef })
    const correlationId = globalThis.crypto.randomUUID()
    const command = { ...data, operationKey, correlationId }
    const sourceWrite = await sourceWriteAdmissionFromContext({ context, command, scope: 'protected_action', operationKey, correlationId })
    return await callSourceMutation(ownerWithdraw, { ...command, sourceWrite, sourceWriteRequest: sourceWriteRequestFromAdmission(sourceWrite) })
  })

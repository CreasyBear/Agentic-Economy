"use node"

import { listX402DiscoveryResources, searchX402Resources } from '@coinbase/cdp-sdk'
import { readBoundedRequestJson } from '@/lib/server/bounded-request-body'
import { CURRENT_TOOL_PROJECTION_NAVIGATION } from '@/modules/actions/contract'
import { isRecord } from '@/modules/common/is-record'
import { admitFacilitatorDiscoveryItems } from '@/modules/capability-supply/server'
import {
  deserializeToolDetailResult, deserializeToolSearchResult, serializeToolSearchResult,
  deserializeToolCompareResult, serializeToolDetailResult, serializeToolCompareResult,
  noToolNavigation, matchesToolFilters, normalizeToolSearchInput, toolSearchInputSchema,
  type ToolSearchResult, type ToolSearchWireResult, type ToolSearchInput,
  type PublicToolDescriptor, type ToolDetailWireResult, type ToolCompareWireResult,
} from '@/modules/capability-supply/public'
import { fetchCoinbaseReferenceRate } from '@/modules/money/reference-rate'
import { quoteManagedX402BuyerAud } from '@/modules/money/public'
import { api, internal } from './_generated/api'
import { action, type ActionCtx } from './_generated/server'
import { publicSearchReturns, searchArgs, publicDetailReturns, publicCompareReturns, toolRefArgs, compareArgs } from './capabilitySupplyToolQueries'
import { bindWorkloadCronActionContext } from './workloadCron'

const PAGE_LIMIT = 20
const TIMEOUT_MS = 10_000
const navigation = noToolNavigation(CURRENT_TOOL_PROJECTION_NAVIGATION)
const unavailable = (reason: 'query_invalid' | 'source_unavailable'): ToolSearchResult => ({ kind: 'unavailable', schemaVersion: 'registry-tools:v1', reason, navigation })

/** Use the SDK's discovery contracts; upstream offsets remain the continuation. */
export async function fetchCatalogPage(input: ToolSearchInput): Promise<Readonly<{ items: readonly unknown[]; nextCursor?: string; partialResults?: boolean; limit: number }>> {
  const limit = Math.min(input.limit ?? PAGE_LIMIT, PAGE_LIMIT)
  const offset = input.cursor === undefined ? 0 : Number(input.cursor)
  if (!Number.isSafeInteger(offset) || offset < 0 || (input.cursor !== undefined && String(offset) !== input.cursor)) throw new Error('catalog_cursor_invalid')
  if (input.source === 'coinbase') {
    if (input.query.trim().length > 0) {
      if (offset !== 0) throw new Error('catalog_search_has_no_cursor')
      const result = await searchX402Resources({ query: input.query, limit, scheme: 'exact' })
      return { items: result.resources, partialResults: result.partialResults, limit }
    }
    // Coinbase rounds offsets down to its native 20-item page boundary.
    // Retain the caller's position within that page for smaller result limits.
    const pageOffset = Math.floor(offset / PAGE_LIMIT) * PAGE_LIMIT
    const result = await listX402DiscoveryResources({ type: 'http', limit: PAGE_LIMIT, offset: pageOffset })
    if (result.pagination.offset !== undefined && result.pagination.offset !== pageOffset) throw new Error('catalog_source_position_invalid')
    const withinPage = offset - pageOffset
    const items = result.items.slice(withinPage, withinPage + limit)
    const next = offset + items.length
    const more = result.pagination.total === undefined ? withinPage + items.length < result.items.length || result.items.length >= PAGE_LIMIT : next < result.pagination.total
    return { items, limit, ...(more && next > offset ? { nextCursor: String(next) } : {}) }
  }
  if (input.query.trim().length > 0) throw new Error('payai_browse_only')
  const url = new URL('https://facilitator.payai.network/discovery/resources')
  url.searchParams.set('limit', String(limit))
  url.searchParams.set('offset', String(offset))
  const response = await fetch(url, { redirect: 'error', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error('catalog_source_unavailable')
  const body = await readBoundedRequestJson(response, 2_097_152)
  if (!body.ok || !isRecord(body.value) || !Array.isArray(body.value.items) || body.value.items.length > limit) throw new Error('catalog_source_invalid')
  const pagination = isRecord(body.value.pagination) ? body.value.pagination : undefined
  const total = pagination?.total
  const next = offset + body.value.items.length
  const more = typeof total === 'number' && Number.isSafeInteger(total) ? next < total : body.value.items.length === limit
  return { items: body.value.items, limit, ...(more && next > offset ? { nextCursor: String(next) } : {}) }
}

async function decorateTools(ctx: ActionCtx, items: readonly PublicToolDescriptor[]): Promise<readonly PublicToolDescriptor[]> {
  if (!items.some((item) => item.payment?.protocol === 'x402')) return items
  const sources = await ctx.runQuery(internal.capabilityToolCatalogData.priceSources, { toolRefs: items.map((item) => item.toolRef) })
  const referenceRate = await fetchCoinbaseReferenceRate()
  const observedAt = Date.now()
  return items.map((item) => {
    if (item.payment?.protocol !== 'x402') return item
    const source = sources.find((candidate) => candidate.toolRef === item.toolRef)
    const quotation = source === undefined || referenceRate === undefined ? undefined : quoteManagedX402BuyerAud({ environment: source.environment, requiredUsdcAtomicUnits: source.atomicUnits, observedAt, referenceRate })
    const displayPrice = quotation?.kind === 'quoted'
      ? { kind: 'indicative' as const, amount: quotation.evidence.sourceAmount, rateObservedAt: quotation.evidence.observedAt, validUntil: quotation.evidence.expiresAt }
      : { kind: 'unavailable' as const, reason: source === undefined ? 'upstream_price_missing' as const : 'fx_missing' as const }
    return { ...item, commercial: { ...item.commercial, displayPrice } }
  })
}

async function decorate(ctx: ActionCtx, result: ToolSearchResult): Promise<ToolSearchResult> {
  return result.kind === 'ok' ? { ...result, items: await decorateTools(ctx, result.items) } : result
}

export const search = action({
  args: searchArgs,
  returns: publicSearchReturns,
  handler: async (ctx, args): Promise<ToolSearchWireResult> => {
    const parsed = toolSearchInputSchema.safeParse(args)
    const normalized = parsed.success ? normalizeToolSearchInput({ ...parsed.data, limit: parsed.data.limit ?? 20 }) : undefined
    if (normalized === undefined) return serializeToolSearchResult(unavailable('query_invalid'))
    const input: ToolSearchInput = { ...args, ...normalized }
    if (input.source === undefined || input.source === 'current') {
      const result: ToolSearchWireResult = await ctx.runQuery(api.capabilitySupplyTools.search, args)
      return serializeToolSearchResult(await decorate(ctx, deserializeToolSearchResult(result)))
    }
    if ((input.source === 'payai' && input.query.trim().length > 0) || (input.query.trim().length > 0 && input.cursor !== undefined)) return serializeToolSearchResult(unavailable('query_invalid'))
    if (input.cursor !== undefined && (!/^(0|[1-9]\d*)$/u.test(input.cursor) || !Number.isSafeInteger(Number(input.cursor)))) return serializeToolSearchResult(unavailable('query_invalid'))
    let page: Awaited<ReturnType<typeof fetchCatalogPage>>
    try { page = await fetchCatalogPage(input) } catch { return serializeToolSearchResult(unavailable('source_unavailable')) }
    const workload = await ctx.runQuery(internal.workloadCron.admit, { name: 'refresh facilitator discovery' })
    const authorized = bindWorkloadCronActionContext(ctx, { name: 'refresh facilitator discovery', snapshot: workload })
    const refs = new Set<string>()
    // Isolate invalid candidates: one refused publication never discards its page.
    for (const candidate of page.items.slice(0, PAGE_LIMIT)) {
      try {
        const admission = await admitFacilitatorDiscoveryItems([candidate])
        if (admission.admitted.length === 0) continue
        const result = await authorized.runMutation(internal.facilitatorDiscovery.reconcile, { items: [...structuredClone(admission.admitted)], complete: false, deadlineAt: Date.now() + TIMEOUT_MS, workload })
        for (const ref of result.toolRefs) refs.add(ref)
      } catch {
        // Candidate failure may be isolated; revoked workload authority may not.
        await ctx.runQuery(internal.workloadCron.reconcile, { name: 'refresh facilitator discovery', snapshot: workload })
      }
    }
    const selectedRefs = input.filters?.networkId === undefined ? [...refs] : await ctx.runQuery(internal.capabilityToolCatalogData.filterNetwork, { toolRefs: [...refs], networkId: input.filters.networkId })
    const details = await Promise.all(selectedRefs.map((toolRef) => ctx.runQuery(api.capabilitySupplyTools.detail, { toolRef })))
    const items = details.flatMap((wire) => {
      const detail = deserializeToolDetailResult(wire)
      return detail.kind === 'found' && matchesToolFilters(detail.tool, input.filters ?? {}) ? [detail.tool] : []
    })
    return serializeToolSearchResult(await decorate(ctx, { kind: 'ok', schemaVersion: 'registry-tools:v1', query: input.query, items, ranking: [], pagination: { limit: page.limit, hasMore: page.nextCursor !== undefined, ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }) }, ...(page.partialResults === undefined ? {} : { partialResults: page.partialResults }), navigation }))
  },
})


export const detail = action({
  args: toolRefArgs,
  returns: publicDetailReturns,
  handler: async (ctx, args): Promise<ToolDetailWireResult> => {
    const wire: ToolDetailWireResult = await ctx.runQuery(api.capabilitySupplyTools.detail, args)
    const result = deserializeToolDetailResult(wire)
    if (result.kind !== 'found') return wire
    const [tool] = await decorateTools(ctx, [result.tool])
    return tool === undefined ? wire : serializeToolDetailResult({ ...result, tool })
  },
})

export const compare = action({
  args: compareArgs,
  returns: publicCompareReturns,
  handler: async (ctx, args): Promise<ToolCompareWireResult> => {
    const wire: ToolCompareWireResult = await ctx.runQuery(api.capabilitySupplyTools.compare, args)
    const result = deserializeToolCompareResult(wire)
    if (result.kind !== 'ok') return wire
    return serializeToolCompareResult({ ...result, tools: await decorateTools(ctx, result.tools) })
  },
})

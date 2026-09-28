import { createTool, type ToolCtx } from '@convex-dev/agent'
import type { ModelMessage } from 'ai'
import type { FunctionArgs } from 'convex/server'
import { z } from 'zod'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { deserializeToolSearchResult, serializeToolSearchResult, PublicToolRegistrySchemaVersion, type PublicToolDescriptor, type ToolSearchResult } from '@/modules/capability-supply/public'
import { latestUserRequest } from '@/modules/chat/search-presentation'
import { CHAT_TOOL_NAME_MAP } from '@/modules/chat/tool-card'
import { projectToolListChoices, projectToolSearchChoices, type SearchResult, type ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import { lexicalToolMatch } from '@/modules/registry/tool-reranker'
import { isProductionToolChoice, suitableRankedToolRefs } from '@/modules/registry/public'
import { registryToolsListContract, registryToolsSearchContract } from '@/modules/registry/tool-action-contracts'
import { api, internal } from '../../../_generated/api'
import { descriptionFor, failure, type ReserveChatSearch, type ReserveChatTool } from './contracts'
import { projectedModelFacingOutput } from './output'

type CapabilitySearchFilters = FunctionArgs<typeof api.capabilitySupplyTools.search>['filters']

function operationSourceFilters(filters: z.infer<typeof registryToolsSearchContract.schema>['filters']): CapabilitySearchFilters | undefined {
  if (filters === undefined) return undefined
  return {
    ...(filters.networkId === undefined ? {} : { networkId: filters.networkId }),
    ...(filters.location === undefined ? {} : { location: filters.location }),
    ...(filters.effects === undefined ? {} : { effects: [...filters.effects] }),
    ...(filters.dataUse === undefined ? {} : { dataUse: [...filters.dataUse] }),
    ...(filters.currency === undefined ? {} : { currency: filters.currency }),
    ...(filters.maximumPrice === undefined ? {} : { maximumPrice: filters.maximumPrice }),
  }
}

type SearchInput = z.infer<typeof registryToolsSearchContract.schema>

/** Chat and Market must start from the same native indexed, query-scoped read. */
async function admittedCandidates(ctx: ToolCtx, data: SearchInput, filters: CapabilitySearchFilters | undefined): Promise<{
  result: ToolSearchResult
  complete: boolean
}> {
  if (data.source === 'coinbase' || data.cursor?.startsWith('x402:')) {
    return {
      result: { kind: 'no_candidates', schemaVersion: PublicToolRegistrySchemaVersion, query: data.query,
        appliedFilters: filters ?? {}, ranking: [], navigation: [] },
      complete: true,
    }
  }
  const result = deserializeToolSearchResult(await ctx.runAction(internal.capabilityToolCatalog.searchInternal, {
    ...(filters === undefined ? {} : { filters }), source: 'current',
    query: data.query, limit: data.limit,
    ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
  }))
  return { result, complete: result.kind === 'no_candidates' ||
    result.kind === 'ok' && !result.pagination.hasMore && result.partialResults !== true }
}

/** Compact external listings are discovery leads, never unverified recommendations or AE Call targets. */
async function compactBazaarPage(ctx: ToolCtx, data: SearchInput): Promise<{
  rows: SearchResult[]
  examined: number
  available: boolean
  hasMore: boolean
  nextCursor?: string
  generation?: string
  completedAt?: number
}> {
  if (data.source === 'current' || data.filters?.access === 'ae_callable') {
    return { rows: [], examined: 0, available: true, hasMore: false }
  }
  const page = await ctx.runQuery(internal.x402DirectoryIndex.searchCompactInternal, {
      query: data.query,
      paginationOpts: { cursor: data.cursor?.startsWith('x402:') ? data.cursor.slice(5) || null : null, numItems: data.limit },
      ...(data.filters?.priceBand === undefined ? {} : { priceBand: data.filters.priceBand }),
      ...(data.filters?.actionClass === undefined ? {} : { actionClass: data.filters.actionClass }),
      ...(data.filters?.objectClass === undefined ? {} : { objectClass: data.filters.objectClass }),
      ...(data.filters?.category === undefined ? {} : { category: data.filters.category }),
      ...(data.filters?.provider === undefined ? {} : { provider: data.filters.provider }),
      ...(data.filters?.networkId === undefined ? {} : { network: data.filters.networkId }),
      access: data.filters?.access ?? 'external_listing',
    }).catch(cause => degradeBackend(cause, { kind: 'unavailable' as const, reason: 'source_unavailable' }, {
      site: 'chatCompactBazaarSearch', reason: 'source_unavailable',
    }))
  if (page.kind === 'unavailable') return { rows: [], examined: 0, available: false, hasMore: false }
  const rows: SearchResult[] = page.page.flatMap(row => {
    if (row.source !== 'coinbase' || row.toolRef !== undefined) return []
    return [{
      id: row.id, source: 'coinbase', access: 'external_listing',
      title: row.title, summary: row.summary, provider: row.provider,
      actionClass: row.actionClass, objectClass: row.objectClass,
      ...(row.category === undefined ? {} : { category: row.category }),
      readiness: 'unverified', price: { kind: 'unavailable' },
      detailRef: row.id,
      next: [{ action: 'describe-external', args: { id: row.id }, authority: 'public' }],
    }]
  })
  return {
    rows, examined: page.page.length, available: true, hasMore: !page.isDone,
    ...(page.isDone ? {} : { nextCursor: `x402:${page.continueCursor}` }),
    generation: page.coverage.generation, completedAt: page.coverage.completedAt,
  }
}

async function signNextPage(
  ctx: ToolCtx,
  page: ToolChoiceSearchOutput,
  data: SearchInput,
  searchTurn?: Readonly<{ turnRef: string; threadId: string; promptMessageId: string }>,
): Promise<ToolChoiceSearchOutput> {
  const nativeCursor = page.pagination.nextCursor
  if (searchTurn === undefined || nativeCursor === undefined || !page.pagination.hasMore) return page
  const token = await ctx.runMutation(internal.chatTurns.issueSearchPage, {
    ...searchTurn, query: data.query, cursor: nativeCursor,
    inputJson: JSON.stringify({ source: data.source, filters: data.filters, limit: data.limit }),
  })
  const pagination = { ...page.pagination, nextCursor: token }
  return { ...page, pagination, next: page.next.map(action =>
    action.action === 'next-page' ? { ...action, args: { ...action.args, cursor: token } } : action) }
}

export function createSearchTools(
  reserve: ReserveChatTool,
  reserveSearch: ReserveChatSearch,
  continuation?: Readonly<{ query: string; cursor: string; inputJson?: string }>,
  searchTurn?: Readonly<{ turnRef: string; threadId: string; promptMessageId: string }>,
  onSearchOutput?: (toolCallId: string, output: unknown) => void,
) {
  const listContract = registryToolsListContract
  const searchContract = registryToolsSearchContract
  return {
    [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.list']]: createTool({
      description: descriptionFor(listContract),
      inputSchema: listContract.schema,
      execute: async (ctx: ToolCtx, input: unknown, options: { messages?: ModelMessage[] }) => {
        const data = listContract.schema.parse(input)
        const denied = reserve('registry.tools.list')
        if (denied !== null) return denied
        const deniedSearch = reserveSearch('registry.tools.list', 'list', data.cursor, latestUserRequest(options.messages))
        if (deniedSearch !== null) return deniedSearch
        const filters = operationSourceFilters(data.filters)
        const result = await ctx.runAction(internal.capabilityToolCatalog.searchInternal, {
          query: '',
          limit: data.limit,
          ...(data.source === undefined ? {} : { source: data.source }),
          ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
          ...(filters === undefined ? {} : { filters }),
        })
        return projectedModelFacingOutput(
          'registry.tools.list',
          listContract.outputSchema,
          () => projectToolListChoices(deserializeToolSearchResult(result), data.filters),
        )
      },
    }),
    [CHAT_TOOL_NAME_MAP.canonicalToProvider['registry.tools.search']]: createTool({
      description: descriptionFor(searchContract),
      inputSchema: continuation === undefined ? searchContract.schema : z.strictObject({}),
      // The card keeps its signed cursor; the model never receives a cursor it could echo as prose.
      toModelOutput: (_ctx, { output }) => ({
        type: 'text',
        value: JSON.stringify(output, (key, value) => key === 'cursor' || key === 'nextCursor' ? undefined : value),
      }),
      execute: async (ctx: ToolCtx, input: unknown, options: { messages?: ModelMessage[]; toolCallId: string }) => {
        const data = searchContract.schema.parse(continuation === undefined ? input : {
          ...(continuation.inputJson === undefined ? {} : JSON.parse(continuation.inputJson)),
          query: continuation.query, cursor: continuation.cursor,
        })
        const denied = reserve('registry.tools.search')
        if (denied !== null) return denied
        const request = continuation === undefined ? latestUserRequest(options.messages) : `Show more results for ${data.query}`
        const key = data.query.toLowerCase().replace(/\b(?:apis?|for|an?|the|in|of|me)\b/gu, ' ')
          .replace(/\b(\w+)s\b/gu, '$1').split(/\W+/u).filter(Boolean).sort().join(' ')
        const deniedSearch = reserveSearch('registry.tools.search', key, data.cursor, request)
        if (deniedSearch !== null) return deniedSearch
        const filters = operationSourceFilters(data.filters)
        try {
          const externalCursor = data.cursor?.startsWith('x402:') === true
          let pageSize = data.limit
          let externalLimit: number | undefined
          let admitted = await admittedCandidates(ctx, data, filters)
          let assessedSource: ToolSearchResult | undefined
          let assessedPresentation: ToolSearchResult | null = null
          const encoder = new TextEncoder()
          while (true) {
            const source = admitted.result
            const presented: ToolSearchResult | null = assessedSource === source ? assessedPresentation
              : source.kind === 'ok' && source.items.length > 0
                ? await ctx.runAction(internal.capabilityToolCatalog.presentSearch, {
                    result: serializeToolSearchResult(source), query: data.query,
                    ...(request === undefined ? {} : { request }),
                  }).then(value => deserializeToolSearchResult(value.result)).catch(cause => {
                    degradeBackend(cause, undefined, { site: 'chatToolSearchRerank', reason: 'source_unavailable' })
                    return source
                  })
                : source
            assessedSource = source
            assessedPresentation = presented
            const ranked = presented?.kind === 'ok' && presented.ranking.length > 0
              && source.kind === 'ok' && source.items.every(tool =>
                presented.ranking.some(({ toolRef }) => toolRef === tool.toolRef))
            const explicitNonProduction = /\b(?:testnet|sepolia|degraded|demo|sandbox)\b/iu.test(request ?? '')
            const eligible = (tool: PublicToolDescriptor) =>
              explicitNonProduction || isProductionToolChoice(tool)
            const suitable = new Set(ranked && presented.kind === 'ok' ? suitableRankedToolRefs(presented.ranking) : [])
            const narrowed = presented?.kind === 'ok'
              ? { ...presented, items: presented.items.filter(tool => eligible(tool)
                && (ranked ? suitable.has(tool.toolRef) : lexicalToolMatch(data.query, tool.listing.label, tool.summary))) }
              : presented
            const assessment = { verdict: narrowed?.kind === 'ok' && narrowed.items.length > 0
              ? 'matched' as const : 'noMatch' as const,
            nearMisses: [] }
            const admittedPage = narrowed
            const admittedCount = admittedPage?.kind === 'ok' ? admittedPage.items.length : 0
            const admittedNext = narrowed?.kind === 'ok' && narrowed.pagination.hasMore
              ? narrowed.pagination.nextCursor : undefined
            const directoryWanted = data.source !== 'current' && data.filters?.access !== 'ae_callable'
            const room = pageSize - admittedCount
            // Re-read a smaller Bazaar page rather than truncating an already-fetched cursor.
            const external = source.kind !== 'unavailable'
              && admittedNext === undefined && room > 0
              && (externalLimit === undefined || externalLimit > 0)
              ? await compactBazaarPage(ctx, { ...data, limit: Math.min(room, externalLimit ?? room) })
              : { rows: [] as SearchResult[], examined: 0, available: true, hasMore: false }
            const externalStartsNext = admittedNext === undefined && admittedCount > 0
              && directoryWanted && !externalCursor && (room === 0 || externalLimit === 0)
            const pagination = admittedNext !== undefined
              ? { limit: data.limit, nextCursor: admittedNext, hasMore: true }
              : externalStartsNext
                ? { limit: data.limit, nextCursor: 'x402:', hasMore: true }
                : external.hasMore && external.nextCursor !== undefined
                  ? { limit: data.limit, nextCursor: external.nextCursor, hasMore: true }
                  : { limit: data.limit, hasMore: false }
            const empty: ToolSearchResult = {
              kind: 'no_candidates', schemaVersion: PublicToolRegistrySchemaVersion,
              query: data.query, appliedFilters: filters ?? {}, ranking: [], navigation: [],
            }
            const choices = projectToolSearchChoices(admittedPage ?? empty,
              data.filters, assessment, undefined, data.limit, {
                query: data.query,
                source: data.source === 'current' ? 'current' : data.source === 'coinbase' ? 'coinbase' : 'all',
                complete: (data.source === 'coinbase' || admitted.complete)
                  && (data.source === 'current' || data.filters?.access === 'ae_callable'
                    || external.available && !external.hasMore),
                external: external.rows,
                externalExamined: external.examined,
                pagination,
                ...(external.generation === undefined ? {} : { generation: external.generation }),
                ...(external.completedAt === undefined ? {} : { completedAt: external.completedAt }),
              })
            const output = choices.kind === 'match' && admittedCount === 0
              ? { ...choices, kind: 'scoped' as const, reason: 'External listings require inspection before choosing a Tool.' }
              : choices
            // The model-facing sanitizer expands angle brackets to UTF-8 glyphs.
            if (encoder.encode(JSON.stringify(output).replace(/[<>]/gu, '‹')).byteLength <= 16 * 1024) {
              const signed = await signNextPage(ctx, output, data, searchTurn)
              const projected = projectedModelFacingOutput('registry.tools.search', searchContract.outputSchema, () => signed)
              onSearchOutput?.(options.toolCallId, projected)
              return projected
            }
            if (external.rows.length > 0) {
              externalLimit = Math.min(room, externalLimit ?? room) - 1
              if (externalLimit > 0 || admittedCount > 0) continue
            } else if (admittedCount > 1) {
              pageSize -= 1
              externalLimit = undefined
              if (!admitted.complete) {
                admitted = { result: deserializeToolSearchResult(await ctx.runAction(internal.capabilityToolCatalog.searchInternal, {
                  source: 'current', query: data.query, limit: pageSize,
                  ...(filters === undefined ? {} : { filters }),
                  ...(data.cursor === undefined ? {} : { cursor: data.cursor }),
                })), complete: false }
              }
              continue
            }
            return projectedModelFacingOutput('registry.tools.search', searchContract.outputSchema, () => ({
              ...choices, kind: 'unavailable', reason: 'capacity_exceeded', results: [], partialResults: true,
              pagination: { limit: data.limit, hasMore: false },
              next: [{ action: 'retry', args: { query: data.query }, authority: 'public' }],
            }))
          }
        } catch (cause) {
          return degradeBackend(cause, failure('registry.tools.search', 'source_output_invalid'), {
            site: 'chatToolSearch', reason: 'invalid_response',
          })
        }
      },
    }),
  }
}

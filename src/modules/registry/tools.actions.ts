import { callPublicSourceQuery, sourceQuery, type CreatePublicConvexClientOptions } from '@/lib/server/convex-source'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { recordSearchResult } from '@/lib/observability/journey'
import { defineAction } from '@/modules/common/action'
import { sourceFreshnessState } from '@/modules/common/freshness'
import { jevDiscoveryRecipient } from '@/modules/decision-engine/public'
import type { ReferenceRate } from '@/modules/money/public'
import { readPersistedReferenceRate } from '@/modules/money/reference-rate.server'
import {
  registryToolsCompareContract,
  registryToolsDescribeContract,
  registryToolsListContract,
  registryToolsSearchContract,
} from './tool-action-contracts'
import {
  readCapabilityToolDetail,
  readCapabilityToolSearch,
} from '@/modules/capability-supply/tool-source'
import { type ToolSearchFilters, type ToolSearchResult } from '@/modules/capability-supply/public'
import { PublicToolRegistrySchemaVersion } from '@/modules/capability-supply/tool-schemas'
import { InvalidOpaqueCursorError } from './opaque-cursor'
import {
  filterToolSearchCandidates,
  filterExternalSearchRows,
  projectToolCompareChoices,
  projectToolDescription,
  projectToolListChoices,
  projectToolSearchChoices,
  type SearchResult,
  type SupplyProjectionFreshness,
} from './tool-choice-contracts'
import { compactDirectoryStatus, readCompactDirectoryPage } from './internal/compact-directory-search'
import { compactDirectoryRows } from './internal/compact-directory-projection'
import { resolveToolCompare } from './internal/tool-compare-resolution'
import { readSearchEvidence, readToolLatencyEvidence } from './internal/tool-latency-source'
import { rankSearchRowsByEvidence } from './search-signals'
import { rankCompactDirectoryRows, rankToolSearchForRegistry, TOOL_SEARCH_ASSESSMENT_LIMIT, type RegistryToolAssessment } from './tool-reranker'
import {
  marketToolsCursorScope,
  decodeMarketToolsCursor,
  opaquePagination,
  scopedSearchCursor,
  currentSearchContinuation,
  readSearchCursor,
  searchPagination,
  searchPageBudget,
  capacityExceededSearch,
} from './internal/tool-search-pagination'

// `market-tools/list` and `market-tools/search` read `registrySearchDocuments`,
// kept current by the hourly "reconcile business supply projections" workload
// cron (`convex/workloadCron.ts`). The threshold check reuses the DRY'd
// `sourceFreshnessState` from `@/modules/common/freshness` (also used by
// `market/x402-directory-index.server.ts`); `common` has no dependencies, so
// both `registry` and `market` can import it without a `registry -> market`
// edge (module-boundaries.ts).
const SUPPLY_PROJECTION_STALE_AFTER_MS = 3 * 60 * 60 * 1000 // one missed hourly run before flagging stale
const latestSupplyProjectionCompletionQuery = sourceQuery<Record<string, never>, number | null>(
  'capabilitySupplyProjection:latestReconcileBusinessSupplyProjectionsCompletion',
)

async function readSupplyProjectionFreshness(now: number = Date.now(), options?: CreatePublicConvexClientOptions): Promise<SupplyProjectionFreshness> {
  try {
    options?.signal?.throwIfAborted()
    const completedAt = options === undefined
      ? await callPublicSourceQuery(latestSupplyProjectionCompletionQuery, {})
      : await callPublicSourceQuery(latestSupplyProjectionCompletionQuery, {}, options)
    options?.signal?.throwIfAborted()
    return {
      source: 'supply_projection',
      state: sourceFreshnessState(completedAt === null ? {} : { completedAt }, SUPPLY_PROJECTION_STALE_AFTER_MS, now),
      ...(completedAt === null ? {} : { completedAt }),
      staleAfterMs: SUPPLY_PROJECTION_STALE_AFTER_MS,
    }
  } catch (cause) {
    if (options?.signal?.aborted) throw cause
    return degradeBackend(cause, { source: 'supply_projection', state: 'absent', staleAfterMs: SUPPLY_PROJECTION_STALE_AFTER_MS } as const, { site: 'readSupplyProjectionFreshness', reason: 'source_unavailable' })
  }
}


function sourceFilters(filters: {
  networkId?: string | undefined
  location?: string | undefined
  effects?: readonly ('data_release' | 'financial_exposure' | 'external_state_change')[] | undefined
  dataUse?: readonly ('public' | 'personal' | 'sensitive' | 'credential')[] | undefined
  healthStatus?: readonly ('operational' | 'degraded' | 'unverified')[] | undefined
  currency?: string | undefined
  maximumPrice?: { currency: string; units: string; exponent: number } | undefined
} | undefined): ToolSearchFilters | undefined {
  if (filters === undefined) return undefined
  return {
    ...(filters.networkId === undefined ? {} : { networkId: filters.networkId }),
    ...(filters.location === undefined ? {} : { location: filters.location }),
    ...(filters.effects === undefined ? {} : { effects: filters.effects }),
    ...(filters.dataUse === undefined ? {} : { dataUse: filters.dataUse }),
    ...(filters.currency === undefined ? {} : { currency: filters.currency }),
    ...(filters.maximumPrice === undefined ? {} : { maximumPrice: filters.maximumPrice }),
  }
}

export const registryToolsListAction = defineAction({
  ...registryToolsListContract,
  run: async ({ data }) => {
    const freshness = await readSupplyProjectionFreshness()
    const scope = marketToolsCursorScope(freshness)
    const cursor = decodeMarketToolsCursor(data.cursor, scope)
    const filters = sourceFilters(data.filters)
    const projected = projectToolListChoices(await readCapabilityToolSearch({
      query: '',
      limit: data.limit,
      ...(data.source === undefined ? {} : { source: data.source }),
      ...(cursor === undefined ? {} : { cursor }),
      ...(filters === undefined ? {} : { filters }),
    }), data.filters)
    return projected.kind === 'unavailable'
      ? projected
      : { ...projected, pagination: opaquePagination(projected.pagination, scope), freshness }
  },
})


export const registryToolsSearchAction = defineAction({
  ...registryToolsSearchContract,
  run: async ({ data, context }) => {
    const signal = context.request?.signal
    const deliver = <T extends { kind: string }>(output: T): T => {
      signal?.throwIfAborted()
      recordSearchResult(output.kind)
      return output
    }
    const sourceOptions = signal === undefined ? undefined : { signal }
    const readCurrent = async (input: Parameters<typeof readCapabilityToolSearch>[0]) => {
      signal?.throwIfAborted()
      const result = sourceOptions === undefined ? await readCapabilityToolSearch(input) : await readCapabilityToolSearch(input, sourceOptions)
      signal?.throwIfAborted()
      return result
    }
    signal?.throwIfAborted()
    const freshness = await readSupplyProjectionFreshness(Date.now(), sourceOptions)
    const admittedWanted = data.source !== 'coinbase'
    const directoryWanted = data.source !== 'current'
    const directoryStatus = directoryWanted ? await compactDirectoryStatus(sourceOptions) : undefined
    signal?.throwIfAborted()
    const generation = directoryStatus?.kind === 'ready' ? directoryStatus.coverage?.generation : undefined
    const scope = scopedSearchCursor({ query: data.query, source: data.source, filters: data.filters, limit: data.limit }, freshness, generation ?? 'current')
    const cursor = readSearchCursor(data.cursor, scope)
    const source = directoryWanted ? admittedWanted ? 'all' : 'coinbase' : 'current'
    const empty: ToolSearchResult = {
      kind: 'no_candidates', schemaVersion: PublicToolRegistrySchemaVersion, query: data.query,
      appliedFilters: {}, matchedCount: 0, ranking: [], navigation: [],
    }
    const filters = sourceFilters(data.filters)
    // Admitted descriptors carry provider identity, but no Bazaar category, USD price band,
    // action class or object class. Only their explicit "unclassified"/"unknown" facets match.
    const unclassifiedFacet = data.filters?.location !== undefined
      || data.filters?.category !== undefined
      || (data.filters?.priceBand !== undefined && data.filters.priceBand !== 'unknown')
      || (data.filters?.actionClass !== undefined && data.filters.actionClass !== 'unclassified')
      || (data.filters?.objectClass !== undefined && data.filters.objectClass !== 'unclassified')
    let searchResult: ToolSearchResult = empty
    let completePool = false
    let assessment: RegistryToolAssessment = { result: empty, verdict: 'noMatch', nearMisses: [] }
    let recipient: Readonly<{ label: string; host: string; data: 'query and candidate summaries' }> | undefined
    let directoryRate: ReferenceRate | undefined
    let rateAttempted = false
    let admittedExamined = 0
    let pageSize = data.limit
    let rankedPageSize = data.limit
    let externalLimit: number | undefined
    if (admittedWanted && cursor.phase === 'current') {
      const pool = await readCurrent({ query: '', limit: TOOL_SEARCH_ASSESSMENT_LIMIT,
        source: 'current', ...(filters === undefined ? {} : { filters }) })
      completePool = (pool.kind === 'ok' && !pool.pagination.hasMore && pool.partialResults !== true)
        || (pool.kind === 'no_candidates' && pool.partialResults !== true)
      if (completePool && pool.kind !== 'unavailable') searchResult = { ...pool, query: data.query }
      else if (pool.kind === 'unavailable') searchResult = pool
      else searchResult = await readCurrent({
        query: data.query, limit: pageSize, source: 'current',
        ...(cursor.currentCursor === undefined ? {} : { cursor: cursor.currentCursor }),
        ...(filters === undefined ? {} : { filters }),
      })
      admittedExamined = searchResult.kind === 'ok' ? searchResult.items.length : 0
      searchResult = filterToolSearchCandidates(searchResult, data.filters)
      if (searchResult.kind === 'ok' && searchResult.items.length > 0 && data.query.trim().length > 0
        && new Set(searchResult.items.map(item => item.toolRef)).size === searchResult.items.length) {
        const resolved = jevDiscoveryRecipient()
        if (resolved !== undefined) recipient = { ...resolved, data: 'query and candidate summaries' }
      }
      assessment = await rankToolSearchForRegistry(searchResult, data.query,
        context.request === undefined ? {} : { signal: context.request.signal })
    }
    if (searchResult.kind === 'unavailable') {
      return deliver(projectToolSearchChoices(searchResult, data.filters, assessment, freshness, data.limit,
        { query: data.query, source, ...(data.source === undefined ? {} : { searchSource: data.source }), ...(data.cursor === undefined ? {} : { searchCursor: data.cursor }), ...(recipient === undefined ? {} : { recipient }) }))
    }
    const directoryFilters = {
      ...(data.filters?.actionClass === undefined ? {} : { actionClass: data.filters.actionClass }),
      ...(data.filters?.objectClass === undefined ? {} : { objectClass: data.filters.objectClass }),
      ...(data.filters?.category === undefined ? {} : { category: data.filters.category }),
      ...(data.filters?.provider === undefined ? {} : { provider: data.filters.provider }),
      ...(data.filters?.networkId === undefined ? {} : { network: data.filters.networkId }),
      ...(data.filters?.priceBand === undefined ? {} : { priceBand: data.filters.priceBand }),
      ...(data.filters?.access === undefined ? {} : { access: data.filters.access }),
    }
    const directoryStart = cursor.phase === 'coinbase' ? cursor.directoryCursor ?? null : null
    while (true) {
      signal?.throwIfAborted()
      let admittedRows: SearchResult[] = []
      let continuation = currentSearchContinuation(assessment, completePool, cursor, pageSize)
      if (assessment.result.kind === 'ok' && assessment.verdict === 'matched') {
        const candidates = completePool
          ? assessment.result.items.slice(cursor.offset, cursor.offset + pageSize)
          : assessment.result.items
        const admitted = projectToolSearchChoices({ ...assessment.result, items: candidates },
          data.filters, assessment, freshness, data.limit, { query: data.query, source: 'current' })
        admittedRows = admitted.kind === 'match' ? admitted.results as SearchResult[] : []
      }
      let externalRows: SearchResult[] = []
      let examined = 0
      let completedAt: number | undefined = directoryStatus?.kind === 'ready' ? directoryStatus.coverage?.completedAt : undefined
      if (directoryWanted && generation !== undefined && continuation === undefined && admittedRows.length < pageSize) {
        const fetchSize = Math.min(pageSize - admittedRows.length, externalLimit ?? pageSize)
        if (fetchSize === 0) {
          continuation = { phase: 'coinbase', offset: 0, ...(directoryStart === null ? {} : { directoryCursor: directoryStart }) }
        } else {
          const page = await readCompactDirectoryPage({
            query: data.query, cursor: directoryStart, limit: fetchSize, filters: directoryFilters,
          }, sourceOptions)
          signal?.throwIfAborted()
          if (page.kind === 'unavailable' && page.reason === 'cursor_invalid') throw new InvalidOpaqueCursorError()
          if (page.kind !== 'ok') {
            return deliver(projectToolSearchChoices(assessment.result, data.filters, assessment, freshness, data.limit,
              { query: data.query, source, ...(data.source === undefined ? {} : { searchSource: data.source }), ...(data.cursor === undefined ? {} : { searchCursor: data.cursor }), pagination: searchPagination(data.limit, scope, continuation),
                ...(recipient === undefined ? {} : { recipient }) }))
          }
          examined = page.page.length
          completedAt = page.coverage.completedAt
          if (directoryStatus === undefined) throw new Error('Directory status must precede directory page')
          if (!rateAttempted && page.page.some(item => item.minimumUsdPrice !== undefined)) {
            rateAttempted = true
            directoryRate = await readPersistedReferenceRate(sourceOptions)
            signal?.throwIfAborted()
          }
          externalRows = filterExternalSearchRows(compactDirectoryRows(page, directoryStatus, Date.now(), directoryRate), data.filters)
          if (externalRows.length > 0 && data.query.trim().length > 0) {
            const resolved = jevDiscoveryRecipient()
            if (resolved !== undefined) recipient = { ...resolved, data: 'query and candidate summaries' }
          }
          const externalAssessment = await rankCompactDirectoryRows(externalRows, data.query,
            context.request === undefined ? {} : { signal: context.request.signal })
          signal?.throwIfAborted()
          externalRows = externalAssessment.rows.filter(row => row.toolRef === undefined || !admittedRows.some(admitted => admitted.toolRef === row.toolRef))
          if (!page.isDone) continuation = { phase: 'coinbase', offset: 0, directoryCursor: page.continueCursor }
        }
      } else if (directoryWanted && generation !== undefined && continuation === undefined && admittedRows.length >= pageSize) {
        continuation = { phase: 'coinbase', offset: 0 }
      }
      const pagination = searchPagination(data.limit, scope, continuation)
      const result = assessment.result.kind === 'ok'
        ? { ...assessment.result, items: assessment.result.items.filter(item => admittedRows.some(row => row.toolRef === item.toolRef)) }
        : empty
      const projected = projectToolSearchChoices(result, data.filters, assessment, freshness, data.limit, {
        query: data.query,
        source,
        ...(data.source === undefined ? {} : { searchSource: data.source }), ...(data.cursor === undefined ? {} : { searchCursor: data.cursor }),
        complete: source === 'current' && completePool && !unclassifiedFacet,
        external: externalRows,
        pagination,
        ...(generation === undefined ? {} : { generation }),
        ...(completedAt === undefined ? {} : { completedAt }),
        admittedExamined,
        externalExamined: examined,
        ...(recipient === undefined ? {} : { recipient }),
      })
      const evidence = await readSearchEvidence(projected.results.flatMap(row => row.toolRef === undefined ? [] : [row.toolRef]))
      signal?.throwIfAborted()
      const output = projected.kind === 'match' || projected.kind === 'scoped'
        ? { ...projected, results: rankSearchRowsByEvidence(projected.results, evidence) }
        : projected
      const budget = searchPageBudget(output, pageSize, admittedRows.length, externalRows.length, externalLimit)
      if (budget.kind === 'fit') return deliver(output)
      if (budget.kind === 'shrink_external') {
        externalLimit = budget.limit
        continue
      }
      if (budget.kind === 'shrink_current') {
        pageSize = budget.pageSize
        externalLimit = undefined
        if (!completePool && rankedPageSize !== pageSize) {
          searchResult = await readCurrent({
            query: data.query, limit: pageSize, source: 'current',
            ...(cursor.currentCursor === undefined ? {} : { cursor: cursor.currentCursor }),
            ...(filters === undefined ? {} : { filters }),
          })
          if (searchResult.kind === 'unavailable') {
            return deliver(projectToolSearchChoices(searchResult, data.filters,
              { verdict: 'noMatch', nearMisses: [] }, freshness, data.limit,
              { query: data.query, source, ...(data.source === undefined ? {} : { searchSource: data.source }), ...(data.cursor === undefined ? {} : { searchCursor: data.cursor }), ...(recipient === undefined ? {} : { recipient }) }))
          }
          admittedExamined = searchResult.kind === 'ok' ? searchResult.items.length : 0
          searchResult = filterToolSearchCandidates(searchResult, data.filters)
          assessment = await rankToolSearchForRegistry(searchResult, data.query,
            context.request === undefined ? {} : { signal: context.request.signal })
          rankedPageSize = pageSize
        }
        continue
      }
      return deliver({ ...capacityExceededSearch(data, output.assessed, freshness), ...(recipient === undefined ? {} : { recipient }) })
    }
  },
})

export const registryToolsDescribeAction = defineAction({
  ...registryToolsDescribeContract,
  run: async ({ data }) => {
    const result = projectToolDescription(await readCapabilityToolDetail({ toolRef: data.toolRef }))
    if (result.kind !== 'found' || data.includeLatency !== true) return result
    const evidence = await readToolLatencyEvidence([result.tool.toolRef])
    const latency = evidence.get(result.tool.toolRef)
    return latency === undefined ? result : { ...result, tool: { ...result.tool, latency } }
  },
})

export const registryToolsCompareAction = defineAction({
  ...registryToolsCompareContract,
  run: async ({ data }) => {
    const result = projectToolCompareChoices(await resolveToolCompare(data.toolRefs))
    if (result.kind !== 'ok' || data.includeLatency !== true) return result
    const evidence = await readToolLatencyEvidence(result.tools.map(tool => tool.toolRef))
    return { ...result, tools: result.tools.map(tool => {
      const latency = evidence.get(tool.toolRef)
      return latency === undefined ? tool : { ...tool, latency }
    }) }
  },
})

import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { defineAction } from '@/modules/common/action'
import { sourceFreshnessState } from '@/modules/common/freshness'
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
import { type PublicToolDescriptor, type ToolSearchFilters, type ToolSearchResult } from '@/modules/capability-supply/public'
import { PublicToolRegistrySchemaVersion } from '@/modules/capability-supply/tool-schemas'
import { InvalidOpaqueCursorError } from './opaque-cursor'
import {
  projectToolCompareChoices,
  projectToolDescription,
  projectToolListChoices,
  projectToolSearchChoices,
  type SearchResult,
  type SupplyProjectionFreshness,
  type ToolCompareResolution,
} from './tool-choice-contracts'
import { compactDirectoryRows, compactDirectoryStatus, readCompactDirectoryPage } from './internal/compact-directory-search'
import { rankToolSearchForRegistry, TOOL_SEARCH_ASSESSMENT_LIMIT, type RegistryToolAssessment } from './tool-reranker'
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

async function readSupplyProjectionFreshness(now: number = Date.now()): Promise<SupplyProjectionFreshness> {
  try {
    const completedAt = await callPublicSourceQuery(latestSupplyProjectionCompletionQuery, {})
    return {
      source: 'supply_projection',
      state: sourceFreshnessState(completedAt === null ? {} : { completedAt }, SUPPLY_PROJECTION_STALE_AFTER_MS, now),
      ...(completedAt === null ? {} : { completedAt }),
      staleAfterMs: SUPPLY_PROJECTION_STALE_AFTER_MS,
    }
  } catch (cause) {
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
    const freshness = await readSupplyProjectionFreshness()
    const admittedWanted = data.source !== 'coinbase' && data.filters?.access !== 'external_listing'
    const directoryWanted = data.source !== 'current' && data.filters?.access !== 'ae_callable'
    const directoryStatus = directoryWanted ? await compactDirectoryStatus() : undefined
    const generation = directoryStatus?.kind === 'ready' ? directoryStatus.coverage?.generation : undefined
    const scope = scopedSearchCursor({ query: data.query, source: data.source, filters: data.filters, limit: data.limit }, freshness, generation ?? 'current')
    const cursor = readSearchCursor(data.cursor, scope)
    const source = directoryWanted ? admittedWanted ? 'all' : 'coinbase' : 'current'
    const empty: ToolSearchResult = {
      kind: 'no_candidates', schemaVersion: PublicToolRegistrySchemaVersion, query: data.query,
      appliedFilters: {}, matchedCount: 0, ranking: [], navigation: [],
    }
    if (directoryWanted && generation === undefined) {
      return projectToolSearchChoices(empty, data.filters, { verdict: 'noMatch', nearMisses: [] }, freshness,
        data.limit, { query: data.query, source, externalAvailable: false })
    }
    const filters = sourceFilters(data.filters)
    const provider = data.filters?.provider?.toLocaleLowerCase()
    // Admitted descriptors carry provider identity, but no Bazaar category, USD price band,
    // action class or object class. Only their explicit "unclassified"/"unknown" facets match.
    const unclassifiedFacet = data.filters?.category !== undefined
      || (data.filters?.priceBand !== undefined && data.filters.priceBand !== 'unknown')
      || (data.filters?.actionClass !== undefined && data.filters.actionClass !== 'unclassified')
      || (data.filters?.objectClass !== undefined && data.filters.objectClass !== 'unclassified')
    const visibleAdmitted = (result: ToolSearchResult): ToolSearchResult => result.kind === 'ok'
      ? { ...result, items: result.items.filter(tool =>
        !unclassifiedFacet && (provider === undefined
          || tool.business.name.toLocaleLowerCase() === provider
          || tool.business.slug.toLocaleLowerCase() === provider)) }
      : result
    let searchResult: ToolSearchResult = empty
    let completePool = false
    let assessment: RegistryToolAssessment = { result: empty, verdict: 'noMatch', nearMisses: [] }
    let admittedExamined = 0
    let pageSize = data.limit
    let rankedPageSize = data.limit
    let externalLimit: number | undefined
    if (admittedWanted && cursor.phase === 'current') {
      const pool = await readCapabilityToolSearch({ query: '', limit: TOOL_SEARCH_ASSESSMENT_LIMIT,
        source: 'current', ...(filters === undefined ? {} : { filters }) })
      completePool = (pool.kind === 'ok' && !pool.pagination.hasMore && pool.partialResults !== true)
        || (pool.kind === 'no_candidates' && pool.partialResults !== true)
      if (completePool && pool.kind !== 'unavailable') searchResult = { ...pool, query: data.query }
      else if (pool.kind === 'unavailable') searchResult = pool
      else searchResult = await readCapabilityToolSearch({
        query: data.query, limit: pageSize, source: 'current',
        ...(cursor.currentCursor === undefined ? {} : { cursor: cursor.currentCursor }),
        ...(filters === undefined ? {} : { filters }),
      })
      admittedExamined = searchResult.kind === 'ok' ? searchResult.items.length : 0
      searchResult = visibleAdmitted(searchResult)
      assessment = await rankToolSearchForRegistry(searchResult, data.query,
        context.request === undefined ? {} : { signal: context.request.signal })
    }
    if (searchResult.kind === 'unavailable' || assessment.verdict === 'degraded') {
      return projectToolSearchChoices(searchResult, data.filters, assessment, freshness, data.limit,
        { query: data.query, source, externalAvailable: false })
    }
    const directoryFilters = {
      ...(data.filters?.actionClass === undefined ? {} : { actionClass: data.filters.actionClass }),
      ...(data.filters?.objectClass === undefined ? {} : { objectClass: data.filters.objectClass }),
      ...(data.filters?.category === undefined ? {} : { category: data.filters.category }),
      ...(data.filters?.provider === undefined ? {} : { provider: data.filters.provider }),
      ...(data.filters?.networkId === undefined ? {} : { network: data.filters.networkId }),
      ...(data.filters?.priceBand === undefined ? {} : { priceBand: data.filters.priceBand }),
      access: 'external_listing',
    }
    const directoryStart = cursor.phase === 'coinbase' ? cursor.directoryCursor ?? null : null
    while (true) {
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
      if (directoryWanted && continuation === undefined && admittedRows.length < pageSize) {
        const fetchSize = Math.min(pageSize - admittedRows.length, externalLimit ?? pageSize)
        if (fetchSize === 0) {
          continuation = { phase: 'coinbase', offset: 0, ...(directoryStart === null ? {} : { directoryCursor: directoryStart }) }
        } else {
          const page = await readCompactDirectoryPage({
            query: data.query, cursor: directoryStart, limit: fetchSize, filters: directoryFilters,
          })
          if (page.kind === 'unavailable' && page.reason === 'cursor_invalid') throw new InvalidOpaqueCursorError()
          if (page.kind !== 'ok') {
            return projectToolSearchChoices(empty, data.filters, { verdict: 'noMatch', nearMisses: [] }, freshness,
              data.limit, { query: data.query, source, externalAvailable: false })
          }
          examined = page.page.length
          completedAt = page.coverage.completedAt
          if (directoryStatus === undefined) throw new Error('Directory status must precede directory page')
          externalRows = compactDirectoryRows(page, directoryStatus)
          if (!page.isDone) continuation = { phase: 'coinbase', offset: 0, directoryCursor: page.continueCursor }
        }
      } else if (directoryWanted && continuation === undefined && admittedRows.length >= pageSize) {
        continuation = { phase: 'coinbase', offset: 0 }
      }
      const pagination = searchPagination(data.limit, scope, continuation)
      const result = assessment.result.kind === 'ok'
        ? { ...assessment.result, items: assessment.result.items.filter(item => admittedRows.some(row => row.toolRef === item.toolRef)) }
        : empty
      const output = projectToolSearchChoices(result, data.filters, assessment, freshness, data.limit, {
        query: data.query,
        source,
        complete: source === 'current' && completePool && !unclassifiedFacet,
        external: externalRows,
        pagination,
        ...(generation === undefined ? {} : { generation }),
        ...(completedAt === undefined ? {} : { completedAt }),
        externalExamined: examined,
        admittedExamined,
      })
      const budget = searchPageBudget(output, pageSize, admittedRows.length, externalRows.length, externalLimit)
      if (budget.kind === 'fit') return output
      if (budget.kind === 'shrink_external') {
        externalLimit = budget.limit
        continue
      }
      if (budget.kind === 'shrink_current') {
        pageSize = budget.pageSize
        externalLimit = undefined
        if (!completePool && rankedPageSize !== pageSize) {
          searchResult = await readCapabilityToolSearch({
            query: data.query, limit: pageSize, source: 'current',
            ...(cursor.currentCursor === undefined ? {} : { cursor: cursor.currentCursor }),
            ...(filters === undefined ? {} : { filters }),
          })
          if (searchResult.kind === 'unavailable') {
            return projectToolSearchChoices(searchResult, data.filters,
              { verdict: 'noMatch', nearMisses: [] }, freshness, data.limit,
              { query: data.query, source, externalAvailable: false })
          }
          admittedExamined = searchResult.kind === 'ok' ? searchResult.items.length : 0
          searchResult = visibleAdmitted(searchResult)
          assessment = await rankToolSearchForRegistry(searchResult, data.query,
            context.request === undefined ? {} : { signal: context.request.signal })
          rankedPageSize = pageSize
        }
        continue
      }
      return capacityExceededSearch(data.query, data.limit, output.assessed, freshness)
    }
  },
})

export const registryToolsDescribeAction = defineAction({
  ...registryToolsDescribeContract,
  run: async ({ data }) => projectToolDescription(await readCapabilityToolDetail(data)),
})

export const registryToolsCompareAction = defineAction({
  ...registryToolsCompareContract,
  run: async ({ data }) => projectToolCompareChoices(await resolveToolCompare(data.toolRefs)),
})

/**
 * Resolves each requested ref independently (one `registry.tools.describe`
 * read per ref) instead of aborting the whole comparison when one ref is
 * unknown. Only refuses the whole call when zero refs resolve to a current,
 * available Tool.
 */
async function resolveToolCompare(toolRefs: readonly string[]): Promise<ToolCompareResolution> {
  if (new Set(toolRefs).size !== toolRefs.length) {
    return { kind: 'unavailable', reason: 'query_invalid' }
  }
  const details = await Promise.all(toolRefs.map((toolRef) => readCapabilityToolDetail({ toolRef })))
  const tools: PublicToolDescriptor[] = []
  const missing: string[] = []
  for (const detail of details) {
    if (detail.kind === 'found') tools.push(detail.tool)
    else missing.push(detail.toolRef)
  }
  if (tools.length === 0) {
    return {
      kind: 'unavailable',
      reason: details.every((detail) => detail.kind === 'unavailable') ? 'tool_unavailable' : 'tool_not_found',
    }
  }
  return missing.length === 0 ? { kind: 'ok', tools } : { kind: 'ok', tools, missing }
}

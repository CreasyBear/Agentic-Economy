import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { readX402Directory } from './x402-directory.server'
import type { X402DirectoryIndexCoverage, X402DirectoryIndexInput, X402IndexedDirectoryEntry } from './x402-directory-index'
import {
  x402DirectoryProvidersInputSchema, type X402DirectoryProvidersInput, type X402DirectoryProvidersPage,
  x402DirectoryCatalogueInputSchema, x402DirectoryCatalogueResourceInputSchema,
  type X402DirectoryCatalogue, type X402DirectoryCatalogueInput, type X402DirectoryCatalogueOverview,
  type X402DirectoryCatalogueResource, type X402DirectoryCatalogueUnavailable, type X402DirectoryAnalytics,
} from './x402-directory-catalogue'

type BrowseResult = X402DirectoryCatalogueUnavailable | {
  kind: 'ok'; coverage: X402DirectoryIndexCoverage; searchMethod: 'native_full_text' | 'native_index'
  page: X402IndexedDirectoryEntry[]; continueCursor: string; isDone: boolean
  pageStatus?: 'SplitRecommended' | 'SplitRequired' | null; splitCursor?: string | null
}
const browse = sourceQuery<X402DirectoryIndexInput & { paginationOpts: { numItems: number; cursor: string | null; maximumRowsRead: number } }, BrowseResult>('x402DirectoryIndex:browse')
const overview = sourceQuery<Record<string, never>, X402DirectoryCatalogueOverview>('x402DirectoryIndex:overview')
const resource = sourceQuery<{ resource: string }, X402DirectoryCatalogueResource>('x402DirectoryIndex:resource')
const analytics = sourceQuery<{ network?: string }, X402DirectoryAnalytics>('x402DirectoryIndex:analytics')

type DirectoryStatus = {
  kind: 'unavailable' | 'ready'
  coverage?: { generation: string; completedAt: number }
  refreshState: 'none' | 'refreshing' | 'complete' | 'failed'
  lastError?: string
}
const status = sourceQuery<Record<string, never>, DirectoryStatus>('x402DirectoryIndex:status')

export const CATALOGUE_STALE_AFTER_MS = 36 * 60 * 60 * 1000

export function catalogueFreshness(directoryStatus: DirectoryStatus, now: number) {
  const completedAt = directoryStatus.coverage?.completedAt
  const state = directoryStatus.kind === 'unavailable' || completedAt === undefined
    ? 'absent' as const
    : directoryStatus.refreshState === 'failed'
      ? 'failed' as const
      : now - completedAt > CATALOGUE_STALE_AFTER_MS
        ? 'stale' as const
        : 'fresh' as const
  return {
    schemaVersion: 'catalogue-status:v1' as const,
    status: state,
    refreshState: directoryStatus.refreshState,
    ...(directoryStatus.coverage === undefined ? {} : { generation: directoryStatus.coverage.generation, completedAt: directoryStatus.coverage.completedAt, ageHours: Math.round((now - directoryStatus.coverage.completedAt) / 3_600_000) }),
    ...(directoryStatus.lastError === undefined ? {} : { lastError: directoryStatus.lastError }),
  }
}
export async function readCatalogueFreshness(now: number = Date.now()): Promise<ReturnType<typeof catalogueFreshness>> {
  const result = await callPublicSourceQuery(status, {})
  return catalogueFreshness(result, now)
}

export async function readX402DirectoryCatalogue(input: X402DirectoryCatalogueInput): Promise<X402DirectoryCatalogue> {
  const parsed = x402DirectoryCatalogueInputSchema.safeParse(input)
  if (!parsed.success) return { kind: 'unavailable', reason: 'query_invalid' }
  const { directoryCategory, indexCursor, offset, ...filters } = parsed.data
  try {
    const result = await callPublicSourceQuery(browse, {
      ...filters, ...(directoryCategory === undefined ? {} : { category: directoryCategory }),
      paginationOpts: { numItems: 24, cursor: indexCursor ?? null, maximumRowsRead: 512 },
    })
    if (result.kind === 'unavailable') {
      if (result.reason !== 'index_unavailable') return result
      // Do not silently reinterpret index category, sort or cursor as SDK search.
      if (directoryCategory !== undefined || indexCursor !== undefined || Object.keys(filters).some(key => !['query', 'network', 'provider', 'maxUsdPrice', 'sort'].includes(key)) || (filters.sort !== undefined && filters.sort !== 'relevance')) return result
      const { sort: _sort, ...sourceFilters } = filters
      const page = await readX402Directory({ ...sourceFilters, ...(offset === undefined ? {} : { offset }) })
      if (page.kind === 'unavailable') return page
      return { kind: 'ok', source: 'upstream_limited', searchMethod: 'upstream', page, isDone: page.nextOffset === undefined }
    }
    if (offset) return { kind: 'unavailable', reason: 'index_cursor_required' }
    const { network, provider, maxUsdPrice } = filters
    return {
      kind: 'ok', source: 'index', coverage: result.coverage, searchMethod: result.searchMethod,
      page: { kind: 'ok', items: result.page.map(item => item.entry), offset: 0, limit: 24,
        mode: filters.query ? 'search' : 'browse',
        appliedFilters: { ...(network === undefined ? {} : { network }), ...(provider === undefined ? {} : { provider }), ...(maxUsdPrice === undefined ? {} : { maxUsdPrice }) },
      },
      isDone: result.isDone, ...(result.isDone ? {} : { indexCursor: result.continueCursor }),
      ...(result.pageStatus === undefined ? {} : { pageStatus: result.pageStatus }),
      ...(result.splitCursor === undefined ? {} : { splitCursor: result.splitCursor }),
    }
  } catch { return { kind: 'unavailable', reason: 'source_unavailable' } }
}
export async function readX402DirectoryCatalogueOverview(): Promise<X402DirectoryCatalogueOverview> {
  try { return await callPublicSourceQuery(overview, {}) }
  catch { return { kind: 'unavailable', reason: 'source_unavailable' } }
}
export async function readX402DirectoryAnalytics(input: { network?: string | undefined }): Promise<X402DirectoryAnalytics> {
  try { return await callPublicSourceQuery(analytics, input.network === undefined ? {} : { network: input.network }) }
  catch { return { kind: 'unavailable', reason: 'source_unavailable' } }
}
export async function readX402DirectoryCatalogueResource(input: { resource: string }): Promise<X402DirectoryCatalogueResource> {
  const parsed = x402DirectoryCatalogueResourceInputSchema.safeParse(input)
  if (!parsed.success) return { kind: 'unavailable', reason: 'query_invalid' }
  try { return await callPublicSourceQuery(resource, parsed.data) }
  catch { return { kind: 'unavailable', reason: 'source_unavailable' } }
}

const providers = sourceQuery<{ kind: 'provider'; paginationOpts: { numItems: number; cursor: string | null } }, X402DirectoryProvidersPage>('x402DirectoryIndex:facets')
export async function readX402DirectoryProviders(input: X402DirectoryProvidersInput): Promise<X402DirectoryProvidersPage> {
  const parsed = x402DirectoryProvidersInputSchema.safeParse(input)
  if (!parsed.success) return { kind: 'unavailable', reason: 'query_invalid' }
  try { return await callPublicSourceQuery(providers, { kind: 'provider', paginationOpts: { numItems: 24, cursor: parsed.data.providerCursor ?? null } }) }
  catch { return { kind: 'unavailable', reason: 'source_unavailable' } }
}

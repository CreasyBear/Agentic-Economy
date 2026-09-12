import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { CATALOGUE_STALE_AFTER_MS, sourceFreshnessState, type SourceFreshnessState } from '@/modules/common/freshness'
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

// Re-exported so existing consumers of this module (e.g. the catalogue status
// route/tests) keep resolving the constant from here after the shared
// threshold logic moved to `@/modules/common/freshness` (DRY with
// `registry/tools.actions.ts`, which cannot import this `market` module).
export { CATALOGUE_STALE_AFTER_MS }

export type SourceFreshnessField<Source extends string> = Readonly<{
  source: Source
  state: SourceFreshnessState
  completedAt?: number
  staleAfterMs: number
}>
export type X402DirectoryFreshnessField = SourceFreshnessField<'x402_directory'>

function directoryFreshnessState(directoryStatus: DirectoryStatus, now: number): SourceFreshnessState {
  if (directoryStatus.kind === 'unavailable') return 'absent'
  const completedAt = directoryStatus.coverage?.completedAt
  return sourceFreshnessState(
    { ...(completedAt === undefined ? {} : { completedAt }), failed: directoryStatus.refreshState === 'failed' },
    CATALOGUE_STALE_AFTER_MS,
    now,
  )
}

export function catalogueFreshness(directoryStatus: DirectoryStatus, now: number) {
  const state = directoryFreshnessState(directoryStatus, now)
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

/**
 * Additive `freshness` field shared by `/api/v1/registry` and the developer
 * discovery routes: reports the x402 directory's own completion state rather
 * than a route-local "current" guess. Best-effort - a source outage degrades
 * to `absent` instead of failing the caller's primary response.
 */
export async function readDirectoryFreshnessField(now: number = Date.now()): Promise<X402DirectoryFreshnessField> {
  try {
    const result = await callPublicSourceQuery(status, {})
    const completedAt = result.coverage?.completedAt
    return {
      source: 'x402_directory',
      state: directoryFreshnessState(result, now),
      ...(completedAt === undefined ? {} : { completedAt }),
      staleAfterMs: CATALOGUE_STALE_AFTER_MS,
    }
  } catch {
    return { source: 'x402_directory', state: 'absent', staleAfterMs: CATALOGUE_STALE_AFTER_MS }
  }
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
      // Do not silently reinterpret index category or cursor as SDK search. Sort always falls
      // back to upstream relevance ordering here since the SDK cannot honour index-only sorts
      // (e.g. adoption) - the /market default view must still render during index refreshes.
      if (directoryCategory !== undefined || indexCursor !== undefined || Object.keys(filters).some(key => !['query', 'network', 'provider', 'maxUsdPrice', 'sort'].includes(key))) return result
      console.error('[market] x402 directory index unavailable, using upstream fallback', { reason: result.reason })
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
  } catch (reason) {
    console.error('[market] x402 directory catalogue read failed, returning source_unavailable', { reason })
    return { kind: 'unavailable', reason: 'source_unavailable' }
  }
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

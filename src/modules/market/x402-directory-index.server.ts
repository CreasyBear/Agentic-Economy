import { degrade } from '@/lib/observability/degrade'
import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { CATALOGUE_STALE_AFTER_MS, sourceFreshnessState, type SourceFreshnessState } from '@/modules/common/freshness'
import { REFERENCE_RATE_MAX_AGE_MS, formatDisplayPrice, parseDecimalExactAmount } from '@/modules/money/public'
import { readPersistedReferenceRate } from '@/modules/money/reference-rate.server'
import { readX402Directory } from './x402-directory.server'
import type { DirectoryChoice, X402DirectoryEntry } from './x402-directory'
import { directorySlugBase, directorySlugWithMethod, minimumDirectoryUsdPrice, type X402DirectoryIndexCoverage, type X402DirectoryIndexInput, type X402IndexedDirectoryEntry } from './x402-directory-index'
import { decodeOpaqueCursor, encodeOpaqueCursor } from '@/modules/registry/opaque-cursor'
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
const browse = sourceQuery<X402DirectoryIndexInput & { alternativeTo?: string; paginationOpts: { numItems: number; cursor: string | null; maximumRowsRead: number } }, BrowseResult>('x402DirectoryIndex:browse')
const COMPACT_CARD_PAGE = 12
type CompactCardRow = Readonly<{
  id: string
  source: 'coinbase' | 'provider'
  resource?: string
  slug?: string
  sourceRouteRef?: string
  toolRef?: string
  choice?: DirectoryChoice
  title: string
  summary: string
  provider: string
  category?: string
  minimumUsdPrice?: string
  calls30d?: number
  payers30d?: number
}>
type CompactCardPage = Readonly<{ kind: 'unavailable'; reason: string }> | Readonly<{
  kind: 'ok'
  coverage: { generation: string; completedAt: number }
  page: readonly CompactCardRow[]
  continueCursor: string
  isDone: boolean
}>
const compactCards = sourceQuery<{ query: string; paginationOpts: { numItems: number; cursor: string | null } }, CompactCardPage>('x402DirectoryIndex:searchCompact')
const overview = sourceQuery<Record<string, never>, X402DirectoryCatalogueOverview>('x402DirectoryIndex:overview')
const resource = sourceQuery<{ resource: string }, X402DirectoryCatalogueResource>('x402DirectoryIndex:resource')
const analytics = sourceQuery<{ network?: string }, X402DirectoryAnalytics>('x402DirectoryIndex:analytics')
const bySlug = sourceQuery<{ providerKey: string; slug: string }, X402DirectoryCatalogueResource>('x402DirectoryIndex:bySlug')
const canonicalUrlForTool = sourceQuery<{ toolRef: string }, { providerHost: string; slug: string } | null>('x402DirectoryIndex:canonicalUrlForTool')

type DirectoryStatus = {
  kind: 'unavailable' | 'ready'
  coverage?: { generation: string; completedAt: number }
  refreshState: 'none' | 'refreshing' | 'complete' | 'failed'
  lastError?: string
}
const status = sourceQuery<Record<string, never>, DirectoryStatus>('x402DirectoryIndex:status')
/** Card grids paint title, glance, price, access, and activity. Schemas stay on the Tool page. */
export function toDirectoryCardEntry(entry: X402DirectoryEntry): X402DirectoryEntry {
  const source = minimumDirectoryUsdPrice(entry)
  const price = source === undefined ? undefined : entry.prices.find(item => item.scheme === 'exact' && item.symbol === 'USDC' && item.decimalAmount === source)
  const description = [...entry.description].slice(0, 100).join('')
  return {
    resource: entry.resource,
    title: [...entry.title].slice(0, 72).join(''),
    description,
    protocol: entry.protocol,
    provider: [...entry.provider].slice(0, 48).join(''),
    metadataJson: '',
    prices: price === undefined ? [] : [{
      network: price.network,
      ...(price.networkLabel === undefined ? {} : { networkLabel: price.networkLabel }),
      scheme: price.scheme,
      amount: price.amount,
      ...(price.symbol === undefined ? {} : { symbol: price.symbol }),
      ...(price.decimalAmount === undefined ? {} : { decimalAmount: price.decimalAmount }),
    }],
    ...(entry.slug === undefined ? {} : { slug: entry.slug }),
    ...(entry.serviceName === undefined ? {} : { serviceName: entry.serviceName }),
    ...(entry.iconUrl === undefined || entry.iconUrl.length > 500 ? {} : { iconUrl: entry.iconUrl }),
    ...(entry.category === undefined ? {} : { category: entry.category }),
    ...(entry.choice === undefined ? {} : { choice: entry.choice }),
    ...(entry.activity === undefined ? {} : { activity: {
      ...(entry.activity.calls30d === undefined ? {} : { calls30d: entry.activity.calls30d }),
      ...(entry.activity.payers30d === undefined ? {} : { payers30d: entry.activity.payers30d }),
      ...(entry.activity.lastCalledAt === undefined ? {} : { lastCalledAt: entry.activity.lastCalledAt }),
    } }),
    ...(entry.audEstimate === undefined ? {} : { audEstimate: entry.audEstimate }),
  }
}

function cardFromCompact(row: CompactCardRow): X402DirectoryEntry | undefined {
  if (row.resource === undefined || row.resource.length === 0) return undefined
  return toDirectoryCardEntry({
    resource: row.resource,
    title: row.title,
    description: row.summary,
    protocol: 'x402',
    provider: row.provider,
    metadataJson: '',
    prices: row.minimumUsdPrice === undefined ? [] : [{
      network: 'published', scheme: 'exact', symbol: 'USDC',
      amount: `${row.minimumUsdPrice} USDC`, decimalAmount: row.minimumUsdPrice,
    }],
    ...(row.slug === undefined ? {} : { slug: row.slug }),
    ...(row.category === undefined ? {} : { category: row.category }),
    choice: row.choice ?? {
      access: 'external_listing',
      ...(row.sourceRouteRef === undefined ? {} : { sourceRouteRef: row.sourceRouteRef }),
      ...(row.toolRef === undefined ? {} : { toolRef: row.toolRef }),
    },
    ...(row.calls30d === undefined && row.payers30d === undefined ? {} : { activity: {
      ...(row.calls30d === undefined ? {} : { calls30d: row.calls30d }),
      ...(row.payers30d === undefined ? {} : { payers30d: row.payers30d }),
    } }),
  })
}

/** One Coinbase observation is shared across the bounded page; no row-level HTTP calls. */
async function withAudEstimates(entries: readonly X402DirectoryEntry[]): Promise<X402DirectoryEntry[]> {
  const rate = entries.some(entry => entry.prices.some(price => price.scheme === 'exact' && price.symbol === 'USDC' && price.decimalAmount !== undefined))
    ? await readPersistedReferenceRate() : undefined
  const now = Date.now()
  return entries.map(entry => {
    const source = minimumDirectoryUsdPrice(entry)
    if (source === undefined || rate === undefined) return entry
    const amount = parseDecimalExactAmount('USDC', source, 6)
    if (amount === undefined) return entry
    const audEstimate = formatDisplayPrice({ kind: 'indicative', amount, referenceRate: rate, validUntil: rate.fetchedAt + REFERENCE_RATE_MAX_AGE_MS }, now)
    return audEstimate === undefined || audEstimate === 'AUD estimate temporarily unavailable' ? entry : { ...entry, audEstimate }
  })
}

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
  } catch (cause) {
    return degrade(
      cause,
      { source: 'x402_directory' as const, state: 'absent' as const, staleAfterMs: CATALOGUE_STALE_AFTER_MS },
      { site: 'readDirectoryFreshnessField', reason: 'source_unavailable' },
    )
  }
}

export async function readX402DirectoryCatalogue(input: X402DirectoryCatalogueInput): Promise<X402DirectoryCatalogue> {
  const parsed = x402DirectoryCatalogueInputSchema.safeParse(input)
  if (!parsed.success) return { kind: 'unavailable', reason: 'query_invalid' }
  const { directoryCategory, indexCursor, alternativeTo, offset, ...filters } = parsed.data
  const { query: cardQuery, ...cardFilters } = filters
  if (cardQuery !== undefined && alternativeTo === undefined && indexCursor === undefined && offset === undefined && directoryCategory === undefined && Object.keys(cardFilters).length === 0) {
    try {
      const compact = await callPublicSourceQuery(compactCards, { query: cardQuery, paginationOpts: { numItems: COMPACT_CARD_PAGE, cursor: null } })
      if (compact.kind === 'unavailable') return compact
      const items = await withAudEstimates(compact.page.flatMap(row => {
        const card = cardFromCompact(row)
        return card === undefined ? [] : [card]
      }))
      return {
        kind: 'ok', source: 'index', searchMethod: 'native_full_text',
        page: { kind: 'ok', items, offset: 0, limit: COMPACT_CARD_PAGE, mode: 'search', appliedFilters: {} },
        isDone: compact.isDone,
      }
    } catch (reason) {
      console.error('[market] compact directory card read failed, returning source_unavailable', { reason })
      return { kind: 'unavailable', reason: 'source_unavailable' }
    }
  }
  try {
    let engineCursor: string | null = null
    let cursorScope = 'current'
    if (indexCursor !== undefined) {
      const directoryStatus = await callPublicSourceQuery(status, {})
      if (directoryStatus.kind === 'unavailable') return { kind: 'unavailable', reason: 'index_unavailable' }
      cursorScope = directoryStatus.coverage?.generation ?? 'current'
      const decoded = decodeOpaqueCursor(indexCursor, { kind: 'x402-directory', scope: cursorScope })
      if (decoded === undefined) return { kind: 'unavailable', reason: 'query_invalid' }
      engineCursor = decoded
    }
    const result = await callPublicSourceQuery(browse, {
      ...filters, ...(alternativeTo === undefined ? {} : { alternativeTo }),
      ...(directoryCategory === undefined ? {} : { category: directoryCategory }),
      paginationOpts: { numItems: 24, cursor: engineCursor, maximumRowsRead: 512 },
    })
    if (result.kind === 'unavailable') return result
    if (offset) return { kind: 'unavailable', reason: 'index_cursor_required' }
    const { network, provider, maxUsdPrice } = filters
    const items = await withAudEstimates(result.page.map(item => toDirectoryCardEntry({
      ...item.entry,
      choice: item.choice ?? { access: 'external_listing' as const },
    })))
    // The persisted generation already has adoption, popularity and full-text order.
    // A live Jev call would hold this response for the model round-trip, so the page uses that order.
    return {
      kind: 'ok', source: 'index', coverage: result.coverage, searchMethod: result.searchMethod,
      page: { kind: 'ok', items, offset: 0, limit: 24,
        mode: filters.query ? 'search' : 'browse',
        appliedFilters: { ...(network === undefined ? {} : { network }), ...(provider === undefined ? {} : { provider }), ...(maxUsdPrice === undefined ? {} : { maxUsdPrice }) },
      },
      isDone: result.isDone, ...(result.isDone ? {} : { indexCursor: encodeOpaqueCursor({ kind: 'x402-directory', scope: result.coverage.generation ?? cursorScope, cursor: result.continueCursor }) }),
      ...(result.pageStatus === undefined ? {} : { pageStatus: result.pageStatus }),
      ...(result.splitCursor === undefined ? {} : { splitCursor: result.splitCursor }),
    }
  } catch (reason) {
    console.error('[market] x402 directory catalogue read failed, returning source_unavailable', { reason })
    return { kind: 'unavailable', reason: 'source_unavailable' }
  }
}
export async function readX402DirectoryCatalogueOverview(): Promise<X402DirectoryCatalogueOverview> {
  try {
    const result = await callPublicSourceQuery(overview, {})
    if (result.kind !== 'ok') return result
    const { popular: _popular, recentlyUpdated: _recent, ...rest } = result
    const { rising: _rising, falling: _falling, ...kept } = rest as typeof rest & { rising?: unknown; falling?: unknown }
    return { ...kept, popular: [], recentlyUpdated: [] }
  }
  catch (cause) {
    return degrade(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, {
      site: 'readX402DirectoryCatalogueOverview',
      reason: 'source_unavailable',
    })
  }
}
export async function readX402DirectoryAnalytics(input: { network?: string | undefined }): Promise<X402DirectoryAnalytics> {
  try { return await callPublicSourceQuery(analytics, input.network === undefined ? {} : { network: input.network }) }
  catch (cause) {
    return degrade(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, {
      site: 'readX402DirectoryAnalytics',
      reason: 'source_unavailable',
    })
  }
}
export async function readX402DirectoryCatalogueResource(input: { resource: string }): Promise<X402DirectoryCatalogueResource> {
  const parsed = x402DirectoryCatalogueResourceInputSchema.safeParse(input)
  if (!parsed.success) return { kind: 'unavailable', reason: 'query_invalid' }
  try {
    const result = await callPublicSourceQuery(resource, parsed.data)
    if (result.kind !== 'found' && result.kind !== 'found_upstream') return result
    const [entry] = await withAudEstimates([result.item.entry])
    return { ...result, item: { ...result.item, entry: entry ?? result.item.entry } }
  }
  catch (cause) {
    return degrade(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, {
      site: 'readX402DirectoryCatalogueResource',
      reason: 'source_unavailable',
    })
  }
}

/** Canonical `/tools/<providerHost>/<slug>` lookup - the route's synchronous directory metadata plus the admitted toolRef, when already joined. */
export async function readX402DirectoryCatalogueBySlug(input: { providerKey: string; slug: string }): Promise<X402DirectoryCatalogueResource> {
  if (input.providerKey.length === 0 || input.slug.length === 0) return { kind: 'unavailable', reason: 'query_invalid' }
  let indexed: X402DirectoryCatalogueResource
  try { indexed = await callPublicSourceQuery(bySlug, input) }
  catch (cause) {
    indexed = degrade(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, {
      site: 'readX402DirectoryCatalogueBySlug',
      reason: 'source_unavailable',
    })
  }
  if (indexed.kind === 'found' || indexed.kind === 'found_upstream') return indexed
  if (indexed.kind === 'unavailable' && indexed.reason === 'query_invalid') return indexed
  // Tool detail is not the market catalogue request. A missing index row still resolves from the
  // same persisted-or-upstream card destination the route already advertised.
  for (let offset = 0, pages = 0; pages < 3; pages += 1) {
    const page = await readX402Directory({ provider: input.providerKey, ...(offset === 0 ? {} : { offset }) })
    if (page.kind !== 'ok') break
    const match = page.items.find(entry => [entry.slug, directorySlugBase(entry.resource), directorySlugWithMethod(entry.resource, entry.method)]
      .filter((slug): slug is string => slug !== undefined).includes(input.slug))
    if (match !== undefined) return { kind: 'found_upstream', item: { entry: match } }
    if (page.nextOffset === undefined) break
    offset = page.nextOffset
  }
  return indexed
}


/** Reverse lookup for the `/tools/$toolRef` redirect; `null` keeps the caller on that route. */
export async function readX402DirectoryCanonicalUrlForTool(input: { toolRef: string }): Promise<{ providerHost: string; slug: string } | null> {
  try { return await callPublicSourceQuery(canonicalUrlForTool, input) }
  catch (cause) {
    return degrade(cause, null, {
      site: 'readX402DirectoryCanonicalUrlForTool',
      reason: 'source_unavailable',
    })
  }
}

const providers = sourceQuery<{ kind: 'provider'; paginationOpts: { numItems: number; cursor: string | null } }, X402DirectoryProvidersPage>('x402DirectoryIndex:facets')
export async function readX402DirectoryProviders(input: X402DirectoryProvidersInput): Promise<X402DirectoryProvidersPage> {
  const parsed = x402DirectoryProvidersInputSchema.safeParse(input)
  if (!parsed.success) return { kind: 'unavailable', reason: 'query_invalid' }
  try { return await callPublicSourceQuery(providers, { kind: 'provider', paginationOpts: { numItems: 24, cursor: parsed.data.providerCursor ?? null } }) }
  catch (cause) {
    return degrade(cause, { kind: 'unavailable', reason: 'source_unavailable' } as const, {
      site: 'readX402DirectoryProviders',
      reason: 'source_unavailable',
    })
  }
}

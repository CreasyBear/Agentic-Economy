import { parseMarketSaveIntent } from '@/components/ae/market/market-save-intent'
import { isPublicToolRef } from '@/modules/common/tool-ref'
import { readPublicToolDetailRouteServer } from './tool-detail-route.functions'
import { readMarketExternalListingServer } from './market-comparison.functions'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import type { MarketReturnSearch } from '@/components/ae/market/market-return-context'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import {
  readX402DirectoryCatalogueOverviewServer,
  readX402DirectoryCatalogueResourceServer,
  readX402DirectoryCatalogueServer,
  readX402DirectoryProvidersServer,
} from '@/modules/market/x402-directory-index.functions'
import { x402DirectoryCatalogueInputSchema, type X402DirectoryCatalogue } from '@/modules/market/x402-directory-catalogue'
import { directoryBooleanSearchKeys, directoryCatalogueSearchKeys, directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation'
import { toolCatalogSearchInputSchema, type ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import { searchMarketToolsServer } from './market-tool-search.functions'
import { degrade } from '@/lib/observability/degrade'
import { awaitBoundedRead as awaitMarketRead, BROWSER_READ_TIMEOUT_MS as MARKET_READ_TIMEOUT_MS } from '@/lib/bounded-read'
import { recordProductJourney } from '@/lib/observability/product-journey'

/** The ranked search is progressive: index results render first, this settles later and never rejects. `input` is absent when the URL cannot form a ranked search. */
export type MarketCanonicalSearchPage = Readonly<{
  input: ReturnType<typeof toolCatalogSearchInputSchema.parse> | undefined
  result: ToolChoiceSearchOutput | undefined
}>
export type MarketRouteReadOptions = Readonly<{ signal?: AbortSignal | undefined }>

/** Bounded at 15s and by the route's own abort. A failure resolves with no result; the page keeps its keyword matches. */
export async function loadCanonicalMarketSearch(search: MarketSearch, options: MarketRouteReadOptions = {}): Promise<MarketCanonicalSearchPage> {
  const parsed = toolCatalogSearchInputSchema.safeParse(marketToolSearchInput(search))
  if (!parsed.success) return degrade(parsed.error, { input: undefined, result: undefined }, { site: 'marketCanonicalSearchInput', reason: 'invalid_response' })
  const input = parsed.data
  const deadline = AbortSignal.timeout(15_000)
  const signal = options.signal === undefined ? deadline : AbortSignal.any([options.signal, deadline])
  try {
    const result = await searchMarketToolsServer({ data: input, signal })
    recordProductJourney({ action: 'search_observed', phase: result.kind === 'unavailable' ? 'failed' : 'observed', surface: 'market', queryLength: input.query.length, resultCount: result.kind === 'unavailable' || result.kind === 'noMatch' ? 0 : result.results.length, callableCount: result.kind === 'unavailable' || result.kind === 'noMatch' ? 0 : result.results.filter(r => r.access === 'ae_callable').length })
    return { input, result }
  } catch (cause) {
    // A reader who left the page cancelled this search; that is not a failed search.
    if (options.signal?.aborted) return { input, result: undefined }
    recordProductJourney({ action: 'search_observed', phase: 'failed', surface: 'market', queryLength: input.query.length })
    degrade(cause, undefined, { site: 'marketCanonicalSearch', reason: 'source_unavailable' })
    return { input, result: undefined }
  }
}

/** Only pass refinements that the canonical mixed search applies before pagination. */
export function marketToolSearchInput(search: MarketSearch) {
  const filters = {
    ...(search.directoryCategory === undefined ? {} : { category: search.directoryCategory }),
    ...(search.provider === undefined ? {} : { provider: search.provider }),
    ...(search.network === undefined ? {} : { networkId: search.network }),
    ...(search.priceBand === undefined ? {} : { priceBand: search.priceBand }),
  }
  return {
    query: search.query ?? '',
    limit: 8,
    ...(Object.keys(filters).length === 0 ? {} : { filters }),
  }
}

function marketHasBrowseOnlyFilters(search: MarketSearch): boolean {
  return search.minUsdPrice !== undefined || search.maxUsdPrice !== undefined
    || search.minPayers30d !== undefined || search.maxPayers30d !== undefined
    || search.adoptionBand !== undefined || search.curatedOnly === true || search.reviewedProvidersOnly === true
    || search.hasInputFields === true || search.hasOutputFields === true
    || search.hasInputSchema === true || search.hasOutputSchema === true
    || search.hasOutputExample === true || (search.tags?.length ?? 0) > 0
    || (search.bundleSlugs?.length ?? 0) > 0
}

export type MarketSearch = MarketReturnSearch
export type MarketView = NonNullable<MarketSearch['view']>

/** Reviewed-provider and alternative searches need the catalogue's filtering path. */
export function marketUsesCanonicalSearch(search: MarketSearch): boolean {
  return search.query !== undefined && search.alternativeTo === undefined && search.reviewedProvidersOnly !== true && !marketHasBrowseOnlyFilters(search)
}

export function marketDocumentTitle(view: MarketView | undefined): string {
  if (view === 'providers') return 'Providers | aecon'
  if (view === 'saved') return 'Saved tools | aecon'
  return 'Browse tools | aecon'
}

export type MarketCompareEntry =
  | Readonly<{ resource: string; entry: X402DirectoryEntry; tool?: never; missing?: never }>
  | Readonly<{ resource: string; tool: PublicToolDescriptor; entry?: never; missing?: never }>
  | Readonly<{ resource: string; missing: true; entry?: never; tool?: never }>

export function parseMarketCompareRefs(value: unknown): readonly string[] | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 20_000) return undefined
  let parts: unknown = value.split(',')
  if (value.startsWith('[')) {
    try { parts = JSON.parse(value) } catch { return undefined }
  }
  if (!Array.isArray(parts) || !parts.every(part => typeof part === 'string')) return undefined
  const refs = [...new Set(parts.map((part: string) => part.trim()).filter((part: string) => part.length > 0 && part.length <= 8_192))]
  if (refs.length === 0 || refs.length > 4) return undefined
  return refs
}

/** Add or remove one Tool ref. Cap stays 4. */
export function toggleMarketCompareRef(current: readonly string[], ref: string): readonly string[] {
  if (ref.length === 0 || ref.length > 8_192) return current
  if (current.includes(ref)) return current.filter((item) => item !== ref)
  if (current.length >= 4) return current
  return [...current, ref]
}

export function marketCompareParam(refs: readonly string[]): string | undefined {
  const parsed = parseMarketCompareRefs(refs.some(ref => ref.includes(',')) ? JSON.stringify(refs) : refs.join(','))
  return parsed === undefined ? undefined : parsed.some(ref => ref.includes(',')) ? JSON.stringify(parsed) : parsed.join(',')
}

/**
 * Keep comparison and display preference on Market navigation unless explicitly set.
 * Undefined clears that value. Display preference never changes catalogue inputs.
 */
export function carryMarketCompare<const T extends Record<string, unknown>>(
  from: Readonly<{ compare?: string; layout?: 'table' | 'grid' }>,
  to: T,
): T {
  if (!Object.hasOwn(to, 'layout') && from.layout !== undefined) {
    to = { ...to, layout: from.layout }
  }
  if (Object.hasOwn(to, 'compare')) {
    const compare = to.compare
    if (typeof compare !== 'string') {
      const { compare: _compare, ...rest } = to
      return rest as T
    }
    const parsed = parseMarketCompareRefs(compare)
    if (parsed === undefined) {
      const { compare: _compare, ...rest } = to
      return rest as T
    }
    return { ...to, compare: marketCompareParam(parsed) }
  }
  if (from.compare === undefined) return to
  return { ...to, compare: from.compare }
}

const CATALOGUE_PAGE_MAX = 50
const NUMERIC_SEARCH_KEYS = ['minUsdPrice', 'maxUsdPrice', 'minPayers30d', 'maxPayers30d', 'offset'] as const

function finiteSearchNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || !/^-?(?:\d+|\d*\.\d+)$/u.test(value.trim())) return undefined
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : undefined
}

function optionalSearchBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

/** URL values are untrusted. Keep fields the catalogue schema accepts and omit the rest. */
function catalogueSearchFromUrl(search: Record<string, unknown>): Record<string, unknown> {
  const candidate: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(directoryCatalogueSearchValues(search))) {
    if (value === undefined || value === '') continue
    candidate[key] = value
  }
  for (const key of NUMERIC_SEARCH_KEYS) {
    if (!(key in candidate)) continue
    const number = finiteSearchNumber(candidate[key])
    if (number === undefined) delete candidate[key]
    else candidate[key] = number
  }
  for (const key of directoryBooleanSearchKeys) {
    if (!(key in candidate)) continue
    const flag = optionalSearchBoolean(candidate[key])
    if (flag === undefined) delete candidate[key]
    else candidate[key] = flag
  }
  if (typeof candidate.query === 'string' && candidate.sort !== undefined && candidate.sort !== 'relevance') delete candidate.sort
  if (candidate.indexCursor !== undefined && candidate.offset !== undefined) delete candidate.offset
  if (candidate.alternativeTo !== undefined && (typeof candidate.query !== 'string' || candidate.query.trim().length === 0)) delete candidate.alternativeTo
  if (typeof candidate.minUsdPrice === 'number' && typeof candidate.maxUsdPrice === 'number' && candidate.minUsdPrice > candidate.maxUsdPrice) {
    delete candidate.minUsdPrice
    delete candidate.maxUsdPrice
  }
  if (typeof candidate.minPayers30d === 'number' && typeof candidate.maxPayers30d === 'number' && candidate.minPayers30d > candidate.maxPayers30d) {
    delete candidate.minPayers30d
    delete candidate.maxPayers30d
  }
  let remaining = candidate
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const parsed = x402DirectoryCatalogueInputSchema.safeParse(remaining)
    if (parsed.success) return parsed.data
    const keys = new Set(parsed.error.issues.flatMap(issue => typeof issue.path[0] === 'string' ? [issue.path[0]] : []))
    if (keys.size === 0) {
      if ('sort' in remaining) delete remaining.sort
      else if ('offset' in remaining) delete remaining.offset
      else if ('alternativeTo' in remaining) delete remaining.alternativeTo
      else {
        delete remaining.minUsdPrice
        delete remaining.maxUsdPrice
        delete remaining.minPayers30d
        delete remaining.maxPayers30d
      }
    } else {
      for (const key of keys) delete remaining[key]
    }
    remaining = { ...remaining }
  }
  return {}
}

function cataloguePage(value: unknown): number | undefined {
  const page = finiteSearchNumber(value)
  if (page === undefined || !Number.isInteger(page) || page < 2 || page > CATALOGUE_PAGE_MAX) return undefined
  return page
}

const MARKET_SEARCH_KEYS = ['providerCursor', 'view', 'layout', 'compare', 'resource', 'page', 'save', ...directoryCatalogueSearchKeys] as const

export function validateMarketSearch(search: Record<string, unknown>): MarketSearch {
  const directory = catalogueSearchFromUrl(search)
  const providerCursor = typeof search.providerCursor === 'string' && search.providerCursor.length > 0 && search.providerCursor.length <= 16_384
    ? search.providerCursor
    : undefined
  const compareRefs = parseMarketCompareRefs(search.compare)
  const page = cataloguePage(search.page)
  const save = parseMarketSaveIntent(search.save)
  const accepted: Record<string, unknown> = {
    ...directory,
    ...(providerCursor === undefined ? {} : { providerCursor }),
    ...(search.view === 'tools' || search.view === 'providers' || search.view === 'saved' ? { view: search.view } : {}),
    ...(search.layout === 'table' || search.layout === 'grid' ? { layout: search.layout } : {}),
    ...(compareRefs === undefined ? {} : { compare: marketCompareParam(compareRefs) }),
    ...(typeof search.resource === 'string' && search.resource.length > 0 && search.resource.length <= 8_192 ? { resource: search.resource } : {}),
    ...(page === undefined ? {} : { page }),
    ...(save === undefined ? {} : { save: JSON.stringify(save) }),
  }
  // The router merges this object over the raw URL. An omitted key would keep the rejected value and the loader would throw.
  for (const key of MARKET_SEARCH_KEYS) {
    if (search[key] !== undefined && accepted[key] === undefined) accepted[key] = undefined
  }
  return accepted as MarketSearch
}

export function marketLoaderDeps(search: MarketSearch) {
  return {
    ...directoryCatalogueSearchValues(search),
    ...(search.providerCursor === undefined ? {} : { providerCursor: search.providerCursor }),
    ...(search.view === undefined ? {} : { view: search.view }),
    ...(search.compare === undefined ? {} : { compare: search.compare }),
  }
}

export function resolveMarketView(search: MarketSearch): MarketView {
  if (search.view === 'providers' || search.view === 'saved') return search.view
  if (search.providerCursor !== undefined) return 'providers'
  return 'tools'
}

async function resolveMarketCompareEntry(resource: string, signal: AbortSignal): Promise<MarketCompareEntry> {
  try {
    signal.throwIfAborted()
    if (isPublicToolRef(resource)) {
      const result = await readPublicToolDetailRouteServer({ data: { toolRef: resource }, signal })
      signal.throwIfAborted()
      return result.kind === 'found' ? { resource, tool: result.tool } : { resource, missing: true }
    }
    const result = /^registry:[a-f0-9]{64}$/u.test(resource)
      ? await readMarketExternalListingServer({ data: { id: resource }, signal })
      : await readX402DirectoryCatalogueResourceServer({ data: { resource }, signal })
    signal.throwIfAborted()
    if (result.kind === 'found' || result.kind === 'found_upstream') {
      const admitted = result.item.entry.choice
      const toolRef = result.kind === 'found' && isPublicToolRef(result.item.toolRef) ? result.item.toolRef
        : admitted?.access !== 'external_listing' && isPublicToolRef(admitted?.toolRef) ? admitted.toolRef : undefined
      if (toolRef !== undefined) {
        const detail = await readPublicToolDetailRouteServer({ data: { toolRef }, signal })
        signal.throwIfAborted()
        return detail.kind === 'found' ? { resource, tool: detail.tool } : { resource, missing: true }
      }
      return { resource, entry: result.item.entry }
    }
  } catch (cause) {
    if (signal.aborted) throw cause
    console.error('[market] comparison Tool read failed, marking selection unavailable', { resource, cause })
  }
  return { resource, missing: true }
}


/** Providers always read the host index: one implementation, paged by its own cursor. The query is a hostname prefix. */
export function marketUsesHostDirectory(search: MarketSearch): boolean {
  return resolveMarketView(search) === 'providers'
}

/** Airbnb's home pattern: titled rows of real listings lead the default browse, before any search, filter, sort or page. */
export function marketShowsLandingRows(search: MarketSearch): boolean {
  return resolveMarketView(search) === 'tools' && search.page === undefined
    && Object.values(directoryCatalogueSearchValues(search)).every(value => value === undefined || value === false)
}

/**
 * The keyword index is authoritative and awaited. The ranked search is returned as a deferred
 * promise so results render at once and ranking arrives as progressive enhancement.
 */
export async function loadMarketRouteData(deps: MarketSearch, options: MarketRouteReadOptions = {}) {
  const deadline = AbortSignal.timeout(MARKET_READ_TIMEOUT_MS)
  const signal = options.signal === undefined ? deadline : AbortSignal.any([options.signal, deadline])
  const read = <T>(fetch: () => Promise<T>) => awaitMarketRead(fetch, signal)
  const parsedCatalogue = x402DirectoryCatalogueInputSchema.safeParse(catalogueSearchFromUrl({ ...directoryCatalogueSearchValues(deps) }))
  const catalogueInput = parsedCatalogue.success ? parsedCatalogue.data : x402DirectoryCatalogueInputSchema.parse({})
  const view = resolveMarketView(deps)
  const showHosts = marketUsesHostDirectory(deps)
  const showCatalogue = !showHosts && view !== 'saved'
  const compareRefs = parseMarketCompareRefs(deps.compare) ?? []
  const unavailable = (label: string) => (cause: unknown) => {
    if (options.signal?.aborted) throw cause
    console.error(`[market] ${label} unavailable`, { cause })
    return { kind: 'unavailable' as const, reason: 'source_unavailable' as const }
  }
  const readCatalogue = (input: typeof catalogueInput) => read(() => readX402DirectoryCatalogueServer({ data: { ...input, ...(input.sort || input.query ? {} : { sort: 'adoption' as const }) }, signal })).catch(unavailable('directory catalogue'))
  const [firstCatalogue, overview, compareEntries, providers] = await Promise.all([
    showCatalogue ? readCatalogue(catalogueInput) : Promise.resolve(undefined),
    showHosts ? Promise.resolve(undefined) : read(() => readX402DirectoryCatalogueOverviewServer({ signal })).catch(unavailable('directory overview')),
    Promise.all(compareRefs.map(resource => read(() => resolveMarketCompareEntry(resource, signal)).catch(cause => {
      if (options.signal?.aborted) throw cause
      return { resource, missing: true as const }
    }))),
    showHosts ? read(() => readX402DirectoryProvidersServer({ data: {
      ...(deps.query === undefined ? {} : { providerPrefix: deps.query }),
      ...(deps.providerCursor === undefined ? {} : { providerCursor: deps.providerCursor }),
    }, signal })).catch(unavailable('directory Hosts')) : Promise.resolve(undefined),
  ])
  options.signal?.throwIfAborted()
  // A shared page link carries an index cursor. After an index refresh it no longer decodes, so show page 1.
  const cursorReset = catalogueInput.indexCursor !== undefined && firstCatalogue?.kind === 'unavailable' && firstCatalogue.reason === 'query_invalid'
  const loadedCatalogue = cursorReset ? await readCatalogue(withoutCursor(catalogueInput)) : firstCatalogue
  const canonicalSearch = view === 'tools' && marketUsesCanonicalSearch(catalogueInput) ? loadCanonicalMarketSearch(deps, options) : undefined
  const catalogue: X402DirectoryCatalogue = loadedCatalogue ?? {
    kind: 'ok' as const,
    source: 'index' as const,
    searchMethod: 'native_index' as const,
    isDone: true,
    ...(overview?.kind === 'ok' ? { coverage: overview.coverage } : {}),
    page: { kind: 'ok' as const, items: [], offset: 0, limit: 0, mode: 'browse' as const, appliedFilters: {} },
  }
  const page = catalogue.kind === 'ok'
    ? catalogue.page
    : { kind: 'unavailable' as const, reason: catalogue.reason === 'query_invalid' ? 'query_invalid' as const : 'source_unavailable' as const }
  return { page, catalogue, overview, providers, compareEntries, view, canonicalSearch, cursorReset }
}

function withoutCursor<T extends { indexCursor?: string | undefined }>({ indexCursor: _cursor, ...rest }: T): Omit<T, 'indexCursor'> {
  return rest
}

/** A failed catalogue read keeps the last loaded view. */
export function retainedMarketCatalogue<T extends Readonly<{ page: { kind: string }; catalogue: X402DirectoryCatalogue }>>(
  previous: T | undefined,
  next: T,
): Readonly<{ shown: T; retainPrevious: boolean }> {
  const catalogueFailed = next.catalogue.kind === 'unavailable' && next.catalogue.reason === 'source_unavailable'
  if (catalogueFailed && previous !== undefined && previous.page.kind === 'ok') return { shown: previous, retainPrevious: true }
  return { shown: next, retainPrevious: false }
}

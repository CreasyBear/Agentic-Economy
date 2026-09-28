import type { MarketReturnSearch } from '@/components/ae/market/market-return-context'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import {
  readX402DirectoryCatalogueOverviewServer,
  readX402DirectoryCatalogueResourceServer,
  readX402DirectoryCatalogueServer,
} from '@/modules/market/x402-directory-index.functions'
import { x402DirectoryCatalogueInputSchema, type X402DirectoryCatalogue } from '@/modules/market/x402-directory-catalogue'
import { directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation'
import { readX402MarketplaceHomeServer } from '@/modules/market/x402-marketplace-home.functions'
import type { ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'

export type MarketToolSearchState = Readonly<{
  query: string
  pages: readonly ToolChoiceSearchOutput[]
  index: number
  status: 'loading' | 'idle' | 'failed'
}>

/** Only pass refinements that the canonical mixed search applies before pagination. */
export function marketToolSearchInput(search: MarketSearch, cursor?: string) {
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
    ...(cursor === undefined ? {} : { cursor }),
  }
}

export function marketHasBrowseOnlyFilters(search: MarketSearch): boolean {
  return search.minUsdPrice !== undefined || search.maxUsdPrice !== undefined
    || search.minPayers30d !== undefined || search.maxPayers30d !== undefined
    || search.adoptionBand !== undefined || search.curatedOnly === true
    || search.hasInputFields === true || search.hasOutputFields === true
    || search.hasInputSchema === true || search.hasOutputSchema === true
    || search.hasOutputExample === true || (search.tags?.length ?? 0) > 0
    || (search.bundleSlugs?.length ?? 0) > 0
}

export type MarketSearch = MarketReturnSearch
export type MarketView = NonNullable<MarketSearch['view']>

export function marketDocumentTitle(view: MarketView | undefined): string {
  switch (view) {
    case 'discover':
      return 'Collections | Agentic Economy'
    case 'tools':
      return 'Tools | Agentic Economy'
    case 'providers':
      return 'Providers | Agentic Economy'
    case 'saved':
      return 'Saved Tools | Agentic Economy'
    case undefined:
      return 'Agent tool market | Agentic Economy'
    default: {
      const exhaustive: never = view
      return exhaustive
    }
  }
}

export type MarketCompareEntry =
  | Readonly<{ resource: string; entry: X402DirectoryEntry; missing?: never }>
  | Readonly<{ resource: string; missing: true; entry?: never }>

export function parseMarketCompareRefs(value: unknown): readonly string[] | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 20_000) return undefined
  const refs = [...new Set(value.split(',').map((part) => part.trim()).filter((part) => part.length > 0 && part.length <= 8_192))]
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
  return parseMarketCompareRefs(refs.join(','))?.join(',')
}

/**
 * Keep `compare` on Market navigations unless the next search sets it.
 * `compare: undefined` clears the set.
 */
export function carryMarketCompare<const T extends Record<string, unknown>>(
  from: Readonly<{ compare?: string }>,
  to: T,
): T {
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
    return { ...to, compare: parsed.join(',') }
  }
  if (from.compare === undefined) return to
  return { ...to, compare: from.compare }
}

export function validateMarketSearch(search: Record<string, unknown>): MarketSearch {
  const directory = x402DirectoryCatalogueInputSchema.parse(directoryCatalogueSearchValues(search))
  if (search.providerCursor !== undefined && (typeof search.providerCursor !== 'string' || search.providerCursor.length === 0 || search.providerCursor.length > 16_384)) {
    throw new Error('Invalid Provider catalogue cursor')
  }
  const compareRefs = parseMarketCompareRefs(search.compare)
  return {
    ...directory,
    ...(typeof search.providerCursor === 'string' ? { providerCursor: search.providerCursor } : {}),
    ...(search.view === 'discover' || search.view === 'tools' || search.view === 'providers' || search.view === 'saved' ? { view: search.view } : {}),
    ...(compareRefs === undefined ? {} : { compare: compareRefs.join(',') }),
    ...(typeof search.resource === 'string' && search.resource.length > 0 && search.resource.length <= 8_192 ? { resource: search.resource } : {}),
  }
}

export function marketLoaderDeps(search: MarketSearch) {
  return {
    ...directoryCatalogueSearchValues(search),
    ...(search.providerCursor === undefined ? {} : { providerCursor: search.providerCursor }),
    ...(search.view === undefined ? {} : { view: search.view }),
    ...(search.compare === undefined ? {} : { compare: search.compare }),
  }
}

function resolveMarketView(search: MarketSearch): MarketView {
  if (search.view !== undefined) return search.view
  if (search.providerCursor !== undefined) return 'providers'
  if (search.compare !== undefined || search.resource !== undefined || Object.keys(directoryCatalogueSearchValues(search)).length > 0) return 'tools'
  return 'discover'
}

async function resolveMarketCompareEntry(resource: string): Promise<MarketCompareEntry> {
  try {
    const result = await readX402DirectoryCatalogueResourceServer({ data: { resource } })
    if (result.kind === 'found' || result.kind === 'found_upstream') {
      return { resource, entry: result.item.entry }
    }
  } catch (cause) {
    console.error('[market] comparison Tool read failed, marking selection unavailable', { resource, cause })
  }
  return { resource, missing: true }
}

export async function loadMarketRouteData(deps: MarketSearch) {
  const catalogueInput = x402DirectoryCatalogueInputSchema.parse(directoryCatalogueSearchValues(deps))
  const view = resolveMarketView(deps)
  const showHome = view === 'discover'
  const compareRefs = parseMarketCompareRefs(deps.compare) ?? []
  const [catalogue, home, overview, compareEntries] = await Promise.all([
    catalogueInput.query === undefined || catalogueInput.alternativeTo !== undefined
      ? readX402DirectoryCatalogueServer({ data: { ...catalogueInput, ...(catalogueInput.sort || catalogueInput.query ? {} : { sort: view === 'tools' || view === 'providers' ? 'popular' as const : 'adoption' as const }) } })
      : Promise.resolve({ kind: 'unavailable', reason: 'canonical_search' } as const satisfies X402DirectoryCatalogue),
    showHome ? readX402MarketplaceHomeServer().catch(() => undefined) : Promise.resolve(undefined),
    readX402DirectoryCatalogueOverviewServer(),
    Promise.all(compareRefs.map(resolveMarketCompareEntry)),
  ])
  const page = catalogue?.kind === 'ok'
    ? catalogue.page
    : { kind: 'unavailable' as const, reason: catalogue?.reason === 'query_invalid' ? 'query_invalid' as const : 'source_unavailable' as const }
  return { page, catalogue, overview, home, providers: undefined, compareEntries, view }
}

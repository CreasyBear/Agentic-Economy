import type { MarketReturnSearch } from '@/components/ae/market/market-return-context'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'
import {
  readX402DirectoryCatalogueOverviewServer,
  readX402DirectoryCatalogueResourceServer,
  readX402DirectoryCatalogueServer,
  readX402DirectoryProvidersServer,
} from '@/modules/market/x402-directory-index.functions'
import { x402DirectoryCatalogueInputSchema } from '@/modules/market/x402-directory-catalogue'
import { directoryCatalogueSearchValues } from '@/modules/market/x402-directory-navigation'
import { readX402MarketplaceHomeServer } from '@/modules/market/x402-marketplace-home.functions'

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
  const [catalogue, home, overview, providers, compareEntries] = await Promise.all([
    readX402DirectoryCatalogueServer({ data: { ...catalogueInput, ...(catalogueInput.query || catalogueInput.sort ? {} : { sort: 'adoption' }) } }),
    showHome ? readX402MarketplaceHomeServer().catch(() => undefined) : Promise.resolve(undefined),
    readX402DirectoryCatalogueOverviewServer(),
    view === 'providers' && deps.query === undefined && deps.network === undefined && deps.provider === undefined && deps.maxUsdPrice === undefined && deps.directoryCategory === undefined
      ? readX402DirectoryProvidersServer({ data: { ...(deps.providerCursor === undefined ? {} : { providerCursor: deps.providerCursor }) } })
      : Promise.resolve(undefined),
    Promise.all(compareRefs.map(resolveMarketCompareEntry)),
  ])
  const page = catalogue?.kind === 'ok'
    ? catalogue.page
    : { kind: 'unavailable' as const, reason: catalogue?.reason === 'query_invalid' ? 'query_invalid' as const : 'source_unavailable' as const }
  return { page, catalogue, overview, home, providers, compareEntries, view }
}

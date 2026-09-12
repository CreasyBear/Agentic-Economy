import { x402DirectoryCatalogueInputSchema, type X402DirectoryCatalogueInput } from '@/modules/market/x402-directory-catalogue'
import { directoryArraySearchKeys, directoryBooleanSearchKeys, directoryCatalogueSearchKeys } from '@/modules/market/x402-directory-navigation'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { isMarketCategoryId, type MarketCategoryId } from '@/modules/market/listing-evidence'

declare const marketReturnContextBrand: unique symbol

export type MarketReturnContext = string & Readonly<{
  [marketReturnContextBrand]: true
}>

export type MarketReturnSearch = Readonly<X402DirectoryCatalogueInput & {
  availability?: 'routeable' | 'setup_required' | 'unavailable'
  category?: MarketCategoryId
  cursor?: string
  capability?: string
  compare?: string
  view?: "discover" | "tools" | "providers" | "saved"
  layout?: 'table' | 'grid'
  resource?: string
  providerCursor?: string
}>

export type MarketReturnNavigation = Readonly<{
  search: MarketReturnSearch
  hash?: 'tools'
}>

export const FALLBACK_MARKET_RETURN_CONTEXT = '/market#tools' as MarketReturnContext

const MAX_RETURN_CONTEXT_LENGTH = 3_000
const MARKET_CONTEXT_ORIGIN = 'https://agentic-economy.invalid'
const knownParameters = new Set([
  'query',
  'availability',
  'category',
  'cursor',
  'capability',
  'compare',
  'offset',
  'resource',
  'view', 'layout', 'providerCursor', ...directoryCatalogueSearchKeys,
])

export function buildMarketReturnContext(
  search: MarketReturnSearch,
  hash?: 'tools',
): MarketReturnContext {
  const parameters = new URLSearchParams()
  if (search.query !== undefined) parameters.set('query', search.query)
  if (search.availability !== undefined) parameters.set('availability', search.availability)
  if (search.category !== undefined) parameters.set('category', search.category)
  if (search.cursor !== undefined) parameters.set('cursor', search.cursor)
  if (search.capability !== undefined) parameters.set('capability', search.capability)
  if (search.compare !== undefined) parameters.set('compare', search.compare)
  if (search.offset !== undefined) parameters.set('offset', String(search.offset))
  if (search.resource !== undefined) parameters.set('resource', search.resource)
  for (const key of [...directoryCatalogueSearchKeys, 'view', 'layout', 'providerCursor'] as const) {
    if (search[key] !== undefined) parameters.set(key, Array.isArray(search[key]) ? JSON.stringify(search[key]) : String(search[key]))
  }
  const context = `/market?${parameters.toString()}${hash === undefined ? '' : `#${hash}`}`
  return readMarketReturnContext(context) ?? FALLBACK_MARKET_RETURN_CONTEXT
}

export function readMarketReturnContext(value: unknown): MarketReturnContext | undefined {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_RETURN_CONTEXT_LENGTH
    || !value.startsWith('/market')
    || value.startsWith('//')
  ) return undefined

  let url: URL
  try {
    url = new URL(value, MARKET_CONTEXT_ORIGIN)
  } catch {
    return undefined
  }
  if (
    url.origin !== MARKET_CONTEXT_ORIGIN
    || url.pathname !== '/market'
    || (url.hash !== '' && url.hash !== '#tools')
  ) return undefined

  for (const key of url.searchParams.keys()) {
    if (!knownParameters.has(key) || url.searchParams.getAll(key).length !== 1) return undefined
  }

  const query = url.searchParams.get('query')
  if (query !== null && (query.length === 0 || query.length > 200 || query.trim() !== query)) return undefined
  const availability = url.searchParams.get('availability')
  if (
    availability !== null
    && availability !== 'routeable'
    && availability !== 'setup_required'
    && availability !== 'unavailable'
  ) return undefined
  const category = url.searchParams.get('category')
  if (category !== null && !isMarketCategoryId(category)) return undefined
  const cursor = url.searchParams.get('cursor')
  if (cursor !== null && cursor.length > 2_000) return undefined
  const capability = url.searchParams.get('capability')
  if (capability !== null && (capability.length === 0 || capability.length > 200)) return undefined
  const compare = url.searchParams.get('compare')
  if (compare !== null && !isValidComparison(compare)) return undefined
  const offset = url.searchParams.get('offset')
  if (offset !== null && (!/^(0|[1-9]\d*)$/.test(offset) || !Number.isSafeInteger(Number(offset)))) return undefined
  const resource = url.searchParams.get('resource')
  if (resource !== null && (resource.length === 0 || resource.length > 8192)) return undefined

  const filters = readDirectoryFilters(url.searchParams)
  if (filters === undefined) return undefined
  const directoryCategory = url.searchParams.get('directoryCategory')
  if (directoryCategory !== null && (directoryCategory.length === 0 || directoryCategory.length > 80 || directoryCategory.trim() !== directoryCategory)) return undefined
  const indexCursor = url.searchParams.get('indexCursor')
  if (indexCursor !== null && (indexCursor.length === 0 || indexCursor.length > 16384)) return undefined
  if (indexCursor !== null && offset !== null && Number(offset) > 0) return undefined
  const providerCursor = url.searchParams.get('providerCursor')
  if (providerCursor !== null && (providerCursor.length === 0 || providerCursor.length > 16384)) return undefined
  const sort = url.searchParams.get('sort')
  if (sort !== null && sort !== 'relevance' && sort !== 'popular' && sort !== 'updated' && sort !== 'adoption' && sort !== 'price_asc') return undefined
  if (query !== null && sort !== null && sort !== 'relevance') return undefined
  const view = url.searchParams.get('view')
  if (view !== null && view !== 'discover' && view !== 'tools' && view !== 'providers' && view !== 'saved') return undefined
  const layout = url.searchParams.get('layout')
  if (layout !== null && layout !== 'table' && layout !== 'grid') return undefined

  return `${url.pathname}${url.search}${url.hash}` as MarketReturnContext
}

export function toMarketReturnNavigation(
  context: MarketReturnContext,
): MarketReturnNavigation {
  const url = new URL(context, MARKET_CONTEXT_ORIGIN)
  const query = url.searchParams.get('query')
  const availability = url.searchParams.get('availability')
  const category = url.searchParams.get('category')
  const cursor = url.searchParams.get('cursor')
  const capability = url.searchParams.get('capability')
  const compare = url.searchParams.get('compare')
  const offset = url.searchParams.get('offset')
  const resource = url.searchParams.get('resource')
  const directoryCategory = url.searchParams.get('directoryCategory')
  const indexCursor = url.searchParams.get('indexCursor')
  const providerCursor = url.searchParams.get('providerCursor')

  return {
    search: {
      ...readDirectoryFilters(url.searchParams),
      ...(directoryCategory === null ? {} : { directoryCategory }),
      ...(indexCursor === null ? {} : { indexCursor }),
      ...(providerCursor === null ? {} : { providerCursor }),
      ...(url.searchParams.has('sort') ? { sort: url.searchParams.get('sort') as MarketReturnSearch['sort'] } : {}),
      ...(["discover", "tools", "providers", "saved"].includes(url.searchParams.get("view") ?? "") ? { view: url.searchParams.get("view") as NonNullable<MarketReturnSearch['view']> } : {}),
      ...(url.searchParams.has('layout') ? { layout: url.searchParams.get('layout') as 'table' | 'grid' } : {}),
      ...(query === null ? {} : { query }),
      ...(availability === 'routeable'
        || availability === 'setup_required'
        || availability === 'unavailable'
        ? { availability }
        : {}),
      ...(category !== null && isMarketCategoryId(category) ? { category } : {}),
      ...(cursor === null ? {} : { cursor }),
      ...(capability === null ? {} : { capability }),
      ...(compare === null ? {} : { compare }),
      ...(offset === null ? {} : { offset: Number(offset) }),
      ...(resource === null ? {} : { resource }),
    },
    ...(url.hash === '#tools' ? { hash: 'tools' as const } : {}),
  }
}

function isValidComparison(value: string): boolean {
  const refs = value.split(',')
  return refs.length >= 2
    && refs.length <= 4
    && new Set(refs).size === refs.length
    && refs.every(isPublicToolRef)
}

function readDirectoryFilters(parameters: URLSearchParams) {
  const input: Record<string, unknown> = {}
  for (const key of directoryCatalogueSearchKeys) {
    const value = parameters.get(key)
    if (value === null) continue
    if (key === 'minUsdPrice' || key === 'maxUsdPrice' || key === 'minPayers30d' || key === 'maxPayers30d' || key === 'offset') {
      if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return undefined
      input[key] = Number(value)
    } else if (directoryBooleanSearchKeys.some(booleanKey => booleanKey === key)) {
      if (value !== 'true' && value !== 'false') return undefined
      input[key] = value === 'true'
    } else if (directoryArraySearchKeys.some(arrayKey => arrayKey === key)) {
      try { input[key] = JSON.parse(value) } catch { return undefined }
    } else input[key] = value
  }
  const parsed = x402DirectoryCatalogueInputSchema.safeParse(input)
  if (!parsed.success) return undefined
  return parsed.data
}

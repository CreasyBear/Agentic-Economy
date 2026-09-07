import { isPublicToolRef } from '@/modules/capability-supply/public'
import { marketWindowSchema, type MarketWindow } from '@/modules/market/contracts'
import { isMarketCategoryId, type MarketCategoryId } from '@/modules/market/listing-evidence'

declare const marketReturnContextBrand: unique symbol

export type MarketReturnContext = string & Readonly<{
  [marketReturnContextBrand]: true
}>

export type MarketReturnSearch = Readonly<{
  window: MarketWindow
  query?: string
  availability?: 'routeable' | 'setup_required' | 'unavailable'
  category?: MarketCategoryId
  cursor?: string
  capability?: string
  compare?: string
}>

export type MarketReturnNavigation = Readonly<{
  search: MarketReturnSearch
  hash?: 'tools'
}>

export const FALLBACK_MARKET_RETURN_CONTEXT = '/market?window=30d#tools' as MarketReturnContext

const MAX_RETURN_CONTEXT_LENGTH = 3_000
const MARKET_CONTEXT_ORIGIN = 'https://agentic-economy.invalid'
const knownParameters = new Set([
  'window',
  'query',
  'availability',
  'category',
  'cursor',
  'capability',
  'compare',
])

export function buildMarketReturnContext(
  search: MarketReturnSearch,
  hash?: 'tools',
): MarketReturnContext {
  const parameters = new URLSearchParams({ window: search.window })
  if (search.query !== undefined) parameters.set('query', search.query)
  if (search.availability !== undefined) parameters.set('availability', search.availability)
  if (search.category !== undefined) parameters.set('category', search.category)
  if (search.cursor !== undefined) parameters.set('cursor', search.cursor)
  if (search.capability !== undefined) parameters.set('capability', search.capability)
  if (search.compare !== undefined) parameters.set('compare', search.compare)
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

  const window = url.searchParams.get('window')
  if (!marketWindowSchema.safeParse(window).success) return undefined
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

  return `${url.pathname}${url.search}${url.hash}` as MarketReturnContext
}

export function toMarketReturnNavigation(
  context: MarketReturnContext,
): MarketReturnNavigation {
  const url = new URL(context, MARKET_CONTEXT_ORIGIN)
  const window = marketWindowSchema.parse(url.searchParams.get('window'))
  const query = url.searchParams.get('query')
  const availability = url.searchParams.get('availability')
  const category = url.searchParams.get('category')
  const cursor = url.searchParams.get('cursor')
  const capability = url.searchParams.get('capability')
  const compare = url.searchParams.get('compare')

  return {
    search: {
      window,
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

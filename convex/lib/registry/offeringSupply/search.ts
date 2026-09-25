import type { QueryCtx, DatabaseReader } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { type Infer } from 'convex/values'
import { compareExactAmounts, type ExactAmount } from '../../../../src/modules/money/public'
import { registrySearchTokens } from '../../../../src/modules/registry/public'
import { normalizeSearchText } from '../../../../src/modules/common/normalize-search-text'
import { searchPublicBusinessOfferingSupplyResult } from './contracts'
import { createOfferingSupplyReadPort, readOfferingSupplyForBusiness } from './reads'
import type { OfferingSupplyDto } from './contracts'
import { toConvexOfferingBusiness } from './projection'
import { matchesOfferingSupply, matchesSearchDocument, uniqueBusinessSlugs, resolveSearchLocationKey } from './matching'

type QueryInput = { cursor?: string; limit?: number }

const SEARCH_DOCUMENT_PAGE_SIZE = 50
const MAX_SEARCH_DOCUMENT_PAGES = 2
const SEARCH_CANDIDATE_SLUG_CAP = 50

async function readMatchingSearchDocuments(
  db: DatabaseReader,
  searchText: string,
  tokens: readonly string[],
  locationKey: string | undefined,
  slugCap: number,
): Promise<Doc<'registrySearchDocuments'>[]> {
  const documents: Doc<'registrySearchDocuments'>[] = []
  const slugs = new Set<string>()
  let cursor: string | null = null
  for (let pages = 0; pages < MAX_SEARCH_DOCUMENT_PAGES; pages += 1) {
    const page = await db.query('registrySearchDocuments')
      .withSearchIndex('search_searchText_by_publicStatus', (search) => search.search('searchText', searchText).eq('publicStatus', 'published'))
      .paginate({ cursor, numItems: SEARCH_DOCUMENT_PAGE_SIZE })
    for (const document of page.page) {
      if (!matchesSearchDocument(document, tokens, locationKey)) continue
      documents.push(document)
      if (document.businessSlug.length > 0) slugs.add(document.businessSlug)
      if (slugs.size >= slugCap) return documents
    }
    if (page.isDone) return documents
    if (page.continueCursor === cursor) throw new Error('registry_search_cursor_stalled')
    cursor = page.continueCursor
  }
  return documents
}

function queryInput(args: { cursor?: string; limit?: number }): QueryInput { return { ...(args.cursor === undefined ? {} : { cursor: args.cursor }), ...(args.limit === undefined ? {} : { limit: args.limit }) } }

function offeringPriceCeiling(price: OfferingSupplyDto['offerings'][number]['price']): ExactAmount | undefined {
  if (price === undefined || price.kind === 'quote_only') return undefined
  return price.kind === 'range' ? price.maximum : price.amount
}

function filterOfferingSupplyByPrice(items: readonly OfferingSupplyDto[], args: { maxPrice?: ExactAmount; hasPrice?: boolean }): readonly OfferingSupplyDto[] {
  if (args.maxPrice === undefined && args.hasPrice !== true) return items
  return items.filter((item) => {
    if (args.hasPrice === true && !item.offerings.some((offering) => offering.price !== undefined)) return false
    const maxPrice = args.maxPrice
    if (maxPrice === undefined) return true
    let hasUnpricedOffering = false
    for (const offering of item.offerings) {
      const ceiling = offeringPriceCeiling(offering.price)
      if (ceiling === undefined) {
        hasUnpricedOffering = true
        continue
      }
      if (ceiling.currency !== maxPrice.currency) continue
      const comparison = compareExactAmounts(ceiling, maxPrice)
      if (comparison !== undefined && comparison <= 0) return true
    }
    return hasUnpricedOffering
  })
}
function paginateOfferingSupply(items: readonly OfferingSupplyDto[], input: QueryInput, query?: string) {
  const limit = normalizeLimit(input.limit)
  const startIndex = input.cursor === undefined
    ? 0
    : (() => {
        const index = items.findIndex((item) => item.slug === input.cursor)
        if (index < 0) throw new Error('registry_invalid_cursor')
        return index + 1
      })()
  const pageItems = items.slice(startIndex, startIndex + limit).map(toConvexOfferingBusiness)
  const next = items.at(startIndex + pageItems.length)
  return { kind: 'ok' as const, schemaVersion: 'public-business-catalog-api:v2' as const, ...(query === undefined ? {} : { query }), items: pageItems, pagination: { ...(input.cursor === undefined ? {} : { cursor: input.cursor }), ...(next === undefined ? {} : { nextCursor: next.slug }), limit, total: items.length, hasMore: next !== undefined } }
}

export async function searchPublicBusinessOfferingSupplyHandler(ctx: QueryCtx, args: { query: string; mode?: 'near_me' | 'whole_catalogue'; location?: string; maxPrice?: ExactAmount; hasPrice?: boolean; cursor?: string; limit?: number }): Promise<Infer<typeof searchPublicBusinessOfferingSupplyResult>> {
  const needle = normalizeSearchText(args.query)
  const input = queryInput(args)
  const tokens = registrySearchTokens(needle)
  if (tokens.length === 0) return paginateOfferingSupply([], input, needle)
  const locationKey = resolveSearchLocationKey(args)
  const documents = await readMatchingSearchDocuments(ctx.db, tokens.join(' '), tokens, locationKey, SEARCH_CANDIDATE_SLUG_CAP)
  const candidateSlugs = uniqueBusinessSlugs(documents).slice(0, SEARCH_CANDIDATE_SLUG_CAP)
  const businesses = (await Promise.all(candidateSlugs.map((slug) => ctx.db.query('businesses').withIndex('by_slug', (query) => query.eq('slug', slug)).unique()))).filter((business): business is Doc<'businesses'> => business !== null)
  const offeringSupplyReadPort = createOfferingSupplyReadPort(ctx.db)
  const supply = (await Promise.all(businesses.map((business) => readOfferingSupplyForBusiness(offeringSupplyReadPort, business)))).filter((item): item is OfferingSupplyDto => item !== undefined && matchesOfferingSupply(item, tokens, locationKey))
  const items = filterOfferingSupplyByPrice(supply, args).slice().sort((left, right) => left.slug.localeCompare(right.slug))
  return paginateOfferingSupply(items, input, needle)
}

function normalizeLimit(limit: number | undefined): number { if (limit === undefined || !Number.isFinite(limit)) return 20; return Math.min(Math.max(Math.trunc(limit), 1), 50) }

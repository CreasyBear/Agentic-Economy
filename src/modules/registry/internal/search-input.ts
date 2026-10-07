import { compareExactAmounts, type ExactAmount } from '@/modules/money/public'
import type { OfferingPrice } from '@/modules/catalog/public'

/**
 * Shared with internal/search.ts (which builds and paginates search results)
 * and internal/search-documents.ts (which tokenizes and matches against
 * documents). Kept in its own leaf file so neither of those two needs to
 * import the other for this type.
 */
export type PublicBusinessCatalogSearchInput = {
  cursor?: string
  limit?: number
  query: string
  mode?: 'near_me' | 'whole_catalogue'
  location?: string
  maxPrice?: ExactAmount
  hasPrice?: boolean
}


/** A supplied ceiling requires a known comparable upper bound; prose and starting prices cannot establish one. */
export function matchesPublishedBusinessPrice(
  item: Readonly<{ offerings: readonly Readonly<{ price?: OfferingPrice }>[] }>,
  filters: Readonly<{ maxPrice?: ExactAmount; hasPrice?: boolean }>,
): boolean {
  const ceilings = item.offerings.flatMap(({ price }) => {
    if (price === undefined || price.kind === 'quote_only' || price.kind === 'from') return []
    return [price.kind === 'range' ? price.maximum : price.amount]
  })
  if (filters.hasPrice === true && ceilings.length === 0) return false
  const maxPrice = filters.maxPrice
  if (maxPrice === undefined) return true
  return ceilings.some((ceiling) => {
    const comparison = compareExactAmounts(ceiling, maxPrice)
    return comparison !== undefined && comparison <= 0
  })
}

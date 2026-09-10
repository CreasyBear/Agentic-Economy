import type { ExactAmount } from '@/modules/money/public'

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

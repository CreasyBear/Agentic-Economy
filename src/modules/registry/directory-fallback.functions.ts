import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { readPublicOfferingRegistrySearchPage } from './registry.functions'
import type { PublicBusinessCatalogApiV2Dto } from './internal/offering-api-projection'

const directoryFallbackInputSchema = z.strictObject({
  query: z.string().trim().min(1).max(2_000),
})

/** Enough to choose between, few enough to read without scrolling past the point. */
const DIRECTORY_FALLBACK_LIMIT = 4

/**
 * Filtering happens after the read, so the read has to be wider than the
 * display limit. Asking the source for exactly four and then dropping the
 * ones without a phone number reported "no businesses" while contactable
 * ones sat on the next page.
 */
const DIRECTORY_FALLBACK_CANDIDATE_LIMIT = 24

export type DirectoryFallbackBusiness = Readonly<{
  slug: string
  name: string
  suburb: string
  stateTerritory: string
  offeringName: string | undefined
  pricingSummary: string | undefined
  availabilitySummary: string | undefined
  publishedPhone: string | undefined
}>

export type DirectoryFallbackResult = Readonly<{
  kind: 'available'
  businesses: readonly DirectoryFallbackBusiness[]
  /**
   * False when nothing contactable sits in the place the customer named, so
   * the surface can say that instead of presenting Darwin to Fremantle as
   * though proximity had been considered.
   */
  matchesRequestedArea: boolean
}> | Readonly<{ kind: 'none' }>

/**
 * When AE cannot carry a Request end to end, "no business can support this"
 * is true about AE and false about the customer's problem — the directory
 * routinely holds businesses they can call today. Leaving them on a dead end
 * while knowing a plumber is the least defensible thing this product can do.
 *
 * Read-only, and deliberately not instrumented as a search gap: the customer
 * already searched once and that observation was recorded on the way in.
 */
export const readDirectoryFallbackServer = createServerFn()
  .validator((data) => directoryFallbackInputSchema.parse(data))
  .handler(async ({ data }): Promise<DirectoryFallbackResult> => {
    const page = await readPublicOfferingRegistrySearchPage({
      query: data.query,
      limit: DIRECTORY_FALLBACK_CANDIDATE_LIMIT,
    })
    return selectDirectoryFallback(page.items, data.query)
  })

/**
 * Only a business publishing a phone number belongs here. The whole point of
 * this panel is that the customer can act right now, so listing one they
 * cannot reach would recreate the dead end in a friendlier font.
 */
export function selectDirectoryFallback(
  items: readonly PublicBusinessCatalogApiV2Dto[],
  query = '',
): DirectoryFallbackResult {
  const contactable = items.flatMap((item) => {
    const business = toFallbackBusiness(item)
    return business === undefined || business.publishedPhone === undefined ? [] : [business]
  })
  if (contactable.length === 0) {
    return { kind: 'none' }
  }
  const inRequestedArea = contactable.filter((business) => isInRequestedArea(business, query))
  const matchesRequestedArea = inRequestedArea.length > 0
  const chosen = matchesRequestedArea ? inRequestedArea : contactable
  return { kind: 'available', businesses: chosen.slice(0, DIRECTORY_FALLBACK_LIMIT), matchesRequestedArea }
}

/**
 * Matched in reverse — the listing's own suburb and state are looked for in
 * the customer's words. Free-text place extraction is already attempted in
 * three other places and none of them agree; comparing against values the
 * registry actually holds needs no fourth guess.
 */
function isInRequestedArea(business: DirectoryFallbackBusiness, query: string): boolean {
  const words = new Set(query.toLowerCase().split(/[^a-z]+/i).filter((word) => word.length > 1))
  const suburbWords = business.suburb.toLowerCase().split(/[^a-z]+/i).filter((word) => word.length > 1)
  if (suburbWords.length > 0 && suburbWords.every((word) => words.has(word))) {
    return true
  }
  return words.has(business.stateTerritory.toLowerCase())
}
function toFallbackBusiness(item: PublicBusinessCatalogApiV2Dto): DirectoryFallbackBusiness | undefined {
  if (item.businessContext.kind !== 'local_human') return undefined
  const offering = item.offerings[0]
  return {
    slug: item.slug,
    name: item.name,
    suburb: item.businessContext.suburb,
    stateTerritory: item.businessContext.stateTerritory,
    offeringName: offering?.name,
    pricingSummary: offering?.pricingSummary,
    availabilitySummary: offering?.availabilitySummary,
    publishedPhone: item.businessContext.publishedPhone,
  }
}

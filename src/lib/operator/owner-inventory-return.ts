import { z } from 'zod'
import { ownerInventoryHref, ownerInventorySortSchema, type OwnerInventoryQuery } from './owner-inventory-search'

/** These are list search facts only. No return URL or other route reference is accepted. */
export const ownerInventoryReturnFields = {
  inventoryQ: z.string().max(120).optional(),
  inventorySort: ownerInventorySortSchema.optional(),
  inventoryCursor: z.string().min(1).max(10_000).optional(),
}
export const ownerInventoryReturnSchema = z.object(ownerInventoryReturnFields)
export type OwnerInventoryReturnSearch = z.infer<typeof ownerInventoryReturnSchema>
export const ownerInventoryReturnKeys = Object.keys(ownerInventoryReturnFields)

export function inventoryQueryFromReturnSearch(search: Readonly<Record<string, unknown>>): OwnerInventoryQuery | undefined {
  const parsed = ownerInventoryReturnSchema.safeParse(search)
  if (!parsed.success) return undefined
  const { inventoryQ: q, inventorySort: sort, inventoryCursor: cursor } = parsed.data
  if (q === undefined && sort === undefined && cursor === undefined) return undefined
  return { ...(q === undefined ? {} : { q }), ...(sort === undefined ? {} : { sort }), ...(cursor === undefined ? {} : { cursor }) }
}

export function ownerInventoryReturnSearch(query?: OwnerInventoryQuery): OwnerInventoryReturnSearch {
  if (query === undefined) return {}
  return ownerInventoryReturnSchema.parse({
    ...(query.q === undefined ? {} : { inventoryQ: query.q }),
    ...(query.sort === undefined ? {} : { inventorySort: query.sort }),
    ...(query.cursor === undefined ? {} : { inventoryCursor: query.cursor }),
  })
}

export function appendOwnerInventoryReturnContext(href: string, query?: OwnerInventoryQuery): string {
  if (query === undefined) return href
  // Only known owner journey routes may carry list context; external destinations stay unchanged.
  if (!/^\/owner\/(?:operations(?:\/[^/?#]+)?|settings\/integrations)(?:[?#]|$)/u.test(href)) return href
  const hashAt = href.indexOf('#')
  const hash = hashAt === -1 ? '' : href.slice(hashAt)
  const pathAndSearch = hashAt === -1 ? href : href.slice(0, hashAt)
  const queryAt = pathAndSearch.indexOf('?')
  const pathname = queryAt === -1 ? pathAndSearch : pathAndSearch.slice(0, queryAt)
  const search = new URLSearchParams(queryAt === -1 ? '' : pathAndSearch.slice(queryAt + 1))
  for (const key of ownerInventoryReturnKeys) search.delete(key)
  for (const [key, value] of Object.entries(ownerInventoryReturnSearch(query))) if (value !== undefined) search.set(key, value)
  return `${pathname}${search.size === 0 ? '' : `?${search.toString()}`}${hash}`
}

export function ownerToolSetupHref(input: Readonly<{ draft?: string; connection?: string; environment?: 'sandbox' | 'production' }>, query?: OwnerInventoryQuery): string {
  const search = new URLSearchParams()
  if (input.draft !== undefined) search.set('draft', input.draft)
  if (input.connection !== undefined) search.set('connection', input.connection)
  if (input.environment !== undefined) search.set('environment', input.environment)
  return appendOwnerInventoryReturnContext(`/owner/operations/new${search.size === 0 ? '' : `?${search.toString()}`}`, query)
}

export function ownerInventoryReturnHref(search: Readonly<Record<string, unknown>>): string {
  return ownerInventoryHref(inventoryQueryFromReturnSearch(search) ?? {})
}

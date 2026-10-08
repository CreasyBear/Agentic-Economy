import { z } from 'zod'

export const ownerInventorySortSchema = z.enum(['updated_desc', 'updated_asc', 'name_asc', 'name_desc', 'relevance'])
export type OwnerInventorySort = z.infer<typeof ownerInventorySortSchema>
export type OwnerInventoryQuery = Readonly<{ q?: string; sort?: OwnerInventorySort; cursor?: string }>

export function ownerInventoryQuery(input: Readonly<{ q?: string | undefined; sort?: OwnerInventorySort | undefined; cursor?: string | undefined }>): OwnerInventoryQuery {
  const q = input.q?.trim()
  const sort = q ? 'relevance' : input.sort === 'relevance' ? 'updated_desc' : input.sort ?? 'updated_desc'
  return { ...(q ? { q } : {}), sort, ...(input.cursor === undefined ? {} : { cursor: input.cursor }) }
}

/** Changing search or sort starts a fresh cursor chain; page links retain the current query. */
export function ownerInventoryHref(input: OwnerInventoryQuery): string {
  const query = ownerInventoryQuery(input)
  const search = new URLSearchParams()
  if (query.q) search.set('q', query.q)
  if (query.sort && query.sort !== 'updated_desc') search.set('sort', query.sort)
  if (query.cursor) search.set('cursor', query.cursor)
  return `/owner/operations${search.size === 0 ? '' : `?${search.toString()}`}`
}

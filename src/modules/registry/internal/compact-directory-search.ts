import { callPublicSourceQuery, sourceQuery, type CreatePublicConvexClientOptions } from '@/lib/server/convex-source'
import type { CompactDirectoryPage, CompactDirectoryStatus } from './compact-directory-projection'

const compactQuery = sourceQuery<{
  query: string
  paginationOpts: { cursor: string | null; numItems: number }
  actionClass?: string
  objectClass?: string
  category?: string
  provider?: string
  network?: string
  priceBand?: string
  access?: string
}, CompactDirectoryPage>('x402DirectoryIndex:searchCompact')

const statusQuery = sourceQuery<Record<string, never>, CompactDirectoryStatus>('x402DirectoryIndex:status')

export async function compactDirectoryStatus(options?: CreatePublicConvexClientOptions) {
  options?.signal?.throwIfAborted()
  const result = options === undefined ? await callPublicSourceQuery(statusQuery, {}) : await callPublicSourceQuery(statusQuery, {}, options)
  options?.signal?.throwIfAborted()
  return result
}

export async function readCompactDirectoryPage(input: {
  query: string
  cursor: string | null
  limit: number
  filters?: Readonly<{
    actionClass?: string
    objectClass?: string
    category?: string
    provider?: string
    network?: string
    priceBand?: string
    access?: string
  }>
}, options?: CreatePublicConvexClientOptions): Promise<CompactDirectoryPage> {
  options?.signal?.throwIfAborted()
  const args = {
    query: input.query,
    paginationOpts: { cursor: input.cursor, numItems: input.limit },
    ...input.filters,
  }
  const result = options === undefined ? await callPublicSourceQuery(compactQuery, args) : await callPublicSourceQuery(compactQuery, args, options)
  options?.signal?.throwIfAborted()
  return result
}

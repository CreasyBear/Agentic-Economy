import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
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

export async function compactDirectoryStatus() {
  return callPublicSourceQuery(statusQuery, {})
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
}): Promise<CompactDirectoryPage> {
  return callPublicSourceQuery(compactQuery, {
    query: input.query,
    paginationOpts: { cursor: input.cursor, numItems: input.limit },
    ...input.filters,
  })
}

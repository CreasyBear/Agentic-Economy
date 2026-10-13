import { callPublicSourceQuery, sourceQuery, type CreatePublicConvexClientOptions } from '@/lib/server/convex-source'
import type { CompactDirectoryPage, CompactDirectoryStatus } from './compact-directory-projection'
import type { z } from 'zod'
import type { externalToolDescriptionSchema } from '../tool-choice-contracts'

type DirectoryDescription = z.output<typeof externalToolDescriptionSchema>['tool']
type DirectoryDetailResult =
  | Readonly<{ kind: 'not_found' }>
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{ kind: 'found'; item: Readonly<{
    toolRef?: string
    choice?: Readonly<{ access: DirectoryDescription['access']; reason?: string }>
    entry: Pick<DirectoryDescription, 'title' | 'description' | 'provider' | 'resource' | 'method' | 'input' | 'output' | 'prices'>
  }> }>

const detailQuery = sourceQuery<{ id: string }, DirectoryDetailResult>('x402DirectoryIndex:detailById')

/** Exact active-generation read only: no URL fetch, admission, Quote or payment. */
export async function readCompactDirectoryDetail(id: string, options?: CreatePublicConvexClientOptions): Promise<DirectoryDetailResult> {
  options?.signal?.throwIfAborted()
  const result = options === undefined ? await callPublicSourceQuery(detailQuery, { id }) : await callPublicSourceQuery(detailQuery, { id }, options)
  options?.signal?.throwIfAborted()
  return result
}

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

import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { CATALOGUE_STALE_AFTER_MS, sourceFreshnessState } from '@/modules/common/freshness'
import type { SearchResult } from '../tool-choice-contracts'

export type CompactDirectoryPage =
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{
    kind: 'ok'
    page: readonly Readonly<{
      id: string
      sourceRouteRef?: string
      toolRef?: string
      title: string
      summary: string
      provider: string
      actionClass: SearchResult['actionClass']
      objectClass: SearchResult['objectClass']
      category?: string
      completedAt?: number
    }>[]
    continueCursor: string
    isDone: boolean
    coverage: Readonly<{ generation: string; completedAt: number }>
  }>

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

export type CompactDirectoryStatus = Readonly<{
  kind: 'ready' | 'unavailable'
  coverage?: { generation: string; completedAt: number }
  refreshState: 'none' | 'refreshing' | 'complete' | 'failed'
}>
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

export function compactDirectoryRows(page: Extract<CompactDirectoryPage, { kind: 'ok' }>, status: CompactDirectoryStatus, now = Date.now()): SearchResult[] {
  const freshness = {
    source: 'x402_directory' as const,
    state: sourceFreshnessState({ completedAt: page.coverage.completedAt, failed: status.refreshState === 'failed' }, CATALOGUE_STALE_AFTER_MS, now),
    completedAt: page.coverage.completedAt,
    staleAfterMs: CATALOGUE_STALE_AFTER_MS,
  }
  return page.page.flatMap(item => item.toolRef === undefined ? [{
    id: item.id,
    source: 'coinbase' as const,
    access: 'external_listing' as const,
    title: Array.from(item.title).slice(0, 72).join(''),
    summary: Array.from(item.summary).slice(0, 100).join(''),
    provider: Array.from(item.provider).slice(0, 48).join(''),
    actionClass: item.actionClass,
    objectClass: item.objectClass,
    ...(item.category === undefined ? {} : { category: Array.from(item.category).slice(0, 80).join('') }),
    readiness: 'unverified' as const,
    price: { kind: 'unavailable' as const },
    detailRef: `/api/v1/registry/detail?id=${encodeURIComponent(item.id)}`,
    next: [{ action: 'describe-external' as const, args: { id: item.id }, authority: 'public' as const }],
    freshness,
  }] : [])
}

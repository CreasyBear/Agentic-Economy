import { callPublicSourceQuery, sourceQuery } from '@/lib/server/convex-source'
import { isPublicToolRef } from '@/modules/capability-supply/public'
import { CATALOGUE_STALE_AFTER_MS, sourceFreshnessState } from '@/modules/common/freshness'
import { REFERENCE_RATE_MAX_AGE_MS, formatDisplayPrice, parseDecimalExactAmount, type ReferenceRate } from '@/modules/money/public'
import type { SearchResult } from '../tool-choice-contracts'

export type CompactDirectoryPage =
  | Readonly<{ kind: 'unavailable'; reason: string }>
  | Readonly<{
    kind: 'ok'
    page: readonly Readonly<{
      id: string
      sourceRouteRef?: string
      toolRef?: string
      choice?: Readonly<{ access: SearchResult['access']; toolRef?: string; sourceRouteRef?: string }>
      title: string
      summary: string
      provider: string
      actionClass: SearchResult['actionClass']
      objectClass: SearchResult['objectClass']
      category?: string
      completedAt?: number
      minimumUsdPrice?: string
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

export function compactDirectoryRows(page: Extract<CompactDirectoryPage, { kind: 'ok' }>, status: CompactDirectoryStatus, now = Date.now(), rate?: ReferenceRate): SearchResult[] {
  const freshness = {
    source: 'x402_directory' as const,
    state: sourceFreshnessState({ completedAt: page.coverage.completedAt, failed: status.refreshState === 'failed' }, CATALOGUE_STALE_AFTER_MS, now),
    completedAt: page.coverage.completedAt,
    staleAfterMs: CATALOGUE_STALE_AFTER_MS,
  }
  return page.page.map(item => {
    // Older pages without qualified choice never gain Call access from toolRef alone.
    const exactToolRef = item.choice?.toolRef
    const toolRef = exactToolRef !== undefined && isPublicToolRef(exactToolRef) ? exactToolRef : undefined
    // An invalid or absent join never grants the callable posture.
    const access = item.choice?.access === 'ae_callable' && toolRef === undefined
      ? 'unavailable' : item.choice?.access ?? 'external_listing'
    const amount = item.minimumUsdPrice === undefined ? undefined : parseDecimalExactAmount('USDC', item.minimumUsdPrice, 6)
    const aud = amount === undefined || rate === undefined ? undefined
      : formatDisplayPrice({ kind: 'indicative', amount, referenceRate: rate, validUntil: rate.fetchedAt + REFERENCE_RATE_MAX_AGE_MS }, now)
    return {
      id: item.id,
      source: 'coinbase' as const,
      access,
      ...(access === 'external_listing' || toolRef === undefined ? {} : { toolRef }),
      ...(item.sourceRouteRef === undefined ? {} : { sourceRouteRef: item.sourceRouteRef }),
      ...(amount === undefined ? {} : { sourcePrice: `${item.minimumUsdPrice} USDC` }),
      title: Array.from(item.title).slice(0, 72).join(''),
      summary: Array.from(item.summary).slice(0, 100).join(''),
      provider: Array.from(item.provider).slice(0, 48).join(''),
      actionClass: item.actionClass,
      objectClass: item.objectClass,
      ...(item.category === undefined ? {} : { category: Array.from(item.category).slice(0, 80).join('') }),
      readiness: access === 'ae_callable' ? 'ready' as const : access === 'unavailable' ? 'unavailable' as const : 'unverified' as const,
      price: aud !== undefined && aud.startsWith('A$') ? { kind: 'indicative' as const, label: aud } : { kind: 'unavailable' as const },
      detailRef: toolRef ?? `/api/v1/registry/detail?id=${encodeURIComponent(item.id)}`,
      next: toolRef === undefined
        ? [{ action: 'describe-external' as const, args: { id: item.id }, authority: 'public' as const }]
        : [{ action: 'describe' as const, args: { toolRef }, authority: 'public' as const }],
      freshness,
    }
  })
}

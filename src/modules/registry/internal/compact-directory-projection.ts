import { isPublicToolRef, x402NetworkLabel } from '@/modules/capability-supply/public'
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
      network?: string
      resource?: string
    }>[]
    continueCursor: string
    isDone: boolean
    coverage: Readonly<{ generation: string; completedAt: number }>
  }>

export type CompactDirectoryStatus = Readonly<{
  kind: 'ready' | 'unavailable'
  coverage?: { generation: string; completedAt: number }
  refreshState: 'none' | 'refreshing' | 'complete' | 'failed'
}>

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
    const displayPrice = amount === undefined ? undefined : formatDisplayPrice({
      kind: 'indicative',
      amount,
      ...(rate === undefined ? {} : { referenceRate: rate, validUntil: rate.fetchedAt + REFERENCE_RATE_MAX_AGE_MS }),
    }, now)
    const url = item.resource !== undefined && URL.canParse(item.resource) ? new URL(item.resource) : undefined
    const networkLabel = item.network === undefined || item.network === '*'
      ? undefined
      : x402NetworkLabel(item.network)
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
      ...(url === undefined || (url.protocol !== 'http:' && url.protocol !== 'https:') ? {} : {
        host: url.host,
        resourcePath: Array.from(url.pathname).slice(0, 512).join(''),
      }),
      ...(networkLabel === undefined || (networkLabel === item.network && item.network?.includes(':') === true)
        ? {} : { networkLabel }),
      actionClass: item.actionClass,
      objectClass: item.objectClass,
      ...(item.category === undefined ? {} : { category: Array.from(item.category).slice(0, 80).join('') }),
      readiness: access === 'ae_callable' ? 'ready' as const : access === 'unavailable' ? 'unavailable' as const : 'unverified' as const,
      price: displayPrice === undefined ? { kind: 'unavailable' as const } : { kind: 'indicative' as const, label: displayPrice },
      detailRef: toolRef ?? `/api/v1/registry/detail?id=${encodeURIComponent(item.id)}`,
      next: toolRef === undefined
        ? []
        : [{ action: 'registry.tools.describe' as const, args: { toolRef }, authority: 'public' as const }],
      freshness,
    }
  })
}

import { x402NetworkLabel } from '@/modules/capability-supply/public'
import { isPublicToolRef, parseCallableRef } from '@/modules/common/tool-ref'
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
      choice?: Readonly<{ access: SearchResult['access']; toolRef?: string; sourceRouteRef?: string; reason?: string }>
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
      payers30d?: number
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
    // A row read without a choice is not callable.
    const choice = item.choice ?? { access: 'unavailable' as const }
    // A callable row is quoted by its operation ref, or by its listing ref before publication.
    const refKind = parseCallableRef(choice.toolRef)?.kind
    const toolRef = refKind === 'operation' || refKind === 'listing' ? choice.toolRef : undefined
    // An invalid or absent ref never grants the callable posture.
    const access = choice.access === 'ae_callable' && toolRef === undefined ? 'unavailable' : choice.access
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
      ...(toolRef === undefined ? {} : { toolRef }),
      ...(choice.reason === undefined ? {} : { reason: choice.reason }),
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
      // A listing ref is unverified until its Quote reads the live 402.
      readiness: access === 'ae_callable' && refKind === 'operation' ? 'ready' as const : access === 'unavailable' ? 'unavailable' as const : 'unverified' as const,
      price: displayPrice === undefined ? { kind: 'unavailable' as const } : { kind: 'indicative' as const, label: displayPrice },
      detailRef: refKind === 'operation' && toolRef !== undefined ? toolRef : `/api/v1/registry/detail?id=${encodeURIComponent(item.id)}`,
      next: refKind === 'operation' && isPublicToolRef(toolRef)
        ? [{ action: 'registry.tools.describe' as const, args: { toolRef }, authority: 'public' as const }]
        : [],
      ...(item.payers30d === undefined ? {} : { signals: { calls: 0, payers30d: item.payers30d } }),
      freshness,
    }
  })
}

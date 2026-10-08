import type { MarketCompareEntry } from '@/modules/market/market-route-data'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

export const MARKET_COMPARE_MISSING_LABEL = 'Selected Tool unavailable'
export const MARKET_COMPARE_PENDING_LABEL = 'Loading selected Tool…'

export type UseMarketCompareInput = Readonly<{
  compare: string | undefined
  resolvedEntries: readonly MarketCompareEntry[]
  loadedEntries: readonly X402DirectoryEntry[]
}>

import { useEffect, useState } from 'react'

import type { MarketCanonicalSearchPage } from '@/modules/market/market-route-data'

export type RankedSearchSource = MarketCanonicalSearchPage | Promise<MarketCanonicalSearchPage>
export type RankedSearchState =
  | Readonly<{ status: 'off' }>
  | Readonly<{ status: 'pending' }>
  | Readonly<{ status: 'ready'; page: MarketCanonicalSearchPage }>

function isPromise(value: RankedSearchSource): value is Promise<MarketCanonicalSearchPage> {
  return typeof (value as { then?: unknown }).then === 'function'
}

/**
 * Best-match ranking arrives as a deferred loader promise. Keyword results render without
 * waiting; this reports the ranking once it settles. The loader promise never rejects.
 */
export function useRankedSearch(source: RankedSearchSource | undefined): RankedSearchState {
  const [settled, setSettled] = useState<Readonly<{ source: RankedSearchSource; page: MarketCanonicalSearchPage }>>()
  useEffect(() => {
    if (source === undefined || !isPromise(source)) return
    let live = true
    // The loader resolves on failure; a rejection still settles to "no ranking" rather than pending forever.
    source.then(
      page => { if (live) setSettled({ source, page }) },
      () => { if (live) setSettled({ source, page: { input: undefined, result: undefined } }) },
    )
    return () => { live = false }
  }, [source])
  if (source === undefined) return { status: 'off' }
  if (!isPromise(source)) return { status: 'ready', page: source }
  return settled?.source === source ? { status: 'ready', page: settled.page } : { status: 'pending' }
}

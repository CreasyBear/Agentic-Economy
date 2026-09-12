import { useHydrated, useRouter } from '@tanstack/react-router'

import type { X402DirectoryCatalogueInput } from '@/modules/market/x402-directory-catalogue'

export type MarketReturnSearch = Readonly<X402DirectoryCatalogueInput & {
  compare?: string
  view?: "discover" | "tools" | "providers" | "saved"
  layout?: 'table' | 'grid'
  resource?: string
  providerCursor?: string
}>

declare module '@tanstack/history' {
  interface HistoryState {
    /** Set on the `Link` that opens a Tool detail page from the market, so the destination can offer `router.history.back()` instead of a plain `/market` link - without putting a `from=` search param in the URL. */
    fromMarket?: true
  }
}

/** Pass as a Link's `state` prop when navigating from the market to a Tool detail page. */
export const MARKET_LINK_STATE = { fromMarket: true } as const

/**
 * "Back to results" on a Tool detail page: prefer real browser back
 * navigation (preserves the market page's scroll position and filters
 * exactly as the user left them) when it is safe to assume it lands back on
 * the market - i.e. hydrated (so this never disagrees with the server-
 * rendered markup), there is somewhere to go back to, and the entry that
 * navigated here was tagged with `MARKET_LINK_STATE`. Otherwise a plain
 * `<Link to="/market">` is always correct.
 */
export function useMarketBackNavigation(): 'history' | 'link' {
  const router = useRouter()
  const hydrated = useHydrated()
  return hydrated && router.history.length > 1 && router.state.location.state.fromMarket === true
    ? 'history'
    : 'link'
}


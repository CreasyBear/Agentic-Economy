import { createContext, use, type ReactNode } from 'react'

export type MarketPath = '/market'

const MarketNavigationContext = createContext<MarketPath>('/market')

export function MarketNavigationProvider({ path, children }: Readonly<{ path: MarketPath; children: ReactNode }>) {
  return <MarketNavigationContext value={path}>{children}</MarketNavigationContext>
}

/** Keeps every search, filter and discovery transition in the Market shell the user entered. */
export function useMarketPath(): MarketPath {
  return use(MarketNavigationContext)
}

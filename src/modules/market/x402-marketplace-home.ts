import type { X402DirectoryEntry } from './x402-directory'

/** Evidence-based marketplace shelves ordered by unique paid buyers and price. */
export const X402_MARKETPLACE_RAILS = [
  { id: 'adoption', sort: 'adoption', title: 'Most used this month', subtitle: 'Most distinct buyers in the last 30 days' },
  { id: 'active', sort: 'active', title: 'Recently paid', subtitle: 'Tools with the most recent paid calls' },
  { id: 'repeat', sort: 'repeat', title: 'Repeat buyers', subtitle: 'Buyers who come back: 5+ buyers, most calls per buyer' },
  { id: 'price_asc', sort: 'price_asc', title: 'Cheapest proven', subtitle: 'Lowest listed price first' },
] as const

export type X402MarketplaceRail = Readonly<{
  id: (typeof X402_MARKETPLACE_RAILS)[number]['id']
  sort: (typeof X402_MARKETPLACE_RAILS)[number]['sort']
  title: string
  subtitle: string
  items: readonly X402DirectoryEntry[]
}>

export type X402MarketplaceHome = Readonly<{
  observedAt: string
  rails: readonly X402MarketplaceRail[]
}>

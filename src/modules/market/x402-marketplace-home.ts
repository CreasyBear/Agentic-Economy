import type { X402DirectoryEntry, X402DirectoryInput } from './x402-directory'

/** Editorial entry points, not popularity rankings or completeness claims. */
export const X402_MARKETPLACE_COLLECTIONS = [
  { id: 'research', title: 'Find answers worth building on', description: 'Search the web, crawl sources and turn pages into useful evidence.', query: 'web search crawling research', category: 'Research', icon: 'search' },
  { id: 'finance', title: 'Make sense of the markets', description: 'Explore market data, financial signals and onchain information.', query: 'financial market data prices', category: 'Finance', icon: 'chart' },
  { id: 'creative', title: 'Bring an idea into view', description: 'Discover image generation and creative services for your next project.', query: 'image generation creative', category: 'Creative', icon: 'image' },
  { id: 'developer', title: 'Give your agent a workbench', description: 'Find code execution and development services for a bounded task.', query: 'code execution developer tools', category: 'Developer', icon: 'code' },
  { id: 'identity', title: 'Know who you are working with', description: 'Explore company information, identity checks and compliance data.', query: 'company identity compliance verification', category: 'Identity & compliance', icon: 'identity' },
  { id: 'commerce', title: 'Find the right product', description: 'Compare shopping information, product searches and commerce data.', query: 'shopping product search commerce', category: 'Commerce', icon: 'shopping' },
] as const

export type X402MarketplaceRail = Readonly<{
  id: (typeof X402_MARKETPLACE_COLLECTIONS)[number]['id']
  title: string
  description: string
  query: string
  category: string
  icon: string
  search: X402DirectoryInput
  kind: 'ok' | 'unavailable'
  items: readonly X402DirectoryEntry[]
  /** Upstream response count before the two-per-provider editorial selection. */
  returnedCount: number
  partialResults: boolean
}>

export type X402MarketplaceHome = Readonly<{
  observedAt: string
  rails: readonly X402MarketplaceRail[]
}>

import type { ReactNode } from 'react'
import type { X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import { ProductListingHeader } from '@/components/arc/market/ProductListing'

export type DirectoryHeroProps = Readonly<{
  home?: X402MarketplaceHome
  children: ReactNode
  compact?: boolean
  compactTitle?: string
  headingLevel?: 1 | 2
  onStartChat?: () => void
}>

export function DirectoryHero({ children, compactTitle = 'Tool market', headingLevel = 1 }: DirectoryHeroProps) {
  return <ProductListingHeader title={compactTitle} headingLevel={headingLevel} description="Search for a service, compare Tools, or browse the Providers behind them.">{children}</ProductListingHeader>
}

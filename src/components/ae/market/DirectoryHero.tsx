import type { ReactNode } from 'react'
import type { X402MarketplaceHome } from '@/modules/market/x402-marketplace-home'
import { MarketHero } from '@/components/arc/market/MarketHero'

export type DirectoryHeroProps = Readonly<{
  home?: X402MarketplaceHome
  children: ReactNode
  compact?: boolean
  compactTitle?: string
  headingLevel?: 1 | 2
  onStartChat?: () => void
}>

export function DirectoryHero({ children, compactTitle = 'Tool market', headingLevel = 1 }: DirectoryHeroProps) {
  return <MarketHero title={compactTitle} headingLevel={headingLevel}>{children}</MarketHero>
}

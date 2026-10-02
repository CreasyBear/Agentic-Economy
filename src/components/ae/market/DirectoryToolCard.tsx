import { memo } from 'react'

import { ProductListingCard, type ProductListingCardProps } from '@/components/arc/market/ProductListing'

/** Compatibility boundary while Tool gallery callers migrate to the Arc block. */
export const DirectoryToolCard = memo(function DirectoryToolCard(props: ProductListingCardProps) {
  return <ProductListingCard {...props} />
})

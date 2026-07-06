import { FileCheck2Icon } from 'lucide-react'
import { Banner } from '@astryxdesign/core/Banner'

import type { PublicOwnerClaimFlowInput } from '@/modules/catalog/public'

type AeReviewBlockProps = {
  value: PublicOwnerClaimFlowInput
}

export function AeReviewBlock({ value }: AeReviewBlockProps) {
  return (
    <Banner
      status="info"
      icon={<FileCheck2Icon aria-hidden="true" />}
      title="Review before publishing"
      description={
        <>
          Publishing creates a public page for {value.businessName || 'this business'} at /{value.requestedSlug || 'your-slug'}. Customers and their assistants can read the details you add here.
        </>
      }
    />
  )
}

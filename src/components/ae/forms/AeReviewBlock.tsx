import { FileCheck2Icon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import type { PublicOwnerClaimFlowInput } from '@/modules/catalog/public'

type AeReviewBlockProps = {
  value: PublicOwnerClaimFlowInput
}

export function AeReviewBlock({ value }: AeReviewBlockProps) {
  return (
    <Alert>
      <FileCheck2Icon data-icon="inline-start" aria-hidden="true" />
      <AlertTitle>Review before publishing</AlertTitle>
      <AlertDescription>
        Publishing creates a public page for {value.businessName || 'this business'} at /{value.requestedSlug || 'your-slug'}. Customers and their assistants can read the details you add here.
      </AlertDescription>
    </Alert>
  )
}

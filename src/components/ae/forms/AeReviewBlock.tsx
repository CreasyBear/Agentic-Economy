import { FileCheck2Icon } from 'lucide-react'

import type { PublicOwnerClaimFlowInput } from '@/modules/catalog/public'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

type AeReviewBlockProps = {
  value: PublicOwnerClaimFlowInput
}

export function AeReviewBlock({ value }: AeReviewBlockProps) {
  return (
    <Alert className="ae-review-block">
      <FileCheck2Icon aria-hidden="true" className="size-4" />
      <AlertTitle>Review before publishing</AlertTitle>
      <AlertDescription>
        Publishing creates a public service page for {value.businessName || 'this business'} at /{value.requestedSlug || 'your-slug'}.
        What assistants and customers will see is added later, once its checks are ready.
      </AlertDescription>
    </Alert>
  )
}

import type { PublicOwnerClaimFlowInput } from '@/modules/catalog/public'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

type AeReviewBlockProps = {
  value: PublicOwnerClaimFlowInput
}

export function AeReviewBlock({ value }: AeReviewBlockProps) {
  return (
    <Alert>
      <AlertTitle>Review before publishing</AlertTitle>
      <AlertDescription>
        Publishing creates a public service page for {value.businessName || 'this business'} at /{value.requestedSlug || 'your-slug'}.
        Registry/search and discovery files are not linked from this route until their later gates pass readback.
      </AlertDescription>
    </Alert>
  )
}

import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeOwnerOfferingsList } from '@/components/ae/offerings/AeOwnerOfferings'

export function AeProviderWorkspaceSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="My tools"
      description="Manage the Tools buyers can find and call."
      currentPath="/owner/operations"
    >
      <AeOwnerOfferingsList offerings={[]} loading />
    </AeOperatorPage>
  )
}

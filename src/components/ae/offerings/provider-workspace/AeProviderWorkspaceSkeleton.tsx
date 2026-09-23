import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeOwnerOfferingsList } from '@/components/ae/offerings/AeOwnerOfferings'

export function AeProviderWorkspaceSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Tools"
      description="Publish the exact tools agents can inspect and call."
      currentPath="/owner/operations"
    >
      <AeOwnerOfferingsList offerings={[]} loading />
    </AeOperatorPage>
  )
}

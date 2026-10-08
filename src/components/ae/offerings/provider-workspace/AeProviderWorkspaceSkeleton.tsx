import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { OperatorRoutePending } from '@/components/ae/layout/AeRoutePending'

export function AeProviderWorkspaceSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Tools"
      description="Manage the Tools buyers can find and call."
      currentPath="/owner/operations"
    >
      <OperatorRoutePending preset="table" />
    </AeOperatorPage>
  )
}

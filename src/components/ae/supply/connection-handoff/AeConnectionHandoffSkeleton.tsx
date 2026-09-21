import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Skeleton } from '@/components/ui/skeleton'

export function AeConnectionHandoffSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Connect Provider"
      description="Connect the credential required by this Provider source."
      currentPath="/owner/operations/new"
      breadcrumbs={[{ label: 'My tools', href: '/owner/operations' }, { label: 'Add Tool', href: '/owner/operations/new' }, { label: 'Connect Provider' }]}
    >
      <AeSettingsStack>
        <div className="grid max-w-xl gap-5">
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-10 w-full" />
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-10 w-36" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </AeSettingsStack>
    </AeOperatorPage>
  )
}

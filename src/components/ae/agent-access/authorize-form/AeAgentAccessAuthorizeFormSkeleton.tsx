import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection, AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Skeleton } from '@/components/ui/skeleton'

export function AeAgentAccessAuthorizeFormSkeleton() {
  return (
    <AeOperatorPage operatorRole="owner" title="Review agent access" description="Choose what this agent may do, then approve or decline." currentPath="/agent-access">
      <AeSettingsStack>
        <div className="grid overflow-hidden rounded-xl border border-border bg-card shadow-soft">
          <AeSection title="Loading access request" description="Preparing connection choices." className="p-4 sm:p-5">
            <div className="grid gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </AeSection>
          <div className="flex gap-3 border-t border-border bg-muted/20 p-4 sm:px-5">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </AeSettingsStack>
    </AeOperatorPage>
  )
}

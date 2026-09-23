import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeSection, AeSettingsStack } from '@/components/ae/layout/AeSection'
import { Skeleton } from '@/components/ui/skeleton'

export function AeAgentAccessAuthorizeFormSkeleton() {
  return (
    <AeOperatorPage operatorRole="owner" title="Review Agent access" description="Choose what this Agent may do, then approve or decline." currentPath="/agent-access">
      <AeSettingsStack>
        <div className="flex max-h-[min(40rem,calc(100dvh-12rem))] flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="shrink-0 p-4 sm:p-5">
            <AeSection title="Loading access request" description="Preparing connection choices.">
              <div className="grid gap-3">
                <Skeleton className="h-24 w-full" />
              </div>
            </AeSection>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 sm:px-5">
            <div className="grid gap-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </div>
          <div className="flex shrink-0 gap-3 border-t border-border bg-muted/20 p-4 sm:px-5">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-24" />
          </div>
        </div>
      </AeSettingsStack>
    </AeOperatorPage>
  )
}

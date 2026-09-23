import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSiteAuthPanel, AeSiteAuthStage } from '@/components/ae/website'
import { Skeleton } from '@/components/ui/skeleton'

export function AeOnboardingPageSkeleton() {
  return (
    <AePublicPage>
      <AeSiteAuthStage labelledBy="onboarding-context-heading" url="/onboarding">
        <AeSiteAuthPanel
          eyebrow="Account"
          title="Finish workspace"
          titleId="onboarding-context-heading"
          body="Choose how you’ll use Agentic Economy and name your workspace."
        >
          <div className="grid min-h-96 gap-section">
            <div className="grid gap-related">
              <Skeleton className="h-4 w-24" />
              <div className="grid grid-cols-2 gap-2">
                <Skeleton className="h-0.5 w-full" />
                <Skeleton className="h-0.5 w-full" />
              </div>
            </div>
            <div className="grid gap-section">
              <Skeleton className="min-h-touch w-full rounded-md" />
              <Skeleton className="min-h-touch w-full rounded-md" />
              <Skeleton className="min-h-touch w-full" />
            </div>
          </div>
        </AeSiteAuthPanel>
      </AeSiteAuthStage>
    </AePublicPage>
  )
}

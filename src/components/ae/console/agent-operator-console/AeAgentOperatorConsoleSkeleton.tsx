import { AeSection } from '@/components/ae/layout/AeSection'
import { Skeleton } from '@/components/ui/skeleton'

export function AeAgentOperatorConsoleSkeleton() {
  return (
    <div className="grid gap-8">
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      <div className="grid gap-4" aria-hidden>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-24 w-full" />
      </div>
      <AeSection
        id="revoke"
        title="Agents"
        description="Review each independent agent, its current credential generation, activity, and connection state. Historical credentials stay attached to the same Agent."
      >
        <div className="flex justify-end" aria-hidden>
          <Skeleton className="h-touch w-44" />
        </div>
        <div className="grid gap-2" aria-hidden>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      </AeSection>
    </div>
  )
}

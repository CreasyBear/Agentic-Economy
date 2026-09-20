import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Skeleton } from '@/components/ui/skeleton'

export function AeAgentAccessHomeSkeleton() {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Agents"
      description="Connect Agents, review requests, and control what each Agent can do."
      currentPath="/agent-access"
    >
      <div className="grid gap-section">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-10 w-40" />
      </div>
    </AeOperatorPage>
  )
}

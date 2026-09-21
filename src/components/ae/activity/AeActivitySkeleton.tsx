import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'

export function AeActivitySkeleton() {
  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Calls"
      description="Review Calls that need attention, then inspect recent outcomes and receipts."
      currentPath="/activity"
    >
      <div className="grid gap-section animate-pulse">
        <div className="min-h-[3rem] rounded-card border border-border bg-muted/30" />
        <div className="grid gap-related">
          <div className="h-8 w-48 rounded bg-muted/40" />
          <div className="min-h-[12rem] rounded-md border border-border bg-muted/20" />
        </div>
        <div className="grid gap-related">
          <div className="h-8 w-40 rounded bg-muted/40" />
          <div className="min-h-[12rem] rounded-md border border-border bg-muted/20" />
        </div>
        <div className="grid gap-related sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="min-h-[5rem] rounded-md border border-border bg-muted/20" />
          ))}
        </div>
      </div>
    </AeOperatorPage>
  )
}

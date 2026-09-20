import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

import { statusPageDescription } from './system-status.contracts'

export function AeSystemStatusSkeleton() {
  return (
    <AePublicPage
      kind="document"
      eyebrow="System status"
      title="All systems operational."
      description={statusPageDescription}
      actions={
        <Button type="button" variant="outline" className="min-h-touch" disabled>
          Refresh status
        </Button>
      }
    >
      <div className="ae-rail pb-page">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <li key={index} className="flex min-h-touch flex-wrap items-center gap-intra px-gutter py-intra">
                <div className="min-w-0 flex-1 grid gap-1">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-full max-w-md" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-related flex flex-wrap items-center justify-between gap-intra">
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
    </AePublicPage>
  )
}

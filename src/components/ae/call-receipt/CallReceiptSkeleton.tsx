import { Skeleton } from '@/components/ui/skeleton'
import './ReceiptComposition.css'

const SUMMARY_FACT_ROWS = 6

function SummaryFactRowSkeleton() {
  return (
    <div className="grid gap-intra sm:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)] sm:gap-related">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-4 w-full max-w-md" />
    </div>
  )
}

export function CallReceiptSkeleton() {
  return (
    <div
      role="status"
      className="arc-market arc-call-receipt"
      aria-busy="true"
      aria-label="Loading call receipt"
    >
      <section className="arc-market arc-call-summary" aria-hidden="true">
        <Skeleton className="h-6 w-32 rounded-full" />
        <Skeleton className="h-7 w-48 max-w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="grid gap-related">
          {Array.from({ length: SUMMARY_FACT_ROWS }, (_, index) => (
            <SummaryFactRowSkeleton key={index} />
          ))}
          <div className="grid gap-intra sm:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)] sm:gap-related">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-24 font-mono" />
          </div>
        </div>
      </section>

      <section
        className="arc-market arc-call-issue"
        aria-hidden="true"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="grid gap-intra">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
        <Skeleton className="h-10 w-full rounded-card" />
      </section>

      <section className="arc-market arc-call-money-comparison" aria-hidden="true">
        {(['Before', 'After'] as const).map((stack) => (
          <div key={stack} className="arc-call-money-group">
            <Skeleton className="h-5 w-40" />
            <div className="grid gap-related">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="grid gap-intra sm:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)] sm:gap-related">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-24 font-mono" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section
        className="arc-market arc-call-recovery"
        aria-hidden="true"
      >
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-10 w-36" />
      </section>

      <section className="arc-call-disclosure" aria-hidden="true">
        <Skeleton className="min-h-touch h-touch w-44" />
      </section>
    </div>
  )
}

import { Skeleton } from '@/components/arc/skeleton/skeleton'
import './ReceiptComposition.css'

const SUMMARY_FACT_ROWS = 6

function SummaryFactRowSkeleton() {
  return (
    <div className="grid gap-intra sm:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)] sm:gap-related">
      <Skeleton lines={1} />
      <Skeleton lines={1} />
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
        <Skeleton lines={1} />
        <Skeleton lines={1} />
        <Skeleton lines={1} />
        <div className="grid gap-related">
          {Array.from({ length: SUMMARY_FACT_ROWS }, (_, index) => (
            <SummaryFactRowSkeleton key={index} />
          ))}
          <div className="grid gap-intra sm:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)] sm:gap-related">
            <Skeleton lines={1} />
            <Skeleton lines={1} />
          </div>
        </div>
      </section>

      <section
        className="arc-market arc-call-issue"
        aria-hidden="true"
      >
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="grid gap-intra">
            <Skeleton lines={1} />
            <Skeleton lines={1} />
          </div>
        ))}
        <Skeleton lines={1} />
      </section>

      <section className="arc-market arc-call-money-comparison" aria-hidden="true">
        {(['Before', 'After'] as const).map((stack) => (
          <div key={stack} className="arc-call-money-group">
            <Skeleton lines={1} />
            <div className="grid gap-related">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="grid gap-intra sm:grid-cols-[minmax(8rem,0.45fr)_minmax(0,1fr)] sm:gap-related">
                  <Skeleton lines={1} />
                  <Skeleton lines={1} />
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
        <Skeleton lines={1} />
        <Skeleton lines={1} />
      </section>

      <section className="arc-call-disclosure" aria-hidden="true">
        <Skeleton lines={1} />
      </section>
    </div>
  )
}

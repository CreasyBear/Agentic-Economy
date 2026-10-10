import { Skeleton } from '@/components/arc/skeleton/skeleton'
export function PlanReceiptSkeleton() {
  return <section aria-label="Loading individual Call receipts" aria-busy="true" className="grid min-h-64 gap-4">
    <Skeleton lines={2} /><div className="rounded-lg border border-border p-4"><Skeleton lines={6} /></div>
  </section>
}

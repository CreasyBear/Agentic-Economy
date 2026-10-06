import { DecisionPanel } from '@/components/ae/shared/arc-pro/chat/DecisionPanel'
import { Skeleton } from '@/components/arc/skeleton/skeleton'

export function PlanConfirmationSkeleton() {
  return (
    <DecisionPanel role="status" aria-label="Loading Plan confirmation" aria-busy="true">
      <div aria-hidden="true" className="grid min-w-0 gap-5">
        <header className="arc-decision-header">
          <Skeleton lines={1} className="w-48" label="Loading Plan confirmation" />
          <Skeleton lines={1} className="w-32" label="Loading approval status" />
        </header>
        <div className="arc-decision-body">
          <dl className="arc-decision-facts">
            {['total', 'expiry', 'reference', 'digest'].map((item) => (
              <div key={item}>
                <Skeleton lines={1} className="w-24" label="Loading Plan details" />
                <Skeleton lines={1} className="w-40" label="Loading Plan details" />
              </div>
            ))}
          </dl>
          <div className="grid min-w-0 gap-3">
            <Skeleton lines={1} className="w-32" label="Loading Plan stages" />
            <div className="grid min-w-0 grid-cols-2 gap-3">
              {['first-stage', 'next-stage'].map((stage) => (
                <div key={stage} className="grid min-w-0 gap-2 rounded-card border border-border p-3">
                  <Skeleton lines={1} className="w-24" label="Loading Plan stages" />
                  <Skeleton lines={2} label="Loading Plan stages" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 gap-3">
            <Skeleton lines={1} className="w-36" label="Loading Node ceilings" />
            <div className="grid min-w-0 gap-3">
              {['first-node', 'second-node', 'third-node'].map((node) => (
                <div key={node} className="grid min-w-0 gap-3 rounded-card border border-border bg-muted/30 p-4">
                  <div className="flex min-w-0 justify-between gap-2">
                    <Skeleton lines={2} className="w-40" label="Loading Node ceiling" />
                    <Skeleton lines={1} className="w-24" label="Loading Node ceiling" />
                  </div>
                  <Skeleton lines={2} label="Loading Node details" />
                </div>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 gap-3">
            <Skeleton lines={1} className="w-52" label="Loading data-flow disclosures" />
            <Skeleton lines={3} label="Loading data-flow disclosures" />
          </div>
          <Skeleton lines={2} label="Loading approval explanation" />
        </div>
        <div className="arc-decision-actions">
          <Skeleton lines={1} className="w-36" label="Loading approval actions" />
          <Skeleton lines={1} className="w-28" label="Loading approval actions" />
        </div>
      </div>
    </DecisionPanel>
  )
}

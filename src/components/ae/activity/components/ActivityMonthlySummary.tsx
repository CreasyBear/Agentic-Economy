import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'

import { ACTIVITY_TACTILE_PRESS_CLASS, type ActivityMonthlySummaryProps } from '../activity.contracts'

function ActivityMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="grid gap-intra rounded-md border border-border px-gutter py-related">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-mono text-lg tabular-nums text-foreground">{value}</span>
    </div>
  )
}

export function ActivityMonthlySummary({
  periodStart,
  monthly,
  retryPending,
  onRetry,
}: ActivityMonthlySummaryProps) {
  return (
    <AeSection title="This month" description={`Account-level Call and spend summary for ${periodStart}.`}>
      {monthly.unavailable ? (
        <Alert>
          <AlertTitle>Some summaries are unavailable</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              Call history is still on this page. A$0.00 affected — your account balance is unchanged.
              Check your connection and try refreshing summaries again.
            </span>
            <Button
              type="button"
              variant="secondary"
              className={ACTIVITY_TACTILE_PRESS_CLASS}
              disabled={retryPending}
              onClick={onRetry}
            >
              {retryPending ? 'Refreshing…' : 'Refresh summaries'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-related sm:grid-cols-2 lg:grid-cols-4">
        <ActivityMetric label="Calls" value={monthly.callCountLabel} />
        <ActivityMetric label="Completed" value={monthly.completedLabel} />
        <ActivityMetric label="Needs attention" value={monthly.attentionLabel} />
        <ActivityMetric label="Account spend" value={monthly.spendLabel} />
      </div>
    </AeSection>
  )
}

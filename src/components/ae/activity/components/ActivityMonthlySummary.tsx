import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'

import './ActivitySummaryComposition.css'

import type { ActivityMonthlySummaryProps } from '../activity.contracts'

function ActivityMetric({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="arc-activity-monthly-summary__metric">
      <dt className="arc-activity-monthly-summary__label">{label}</dt>
      <dd className="arc-activity-monthly-summary__value">{value}</dd>
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
              disabled={retryPending}
              aria-busy={retryPending || undefined}
              onClick={onRetry}
            >
              {retryPending ? 'Refreshing…' : 'Refresh summaries'}
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <dl className="arc-market arc-activity-monthly-summary">
        <ActivityMetric label="Calls" value={monthly.callCountLabel} />
        <ActivityMetric label="Completed" value={monthly.completedLabel} />
        <ActivityMetric label="Needs attention" value={monthly.attentionLabel} />
        <ActivityMetric label="Account spend" value={monthly.spendLabel} />
      </dl>
    </AeSection>
  )
}

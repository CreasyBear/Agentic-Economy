import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { MetricsSummary } from '@/components/arc/blocks/metrics-dashboard/metrics-dashboard'

import './ActivitySummaryComposition.css'

import type { ActivityMonthlySummaryProps } from '../activity.contracts'

export function ActivityMonthlySummary({
  periodStart,
  monthly,
  retryPending,
  onRetry,
}: ActivityMonthlySummaryProps) {
  return (
    <AeSection title="Period totals" description={`${monthly.scopeLabel}. ${periodStart}. Recorded Call counts cover the full period, including unloaded Calls and all statuses.`}>
      {monthly.unavailable ? (
        <Alert>
          <AlertTitle>{monthly.windowTooLarge ? 'Choose a shorter period for totals' : 'Some summaries are unavailable'}</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            <span>
              {monthly.windowTooLarge ? 'The selected period is too large to confirm complete totals. Choose a shorter period; paginated history remains available.'
                : 'Available Call history remains on this page. Missing totals are shown as unavailable. Try refreshing summaries or choose a shorter period.'}
            </span>
            {!monthly.windowTooLarge ? <Button
              type="button"
              variant="secondary"
              disabled={retryPending}
              aria-busy={retryPending || undefined}
              onClick={onRetry}
            >
              {retryPending ? 'Refreshing…' : 'Refresh summaries'}
            </Button> : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="arc-market arc-activity-monthly-summary">
        <MetricsSummary cards={[
          { label: 'Calls', value: monthly.callCountLabel },
          { label: 'Completed', value: monthly.completedLabel },
          { label: 'Refused', value: monthly.refusedLabel },
          { label: 'Outcome unknown', value: monthly.attentionLabel },
          { label: 'Recorded delivered requests', value: monthly.deliveredRequestLabel },
          { label: monthly.spendTitle, value: monthly.spendLabel },
        ]} />
      </div>
      <p className="text-xs text-muted-foreground">{monthly.spendBasis} Call completion does not by itself confirm delivery or settlement.</p>
      <p className="text-xs text-muted-foreground">{monthly.serviceUnitCoverageLabel}</p>
    </AeSection>
  )
}

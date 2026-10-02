import { Progress } from '@/components/ui/progress'

import type { SpendingMonthlyQuotaGaugeProps } from '../spending-limits-form.contracts'
import '../SpendingReadoutComposition.css'

export function SpendingMonthlyQuotaGauge({
  label,
  toneClass,
  approachingCopy,
  progressValue,
  progressAriaLabel,
}: SpendingMonthlyQuotaGaugeProps) {
  return (
    <div className="arc-market arc-spending-quota">
      <p className={`arc-spending-quota-label text-muted-foreground ${toneClass}`}>
        <span>{label}</span>
      </p>
      {approachingCopy !== undefined ? (
        <p className="arc-spending-quota-warning">{approachingCopy}</p>
      ) : null}
      <Progress
        className="arc-spending-quota-track"
        value={progressValue}
        aria-label={progressAriaLabel}
      />
    </div>
  )
}

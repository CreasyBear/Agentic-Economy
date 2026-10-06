import { AeApproximateQuotaMeter } from '@/components/ae/shared/usage-meter/AeApproximateQuotaMeter'

import type { SpendingMonthlyQuotaGaugeProps } from '../spending-limits-form.contracts'
import '../SpendingReadoutComposition.css'

export function SpendingMonthlyQuotaGauge({
  label,
  toneClass,
  approachingCopy,
  progressValue,
  progressAriaLabel,
  limitState,
}: SpendingMonthlyQuotaGaugeProps) {
  return (
    <div className="arc-market arc-spending-quota">
      <p className={`arc-spending-quota-label text-muted-foreground ${toneClass}`}>
        <span>{label}</span>
      </p>
      {approachingCopy !== undefined ? (
        <p className="arc-spending-quota-warning">{approachingCopy}</p>
      ) : null}
      {limitState === undefined ? null : <AeApproximateQuotaMeter
        label="Monthly settled spend"
        summary={`${progressAriaLabel}. ${limitState === 'under' ? 'Under the limit.' : limitState === 'at' ? 'At the limit.' : 'Over the limit.'}`}
        percentage={progressValue}
        limitState={limitState}
      />}
    </div>
  )
}

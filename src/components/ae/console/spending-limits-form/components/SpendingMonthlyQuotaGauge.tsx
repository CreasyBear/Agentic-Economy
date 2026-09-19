import { Progress } from '@/components/ui/progress'

import type { SpendingMonthlyQuotaGaugeProps } from '../spending-limits-form.contracts'

export function SpendingMonthlyQuotaGauge({
  label,
  toneClass,
  approachingCopy,
  progressValue,
  progressAriaLabel,
}: SpendingMonthlyQuotaGaugeProps) {
  return (
    <div className="grid min-h-[2.75rem] gap-1.5">
      <p className={`text-xs text-muted-foreground ${toneClass}`}>
        <span className="font-mono tabular-nums text-foreground">{label}</span>
      </p>
      {approachingCopy !== undefined ? (
        <p className="text-xs text-destructive">{approachingCopy}</p>
      ) : null}
      <Progress
        className="h-1.5"
        value={progressValue}
        aria-label={progressAriaLabel}
      />
    </div>
  )
}

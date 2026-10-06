import type { AeApproximateQuotaMeterProps } from './usage-meter.contracts'
import styles from './usage-meter.module.css'

export function AeApproximateQuotaMeter({
  label,
  percentage,
  limitState,
  summary,
}: AeApproximateQuotaMeterProps) {
  const status = limitState === 'under' ? 'ok' : limitState === 'at' ? 'near' : 'over'
  const width = `${Math.min(100, Math.max(0, percentage))}%`

  return (
    <div
      className={styles.meter}
      role="img"
      aria-label={summary}
      aria-description={label}
      data-density="compact"
      data-status={status}
      data-limit-state={limitState}
    >
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width }} />
      </span>
    </div>
  )
}

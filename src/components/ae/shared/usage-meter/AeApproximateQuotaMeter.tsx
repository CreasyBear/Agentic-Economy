import type { AeApproximateQuotaMeterProps } from './usage-meter.contracts'
import styles from './usage-meter.module.css'

export function AeApproximateQuotaMeter({
  label,
  percentage,
  limitState,
  summary,
  density = 'compact',
}: AeApproximateQuotaMeterProps) {
  const status = limitState === 'under' ? 'ok' : limitState === 'at' ? 'near' : 'over'
  const fill = <span className={styles.fill} style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} />

  if (density === 'compact') {
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
        <span className={styles.track} aria-hidden="true">{fill}</span>
      </div>
    )
  }

  const badge = limitState === 'over' ? 'Over limit' : limitState === 'at' ? 'Limit reached' : null
  return (
    <div className={styles.meter} role="group" aria-label={label} data-status={status} data-limit-state={limitState}>
      <span className={styles.track} role="img" aria-label={summary}>{fill}</span>
      {badge === null ? null : <span className={styles.badge}>{badge}</span>}
    </div>
  )
}

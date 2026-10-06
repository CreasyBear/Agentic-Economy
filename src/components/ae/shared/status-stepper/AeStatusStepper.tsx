import type { KeyboardEvent, ReactNode } from 'react'

import styles from './status-stepper.module.css'
import type { AeStatusStepperProps, AeStatusStepperStatus } from './status-stepper.contracts'

const statusText: Record<AeStatusStepperStatus, string> = {
  complete: 'Completed',
  current: '',
  upcoming: 'Not started',
  error: 'Error',
}

export function AeStatusStepper({
  steps,
  current,
  onStepSelect,
  canSelectStep,
  label = 'Progress',
  completeLabel = 'All steps complete',
  announceLabel,
  className,
}: AeStatusStepperProps) {
  const count = steps.length
  const hasExplicitStatuses = steps.some((step) => step.status !== undefined)
  const active = Math.min(Math.max(Math.round(current), 0), count)
  const statusAt = (index: number): AeStatusStepperStatus => {
    const step = steps[index]
    if (!step) return 'upcoming'
    if (step.status !== undefined) return step.status
    if (hasExplicitStatuses) return step.error ? 'error' : index === active ? 'current' : 'upcoming'
    return step.error ? 'error' : index < active ? 'complete' : index === active ? 'current' : 'upcoming'
  }
  const done = hasExplicitStatuses
    ? count > 0 && steps.every((_, index) => statusAt(index) === 'complete')
    : active >= count
  const explicitCurrent = hasExplicitStatuses ? steps.findIndex((_, index) => statusAt(index) === 'current') : -1
  const displayIndex = explicitCurrent >= 0 ? explicitCurrent : active
  const now = done ? undefined : steps[displayIndex]
  const liveText = announceLabel ?? (done
    ? completeLabel
    : now
      ? `Step ${displayIndex + 1} of ${count}: ${now.label}${hasExplicitStatuses && now.statusLabel ? `, ${now.statusLabel}` : ''}`
      : `${steps.filter((_, index) => statusAt(index) === 'complete').length} of ${count} steps complete`)

  function onKeyDown(event: KeyboardEvent<HTMLOListElement>) {
    const back = ['ArrowUp', 'ArrowLeft']
    const ahead = ['ArrowDown', 'ArrowRight']
    if (![...back, ...ahead, 'Home', 'End'].includes(event.key)) return
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-reachable]'))
    const at = targets.indexOf(event.target as HTMLButtonElement)
    if (at < 0) return
    event.preventDefault()
    const next = event.key === 'Home' ? 0
      : event.key === 'End' ? targets.length - 1
        : back.includes(event.key) ? Math.max(0, at - 1) : Math.min(targets.length - 1, at + 1)
    targets[next]?.focus()
  }

  const interactive = Boolean(onStepSelect)
  const Root = interactive ? 'nav' : 'div'
  const classes = [styles.root, className].filter(Boolean).join(' ')
  return <Root className={classes} aria-label={label} role={interactive ? undefined : 'group'}>
    <ol className={styles.list} onKeyDown={interactive ? onKeyDown : undefined}>
      {steps.map((step, index) => {
        const status = statusAt(index)
        const isCurrent = status === 'current'
        const canSelect = canSelectStep?.(index)
        const defaultReachable = hasExplicitStatuses ? status === 'complete' || isCurrent : index <= active
        const defaultClickable = hasExplicitStatuses ? status === 'complete' : index < active
        const reachable = canSelectStep ? canSelect === true : defaultReachable
        const clickable = interactive && (canSelectStep ? canSelect === true : defaultClickable)
        const detail = step.error ?? step.description
        const statusAnnouncement = step.statusLabel ?? statusText[status]
        const glyph: ReactNode = status === 'complete' ? '✓' : status === 'error' ? '!' : index + 1
        const connectorComplete = hasExplicitStatuses ? status === 'complete' : index < active

        return <li key={step.id} className={styles.item} data-status={status} data-connector-complete={connectorComplete || undefined}>
          {index < count - 1 ? <span className={styles.connector} aria-hidden="true" /> : null}
          {interactive
            ? <button type="button" className={styles.head} data-clickable={clickable || undefined} data-reachable={reachable || undefined}
              aria-current={isCurrent ? 'step' : undefined} aria-disabled={clickable ? undefined : true}
              tabIndex={clickable ? undefined : -1} onClick={clickable ? () => onStepSelect?.(index) : undefined}>
              <span className={styles.marker} aria-hidden="true">{glyph}</span>
              <span className={styles.text}>
                <span className={styles.label}>{step.label}</span>
                {statusAnnouncement ? <span className={styles.srOnly}>, {statusAnnouncement}</span> : null}
                {detail ? <span className={step.error ? styles.error : styles.description}>{detail}</span> : null}
              </span>
            </button>
            : <span className={styles.head} aria-current={isCurrent ? 'step' : undefined}>
              <span className={styles.marker} aria-hidden="true">{glyph}</span>
              <span className={styles.text}>
                <span className={styles.label}>{step.label}</span>
                {statusAnnouncement ? <span className={styles.srOnly}>, {statusAnnouncement}</span> : null}
                {detail ? <span className={step.error ? styles.error : styles.description}>{detail}</span> : null}
              </span>
            </span>}
        </li>
      })}
    </ol>
    <span className={styles.srOnly} aria-live="polite">{liveText}</span>
  </Root>
}

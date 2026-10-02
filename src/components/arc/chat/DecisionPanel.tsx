/* Arc Pro agent-run approval/result frame, retrieved 2026-10-01.
 * Upstream TSX SHA-256 96602fbaeed56985f7783c444e950b59eecd38d08ee073f0646635e2b137ee7f.
 * The simulated run clock, progress, counters and acknowledgements are omitted.
 */
import type { ComponentPropsWithoutRef } from 'react'
import './DecisionPanel.css'

/**
 * Requires: children supply authoritative facts, accessible headings and real actions.
 * Ensures: the authored Arc review/result frame themes all four real decision callers.
 * Invariant: native attributes, disabled state, focus targets and callbacks stay caller-owned.
 * On violation: no presentation fallback invents availability, success, price or retry.
 */
export function DecisionPanel({ children, className, ...props }: ComponentPropsWithoutRef<'section'>) {
  return <section {...props} className={['arc-market arc-chat arc-decision-panel', className].filter(Boolean).join(' ')}>{children}</section>
}

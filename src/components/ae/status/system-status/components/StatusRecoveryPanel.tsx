import { Link } from '@tanstack/react-router'


import type { StatusRecoveryPanelProps } from '../system-status.contracts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import '../../StatusComposition.css'

export function StatusRecoveryPanel({ recovery }: StatusRecoveryPanelProps) {
  return (
    <section
      aria-labelledby="status-recovery-title"
      className="arc-market arc-system-recovery"
    >
      <div className="arc-system-recovery-copy">
        <h2 id="status-recovery-title">{recovery.title}</h2>
        <p>{recovery.description}</p>
      </div>
      <Link
        to={recovery.href}
        className={actionLinkClassName('secondary', 'md')}
      >
        {recovery.label}
      </Link>
    </section>
  )
}

import { Link } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'

import type { StatusRecoveryPanelProps } from '../system-status.contracts'
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
        className={[buttonStyles.button, buttonStyles.secondary, buttonStyles.md].join(' ')}
      >
        {recovery.label}
      </Link>
    </section>
  )
}

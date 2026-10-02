import { Link } from '@tanstack/react-router'

import buttonStyles from '@/components/arc/button/button.module.css'

import type { StatusPageFooterProps } from '../system-status.contracts'
import '../../StatusComposition.css'

export function StatusPageFooter({ statusAnnouncement }: StatusPageFooterProps) {
  return (
    <div className="arc-market arc-system-status-footer">
      <p role="status" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </p>
      <Link
        to="/support"
        className={[buttonStyles.button, buttonStyles.secondary, buttonStyles.md].join(' ')}
      >
        Help
      </Link>
    </div>
  )
}

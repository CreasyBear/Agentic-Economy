import { Link } from '@tanstack/react-router'


import type { StatusPageFooterProps } from '../system-status.contracts'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import '../../StatusComposition.css'

export function StatusPageFooter({ statusAnnouncement }: StatusPageFooterProps) {
  return (
    <div className="arc-market arc-system-status-footer">
      <p role="status" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </p>
      <Link
        to="/support"
        className={actionLinkClassName('secondary', 'md')}
      >
        Help
      </Link>
    </div>
  )
}

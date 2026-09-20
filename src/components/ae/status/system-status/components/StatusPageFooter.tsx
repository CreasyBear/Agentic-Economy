import { Link } from '@tanstack/react-router'

import type { StatusPageFooterProps } from '../system-status.contracts'

export function StatusPageFooter({ statusAnnouncement }: StatusPageFooterProps) {
  return (
    <div className="mt-related flex flex-wrap items-center justify-between gap-intra text-sm text-muted-foreground">
      <p role="status" aria-live="polite" aria-atomic="true">
        {statusAnnouncement}
      </p>
      <Link to="/support" className="min-h-touch content-center font-medium text-foreground underline underline-offset-4">
        Help
      </Link>
    </div>
  )
}

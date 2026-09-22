import { Link } from '@tanstack/react-router'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import { buttonVariants } from '@/components/ui/button-variants'
import {
  ADMIN_OVERVIEW_COPY,
  type AdminOverviewExceptionRow,
} from '../overview.contracts'

export type OldestExceptionsProps = Readonly<{
  rows: readonly AdminOverviewExceptionRow[]
  unavailable: boolean
}>

export function OldestExceptions({ rows, unavailable }: OldestExceptionsProps) {
  return (
    <AeSection title={ADMIN_OVERVIEW_COPY.exceptionsTitle} description={ADMIN_OVERVIEW_COPY.exceptionsDescription}>
      <div className="grid gap-related">
        {unavailable ? <p role="status" className="text-sm text-warning">{ADMIN_OVERVIEW_COPY.exceptionsUnavailable}</p> : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ADMIN_OVERVIEW_COPY.nothingNeedsAttention}</p>
        ) : (
          <ul className="divide-y divide-border rounded-card border border-border">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-related p-related">
                <div className="min-w-0">
                  <Link to={row.href} className="font-medium text-foreground underline-offset-4 hover:underline">
                    {row.label}
                  </Link>
                  <p className="text-xs text-muted-foreground">{row.since}</p>
                </div>
                <AeCopyReference label={row.label} value={row.ref} />
              </li>
            ))}
          </ul>
        )}
        <Link to="/admin/exceptions" className={buttonVariants({ variant: 'outline', className: 'w-fit' })}>
          {ADMIN_OVERVIEW_COPY.viewAll}
        </Link>
      </div>
    </AeSection>
  )
}

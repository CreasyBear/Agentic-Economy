import { Link } from '@tanstack/react-router'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  ADMIN_OVERVIEW_COPY,
  type AdminOverviewRecentRow,
} from '../overview.contracts'

export type RecentlyViewedProps = Readonly<{ rows: readonly AdminOverviewRecentRow[] }>

export function RecentlyViewed({ rows }: RecentlyViewedProps) {
  return (
    <AeSection title={ADMIN_OVERVIEW_COPY.recentlyViewedTitle} description={ADMIN_OVERVIEW_COPY.recentlyViewedDescription}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{ADMIN_OVERVIEW_COPY.noRecentlyViewed}</p>
      ) : (
        <ul className="divide-y divide-border rounded-card border border-border">
          {rows.map((row) => (
            <li key={`${row.kind}:${row.ref}`} className="flex flex-wrap items-center justify-between gap-related p-related">
              <Link to={row.href} className="font-medium text-foreground underline-offset-4 hover:underline">{row.label}</Link>
              <AeCopyReference label={row.label} value={row.ref} />
            </li>
          ))}
        </ul>
      )}
    </AeSection>
  )
}

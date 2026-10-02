import { Link } from '@tanstack/react-router'

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  ADMIN_OVERVIEW_COPY,
  type AdminOverviewRecentRow,
} from '../overview.contracts'
import './OverviewRecordsComposition.css'

export type RecentlyViewedProps = Readonly<{ rows: readonly AdminOverviewRecentRow[] }>

export function RecentlyViewed({ rows }: RecentlyViewedProps) {
  return (
    <AeSection
      title={ADMIN_OVERVIEW_COPY.recentlyViewedTitle}
      description={ADMIN_OVERVIEW_COPY.recentlyViewedDescription}
      className="arc-market arc-overview-records"
    >
      {rows.length === 0 ? (
        <p className="arc-overview-record-status">{ADMIN_OVERVIEW_COPY.noRecentlyViewed}</p>
      ) : (
        <ul className="arc-overview-record-list">
          {rows.map((row) => (
            <li key={`${row.kind}:${row.ref}`} className="arc-overview-record-row">
              <Link to={row.href} className="arc-overview-record-link">{row.label}</Link>
              <div className="arc-overview-record-reference">
                <AeCopyReference label={row.label} value={row.ref} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AeSection>
  )
}

import { Link } from '@tanstack/react-router'

import { AeSection } from '@/components/ae/layout/AeSection'
import styles from '@/components/arc/button/button.module.css'
import {
  ADMIN_OVERVIEW_COPY,
  type AdminOverviewExceptionRow,
} from '../overview.contracts'
import './OverviewRecordsComposition.css'

export type OldestExceptionsProps = Readonly<{
  rows: readonly AdminOverviewExceptionRow[]
  unavailable: boolean
}>

export function OldestExceptions({ rows, unavailable }: OldestExceptionsProps) {
  return (
    <AeSection
      title={ADMIN_OVERVIEW_COPY.exceptionsTitle}
      description={ADMIN_OVERVIEW_COPY.exceptionsDescription}
      className="arc-market arc-overview-records"
    >
      <div className="arc-overview-record-body">
        {unavailable ? <p role="status" className="arc-overview-record-status">{ADMIN_OVERVIEW_COPY.exceptionsUnavailable}</p> : null}
        {rows.length === 0 && !unavailable ? (
          <p className="arc-overview-record-status">{ADMIN_OVERVIEW_COPY.nothingNeedsAttention}</p>
        ) : rows.length > 0 ? (
          <ul className="arc-overview-record-list">
            {rows.map((row) => (
              <li key={row.id} className="arc-overview-record-row">
                <div className="arc-overview-record-copy">
                  <Link to={row.href} className="arc-overview-record-link">
                    {row.label}
                  </Link>
                  <p className="arc-overview-record-detail">{row.count}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        <Link
          to="/admin/exceptions"
          className={`arc-market ${styles.button} ${styles.secondary} ${styles.md} arc-overview-record-action`}
        >
          {ADMIN_OVERVIEW_COPY.viewAll}
        </Link>
      </div>
    </AeSection>
  )
}

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Badge } from '@/components/arc/badge/badge'

import type { StatusCheckListProps } from '../system-status.contracts'
import '../../StatusComposition.css'

export function StatusCheckList({ checks, isChecking }: StatusCheckListProps) {
  return (
    <div className="arc-market arc-system-checks">
      <ul className="arc-system-check-list" aria-busy={isChecking} aria-label="System checks">
        {checks.map((check) => (
          <li key={check.id} className="arc-system-check-row">
            <div className="arc-system-check-content">
              <p className="arc-system-check-label">{check.label}</p>
              <p className="arc-system-check-detail">{check.detail}</p>
              <p className="arc-system-check-time">{check.checkedAtLabel}</p>
              {check.requestRef !== undefined && (
                <div className="arc-system-check-ref">
                  <p>Request reference</p>
                  <AeCopyReference label={`${check.label} request reference`} value={check.requestRef} />
                </div>
              )}
            </div>
            <Badge tone={check.badgeVariant}>{check.badgeLabel}</Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

import { AeCopyReference } from '@/components/ae/data/AeCopyReference'
import { Badge } from '@/components/ui/badge'

import type { StatusCheckListProps } from '../system-status.contracts'

export function StatusCheckList({ checks, isChecking }: StatusCheckListProps) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <ul className="divide-y divide-border" aria-busy={isChecking}>
        {checks.map((check) => (
          <li key={check.id} className="flex min-h-touch flex-wrap items-center gap-intra px-gutter py-intra">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{check.label}</p>
              <p className="text-sm text-muted-foreground">{check.detail}</p>
              <p className="text-xs text-muted-foreground">{check.checkedAtLabel}</p>
              {check.requestRef !== undefined && (
                <div className="mt-intra grid gap-1">
                  <p className="text-xs font-medium text-muted-foreground">Request reference</p>
                  <AeCopyReference label={`${check.label} request reference`} value={check.requestRef} />
                </div>
              )}
            </div>
            <Badge variant={check.badgeVariant}>{check.badgeLabel}</Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

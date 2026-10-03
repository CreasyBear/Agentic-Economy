import type { ReactNode } from 'react'

import { SearchField } from '@/components/arc/search-field/search-field'
import { cn } from '@/lib/utils'
import '../operator/RecordTable.css'

type AeViewBarProps = {
  filterValue?: string
  onFilterChange?: (value: string) => void
  filterPlaceholder?: string
  count?: number
  countLabel?: string
  action?: ReactNode
  className?: string
}

export function AeViewBar({
  filterValue,
  onFilterChange,
  filterPlaceholder = 'Filter…',
  count,
  countLabel = 'rows',
  action,
  className,
}: AeViewBarProps) {
  const showFilter = onFilterChange !== undefined

  return (
    <div
      className={cn(
        'arc-market arc-record-viewbar',
        className,
      )}
    >
      {showFilter ? (
        <div className="arc-record-search">
          <SearchField
            label={filterPlaceholder}
            placeholder={filterPlaceholder}
            value={filterValue ?? ''}
            onValueChange={onFilterChange}
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {count === undefined ? null : (
        <p className="arc-record-count">
          {count.toLocaleString()} {countLabel}
        </p>
      )}
      {action === undefined ? null : action}
    </div>
  )
}

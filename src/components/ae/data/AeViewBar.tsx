import { useId, type ReactNode } from 'react'
import { SearchIcon } from 'lucide-react'

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
  const filterId = useId()
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
          <label htmlFor={filterId} className="sr-only">
            {filterPlaceholder}
          </label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            id={filterId}
            value={filterValue ?? ''}
            onChange={(event) => onFilterChange(event.currentTarget.value)}
            placeholder={filterPlaceholder}
            className="arc-record-search-input"
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

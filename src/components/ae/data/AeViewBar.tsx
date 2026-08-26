import { useId, type ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

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
        'flex min-h-10 flex-wrap items-center gap-3 border-b border-border py-2',
        className,
      )}
    >
      {showFilter ? (
        <div className="min-w-0 flex-1">
          <Label htmlFor={filterId} className="sr-only">
            {filterPlaceholder}
          </Label>
          <Input
            id={filterId}
            value={filterValue ?? ''}
            onChange={(event) => onFilterChange(event.currentTarget.value)}
            placeholder={filterPlaceholder}
            className="h-11 max-w-sm"
          />
        </div>
      ) : (
        <div className="min-w-0 flex-1" />
      )}
      {count === undefined ? null : (
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {count.toLocaleString()} {countLabel}
        </p>
      )}
      {action === undefined ? null : action}
    </div>
  )
}

import { useId, type ReactNode } from 'react'
import { SearchIcon } from 'lucide-react'

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
        'flex min-h-touch flex-wrap items-center gap-related border-b border-border py-intra',
        className,
      )}
    >
      {showFilter ? (
        <div className="relative min-w-0 flex-1">
          <Label htmlFor={filterId} className="sr-only">
            {filterPlaceholder}
          </Label>
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id={filterId}
            value={filterValue ?? ''}
            onChange={(event) => onFilterChange(event.currentTarget.value)}
            placeholder={filterPlaceholder}
            className="min-h-touch max-w-sm ps-9"
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

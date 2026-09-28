import { Button } from '@/components/ui/button'
import {
  ADMIN_EXCEPTION_PARTITIONS,
  ADMIN_EXCEPTIONS_COPY,
  ADMIN_EXCEPTION_FILTERS,
  type ExceptionFilterChipsProps,
} from '../exceptions.contracts'

export function ExceptionFilterChips({ selected, onSelect, overview }: ExceptionFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-intra">
      {ADMIN_EXCEPTION_FILTERS.map((filter) => {
        const sources = overview.filter((entry) => entry.kind === filter.kind)
        const unavailable = sources.length !== ADMIN_EXCEPTION_PARTITIONS[filter.kind].length
          || sources.some((entry) => entry.unavailable)
        const observed = sources.reduce((count, entry) => count + entry.observed, 0)
        const complete = sources.every((entry) => entry.complete)
        return (
          <Button key={filter.kind} type="button" size="sm"
            variant={selected === filter.kind ? 'default' : 'outline'}
            aria-pressed={selected === filter.kind} onClick={() => onSelect(filter.kind)}
          >
            {filter.label} ({unavailable ? ADMIN_EXCEPTIONS_COPY.unavailable : `${complete ? '' : '≥'}${observed}`})
          </Button>
        )
      })}
    </div>
  )
}

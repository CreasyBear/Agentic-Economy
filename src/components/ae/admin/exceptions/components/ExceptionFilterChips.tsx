import { Button } from '@/components/ui/button'
import {
  ADMIN_EXCEPTION_PARTITIONS,
  ADMIN_EXCEPTIONS_COPY,
  ADMIN_EXCEPTION_FILTERS,
  type AdminExceptionsReadyState,
  type ExceptionFilterChipsProps,
} from '../exceptions.contracts'

export function exceptionQueueCount(
  entries: readonly Pick<AdminExceptionsReadyState['overview'][number], 'observed' | 'complete' | 'unavailable'>[],
  expected: number,
): string {
  const unavailable = entries.length !== expected || entries.some((entry) => entry.unavailable)
  if (unavailable) return ADMIN_EXCEPTIONS_COPY.unavailable
  const observed = entries.reduce((count, entry) => count + entry.observed, 0)
  const complete = entries.every((entry) => entry.complete)
  return `${complete ? '' : '≥'}${observed}`
}

export function ExceptionFilterChips({ selected, selectedPartition, onSelect, overview }: ExceptionFilterChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-intra">
      {ADMIN_EXCEPTION_FILTERS.map((filter) => {
        const sources = overview.filter((entry) => entry.kind === filter.kind)
        const kindCount = exceptionQueueCount(sources, ADMIN_EXCEPTION_PARTITIONS[filter.kind].length)
        const partitionSources = sources.filter((entry) => entry.partition === selectedPartition)
        const shown = selected === filter.kind
          ? exceptionQueueCount(partitionSources, 1)
          : kindCount
        return (
          <span key={filter.kind} className="inline-flex items-center gap-intra">
            <Button type="button" size="sm"
              variant={selected === filter.kind ? 'default' : 'outline'}
              aria-pressed={selected === filter.kind} onClick={() => onSelect(filter.kind)}
            >
              {filter.label} ({shown})
            </Button>
            {selected === filter.kind ? (
              <span className="text-sm text-muted-foreground">{ADMIN_EXCEPTIONS_COPY.allStates} ({kindCount})</span>
            ) : null}
          </span>
        )
      })}
    </div>
  )
}

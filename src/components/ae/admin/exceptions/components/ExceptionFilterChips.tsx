import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
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
  const options = ADMIN_EXCEPTION_FILTERS.map(filter => {
    const sources = overview.filter(entry => entry.kind === filter.kind)
    const shown = selected === filter.kind
      ? exceptionQueueCount(sources.filter(entry => entry.partition === selectedPartition), 1)
      : exceptionQueueCount(sources, ADMIN_EXCEPTION_PARTITIONS[filter.kind].length)
    return { value: filter.kind, label: `${filter.label} (${shown})` }
  })
  const total = exceptionQueueCount(overview.filter(entry => entry.kind === selected), ADMIN_EXCEPTION_PARTITIONS[selected].length)
  return (
    <div className="ae-arc grid min-w-0 justify-items-start gap-1">
      <SegmentedControl label="Exception queue" options={options} value={selected} onValueChange={value => {
        const filter = ADMIN_EXCEPTION_FILTERS.find(filter => filter.kind === value)
        if (filter) onSelect(filter.kind)
      }} />
      <span className="text-xs text-muted-foreground">{ADMIN_EXCEPTIONS_COPY.allStates} ({total})</span>
    </div>
  )
}

import SegmentedControl from '@/components/arc/segmented-control/segmented-control'
import '../../OperatorScopesComposition.css'
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
  const options = ADMIN_EXCEPTION_FILTERS.map((filter) => {
    const sources = overview.filter((entry) => entry.kind === filter.kind)
    const kindCount = exceptionQueueCount(sources, ADMIN_EXCEPTION_PARTITIONS[filter.kind].length)
    const partitionSources = sources.filter((entry) => entry.partition === selectedPartition)
    const shown = selected === filter.kind
      ? exceptionQueueCount(partitionSources, 1)
      : kindCount
    return { value: filter.kind, label: `${filter.label} (${shown})` }
  })

  return (
    <div className="arc-market arc-operator-scope-region">
      <SegmentedControl
        label="Exception queues"
        options={options}
        value={selected}
        onValueChange={(value) => {
          const filter = ADMIN_EXCEPTION_FILTERS.find((candidate) => candidate.kind === value)
          if (filter !== undefined) onSelect(filter.kind)
        }}
      />
      <p className="arc-operator-scope-detail">
        {ADMIN_EXCEPTIONS_COPY.allStates} ({exceptionQueueCount(overview.filter((entry) => entry.kind === selected), ADMIN_EXCEPTION_PARTITIONS[selected].length)})
      </p>
    </div>
  )
}

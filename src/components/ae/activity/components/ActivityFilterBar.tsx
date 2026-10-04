import { Button as ArcButton } from '@/components/arc/button/button'
import SegmentedControl from '@/components/arc/segmented-control/segmented-control'

import {
  type ActivityFilterBarProps,
  type ActivityDateRangeFilter,
  type ActivityStatusFilter,
} from '../activity.contracts'

const STATUS_FILTERS = ['all', 'completed', 'refused', 'outcome_unknown'] as const satisfies readonly ActivityStatusFilter[]
const DATE_FILTERS = ['today', '7d', '30d', 'month', 'all'] as const satisfies readonly ActivityDateRangeFilter[]

export function ActivityFilterBar({
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  statusChipLabel,
  dateRangeFilter,
  onDateRangeFilterChange,
  dateChipLabel,
  filteredAgentShortId,
  onClearAgent,
  datePending,
  filtersActive,
  onResetFilters,
}: ActivityFilterBarProps) {
  const handleStatusChange = (value: string) => {
    const filter = STATUS_FILTERS.find((status) => status === value)
    if (filter !== undefined) onStatusFilterChange(filter)
  }

  const handleDateChange = (value: string) => {
    const filter = DATE_FILTERS.find((dateRange) => dateRange === value)
    if (filter !== undefined) onDateRangeFilterChange(filter)
  }

  return (
    <div className="arc-market flex min-h-[3rem] min-w-0 max-w-full flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-4">
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Loaded status:</span>
          <SegmentedControl
            options={STATUS_FILTERS.map((status) => ({
              value: status,
              label: statusChipLabel(status),
              accessory: <span className="font-mono tabular-nums">{statusCounts[status]}</span>,
            }))}
            value={statusFilter}
            onValueChange={handleStatusChange}
            label="Call status"
          />
        </div>

        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2" aria-busy={datePending || undefined}>
          <span className="text-xs font-medium text-muted-foreground">Date:</span>
          <SegmentedControl
            options={DATE_FILTERS.map((dateRange) => ({
              value: dateRange,
              label: dateChipLabel(dateRange),
            }))}
            value={dateRangeFilter}
            onValueChange={handleDateChange}
            label="Call date range"
          />
          {datePending ? <span className="text-xs text-muted-foreground" role="status">Updating period…</span> : null}
        </div>

        {filteredAgentShortId ? (
          <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
            <span className="text-muted-foreground">
              Agent · <span className="font-mono text-foreground">{filteredAgentShortId}</span>
            </span>
            <ArcButton
              type="button"
              variant="ghost"
              size="md"
              onClick={onClearAgent}
              aria-label="Clear agent filter"
              className="min-h-11 min-w-11"
            >
              ×
            </ArcButton>
          </div>
        ) : null}
      </div>

      {filtersActive ? (
        <ArcButton
          type="button"
          variant="ghost"
          size="md"
          className="text-muted-foreground"
          onClick={onResetFilters}
        >
          Reset filters
        </ArcButton>
      ) : null}
    </div>
  )
}

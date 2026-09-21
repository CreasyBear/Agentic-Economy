import { Link } from '@tanstack/react-router'
import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import {
  ACTIVITY_EXPORT_FORMAT_BUTTON_CLASS,
  ACTIVITY_FILTER_CHIP_CLASS,
  type ActivityFilterBarProps,
  type ActivityDateRangeFilter,
  type ActivityStatusFilter,
} from '../activity.contracts'

const STATUS_FILTERS = ['all', 'completed', 'refused', 'outcome_unknown'] as const satisfies readonly ActivityStatusFilter[]
const DATE_FILTERS = ['all', 'today', '7d', '30d'] as const satisfies readonly ActivityDateRangeFilter[]

export function ActivityFilterBar({
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  statusChipLabel,
  dateRangeFilter,
  onDateRangeFilterChange,
  dateChipLabel,
  filteredAgentShortId,
  filtersActive,
  onResetFilters,
  exportPreviewLabel,
  exportDisabled,
  onExportCsv,
  onExportJson,
}: ActivityFilterBarProps) {
  return (
    <div className="flex min-h-[3rem] flex-wrap items-center justify-between gap-3 gap-y-related border-b border-border pb-related">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Status:</span>
          <div className="flex flex-wrap items-center gap-1">
            {STATUS_FILTERS.map((s) => (
              <Button
                key={s}
                type="button"
                variant={statusFilter === s ? 'secondary' : 'ghost'}
                size="sm"
                className={cn('min-h-9 text-xs sm:min-h-8', ACTIVITY_FILTER_CHIP_CLASS)}
                aria-pressed={statusFilter === s}
                onClick={() => onStatusFilterChange(s)}
              >
                {statusChipLabel(s)}
                {' '}
                <span className="font-mono tabular-nums">{statusCounts[s]}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Date:</span>
          <div className="flex flex-wrap items-center gap-1">
            {DATE_FILTERS.map((d) => (
              <Button
                key={d}
                type="button"
                variant={dateRangeFilter === d ? 'secondary' : 'ghost'}
                size="sm"
                className={cn('min-h-9 text-xs sm:min-h-8', ACTIVITY_FILTER_CHIP_CLASS)}
                aria-pressed={dateRangeFilter === d}
                onClick={() => onDateRangeFilterChange(d)}
              >
                {dateChipLabel(d)}
              </Button>
            ))}
          </div>
        </div>

        {filteredAgentShortId ? (
          <div className="flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
            <span className="text-muted-foreground">
              Agent · <span className="font-mono text-foreground">{filteredAgentShortId}</span>
            </span>
            <Link
              to="/activity"
              aria-label="Clear agent filter"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), `h-6 rounded-full px-1.5 text-xs ${ACTIVITY_FILTER_CHIP_CLASS}`)}
            >
              ×
            </Link>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {filtersActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('min-h-9 text-xs text-muted-foreground sm:min-h-8', ACTIVITY_FILTER_CHIP_CLASS)}
            onClick={onResetFilters}
          >
            Reset filters
          </Button>
        ) : null}

        <span className="min-w-[12rem] text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">
            {exportPreviewLabel}
          </span>
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-7 text-xs ${ACTIVITY_EXPORT_FORMAT_BUTTON_CLASS}`}
          disabled={exportDisabled}
          onClick={onExportCsv}
        >
          <Download className="size-3.5 shrink-0" aria-hidden="true" />
          CSV
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={`h-7 text-xs ${ACTIVITY_EXPORT_FORMAT_BUTTON_CLASS}`}
          disabled={exportDisabled}
          onClick={onExportJson}
        >
          <Download className="size-3.5 shrink-0" aria-hidden="true" />
          JSON
        </Button>
      </div>
    </div>
  )
}

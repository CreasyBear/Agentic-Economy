import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { Download } from 'lucide-react'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { Button } from '@/components/arc/button/button'
import buttonStyles from '@/components/arc/button/button.module.css'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

import {
  type ActivityLoaderResult,
  type AeActivityProps,
  type ActivityStatusFilter,
} from './activity.contracts'
import { ActivityCallQueue } from './components/ActivityCallQueue'
import { ActivityFilterBar } from './components/ActivityFilterBar'
import { ActivityMonthlySummary } from './components/ActivityMonthlySummary'
import { ActivityPaginationControl } from './components/ActivityPaginationControl'
import { ActivityUnavailableState } from './components/ActivityUnavailableState'
import { useAeActivity } from './useAeActivity'

function activityStatus(vm: ReturnType<typeof useAeActivity>): string {
  if (vm.pagination.status === 'loading') return 'Loading older Calls.'
  if (vm.pagination.status === 'failed') return 'Could not load older Calls. The Calls already shown are unchanged.'
  if (vm.showEmptyNoCalls) return 'No Calls in this period.'
  if (vm.showEmptyNoMatch) return 'No Calls match these filters.'
  return `${vm.attentionRows.length} Calls need attention. ${vm.recentRows.length} recent Calls shown.`
}

export function AeActivity({ result }: AeActivityProps) {
  const router = useRouter()
  const [retryPending, setRetryPending] = useState(false)
  const [statusFilter, setStatusFilter] = useState<ActivityStatusFilter>('all')

  if (result.kind === 'unavailable') {
    return (
      <ActivityUnavailableState
        retryPending={retryPending}
        onRetry={() => {
          if (retryPending) return
          setRetryPending(true)
          void router.invalidate()
            .catch((cause) => captureClientExceptionOnClient(cause))
            .finally(() => setRetryPending(false))
        }}
      />
    )
  }

  return (
    <AeActivityAvailable
      key={`${canonicalDigest(result.calls)}:${result.filteredAgent ?? 'all'}:${result.periodStartAt}:${result.periodEndAt}`}
      result={result}
      statusFilter={statusFilter}
      setStatusFilter={setStatusFilter}
    />
  )
}

function AeActivityAvailable({
  result,
  statusFilter,
  setStatusFilter,
}: Readonly<{
  result: Extract<ActivityLoaderResult, { kind: 'available' }>
  statusFilter: ActivityStatusFilter
  setStatusFilter: (filter: ActivityStatusFilter) => void
}>) {
  const vm = useAeActivity({
    initial: result.calls,
    usage: result.usage,
    spend: result.spend,
    periodStart: result.periodStart,
    periodStartAt: result.periodStartAt,
    periodEndAt: result.periodEndAt,
    dateRangeFilter: result.dateRangeFilter,
    statusFilter,
    setStatusFilter,
    ...(result.filteredAgent === undefined ? {} : { filteredAgent: result.filteredAgent }),
  })

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Calls"
      description="Review Calls that need attention, then inspect recent outcomes and receipts."
      currentPath="/activity"
    >
      <div className="arc-market grid min-w-0 gap-8">
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {activityStatus(vm)}
        </p>
        <p className="text-sm text-muted-foreground">{vm.monthly.scopeLabel} · {vm.periodStart}</p>
        {vm.showFilterBar ? (
          <ActivityFilterBar
            statusFilter={vm.statusFilter}
            onStatusFilterChange={vm.setStatusFilter}
            statusCounts={vm.statusCounts}
            statusChipLabel={vm.statusChipLabel}
            dateRangeFilter={vm.dateRangeFilter}
            onDateRangeFilterChange={vm.setDateRangeFilter}
            dateChipLabel={vm.dateChipLabel}
            filteredAgentShortId={vm.filteredAgentShortId}
            onClearAgent={vm.clearAgent}
            datePending={vm.datePending}
            filtersActive={vm.filtersActive}
            onResetFilters={vm.resetFilters}
          />
        ) : null}
        <ActivityMonthlySummary
          periodStart={vm.periodStart}
          monthly={vm.monthly}
          retryPending={vm.summaryRetryPending}
          onRetry={vm.retrySummaries}
        />
        {vm.showFilterBar ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Call usage export · not an invoice</span>
            <span className="min-w-[12rem] text-xs text-muted-foreground">
              <span className="font-mono tabular-nums">
                {vm.exportPreviewLabel}
              </span>
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={vm.exportDisabled}
              onClick={vm.exportCsv}
            >
              <Download className="size-3.5 shrink-0" aria-hidden="true" />
              Loaded CSV
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={vm.exportDisabled}
              onClick={vm.exportJson}
            >
              <Download className="size-3.5 shrink-0" aria-hidden="true" />
              Loaded JSON
            </Button>
            <Button type="button" variant="secondary" disabled={vm.periodExportDisabled}
              aria-busy={vm.periodExportPending || undefined} onClick={() => void vm.exportPeriod('CSV')}>
              {vm.periodExportPending ? 'Preparing period…' : 'Full period CSV'}
            </Button>
            <Button type="button" variant="secondary" disabled={vm.periodExportDisabled}
              onClick={() => void vm.exportPeriod('JSON')}>
              Full period JSON
            </Button>
          </div>
        ) : null}
        {vm.showEmptyNoCalls ? (
          <AeEmptyState
            title="No Calls in this period"
            description="No Calls were recorded for the selected Account or Agent and date range. Change the filters or find a Tool."
            action={<Link to="/market" className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>Find Tools</Link>}
          />
        ) : vm.showEmptyNoMatch ? (
          <AeEmptyState
            title="No Calls match these filters"
            description={vm.pagination.cursor === undefined ? 'No Calls in this period have the selected status.' : 'No loaded Calls have the selected status. Load more to check the remaining history.'}
            action={
              <Button type="button" className="min-h-touch" onClick={vm.resetFilters}>
                Reset filters
              </Button>
            }
          />
        ) : vm.showQueues ? (
          <>
            <ActivityCallQueue
              title="Needs attention"
              description={vm.attentionDescription}
              rows={vm.attentionRows}
              emptyMessage={vm.attentionEmptyMessage}
              attention
            />
            <ActivityCallQueue
              title="Recent Calls"
              description="Completed and refused Calls, separate from work that still needs a decision."
              rows={vm.recentRows}
              emptyMessage="No routine Calls in the loaded history."
            />
          </>
        ) : null}
        <ActivityPaginationControl pagination={vm.pagination} onLoadMore={vm.loadNextPage} />
        <p className="text-xs text-muted-foreground">{vm.pagination.items.length} Calls loaded. Table status filters, sorting and loaded exports apply to loaded rows. Full-period exports read all pages for the selected period, Agent and status, up to 10,000 scanned Calls and 366 days.</p>
      </div>
    </AeOperatorPage>
  )
}

import { useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'

import { AeEmptyState } from '@/components/ae/feedback/AeEmptyState'
import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

import type { ActivityLoaderResult, AeActivityProps } from './activity.contracts'
import { ActivityCallQueue } from './components/ActivityCallQueue'
import { ActivityFilterBar } from './components/ActivityFilterBar'
import { ActivityMonthlySummary } from './components/ActivityMonthlySummary'
import { ActivityPaginationControl } from './components/ActivityPaginationControl'
import { ActivityUnavailableState } from './components/ActivityUnavailableState'
import { useAeActivity } from './useAeActivity'

export function AeActivity({ result }: AeActivityProps) {
  const router = useRouter()
  const [retryPending, setRetryPending] = useState(false)

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
      key={`${canonicalDigest(result.calls)}:${result.filteredAgent ?? 'all'}`}
      result={result}
    />
  )
}

function AeActivityAvailable({
  result,
}: Readonly<{ result: Extract<ActivityLoaderResult, { kind: 'available' }> }>) {
  const vm = useAeActivity({
    initial: result.calls,
    usage: result.usage,
    spend: result.spend,
    periodStart: result.periodStart,
    ...(result.filteredAgent === undefined ? {} : { filteredAgent: result.filteredAgent }),
  })

  return (
    <AeOperatorPage
      operatorRole="owner"
      title="Calls"
      description="Review Calls that need attention, then inspect recent outcomes and receipts."
      currentPath="/activity"
    >
      <div className="grid gap-section">
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
            filtersActive={vm.filtersActive}
            onResetFilters={vm.resetFilters}
            exportPreviewLabel={vm.exportPreviewLabel}
            exportDisabled={vm.exportDisabled}
            onExportCsv={vm.exportCsv}
            onExportJson={vm.exportJson}
          />
        ) : null}
        {vm.showEmptyNoCalls ? (
          <AeEmptyState
            title="No Calls yet"
            description="Find a Tool and complete one Call. Its task, outcome, amount, and receipt will appear here."
            action={<Link to="/owner/market" className={cn(buttonVariants(), 'min-h-touch')}>Find Tools</Link>}
          />
        ) : vm.showEmptyNoMatch ? (
          <AeEmptyState
            title="No calls match these filters"
            description="No calls match the current filter criteria."
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
            <ActivityPaginationControl pagination={vm.pagination} onLoadMore={vm.loadNextPage} />
          </>
        ) : null}
        <ActivityMonthlySummary
          periodStart={vm.periodStart}
          monthly={vm.monthly}
          retryPending={vm.summaryRetryPending}
          onRetry={vm.retrySummaries}
        />
      </div>
    </AeOperatorPage>
  )
}

import { formatTimestamp } from '@/lib/ui/format-time'
import { AeSection } from '@/components/ae/layout/AeSection'
import { AeSupplyEarningsCard } from '@/components/ae/supply/earnings-card/AeSupplyEarningsCard'
import { Button as ArcButton } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/ae/shared/base-ui/drawer/drawer'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import '../supply/earnings-card/EarningsComposition.css'
import { UnavailableSummary } from './ProviderWorkspaceSharedUi'
import {
  PROVIDER_WORKSPACE_EARNINGS_COPY,
  type ProviderWorkspaceEarningsSectionProps,
} from './provider-workspace/provider-workspace.contracts'

export function ProviderWorkspaceEarningsSection({
  earningsOpen,
  earningsPending,
  earningsDetail,
  earningsUnavailable,
  onOpenEarnings,
  onCloseEarnings,
  onRetryEarnings,
  onRefreshEarnings,
  onLoadMoreEarnings,
  earningsReadAt,
}: ProviderWorkspaceEarningsSectionProps) {
  return (
    <AeSection id="earnings" title="Earnings" description="Source-recorded Provider obligations and Call settlements.">
      <ArcButton type="button" variant="secondary" size="md" className="justify-self-start min-h-touch" onClick={onOpenEarnings}>View earnings</ArcButton>
      <Drawer open={earningsOpen} onOpenChange={(open) => { if (!open) onCloseEarnings() }}>
        <DrawerContent side="right" title="Earnings" description="Source-recorded Provider obligations and Call settlements." className="arc-provider-earnings-drawer">
          <div className="arc-provider-earnings-body">
            {earningsOpen ? <>
              <p className="text-sm text-muted-foreground">{earningsReadAt === undefined ? 'No successful read in this view yet.' : `Last read: ${formatTimestamp(earningsReadAt)}`}</p>
              {onRefreshEarnings === undefined ? null : <ArcButton type="button" variant="secondary" size="md" disabled={earningsPending} onClick={onRefreshEarnings}>Refresh earnings</ArcButton>}
              {earningsPending && earningsDetail === undefined ? <Skeleton label="Loading provider earnings" lines={3} className="h-24 w-full" /> : null}
              {earningsPending && earningsDetail !== undefined ? <p role="status">Reading recorded obligations… Previously loaded records remain visible.</p> : null}
              {earningsUnavailable && (earningsDetail === undefined || earningsDetail.kind === 'available') ? <UnavailableSummary title={PROVIDER_WORKSPACE_EARNINGS_COPY.unavailable} retryLabel={PROVIDER_WORKSPACE_EARNINGS_COPY.retryAction} onRetry={onRetryEarnings} /> : null}
              {earningsDetail === undefined ? null : <AeSupplyEarningsCard readback={earningsDetail} onRetry={onRetryEarnings} pending={earningsPending} {...(onLoadMoreEarnings === undefined ? {} : { onLoadMore: onLoadMoreEarnings })} />}
            </> : null}
          </div>
        </DrawerContent>
      </Drawer>
    </AeSection>
  )
}

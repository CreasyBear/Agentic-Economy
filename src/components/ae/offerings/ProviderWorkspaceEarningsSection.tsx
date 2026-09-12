import { AeSection } from '@/components/ae/layout/AeSection'
import { AeSupplyEarningsCard } from '@/components/ae/supply/AeSupplyEarningsCard'
import { Skeleton } from '@/components/ui/skeleton'
import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerConnectReadinessReadback } from '@/modules/money/server'
import { DeferredSection, SecondarySummary, SummaryCard, UnavailableSummary } from './ProviderWorkspaceSharedUi'
import type { ProviderWorkspacePayoutResult } from './provider-workspace.functions'

export function ProviderWorkspaceEarningsSection({
  payouts,
  earningsOpen,
  earningsPending,
  earningsDetail,
  onOpenEarnings,
  onRetryEarnings,
  onStatusRefreshed,
}: Readonly<{
  payouts?: Promise<ProviderWorkspacePayoutResult>
  earningsOpen: boolean
  earningsPending: boolean
  earningsDetail?: Readonly<{ earnings: OwnerProviderEarningsReadback; connect: OwnerConnectReadinessReadback }>
  onOpenEarnings: () => void
  onRetryEarnings: () => void
  onStatusRefreshed: () => void
}>) {
  return (
    <AeSection id="earnings" title="Earnings and operational evidence" description="Source-recorded provider earnings and payout readiness.">
      <DeferredSection promise={payouts} loadingLabel="Loading earnings" unavailableTitle="Earnings unavailable">
        {(result) => result.kind === 'available' ? (
          <SummaryCard title="Payout readiness" detail={`${result.value.readyAccounts} ready · ${result.value.needsAttention} need attention`} action="Manage earnings" onAction={onOpenEarnings} />
        ) : <SecondarySummary result={result} subject="Payout readiness" notApplicableTitle="Payout readiness not configured" unavailableTitle="Earnings unavailable" />}
      </DeferredSection>
      {earningsOpen ? earningsPending ? <div aria-busy="true"><Skeleton className="h-24 w-full" /></div> : earningsDetail === undefined ? <UnavailableSummary title="Earnings controls unavailable" retryLabel="Try earnings again" onRetry={onRetryEarnings} /> : (
        <AeSupplyEarningsCard readback={earningsDetail.earnings} connect={earningsDetail.connect} onStatusRefreshed={onStatusRefreshed} />
      ) : null}
    </AeSection>
  )
}

import { AeSection } from '@/components/ae/layout/AeSection'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import type { OwnerConnectReadinessReadback } from '@/modules/money/server'
import { DeferredSection, SecondarySummary, SummaryCard, UnavailableSummary } from './ProviderWorkspaceSharedUi'
import type { ProviderWorkspacePayoutResult } from './provider-workspace.functions'
import { PROVIDER_WORKSPACE_EARNINGS_COPY } from './provider-workspace/provider-workspace.contracts'

export function ProviderWorkspaceEarningsSection({
  payouts,
  earningsOpen,
  earningsPending,
  earningsDetail,
  onOpenEarnings,
  onRetryEarnings,
}: Readonly<{
  payouts?: Promise<ProviderWorkspacePayoutResult>
  earningsOpen: boolean
  earningsPending: boolean
  earningsDetail?: Readonly<{ connect: OwnerConnectReadinessReadback }>
  onOpenEarnings: () => void
  onRetryEarnings: () => void
}>) {
  const connectionDetail = earningsDetail?.connect.kind === 'available'
    ? earningsDetail.connect.accounts.some(({ account }) => account.state === 'ready')
      ? PROVIDER_WORKSPACE_EARNINGS_COPY.connected
      : PROVIDER_WORKSPACE_EARNINGS_COPY.notConnected
    : earningsDetail?.connect.kind === 'not_found'
      ? PROVIDER_WORKSPACE_EARNINGS_COPY.notConnected
      : PROVIDER_WORKSPACE_EARNINGS_COPY.unavailable
  return (
    <AeSection id="earnings" title="Earnings" description={PROVIDER_WORKSPACE_EARNINGS_COPY.connectionTitle}>
      <DeferredSection promise={payouts} loadingLabel={PROVIDER_WORKSPACE_EARNINGS_COPY.loading} unavailableTitle={PROVIDER_WORKSPACE_EARNINGS_COPY.unavailable}>
        {(result) => result.kind === 'available' ? (
          <SummaryCard
            title={PROVIDER_WORKSPACE_EARNINGS_COPY.connectionTitle}
            detail={result.value.readyAccounts > 0 ? PROVIDER_WORKSPACE_EARNINGS_COPY.connected : PROVIDER_WORKSPACE_EARNINGS_COPY.notConnected}
            action={PROVIDER_WORKSPACE_EARNINGS_COPY.reviewAction}
            onAction={onOpenEarnings}
          />
        ) : <SecondarySummary result={result} subject={PROVIDER_WORKSPACE_EARNINGS_COPY.connectionTitle} notApplicableTitle={PROVIDER_WORKSPACE_EARNINGS_COPY.notConnected} unavailableTitle={PROVIDER_WORKSPACE_EARNINGS_COPY.unavailable} />}
      </DeferredSection>
      {earningsOpen
        ? earningsPending
          ? <div aria-busy="true"><Skeleton className="h-24 w-full" /></div>
          : earningsDetail === undefined
            ? <UnavailableSummary title={PROVIDER_WORKSPACE_EARNINGS_COPY.unavailable} retryLabel={PROVIDER_WORKSPACE_EARNINGS_COPY.retryAction} onRetry={onRetryEarnings} />
            : <Alert><AlertTitle>{connectionDetail}</AlertTitle></Alert>
        : null}
    </AeSection>
  )
}

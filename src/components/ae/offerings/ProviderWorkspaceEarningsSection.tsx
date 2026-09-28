import { AeSection } from '@/components/ae/layout/AeSection'
import { AeSupplyEarningsCard } from '@/components/ae/supply/earnings-card/AeSupplyEarningsCard'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
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
}: ProviderWorkspaceEarningsSectionProps) {
  return (
    <AeSection id="earnings" title="Earnings" description="Source-recorded Provider obligations and Call settlements.">
      <Button type="button" variant="secondary" className="justify-self-start min-h-touch" onClick={onOpenEarnings}>View earnings</Button>
      <Sheet open={earningsOpen} onOpenChange={(open) => { if (!open) onCloseEarnings() }}>
        <SheetContent className="overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Earnings</SheetTitle>
            <SheetDescription>Source-recorded Provider obligations and Call settlements.</SheetDescription>
          </SheetHeader>
          <div className="px-gutter pb-gutter">
            {earningsOpen ? (
              earningsPending ? <div aria-busy="true"><Skeleton className="h-24 w-full" /></div>
                : earningsUnavailable || earningsDetail === undefined
                  ? <UnavailableSummary title={PROVIDER_WORKSPACE_EARNINGS_COPY.unavailable} retryLabel={PROVIDER_WORKSPACE_EARNINGS_COPY.retryAction} onRetry={onRetryEarnings} />
                  : <AeSupplyEarningsCard readback={earningsDetail} />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </AeSection>
  )
}

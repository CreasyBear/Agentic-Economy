import { AeSection } from '@/components/ae/layout/AeSection'
import { AeSupplyEarningsCard } from '@/components/ae/supply/earnings-card/AeSupplyEarningsCard'
import { Button as ArcButton } from '@/components/arc/button/button'
import { Drawer, DrawerContent } from '@/components/ae/shared/arc/drawer/AeDrawerContent'
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
}: ProviderWorkspaceEarningsSectionProps) {
  return (
    <AeSection id="earnings" title="Earnings" description="Source-recorded Provider obligations and Call settlements.">
      <ArcButton type="button" variant="secondary" size="md" className="justify-self-start min-h-touch" onClick={onOpenEarnings}>View earnings</ArcButton>
      <Drawer open={earningsOpen} onOpenChange={(open) => { if (!open) onCloseEarnings() }}>
        <DrawerContent side="right" title="Earnings" description="Source-recorded Provider obligations and Call settlements." className="arc-provider-earnings-drawer">
          <div className="arc-provider-earnings-body">
            {earningsOpen ? (
              earningsPending ? <Skeleton label="Loading provider earnings" lines={3} className="h-24 w-full" />
                : earningsUnavailable || earningsDetail === undefined
                  ? <UnavailableSummary title={PROVIDER_WORKSPACE_EARNINGS_COPY.unavailable} retryLabel={PROVIDER_WORKSPACE_EARNINGS_COPY.retryAction} onRetry={onRetryEarnings} />
                  : <AeSupplyEarningsCard readback={earningsDetail} />
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>
    </AeSection>
  )
}

import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'
import type { OwnerConnectReadinessReadback } from '@/modules/money/money.functions'

import { DurableTransferEvidence } from './components/DurableTransferEvidence'
import { EarningsFactsList } from './components/EarningsFactsList'
import {
  EarningsAccountStatus,
  PayoutConfirmDialog,
} from './components/PayoutConfirmDialog'
import { PayoutActionBar } from './components/PayoutActionBar'
import { EarningsEmptyState } from './components/EarningsEmptyState'
import type { EarningsEmptyStateProps } from './earnings-card.contracts'
import { projectEarningsList } from './earnings-projection'
import { useAeSupplyEarningsCard, type UseAeSupplyEarningsCardInput } from './useAeSupplyEarningsCard'

export type AeSupplyEarningsCardProps = Readonly<{
  readback: OwnerProviderEarningsReadback
  connect?: OwnerConnectReadinessReadback
  onStatusRefreshed?: () => void | Promise<void>
}>

export function AeSupplyEarningsCard({
  readback,
  connect,
  onStatusRefreshed,
}: AeSupplyEarningsCardProps) {
  const list = projectEarningsList(readback)

  if (list.kind !== 'accounts') {
    let variant: EarningsEmptyStateProps['variant']
    if (list.kind === 'error') {
      variant = list.code === 'unauthenticated' ? 'error_unauthenticated' : 'error_source'
    } else if (list.kind === 'not_found') {
      variant = 'not_found'
    } else {
      variant = 'empty_accounts'
    }
    return (
      <div className="grid gap-4">
        <EarningsEmptyState variant={variant} />
      </div>
    )
  }

  const accounts =
    readback.kind === 'available' ? readback.accounts : []

  return (
    <div className="grid gap-4">
      <div className="grid gap-4">
        {accounts.map((account) => (
          <EarningsAccountCard
            key={account.currency}
            account={account}
            businessId={list.businessId}
            {...(connect === undefined ? {} : { connect })}
            {...(onStatusRefreshed === undefined ? {} : { onStatusRefreshed })}
          />
        ))}
        {list.accountsTruncated ? (
          <p className="text-sm text-muted-foreground">
            Only the first 10 provider earnings currencies are shown.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Setup or test calls do not create earnings. Earnings appear only
          when source money records provider accruals.
        </p>
      </div>
    </div>
  )
}

function EarningsAccountCard(props: UseAeSupplyEarningsCardInput) {
  const hook = useAeSupplyEarningsCard(props)
  const { display } = hook
  const actionsDisabled = hook.busy !== undefined

  return (
    <section className="grid gap-4">
      <EarningsFactsList currency={display.currency} facts={display.earningsFacts} />
      {display.hasPersistedPayout ? (
        <DurableTransferEvidence
          facts={display.durableFacts}
          {...(display.recoveryGuidance === undefined
            ? {}
            : { recoveryGuidance: display.recoveryGuidance })}
          canReadRecordedTransfer={display.canReadRecordedTransfer}
          refreshBusy={hook.busy === 'refresh'}
          actionsDisabled={actionsDisabled}
          onRefresh={() => void hook.refreshRecordedStatus()}
        />
      ) : null}
      <PayoutActionBar
        accountState={display.accountState}
        {...(display.stripeMaskLabel === undefined
          ? {}
          : { stripeMaskLabel: display.stripeMaskLabel })}
        {...(display.stripeMaskAriaLabel === undefined
          ? {}
          : { stripeMaskAriaLabel: display.stripeMaskAriaLabel })}
        showStripeUnbound={display.showStripeUnbound}
        expressStatusExplanation={display.expressStatusExplanation}
        payoutGuidanceText={display.payoutGuidanceText}
        showReviewPayout={display.showReviewPayout}
        showExpressDashboard={display.showExpressDashboard}
        showSetupPayouts={display.showSetupPayouts}
        showContinueOnboarding={display.showContinueOnboarding}
        expressOnboardingLabel={display.expressOnboardingLabel}
        expressButtonVariant={display.expressButtonVariant}
        {...(hook.busy === undefined ? {} : { busyKind: hook.busy })}
        actionsDisabled={actionsDisabled}
        expressActionRef={hook.expressActionRef}
        payoutActionRef={hook.payoutActionRef}
        onReviewPayout={() => hook.setConfirmAction('transfer')}
        onExpressDashboard={() => void hook.openExpressDashboard()}
        onSetupPayouts={() => hook.setConfirmAction('connect')}
        onContinueOnboarding={() => hook.setConfirmAction('onboarding')}
      />
      <PayoutConfirmDialog
        {...(hook.confirmAction === undefined ? {} : { confirmAction: hook.confirmAction })}
        connectConfirmDescription={display.connectConfirmDescription}
        onboardingConfirmDescription={display.onboardingConfirmDescription}
        transferConfirmDescription={display.transferConfirmDescription}
        pending={actionsDisabled}
        returnFocusRef={hook.payoutActionRef}
        onOpenChange={hook.handleConfirmOpenChange}
        onConfirm={() => void hook.confirmPayoutAuthority()}
      />
      <EarningsAccountStatus {...hook.status} />
      {display.earningsTruncated ? (
        <p className="text-sm text-muted-foreground">
          The source ledger read was capped at the latest 100 entries for this
          currency; totals may be incomplete.
        </p>
      ) : null}
    </section>
  )
}

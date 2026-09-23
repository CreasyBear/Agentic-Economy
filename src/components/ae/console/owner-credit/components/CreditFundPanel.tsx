import { AeAutoRechargeCard } from '@/components/ae/console/AeAutoRechargeCard'
import { AeAccountFundingPanel } from '@/components/ae/console/AeCreditTopUpPanel'
import { AeMonthlySpendCeilingCard } from '@/components/ae/console/AeMonthlySpendCeilingCard'
import { AeSavedPaymentMethodsCard } from '@/components/ae/console/AeSavedPaymentMethodsCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDisplayAmount } from '@/modules/money/public'

import type { AeOwnerCreditProps } from '../owner-credit.contracts'

export type CreditFundPanelProps = Pick<
  AeOwnerCreditProps,
  | 'accountBalance'
  | 'balanceLoading'
  | 'constraintsLoading'
  | 'accountFundingPort'
  | 'fundingConstraints'
  | 'onCreditRefresh'
  | 'unavailable'
  | 'autoRechargeSettings'
  | 'autoRechargeMandateState'
  | 'autoRechargePendingTopup'
  | 'onSaveAutoRecharge'
  | 'monthlySpendCeilingSettings'
  | 'monthlySpendMonthSpend'
  | 'onSaveMonthlySpendCeiling'
  | 'savedPaymentMethodsSummary'
  | 'savedPaymentMethodsLoading'
  | 'onManageSavedPaymentMethods'
>

export function CreditFundPanel({
  accountBalance,
  balanceLoading = false,
  constraintsLoading = false,
  accountFundingPort,
  fundingConstraints,
  onCreditRefresh,
  unavailable = {},
  autoRechargeSettings,
  autoRechargeMandateState = 'missing',
  autoRechargePendingTopup,
  onSaveAutoRecharge,
  monthlySpendCeilingSettings,
  monthlySpendMonthSpend,
  onSaveMonthlySpendCeiling,
  savedPaymentMethodsSummary,
  savedPaymentMethodsLoading = false,
  onManageSavedPaymentMethods,
}: CreditFundPanelProps) {
  const balance = accountBalance?.kind === 'available' ? accountBalance.balance : undefined
  const balanceUnavailable = accountBalance === undefined || accountBalance.kind === 'refused'
  const balanceRefreshUnavailable = unavailable.balance === true && accountBalance?.kind === 'available'
  const balanceLocked = accountBalance?.kind === 'available' && accountBalance.locked

  return (
    <div id="fund" className="grid gap-related">
      <p className="max-w-[65ch] text-pretty text-sm leading-normal text-muted-foreground">
        Browsing is free. Paid Calls reserve AUD from this Account and remain subject to each Agent’s spending policy.
      </p>
      {balanceLoading && accountBalance === undefined ? (
        <div className="grid gap-intra rounded-card border border-border bg-card p-gutter" aria-busy="true" aria-label="Loading Credit">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      ) : balanceUnavailable ? (
        <Alert>
          <AlertTitle>Credit unavailable</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-related">
            <span>No balance is being inferred. Refresh to read the authoritative Account balance.</span>
            {onCreditRefresh === undefined ? null : (
              <Button type="button" variant="secondary" disabled={balanceLoading} onClick={() => { void onCreditRefresh() }}>
                {balanceLoading ? 'Refreshing…' : 'Refresh balance'}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-intra rounded-card border border-border bg-card p-gutter">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Available credit</p>
          <p className="font-mono text-2xl font-medium tracking-tight tabular-nums">
            {balance === undefined ? 'Checking…' : formatDisplayAmount(balance)}
          </p>
          <p className="text-sm text-muted-foreground">
            {balanceLocked
              ? 'Locked for reconciliation; new paid Calls are refused.'
              : 'Available for admitted paid Calls. Agent spending policies still apply.'}
          </p>
        </div>
      )}
      {balanceRefreshUnavailable ? (
        <Alert>
          <AlertTitle>Balance could not be refreshed</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-related">
            <span>The last authoritative balance remains visible; it has not been replaced with an inferred amount.</span>
            {onCreditRefresh === undefined ? null : (
              <Button type="button" variant="secondary" disabled={balanceLoading} onClick={() => { void onCreditRefresh() }}>
                {balanceLoading ? 'Refreshing…' : 'Try balance again'}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-related">
        <div className="grid gap-intra">
          <h3 className="text-sm font-medium">Add funds</h3>
          <p className="text-sm text-muted-foreground">Review the exact credit, fee, and total before continuing to secure payment.</p>
        </div>
        <AeAccountFundingPanel
          {...(accountFundingPort === undefined ? {} : { port: accountFundingPort })}
          {...(fundingConstraints === undefined ? {} : { constraints: fundingConstraints })}
          constraintsLoading={constraintsLoading}
          {...(accountBalance === undefined ? {} : { accountBalance })}
          {...(onCreditRefresh === undefined ? {} : { onRefresh: onCreditRefresh })}
        />
      </div>
      {onManageSavedPaymentMethods !== undefined ? (
        <AeSavedPaymentMethodsCard
          {...(savedPaymentMethodsSummary === undefined ? {} : { summary: savedPaymentMethodsSummary })}
          isLoading={savedPaymentMethodsLoading}
          onManage={onManageSavedPaymentMethods}
        />
      ) : null}
      {onSaveAutoRecharge !== undefined ? (
        autoRechargeSettings !== undefined ? (
          <AeAutoRechargeCard
            settings={autoRechargeSettings}
            mandateState={autoRechargeMandateState}
            {...(autoRechargePendingTopup === undefined ? {} : { pendingTopup: autoRechargePendingTopup })}
            onSave={onSaveAutoRecharge}
          />
        ) : (
          <div className="grid gap-intra" aria-busy="true" aria-label="Loading auto-recharge settings">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="min-h-[2.75rem] w-full" />
            <div className="flex flex-wrap gap-intra">
              <Skeleton className="h-8 w-40 rounded-full" />
              <Skeleton className="h-8 w-36 rounded-full" />
              <Skeleton className="h-8 w-40 rounded-full" />
            </div>
            <Skeleton className="h-6 w-full max-w-xs" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="min-h-[5.5rem] w-full" />
            <Skeleton className="h-9 w-20" />
          </div>
        )
      ) : null}
      {onSaveMonthlySpendCeiling !== undefined ? (
        monthlySpendCeilingSettings !== undefined ? (
          <AeMonthlySpendCeilingCard
            settings={monthlySpendCeilingSettings}
            {...(monthlySpendMonthSpend === undefined ? {} : { monthSpend: monthlySpendMonthSpend })}
            onSave={onSaveMonthlySpendCeiling}
          />
        ) : (
          <div className="grid gap-intra" aria-busy="true" aria-label="Loading monthly spending cap">
            <Skeleton className="h-5 w-56" />
            <Skeleton className="min-h-[2.75rem] w-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="min-h-[5.5rem] w-full" />
            <Skeleton className="h-9 w-24" />
          </div>
        )
      ) : null}
    </div>
  )
}

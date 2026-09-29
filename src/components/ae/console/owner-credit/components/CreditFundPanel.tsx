import { Link } from '@tanstack/react-router'
import { AeAccountFundingPanel } from '@/components/ae/console/AeCreditTopUpPanel'
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
>

export function CreditFundPanel({
  accountBalance,
  balanceLoading = false,
  constraintsLoading = false,
  accountFundingPort,
  fundingConstraints,
  onCreditRefresh,
  unavailable = {},
}: CreditFundPanelProps) {
  const balance = accountBalance?.kind === 'available' ? accountBalance.balance : undefined
  const balanceUnavailable = accountBalance === undefined || accountBalance.kind === 'refused'
  const balanceRefreshUnavailable = unavailable.balance === true && accountBalance?.kind === 'available'
  const balanceLocked = accountBalance?.kind === 'available' && accountBalance.locked
  const creditStatus = balanceLoading && accountBalance === undefined
    ? 'Loading Credit.'
    : balanceLoading
      ? 'Refreshing available credit.'
      : balanceUnavailable
        ? 'Credit unavailable. No balance is being inferred.'
        : balance === undefined
          ? 'Checking available credit.'
          : balanceRefreshUnavailable
            ? `Available credit ${formatDisplayAmount(balance)}. The latest refresh failed, so this is the last authoritative balance.`
            : `Available credit ${formatDisplayAmount(balance)}.`

  return (
    <div id="fund" className="grid gap-related">
      <p className="max-w-[65ch] text-pretty text-sm leading-normal text-muted-foreground">
        Browsing is free. Paid Calls reserve AUD from this Account and remain subject to each Agent’s spending policy.
      </p>
      <p className="sr-only" aria-live="polite">
        {creditStatus}
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
      <div className="flex flex-wrap gap-4 text-sm">
        <Link className="text-primary underline-offset-4 hover:underline" to="/owner/settings/payment-methods">Manage payment methods</Link>
        <Link className="text-primary underline-offset-4 hover:underline" to="/owner/settings/spending">Configure spending defaults</Link>
        <Link className="text-primary underline-offset-4 hover:underline" to="/owner/settings/receipts">View receipts &amp; invoices</Link>
      </div>
    </div>
  )
}

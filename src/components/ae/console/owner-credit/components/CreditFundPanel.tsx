import { Link } from '@tanstack/react-router'
import { AeAccountFundingPanel } from '@/components/ae/console/AeCreditTopUpPanel'
import { BillingOverview } from '@/components/ae/shared/arc-pro/billing-overview/billing-overview'
import { Button } from '@/components/arc/button/button'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'
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
  const purchasedBalance = accountBalance?.kind === 'available' ? accountBalance.balance : undefined
  const balance = accountBalance?.kind === 'available' ? accountBalance.totalBalance ?? accountBalance.balance : undefined
  const promotionalBalance = accountBalance?.kind === 'available' ? accountBalance.promotionalBalance : undefined
  const nextPromotionalExpiryAt = accountBalance?.kind === 'available' ? accountBalance.nextPromotionalExpiryAt : undefined
  const expiryLabel = nextPromotionalExpiryAt == null ? undefined : new Intl.DateTimeFormat('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
    timeZone: 'Australia/Perth', timeZoneName: 'short',
  }).format(nextPromotionalExpiryAt)
  const balanceUnavailable = accountBalance === undefined || accountBalance.kind === 'refused'
  const balanceRefreshUnavailable = unavailable.balance === true && accountBalance?.kind === 'available'
  const balanceLocked = accountBalance?.kind === 'available' && accountBalance.locked
  const creditStatus = balanceLoading && accountBalance === undefined
    ? 'Loading credit.'
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
    <div id="fund" className="arc-credit-fund">
      <p className="arc-credit-fund__intro">
        Browsing is free. Paid Calls reserve AUD from this Account and remain subject to each Agent’s spending policy.
      </p>
      <p className="sr-only" aria-live="polite">
        {creditStatus}
      </p>
      <BillingOverview
        balance={{
          label: balanceLoading && accountBalance === undefined ? 'Loading credit' : 'Available credit',
          value: balance === undefined ? undefined : formatDisplayAmount(balance),
          busy: balanceLoading,
          content: balanceLoading && accountBalance === undefined ? (
            <div aria-hidden="true" className="grid gap-3">
              <Skeleton lines={3} />
            </div>
          ) : balanceUnavailable ? (
            <AeAlert role="alert" tone="info" title="Credit unavailable"><div className="arc-credit-alert__description">
                <span>No balance is being inferred. Refresh to read the authoritative Account balance.</span>
                {onCreditRefresh === undefined ? null : (
                  <Button type="button" variant="secondary" disabled={balanceLoading} onClick={() => { void onCreditRefresh() }}>
                    {balanceLoading ? 'Refreshing…' : 'Refresh balance'}
                  </Button>
                )}
              </div></AeAlert>
          ) : (
          <>
            {balance === undefined ? <p>Checking…</p> : null}
            {purchasedBalance === undefined || promotionalBalance === undefined ? null : (
              <dl className="arc-credit-balance__breakdown grid gap-1 text-sm text-muted-foreground">
                <div className="arc-credit-balance__fact-row flex flex-wrap items-baseline justify-between gap-2">
                  <dt>Purchased credit</dt>
                  <dd className="font-mono tabular-nums text-foreground">{formatDisplayAmount(purchasedBalance)}</dd>
                </div>
                {promotionalBalance === undefined ? null : (
                  <div className="arc-credit-balance__fact-row flex flex-wrap items-baseline justify-between gap-2">
                    <dt>Promotional credit</dt>
                    <dd className="font-mono tabular-nums text-foreground">{formatDisplayAmount(promotionalBalance)}</dd>
                  </div>
                )}
              </dl>
            )}
            {promotionalBalance !== undefined && promotionalBalance.units !== '0' && expiryLabel !== undefined ? (
              <p className="arc-credit-balance__meta">Next promotional credit expiry: {expiryLabel}.</p>
            ) : null}
            <p className="arc-credit-balance__meta">
              {balanceLocked
                ? 'Locked for reconciliation; new paid Calls are refused.'
                : 'Available for admitted paid Calls. Agent spending policies still apply.'}
            </p>
            {balanceRefreshUnavailable ? (
              <AeAlert role="alert" tone="info" title="Balance could not be refreshed" className="arc-credit-balance__refresh-alert"><div className="arc-credit-alert__description">
                  <span>The last authoritative balance remains visible; it has not been replaced with an inferred amount.</span>
                  {onCreditRefresh === undefined ? null : (
                    <Button type="button" variant="secondary" disabled={balanceLoading} onClick={() => { void onCreditRefresh() }}>
                      {balanceLoading ? 'Refreshing…' : 'Try balance again'}
                    </Button>
                  )}
                </div></AeAlert>
            ) : null}
          </>
        ),
        }}
        funding={{
          label: 'Add funds',
          description: 'Review the exact credit, fee, and total before continuing to secure payment.',
          content: <AeAccountFundingPanel
            {...(accountFundingPort === undefined ? {} : { port: accountFundingPort })}
            {...(fundingConstraints === undefined ? {} : { constraints: fundingConstraints })}
            constraintsLoading={constraintsLoading}
            {...(accountBalance === undefined ? {} : { accountBalance })}
            {...(onCreditRefresh === undefined ? {} : { onRefresh: onCreditRefresh })}
          />,
        }}
      />
      <div className="arc-credit-fund__links">
        <Link className="text-primary underline-offset-4 hover:underline" to="/owner/settings/spending">Configure spending defaults</Link>
        <Link className="text-primary underline-offset-4 hover:underline" to="/owner/settings/receipts">View receipts &amp; invoices</Link>
      </div>
    </div>
  )
}

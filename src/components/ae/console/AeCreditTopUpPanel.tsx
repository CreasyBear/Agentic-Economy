import { useEffect, useRef } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/lib/ui/toast'
import { formatDisplayAmount } from '@/modules/money/public'
import type { AccountFundingBalance, AccountFundingConstraints } from '@/modules/money/server'
import {
  audInputTextFromUnits,
  canStartAnotherPayment,
  formatAudAmountString,
  formatAudGstNote,
  formatAudUnits,
  formatAustralianGstPercentLabel,
} from './credit-top-up-format'
import { defaultCheckoutRedirect } from './credit-top-up-storage'
import type { AccountFundingPort } from '@/modules/money/account-funding.contracts'
import {
  useAccountFunding,
} from './use-account-funding'

const DENOMINATION_CHIP_CLASS =
  'inline-flex min-h-touch items-center rounded-full border px-3 py-1.5 font-mono text-xs font-medium tabular-nums enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'

const QUOTE_SHELL_CLASS =
  'grid min-h-[13.5rem] gap-3 rounded-lg border border-border/70 bg-muted/30 p-3 text-sm'

export type AeAccountFundingPanelProps = Readonly<{
  port?: AccountFundingPort
  constraints?: AccountFundingConstraints
  constraintsLoading?: boolean
  accountBalance?: AccountFundingBalance
  onRefresh?: () => void | Promise<void>
  redirectToCheckout?: (url: string) => void
}>

export function AeAccountFundingPanel({
  port,
  constraints,
  constraintsLoading = false,
  accountBalance,
  onRefresh,
  redirectToCheckout = defaultCheckoutRedirect,
}: AeAccountFundingPanelProps) {
  const {
    state,
    dispatch,
    pending,
    checking,
    preview,
    suggestedPrincipalUnits,
    selectedPrincipalUnits,
    quoteRefreshRequired,
    checkoutResumable,
    handleAmountChange,
    handleAmountBlur,
    beginTopUp,
    startAnotherPayment,
    refreshPayment,
    resumeCheckout,
    refreshFundingQuote,
  } = useAccountFunding({ port, constraints, onRefresh, redirectToCheckout })

  const {
    amountErrorMessage,
    amountInvalid,
    amountText,
    errorMessage,
    paymentStatus,
    recovery,
    session,
  } = state

  const succeededToastFired = useRef(false)
  useEffect(() => {
    if (paymentStatus !== 'succeeded') {
      succeededToastFired.current = false
      return
    }
    if (succeededToastFired.current) return
    succeededToastFired.current = true
    const balance = accountBalance?.kind === 'available' ? accountBalance.balance : undefined
    const description = balance !== undefined
      ? `Available credit is now ${formatDisplayAmount(balance)}. Paid Calls can use it immediately.`
      : 'Credit will show in Available credit above. Your card charge is confirmed.'
    toast.success('Payment received', { description })
  }, [accountBalance, paymentStatus])

  const taxOnServiceFeeBps = constraints?.kind === 'available' ? constraints.taxOnServiceFeeBps : 1000

  return (
    <div className="grid gap-3">
      {port === undefined || (!constraintsLoading && constraints?.kind !== 'available') ? (
        <Alert>
          <AlertTitle>Account funding is unavailable</AlertTitle>
          <AlertDescription>Funding limits could not be confirmed. No payment was made. Nothing was charged.</AlertDescription>
        </Alert>
      ) : null}
      {errorMessage !== undefined ? (
        <Alert variant={paymentStatus === 'failed' ? 'destructive' : 'default'}>
          <AlertTitle>
            {paymentStatus === 'failed'
              ? 'Payment did not complete'
              : session?.evidence.checkoutStatus === 'expired' && paymentStatus !== 'succeeded'
                ? 'Checkout expired'
                : quoteRefreshRequired
                  ? 'Funding quote changed'
                  : errorMessage.includes('Secure checkout could not be opened')
                    ? 'Secure checkout could not be opened'
                    : paymentStatus === 'outcome_unknown'
                      ? 'Payment is still being verified'
                      : 'Payment status'}
          </AlertTitle>
          <AlertDescription>
            <span>{errorMessage}</span>
            {quoteRefreshRequired && onRefresh !== undefined ? (
              <Button type="button" variant="secondary" disabled={pending || checking} onClick={() => void refreshFundingQuote()}>
                Refresh funding quote
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {checking ? <p className="text-sm text-muted-foreground" role="status">Checking payment status…</p> : null}
      {paymentStatus === 'pending' && session?.evidence.checkoutStatus !== 'expired' ? (
        <p className="text-sm text-muted-foreground" role="status">
          {checkoutResumable
            ? 'Secure checkout is ready. Continue this payment, or refresh its status if checkout was already completed.'
            : 'Payment is still processing. A$0.00 has been added until this payment is confirmed.'}
        </p>
      ) : null}
      {paymentStatus === 'outcome_unknown' ? (
        <Alert>
          <AlertTitle>Payment is still being verified</AlertTitle>
          <AlertDescription>
            Do not start another payment. Your balance will not change until confirmation. Choose Refresh payment status.
          </AlertDescription>
        </Alert>
      ) : null}
      {paymentStatus === 'succeeded' ? (
        <Alert>
          <AlertTitle>Payment received</AlertTitle>
          <AlertDescription>
            Your payment was confirmed. Credit is available in your balance above and ready for Calls.
          </AlertDescription>
        </Alert>
      ) : null}
      {constraintsLoading && port !== undefined ? (
        <div className="grid gap-2" aria-busy="true" aria-label="Loading funding amounts">
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-8 w-[4.5rem] rounded-full" />
            <Skeleton className="h-8 w-[4.5rem] rounded-full" />
            <Skeleton className="h-8 w-[4.5rem] rounded-full" />
          </div>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="min-h-[13.5rem] w-full rounded-lg" />
        </div>
      ) : null}
      {session === undefined && recovery === undefined && port !== undefined && constraints?.kind === 'available' ? (
        <div className="grid gap-2">
          {suggestedPrincipalUnits.length > 0 ? (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Choose a credit amount</legend>
              <div className="flex flex-wrap gap-2">
                {suggestedPrincipalUnits.map((units) => {
                  const selected = selectedPrincipalUnits === units
                  return (
                    <Button
                      key={units.toString()}
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-pressed={selected}
                      disabled={pending || checking}
                      onClick={() => {
                        dispatch({
                          type: 'amount_changed',
                          amountText: audInputTextFromUnits(units),
                          valid: true,
                        })
                      }}
                      className={
                        selected
                          ? `${DENOMINATION_CHIP_CLASS} border-foreground bg-muted hover:bg-muted`
                          : `${DENOMINATION_CHIP_CLASS} border-border bg-container hover:bg-muted/60`
                      }
                    >
                      +{formatAudUnits(units)}
                    </Button>
                  )
                })}
              </div>
            </fieldset>
          ) : null}
          <div className="grid gap-1.5">
            <Label htmlFor="account-funding-amount">Other amount (AUD)</Label>
            <Input
              id="account-funding-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(event) => handleAmountChange(event.target.value)}
              onBlur={handleAmountBlur}
              disabled={pending || checking}
              placeholder="10.00"
              aria-invalid={amountInvalid}
              aria-describedby={amountInvalid ? 'account-funding-amount-help account-funding-amount-error' : 'account-funding-amount-help'}
              className="font-mono tabular-nums"
            />
            <p id="account-funding-amount-help" className="text-xs text-muted-foreground">
              Add {formatAudAmountString(constraints.minimumPrincipalUnits)} to {formatAudAmountString(constraints.maximumPrincipalUnits)} in {formatAudAmountString(constraints.incrementUnits)} increments.
            </p>
            {amountInvalid ? <p id="account-funding-amount-error" className="text-sm text-destructive" role="alert">{amountErrorMessage ?? 'Enter an amount within the displayed limits and increments.'}</p> : null}
            <div className={QUOTE_SHELL_CLASS} role="group" aria-label="Funding quote and payment">
              {preview === undefined ? (
                <>
                  <p className="m-0 text-muted-foreground">
                    Enter or choose an amount to see credit, fee, GST, and total.
                  </p>
                  <div className="mt-auto border-t border-border/70 pt-3">
                    <Button type="button" disabled className="min-h-touch w-full sm:w-auto">
                      Choose an amount to continue
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1" aria-label="Funding quote">
                    <dt className="text-muted-foreground">Credit added</dt>
                    <dd className="font-mono tabular-nums">{formatAudUnits(preview.principalUnits)}</dd>
                    <dt className="text-muted-foreground">Platform fee</dt>
                    <dd className="font-mono tabular-nums">{formatAudUnits(preview.serviceFeeUnits)}</dd>
                    <dt className="text-muted-foreground">{formatAustralianGstPercentLabel(taxOnServiceFeeBps)}</dt>
                    <dd className="font-mono tabular-nums">{formatAudUnits(preview.taxUnits)}</dd>
                    <dt className="font-medium">Total payable</dt>
                    <dd className="font-mono font-medium tabular-nums">{formatAudUnits(preview.totalUnits)}</dd>
                  </dl>
                  <p className="m-0 text-xs text-muted-foreground">
                    {formatAudGstNote(preview.taxUnits, taxOnServiceFeeBps)}
                  </p>
                  <p className="m-0 text-muted-foreground">
                    Your Account receives the full {formatAudUnits(preview.principalUnits)} after payment is confirmed.
                  </p>
                  <div className="border-t border-border/70 pt-3">
                    <Button
                      disabled={pending || checking || quoteRefreshRequired}
                      onClick={() => void beginTopUp()}
                      className="min-h-touch"
                    >
                      {pending ? <Spinner data-icon="inline-start" /> : null}
                      {pending
                        ? 'Preparing secure payment…'
                        : `Pay ${formatAudUnits(preview.totalUnits)} and add ${formatAudUnits(preview.principalUnits)}`}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {checkoutResumable ? (
          <Button type="button" variant="secondary" disabled={checking || pending} onClick={resumeCheckout} className="min-h-touch">
            Continue secure payment
          </Button>
        ) : canStartAnotherPayment(paymentStatus, session) ? (
          <Button type="button" variant="secondary" disabled={checking || pending} onClick={startAnotherPayment} className="min-h-touch">
            Add more credit
          </Button>
        ) : null}
        {recovery !== undefined && paymentStatus !== 'succeeded' && paymentStatus !== 'failed' ? (
          <Button type="button" variant="ghost" disabled={checking || pending} onClick={() => void refreshPayment()} className="min-h-touch">
            {checking ? <Spinner data-icon="inline-start" /> : null}
            {checking ? 'Checking payment…' : 'Refresh payment status'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

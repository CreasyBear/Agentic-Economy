import { useEffect, useRef } from 'react'

import { Button } from '@/components/arc/button/button'
import { RadioCards } from '@/components/arc/radio-cards/radio-cards'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import './FundingComposition.css'

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
  const selectedSuggestedUnits = suggestedPrincipalUnits.find((units) => units === selectedPrincipalUnits)
  const selectedSuggestedValue = selectedSuggestedUnits === undefined
    ? null
    : audInputTextFromUnits(selectedSuggestedUnits)

  return (
    <div className="arc-market arc-funding-review">
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
      {checking ? <p className="arc-funding-detail" role="status">Checking payment status…</p> : null}
      {paymentStatus === 'pending' && session?.evidence.checkoutStatus !== 'expired' ? (
        <p className="arc-funding-detail" role="status">
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
      {constraintsLoading && port !== undefined && constraints?.kind !== 'available' ? (
        <div className="arc-funding-loading" role="status" aria-busy="true" aria-label="Loading funding amounts">
          <div className="arc-funding-loading-options">
            <div className="arc-funding-skeleton-chip" aria-hidden="true"><Skeleton lines={1} /></div>
            <div className="arc-funding-skeleton-chip" aria-hidden="true"><Skeleton lines={1} /></div>
            <div className="arc-funding-skeleton-chip" aria-hidden="true"><Skeleton lines={1} /></div>
          </div>
          <div className="arc-funding-skeleton-input" aria-hidden="true"><Skeleton lines={2} /></div>
          <div className="arc-funding-skeleton-summary" aria-hidden="true"><Skeleton lines={3} /></div>
        </div>
      ) : null}
      {session === undefined && recovery === undefined && port !== undefined && constraints?.kind === 'available' ? (
        <div className="arc-funding-form">
          {suggestedPrincipalUnits.length > 0 ? (
            <RadioCards
              aria-label="Choose a credit amount"
              className="arc-market arc-funding-denominations"
              disabled={pending || checking}
              layout="grid"
              value={selectedSuggestedValue}
              onValueChange={(amountText) => dispatch({ type: 'amount_changed', amountText, valid: true })}
              options={suggestedPrincipalUnits.map((units) => {
                const amount = formatAudUnits(units)
                return {
                  value: audInputTextFromUnits(units),
                  label: <span className="font-mono tabular-nums">+{amount}</span>,
                  description: 'Available credit updates after payment is confirmed.',
                }
              })}
            />
          ) : null}
          <div className="arc-funding-custom-amount">
            <label htmlFor="account-funding-amount">Other amount (AUD)</label>
            <input
              id="account-funding-amount"
              className="arc-funding-input"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(event) => handleAmountChange(event.target.value)}
              onBlur={handleAmountBlur}
              disabled={pending || checking}
              placeholder="10.00"
              aria-invalid={amountInvalid}
              aria-describedby={amountInvalid ? 'account-funding-amount-help account-funding-amount-error' : 'account-funding-amount-help'}
            />
            <p id="account-funding-amount-help" className="arc-funding-help">
              Add {formatAudAmountString(constraints.minimumPrincipalUnits)} to {formatAudAmountString(constraints.maximumPrincipalUnits)} in {formatAudAmountString(constraints.incrementUnits)} increments.
            </p>
            {amountInvalid ? <p id="account-funding-amount-error" className="arc-funding-error" role="alert">{amountErrorMessage ?? 'Enter an amount within the displayed limits and increments.'}</p> : null}
            <div className="arc-funding-summary" role="group" aria-label="Funding quote and payment">
              {preview === undefined ? (
                <>
                  <p className="arc-funding-summary-message">
                    Enter or choose an amount to see credit, fee, GST, and total.
                  </p>
                  <div className="arc-funding-summary-action">
                    <Button type="button" disabled className="arc-funding-pay">
                      Choose an amount to continue
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <dl className="arc-funding-lines" aria-label="Funding quote">
                    <div className="arc-funding-line">
                      <dt>Credit added</dt>
                      <dd>{formatAudUnits(preview.principalUnits)}</dd>
                    </div>
                    <div className="arc-funding-line">
                      <dt>Platform fee</dt>
                      <dd>{formatAudUnits(preview.serviceFeeUnits)}</dd>
                    </div>
                    <div className="arc-funding-line">
                      <dt>{formatAustralianGstPercentLabel(taxOnServiceFeeBps)}</dt>
                      <dd>{formatAudUnits(preview.taxUnits)}</dd>
                    </div>
                    <div className="arc-funding-line arc-funding-total">
                      <dt>Total payable</dt>
                      <dd>{formatAudUnits(preview.totalUnits)}</dd>
                    </div>
                  </dl>
                  <p className="arc-funding-detail">
                    {formatAudGstNote(preview.taxUnits, taxOnServiceFeeBps)}
                  </p>
                  <p className="arc-funding-detail">
                    Your Account receives the full {formatAudUnits(preview.principalUnits)} after payment is confirmed.
                  </p>
                  <div className="arc-funding-summary-action">
                    <Button
                      type="button"
                      disabled={pending || checking || quoteRefreshRequired}
                      onClick={() => void beginTopUp()}
                      className="arc-funding-pay"
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
      <div className="arc-funding-recovery-actions">
        {checkoutResumable ? (
          <Button type="button" variant="secondary" disabled={checking || pending} onClick={resumeCheckout} className="arc-funding-action">
            Continue secure payment
          </Button>
        ) : canStartAnotherPayment(paymentStatus, session) ? (
          <Button type="button" variant="secondary" disabled={checking || pending} onClick={startAnotherPayment} className="arc-funding-action">
            Add more credit
          </Button>
        ) : null}
        {recovery !== undefined && paymentStatus !== 'succeeded' && paymentStatus !== 'failed' ? (
          <Button type="button" variant="ghost" disabled={checking || pending} onClick={() => void refreshPayment()} className="arc-funding-action">
            {checking ? <Spinner data-icon="inline-start" /> : null}
            {checking ? 'Checking payment…' : 'Refresh payment status'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

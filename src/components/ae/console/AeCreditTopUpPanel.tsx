import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import type { AccountFundingConstraints } from '@/modules/money/server'
import {
  audInputTextFromUnits,
  canStartAnotherPayment,
  formatAudAmountString,
  formatAudUnits,
} from './credit-top-up-format'
import { defaultCheckoutRedirect } from './credit-top-up-storage'
import {
  useAccountFunding,
  type AccountFundingPort,
} from './use-account-funding'

export type { AccountFundingPort }

export type AeAccountFundingPanelProps = Readonly<{
  port?: AccountFundingPort
  constraints?: AccountFundingConstraints
  constraintsLoading?: boolean
  onRefresh?: () => void | Promise<void>
  redirectToCheckout?: (url: string) => void
}>

export function AeAccountFundingPanel({
  port,
  constraints,
  constraintsLoading = false,
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

  return (
    <div className="grid gap-3">
      {port === undefined || (!constraintsLoading && constraints?.kind !== 'available') ? (
        <Alert>
          <AlertTitle>Account funding is unavailable</AlertTitle>
          <AlertDescription>Funding limits could not be confirmed. No payment was started.</AlertDescription>
        </Alert>
      ) : null}
      {errorMessage !== undefined ? (
        <Alert variant={paymentStatus === 'failed' ? 'destructive' : 'default'}>
          <AlertTitle>{paymentStatus === 'failed' ? 'Payment did not complete' : 'Payment status'}</AlertTitle>
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
            : 'Payment is still processing. Refresh its status before taking another action.'}
        </p>
      ) : null}
      {paymentStatus === 'outcome_unknown' ? (
        <Alert>
          <AlertTitle>Payment is still being verified</AlertTitle>
          <AlertDescription>Do not start another payment. Refresh this payment’s status; credit appears only after confirmation.</AlertDescription>
        </Alert>
      ) : null}
      {paymentStatus === 'succeeded' ? (
        <Alert>
          <AlertTitle>Payment received</AlertTitle>
          <AlertDescription>Check the Account balance and Balance history below to confirm the credit is available.</AlertDescription>
        </Alert>
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
                      variant={selected ? 'secondary' : 'outline'}
                      aria-pressed={selected}
                      disabled={pending || checking}
                      onClick={() => {
                        dispatch({
                          type: 'amount_changed',
                          amountText: audInputTextFromUnits(units),
                          valid: true,
                        })
                      }}
                      className="min-h-touch"
                    >
                      {formatAudUnits(units)}
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
            />
            <p id="account-funding-amount-help" className="text-xs text-muted-foreground">
              Add {formatAudAmountString(constraints.minimumPrincipalUnits)} to {formatAudAmountString(constraints.maximumPrincipalUnits)} in {formatAudAmountString(constraints.incrementUnits)} increments.
            </p>
            {amountInvalid ? <p id="account-funding-amount-error" className="text-sm text-destructive" role="alert">{amountErrorMessage ?? 'Enter an amount within the displayed limits and increments.'}</p> : null}
            {preview === undefined ? null : (
              <div className="grid gap-3 rounded-lg border border-border/70 bg-muted/30 p-3 text-sm" role="group" aria-label="Funding quote and payment">
                <p className="m-0 text-muted-foreground">
                  Your Account receives the full credit amount after payment is confirmed.
                </p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1" aria-label="Funding quote">
                  <dt className="text-muted-foreground">Credit added</dt>
                  <dd className="font-mono">{formatAudUnits(preview.principalUnits)}</dd>
                  <dt className="text-muted-foreground">Fee (including GST)</dt>
                  <dd className="font-mono">{formatAudUnits(preview.serviceFeeUnits + preview.taxUnits)}</dd>
                  <dt className="font-medium">Total payable</dt>
                  <dd className="font-mono font-medium">{formatAudUnits(preview.totalUnits)}</dd>
                </dl>
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
              </div>
            )}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {checkoutResumable ? (
          <Button type="button" disabled={checking || pending} onClick={resumeCheckout} className="min-h-touch">
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

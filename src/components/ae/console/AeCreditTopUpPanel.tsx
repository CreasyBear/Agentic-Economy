import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  AUD_EXPONENT,
  canonicalAudUnits,
  formatDisplayAmount,
  isMoneyRefusal,
  quoteAudAccountFunding,
  type CreditPaymentSession,
  type MoneyRefusal,
} from '@/modules/money/public'
import type {
  AccountFundingBeginInput,
  AccountFundingConstraints,
  AccountFundingOutcomeUnknownResult,
  AccountFundingReadInput,
  AccountFundingStartResult,
} from '@/modules/money/server'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { degrade } from '@/lib/observability/degrade'

export type AccountFundingPort = Readonly<{
  begin: (input: AccountFundingBeginInput) => Promise<AccountFundingStartResult>
  read: (input: AccountFundingReadInput) => Promise<CreditPaymentSession | MoneyRefusal>
}>

export type AeAccountFundingPanelProps = Readonly<{
  port?: AccountFundingPort
  constraints?: AccountFundingConstraints
  constraintsLoading?: boolean
  onRefresh?: () => void | Promise<void>
  redirectToCheckout?: (url: string) => void
}>

type RecoveryLocator =
  | Readonly<{ externalRef: string; idempotencyKey?: string }>
  | Readonly<{ commandRef: string; idempotencyKey: string }>

type CreditPaymentStatus = CreditPaymentSession['evidence']['status']

type FundingUiState = Readonly<{
  operation: 'idle' | 'starting' | 'checking'
  amountText: string
  amountInvalid: boolean
  session: CreditPaymentSession | undefined
  paymentStatus: CreditPaymentStatus | undefined
  errorMessage: string | undefined
  recovery: RecoveryLocator | undefined
}>

type FundingUiAction =
  | Readonly<{ type: 'amount_changed'; amountText: string; valid: boolean }>
  | Readonly<{ type: 'amount_rejected' }>
  | Readonly<{ type: 'operation_started'; operation: 'starting' | 'checking' }>
  | Readonly<{ type: 'operation_finished' }>
  | Readonly<{ type: 'recovery_found'; recovery: RecoveryLocator }>
  | Readonly<{ type: 'payment_read'; session: CreditPaymentSession; recovery: RecoveryLocator }>
  | Readonly<{ type: 'payment_refused'; paymentStatus: CreditPaymentStatus | undefined; errorMessage: string | undefined }>
  | Readonly<{ type: 'payment_outcome_unknown'; recovery?: RecoveryLocator }>
  | Readonly<{ type: 'payment_started'; session: CreditPaymentSession; recovery: RecoveryLocator }>
  | Readonly<{ type: 'error_changed'; errorMessage: string }>
  | Readonly<{ type: 'reset' }>

const initialFundingUiState: FundingUiState = Object.freeze({
  operation: 'idle',
  amountText: '',
  amountInvalid: false,
  session: undefined,
  paymentStatus: undefined,
  errorMessage: undefined,
  recovery: undefined,
})

function fundingUiReducer(state: FundingUiState, action: FundingUiAction): FundingUiState {
  switch (action.type) {
    case 'amount_changed':
      return { ...state, amountText: action.amountText, amountInvalid: action.valid ? false : state.amountInvalid }
    case 'amount_rejected':
      return { ...state, amountInvalid: true }
    case 'operation_started':
      return { ...state, operation: action.operation, errorMessage: undefined }
    case 'operation_finished':
      return { ...state, operation: 'idle' }
    case 'recovery_found':
      return { ...state, recovery: action.recovery }
    case 'payment_read': {
      const status = action.session.evidence.status
      return {
        ...state,
        session: action.session,
        paymentStatus: status,
        recovery: action.recovery,
        errorMessage: status === 'failed'
          ? 'The provider did not complete this payment. No Account funds were added.'
          : status === 'outcome_unknown'
            ? 'Payment status is still being verified. No Account funds were added by this browser return.'
            : undefined,
      }
    }
    case 'payment_refused':
      return { ...state, paymentStatus: action.paymentStatus, errorMessage: action.errorMessage }
    case 'payment_outcome_unknown':
      return {
        ...state,
        paymentStatus: 'outcome_unknown',
        errorMessage: undefined,
        ...(action.recovery === undefined ? {} : { recovery: action.recovery }),
      }
    case 'payment_started':
      return { ...state, session: action.session, recovery: action.recovery }
    case 'error_changed':
      return { ...state, errorMessage: action.errorMessage }
    case 'reset':
      return initialFundingUiState
  }
}

const recoveryStorageKey = 'ae.account-funding.recovery.v1'

export function AeAccountFundingPanel({
  port,
  constraints,
  constraintsLoading = false,
  onRefresh,
  redirectToCheckout = defaultCheckoutRedirect,
}: AeAccountFundingPanelProps) {
  const [state, dispatch] = useReducer(fundingUiReducer, initialFundingUiState)
  const { amountInvalid, amountText, errorMessage, paymentStatus, recovery, session } = state
  const pending = state.operation === 'starting'
  const checking = state.operation === 'checking'
  const idempotencyKey = useRef<string | undefined>(undefined)
  const recoveryAttempted = useRef(false)
  const policy = useMemo(() => constraints?.kind === 'available'
    ? {
        minimumPrincipalUnits: BigInt(constraints.minimumPrincipalUnits),
        maximumPrincipalUnits: BigInt(constraints.maximumPrincipalUnits),
        incrementUnits: BigInt(constraints.incrementUnits),
        serviceFeeBps: constraints.serviceFeeBps,
        taxOnServiceFeeBps: constraints.taxOnServiceFeeBps,
        legalCustomerMaximumAccessibleUnits: BigInt(constraints.legalCustomerMaximumAccessibleUnits),
      }
    : undefined, [constraints])
  const preview = useMemo(() => {
    const units = canonicalAudUnits(amountText)
    return units === undefined || policy === undefined
      ? undefined
      : quoteAudAccountFunding(units, policy)
  }, [amountText, policy])

  const readCanonicalPayment = useCallback(async (locator: RecoveryLocator) => {
    if (port === undefined) return
    dispatch({ type: 'operation_started', operation: 'checking' })
    try {
      const result = await port.read(locator)
      if (isMoneyRefusal(result)) {
        dispatch({
          type: 'payment_refused',
          paymentStatus: result.code === 'funding_pending' ? 'pending' : result.code === 'funding_outcome_unknown' ? 'outcome_unknown' : undefined,
          errorMessage: result.code === 'funding_pending' || result.code === 'funding_outcome_unknown'
            ? undefined
            : topUpErrorCopy(result),
        })
        return
      }
      dispatch({ type: 'payment_read', session: result, recovery: locator })
      persistRecovery(locator)
      try {
        await onRefresh?.()
      } catch (cause) {
        dispatch({ type: 'error_changed', errorMessage: degrade(cause, 'Payment was read back, but the canonical Account balance is temporarily unavailable.', { site: 'readCanonicalPayment.onRefresh', reason: 'source_unavailable' }) })
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      dispatch({ type: 'payment_outcome_unknown' })
      dispatch({ type: 'error_changed', errorMessage: 'Payment status is still being checked. Your Account balance has not been updated by this browser return.' })
    } finally {
      dispatch({ type: 'operation_finished' })
    }
  }, [onRefresh, port])

  useEffect(() => {
    if (port === undefined || recoveryAttempted.current) return
    const stored = readStoredRecovery()
    const returnedExternalRef = readReturnedExternalRef()
    const locator = returnedExternalRef === undefined
      ? stored
      : { externalRef: returnedExternalRef }
    if (locator === undefined) return
    recoveryAttempted.current = true
    idempotencyKey.current = locator.idempotencyKey
    dispatch({ type: 'recovery_found', recovery: locator })
    void readCanonicalPayment(locator)
  }, [port, readCanonicalPayment])

  async function beginTopUp() {
    if (pending || port === undefined) return
    const units = canonicalAudUnits(amountText)
    if (units === undefined || policy === undefined || constraints?.kind !== 'available' || quoteAudAccountFunding(units, policy) === undefined) {
      dispatch({ type: 'amount_rejected' })
      return
    }
    const nextIdempotencyKey = idempotencyKey.current ?? `account-funding:${randomId()}`
    idempotencyKey.current = nextIdempotencyKey
    dispatch({ type: 'operation_started', operation: 'starting' })
    try {
      const result = await port.begin({
        amount: { currency: 'AUD', units: units.toString(), exponent: AUD_EXPONENT },
        expectedPolicyDigest: constraints.policyDigest,
        idempotencyKey: nextIdempotencyKey,
      })
      if (result.kind === 'outcome_unknown') {
        const locator = { commandRef: result.commandRef, idempotencyKey: nextIdempotencyKey }
        dispatch({ type: 'payment_outcome_unknown', recovery: locator })
        persistRecovery(locator)
        return
      }
      if (result.kind === 'refused') {
        dispatch({ type: 'error_changed', errorMessage: topUpErrorCopy(result) })
        if (result.code === 'price_changed') {
          try {
            await onRefresh?.()
          } catch (cause) {
            captureClientExceptionOnClient(cause)
          }
        }
        return
      }
      const locator = { externalRef: result.session.evidence.externalRef, idempotencyKey: nextIdempotencyKey }
      dispatch({ type: 'payment_started', session: result.session, recovery: locator })
      persistRecovery(locator)
      if (result.session.kind === 'hosted_redirect' && result.session.checkoutUrl !== undefined) {
        redirectToCheckout(result.session.checkoutUrl)
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      dispatch({ type: 'error_changed', errorMessage: 'Account funding could not be started. No payment was confirmed; try again.' })
    } finally {
      dispatch({ type: 'operation_finished' })
    }
  }

  function startAnotherPayment() {
    if (pending || checking || (paymentStatus !== 'succeeded' && paymentStatus !== 'failed')) return
    idempotencyKey.current = undefined
    dispatch({ type: 'reset' })
    try {
      window.sessionStorage.removeItem(recoveryStorageKey)
      const url = new URL(window.location.href)
      for (const key of ['funding', 'checkout_session_id', 'session_id']) url.searchParams.delete(key)
      window.history.replaceState(window.history.state, '', url)
    } catch (cause) {
      // The current render can start a new payment even when browser storage is unavailable.
      captureRouteException(cause, { site: 'startAnotherPayment' }, 'warning')
    }
  }

  async function refreshPayment() {
    if (recovery === undefined || pending || checking) return
    await readCanonicalPayment(recovery)
  }

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
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        {checking ? <p className="text-sm text-muted-foreground" role="status">Checking payment status…</p> : null}
        {paymentStatus === 'pending' ? <p className="text-sm text-muted-foreground" role="status">Payment is still processing. Refresh its status before taking another action.</p> : null}
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
            <Label htmlFor="account-funding-amount">Credit to add (AUD)</Label>
            <Input
              id="account-funding-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(event) => {
                dispatch({
                  type: 'amount_changed',
                  amountText: event.target.value,
                  valid: canonicalAudUnits(event.target.value) !== undefined,
                })
              }}
              disabled={pending || checking}
              placeholder="10.00"
              aria-invalid={amountInvalid}
              aria-describedby={amountInvalid ? 'account-funding-amount-help account-funding-amount-error' : 'account-funding-amount-help'}
            />
            <p id="account-funding-amount-help" className="text-xs text-muted-foreground">
              Add {formatAudAmountString(constraints.minimumPrincipalUnits)} to {formatAudAmountString(constraints.maximumPrincipalUnits)} in {formatAudAmountString(constraints.incrementUnits)} increments.
            </p>
            {amountInvalid ? <p id="account-funding-amount-error" className="text-sm text-destructive" role="alert">Enter an amount within the displayed limits and increments.</p> : null}
            {preview === undefined ? null : (
              <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
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
              </div>
            )}
          </div>
        ) : null}
      <div className="flex flex-wrap gap-2">
        {session === undefined && recovery === undefined ? (
          <Button
            disabled={pending || checking || port === undefined || constraints?.kind !== 'available' || preview === undefined}
            onClick={() => void beginTopUp()}
            className="min-h-touch"
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending
              ? 'Preparing secure payment…'
              : preview === undefined
                ? constraintsLoading ? 'Loading funding limits…' : constraints?.kind === 'available' ? 'Enter an amount' : 'Funding unavailable'
                : `Pay ${formatAudUnits(preview.totalUnits)} and add ${formatAudUnits(preview.principalUnits)}`}
          </Button>
        ) : paymentStatus === 'succeeded' || paymentStatus === 'failed' ? (
          <Button type="button" variant="secondary" disabled={checking || pending} onClick={startAnotherPayment} className="min-h-touch">
            Add more credit
          </Button>
        ) : recovery !== undefined && (paymentStatus === 'pending' || paymentStatus === 'outcome_unknown') ? (
          <Button type="button" variant="ghost" disabled={checking || pending} onClick={() => void refreshPayment()} className="min-h-touch">
            {checking ? <Spinner data-icon="inline-start" /> : null}
            {checking ? 'Checking payment…' : 'Refresh payment status'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function topUpErrorCopy(result: MoneyRefusal | AccountFundingOutcomeUnknownResult): string {
  if (result.code === 'stripe_setup_required') return 'Account funding is unavailable right now. No payment started and your balance did not change. Try again later.'
  if (result.code === 'billing_identity_missing' || result.code === 'billing_identity_mismatch') return 'Your authenticated Account is unavailable. No payment started.'
  if (result.code === 'funding_amount_invalid') return 'That AUD principal is outside the configured limits. No payment started.'
  if (result.code === 'price_changed') return 'Funding limits changed before payment started. Review the updated quote and try again.'
  if (result.code === 'commercial_policy_required') return 'Production funding is not enabled because the required commercial approvals are not current. No payment started.'
  if (result.code === 'funding_pending' || result.code === 'funding_outcome_unknown') return 'Payment is still being verified. Your Account balance will not change until the canonical server readback completes.'
  return 'Account funding could not be started. No payment was confirmed; try again.'
}

function formatAudUnits(units: bigint): string {
  return formatDisplayAmount({ currency: 'AUD', units: units.toString(), exponent: AUD_EXPONENT })
}

function formatAudAmountString(units: string): string {
  return formatDisplayAmount({ currency: 'AUD', units, exponent: AUD_EXPONENT })
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function persistRecovery(locator: RecoveryLocator): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(recoveryStorageKey, JSON.stringify(locator))
  } catch (cause) {
    // Browser storage is optional; the in-memory locator still protects this render.
    captureRouteException(cause, { site: 'persistRecovery' }, 'warning')
  }
}

function readStoredRecovery(): RecoveryLocator | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.sessionStorage.getItem(recoveryStorageKey)
    if (raw === null) return undefined
    const parsed: unknown = JSON.parse(raw)
    if (!isRecoveryLocator(parsed)) return undefined
    return parsed
  } catch (cause) {
    return degrade(cause, undefined, { site: 'readStoredRecovery', reason: 'invalid_response' })
  }
}

function readReturnedExternalRef(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const params = new URLSearchParams(window.location.search)
  const value = params.get('funding') ?? params.get('checkout_session_id') ?? params.get('session_id')
  return value === null || value.trim().length === 0 ? undefined : value
}

function isRecoveryLocator(value: unknown): value is RecoveryLocator {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  const hasIdempotencyKey = typeof candidate.idempotencyKey === 'string' && candidate.idempotencyKey.length > 0
  const hasExternalRef = typeof candidate.externalRef === 'string' && candidate.externalRef.length > 0
  const hasCommandRef = typeof candidate.commandRef === 'string' && candidate.commandRef.length > 0
  return (hasExternalRef && !hasCommandRef)
    || (hasCommandRef && !hasExternalRef && hasIdempotencyKey)
}

function defaultCheckoutRedirect(url: string): void {
  window.location.assign(url)
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  CheckoutElementsProvider,
  PaymentElement,
  useCheckoutElements,
} from '@stripe/react-stripe-js/checkout'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import {
  AUD_EXPONENT,
  audFundingPolicyFromCommercialControls,
  canonicalAudUnits,
  formatExactAmount,
  isMoneyRefusal,
  quoteAudAccountFunding,
  SANDBOX_COMMERCIAL_POLICY_CONTROLS,
  type CreditPaymentSession,
  type MoneyRefusal,
} from '@/modules/money/public'
import type {
  AccountFundingBeginInput,
  AccountFundingOutcomeUnknownResult,
  AccountFundingReadInput,
  AccountFundingStartResult,
} from '@/modules/money/server'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

export type AccountFundingPort = Readonly<{
  begin: (input: AccountFundingBeginInput) => Promise<AccountFundingStartResult>
  read: (input: AccountFundingReadInput) => Promise<CreditPaymentSession | MoneyRefusal>
}>

export type AeAccountFundingPanelProps = Readonly<{
  port?: AccountFundingPort
  publishableKey?: string
  onRefresh?: () => void | Promise<void>
}>

type RecoveryLocator =
  | Readonly<{ externalRef: string; idempotencyKey: string }>
  | Readonly<{ commandRef: string; idempotencyKey: string }>

type CreditPaymentStatus = CreditPaymentSession['evidence']['status']

const recoveryStorageKey = 'ae.account-funding.recovery.v1'

export function AeAccountFundingPanel({ port, publishableKey, onRefresh }: AeAccountFundingPanelProps) {
  const [pending, setPending] = useState(false)
  const [checking, setChecking] = useState(false)
  const [amountText, setAmountText] = useState('')
  const [session, setSession] = useState<CreditPaymentSession>()
  const [paymentStatus, setPaymentStatus] = useState<CreditPaymentStatus>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [recovery, setRecovery] = useState<RecoveryLocator>()
  const idempotencyKey = useRef<string | undefined>(undefined)
  const recoveryAttempted = useRef(false)
  const preview = useMemo(() => {
    const units = canonicalAudUnits(amountText)
    return units === undefined
      ? undefined
      : quoteAudAccountFunding(
          units,
          audFundingPolicyFromCommercialControls(SANDBOX_COMMERCIAL_POLICY_CONTROLS),
        )
  }, [amountText])

  const stripePromise = useMemo(() => {
    const key = (publishableKey ?? import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)?.trim()
    return key === undefined || key.length === 0 ? null : loadStripe(key)
  }, [publishableKey])

  const readCanonicalPayment = useCallback(async (locator: RecoveryLocator) => {
    if (port === undefined) return
    setChecking(true)
    setErrorMessage(undefined)
    try {
      const result = await port.read(locator)
      if (isMoneyRefusal(result)) {
        setPaymentStatus(result.code === 'funding_pending' ? 'pending' : result.code === 'funding_outcome_unknown' ? 'outcome_unknown' : undefined)
        setErrorMessage(topUpErrorCopy(result))
        return
      }
      setSession(result)
      setPaymentStatus(result.evidence.status)
      if (result.evidence.status === 'failed') setErrorMessage('The provider did not complete this payment. No Account funds were added.')
      if (result.evidence.status === 'outcome_unknown') setErrorMessage('Payment status is still being verified. No Account funds were added by this browser return.')
      setRecovery(locator)
      persistRecovery(locator)
      try {
        await onRefresh?.()
      } catch {
        setErrorMessage('Payment was read back, but the canonical Account balance is temporarily unavailable.')
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setPaymentStatus('outcome_unknown')
      setErrorMessage('Payment status is still being checked. Your Account balance has not been updated by this browser return.')
    } finally {
      setChecking(false)
    }
  }, [onRefresh, port])

  useEffect(() => {
    if (port === undefined || recoveryAttempted.current) return
    const stored = readStoredRecovery()
    const returnedExternalRef = readReturnedExternalRef()
    const locator = returnedExternalRef === undefined
      ? stored
      : stored === undefined
        ? undefined
        : { externalRef: returnedExternalRef, idempotencyKey: stored.idempotencyKey }
    if (locator === undefined) return
    recoveryAttempted.current = true
    idempotencyKey.current = locator.idempotencyKey
    setRecovery(locator)
    void readCanonicalPayment(locator)
  }, [port, readCanonicalPayment])

  async function beginTopUp() {
    if (pending || port === undefined) return
    const units = canonicalAudUnits(amountText)
    if (units === undefined) {
      setErrorMessage('Enter a valid AUD funding amount before starting payment.')
      return
    }
    if (stripePromise === null) {
      setErrorMessage(topUpErrorCopy({ kind: 'refused', code: 'stripe_setup_required', retryable: false }))
      return
    }

    const nextIdempotencyKey = idempotencyKey.current ?? `account-funding:${randomId()}`
    idempotencyKey.current = nextIdempotencyKey
    setPending(true)
    setErrorMessage(undefined)
    try {
      const result = await port.begin({
        amount: { currency: 'AUD', units: units.toString(), exponent: AUD_EXPONENT },
        idempotencyKey: nextIdempotencyKey,
      })
      if (result.kind === 'outcome_unknown') {
        const locator = { commandRef: result.commandRef, idempotencyKey: nextIdempotencyKey }
        setPaymentStatus('outcome_unknown')
        setRecovery(locator)
        persistRecovery(locator)
        setErrorMessage(topUpErrorCopy(result))
        return
      }
      if (result.kind === 'refused') {
        setErrorMessage(topUpErrorCopy(result))
        return
      }
      const locator = { externalRef: result.session.evidence.externalRef, idempotencyKey: nextIdempotencyKey }
      setSession(result.session)
      setRecovery(locator)
      persistRecovery(locator)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      setErrorMessage('Account funding could not be started. No payment was confirmed; try again.')
    } finally {
      setPending(false)
    }
  }

  async function refreshPayment() {
    if (recovery === undefined || pending || checking) return
    await readCanonicalPayment(recovery)
  }

  const showPaymentForm = session !== undefined && paymentStatus === undefined && stripePromise !== null
  const showSetupRefusal = stripePromise === null && session === undefined

  return (
    <div className="grid gap-3">
        {port === undefined ? (
          <Alert>
            <AlertTitle>Account funding is unavailable</AlertTitle>
            <AlertDescription>Your authenticated Account could not be loaded. No payment was started.</AlertDescription>
          </Alert>
        ) : null}
        {showSetupRefusal ? (
          <Alert>
            <AlertTitle>Account funding is unavailable right now</AlertTitle>
            <AlertDescription>No payment started and your balance did not change. Try again later.</AlertDescription>
          </Alert>
        ) : null}
        {errorMessage !== undefined ? (
          <Alert variant={paymentStatus === 'failed' ? 'destructive' : 'default'}>
            <AlertTitle>{paymentStatus === 'failed' ? 'Payment did not complete' : 'Payment status'}</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        {checking ? <p className="text-sm text-muted-foreground" role="status">Checking the canonical payment readback…</p> : null}
        {paymentStatus === 'pending' ? <p className="text-sm text-muted-foreground" role="status">Payment is pending canonical server readback; the browser has not changed your Account balance.</p> : null}
        {paymentStatus === 'outcome_unknown' ? (
          <Alert>
            <AlertTitle>Payment is still being verified</AlertTitle>
            <AlertDescription>Do not retry with a new payment. The authenticated server is reconciling this payment before any Account balance change.</AlertDescription>
          </Alert>
        ) : null}
        {paymentStatus === 'succeeded' ? (
          <Alert>
            <AlertTitle>Payment verified</AlertTitle>
            <AlertDescription>Your Account balance changes only after the canonical journal readback. The browser return did not grant funds.</AlertDescription>
          </Alert>
        ) : null}
        {showPaymentForm ? (
          <CheckoutElementsProvider stripe={stripePromise} options={{ clientSecret: session.clientSecret }}>
            <CheckoutPaymentForm confirming={pending} onConfirmed={refreshPayment} />
          </CheckoutElementsProvider>
        ) : null}
        {session === undefined && recovery === undefined && port !== undefined ? (
          <div className="grid gap-2">
            <Label htmlFor="account-funding-amount">Account funding amount (AUD)</Label>
            <Input
              id="account-funding-amount"
              inputMode="decimal"
              autoComplete="off"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              disabled={pending || checking}
              placeholder="10.00"
              aria-describedby="account-funding-amount-help"
            />
            <p id="account-funding-amount-help" className="text-xs text-muted-foreground">The configured minimum and maximum are enforced by the authenticated server.</p>
            {preview === undefined ? null : (
              <div className="grid gap-2 rounded-lg border border-border/70 bg-muted/30 p-3 text-sm">
                <p className="m-0 text-muted-foreground">
                  Your signed-in Account receives the requested AUD principal after Stripe confirms the full payment.
                </p>
              <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1" aria-label="Funding quote">
                <dt className="text-muted-foreground">Account principal</dt>
                <dd className="font-mono">AUD {formatAudUnits(preview.principalUnits)}</dd>
                <dt className="text-muted-foreground">Service fee</dt>
                <dd className="font-mono">AUD {formatAudUnits(preview.serviceFeeUnits)}</dd>
                <dt className="text-muted-foreground">Tax on service fee</dt>
                <dd className="font-mono">AUD {formatAudUnits(preview.taxUnits)}</dd>
                <dt className="font-medium">Total payment</dt>
                <dd className="font-mono font-medium">AUD {formatAudUnits(preview.totalUnits)}</dd>
              </dl>
              </div>
            )}
          </div>
        ) : null}
      <div className="flex flex-wrap gap-2">
        {session === undefined && recovery === undefined ? (
          <Button
            variant="secondary"
            disabled={pending || checking || port === undefined}
            onClick={() => void beginTopUp()}
            className="min-h-touch"
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {pending ? 'Preparing secure payment…' : 'Fund Account for paid Calls'}
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

function CheckoutPaymentForm({ confirming, onConfirmed }: Readonly<{ confirming: boolean; onConfirmed: () => Promise<void> }>) {
  const checkoutState = useCheckoutElements()
  const [confirmingLocal, setConfirmingLocal] = useState(false)

  if (checkoutState.type === 'loading') {
    return <p className="text-sm text-muted-foreground" role="status">Loading secure payment form…</p>
  }
  if (checkoutState.type === 'error') {
    return <p className="text-sm text-muted-foreground">The secure payment form could not load. No payment was confirmed.</p>
  }
  const checkout = checkoutState.checkout

  async function confirmPayment() {
    if (confirming || confirmingLocal) return
    setConfirmingLocal(true)
    try {
      const result = await checkout.confirm()
      if (result.type === 'error') {
        await onConfirmed()
        return
      }
      await onConfirmed()
    } catch {
      await onConfirmed()
    } finally {
      setConfirmingLocal(false)
    }
  }

  return (
    <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void confirmPayment() }}>
      <PaymentElement />
      <Button type="submit" disabled={confirming || confirmingLocal} className="min-h-touch">
        {confirming || confirmingLocal ? <Spinner data-icon="inline-start" /> : null}
        {confirming || confirmingLocal ? 'Confirming payment…' : 'Pay securely'}
      </Button>
    </form>
  )
}

function topUpErrorCopy(result: MoneyRefusal | AccountFundingOutcomeUnknownResult): string {
  if (result.code === 'stripe_setup_required') return 'Account funding is unavailable right now. No payment started and your balance did not change. Try again later.'
  if (result.code === 'billing_identity_missing' || result.code === 'billing_identity_mismatch') return 'Your authenticated Account is unavailable. No payment started.'
  if (result.code === 'funding_amount_invalid') return 'That AUD principal is outside the configured limits. No payment started.'
  if (result.code === 'commercial_policy_required') return 'Production funding is not enabled because the required commercial approvals are not current. No payment started.'
  if (result.code === 'funding_pending' || result.code === 'funding_outcome_unknown') return 'Payment is still being verified. Your Account balance will not change until the canonical server readback completes.'
  return 'Account funding could not be started. No payment was confirmed; try again.'
}

function formatAudUnits(units: bigint): string {
  return formatExactAmount({ currency: 'AUD', units: units.toString(), exponent: AUD_EXPONENT }) ?? '—'
}

function randomId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function persistRecovery(locator: RecoveryLocator): void {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(recoveryStorageKey, JSON.stringify(locator))
  } catch {
    // Browser storage is optional; the in-memory locator still protects this render.
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
  } catch {
    return undefined
  }
}

function readReturnedExternalRef(): string | undefined {
  if (typeof window === 'undefined') return undefined
  const params = new URLSearchParams(window.location.search)
  const value = params.get('checkout_session_id') ?? params.get('session_id')
  return value === null || value.trim().length === 0 ? undefined : value
}

function isRecoveryLocator(value: unknown): value is RecoveryLocator {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  const hasIdempotencyKey = typeof candidate.idempotencyKey === 'string' && candidate.idempotencyKey.length > 0
  const hasExternalRef = typeof candidate.externalRef === 'string' && candidate.externalRef.length > 0
  const hasCommandRef = typeof candidate.commandRef === 'string' && candidate.commandRef.length > 0
  return hasIdempotencyKey && (hasExternalRef !== hasCommandRef)
}

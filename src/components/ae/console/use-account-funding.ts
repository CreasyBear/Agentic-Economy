import { useAuth } from '@clerk/tanstack-react-start'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

import {
  AUD_EXPONENT,
  canonicalAudUnits,
  isMoneyRefusal,
  quoteAudAccountFunding,
  type CreditPaymentSession,
} from '@/modules/money/public'
import type { AccountFundingPort } from '@/modules/money/account-funding.contracts'
import type {
  AccountFundingConstraints,
} from '@/modules/money/server'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { captureRouteException } from '@/lib/observability/capture-route-exception'
import { degrade } from '@/lib/observability/degrade'
import {
  canStartAnotherPayment,
  fundingAmountErrorCopy,
  fundingReadCopy,
  fundingSuggestionUnits,
  isCheckoutResumable,
  paymentReadErrorCopy,
  topUpErrorCopy,
  type CreditPaymentStatus,
  type RecoveryLocator,
} from './credit-top-up-format'
import {
  clearStoredRecovery,
  defaultCheckoutRedirect,
  persistFundingAttempt,
  persistFundingDraft,
  persistRecovery,
  randomId,
  readReturnedExternalRef,
  readStoredFundingAttempt,
  readStoredFundingDraft,
  readStoredRecovery,
} from './credit-top-up-storage'

export type FundingUiState = Readonly<{
  operation: 'idle' | 'starting' | 'checking'
  amountText: string
  amountInvalid: boolean
  amountErrorMessage: string | undefined
  quoteRefreshRequiredForDigest: string | undefined
  session: CreditPaymentSession | undefined
  paymentStatus: CreditPaymentStatus | undefined
  errorMessage: string | undefined
  recovery: RecoveryLocator | undefined
}>

export type FundingUiAction =
  | Readonly<{ type: 'amount_changed'; amountText: string; valid: boolean }>
  | Readonly<{ type: 'amount_rejected'; errorMessage: string }>
  | Readonly<{ type: 'quote_refresh_required'; policyDigest: string }>
  | Readonly<{ type: 'quote_refresh_ready' }>
  | Readonly<{ type: 'operation_started'; operation: 'starting' | 'checking' }>
  | Readonly<{ type: 'operation_finished' }>
  | Readonly<{ type: 'recovery_found'; recovery: RecoveryLocator }>
  | Readonly<{ type: 'payment_read'; session: CreditPaymentSession; recovery: RecoveryLocator }>
  | Readonly<{ type: 'payment_refused'; paymentStatus: CreditPaymentStatus | undefined; errorMessage: string | undefined }>
  | Readonly<{ type: 'payment_outcome_unknown'; recovery?: RecoveryLocator }>
  | Readonly<{ type: 'payment_started'; session: CreditPaymentSession; recovery: RecoveryLocator }>
  | Readonly<{ type: 'error_changed'; errorMessage: string }>
  | Readonly<{ type: 'reset' }>

export const initialFundingUiState: FundingUiState = Object.freeze({
  operation: 'idle',
  amountText: '',
  amountInvalid: false,
  amountErrorMessage: undefined,
  quoteRefreshRequiredForDigest: undefined,
  session: undefined,
  paymentStatus: undefined,
  errorMessage: undefined,
  recovery: undefined,
})

export function fundingUiReducer(state: FundingUiState, action: FundingUiAction): FundingUiState {
  switch (action.type) {
    case 'amount_changed':
      return {
        ...state,
        amountText: action.amountText,
        amountInvalid: action.valid ? false : state.amountInvalid,
        amountErrorMessage: action.valid ? undefined : state.amountErrorMessage,
      }
    case 'amount_rejected':
      return { ...state, amountInvalid: true, amountErrorMessage: action.errorMessage }
    case 'quote_refresh_required':
      return { ...state, quoteRefreshRequiredForDigest: action.policyDigest }
    case 'quote_refresh_ready':
      return { ...state, quoteRefreshRequiredForDigest: undefined, errorMessage: undefined }
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
        errorMessage: fundingReadCopy(action.session),
      }
    }
    case 'payment_refused':
      return { ...state, session: undefined, paymentStatus: action.paymentStatus, errorMessage: action.errorMessage }
    case 'payment_outcome_unknown':
      return {
        ...state,
        session: undefined,
        paymentStatus: 'outcome_unknown',
        errorMessage: undefined,
        ...(action.recovery === undefined ? {} : { recovery: action.recovery }),
      }
    case 'payment_started':
      return {
        ...state,
        session: action.session,
        paymentStatus: action.session.evidence.status,
        recovery: action.recovery,
      }
    case 'error_changed':
      return { ...state, errorMessage: action.errorMessage }
    case 'reset':
      return initialFundingUiState
  }
}

export function useAccountFunding({
  port,
  constraints,
  onRefresh,
  redirectToCheckout = defaultCheckoutRedirect,
}: {
  port?: AccountFundingPort | undefined
  constraints?: AccountFundingConstraints | undefined
  onRefresh?: (() => void | Promise<void>) | undefined
  redirectToCheckout?: ((url: string) => void) | undefined
}) {
  const { userId } = useAuth()
  const [state, dispatch] = useReducer(fundingUiReducer, initialFundingUiState)
  const {
    amountText,
    paymentStatus,
    quoteRefreshRequiredForDigest,
    recovery,
    session,
  } = state
  const pending = state.operation === 'starting'
  const checking = state.operation === 'checking'
  const idempotencyKey = useRef<string | undefined>(undefined)
  const previousUserId = useRef<string | null | undefined>(undefined)
  const recoveryAttempted = useRef(false)
  useEffect(() => {
    if (previousUserId.current === userId) return
    previousUserId.current = userId
    idempotencyKey.current = undefined
    recoveryAttempted.current = false
    dispatch({ type: 'reset' })
    if (userId === null || userId === undefined) return
    idempotencyKey.current = readStoredFundingAttempt(userId)
    const draft = readStoredFundingDraft(userId)
    if (draft !== undefined) dispatch({ type: 'amount_changed', amountText: draft, valid: false })
  }, [userId])
  const quoteRefreshInFlight = useRef(false)
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
  const suggestedPrincipalUnits = useMemo(
    () => policy === undefined ? [] : fundingSuggestionUnits(policy),
    [policy],
  )
  const selectedPrincipalUnits = canonicalAudUnits(amountText)
  const quoteRefreshRequired = quoteRefreshRequiredForDigest !== undefined
    && (constraints?.kind !== 'available'
      || constraints.policyDigest === quoteRefreshRequiredForDigest)

  useEffect(() => {
    if (quoteRefreshRequiredForDigest === undefined
      || constraints?.kind !== 'available'
      || constraints.policyDigest === quoteRefreshRequiredForDigest) return
    dispatch({ type: 'quote_refresh_ready' })
  }, [constraints, quoteRefreshRequiredForDigest])

  async function refreshFundingQuote() {
    if (onRefresh === undefined || quoteRefreshInFlight.current) return
    quoteRefreshInFlight.current = true
    try {
      await onRefresh()
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      dispatch({ type: 'error_changed', errorMessage: 'Funding limits changed before payment started. The quote could not be refreshed; try refreshing it again before paying.' })
    } finally {
      quoteRefreshInFlight.current = false
    }
  }

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
            : paymentReadErrorCopy(result),
        })
        return
      }
      dispatch({ type: 'payment_read', session: result, recovery: locator })
      if (userId !== null && userId !== undefined) persistRecovery(userId, locator)
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
  }, [onRefresh, port, userId])

  useEffect(() => {
    if (port === undefined || recoveryAttempted.current || userId === null || userId === undefined) return
    const stored = readStoredRecovery(userId)
    const returnedExternalRef = readReturnedExternalRef()
    const locator = returnedExternalRef === undefined
      ? stored
      : { externalRef: returnedExternalRef }
    if (locator === undefined) return
    recoveryAttempted.current = true
    if (locator.idempotencyKey !== undefined) idempotencyKey.current = locator.idempotencyKey
    dispatch({ type: 'recovery_found', recovery: locator })
    void readCanonicalPayment(locator)
  }, [port, readCanonicalPayment, userId])

  async function beginTopUp() {
    if (pending || quoteRefreshRequired || port === undefined) return
    const units = canonicalAudUnits(amountText)
    if (units === undefined || policy === undefined || constraints?.kind !== 'available' || quoteAudAccountFunding(units, policy) === undefined) {
      dispatch({ type: 'amount_rejected', errorMessage: fundingAmountErrorCopy(amountText, policy, constraints) })
      return
    }
    const nextIdempotencyKey = idempotencyKey.current ?? `account-funding:${randomId()}`
    if (userId !== null && userId !== undefined) persistFundingAttempt(userId, nextIdempotencyKey)
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
        if (userId !== null && userId !== undefined) persistRecovery(userId, locator)
        return
      }
      if (result.kind === 'refused') {
        dispatch({ type: 'error_changed', errorMessage: topUpErrorCopy(result) })
        if (result.code === 'price_changed') {
          dispatch({ type: 'quote_refresh_required', policyDigest: constraints.policyDigest })
          dispatch({
            type: 'error_changed',
            errorMessage: onRefresh === undefined
              ? 'Funding limits changed before payment started. A current quote is unavailable; refresh this page before trying again.'
              : 'Funding limits changed before payment started. Refresh the quote before trying again.',
          })
          await refreshFundingQuote()
        }
        return
      }
      const locator = { externalRef: result.session.evidence.externalRef, idempotencyKey: nextIdempotencyKey }
      dispatch({ type: 'payment_started', session: result.session, recovery: locator })
      if (userId !== null && userId !== undefined) persistRecovery(userId, locator)
      if (result.session.kind === 'hosted_redirect' && result.session.checkoutUrl !== undefined) {
        try {
          redirectToCheckout(result.session.checkoutUrl)
        } catch (cause) {
          captureClientExceptionOnClient(cause)
          dispatch({
            type: 'error_changed',
            errorMessage: 'Secure checkout could not be opened. This payment attempt is preserved; continue the same payment below.',
          })
        }
      }
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      dispatch({ type: 'error_changed', errorMessage: 'Account funding could not be started. No payment was confirmed; try again.' })
    } finally {
      dispatch({ type: 'operation_finished' })
    }
  }

  function startAnotherPayment() {
    if (pending || checking || !canStartAnotherPayment(paymentStatus, session)) return
    idempotencyKey.current = undefined
    dispatch({ type: 'reset' })
    if (userId !== null && userId !== undefined) {
      persistFundingAttempt(userId)
      persistFundingDraft(userId, '')
      clearStoredRecovery(userId)
    }
    try {
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

  function resumeCheckout() {
    if (!isCheckoutResumable(session) || pending || checking) return
    try {
      redirectToCheckout(session.checkoutUrl)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      dispatch({
        type: 'error_changed',
        errorMessage: 'Secure checkout could not be opened. This payment attempt is preserved; try continuing it again.',
      })
    }
  }

  const checkoutResumable = isCheckoutResumable(session)

  function handleAmountChange(nextValue: string) {
    const units = canonicalAudUnits(nextValue)
    if (userId !== null && userId !== undefined) persistFundingDraft(userId, nextValue)
    dispatch({
      type: 'amount_changed',
      amountText: nextValue,
      valid: units !== undefined
        && policy !== undefined
        && constraints?.kind === 'available'
        && quoteAudAccountFunding(units, policy) !== undefined,
    })
  }

  function handleAmountBlur() {
    if (amountText.trim().length === 0) return
    const units = canonicalAudUnits(amountText)
    const valid = units !== undefined
      && policy !== undefined
      && constraints?.kind === 'available'
      && quoteAudAccountFunding(units, policy) !== undefined
    if (!valid) {
      dispatch({ type: 'amount_rejected', errorMessage: fundingAmountErrorCopy(amountText, policy, constraints) })
    }
  }

  return {
    state,
    dispatch,
    pending,
    checking,
    policy,
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
  }
}

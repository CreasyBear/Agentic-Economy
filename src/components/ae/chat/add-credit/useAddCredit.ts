import { saveFundingReturnScope } from '@/lib/call-recovery/funding-return-scope'
import { useChatBuyerReturnScope } from '../chat-session/buyer-return-context'
import { useAuth } from '@clerk/tanstack-react-start'
import { useServerFn } from '@tanstack/react-start'
import { useQuery } from 'convex/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { AUD_EXPONENT, quoteAudAccountFunding, type MoneyRefusal } from '@/modules/money/public'
import {
  beginAccountFundingServer,
  readAccountFundingBalanceServer,
  readAccountFundingServer,
  readAccountFundingConstraintsServer,
} from '@/modules/money/money.functions'
import type {
  AccountFundingBalance,
  AccountFundingConstraints,
  AccountFundingOutcomeUnknownResult,
} from '@/modules/money/server'
import { randomId, persistFundingAttempt, readStoredFundingAttempt, persistRecovery, readStoredRecovery, clearStoredRecovery } from '@/components/ae/console/credit-top-up-storage'
import { topUpErrorCopy } from '@/components/ae/console/credit-top-up-format'
import { api } from '../../../../../convex/_generated/api'
import type { AddCreditAmount, AddCreditPaymentStatus } from './add-credit.contracts'

type AvailableBalance = Extract<AccountFundingBalance, { kind: 'available' }>
type OwnedResult<T> = Readonly<{ userId: string; value: T }>

// Fallback only: the webhook-driven command state triggers checks; this covers return-path fulfillment when no webhook arrives.
const POLL_INTERVAL_MS = 30_000
const POLL_LIMIT_MS = 10 * 60 * 1_000
const AMOUNT_UNITS = 10n ** BigInt(AUD_EXPONENT)
function fundingProblemCopy(result: MoneyRefusal | AccountFundingOutcomeUnknownResult): string {
  if (result.code === 'price_changed') return 'Funding limits changed. Try again in a moment.'
  if (result.code === 'commercial_policy_required') return 'Adding credit is not available for this account right now.'
  return topUpErrorCopy(result)
}

/**
 * Requires: current authenticated owner and confirmed funding constraints before checkout.
 * Ensures: unavailable constraints never reserve a tab; balance survives a constraints outage.
 * Invariant: source results flow through owner-bound hook state to read-only panel props;
 * availability is derived, never separately stored. Only the exact command/key read proves
 * funding completion, followed by a fresh balance read for its original Account.
 * A saved unresolved key restores paused recovery and blocks a new amount, even before effects.
 * On violation: refuse locally; a submitted/unknown attempt keeps its original recovery key.
 */
export function useAddCredit(open: boolean, onFunded: () => void) {
  const returnScope = useChatBuyerReturnScope()
  const { userId, orgId } = useAuth()
  const beginAccountFunding = useServerFn(beginAccountFundingServer)
  const readAccountFundingBalance = useServerFn(readAccountFundingBalanceServer)
  const readAccountFunding = useServerFn(readAccountFundingServer)
  const readAccountFundingConstraints = useServerFn(readAccountFundingConstraintsServer)
  const [selected, setSelected] = useState<AddCreditAmount>(5)
  const [balanceState, setBalanceState] = useState<OwnedResult<AvailableBalance> | null>(null)
  const [constraintsState, setConstraintsState] = useState<(OwnedResult<AccountFundingConstraints> & Readonly<{ accountRef: string | null }>) | null>(null)
  const balance = balanceState !== null && balanceState.userId === userId ? balanceState.value : null
  const constraints = constraintsState !== null && constraintsState.userId === userId
    && balance !== null && constraintsState.accountRef === balance.accountRef ? constraintsState.value : null
  const currentUserIdRef = useRef(userId)
  const [busy, setBusy] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<AddCreditPaymentStatus>(() =>
    userId !== null && userId !== undefined && readStoredFundingAttempt(userId) !== undefined ? 'paused' : 'idle')
  const waitingForCredit = paymentStatus !== 'idle'
  const [problem, setProblem] = useState<string | null>(null)
  const pendingAttemptRef = useRef<Readonly<{ accountRef?: string; idempotencyKey: string; commandRef?: string }> | null>(null)
  const [watched, setWatched] = useState<Readonly<{ commandRef: string; idempotencyKey: string }> | null>(null)
  const convexConfigured = Boolean(import.meta.env.VITE_CONVEX_URL?.trim())
  // Constant per build, so hook order is stable; no provider exists without a Convex URL.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const funding = convexConfigured ? useQuery(api.moneyAccountFunding.read,
    paymentStatus === 'checking' && watched !== null ? watched : 'skip') : undefined
  const commandState = funding?.kind === 'accepted' ? funding.command.state : undefined
  const onFundedRef = useRef(onFunded)
  const idempotencyKeyRef = useRef<string | undefined>(undefined)
  const previousUserIdRef = useRef<string | null | undefined>(undefined)
  const beginInFlightRef = useRef(false)
  const pollDeadlineRef = useRef<number | null>(null)

  useLayoutEffect(() => {
    currentUserIdRef.current = userId
  }, [userId])

  useEffect(() => {
    onFundedRef.current = onFunded
  }, [onFunded])

  useLayoutEffect(() => {
    if (previousUserIdRef.current === userId) return
    previousUserIdRef.current = userId
    const savedKey = userId === null || userId === undefined ? undefined : readStoredFundingAttempt(userId)
    const recovery = userId === null || userId === undefined ? undefined : readStoredRecovery(userId)
    idempotencyKeyRef.current = savedKey
    pendingAttemptRef.current = savedKey === undefined ? null : {
      idempotencyKey: savedKey,
      ...(recovery !== undefined && 'commandRef' in recovery && recovery.idempotencyKey === savedKey
        ? { commandRef: recovery.commandRef } : {}),
    }
    const savedCommandRef = pendingAttemptRef.current?.commandRef
    setWatched(savedKey !== undefined && savedCommandRef !== undefined ? { commandRef: savedCommandRef, idempotencyKey: savedKey } : null)
    setConstraintsState(null)
    pollDeadlineRef.current = null
    setPaymentStatus(savedKey === undefined ? 'idle' : 'paused')
    setBusy(false)
    setProblem(null)
    setBalanceState(null)
  }, [userId])

  useEffect(() => {
    if (!open || userId === null || userId === undefined) {
      setConstraintsState(null)
      return
    }

    let active = true
    if (pendingAttemptRef.current === null) setBalanceState(null)
    setConstraintsState(null)
    setProblem(null)
    setBusy(true)

    async function loadInitialState() {
      if (userId === null || userId === undefined) return
      try {
        const [balanceResult, constraintsResult] = await Promise.allSettled([
          readAccountFundingBalance(),
          readAccountFundingConstraints(),
        ])
        if (!active || currentUserIdRef.current !== userId) return
        if (balanceResult.status === 'rejected') {
          captureClientExceptionOnClient(balanceResult.reason)
          setProblem('We could not load your available balance. Contact Support if this continues.')
        } else if (balanceResult.value.kind !== 'available') {
          setProblem(fundingProblemCopy(balanceResult.value))
        } else {
          setBalanceState({ userId, value: balanceResult.value })
        }
        if (constraintsResult.status === 'fulfilled') {
          setConstraintsState({ userId, value: constraintsResult.value,
            accountRef: balanceResult.status === 'fulfilled' && balanceResult.value.kind === 'available'
              ? balanceResult.value.accountRef : null })
        } else {
          captureClientExceptionOnClient(constraintsResult.reason)
          setProblem('We could not confirm card funding availability. Your available credit is shown separately.')
        }
        setBusy(false)
      } catch (cause) {
        captureClientExceptionOnClient(cause)
        if (active && currentUserIdRef.current === userId) {
          setProblem('We could not load your available balance and funding limits. Try again in a moment.')
          setBusy(false)
        }
      }
    }

    void loadInitialState()
    return () => {
      active = false
    }
  }, [open, orgId, readAccountFundingBalance, readAccountFundingConstraints, userId])

  useEffect(() => {
    if (!open || paymentStatus !== 'checking' || userId === null || userId === undefined) return
    if (pendingAttemptRef.current === null) return

    let active = true
    let pollInFlight = false
    const deadline = pollDeadlineRef.current ?? Date.now() + POLL_LIMIT_MS
    pollDeadlineRef.current = deadline

    async function pollBalance() {
      if (!active || userId === null || userId === undefined || pollInFlight || Date.now() >= deadline) return
      pollInFlight = true
      try {
        let attempt = pendingAttemptRef.current
        if (attempt === null) return
        const current = await readAccountFundingBalance()
        if (!active || currentUserIdRef.current !== userId || pendingAttemptRef.current !== attempt
          || Date.now() >= deadline || current.kind !== 'available') return
        if (attempt.accountRef !== undefined && current.accountRef !== attempt.accountRef) {
          setBalanceState(null)
          setConstraintsState(null)
          setProblem('This payment belongs to another account. Return to that account or contact Support before trying again.')
          setPaymentStatus('paused')
          return
        }
        setBalanceState({ userId, value: current })
        // A lost start response may leave only this candidate; the exact read authenticates its key.
        const commandRef = attempt.commandRef ?? current.pendingTopup?.commandRef
        if (commandRef === undefined) {
          setPaymentStatus('paused')
          setProblem('The original payment could not be identified. Check again or contact Support before starting another payment.')
          return
        }
        const payment = await readAccountFunding({ data: { commandRef, idempotencyKey: attempt.idempotencyKey } })
        if (!active || currentUserIdRef.current !== userId || pendingAttemptRef.current !== attempt
          || Date.now() >= deadline) return
        if (payment.kind === 'refused') {
          if (payment.retryable) return
          setPaymentStatus('paused')
          setProblem('The original payment could not be confirmed. Return to its account and check again, or contact Support.')
          return
        }
        // The command/key read authenticates this provisional reload Account before binding it.
        if (attempt.accountRef === undefined || attempt.commandRef === undefined) {
          attempt = { ...attempt, accountRef: current.accountRef, commandRef }
          pendingAttemptRef.current = attempt
          setWatched({ commandRef, idempotencyKey: attempt.idempotencyKey })
        }
        persistRecovery(userId, { commandRef, idempotencyKey: attempt.idempotencyKey })
        if (payment.evidence.status === 'failed') {
          clearInterval(pollTimer)
          clearTimeout(limitTimer)
          pollDeadlineRef.current = null
          pendingAttemptRef.current = null
          persistFundingAttempt(userId)
          clearStoredRecovery(userId)
          idempotencyKeyRef.current = undefined
          setBusy(false)
          setPaymentStatus('idle')
          setProblem('The card payment did not complete. No credit was added.')
          return
        }
        if (payment.evidence.status !== 'succeeded') return
        // The exact read can fulfill the ledger posting; refresh after it, never infer from a delta.
        const credited = await readAccountFundingBalance()
        if (!active || currentUserIdRef.current !== userId || pendingAttemptRef.current !== attempt
          || Date.now() >= deadline || credited.kind !== 'available') return
        if (credited.accountRef !== attempt.accountRef) {
          setBalanceState(null)
          setConstraintsState(null)
          setProblem('This payment belongs to another account. Return to that account or contact Support before trying again.')
          setPaymentStatus('paused')
          return
        }
        setBalanceState({ userId, value: credited })
        clearInterval(pollTimer)
        clearTimeout(limitTimer)
        pollDeadlineRef.current = null
        pendingAttemptRef.current = null
        setConstraintsState(null)
        setBusy(false)
        setPaymentStatus('idle')
        persistFundingAttempt(userId)
        clearStoredRecovery(userId)
        idempotencyKeyRef.current = undefined
        onFundedRef.current()
      } catch (cause) {
        captureClientExceptionOnClient(cause)
      } finally {
        pollInFlight = false
      }
    }

    void pollBalance()
    const pollTimer = setInterval(() => { void pollBalance() }, POLL_INTERVAL_MS)
    const limitTimer = setTimeout(() => {
      if (!active) return
      clearInterval(pollTimer)
      pollDeadlineRef.current = null
      setPaymentStatus('paused')
      setBusy(false)
      setProblem('Payment checks stopped after 10 minutes. Check the original payment again or contact Support before trying another payment.')
    }, Math.max(0, deadline - Date.now()))

    return () => {
      active = false
      clearInterval(pollTimer)
      clearTimeout(limitTimer)
    }
  }, [open, paymentStatus, commandState, readAccountFunding, readAccountFundingBalance, userId])

  const checkPayment = useCallback(() => {
    if (!open || paymentStatus !== 'paused' || pendingAttemptRef.current === null
      || userId === null || userId === undefined || currentUserIdRef.current !== userId) return
    pollDeadlineRef.current = null
    setProblem(null)
    setPaymentStatus('checking')
  }, [open, paymentStatus, userId])

  const begin = useCallback(async () => {
    if (!open || userId === null || userId === undefined || currentUserIdRef.current !== userId
      || readStoredFundingAttempt(userId) !== undefined || pendingAttemptRef.current !== null
      || balance === null || constraints?.kind !== 'available' || beginInFlightRef.current || busy || waitingForCredit) return
    setProblem(null)
    // Reserve a tab in the click handler before the asynchronous funding request.
    const checkoutWindow = window.open('about:blank', '_blank')
    if (checkoutWindow === null) {
      setProblem('Allow pop-ups for aecon, then try adding credit again.')
      return
    }
    checkoutWindow.opener = null
    beginInFlightRef.current = true
    setBusy(true)
    let fundingStartSubmitted = false
    try {
      const units = BigInt(selected) * AMOUNT_UNITS
      const policy = {
        minimumPrincipalUnits: BigInt(constraints.minimumPrincipalUnits),
        maximumPrincipalUnits: BigInt(constraints.maximumPrincipalUnits),
        incrementUnits: BigInt(constraints.incrementUnits),
        serviceFeeBps: constraints.serviceFeeBps,
        taxOnServiceFeeBps: constraints.taxOnServiceFeeBps,
        legalCustomerMaximumAccessibleUnits: BigInt(constraints.legalCustomerMaximumAccessibleUnits),
      }
      if (quoteAudAccountFunding(units, policy) === undefined) {
        checkoutWindow.close()
        setProblem('That amount is not available under the current funding limits. Choose another amount or try again later.')
        setBusy(false)
        return
      }

      const idempotencyKey = idempotencyKeyRef.current ?? `account-funding:${randomId()}`
      idempotencyKeyRef.current = idempotencyKey
      if (userId !== null && userId !== undefined) persistFundingAttempt(userId, idempotencyKey)
      pendingAttemptRef.current = { accountRef: balance.accountRef, idempotencyKey }
      fundingStartSubmitted = true
      const result = await beginAccountFunding({
        data: {
          amount: { currency: 'AUD', units: units.toString(), exponent: AUD_EXPONENT },
          expectedPolicyDigest: constraints.policyDigest,
          idempotencyKey,
        },
      })
      if (result.kind !== 'refused') persistRecovery(userId, { commandRef: result.commandRef, idempotencyKey })
      if (currentUserIdRef.current !== userId) {
        checkoutWindow.close()
        return
      }
      if (result.kind !== 'refused') setWatched({ commandRef: result.commandRef, idempotencyKey })
      if (result.kind !== 'refused') pendingAttemptRef.current = { accountRef: balance.accountRef, idempotencyKey, commandRef: result.commandRef }
      if (result.kind === 'outcome_unknown') {
        checkoutWindow.close()
        setProblem(fundingProblemCopy(result))
        setPaymentStatus('checking')
        setBusy(false)
        return
      }
      if (result.kind === 'refused') {
        if (result.code === 'funding_pending' || result.code === 'funding_outcome_unknown') {
          checkoutWindow.close()
          setProblem(fundingProblemCopy(result))
          setPaymentStatus('checking')
          setBusy(false)
          return
        }
        pendingAttemptRef.current = null
        checkoutWindow.close()
        if (userId !== null && userId !== undefined) {
          persistFundingAttempt(userId)
          clearStoredRecovery(userId)
        }
        idempotencyKeyRef.current = undefined
        setProblem(fundingProblemCopy(result))
        setBusy(false)
        return
      }
      if (result.session.kind !== 'hosted_redirect' || result.session.checkoutUrl === undefined) {
        checkoutWindow.close()
        setProblem('Secure checkout is unavailable. Keep this chat open while we check your payment and credit.')
        setPaymentStatus('checking')
        setBusy(false)
        return
      }
      saveFundingReturnScope(result.session.evidence.externalRef, returnScope)
      try { saveFundingReturnScope(result.session.evidence.externalRef, returnScope, checkoutWindow.sessionStorage) } catch { /* The original conversation remains available if popup storage is blocked. */ }
      checkoutWindow.location.replace(result.session.checkoutUrl)
      setPaymentStatus('checking')
      setBusy(false)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      checkoutWindow.close()
      if (currentUserIdRef.current !== userId) return
      setConstraintsState(null)
      setProblem(fundingStartSubmitted
        ? 'We could not confirm whether checkout started. Keep this chat open while we check the original payment and balance.'
        : 'We could not start checkout. Try again in a moment.')
      if (fundingStartSubmitted) setPaymentStatus('checking')
      setBusy(false)
    } finally {
      beginInFlightRef.current = false
    }
  }, [returnScope, balance, beginAccountFunding, busy, constraints, open, selected, userId, waitingForCredit])

  return { selected, setSelected, begin, busy, problem, balance, constraints, paymentStatus, checkPayment }
}

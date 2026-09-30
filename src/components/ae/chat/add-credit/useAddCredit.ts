import { useAuth } from '@clerk/tanstack-react-start'
import { useServerFn } from '@tanstack/react-start'
import { useCallback, useEffect, useRef, useState } from 'react'

import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'
import { AUD_EXPONENT, quoteAudAccountFunding, type MoneyRefusal } from '@/modules/money/public'
import {
  beginAccountFundingServer,
  readAccountFundingBalanceServer,
  readAccountFundingConstraintsServer,
} from '@/modules/money/money.functions'
import type {
  AccountFundingBalance,
  AccountFundingConstraints,
  AccountFundingOutcomeUnknownResult,
} from '@/modules/money/server'
import { randomId, persistFundingAttempt, readStoredFundingAttempt } from '@/components/ae/console/credit-top-up-storage'
import { topUpErrorCopy } from '@/components/ae/console/credit-top-up-format'
import type { AddCreditAmount } from './add-credit.contracts'

type AvailableBalance = Extract<AccountFundingBalance, { kind: 'available' }>

const POLL_INTERVAL_MS = 3_000
const POLL_LIMIT_MS = 10 * 60 * 1_000
const AMOUNT_UNITS = 10n ** BigInt(AUD_EXPONENT)
function fundingProblemCopy(result: MoneyRefusal | AccountFundingOutcomeUnknownResult): string {
  if (result.code === 'price_changed') return 'Funding limits changed. Try again in a moment.'
  if (result.code === 'commercial_policy_required') return 'Adding credit is not available for this account right now.'
  return topUpErrorCopy(result)
}

export function useAddCredit(open: boolean, onFunded: () => void) {
  const { userId } = useAuth()
  const beginAccountFunding = useServerFn(beginAccountFundingServer)
  const readAccountFundingBalance = useServerFn(readAccountFundingBalanceServer)
  const readAccountFundingConstraints = useServerFn(readAccountFundingConstraintsServer)
  const [selected, setSelected] = useState<AddCreditAmount>(5)
  const [balance, setBalance] = useState<Pick<AvailableBalance['balance'], 'units' | 'exponent'> | null>(null)
  const [busy, setBusy] = useState(false)
  const [waitingForCredit, setWaitingForCredit] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const baselineRef = useRef<bigint | null>(null)
  const constraintsRef = useRef<AccountFundingConstraints | null>(null)
  const onFundedRef = useRef(onFunded)
  const idempotencyKeyRef = useRef<string | undefined>(undefined)
  const previousUserIdRef = useRef<string | null | undefined>(undefined)
  const beginInFlightRef = useRef(false)
  const waitingForCreditRef = useRef(waitingForCredit)
  const pollDeadlineRef = useRef<number | null>(null)


  useEffect(() => {
    onFundedRef.current = onFunded
    waitingForCreditRef.current = waitingForCredit
  }, [onFunded, waitingForCredit])

  useEffect(() => {
    if (previousUserIdRef.current === userId) return
    previousUserIdRef.current = userId
    idempotencyKeyRef.current = userId === null || userId === undefined
      ? undefined
      : readStoredFundingAttempt(userId)
    baselineRef.current = null
    constraintsRef.current = null
    pollDeadlineRef.current = null
    waitingForCreditRef.current = false
    setWaitingForCredit(false)
    setBalance(null)
  }, [userId])

  useEffect(() => {
    if (!open) return

    let active = true
    if (!waitingForCreditRef.current) {
      baselineRef.current = null
      setBalance(null)
    }
    constraintsRef.current = null
    setProblem(null)
    setBusy(true)

    async function loadInitialState() {
      try {
        const [nextBalance, nextConstraints] = await Promise.all([
          readAccountFundingBalance(),
          readAccountFundingConstraints(),
        ])
        if (!active) return
        if (nextBalance.kind !== 'available') {
          setProblem(fundingProblemCopy(nextBalance))
        } else {
          if (!waitingForCreditRef.current) baselineRef.current = BigInt(nextBalance.balance.units)
          setBalance(nextBalance.balance)
        }
        constraintsRef.current = nextConstraints
        if (nextConstraints.kind !== 'available') setProblem(fundingProblemCopy(nextConstraints))
        setBusy(false)
      } catch (cause) {
        captureClientExceptionOnClient(cause)
        if (active) {
          setProblem('We could not load your available balance and funding limits. Try again in a moment.')
          setBusy(false)
        }
      }
    }

    void loadInitialState()
    return () => {
      active = false
    }
  }, [open, readAccountFundingBalance, readAccountFundingConstraints, userId])

  useEffect(() => {
    if (!open || !waitingForCredit) return
    const baseline = baselineRef.current
    if (baseline === null) return

    let active = true
    let pollInFlight = false
    const deadline = pollDeadlineRef.current ?? Date.now() + POLL_LIMIT_MS
    pollDeadlineRef.current = deadline

    async function pollBalance() {
      if (!active || pollInFlight || Date.now() >= deadline) return
      pollInFlight = true
      try {
        const current = await readAccountFundingBalance()
        if (!active || Date.now() >= deadline || current.kind !== 'available') return
        setBalance((previous) => previous?.units === current.balance.units
          && previous.exponent === current.balance.exponent ? previous : current.balance)
        if (baseline !== null && BigInt(current.balance.units) > baseline) {
          clearInterval(pollTimer)
          clearTimeout(limitTimer)
          pollDeadlineRef.current = null
          baselineRef.current = null
          constraintsRef.current = null
          setBusy(false)
          setWaitingForCredit(false)
          if (userId !== null && userId !== undefined) persistFundingAttempt(userId)
          idempotencyKeyRef.current = undefined
          onFundedRef.current()
        }
      } catch (cause) {
        captureClientExceptionOnClient(cause)
      } finally {
        pollInFlight = false
      }
    }

    const pollTimer = setInterval(() => { void pollBalance() }, POLL_INTERVAL_MS)
    const limitTimer = setTimeout(() => {
      if (!active) return
      clearInterval(pollTimer)
      pollDeadlineRef.current = null
      setWaitingForCredit(false)
      setBusy(false)
      setProblem('Balance checks stopped after 10 minutes. Check your available balance before trying again.')
    }, Math.max(0, deadline - Date.now()))

    return () => {
      active = false
      clearInterval(pollTimer)
      clearTimeout(limitTimer)
    }
  }, [open, readAccountFundingBalance, userId, waitingForCredit])

  const begin = useCallback(async () => {
    if (!open || beginInFlightRef.current || busy || waitingForCredit) return
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
      const [currentBalance, constraints] = await Promise.all([
        readAccountFundingBalance(),
        readAccountFundingConstraints(),
      ])
      if (currentBalance.kind !== 'available') {
        checkoutWindow.close()
        setProblem(fundingProblemCopy(currentBalance))
        setBusy(false)
        return
      }
      if (constraints.kind !== 'available') {
        checkoutWindow.close()
        setProblem(fundingProblemCopy(constraints))
        setBusy(false)
        return
      }
      baselineRef.current = BigInt(currentBalance.balance.units)
      constraintsRef.current = constraints
      setBalance(currentBalance.balance)

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
      fundingStartSubmitted = true
      const result = await beginAccountFunding({
        data: {
          amount: { currency: 'AUD', units: units.toString(), exponent: AUD_EXPONENT },
          expectedPolicyDigest: constraints.policyDigest,
          idempotencyKey,
        },
      })
      if (result.kind === 'outcome_unknown') {
        checkoutWindow.close()
        setProblem(fundingProblemCopy(result))
        setWaitingForCredit(true)
        setBusy(false)
        return
      }
      if (result.kind === 'refused') {
        checkoutWindow.close()
        if (userId !== null && userId !== undefined) persistFundingAttempt(userId)
        idempotencyKeyRef.current = undefined
        setProblem(fundingProblemCopy(result))
        setBusy(false)
        return
      }
      if (result.session.kind !== 'hosted_redirect' || result.session.checkoutUrl === undefined) {
        checkoutWindow.close()
        setProblem('Secure checkout is unavailable. Keep this chat open while we check for your credit.')
        setWaitingForCredit(true)
        setBusy(false)
        return
      }
      checkoutWindow.location.replace(result.session.checkoutUrl)
      setWaitingForCredit(true)
      setBusy(false)
    } catch (cause) {
      captureClientExceptionOnClient(cause)
      checkoutWindow.close()
      setProblem(fundingStartSubmitted
        ? 'We could not confirm whether checkout started. Keep this chat open while we check your balance.'
        : 'We could not confirm your balance and funding limits. Try again in a moment.')
      if (fundingStartSubmitted) setWaitingForCredit(true)
      setBusy(false)
    } finally {
      beginInFlightRef.current = false
    }
  }, [beginAccountFunding, busy, open, readAccountFundingBalance, readAccountFundingConstraints, selected, userId, waitingForCredit])

  return { selected, setSelected, begin, busy, problem, balance, waitingForCredit }
}

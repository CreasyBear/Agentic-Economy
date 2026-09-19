import { useEffect, useRef, useState, type RefObject } from 'react'
import { useReverification } from '@clerk/tanstack-react-start'
import { isReverificationCancelledError } from '@clerk/tanstack-react-start/errors'
import { useServerFn } from '@tanstack/react-start'

import { degrade } from '@/lib/observability/degrade'
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { toast } from '@/lib/ui/toast'
import type { OwnerEarningsAccount } from '@/modules/capability-supply/earnings.view-model'
import {
  beginOwnerPayoutTransferServer,
  createOwnerConnectAccountServer,
  createOwnerExpressLoginLinkServer,
  createOwnerOnboardingLinkServer,
  readOwnerPayoutTransferServer,
  type OwnerConnectReadinessReadback,
} from '@/modules/money/money.functions'

import type {
  EarningsAccountDisplayModel,
  EarningsAccountStatusProps,
  PayoutConfirmAction,
} from './earnings-card.contracts'
import { FINANCIAL_SAFE, WHAT_HAPPENED } from './earnings-card.contracts'
import {
  actionMessage,
  projectEarningsAccount,
  ssoFailureNextStep,
  type EarningsAccountHookBindings,
} from './earnings-projection'

export type UseAeSupplyEarningsCardInput = Readonly<{
  account: OwnerEarningsAccount
  businessId: string
  connect?: OwnerConnectReadinessReadback
  onStatusRefreshed?: () => void | Promise<void>
}>

export type UseAeSupplyEarningsCardResult = Readonly<{
  display: EarningsAccountDisplayModel
  bindings: EarningsAccountHookBindings
  busy?: string
  confirmAction?: PayoutConfirmAction
  payoutActionRef: RefObject<HTMLButtonElement | null>
  expressActionRef: RefObject<HTMLButtonElement | null>
  status: EarningsAccountStatusProps
  setConfirmAction: (action: PayoutConfirmAction | undefined) => void
  confirmPayoutAuthority: () => Promise<void>
  openExpressDashboard: () => Promise<void>
  refreshRecordedStatus: () => Promise<void>
  handleConfirmOpenChange: (open: boolean) => void
}>

export function useAeSupplyEarningsCard(
  input: UseAeSupplyEarningsCardInput,
): UseAeSupplyEarningsCardResult {
  const { account, businessId, connect, onStatusRefreshed } = input
  const { display, bindings } = projectEarningsAccount(account, connect, businessId)

  const [busy, setBusy] = useState<string | undefined>()
  const [message, setMessage] = useState<string | undefined>()
  const [diagnosticError, setDiagnosticError] = useState<Rule4Diagnostic>()
  const [confirmAction, setConfirmAction] = useState<PayoutConfirmAction>()
  const payoutActionRef = useRef<HTMLButtonElement | null>(null)
  const expressActionRef = useRef<HTMLButtonElement | null>(null)

  const createConnect = useReverification(useServerFn(createOwnerConnectAccountServer))
  const createOnboarding = useReverification(useServerFn(createOwnerOnboardingLinkServer))
  const createExpressLoginLink = useServerFn(createOwnerExpressLoginLinkServer)
  const beginPayout = useReverification(useServerFn(beginOwnerPayoutTransferServer))

  useEffect(() => {
    function refocusExpressAction() {
      if (document.visibilityState === 'visible') {
        expressActionRef.current?.focus()
      }
    }
    window.addEventListener('focus', refocusExpressAction)
    document.addEventListener('visibilitychange', refocusExpressAction)
    return () => {
      window.removeEventListener('focus', refocusExpressAction)
      document.removeEventListener('visibilitychange', refocusExpressAction)
    }
  }, [])

  function reportSsoFailure(nextStep: string) {
    setDiagnosticError({
      whatHappened: WHAT_HAPPENED,
      financialImpact: FINANCIAL_SAFE,
      nextStep,
    })
    toast.error(WHAT_HAPPENED, { description: nextStep })
  }

  async function createAccount() {
    setBusy('connect')
    setMessage(undefined)
    setDiagnosticError(undefined)
    try {
      const result = await createConnect({
        data: {
          businessId,
          currency: account.currency,
          idempotencyKey: `connect:${businessId}:${account.currency}`,
        },
      })
      if (result.kind !== 'ok') {
        setMessage(actionMessage(result.code))
        return
      }
      setMessage(result.onboardingUrl === undefined
        ? 'Connect account created. Reload current status before continuing hosted onboarding.'
        : 'Connect account created. Continue in Stripe; returning does not mark readiness.')
      if (result.onboardingUrl !== undefined) window.location.assign(result.onboardingUrl)
      else await onStatusRefreshed?.()
    } catch (cause) {
      setMessage(degrade(cause, 'Payout setup was interrupted. Reload before trying again.', { site: 'createAccount', reason: 'source_unavailable' }))
    } finally {
      setBusy(undefined)
    }
  }

  async function openOnboarding(accountId = bindings.stripeAccountId) {
    if (accountId === undefined || bindings.payoutAccountVersion === undefined) {
      setMessage('Current payout authority is unavailable. Reload before updating it.')
      return
    }
    setBusy('onboarding')
    setMessage(undefined)
    setDiagnosticError(undefined)
    try {
      const result = await createOnboarding({
        data: {
          businessId,
          currency: account.currency,
          stripeAccountId: accountId,
          expectedAccountVersion: bindings.payoutAccountVersion,
          idempotencyKey: `onboarding:${businessId}:${account.currency}:${bindings.payoutAccountVersion}`,
        },
      })
      if (result.kind !== 'ok') {
        setMessage(actionMessage(result.code))
        return
      }
      window.location.assign(result.url)
    } catch (cause) {
      setMessage(degrade(
        cause,
        'Hosted onboarding is temporarily unavailable. Your Connect account remains bound.',
        { site: 'openOnboarding', reason: 'source_unavailable' },
      ))
    } finally {
      setBusy(undefined)
    }
  }

  async function startPayout() {
    if (
      !bindings.canApprovePayout ||
      bindings.payoutRef === undefined ||
      bindings.payoutRevision === undefined ||
      bindings.accountVersion === undefined ||
      bindings.idempotencyKey === undefined
    ) return
    setBusy('transfer')
    setMessage(undefined)
    setDiagnosticError(undefined)
    try {
      const result = await beginPayout({
        data: {
          businessId,
          currency: account.currency,
          payoutRef: bindings.payoutRef,
          amount: bindings.providerNet,
          expectedPayoutRevision: bindings.payoutRevision,
          expectedAccountVersion: bindings.accountVersion,
          idempotencyKey: bindings.idempotencyKey,
        },
      })
      if (result.kind !== 'ok') {
        setMessage(actionMessage(result.code))
        return
      }
      setMessage(result.transfer.state === 'outcome_unknown'
        ? 'Transfer outcome is not yet known. Check recorded status; do not submit another payout.'
        : 'Payout recorded. Refreshing the authoritative transfer status.')
      await onStatusRefreshed?.()
      if (onStatusRefreshed === undefined) window.location.reload()
    } catch (error) {
      if (isReverificationCancelledError(error)) return
      setMessage('Payout approval was interrupted. Reload current status before taking another action.')
    } finally {
      setBusy(undefined)
    }
  }

  async function confirmPayoutAuthority() {
    const action = confirmAction
    if (action === undefined || busy !== undefined) return
    if (action === 'connect') await createAccount()
    else if (action === 'onboarding') await openOnboarding()
    else await startPayout()
    setConfirmAction(undefined)
  }

  async function openExpressDashboard() {
    setBusy('express_dashboard')
    setMessage(undefined)
    setDiagnosticError(undefined)
    try {
      const result = await createExpressLoginLink({
        data: {
          businessId,
          currency: account.currency,
        },
      })
      if (result.kind === 'ok') {
        const popup = window.open(result.url, '_blank', 'noopener,noreferrer')
        if (popup === null) {
          reportSsoFailure('Allow pop-ups for this site, then try again.')
          return
        }
        expressActionRef.current?.focus()
        return
      }
      reportSsoFailure(ssoFailureNextStep(result.code))
    } catch (cause) {
      degrade(cause, WHAT_HAPPENED, {
        site: 'openExpressDashboard',
        reason: 'source_unavailable',
      })
      reportSsoFailure(
        'Please refresh your session or try again in a few moments.',
      )
    } finally {
      setBusy(undefined)
    }
  }

  async function refreshRecordedStatus() {
    if (
      !bindings.canReadRecordedTransfer ||
      bindings.payoutRef === undefined ||
      bindings.idempotencyKey === undefined
    )
      return
    setBusy('refresh')
    setMessage(undefined)
    setDiagnosticError(undefined)
    try {
      const result = await readOwnerPayoutTransferServer({
        data: {
          businessId,
          currency: account.currency,
          payoutRef: bindings.payoutRef,
          idempotencyKey: bindings.idempotencyKey,
        },
      })
      if (result.kind === 'ok') {
        await onStatusRefreshed?.()
        if (onStatusRefreshed === undefined) {
          window.location.reload()
        }
        return
      }
      setMessage(actionMessage(result.code))
    } catch (cause) {
      setMessage(degrade(
        cause,
        'Recorded transfer status is temporarily unavailable. Reload and try again.',
        { site: 'refreshRecordedStatus', reason: 'source_unavailable' },
      ))
    } finally {
      setBusy(undefined)
    }
  }

  function handleConfirmOpenChange(open: boolean) {
    if (!open && busy === undefined) setConfirmAction(undefined)
  }

  return {
    display,
    bindings,
    ...(busy === undefined ? {} : { busy }),
    ...(confirmAction === undefined ? {} : { confirmAction }),
    payoutActionRef,
    expressActionRef,
    status: {
      ...(diagnosticError === undefined ? {} : { diagnosticError }),
      ...(message === undefined ? {} : { message }),
    },
    setConfirmAction,
    confirmPayoutAuthority,
    openExpressDashboard,
    refreshRecordedStatus,
    handleConfirmOpenChange,
  }
}

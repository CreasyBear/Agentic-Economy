import type { OwnerEarningsAccount } from '@/modules/capability-supply/earnings.view-model'
import type { OwnerConnectReadinessReadback } from '@/modules/money/money.functions'
import type { OwnerProviderEarningsReadback } from '@/modules/capability-supply/supply-funnel.functions'
import type { ExactAmount } from '@/modules/money/public'
import { compareExactAmounts, formatCurrencyAmount } from '@/modules/money/public'

import type {
  EarningsAccountDisplayModel,
  EarningsListProjection,
} from './earnings-card.contracts'

export type EarningsAccountHookBindings = Readonly<{
  canApprovePayout: boolean
  canReadRecordedTransfer: boolean
  payoutRef?: string
  payoutRevision?: number
  accountVersion?: number
  idempotencyKey?: string
  stripeAccountId?: string
  payoutAccountVersion?: number
  providerNet: ExactAmount
}>

export function projectEarningsList(
  readback: OwnerProviderEarningsReadback,
): EarningsListProjection {
  if (readback.kind === 'error') {
    return { kind: 'error', code: readback.code }
  }
  if (readback.kind === 'not_found') {
    return { kind: 'not_found' }
  }
  if (readback.accounts.length === 0) {
    return { kind: 'empty_accounts' }
  }
  return {
    kind: 'accounts',
    businessId: readback.businessId,
    accountCurrencies: readback.accounts.map((account) => account.currency),
    accountsTruncated: readback.accountsTruncated,
  }
}

export function projectEarningsAccount(
  account: OwnerEarningsAccount,
  connect: OwnerConnectReadinessReadback | undefined,
  businessId: string,
): { display: EarningsAccountDisplayModel; bindings: EarningsAccountHookBindings } {
  const canonical =
    connect?.kind === 'available'
      ? connect.accounts.find((item) => item.currency === account.currency)
      : undefined
  const payoutAccount = canonical?.account
  const payoutAccountVersion =
    payoutAccount?.version ?? account.payout.accountVersion
  const boundStripeAccountId =
    payoutAccount?.stripeAccountId ??
    optionalString(account.payout, 'stripeAccountId')
  const stripeAccountId =
    boundStripeAccountId === undefined || boundStripeAccountId.length === 0
      ? undefined
      : boundStripeAccountId
  const accountState =
    payoutAccount?.state ??
    (account.payout.accountState === 'missing'
      ? 'not_started'
      : account.payout.accountState)
  const payoutState = account.payout.payoutState
  const isWaitingForMinimumPayout =
    accountState === 'ready' && payoutState === 'held_threshold'
  const canApprovePayout =
    isWaitingForMinimumPayout &&
    compareExactAmounts(account.payout.providerNet, account.payout.minimumPayout) !== -1 &&
    account.payout.payoutRef !== undefined &&
    account.payout.payoutRevision !== undefined &&
    account.payout.accountVersion !== undefined &&
    account.payout.idempotencyKey !== undefined &&
    stripeAccountId !== undefined
  const payoutRef = account.payout.payoutRef
  const recoveryState = account.payout.recoveryState
  const payoutCommandId = account.payout.payoutCommandId
  const idempotencyKey = account.payout.idempotencyKey
  const stripeTransferId = account.payout.stripeTransferId
  const destinationAccountId = account.payout.destinationAccountId
  const requestDigest = account.payout.requestDigest
  const evidenceDigest = account.payout.evidenceDigest
  const providerHeldBefore = account.payout.providerHeldBefore
  const providerHeldAfter = account.payout.providerHeldAfter
  const providerPaidBefore = account.payout.providerPaidBefore
  const providerPaidAfter = account.payout.providerPaidAfter
  const hasPersistedPayout =
    payoutCommandId !== undefined &&
    payoutCommandId.length > 0 &&
    payoutRef !== undefined &&
    payoutRef.length > 0 &&
    idempotencyKey !== undefined &&
    idempotencyKey.length > 0
  const canReadRecordedTransfer =
    hasPersistedPayout &&
    (payoutState === 'paid' ||
      payoutState === 'outcome_unknown' ||
      (payoutState === 'transfer_pending' &&
        stripeTransferId !== undefined &&
        stripeTransferId.length > 0))
  const verifiedPaidEvidence =
    payoutState === 'paid' &&
    account.payout.transferStatus === 'succeeded' &&
    stripeTransferId !== undefined &&
    stripeTransferId.length > 0 &&
    evidenceDigest !== undefined &&
    evidenceDigest.length > 0
  const recoveryGuidance =
    recoveryState === 'admin_intervention'
      ? 'Transfer outcome requires system reconciliation. Contact support with the durable command ID; do not retry the transfer.'
      : recoveryState === 'provider_id' ||
          recoveryState === 'idempotency_key' ||
          payoutState === 'outcome_unknown'
        ? 'AE is reconciling the recorded transfer. Do not retry it.'
        : undefined

  const earningsFacts = [
    { label: 'Gross accrued', value: formatCurrencyAmount(account.earnings.grossAccrual) },
    { label: 'AE fee / rake', value: formatCurrencyAmount(account.earnings.rake) },
    { label: 'Provider net', value: formatCurrencyAmount(account.earnings.providerNet) },
    { label: 'Paid out', value: formatCurrencyAmount(account.earnings.paidOut) },
    { label: 'Held', value: formatCurrencyAmount(account.earnings.held) },
    { label: 'Payout account', value: payoutAccountLabel(accountState) },
    {
      label: 'Payout state',
      value: verifiedPaidEvidence
        ? 'Transferred to Stripe'
        : isWaitingForMinimumPayout
          ? 'Waiting for minimum payout'
          : payoutStateLabel(payoutState),
    },
    ...(isWaitingForMinimumPayout
      ? [
          {
            label: 'Threshold progress',
            value: `${formatCurrencyAmount(account.payout.providerNet)} of ${formatCurrencyAmount(account.payout.minimumPayout)}`,
          },
        ]
      : []),
  ]

  const durableFacts = [
    ...(payoutCommandId === undefined ? [] : [{ label: 'Command', value: payoutCommandId, mono: true as const }]),
    ...(stripeTransferId === undefined ? [] : [{ label: 'Stripe transfer', value: stripeTransferId, mono: true as const }]),
    ...(destinationAccountId === undefined ? [] : [{ label: 'Destination', value: destinationAccountId, mono: true as const }]),
    ...(requestDigest === undefined ? [] : [{ label: 'Request digest', value: requestDigest, mono: true as const }]),
    ...(evidenceDigest === undefined ? [] : [{ label: 'Provider evidence digest', value: evidenceDigest, mono: true as const }]),
    ...(providerHeldBefore === undefined || providerHeldAfter === undefined
      ? []
      : [{
          label: 'Held balance',
          value: `${formatCurrencyAmount(providerHeldBefore)} → ${formatCurrencyAmount(providerHeldAfter)}`,
        }]),
    ...(providerPaidBefore === undefined || providerPaidAfter === undefined
      ? []
      : [{
          label: 'Paid total',
          value: `${formatCurrencyAmount(providerPaidBefore)} → ${formatCurrencyAmount(providerPaidAfter)}`,
        }]),
  ]

  const stripeLast4 = stripeAccountId?.slice(-4)
  const showReviewPayout = canApprovePayout
  const showExpressDashboard = accountState === 'ready' && stripeAccountId !== undefined
  const showSetupPayouts =
    accountState !== 'ready' && stripeAccountId === undefined
  const showContinueOnboarding =
    accountState !== 'ready' &&
    stripeAccountId !== undefined &&
    payoutAccountVersion !== undefined

  const display: EarningsAccountDisplayModel = {
    currency: account.currency,
    businessId,
    earningsFacts,
    hasPersistedPayout,
    durableFacts,
    ...(recoveryGuidance === undefined ? {} : { recoveryGuidance }),
    canReadRecordedTransfer,
    isWaitingForMinimumPayout,
    canApprovePayout,
    accountState,
    ...(stripeLast4 === undefined
      ? {}
      : {
          stripeMaskLabel: `acct_••••${stripeLast4}`,
          stripeMaskAriaLabel: `Stripe Express account ending ${stripeLast4}`,
        }),
    showStripeUnbound: stripeAccountId === undefined,
    expressStatusExplanation: expressStatusExplanation(accountState),
    payoutGuidanceText: isWaitingForMinimumPayout
      ? 'Your payout account is ready. You can approve a payout after provider earnings reach the minimum shown above.'
      : 'Payouts become available when your payout account and provider configuration are ready.',
    earningsTruncated: account.earnings.truncated,
    connectConfirmDescription: `Create Stripe-hosted ${account.currency} payout authority for provider ${businessId} under your signed-in owner Account. This does not transfer funds. Current readiness is read back after you return.`,
    onboardingConfirmDescription: `Reopen Stripe-hosted onboarding for ${account.currency} payouts from provider ${businessId}. This may change where future payouts go. Current readiness remains authoritative after you return.`,
    transferConfirmDescription: `Transfer ${formatCurrencyAmount(account.payout.providerNet)} from provider ${businessId} to Stripe account ending ${stripeLast4 ?? 'unknown'}. AE reserves the amount now and dispatches through Stripe. It may not be reversible after dispatch; an uncertain outcome must be reconciled by status, not resubmitted.`,
    expressButtonVariant: canApprovePayout ? 'outline' : 'secondary',
    showReviewPayout,
    showExpressDashboard,
    showSetupPayouts,
    showContinueOnboarding,
    expressOnboardingLabel:
      accountState === 'onboarding_started'
        ? 'Continue onboarding'
        : 'Update Connect details',
  }

  const bindings: EarningsAccountHookBindings = {
    canApprovePayout,
    canReadRecordedTransfer,
    ...(payoutRef === undefined ? {} : { payoutRef }),
    ...(account.payout.payoutRevision === undefined
      ? {}
      : { payoutRevision: account.payout.payoutRevision }),
    ...(account.payout.accountVersion === undefined
      ? {}
      : { accountVersion: account.payout.accountVersion }),
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    ...(stripeAccountId === undefined ? {} : { stripeAccountId }),
    ...(payoutAccountVersion === undefined ? {} : { payoutAccountVersion }),
    providerNet: account.payout.providerNet,
  }

  return { display, bindings }
}

export function expressStatusExplanation(accountState: string): string {
  if (accountState === 'ready') {
    return 'Manage bank account details, view payout transfer receipts, and download annual tax statements.'
  }
  if (accountState === 'submitted' || accountState === 'onboarding_started') {
    return 'Stripe is still verifying this payout account. Bank details, receipts, and tax statements open in Express once verification completes.'
  }
  if (accountState === 'restricted') {
    return 'Stripe needs more information before Express can be opened. Continue onboarding to resolve outstanding requirements.'
  }
  return 'Connect Stripe Express to manage bank details, payout receipts, and annual tax statements.'
}

export function ssoFailureNextStep(code: string): string {
  if (code === 'billing_identity_missing') {
    return 'Sign in again as the owner, then try again.'
  }
  if (code === 'payout_not_ready') {
    return 'Finish payout verification, then try again.'
  }
  if (code === 'stripe_setup_required') {
    return 'Stripe Express is temporarily unavailable. Try again in a few moments.'
  }
  return 'Please refresh your session or try again in a few moments.'
}

export function payoutAccountLabel(state: string): string {
  return state === 'missing' ? 'Not set up' : state.replaceAll('_', ' ')
}

export function payoutStateLabel(state: string | undefined): string {
  return state === undefined ? 'No payout recorded' : state.replaceAll('_', ' ')
}

export function optionalString(value: unknown, key: string): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  return typeof record[key] === 'string' ? record[key] : undefined
}

export function actionMessage(code: string): string {
  if (code === 'billing_identity_missing')
    return 'Sign in again as the owner to manage payouts.'
  if (code === 'stripe_setup_required')
    return 'Stripe payout setup is unavailable or configured for the wrong mode. Try again later.'
  return 'Payout setup was refused. Try again later.'
}

import type { RefObject } from 'react'

import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'
export const FINANCIAL_SAFE =
  'A$0.00 affected — your earnings and payout configuration remain safe.'
export const WHAT_HAPPENED = 'Could not open Stripe Express dashboard.'

export type EarningsFactRow = Readonly<{
  label: string
  value: string
  mono?: boolean
}>

export type EarningsListProjection = Readonly<
  | { kind: 'error'; code: string }
  | { kind: 'not_found' }
  | { kind: 'empty_accounts' }
  | {
      kind: 'accounts'
      businessId: string
      accountCurrencies: readonly string[]
      accountsTruncated: boolean
    }
>

export type EarningsAccountDisplayModel = Readonly<{
  currency: string
  businessId: string
  earningsFacts: readonly EarningsFactRow[]
  hasPersistedPayout: boolean
  durableFacts: readonly EarningsFactRow[]
  recoveryGuidance?: string
  canReadRecordedTransfer: boolean
  isWaitingForMinimumPayout: boolean
  canApprovePayout: boolean
  accountState: string
  stripeMaskLabel?: string
  stripeMaskAriaLabel?: string
  showStripeUnbound: boolean
  expressStatusExplanation: string
  payoutGuidanceText: string
  earningsTruncated: boolean
  connectConfirmDescription: string
  onboardingConfirmDescription: string
  transferConfirmDescription: string
  expressButtonVariant: 'outline' | 'secondary'
  showReviewPayout: boolean
  showExpressDashboard: boolean
  showSetupPayouts: boolean
  showContinueOnboarding: boolean
  expressOnboardingLabel: string
}>

export type EarningsEmptyStateProps = Readonly<
  | { variant: 'error_unauthenticated' }
  | { variant: 'error_source' }
  | { variant: 'not_found' }
  | { variant: 'empty_accounts' }
>

export type EarningsFactsListProps = Readonly<{
  currency: string
  facts: readonly EarningsFactRow[]
}>

export type DurableTransferEvidenceProps = Readonly<{
  facts: readonly EarningsFactRow[]
  recoveryGuidance?: string
  canReadRecordedTransfer: boolean
  refreshBusy: boolean
  actionsDisabled: boolean
  onRefresh: () => void
}>

export type PayoutActionBarProps = Readonly<{
  accountState: string
  stripeMaskLabel?: string
  stripeMaskAriaLabel?: string
  showStripeUnbound: boolean
  expressStatusExplanation: string
  payoutGuidanceText: string
  showReviewPayout: boolean
  showExpressDashboard: boolean
  showSetupPayouts: boolean
  showContinueOnboarding: boolean
  expressOnboardingLabel: string
  expressButtonVariant: 'outline' | 'secondary'
  busyKind?: string
  actionsDisabled: boolean
  expressActionRef: RefObject<HTMLButtonElement | null>
  payoutActionRef: RefObject<HTMLButtonElement | null>
  onReviewPayout: () => void
  onExpressDashboard: () => void
  onSetupPayouts: () => void
  onContinueOnboarding: () => void
}>

export type PayoutConfirmAction = 'connect' | 'onboarding' | 'transfer'

export type PayoutConfirmDialogProps = Readonly<{
  confirmAction?: PayoutConfirmAction
  connectConfirmDescription: string
  onboardingConfirmDescription: string
  transferConfirmDescription: string
  pending: boolean
  returnFocusRef: RefObject<HTMLButtonElement | null>
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}>

export type EarningsAccountStatusProps = Readonly<{
  diagnosticError?: Rule4Diagnostic
  message?: string
}>

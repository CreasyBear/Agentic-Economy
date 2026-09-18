import {
  AUD_EXPONENT,
  canonicalAudUnits,
  formatDisplayAmount,
  quoteAudAccountFunding,
  type AudFundingPolicy,
  type CreditPaymentSession,
  type MoneyRefusal,
} from '@/modules/money/public'
import type {
  AccountFundingConstraints,
  AccountFundingOutcomeUnknownResult,
} from '@/modules/money/server'

export type RecoveryLocator =
  | Readonly<{ externalRef: string; idempotencyKey?: string }>
  | Readonly<{ commandRef: string; idempotencyKey: string }>

export type CreditPaymentStatus = CreditPaymentSession['evidence']['status']

export function topUpErrorCopy(result: MoneyRefusal | AccountFundingOutcomeUnknownResult): string {
  if (result.code === 'stripe_setup_required') return 'Account funding is unavailable right now. No payment started and your balance did not change. Try again later.'
  if (result.code === 'billing_identity_missing' || result.code === 'billing_identity_mismatch') return 'Your authenticated Account is unavailable. No payment started.'
  if (result.code === 'funding_amount_invalid') return 'That AUD principal is outside the configured limits. No payment started.'
  if (result.code === 'price_changed') return 'Funding limits changed before payment started. Review the updated quote and try again.'
  if (result.code === 'commercial_policy_required') return 'Production funding is not enabled because the required commercial approvals are not current. No payment started.'
  if (result.code === 'funding_pending' || result.code === 'funding_outcome_unknown') return 'Payment is still being verified. Your Account balance will not change until the canonical server readback completes.'
  return 'Account funding could not be started. No payment was confirmed; try again.'
}

export function fundingAmountErrorCopy(
  amountText: string,
  policy: AudFundingPolicy | undefined,
  constraints: AccountFundingConstraints | undefined,
): string {
  const units = canonicalAudUnits(amountText)
  if (units === undefined) return 'Enter a valid AUD amount with up to 6 decimal places.'
  if (policy === undefined || constraints?.kind !== 'available') return 'Funding limits could not be confirmed. Refresh and try again.'
  if (units < policy.minimumPrincipalUnits) return `Enter at least ${formatAudUnits(policy.minimumPrincipalUnits)}.`
  if (units > policy.maximumPrincipalUnits) return `Enter no more than ${formatAudUnits(policy.maximumPrincipalUnits)}.`
  if (units % policy.incrementUnits !== 0n) return `Enter an amount in ${formatAudUnits(policy.incrementUnits)} increments.`
  return 'Enter an amount within the displayed limits and increments.'
}

export function paymentReadErrorCopy(result: MoneyRefusal): string {
  if (result.code === 'funding_pending' || result.code === 'funding_outcome_unknown') {
    return 'Payment is still being verified. Your Account balance will not change until the canonical server readback completes.'
  }
  return 'This payment attempt could not be read. It remains unresolved; refresh this exact payment before starting another.'
}

export function isCheckoutResumable(session: CreditPaymentSession | undefined): session is CreditPaymentSession & Readonly<{ checkoutUrl: string }> {
  return session?.kind === 'hosted_redirect'
    && session.checkoutUrl !== undefined
    && session.evidence.status === 'pending'
    && session.evidence.checkoutStatus === 'open'
    && session.evidence.paymentStatus === 'unpaid'
}

export function canStartAnotherPayment(
  paymentStatus: CreditPaymentStatus | undefined,
  session: CreditPaymentSession | undefined,
): boolean {
  if (paymentStatus === 'succeeded' || paymentStatus === 'failed') return true
  return session?.evidence.checkoutStatus === 'expired'
}

export function fundingReadCopy(session: CreditPaymentSession): string | undefined {
  const status = session.evidence.status
  if (status === 'failed') return 'The provider did not complete this payment. No Account funds were added.'
  if (session.evidence.checkoutStatus === 'expired' && status !== 'succeeded') {
    return 'This checkout expired. No Account funds were added.'
  }
  if (status === 'outcome_unknown') {
    return 'Payment status is still being verified. No Account funds were added by this browser return.'
  }
  return undefined
}

export function formatAudUnits(units: bigint): string {
  return formatDisplayAmount({ currency: 'AUD', units: units.toString(), exponent: AUD_EXPONENT })
}

export function formatAudAmountString(units: string): string {
  return formatDisplayAmount({ currency: 'AUD', units, exponent: AUD_EXPONENT })
}

export function fundingSuggestionUnits(policy: AudFundingPolicy): readonly bigint[] {
  if (policy.minimumPrincipalUnits <= 0n || policy.maximumPrincipalUnits <= 0n || policy.incrementUnits <= 0n) return []
  const alignUp = (units: bigint) => ((units + policy.incrementUnits - 1n) / policy.incrementUnits) * policy.incrementUnits
  const alignDown = (units: bigint) => (units / policy.incrementUnits) * policy.incrementUnits
  const minimum = alignUp(policy.minimumPrincipalUnits)
  const maximum = alignDown(policy.maximumPrincipalUnits)
  if (minimum > maximum) return []

  const preferred = [minimum, alignUp(minimum * 2n), alignUp(minimum * 5n)]
  const fallbacks = [maximum, alignDown(minimum + ((maximum - minimum) / 2n))]
  const valid: bigint[] = []
  const seen = new Set<bigint>()
  for (const units of [...preferred, ...fallbacks]) {
    if (seen.has(units)) continue
    seen.add(units)
    if (quoteAudAccountFunding(units, policy) === undefined) continue
    valid.push(units)
    if (valid.length === 3) break
  }

  return Object.freeze([...valid].sort((left, right) => left < right ? -1 : left > right ? 1 : 0))
}

export function audInputTextFromUnits(units: bigint): string {
  const scale = 10n ** BigInt(AUD_EXPONENT)
  const whole = units / scale
  const fraction = (units % scale).toString().padStart(AUD_EXPONENT, '0').replace(/0+$/u, '')
  return fraction.length === 0 ? whole.toString() : `${whole}.${fraction}`
}

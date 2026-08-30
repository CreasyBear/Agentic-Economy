import type { MoneyPayoutAccount, PayoutAccountState } from '../../public'
import type { PayoutAccountTransitionInput, PayoutPolicyResult } from './contracts'

type StatusEvent = Extract<PayoutAccountTransitionInput['event'], { kind: 'status' }>

const refusedSetup = (): PayoutPolicyResult<MoneyPayoutAccount> => ({
  kind: 'refused',
  code: 'stripe_setup_required',
  retryable: false,
})

function baseAccount(input: PayoutAccountTransitionInput): MoneyPayoutAccount {
  return input.current ?? {
    businessId: input.businessId,
    currency: input.currency,
    exponent: input.exponent,
    stripeAccountId: input.stripeAccountId,
    state: 'not_started',
    detailsSubmitted: false,
    recipientCapabilityActive: false,
    requirementsDigest: 'sha256:unavailable',
    createdAt: input.event.observedAt,
    updatedAt: input.event.observedAt,
  }
}

function hasExpectedIdentity(base: MoneyPayoutAccount, input: PayoutAccountTransitionInput): boolean {
  return base.businessId === input.businessId
    && base.currency === input.currency
    && base.exponent === input.exponent
    && base.stripeAccountId === input.stripeAccountId
}

function statusTransition(
  input: PayoutAccountTransitionInput,
  base: MoneyPayoutAccount,
  event: StatusEvent,
): PayoutPolicyResult<MoneyPayoutAccount> {
  if (event.stripeEventId.length === 0 || event.payloadDigest.length === 0 || event.providerObjectDigest.length === 0) return refusedSetup()
  const current = input.current
  if (current !== undefined && current.lastStripeEventId === event.stripeEventId) {
    return current.lastStripePayloadDigest === event.payloadDigest
      && current.providerObjectDigest === event.providerObjectDigest
      ? { kind: 'accepted', value: current }
      : { kind: 'refused', code: 'ledger_idempotency_conflict', retryable: false }
  }
  if (current?.lastStripeObservedAt !== undefined && event.observedAt < current.lastStripeObservedAt) return { kind: 'accepted', value: current }
  const state: PayoutAccountState = event.restricted
    ? 'restricted'
    : event.detailsSubmitted && event.recipientCapabilityActive
      ? 'ready'
      : 'submitted'
  return {
    kind: 'accepted',
    value: {
      ...base,
      state,
      detailsSubmitted: event.detailsSubmitted,
      recipientCapabilityActive: event.recipientCapabilityActive,
      requirementsDigest: event.requirementsDigest,
      providerObjectDigest: event.providerObjectDigest,
      lastStripePayloadDigest: event.payloadDigest,
      lastStripeObservedAt: event.observedAt,
      lastStripeEventId: event.stripeEventId,
      version: (base.version ?? 0) + 1,
      updatedAt: event.observedAt,
    },
  }
}

export function transitionPayoutAccount(input: PayoutAccountTransitionInput): PayoutPolicyResult<MoneyPayoutAccount> {
  const base = baseAccount(input)
  if (!hasExpectedIdentity(base, input)) return refusedSetup()
  if (input.event.kind === 'onboarding_started') {
    return { kind: 'accepted', value: { ...base, state: 'onboarding_started', updatedAt: input.event.observedAt } }
  }
  if (input.event.kind === 'onboarding_returned') {
    const state: PayoutAccountState = base.state === 'ready' || base.state === 'restricted' ? base.state : 'submitted'
    return { kind: 'accepted', value: { ...base, state, updatedAt: input.event.observedAt } }
  }
  return statusTransition(input, base, input.event)
}

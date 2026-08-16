import { describe, expect, it } from 'vitest'

import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  applyTopup,
  authorizePaidCharge,
  createLedgerState,
  evaluateLiveMoneyGate,
  LIVE_MONEY_GATE_POLICY,
  validatePaymentBinding,
  type ExactAmount,
  type LedgerState,
  type MoneyAccount,
  type PaymentBinding,
} from '../../../src/modules/money/public'

const ownerId = 'owner-compliance-1'

const accounts: readonly MoneyAccount[] = [
  { accountRef: accountRefForOwner(ownerId, 'USD'), accountKind: 'operator_credit', accountId: ownerId, balance: amount('USD', '1000', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForProvider('business-1', 'USD'), accountKind: 'provider_earnings', businessId: 'business-1', balance: amount('USD', '0', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForRake('USD'), accountKind: 'ae_rake', balance: amount('USD', '0', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
]

const approved: PaymentBinding = {
  amount: amount('USD', '500', 2),
  providerRef: accountRefForProvider('business-1', 'USD'),
  actionVersion: 'published-operation:v1',
  expiresAt: 100,
  idempotencyKey: 'charge-key-1',
}

function chargeInput(state: LedgerState, binding: PaymentBinding = approved) {
  return {
    state,
    transaction: { transactionRef: 'charge-1', kind: 'charge' as const, idempotencyKey: binding.idempotencyKey, inputDigest: 'input-1', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 1, now: 10 },
    operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
    providerAccountRef: accountRefForProvider('business-1', 'USD'),
    rakeAccountRef: accountRefForRake('USD'),
    grossAmount: binding.amount,
    rakeConfig: { rakeBps: 1_000 },
    priceDigest: 'price-1',
    principalId: 'clerk_api_key:key-1',
    accountId: ownerId,
    credentialId: 'key-1',
    serviceRef: 'service-1',
    offeringRef: 'offering-1',
    businessId: 'business-1',
    invocationRef: 'inv-1',
    attemptRef: 'attempt-1',
    operationKey: 'operation-1',
    sourceDigest: 'source-charge',
    evidenceRefs: ['invocation:1'],
    observedAt: 10,
    paymentBinding: { approved, requested: binding },
  }
}

describe('T52 first-dollar money gate', () => {
  it('refuses live money while any counsel sign-off remains open', () => {
    const result = evaluateLiveMoneyGate()

    expect(result).toMatchObject({ kind: 'refused', code: 'live_money_gate_open', retryable: false })
    expect(LIVE_MONEY_GATE_POLICY.counselSignoffs.every((row) => row.status === 'open')).toBe(true)
  })

  it('admits only an accepted policy record with Stripe readiness', () => {
    const acceptedPolicy = {
      ...LIVE_MONEY_GATE_POLICY,
      counselSignoffs: LIVE_MONEY_GATE_POLICY.counselSignoffs.map((row) => ({ ...row, status: 'accepted' as const, artifactRef: 'counsel:accepted' })),
      stripe: { mode: 'live' as const, readiness: 'ready' as const },
    }

    expect(evaluateLiveMoneyGate(acceptedPolicy)).toMatchObject({ kind: 'accepted', policyId: LIVE_MONEY_GATE_POLICY.policyId })
  })

  it('validates the exact payment binding before the pure ledger can debit', () => {
    expect(validatePaymentBinding({ approved, requested: approved, now: 10 })).toMatchObject({ kind: 'accepted' })

    const topup = applyTopup({
      state: createLedgerState(accounts),
      transaction: { transactionRef: 'topup-1', kind: 'topup' as const, idempotencyKey: 'topup-key', inputDigest: 'topup-input', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 0, now: 1 },
      accountRef: accountRefForOwner(ownerId, 'USD'),
      accountId: ownerId,
      amount: amount('USD', '1000', 2),
      sourceDigest: 'source-topup',
      evidenceRefs: ['labelled_local_dev:topup'],
    })
    const charged = authorizePaidCharge(chargeInput(topup.state))
    expect(charged.result).toMatchObject({ kind: 'accepted', chargeState: 'paid', amount: amount('USD', '500', 2) })
    const retried = authorizePaidCharge(chargeInput(charged.state))
    expect(retried.result).toMatchObject({ kind: 'accepted', transactionRef: 'charge-1' })
    expect(retried.state.entries).toHaveLength(charged.state.entries.length)
  })

  it.each([
    ['amount', { amount: amount('USD', '600', 2) }],
    ['provider', { providerRef: 'business:other:USD' }],
    ['action version', { actionVersion: 'published-operation:v2' }],
  ])('requires fresh approval when the %s widens', (_label, changes) => {
    const requested = { ...approved, ...changes }
    expect(validatePaymentBinding({ approved, requested, now: 10 })).toMatchObject({ kind: 'refused', code: 'fresh_approval_required', retryable: false })
  })

  it('refuses an expired exact approval without touching the ledger', () => {
    const topup = applyTopup({
      state: createLedgerState(accounts),
      transaction: { transactionRef: 'topup-1', kind: 'topup' as const, idempotencyKey: 'topup-key', inputDigest: 'topup-input', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 0, now: 1 },
      accountRef: accountRefForOwner(ownerId, 'USD'),
      accountId: ownerId,
      amount: amount('USD', '1000', 2),
      sourceDigest: 'source-topup',
      evidenceRefs: ['labelled_local_dev:topup'],
    })
    const expired = { ...approved, expiresAt: 10 }
    const result = authorizePaidCharge({ ...chargeInput(topup.state, expired), paymentBinding: { approved: expired, requested: expired } })

    expect(result.result).toMatchObject({ kind: 'refused', code: 'payment_approval_expired', retryable: false })
    expect(result.state.entries).toHaveLength(topup.state.entries.length)
    expect(result.state.transactions).toHaveLength(topup.state.transactions.length)
  })
})

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}

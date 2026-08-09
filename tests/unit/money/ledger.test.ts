import { describe, expect, it } from 'vitest'

import {
  accountRefForProvider,
  accountRefForRake,
  accountRefForOperator,
  applyTopup,
  appendRefundReversal,
  authorizePaidCharge,
  createLedgerState,
  markOutcomeUnknown,
  reconcileCharge,
  type BeginTransactionInput,
  type MoneyAccount,
} from '../../../src/modules/money/internal/ledger'
import type { ExactAmount } from '../../../src/modules/money/public'

const accounts: readonly MoneyAccount[] = [
  { accountRef: accountRefForOperator('key-1', 'USD'), accountKind: 'operator_credit', principalId: 'clerk_api_key:key-1', balance: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForProvider('business-1', 'USD'), accountKind: 'provider_earnings', businessId: 'business-1', balance: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForRake('USD'), accountKind: 'ae_rake', balance: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
]

function transaction(overrides: Partial<BeginTransactionInput> = {}): BeginTransactionInput {
  return {
    transactionRef: 'charge-1',
    kind: 'charge',
    idempotencyKey: 'operation-1:attempt-1:1',
    inputDigest: 'input-1',
    principalId: 'clerk_api_key:key-1',
    currency: 'USD',
    expectedAccountVersion: 1,
    now: 10,
    ...overrides,
  }
}

describe('money append-only ledger', () => {
  it('applies topup then atomic charge split with one transaction', () => {
    const initial = createLedgerState(accounts)
    const topup = applyTopup({
      state: initial,
      transaction: { ...transaction(), transactionRef: 'topup-1', kind: 'topup', idempotencyKey: 'topup-key', inputDigest: 'topup-input', expectedAccountVersion: 0 },
      accountRef: accountRefForOperator('key-1', 'USD'),
      amount: amount('USD', '1000', 2),
      sourceDigest: 'source-topup',
      evidenceRefs: ['stripe:event:1'],
    })
    expect(topup.result.kind).toBe('accepted')
    const charged = authorizePaidCharge({
      state: topup.state,
      transaction: transaction(),
      operatorAccountRef: accountRefForOperator('key-1', 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '500', 2),
      rakeConfig: { rakeBps: 1_000 },
      priceDigest: 'price-1',
      principalId: 'clerk_api_key:key-1',
      credentialId: 'key-1',
      serviceRef: 'service-1',
      offeringRef: 'offering-1',
      businessId: 'business-1',
      invocationRef: 'inv-1',
      attemptRef: 'attempt-1',
      operationKey: 'operation-1',
      sourceDigest: 'source-charge',
      evidenceRefs: ['invocation:1'],
      observedAt: 11,
    })
    expect(charged.result).toMatchObject({
      kind: 'accepted',
      chargeState: 'paid',
      amount: amount('USD', '500', 2),
      providerNet: amount('USD', '450', 2),
      rake: amount('USD', '50', 2),
    })
    expect(charged.state.entries.filter((entry) => entry.transactionRef === 'charge-1')).toHaveLength(3)
    expect(charged.state.accounts.get(accountRefForOperator('key-1', 'USD'))?.balance).toEqual(amount('USD', '500', 2))
    expect(charged.state.accounts.get(accountRefForProvider('business-1', 'USD'))?.balance).toEqual(amount('USD', '450', 2))
    expect(charged.state.accounts.get(accountRefForRake('USD'))?.balance).toEqual(amount('USD', '50', 2))
  })

  it('returns exact insufficient credit and performs no journal writes', () => {
    const result = authorizePaidCharge({
      state: createLedgerState(accounts),
      transaction: transaction(),
      operatorAccountRef: accountRefForOperator('key-1', 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '500', 2),
      rakeConfig: { rakeBps: 1_000 },
      priceDigest: 'price-1',
      principalId: 'clerk_api_key:key-1',
      credentialId: 'key-1',
      serviceRef: 'service-1',
      offeringRef: 'offering-1',
      businessId: 'business-1',
      invocationRef: 'inv-1',
      attemptRef: 'attempt-1',
      operationKey: 'operation-1',
      sourceDigest: 'source-charge',
      evidenceRefs: ['invocation:1'],
      observedAt: 11,
    })
    expect(result.result).toEqual({
      kind: 'refused',
      code: 'insufficient_credit',
      retryable: false,
      requiredAmount: amount('USD', '500', 2),
      availableAmount: amount('USD', '0', 2),
      nextAction: 'credit_topup_required',
    })
    expect(result.state.entries).toHaveLength(0)
    expect(result.state.transactions).toHaveLength(0)
  })

  it('replays duplicate, rejects digest conflict, and refunds once after reconciliation', () => {
    const initial = createLedgerState(accounts)
    const topup = applyTopup({
      state: initial,
      transaction: { ...transaction(), transactionRef: 'topup-1', kind: 'topup', idempotencyKey: 'topup-key', inputDigest: 'topup-input', expectedAccountVersion: 0 },
      accountRef: accountRefForOperator('key-1', 'USD'),
      amount: amount('USD', '1000', 2),
      sourceDigest: 'source-topup',
      evidenceRefs: ['stripe:event:1'],
    })
    const chargeInput = {
      state: topup.state,
      transaction: transaction(),
      operatorAccountRef: accountRefForOperator('key-1', 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '500', 2),
      rakeConfig: { rakeBps: 1_000 },
      priceDigest: 'price-1',
      principalId: 'clerk_api_key:key-1',
      credentialId: 'key-1',
      serviceRef: 'service-1',
      offeringRef: 'offering-1',
      businessId: 'business-1',
      invocationRef: 'inv-1',
      attemptRef: 'attempt-1',
      operationKey: 'operation-1',
      sourceDigest: 'source-charge',
      evidenceRefs: ['invocation:1'],
      observedAt: 11,
    }
    const charge = authorizePaidCharge(chargeInput)
    const replay = authorizePaidCharge({ ...chargeInput, state: charge.state })
    expect(replay.result).toMatchObject({ kind: 'accepted', transactionRef: 'charge-1', amount: amount('USD', '500', 2) })
    expect(replay.state.entries).toHaveLength(charge.state.entries.length)
    expect(replay.state.transactions).toHaveLength(charge.state.transactions.length)
    expect(replay.state.usageEvents).toHaveLength(charge.state.usageEvents.length)
    expect(replay.state.accounts.get(accountRefForOperator('key-1', 'USD'))?.balance).toEqual(amount('USD', '500', 2))
    expect(authorizePaidCharge({
      ...chargeInput,
      state: charge.state,
      transaction: { ...transaction(), inputDigest: 'different' },
    }).result).toMatchObject({ kind: 'refused', code: 'ledger_idempotency_conflict' })
    const unknown = markOutcomeUnknown({ state: charge.state, transactionRef: 'charge-1', principalId: 'clerk_api_key:key-1', updatedAt: 12 })
    expect(unknown.result).toMatchObject({ kind: 'refused', code: 'charge_reconciliation_required' })
    const reconciled = reconcileCharge({
      state: unknown.state,
      transactionRef: 'charge-1',
      principalId: 'clerk_api_key:key-1',
      evidence: 'reconciled_not_released',
      evidenceRefs: ['provider:not-released'],
      observedAt: 13,
      refund: {
        principalId: 'clerk_api_key:key-1',
        sourceDigest: 'refund-source',
        evidenceRefs: ['provider:not-released'],
        observedAt: 13,
        transaction: { ...transaction(), transactionRef: 'refund-1', kind: 'refund', idempotencyKey: 'refund-key', inputDigest: 'refund-input', expectedAccountVersion: 2 },
      },
    })
    expect(reconciled.result).toMatchObject({ kind: 'accepted' })
    expect(reconciled.state.entries.filter((entry) => entry.reversalOf === 'charge-1')).toHaveLength(3)
    expect(appendRefundReversal({
      state: reconciled.state,
      transaction: { ...transaction(), transactionRef: 'refund-2', kind: 'refund', idempotencyKey: 'refund-key-2', inputDigest: 'refund-input-2', expectedAccountVersion: 2 },
      originalTransactionRef: 'charge-1',
      principalId: 'clerk_api_key:key-1',
      sourceDigest: 'refund-source',
      evidenceRefs: ['provider:not-released'],
      observedAt: 14,
    }).state.entries.filter((entry) => entry.reversalOf === 'charge-1')).toHaveLength(3)
  })

  it('bypasses the journal for a free call', () => {
    const result = authorizePaidCharge({
      state: createLedgerState(accounts),
      transaction: transaction(),
      operatorAccountRef: accountRefForOperator('key-1', 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '500', 2),
      rakeConfig: { rakeBps: 1_000 },
      priceDigest: 'price-1',
      principalId: 'clerk_api_key:key-1',
      credentialId: 'key-1',
      serviceRef: 'service-1',
      offeringRef: 'offering-1',
      businessId: 'business-1',
      invocationRef: 'inv-1',
      attemptRef: 'attempt-1',
      operationKey: 'operation-1',
      sourceDigest: 'source-charge',
      evidenceRefs: ['invocation:1'],
      observedAt: 11,
      freeTier: true,
    })
    expect(result.result).toMatchObject({ kind: 'accepted', chargeState: 'free_tier', amount: amount('USD', '0', 2) })
    expect(result.state.entries).toHaveLength(0)
    expect(result.state.transactions).toHaveLength(0)
  })
})

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}

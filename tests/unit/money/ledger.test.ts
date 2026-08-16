import { describe, expect, it } from 'vitest'

import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  applyTopup,
  appendRefundReversal,
  applyProviderAccountCredit,
  applyProviderAccountDebit,
  authorizePaidCharge,
  createLedgerState,
  markOutcomeUnknown,
  reconcileCharge,
  type BeginTransactionInput,
  type LedgerState,
  type MoneyAccount,
} from '../../../src/modules/money/internal/ledger'
import type { ExactAmount, MoneyLedgerEntry } from '../../../src/modules/money/public'

const ownerId = 'owner-ledger-1'
const accounts: readonly MoneyAccount[] = [
  { accountRef: accountRefForOwner(ownerId, 'USD'), accountKind: 'operator_credit', accountId: ownerId, balance: amount('USD', '0', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForProvider('business-1', 'USD'), accountKind: 'provider_earnings', businessId: 'business-1', balance: amount('USD', '0', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForRake('USD'), accountKind: 'ae_rake', balance: amount('USD', '0', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
]

function transaction(overrides: Partial<BeginTransactionInput> = {}): BeginTransactionInput {
  return {
    transactionRef: 'charge-1',
    kind: 'charge',
    idempotencyKey: 'charge-1',
    inputDigest: 'input-1',
    principalId: 'clerk_api_key:key-1',
    accountId: ownerId,
    currency: 'USD',
    expectedAccountVersion: 1,
    now: 10,
    ...overrides,
  }
}

function paidChargeState(): LedgerState {
  const topup = applyTopup({
    state: createLedgerState(accounts),
    transaction: { ...transaction(), transactionRef: 'topup-test', kind: 'topup', idempotencyKey: 'topup-test-key', inputDigest: 'topup-test-input', expectedAccountVersion: 0 },
    accountRef: accountRefForOwner(ownerId, 'USD'),
    accountId: ownerId,
    amount: amount('USD', '1000', 2),
    sourceDigest: 'source-topup',
    evidenceRefs: ['stripe:event:test'],
  })
  const charged = authorizePaidCharge({
    state: topup.state,
    transaction: transaction(),
    operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
    providerAccountRef: accountRefForProvider('business-1', 'USD'),
    rakeAccountRef: accountRefForRake('USD'),
    grossAmount: amount('USD', '500', 2),
    rakeConfig: { rakeBps: 1_000 },
    priceDigest: 'price-test',
    principalId: 'clerk_api_key:key-1',
    accountId: ownerId,
    credentialId: 'key-1',
    serviceRef: 'service-1',
    offeringRef: 'offering-1',
    businessId: 'business-1',
    invocationRef: 'inv-test',
    attemptRef: 'attempt-test',
    operationKey: 'operation-test',
    sourceDigest: 'source-charge',
    evidenceRefs: ['invocation:test'],
    observedAt: 11,
  })
  if (charged.result.kind !== 'accepted') throw new Error('charge_fixture_missing')
  return charged.state
}

type RefundCall = Parameters<typeof appendRefundReversal>[0]

function refundCall(
  state: LedgerState,
  overrides: Partial<Omit<RefundCall, 'state'>> = {},
): RefundCall {
  return {
    state,
    transaction: { ...transaction(), transactionRef: 'refund-test', kind: 'refund', idempotencyKey: 'refund-test-key', inputDigest: 'refund-test-input', expectedAccountVersion: 2 },
    originalTransactionRef: 'charge-1',
    principalId: 'clerk_api_key:key-1',
    sourceDigest: 'refund-source',
    evidenceRefs: ['refund:evidence'],
    observedAt: 12,
    ...overrides,
  }
}

function patchLedgerEntry(
  state: LedgerState,
  entryRef: string,
  patch: Partial<MoneyLedgerEntry>,
): LedgerState {
  return {
    ...state,
    entries: state.entries.map((entry) => entry.entryRef === entryRef ? { ...entry, ...patch } : entry),
  }
}

function withMoneyAccount(
  state: LedgerState,
  account: MoneyAccount,
): LedgerState {
  const accounts = new Map(state.accounts)
  accounts.set(account.accountRef, account)
  return { ...state, accounts }
}

describe('money append-only ledger', () => {
  it('applies topup then atomic charge split with one transaction', () => {
    const initial = createLedgerState(accounts)
    const topup = applyTopup({
      state: initial,
      transaction: { ...transaction(), transactionRef: 'topup-1', kind: 'topup', idempotencyKey: 'topup-key', inputDigest: 'topup-input', expectedAccountVersion: 0 },
      accountRef: accountRefForOwner(ownerId, 'USD'),
      accountId: ownerId,
      amount: amount('USD', '1000', 2),
      sourceDigest: 'source-topup',
      evidenceRefs: ['stripe:event:1'],
    })
    expect(topup.result.kind).toBe('accepted')
    const charged = authorizePaidCharge({
      state: topup.state,
      transaction: transaction(),
      operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '500', 2),
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
      observedAt: 11,
    })
    expect(charged.result).toMatchObject({
      kind: 'accepted',
      chargeState: 'paid',
      amount: amount('USD', '500', 2),
      usageRef: 'inv-1:attempt-1:operation-1',
      observedAt: 11,
      providerNet: amount('USD', '450', 2),
      rake: amount('USD', '50', 2),
    })
    expect(charged.state.entries.filter((entry) => entry.transactionRef === 'charge-1')).toHaveLength(3)
    expect(charged.state.accounts.get(accountRefForOwner(ownerId, 'USD'))?.balance).toEqual(amount('USD', '500', 2))
    expect(charged.state.accounts.get(accountRefForProvider('business-1', 'USD'))?.balance).toEqual(amount('USD', '450', 2))
    expect(charged.state.accounts.get(accountRefForRake('USD'))?.balance).toEqual(amount('USD', '50', 2))
  })

  it('journals one recovery debit while retaining the full provider credit', () => {
    const providerAccountRef = accountRefForProvider('business-1', 'USD')
    const recoveryAccounts = accounts.map((account) => account.accountRef === providerAccountRef ? { ...account, recoveryDue: amount('USD', '300', 2) } : account)
    const topup = applyTopup({
      state: createLedgerState(recoveryAccounts),
      transaction: { ...transaction(), transactionRef: 'topup-recovery', kind: 'topup', idempotencyKey: 'topup-recovery-key', inputDigest: 'topup-recovery-input', expectedAccountVersion: 0 },
      accountRef: accountRefForOwner(ownerId, 'USD'),
      accountId: ownerId,
      amount: amount('USD', '1000', 2),
      sourceDigest: 'source-topup',
      evidenceRefs: ['stripe:event:recovery'],
    })
    const chargeInput = {
      state: topup.state,
      transaction: transaction(),
      operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
      providerAccountRef,
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '500', 2),
      rakeConfig: { rakeBps: 1_000 },
      priceDigest: 'price-recovery',
      principalId: 'clerk_api_key:key-1',
      accountId: ownerId,
      credentialId: 'key-1',
      serviceRef: 'service-1',
      offeringRef: 'offering-1',
      businessId: 'business-1',
      invocationRef: 'inv-recovery',
      attemptRef: 'attempt-recovery',
      operationKey: 'operation-recovery',
      sourceDigest: 'source-recovery',
      evidenceRefs: ['invocation:recovery'],
      observedAt: 11,
    }
    const charged = authorizePaidCharge(chargeInput)
    expect(charged.result).toMatchObject({ kind: 'accepted', providerNet: amount('USD', '450', 2), rake: amount('USD', '50', 2) })
    const chargeEntries = charged.state.entries.filter((entry) => entry.transactionRef === 'charge-1')
    expect(chargeEntries).toHaveLength(4)
    const providerCredit = chargeEntries.find((entry) => entry.entryType === 'payout_accrual' && entry.direction === 'credit')
    const recoveryDebit = chargeEntries.find((entry) => entry.entryType === 'payout_accrual' && entry.direction === 'debit')
    expect(providerCredit?.amount).toEqual(amount('USD', '450', 2))
    expect(recoveryDebit?.amount).toEqual(amount('USD', '300', 2))
    expect(providerCredit === undefined || recoveryDebit === undefined ? undefined : BigInt(providerCredit.amount.units) - BigInt(recoveryDebit.amount.units)).toBe(150n)
    expect(charged.state.accounts.get(providerAccountRef)).toMatchObject({ balance: amount('USD', '150', 2), recoveryDue: amount('USD', '0', 2) })
    const chargeReplay = authorizePaidCharge({ ...chargeInput, state: charged.state })
    expect(chargeReplay.result).toMatchObject({ kind: 'accepted' })
    expect(chargeReplay.state.entries).toHaveLength(charged.state.entries.length)
    expect(chargeReplay.state.transactions).toHaveLength(charged.state.transactions.length)
    const refunded = appendRefundReversal({
      state: charged.state,
      transaction: { ...transaction(), transactionRef: 'refund-recovery', kind: 'refund', idempotencyKey: 'refund-recovery-key', inputDigest: 'refund-recovery-input', expectedAccountVersion: 2 },
      originalTransactionRef: 'charge-1',
      principalId: 'clerk_api_key:key-1',
      sourceDigest: 'refund-recovery',
      evidenceRefs: ['provider:recovery'],
      observedAt: 12,
    })
    expect(
      refunded.state.entries.find(
        (entry) =>
          entry.transactionRef === 'refund-recovery' &&
          entry.accountRef === providerAccountRef,
      )?.amount,
    ).toEqual(amount('USD', '450', 2))
    expect(refunded.result).toMatchObject({ kind: 'accepted' })
    expect(refunded.state.entries.filter((entry) => entry.reversalOf === 'charge-1')).toHaveLength(3)
    expect(refunded.state.accounts.get(providerAccountRef)).toMatchObject({ balance: amount('USD', '0', 2), recoveryDue: amount('USD', '300', 2) })
    const refundReplay = appendRefundReversal({
      state: refunded.state,
      transaction: { ...transaction(), transactionRef: 'refund-recovery', kind: 'refund', idempotencyKey: 'refund-recovery-key', inputDigest: 'refund-recovery-input', expectedAccountVersion: 2 },
      originalTransactionRef: 'charge-1',
      principalId: 'clerk_api_key:key-1',
      sourceDigest: 'refund-recovery',
      evidenceRefs: ['provider:recovery'],
      observedAt: 12,
    })
    expect(refundReplay.result).toMatchObject({ kind: 'accepted' })
    expect(refundReplay.state.entries.filter((entry) => entry.reversalOf === 'charge-1')).toHaveLength(3)
    expect(refundReplay.state.entries).toHaveLength(refunded.state.entries.length)
    expect(refundReplay.state.transactions).toHaveLength(refunded.state.transactions.length)
  })

  it('returns exact insufficient credit and performs no journal writes', () => {
    const result = authorizePaidCharge({
      state: createLedgerState(accounts),
      transaction: transaction(),
      operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '500', 2),
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
      accountRef: accountRefForOwner(ownerId, 'USD'),
      accountId: ownerId,
      amount: amount('USD', '1000', 2),
      sourceDigest: 'source-topup',
      evidenceRefs: ['stripe:event:1'],
    })
    const chargeInput = {
      state: topup.state,
      transaction: transaction(),
      operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '500', 2),
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
      observedAt: 11,
    }
    const charge = authorizePaidCharge(chargeInput)
    const replay = authorizePaidCharge({ ...chargeInput, state: charge.state })
    expect(replay.result).toMatchObject({ kind: 'accepted', transactionRef: 'charge-1', amount: amount('USD', '500', 2), usageRef: 'inv-1:attempt-1:operation-1', observedAt: 11 })
    expect(authorizePaidCharge({ ...chargeInput, state: { ...charge.state, usageEvents: [] } }).result).toMatchObject({ kind: 'refused', code: 'charge_reconciliation_required' })
    expect(replay.state.entries).toHaveLength(charge.state.entries.length)
    expect(replay.state.transactions).toHaveLength(charge.state.transactions.length)
    expect(replay.state.usageEvents).toHaveLength(charge.state.usageEvents.length)
    expect(replay.state.accounts.get(accountRefForOwner(ownerId, 'USD'))?.balance).toEqual(amount('USD', '500', 2))
    expect(authorizePaidCharge({
      ...chargeInput,
      state: charge.state,
      transaction: { ...transaction(), inputDigest: 'different' },
    }).result).toMatchObject({ kind: 'refused', code: 'ledger_idempotency_conflict' })
    const unknown = markOutcomeUnknown({ state: charge.state, transactionRef: 'charge-1', principalId: 'clerk_api_key:key-1', updatedAt: 12 })
    expect(unknown.result).toEqual({ kind: 'outcome_unknown', transactionRef: 'charge-1' })
    const unknownReplay = markOutcomeUnknown({ state: unknown.state, transactionRef: 'charge-1', principalId: 'clerk_api_key:key-1', updatedAt: 13 })
    expect(unknownReplay.result).toEqual({ kind: 'outcome_unknown', transactionRef: 'charge-1' })
    expect(unknownReplay.state).toBe(unknown.state)
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
    const duplicateRefund = appendRefundReversal({
      state: reconciled.state,
      transaction: { ...transaction(), transactionRef: 'refund-1', kind: 'refund', idempotencyKey: 'refund-key', inputDigest: 'refund-input', expectedAccountVersion: 2 },
      originalTransactionRef: 'charge-1',
      principalId: 'clerk_api_key:key-1',
      sourceDigest: 'refund-source',
      evidenceRefs: ['provider:not-released'],
      observedAt: 13,
    })
    expect(duplicateRefund.result).toMatchObject({ kind: 'accepted' })
    expect(duplicateRefund.state.entries).toHaveLength(reconciled.state.entries.length)
    expect(duplicateRefund.state.transactions).toHaveLength(reconciled.state.transactions.length)
    const sourceConflict = appendRefundReversal({
      state: reconciled.state,
      transaction: { ...transaction(), transactionRef: 'refund-1', kind: 'refund', idempotencyKey: 'refund-key', inputDigest: 'refund-input', expectedAccountVersion: 2 },
      originalTransactionRef: 'charge-1',
      principalId: 'clerk_api_key:key-1',
      sourceDigest: 'changed-source',
      evidenceRefs: ['provider:not-released'],
      observedAt: 13,
    })
    expect(sourceConflict.result).toEqual({ kind: 'refused', code: 'ledger_idempotency_conflict', retryable: false })
    expect(sourceConflict.state.entries).toHaveLength(reconciled.state.entries.length)
    expect(sourceConflict.state.transactions).toHaveLength(reconciled.state.transactions.length)
    const evidenceConflict = appendRefundReversal({
      state: reconciled.state,
      transaction: { ...transaction(), transactionRef: 'refund-1', kind: 'refund', idempotencyKey: 'refund-key', inputDigest: 'refund-input', expectedAccountVersion: 2 },
      originalTransactionRef: 'charge-1',
      principalId: 'clerk_api_key:key-1',
      sourceDigest: 'refund-source',
      evidenceRefs: ['changed-evidence'],
      observedAt: 13,
    })
    expect(evidenceConflict.result).toEqual({ kind: 'refused', code: 'ledger_idempotency_conflict', retryable: false })
    expect(evidenceConflict.state.entries).toHaveLength(reconciled.state.entries.length)
    expect(evidenceConflict.state.transactions).toHaveLength(reconciled.state.transactions.length)
    const secondRefund = appendRefundReversal({
      state: reconciled.state,
      transaction: { ...transaction(), transactionRef: 'refund-2', kind: 'refund', idempotencyKey: 'refund-key-2', inputDigest: 'refund-input-2', expectedAccountVersion: 2 },
      originalTransactionRef: 'charge-1',
      principalId: 'clerk_api_key:key-1',
      sourceDigest: 'refund-source',
      evidenceRefs: ['provider:not-released'],
      observedAt: 14,
    })
    expect(secondRefund.result).toMatchObject({ kind: 'refused', code: 'charge_reconciliation_required' })
    expect(secondRefund.state).toBe(reconciled.state)
  })

  it.each([
    {
      name: 'operator account substitution',
      mutate: (state: LedgerState) => {
        const alternate = { ...accounts[0]!, accountRef: accountRefForOwner('owner-other', 'USD'), accountId: 'owner-other' }
        return patchLedgerEntry(withMoneyAccount(state, alternate), 'charge-1:charge', { accountRef: alternate.accountRef })
      },
    },
    {
      name: 'provider account substitution',
      mutate: (state: LedgerState) => {
        const alternate = { ...accounts[1]!, accountRef: accountRefForProvider('business-other', 'USD'), businessId: 'business-other' }
        return patchLedgerEntry(withMoneyAccount(state, alternate), 'charge-1:provider', { accountRef: alternate.accountRef })
      },
    },
    {
      name: 'rake account substitution',
      mutate: (state: LedgerState) =>
        patchLedgerEntry(state, 'charge-1:rake', { accountRef: accountRefForOwner(ownerId, 'USD') }),
    },
    {
      name: 'balanced charge inflation',
      mutate: (state: LedgerState) =>
        patchLedgerEntry(
          patchLedgerEntry(
            patchLedgerEntry(state, 'charge-1:charge', { amount: amount('USD', '600', 2) }),
            'charge-1:provider',
            { amount: amount('USD', '550', 2) },
          ),
          'charge-1:rake',
          { amount: amount('USD', '50', 2) },
        ),
    },
    {
      name: 'unbalanced charge inflation',
      mutate: (state: LedgerState) =>
        patchLedgerEntry(
          patchLedgerEntry(state, 'charge-1:charge', { amount: amount('USD', '600', 2) }),
          'charge-1:provider',
          { amount: amount('USD', '450', 2) },
        ),
    },
  ])('refuses fresh $name without changing state', ({ mutate }) => {
    const state = mutate(paidChargeState())
    const result = appendRefundReversal(refundCall(state))
    expect(result.result).toMatchObject({ kind: 'refused', code: 'charge_reconciliation_required' })
    expect(result.state).toBe(state)
  })

  it.each([
    { name: 'operator entry ref', role: 'refund-test:operator', patch: { entryRef: 'forged:operator' } },
    { name: 'operator account', role: 'refund-test:operator', patch: { accountRef: 'forged:operator-account' } },
    { name: 'operator direction', role: 'refund-test:operator', patch: { direction: 'debit' as const } },
    { name: 'operator amount', role: 'refund-test:operator', patch: { amount: amount('USD', '501', 2) } },
    { name: 'operator currency', role: 'refund-test:operator', patch: { amount: amount('EUR', '500', 2) } },
    { name: 'operator scale', role: 'refund-test:operator', patch: { amount: amount('USD', '5000', 3) } },
    { name: 'operator principal', role: 'refund-test:operator', patch: { principalId: 'forged-principal' } },
    { name: 'operator business', role: 'refund-test:operator', patch: { businessId: 'forged-business' } },
    { name: 'operator invocation', role: 'refund-test:operator', patch: { invocationRef: 'forged-invocation' } },
    { name: 'operator attempt', role: 'refund-test:operator', patch: { attemptRef: 'forged-attempt' } },
    { name: 'operator created time', role: 'refund-test:operator', patch: { createdAt: 99 } },
    { name: 'provider entry ref', role: 'refund-test:provider', patch: { entryRef: 'forged:provider' } },
    { name: 'provider account', role: 'refund-test:provider', patch: { accountRef: 'forged-provider-account' } },
    { name: 'provider direction', role: 'refund-test:provider', patch: { direction: 'credit' as const } },
    { name: 'provider amount', role: 'refund-test:provider', patch: { amount: amount('USD', '451', 2) } },
    { name: 'provider currency', role: 'refund-test:provider', patch: { amount: amount('EUR', '450', 2) } },
    { name: 'provider scale', role: 'refund-test:provider', patch: { amount: amount('USD', '4500', 3) } },
    { name: 'provider principal', role: 'refund-test:provider', patch: { principalId: 'forged-principal' } },
    { name: 'provider business', role: 'refund-test:provider', patch: { businessId: 'forged-business' } },
    { name: 'provider invocation', role: 'refund-test:provider', patch: { invocationRef: 'forged-invocation' } },
    { name: 'provider attempt', role: 'refund-test:provider', patch: { attemptRef: 'forged-attempt' } },
    { name: 'provider created time', role: 'refund-test:provider', patch: { createdAt: 99 } },
    { name: 'rake entry ref', role: 'refund-test:rake', patch: { entryRef: 'forged:rake' } },
    { name: 'rake account', role: 'refund-test:rake', patch: { accountRef: 'forged-rake-account' } },
    { name: 'rake direction', role: 'refund-test:rake', patch: { direction: 'credit' as const } },
    { name: 'rake amount', role: 'refund-test:rake', patch: { amount: amount('USD', '51', 2) } },
    { name: 'rake currency', role: 'refund-test:rake', patch: { amount: amount('EUR', '50', 2) } },
    { name: 'rake scale', role: 'refund-test:rake', patch: { amount: amount('USD', '500', 3) } },
    { name: 'rake principal', role: 'refund-test:rake', patch: { principalId: 'forged-principal' } },
    { name: 'rake business', role: 'refund-test:rake', patch: { businessId: 'forged-business' } },
    { name: 'rake invocation', role: 'refund-test:rake', patch: { invocationRef: 'forged-invocation' } },
    { name: 'rake attempt', role: 'refund-test:rake', patch: { attemptRef: 'forged-attempt' } },
    { name: 'rake created time', role: 'refund-test:rake', patch: { createdAt: 99 } },
  ])('refuses replay with changed $name', ({ role, patch }) => {
    const charged = paidChargeState()
    const refunded = appendRefundReversal(refundCall(charged))
    expect(refunded.result).toMatchObject({ kind: 'accepted' })
    const replayState = patchLedgerEntry(refunded.state, role, patch)
    const before = replayState
    const replay = appendRefundReversal(refundCall(replayState))
    expect(replay.result).toMatchObject({ kind: 'refused' })
    expect(replay.state).toBe(before)
  })

  it('refuses replay when a forged second reversal exists', () => {
    const refunded = appendRefundReversal(refundCall(paidChargeState()))
    expect(refunded.result).toMatchObject({ kind: 'accepted' })
    const replayState = {
      ...refunded.state,
      transactions: [
        ...refunded.state.transactions,
        {
          ...refunded.state.transactions.find((entry) => entry.transactionRef === 'refund-test')!,
          transactionRef: 'forged-refund',
          idempotencyKey: 'forged-refund-key',
        },
      ],
    }
    const replay = appendRefundReversal(refundCall(replayState))
    expect(replay.result).toMatchObject({ kind: 'refused' })
    expect(replay.state).toBe(replayState)
  })

  it('refuses replay when a fourth refund row exists', () => {
    const refunded = appendRefundReversal(refundCall(paidChargeState()))
    expect(refunded.result).toMatchObject({ kind: 'accepted' })
    const refundEntry = refunded.state.entries.find((entry) => entry.entryRef === 'refund-test:operator')
    if (refundEntry === undefined) throw new Error('refund_fixture_missing')
    const replayState = {
      ...refunded.state,
      entries: [
        ...refunded.state.entries,
        { ...refundEntry, entryRef: 'refund-test:fourth', accountRef: 'forged-fourth-account' },
      ],
    }
    const replay = appendRefundReversal(refundCall(replayState))
    expect(replay.result).toMatchObject({ kind: 'refused' })
    expect(replay.state).toBe(replayState)
  })

  it('bypasses the journal for a free call', () => {
    const result = authorizePaidCharge({
      state: createLedgerState(accounts),
      transaction: transaction(),
      operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '500', 2),
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
      observedAt: 11,
      freeTier: true,
    })
    expect(result.result).toMatchObject({ kind: 'accepted', chargeState: 'free_tier', amount: amount('USD', '0', 2), usageRef: 'inv-1:attempt-1:operation-1', observedAt: 11 })
    expect(result.state.entries).toHaveLength(0)
    expect(result.state.transactions).toHaveLength(0)
  })
  it('floors held funds and recovers supplier debt before later accrual', () => {
    const provider = accounts[1]!
    const accruedApplication = applyProviderAccountCredit(provider, amount('USD', '450', 2), 2)
    const accrued = accruedApplication?.account
    expect(accrued).toMatchObject({ balance: amount('USD', '450', 2), recoveryDue: amount('USD', '0', 2), version: 1 })
    const reversed = accrued === undefined ? undefined : applyProviderAccountDebit(accrued, amount('USD', '900', 2), 3)
    expect(reversed).toMatchObject({ balance: amount('USD', '0', 2), recoveryDue: amount('USD', '450', 2), version: 2 })
    const recoveredApplication = reversed === undefined ? undefined : applyProviderAccountCredit(reversed, amount('USD', '600', 2), 4)
    const recovered = recoveredApplication?.account
    expect(recovered).toMatchObject({ balance: amount('USD', '150', 2), recoveryDue: amount('USD', '0', 2), version: 3 })
  })

  it('returns held and recovery splits while repaying provider debt', () => {
    const provider = { ...accounts[1]!, recoveryDue: amount('USD', '900', 2) }
    const first = applyProviderAccountCredit(provider, amount('USD', '600', 2), 2)
    expect(first).toMatchObject({ heldCredit: amount('USD', '0', 2), recoveryPayment: amount('USD', '600', 2) })
    expect(first?.account).toMatchObject({ balance: amount('USD', '0', 2), recoveryDue: amount('USD', '300', 2) })
    const second = first === undefined ? undefined : applyProviderAccountCredit(first.account, amount('USD', '600', 2), 3)
    expect(second).toMatchObject({ heldCredit: amount('USD', '300', 2), recoveryPayment: amount('USD', '300', 2) })
    expect(second?.account).toMatchObject({ balance: amount('USD', '300', 2), recoveryDue: amount('USD', '0', 2) })
  })

})

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}

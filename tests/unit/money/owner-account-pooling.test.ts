import { describe, expect, it } from 'vitest'

import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  applyTopup,
  authorizePaidCharge,
  createLedgerState,
  type BeginTransactionInput,
  type MoneyAccount,
} from '@/modules/money/public'
import type { ExactAmount } from '@/modules/money/public'

const ownerId = 'owner_pool_1'
const keyOnePrincipal = 'clerk_api_key:key-a'
const keyTwoPrincipal = 'clerk_api_key:key-b'

const pooledAccount: MoneyAccount = {
  accountRef: accountRefForOwner(ownerId, 'USD'),
  accountKind: 'operator_credit',
  accountId: ownerId,
  balance: amount('USD', '1000', 2),
  version: 0,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
}

const providerAccount: MoneyAccount = {
  accountRef: accountRefForProvider('business-1', 'USD'),
  accountKind: 'provider_earnings',
  businessId: 'business-1',
  balance: amount('USD', '0', 2),
  version: 0,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
}

const rakeAccount: MoneyAccount = {
  accountRef: accountRefForRake('USD'),
  accountKind: 'ae_rake',
  balance: amount('USD', '0', 2),
  version: 0,
  state: 'active',
  createdAt: 1,
  updatedAt: 1,
}

function chargeInput(overrides: Partial<Parameters<typeof authorizePaidCharge>[0]> = {}) {
  return {
    state: createLedgerState([pooledAccount, providerAccount, rakeAccount]),
    transaction: transaction({ principalId: keyOnePrincipal }),
    operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
    providerAccountRef: accountRefForProvider('business-1', 'USD'),
    rakeAccountRef: accountRefForRake('USD'),
    grossAmount: amount('USD', '300', 2),
    rakeConfig: { rakeBps: 1_000 },
    priceDigest: 'price-1',
    principalId: keyOnePrincipal,
    accountId: ownerId,
    credentialId: 'key-a',
    serviceRef: 'service-1',
    offeringRef: 'offering-1',
    businessId: 'business-1',
    invocationRef: 'inv-1',
    attemptRef: 'attempt-1',
    operationKey: 'operation-1',
    sourceDigest: 'source-charge',
    evidenceRefs: ['invocation:1'],
    observedAt: 11,
    ...overrides,
  }
}

describe('owner account pooling', () => {
  it('draws two key charges from one pooled owner balance', () => {
    const first = authorizePaidCharge(chargeInput({
      transaction: transaction({ principalId: keyOnePrincipal, transactionRef: 'charge-1', idempotencyKey: 'charge-1' }),
      invocationRef: 'inv-1',
      attemptRef: 'attempt-1',
      operationKey: 'operation-1',
      credentialId: 'key-a',
    }))
    expect(first.result).toMatchObject({ kind: 'accepted', chargeState: 'paid' })

    const second = authorizePaidCharge(chargeInput({
      state: first.state,
      transaction: transaction({ principalId: keyTwoPrincipal, transactionRef: 'charge-2', idempotencyKey: 'charge-2', expectedAccountVersion: 1 }),
      invocationRef: 'inv-2',
      attemptRef: 'attempt-2',
      operationKey: 'operation-2',
      principalId: keyTwoPrincipal,
      credentialId: 'key-b',
    }))
    expect(second.result).toMatchObject({ kind: 'accepted', chargeState: 'paid' })
    expect(second.state.accounts.get(accountRefForOwner(ownerId, 'USD'))?.balance).toEqual(amount('USD', '400', 2))
  })

  it('keeps per-key usage attribution after pooling', () => {
    const charged = authorizePaidCharge(chargeInput())
    expect(charged.result.kind).toBe('accepted')
    const keyAUsage = charged.state.usageEvents.filter((event) => event.credentialId === 'key-a')
    const keyBUsage = authorizePaidCharge(chargeInput({
      state: charged.state,
      transaction: transaction({ principalId: keyTwoPrincipal, transactionRef: 'charge-2', idempotencyKey: 'charge-2', expectedAccountVersion: 1 }),
      invocationRef: 'inv-2',
      attemptRef: 'attempt-2',
      operationKey: 'operation-2',
      principalId: keyTwoPrincipal,
      credentialId: 'key-b',
    })).state.usageEvents.filter((event) => event.credentialId === 'key-b')
    expect(keyAUsage).toHaveLength(1)
    expect(keyBUsage).toHaveLength(1)
    expect(keyAUsage[0]?.principalId).toBe(keyOnePrincipal)
    expect(keyBUsage[0]?.principalId).toBe(keyTwoPrincipal)
    expect(keyAUsage[0]?.accountId).toBe(ownerId)
    expect(keyBUsage[0]?.accountId).toBe(ownerId)
  })

  it('refuses charges against an account that does not match the owner wallet', () => {
    const result = authorizePaidCharge(chargeInput({ accountId: 'other-owner' }))
    expect(result.result).toMatchObject({ kind: 'refused', code: 'billing_identity_mismatch' })
    expect(result.state.transactions).toHaveLength(0)
  })

  it('tops up the owner wallet without binding to a single key principal', () => {
    const topup = applyTopup({
      state: createLedgerState([{ ...pooledAccount, balance: amount('USD', '0', 2) }, providerAccount, rakeAccount]),
      transaction: { ...transaction({ principalId: keyOnePrincipal, transactionRef: 'topup-1', kind: 'topup', idempotencyKey: 'topup-1', inputDigest: 'topup-input', expectedAccountVersion: 0 }), accountId: ownerId },
      accountRef: accountRefForOwner(ownerId, 'USD'),
      accountId: ownerId,
      amount: amount('USD', '1000', 2),
      sourceDigest: 'source-topup',
      evidenceRefs: ['stripe:event:1'],
    })
    expect(topup.result.kind).toBe('accepted')
    expect(topup.state.accounts.get(accountRefForOwner(ownerId, 'USD'))?.balance).toEqual(amount('USD', '1000', 2))
  })
})

function transaction(overrides: Partial<BeginTransactionInput> = {}): BeginTransactionInput {
  return {
    transactionRef: 'charge-1',
    kind: 'charge',
    idempotencyKey: 'operation-1:attempt-1:1',
    inputDigest: 'input-1',
    principalId: keyOnePrincipal,
    currency: 'USD',
    expectedAccountVersion: 0,
    now: 10,
    ...overrides,
  }
}

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}

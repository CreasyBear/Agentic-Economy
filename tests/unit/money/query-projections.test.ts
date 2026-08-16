import { describe, expect, it } from 'vitest'

import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  appendRefundReversal,
  authorizePaidCharge,
  createInMemoryMoneyQueryPort,
  createLedgerState,
  type ExactAmount,
  type MoneyAccount,
} from '../../../src/modules/money/public'

const ownerId = 'owner-proj-1'

const accounts: readonly MoneyAccount[] = [
  { accountRef: accountRefForOwner(ownerId, 'USD'), accountKind: 'operator_credit', accountId: ownerId, balance: amount('USD', '1000', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForProvider('business-1', 'USD'), accountKind: 'provider_earnings', businessId: 'business-1', balance: amount('USD', '0', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForRake('USD'), accountKind: 'ae_rake', balance: amount('USD', '0', 2), recoveryDue: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
]

const resolveOwnerId = (principalId: string): string | undefined => {
  if (principalId === 'clerk_api_key:key-1' || principalId === 'clerk_api_key:key-2') return ownerId
  return undefined
}

describe('money query projections', () => {
  it('binds reads to principal and returns native activity pages', async () => {
    const charged = authorizePaidCharge({
      state: createLedgerState(accounts),
      transaction: { transactionRef: 'tx-1', kind: 'charge', idempotencyKey: 'key-1:op:1', inputDigest: 'input-1', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 0, now: 1 },
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
      operationKey: 'op-1',
      sourceDigest: 'source-1',
      evidenceRefs: ['local/dev'],
      observedAt: 1,
    })
    const port = createInMemoryMoneyQueryPort({ ledger: charged.state, resolveOwnerId })
    await expect(port.readCreditAccount({ principalId: 'clerk_api_key:key-2', currency: 'USD' })).resolves.toMatchObject({
      balance: amount('USD', '500', 2),
    })
    const activity = await port.listCreditActivity({ principalId: 'clerk_api_key:key-1', credentialId: 'key-1', currency: 'USD', paginationOpts: { numItems: 999, cursor: null } })
    expect(activity.page).toHaveLength(1)
    expect(activity.page[0]).toMatchObject({ chargeState: 'paid', grossAmount: amount('USD', '500', 2) })
    await expect(port.readKeyUsage({ principalId: 'clerk_api_key:key-1', credentialId: 'key-1', currency: 'USD' })).resolves.toMatchObject({
      credentialId: 'key-1',
      callCount: 1,
      paidCallCount: 1,
      grossSpend: amount('USD', '500', 2),
    })
    await expect(port.readCreditAccount({ principalId: 'clerk_api_key:key-3', currency: 'USD' })).rejects.toThrow('billing_identity_missing')
  })

  it('reports provider earnings without silent truncation', async () => {
    const port = createInMemoryMoneyQueryPort({ ledger: createLedgerState(accounts), resolveOwnerId })
    const earnings = await port.readProviderEarnings({ businessId: 'business-1', currency: 'USD' })
    expect(earnings).toMatchObject({
      evidence: 'labelled_local_dev',
      grossAccrual: amount('USD', '0', 2),
      truncated: false,
    })
  })

  it('nets held-funded provider and rake refunds in earnings', async () => {
    const charged = authorizePaidCharge({
      state: createLedgerState(accounts),
      transaction: { transactionRef: 'held-charge', kind: 'charge', idempotencyKey: 'held-charge', inputDigest: 'held-charge-input', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 0, now: 1 },
      operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
      providerAccountRef: accountRefForProvider('business-1', 'USD'),
      rakeAccountRef: accountRefForRake('USD'),
      grossAmount: amount('USD', '1000', 2),
      rakeConfig: { rakeBps: 1_000 },
      priceDigest: 'held-price',
      principalId: 'clerk_api_key:key-1',
      accountId: ownerId,
      credentialId: 'key-1',
      serviceRef: 'service-1',
      offeringRef: 'offering-1',
      businessId: 'business-1',
      invocationRef: 'held-invocation',
      attemptRef: 'held-attempt',
      operationKey: 'held-operation',
      sourceDigest: 'held-source',
      evidenceRefs: ['held:evidence'],
      observedAt: 1,
    })
    expect(charged.result).toMatchObject({ kind: 'accepted', providerNet: amount('USD', '900', 2), rake: amount('USD', '100', 2) })
    const refunded = appendRefundReversal({
      state: charged.state,
      transaction: { transactionRef: 'held-refund', kind: 'refund', idempotencyKey: 'held-refund-key', inputDigest: 'held-refund-input', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 1, now: 2 },
      originalTransactionRef: 'held-charge',
      principalId: 'clerk_api_key:key-1',
      sourceDigest: 'held-refund-source',
      evidenceRefs: ['held:refund'],
      observedAt: 2,
    })
    expect(refunded.result).toMatchObject({ kind: 'accepted' })
    const rakeRefund = refunded.state.entries.find((entry) => entry.entryType === 'refund' && entry.accountRef === accountRefForRake('USD'))
    expect(rakeRefund?.businessId).toBe('business-1')
    const port = createInMemoryMoneyQueryPort({ ledger: refunded.state, resolveOwnerId })
    await expect(port.readProviderEarnings({ businessId: 'business-1', currency: 'USD' })).resolves.toMatchObject({
      grossAccrual: amount('USD', '0', 2),
      rake: amount('USD', '0', 2),
      providerNet: amount('USD', '0', 2),
      paidOut: amount('USD', '0', 2),
      held: amount('USD', '0', 2),
      recoveryDue: amount('USD', '0', 2),
    })
  })

  it('does not expose payment secrets in owner projections', async () => {
    const port = createInMemoryMoneyQueryPort({ ledger: createLedgerState(accounts), resolveOwnerId })
    const result = await port.readCreditAccount({ principalId: 'clerk_api_key:key-1', currency: 'USD' })
    expect(JSON.stringify(result)).not.toMatch(/secret|paymentMethod|clientSecret/i)
  })
})

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}

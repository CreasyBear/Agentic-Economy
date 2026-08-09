import { describe, expect, it } from 'vitest'

import {
  accountRefForOperator,
  accountRefForProvider,
  accountRefForRake,
  authorizePaidCharge,
  createInMemoryMoneyQueryPort,
  createLedgerState,
  type ExactAmount,
  type MoneyAccount,
} from '../../../src/modules/money/public'

const accounts: readonly MoneyAccount[] = [
  { accountRef: accountRefForOperator('key-1', 'USD'), accountKind: 'operator_credit', principalId: 'clerk_api_key:key-1', balance: amount('USD', '1000', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForOperator('key-2', 'USD'), accountKind: 'operator_credit', principalId: 'clerk_api_key:key-2', balance: amount('USD', '1000', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForProvider('business-1', 'USD'), accountKind: 'provider_earnings', businessId: 'business-1', balance: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForRake('USD'), accountKind: 'ae_rake', balance: amount('USD', '0', 2), version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
]

describe('money query projections', () => {
  it('binds reads to principal and returns native activity pages', async () => {
    const charged = authorizePaidCharge({
      state: createLedgerState(accounts),
      transaction: { transactionRef: 'tx-1', kind: 'charge', idempotencyKey: 'key-1:op:1', inputDigest: 'input-1', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 0, now: 1 },
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
      operationKey: 'op-1',
      sourceDigest: 'source-1',
      evidenceRefs: ['local/dev'],
      observedAt: 1,
    })
    const port = createInMemoryMoneyQueryPort({ ledger: charged.state })
    await expect(port.readCreditAccount({ principalId: 'clerk_api_key:key-2', currency: 'USD' })).resolves.toMatchObject({
      balance: amount('USD', '1000', 2),
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
    const port = createInMemoryMoneyQueryPort({ ledger: createLedgerState(accounts) })
    const earnings = await port.readProviderEarnings({ businessId: 'business-1', currency: 'USD' })
    expect(earnings).toMatchObject({
      evidence: 'labelled_local_dev',
      grossAccrual: amount('USD', '0', 2),
      truncated: false,
    })
  })

  it('does not expose payment secrets in owner projections', async () => {
    const port = createInMemoryMoneyQueryPort({ ledger: createLedgerState(accounts) })
    const result = await port.readCreditAccount({ principalId: 'clerk_api_key:key-1', currency: 'USD' })
    expect(JSON.stringify(result)).not.toMatch(/secret|paymentMethod|clientSecret/i)
  })
})

function amount(currency: string, units: string, exponent: number): ExactAmount {
  return { currency, units, exponent }
}

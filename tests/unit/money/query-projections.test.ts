import { describe, expect, it } from 'vitest'

import {
  accountRefForOperator,
  accountRefForProvider,
  accountRefForRake,
  authorizePaidCharge,
  createInMemoryMoneyQueryPort,
  createLedgerState,
  type MoneyAccount,
} from '../../../src/modules/money/public'

const accounts: readonly MoneyAccount[] = [
  { accountRef: accountRefForOperator('key-1', 'USD'), accountKind: 'operator_credit', principalId: 'clerk_api_key:key-1', currency: 'USD', balanceMinor: 1_000, version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForOperator('key-2', 'USD'), accountKind: 'operator_credit', principalId: 'clerk_api_key:key-2', currency: 'USD', balanceMinor: 1_000, version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForProvider('business-1', 'USD'), accountKind: 'provider_earnings', businessId: 'business-1', currency: 'USD', balanceMinor: 0, version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
  { accountRef: accountRefForRake('USD'), accountKind: 'ae_rake', currency: 'USD', balanceMinor: 0, version: 0, state: 'active', createdAt: 1, updatedAt: 1 },
]

describe('money query projections', () => {
  it('binds reads to principal and returns native activity pages', async () => {
    const charged = authorizePaidCharge({ state: createLedgerState(accounts), transaction: { transactionRef: 'tx-1', kind: 'charge', idempotencyKey: 'key-1:op:1', inputDigest: 'input-1', principalId: 'clerk_api_key:key-1', currency: 'USD', expectedAccountVersion: 0, now: 1 }, operatorAccountRef: accountRefForOperator('key-1', 'USD'), providerAccountRef: accountRefForProvider('business-1', 'USD'), rakeAccountRef: accountRefForRake('USD'), grossAmountMinor: 500, rakeConfig: { rakeBps: 1_000 }, priceDigest: 'price-1', principalId: 'clerk_api_key:key-1', credentialId: 'key-1', serviceRef: 'service-1', offeringRef: 'offering-1', businessId: 'business-1', invocationRef: 'inv-1', attemptRef: 'attempt-1', operationKey: 'op-1', sourceDigest: 'source-1', evidenceRefs: ['local/dev'], observedAt: 1 })
    const port = createInMemoryMoneyQueryPort({ ledger: charged.state })
    await expect(port.readCreditAccount({ principalId: 'clerk_api_key:key-2', currency: 'USD' })).resolves.toMatchObject({ balanceMinor: 1_000 })
    const activity = await port.listCreditActivity({ principalId: 'clerk_api_key:key-1', credentialId: 'key-1', currency: 'USD', paginationOpts: { numItems: 999, cursor: null } })
    expect(activity.page).toHaveLength(1)
    expect(activity.page[0]).toMatchObject({ chargeState: 'paid', currency: 'USD' })
    await expect(port.readKeyUsage({ principalId: 'clerk_api_key:key-1', credentialId: 'key-1', currency: 'USD' })).resolves.toMatchObject({ credentialId: 'key-1', callCount: 1, paidCallCount: 1, grossSpendMinor: 500, currency: 'USD' })
    await expect(port.readCreditAccount({ principalId: 'clerk_api_key:key-3', currency: 'USD' })).rejects.toThrow('billing_identity_missing')
  })

  it('does not expose payment secrets in owner projections', async () => {
    const port = createInMemoryMoneyQueryPort({ ledger: createLedgerState(accounts) })
    const result = await port.readCreditAccount({ principalId: 'clerk_api_key:key-1', currency: 'USD' })
    expect(JSON.stringify(result)).not.toMatch(/secret|paymentMethod|clientSecret/i)
  })
})

import { describe, expect, it } from 'vitest'

import { readAgentAccessMoneyReadback } from '@/routes/_operator/agent-access'
import type { CustomerRequestAgentKeyInventoryItem } from '@/modules/customer-request/agent-access'
import {
  accountRefForOperator,
  createInMemoryMoneyQueryPort,
  createLedgerState,
  type MoneyAccount,
  type MoneyUsageEvent,
} from '@/modules/money/public'

const key: CustomerRequestAgentKeyInventoryItem = {
  keyId: 'key_console_1',
  name: 'Console assistant',
  authorityMode: 'inspect_only',
  scopes: ['customer_requests:create', 'customer_requests:inspect_only'],
  revoked: false,
  expired: false,
}

const account: MoneyAccount = {
  accountRef: accountRefForOperator(key.keyId, 'USD'),
  accountKind: 'operator_credit',
  principalId: `clerk_api_key:${key.keyId}`,
  currency: 'USD',
  balanceMinor: 2_500,
  version: 1,
  state: 'active',
  createdAt: 1,
  updatedAt: 2,
}

const usage: MoneyUsageEvent = {
  usageRef: 'usage-console-1',
  principalId: `clerk_api_key:${key.keyId}`,
  credentialId: key.keyId,
  currency: 'USD',
  serviceRef: 'service:quote',
  offeringRef: 'offering:quote',
  businessId: 'business:one',
  invocationRef: 'invocation:one',
  attemptRef: 'attempt:one',
  operationKey: 'quote.latest',
  priceDigest: 'price:one',
  chargeState: 'paid',
  amountMinor: 500,
  transactionRef: 'transaction:one',
  observedAt: 10,
}

describe('agent access money seam', () => {
  it('reads exact key balance, bounded activity, and per-key spend from the public query port', async () => {
    const ledger = { ...createLedgerState([account]), usageEvents: [usage] }
    const [result] = await readAgentAccessMoneyReadback([key], createInMemoryMoneyQueryPort({ ledger }))

    expect(result).toMatchObject({
      principalId: 'clerk_api_key:key_console_1',
      account: { balanceMinor: 2_500, currency: 'USD', evidence: 'labelled_local_dev' },
      dataState: 'source',
    })
    expect(result?.activity).toHaveLength(1)
    expect(result?.activity[0]).toMatchObject({ credentialId: 'key_console_1', grossAmountMinor: 500, chargeState: 'paid' })
    expect(result?.usage).toMatchObject({ credentialId: 'key_console_1', callCount: 1, paidCallCount: 1, grossSpendMinor: 500 })
  })

})

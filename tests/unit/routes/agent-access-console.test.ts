import { describe, expect, it } from 'vitest'

import { readAgentAccessMoneyReadback } from '@/modules/customer-request/agent-access-console'
import type { AgentAccessKeyInventoryItem } from '@/modules/agent-access/agent-access'
import {
  accountRefForOwner,
  createInMemoryMoneyQueryPort,
  createLedgerState,
  type MoneyAccount,
  type MoneyUsageEvent,
} from '@/modules/money/public'

const ownerId = 'owner-console-1'

const key: AgentAccessKeyInventoryItem = {
  keyId: 'key_console_1',
  name: 'Console assistant',
  applicationRef: 'agentic-economy',
  environment: 'sandbox',
  authorityMode: 'inspect_only',
  scopes: ['customer_requests:create', 'customer_requests:inspect_only'],
  revoked: false,
  expired: false,
}

const account: MoneyAccount = {
  accountRef: accountRefForOwner(ownerId, 'USD'),
  accountKind: 'operator_credit',
  accountId: ownerId,
  balance: { currency: 'USD', units: '2500', exponent: 2 },
  recoveryDue: { currency: 'USD', units: '0', exponent: 2 },
  version: 1,
  state: 'active',
  createdAt: 1,
  updatedAt: 2,
}

const usage: MoneyUsageEvent = {
  usageRef: 'usage-console-1',
  principalId: `clerk_api_key:${key.keyId}`,
  accountId: ownerId,
  credentialId: key.keyId,
  serviceRef: 'service:quote',
  offeringRef: 'offering:quote',
  businessId: 'business:one',
  invocationRef: 'invocation:one',
  attemptRef: 'attempt:one',
  operationKey: 'quote.latest',
  priceDigest: 'price:one',
  chargeState: 'paid',
  amount: { currency: 'USD', units: '500', exponent: 2 },
  transactionRef: 'transaction:one',
  observedAt: 10,
}

describe('agent access money seam', () => {
  it('reads exact key balance, bounded activity, and per-key spend from the public query port', async () => {
    const ledger = { ...createLedgerState([account]), usageEvents: [usage], usageSummaries: new Map([[`${usage.principalId}\u0000${usage.credentialId}\u0000${usage.amount.currency}`, { principalId: usage.principalId, credentialId: usage.credentialId, callCount: 1, paidCallCount: 1, freeCallCount: 0, grossSpend: { currency: 'USD', units: '500', exponent: 2 }, states: ['paid'] as const }]]) }
    const [result] = await readAgentAccessMoneyReadback([key], createInMemoryMoneyQueryPort({
      ledger,
      resolveOwnerId: (principalId) => principalId === `clerk_api_key:${key.keyId}` ? ownerId : undefined,
    }))

    expect(result).toMatchObject({
      principalId: 'clerk_api_key:key_console_1',
      account: { balance: { currency: 'USD', units: '2500', exponent: 2 }, evidence: 'labelled_local_dev' },
      dataState: 'source',
    })
    expect(result?.activity).toHaveLength(1)
    expect(result?.activity[0]).toMatchObject({ credentialId: 'key_console_1', grossAmount: { currency: 'USD', units: '500', exponent: 2 }, chargeState: 'paid' })
    expect(result?.usage).toMatchObject({ credentialId: 'key_console_1', callCount: 1, paidCallCount: 1, grossSpend: { currency: 'USD', units: '500', exponent: 2 } })
  })

})

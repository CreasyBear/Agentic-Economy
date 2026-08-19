import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'

describe('money schema ownership', () => {
  it('contains the append-only journal and bounded control tables', () => {
    const exported = Reflect.get(schema, 'export')
    if (typeof exported !== 'function') throw new Error('Convex schema export unavailable')
    const tables = JSON.parse(String(exported.call(schema))).tables as readonly { tableName: string; indexes: readonly { indexDescriptor: string; fields: readonly string[] }[] }[]
    const byName = new Map(tables.map((table) => [table.tableName, table]))
    expect([...byName.keys()].filter((name) => name.startsWith('money'))).toEqual(expect.arrayContaining([
      'moneyAccounts', 'moneyLedgerEntries', 'moneyTransactions', 'moneyCredentialBudgetStates', 'moneyExternalSpendReservations', 'moneyX402PaymentAttempts', 'moneyUsageEvents', 'moneyCredentialUsageSummaries', 'moneyTopupCommands', 'moneyStripeEvents', 'moneyPayoutAccounts', 'moneyPayouts',
    ]))
    expect(byName.get('moneyExternalSpendReservations')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexDescriptor: 'by_reservationRef', fields: ['reservationRef'] }),
      expect.objectContaining({ indexDescriptor: 'by_idempotencyDigest', fields: ['idempotencyDigest'] }),
      expect.objectContaining({ indexDescriptor: 'by_invocationRef_and_attemptRef_and_effectGeneration', fields: ['invocationRef', 'attemptRef', 'effectGeneration'] }),
      expect.objectContaining({ indexDescriptor: 'by_paymentIdentifier_and_challengeDigest', fields: ['paymentIdentifier', 'challengeDigest'] }),
      expect.objectContaining({ indexDescriptor: 'by_state_and_updatedAt', fields: ['state', 'updatedAt'] }),
    ]))
    expect(byName.get('moneyX402PaymentAttempts')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexDescriptor: 'by_attemptRef_and_effectGeneration', fields: ['attemptRef', 'effectGeneration'] }),
      expect.objectContaining({ indexDescriptor: 'by_custodyRef', fields: ['custodyRef'] }),
      expect.objectContaining({ indexDescriptor: 'by_authorizationDigest', fields: ['authorizationDigest'] }),
      expect.objectContaining({ indexDescriptor: 'by_paymentIdentifier', fields: ['paymentIdentifier'] }),
    ]))
    expect(byName.get('moneyLedgerEntries')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexDescriptor: 'by_accountRef_and_createdAt', fields: ['accountRef', 'createdAt'] }),
      expect.objectContaining({ indexDescriptor: 'by_principalId_and_createdAt', fields: ['principalId', 'createdAt'] }),
    ]))
    expect(byName.get('moneyUsageEvents')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexDescriptor: 'by_principalId_and_credentialId_and_currency_and_observedAt', fields: ['principalId', 'credentialId', 'currency', 'observedAt'] }),
    ]))
    expect(byName.get('moneyCredentialUsageSummaries')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexDescriptor: 'by_principalId_and_credentialId_and_currency', fields: ['principalId', 'credentialId', 'currency'] }),
    ]))
    expect(byName.get('moneyPayoutAccounts')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexDescriptor: 'by_businessId_and_currency', fields: ['businessId', 'currency'] }),
      expect.objectContaining({ indexDescriptor: 'by_stripeAccountId', fields: ['stripeAccountId'] }),
    ]))
    expect(byName.has('moneyFreeTierCounters')).toBe(false)
    expect(byName.has('moneyConnectAccountCommands')).toBe(false)
    const serialized = JSON.stringify(tables.filter((table) => table.tableName.startsWith('money')))
    expect(serialized).not.toMatch(/secret|paymentMethod|clientSecret/i)
  })
})

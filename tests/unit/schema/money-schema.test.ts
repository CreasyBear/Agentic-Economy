import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'

describe('money schema ownership', () => {
  it('contains the append-only journal and bounded control tables', () => {
    const exported = Reflect.get(schema, 'export')
    if (typeof exported !== 'function') throw new Error('Convex schema export unavailable')
    const tables = JSON.parse(String(exported.call(schema))).tables as readonly { tableName: string; indexes: readonly { indexDescriptor: string; fields: readonly string[] }[] }[]
    const byName = new Map(tables.map((table) => [table.tableName, table]))
    expect([...byName.keys()].filter((name) => name.startsWith('money'))).toEqual(expect.arrayContaining([
      'moneyAccounts', 'moneyLedgerEntries', 'moneyTransactions', 'moneyUsageEvents', 'moneyFreeTierCounters', 'moneyStripeEvents', 'moneyPayoutAccounts', 'moneyPayouts',
    ]))
    expect(byName.get('moneyLedgerEntries')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexDescriptor: 'by_accountRef_and_createdAt', fields: ['accountRef', 'createdAt'] }),
      expect.objectContaining({ indexDescriptor: 'by_principalId_and_createdAt', fields: ['principalId', 'createdAt'] }),
    ]))
    const serialized = JSON.stringify(tables.filter((table) => table.tableName.startsWith('money')))
    expect(serialized).not.toMatch(/secret|paymentMethod|clientSecret/i)
  })
})

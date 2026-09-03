import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'

const RETIRED_FINANCIAL_AUTHORITY = [
  'moneyLedgerAccounts', 'moneyLedgerTransactions', 'moneyLedgerPostings',
  'moneyBalanceProjections', 'moneyReconciliationRuns', 'moneyTreasuryProjections',
  'moneyTreasuryReservations', 'moneyAgentBudgetProjections',
  'moneyRegulatoryExposureProjections', 'moneyCallReservations', 'moneyAccounts',
  'moneyLedgerEntries', 'moneyTransactions', 'moneyCredentialBudgetStates',
  'moneyExternalSpendReservations',
] as const

describe('money schema ownership', () => {
  it('retains product evidence and contains no Convex financial authority', () => {
    const exported = Reflect.get(schema, 'export')
    if (typeof exported !== 'function') throw new Error('Convex schema export unavailable')
    const tables = JSON.parse(String(exported.call(schema))).tables as readonly {
      tableName: string
      indexes: readonly { indexDescriptor: string; fields: readonly string[] }[]
    }[]
    const byName = new Map(tables.map((table) => [table.tableName, table]))
    expect([...byName.keys()].filter((name) => name.startsWith('money'))).toEqual(expect.arrayContaining([
      'moneyCommercialPolicies', 'moneyReconciliationCases', 'moneyDocuments',
      'moneyDocumentSnapshotPages', 'moneyFundingCommands', 'moneyTreasuryObservations',
      'moneyLegalCustomerBindings', 'moneyProviderObligations', 'moneyX402PaymentAttempts',
      'moneyUsageEvents', 'moneyCredentialUsageSummaries', 'moneyStripeEvents',
      'moneyPayoutAccounts', 'moneyPayouts', 'moneyPayoutAllocations', 'moneyConnectAccountCommands',
    ]))
    for (const retired of RETIRED_FINANCIAL_AUTHORITY) expect(byName.has(retired)).toBe(false)
    expect(byName.get('moneyFundingCommands')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexDescriptor: 'by_commandRef', fields: ['commandRef'] }),
      expect.objectContaining({ indexDescriptor: 'by_paymentId', fields: ['paymentId'] }),
      expect.objectContaining({ indexDescriptor: 'by_accountRef_and_createdAt', fields: ['accountRef', 'createdAt'] }),
    ]))
    expect(byName.get('moneyTreasuryObservations')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexDescriptor: 'by_observationRef', fields: ['observationRef'] }),
      expect.objectContaining({ indexDescriptor: 'by_custody_and_observedAt', fields: ['environment', 'custodyRef', 'custodyGeneration', 'observedAt'] }),
      expect.objectContaining({ indexDescriptor: 'by_environment_and_observedAt', fields: ['environment', 'observedAt'] }),
    ]))
    expect(byName.get('moneyProviderObligations')?.indexes).toEqual(expect.arrayContaining([
      expect.objectContaining({ indexDescriptor: 'by_obligationRef', fields: ['obligationRef'] }),
      expect.objectContaining({ indexDescriptor: 'by_invocationRef', fields: ['invocationRef'] }),
    ]))
    const serialized = JSON.stringify(tables.filter((table) => table.tableName.startsWith('money')))
    expect(serialized).not.toMatch(/secret|paymentMethod|clientSecret/i)
  })
})

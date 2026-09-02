/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'

import schema from '../../../convex/schema'

const convexModules = Object.fromEntries(
  Object.entries(import.meta.glob('../../../convex/**/*.{ts,js}'))
    .map(([path, load]) => [path.replace('../../../convex/', './'), load]),
)

const postFundingSettlement = anyApi.moneyJournal?.postFundingSettlement
if (postFundingSettlement === undefined) throw new Error('money journal mutation missing')

const funding = Object.freeze({
  accountRef: 'acc_00000000000040008000000000000021',
  transactionRef: 'journal-transaction:funding:one',
  idempotencyKey: 'funding-settlement:one',
  inputDigest: `sha256:${'a'.repeat(64)}`,
  principalUnits: '10000000',
  serviceFeeUnits: '250000',
  taxUnits: '25000',
  totalUnits: '10275000',
  externalRef: 'pi_redacted_one',
  evidenceRefs: ['stripe-payment-intent:pi_redacted_one'],
  occurredAt: 1,
})

describe('Account AUD journal persistence', () => {
  it('posts one balanced funding settlement and replays duplicate observations once', async () => {
    const backend = convexTest(schema, convexModules)
    const [first, duplicate] = await Promise.all([
      backend.mutation(postFundingSettlement, funding),
      backend.mutation(postFundingSettlement, funding),
    ])
    expect([first.kind, duplicate.kind].sort()).toEqual(['posted', 'replayed'])

    await expect(backend.run(async (ctx) => ({
      accounts: await ctx.db.query('moneyLedgerAccounts').collect(),
      transactions: await ctx.db.query('moneyLedgerTransactions').collect(),
      postings: await ctx.db.query('moneyLedgerPostings').collect(),
      projections: await ctx.db.query('moneyBalanceProjections').collect(),
    }))).resolves.toMatchObject({
      accounts: expect.arrayContaining([
        expect.objectContaining({ accountKind: 'customer_prepayment_liability', state: 'active' }),
      ]),
      transactions: [expect.objectContaining({
        transactionRef: funding.transactionRef,
        debitUnits: funding.totalUnits,
        creditUnits: funding.totalUnits,
        state: 'posted',
      })],
      postings: expect.arrayContaining([
        expect.objectContaining({ side: 'debit', amountUnits: funding.totalUnits }),
        expect.objectContaining({ side: 'credit', amountUnits: funding.principalUnits }),
        expect.objectContaining({ side: 'credit', amountUnits: funding.serviceFeeUnits }),
        expect.objectContaining({ side: 'credit', amountUnits: funding.taxUnits }),
      ]),
      projections: expect.arrayContaining([
        expect.objectContaining({
          accountRef: funding.accountRef,
          balanceUnits: funding.principalUnits,
          state: 'active',
        }),
      ]),
    })

    await expect(backend.mutation(postFundingSettlement, {
      ...funding,
      principalUnits: '10000001',
      totalUnits: '10275001',
    })).resolves.toEqual({
      kind: 'refused',
      code: 'journal_idempotency_conflict',
      retryable: false,
    })
  })

  it('locks only the affected Account and opens reconciliation on projection mismatch', async () => {
    const backend = convexTest(schema, convexModules)
    await backend.mutation(postFundingSettlement, funding)
    await backend.run(async (ctx) => {
      const projection = await ctx.db.query('moneyBalanceProjections')
        .withIndex('by_accountRef_and_asset', (query) => query
          .eq('accountRef', funding.accountRef)
          .eq('asset', 'AUD'))
        .unique()
      if (projection === null) throw new Error('projection fixture missing')
      await ctx.db.patch(projection._id, { balanceUnits: '999999999' })
    })

    await expect(backend.mutation(postFundingSettlement, {
      ...funding,
      transactionRef: 'journal-transaction:funding:two',
      idempotencyKey: 'funding-settlement:two',
      inputDigest: `sha256:${'b'.repeat(64)}`,
      externalRef: 'pi_redacted_two',
      evidenceRefs: ['stripe-payment-intent:pi_redacted_two'],
      occurredAt: 2,
    })).resolves.toMatchObject({
      kind: 'refused',
      code: 'journal_reconciliation_required',
      retryable: false,
      caseRef: expect.stringMatching(/^reconciliation:/u),
    })

    await expect(backend.run(async (ctx) => ({
      customerAccount: await ctx.db.query('moneyLedgerAccounts')
        .withIndex('by_accountRef_and_asset_and_accountKind', (query) => query
          .eq('accountRef', funding.accountRef)
          .eq('asset', 'AUD')
          .eq('accountKind', 'customer_prepayment_liability'))
        .unique(),
      cases: await ctx.db.query('moneyReconciliationCases')
        .withIndex('by_accountRef_and_status_and_createdAt', (query) => query
          .eq('accountRef', funding.accountRef)
          .eq('status', 'open'))
        .collect(),
      transactions: await ctx.db.query('moneyLedgerTransactions').collect(),
    }))).resolves.toMatchObject({
      customerAccount: { state: 'locked' },
      cases: [expect.objectContaining({ kind: 'projection_mismatch', status: 'open' })],
      transactions: [expect.objectContaining({ transactionRef: funding.transactionRef })],
    })
  })
})

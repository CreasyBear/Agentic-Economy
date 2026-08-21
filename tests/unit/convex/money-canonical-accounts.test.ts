import { describe, expect, it } from 'vitest'

import {
  applyPreparedCanonicalMoneyAccount,
  prepareCanonicalMoneyAccount,
} from '../../../convex/moneyCanonicalAccounts'
import { accountRefForExternalLoss } from '../../../src/modules/money/public'

type Row = Record<string, unknown> & { _id: string; _creationTime: number }

type QueryBuilder = {
  eq: (field: string, value: unknown) => QueryBuilder
}

class MemoryDb {
  private readonly accounts: Row[] = []

  query(_table: string) {
    let accountRef: unknown
    const query = {
      withIndex: (_name: string, build: (builder: QueryBuilder) => QueryBuilder) => {
        const builder: QueryBuilder = {
          eq: (field, value) => {
            if (field === 'accountRef') accountRef = value
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () =>
        this.accounts.find((row) => row.accountRef === accountRef) ?? null,
    }
    return query
  }

  async insert(_table: string, value: Record<string, unknown>): Promise<string> {
    const id = `moneyAccounts:${this.accounts.length + 1}`
    this.accounts.push({
      ...value,
      _id: id,
      _creationTime: this.accounts.length + 1,
    })
    return id
  }

  async get(id: string): Promise<Row | null> {
    return this.accounts.find((row) => row._id === id) ?? null
  }

  rows(): Row[] {
    return [...this.accounts]
  }
}

function context(db: MemoryDb): Parameters<typeof prepareCanonicalMoneyAccount>[0] {
  return { db } as unknown as Parameters<typeof prepareCanonicalMoneyAccount>[0]
}

describe('canonical money accounts', () => {
  it('initializes only new operator credit accounts with an exact zero held total', async () => {
    const db = new MemoryDb()
    const operator = await prepareCanonicalMoneyAccount(
      context(db),
      {
        accountKind: 'operator_credit',
        accountId: 'owner:test',
        currency: 'USD',
        exponent: 2,
        now: 100,
      },
    )
    const provider = await prepareCanonicalMoneyAccount(
      context(db),
      {
        accountKind: 'provider_earnings',
        businessId: 'business:test',
        currency: 'USD',
        exponent: 2,
        now: 100,
      },
    )
    const rake = await prepareCanonicalMoneyAccount(
      context(db),
      {
        accountKind: 'ae_rake',
        currency: 'USD',
        exponent: 2,
        now: 100,
      },
    )
    const externalLoss = await prepareCanonicalMoneyAccount(
      context(db),
      {
        accountKind: 'ae_external_loss',
        currency: 'USD',
        exponent: 2,
        now: 100,
      },
    )

    expect(operator?.kind).toBe('insert')
    expect(provider?.kind).toBe('insert')
    expect(rake?.kind).toBe('insert')
    expect(externalLoss?.kind).toBe('insert')

    if (
      operator?.kind !== 'insert'
      || provider?.kind !== 'insert'
      || rake?.kind !== 'insert'
      || externalLoss?.kind !== 'insert'
    )
      throw new Error('expected_insert_previews')

    expect(operator.value).toMatchObject({ heldUnits: '0' })
    expect(provider.value).toMatchObject({ heldUnits: '0' })
    expect(rake.value).toMatchObject({ heldUnits: '0' })
    expect(accountRefForExternalLoss('USD')).toBe('ae:external-loss:USD')
    expect(externalLoss.value).toMatchObject({
      accountRef: 'ae:external-loss:USD',
      accountKind: 'ae_external_loss',
      currency: 'USD',
      exponent: 2,
      balanceUnits: '0',
      heldUnits: '0',
      recoveryDueUnits: '0',
      state: 'active',
    })
    expect(externalLoss.value).not.toHaveProperty('accountId')
    expect(externalLoss.value).not.toHaveProperty('businessId')

    await applyPreparedCanonicalMoneyAccount(context(db), operator)
    await applyPreparedCanonicalMoneyAccount(context(db), provider)
    await applyPreparedCanonicalMoneyAccount(context(db), rake)
    await applyPreparedCanonicalMoneyAccount(context(db), externalLoss)
    expect(db.rows()).toEqual([
      expect.objectContaining({ accountKind: 'operator_credit', heldUnits: '0' }),
      expect.objectContaining({ accountKind: 'provider_earnings', heldUnits: '0' }),
      expect.objectContaining({ accountKind: 'ae_rake', heldUnits: '0' }),
      expect.objectContaining({
        accountRef: 'ae:external-loss:USD',
        accountKind: 'ae_external_loss',
        state: 'active',
        balanceUnits: '0',
        heldUnits: '0',
        recoveryDueUnits: '0',
      }),
    ])

    const existingExternalLoss = db.rows().find(
      (row) => row.accountRef === 'ae:external-loss:USD',
    )
    if (existingExternalLoss === undefined) throw new Error('expected_external_loss_row')
    existingExternalLoss.balanceUnits = '250'

    const replay = await prepareCanonicalMoneyAccount(
      context(db),
      {
        accountKind: 'ae_external_loss',
        currency: 'USD',
        exponent: 2,
        now: 999,
      },
    )
    expect(replay?.kind).toBe('existing')
    expect(replay).toMatchObject({
      kind: 'existing',
      row: expect.objectContaining({ accountRef: 'ae:external-loss:USD' }),
    })
  })
})

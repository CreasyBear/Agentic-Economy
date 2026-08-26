import { describe, expect, it } from 'vitest'

import {
  listCreditActivityHandler,
  readKeyUsageHandler,
} from '../../../convex/moneyCreditReads'
import type { CreditActivityView, KeyUsageView } from '../../../src/modules/money/public'

type Row = Record<string, unknown> & { _id: string }
type Filter = { op: 'eq'; field: string; value: unknown }
type PaginationOpts = { numItems: number; cursor: string | null }

type ActivityArgs = {
  principalId: string
  credentialId: string
  currency: string
  paginationOpts: PaginationOpts
}
type KeyUsageArgs = {
  principalId: string
  credentialId: string
  currency: string
}

type ActivityResult = {
  kind: 'ok'
  page: CreditActivityView[]
  isDone: boolean
  continueCursor: string
}
type KeyUsageResult = { kind: 'ok' } & KeyUsageView

type QueryContext = {
  db: TestDb
  auth: { getUserIdentity: () => Promise<{ tokenIdentifier: string }> }
}

const activityHandler = listCreditActivityHandler as unknown as (
  ctx: QueryContext,
  args: ActivityArgs,
) => Promise<ActivityResult>
const keyUsageHandler = readKeyUsageHandler as unknown as (
  ctx: QueryContext,
  args: KeyUsageArgs,
) => Promise<KeyUsageResult>

class IndexBuilder {
  readonly filters: Filter[] = []

  eq(field: string, value: unknown): this {
    this.filters.push({ op: 'eq', field, value })
    return this
  }
}

class TestQuery {
  private readonly descending: boolean

  constructor(
    private readonly db: TestDb,
    private readonly tableName: string,
    private readonly indexName?: string,
    private readonly filters: readonly Filter[] = [],
    descending = false,
  ) {
    this.descending = descending
  }

  withIndex(indexName: string, callback: (query: IndexBuilder) => IndexBuilder): TestQuery {
    const builder = new IndexBuilder()
    callback(builder)
    return new TestQuery(this.db, this.tableName, indexName, builder.filters, this.descending)
  }

  order(direction: 'asc' | 'desc'): TestQuery {
    return new TestQuery(this.db, this.tableName, this.indexName, this.filters, direction === 'desc')
  }

  async paginate(options: PaginationOpts): Promise<{ page: Row[]; isDone: boolean; continueCursor: string }> {
    const rows = this.rows()
    const start = options.cursor === null ? 0 : Number(options.cursor)
    const end = Math.min(start + options.numItems, rows.length)
    return { page: rows.slice(start, end), isDone: end >= rows.length, continueCursor: String(end) }
  }

  async unique(): Promise<Row | null> {
    const row = this.rows()[0]
    return row ?? null
  }

  private rows(): Row[] {
    return this.db
      .table(this.tableName)
      .filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
      .sort((left, right) => compareRows(left, right, this.indexName, this.descending))
  }
}

class TestDb {
  readonly queriedTables: string[] = []

  constructor(private readonly rows: readonly Row[]) {}

  query(tableName: string): TestQuery {
    this.queriedTables.push(tableName)
    return new TestQuery(this, tableName)
  }

  table(tableName: string): Row[] {
    return this.rows.filter((row) => row._id.startsWith(`${tableName}:`))
  }
}

function compareRows(left: Row, right: Row, indexName: string | undefined, descending: boolean): number {
  const fields = indexName?.includes('currency')
    ? ['principalId', 'credentialId', 'currency', 'observedAt']
    : ['principalId', 'credentialId', 'observedAt']
  for (const field of fields) {
    const result = String(left[field] ?? '').localeCompare(String(right[field] ?? ''))
    if (result !== 0) return descending ? -result : result
  }
  return descending ? -left._id.localeCompare(right._id) : left._id.localeCompare(right._id)
}

function activityRow(input: Readonly<{ id: number; credentialId: string; currency: string }>): Row {
  return {
    _id: `moneyUsageEvents:${input.id}`,
    usageRef: `usage:${input.id}`,
    principalId: 'principal:test',
    credentialId: input.credentialId,
    currency: input.currency,
    serviceRef: 'service:test',
    offeringRef: 'offering:test',
    businessId: 'business:test',
    invocationRef: `invocation:${input.id}`,
    attemptRef: `attempt:${input.id}`,
    operationKey: `operation:${input.id}`,
    priceDigest: 'price:test',
    amountUnits: String(input.id),
    exponent: 2,
    chargeState: 'paid',
    observedAt: input.id,
  }
}

function context(rows: readonly Row[]): QueryContext {
  return { db: new TestDb(rows), auth: { getUserIdentity: async () => ({ tokenIdentifier: 'principal:test' }) } }
}

describe('Convex native money queries', () => {
  it('uses the exact compound activity index and one native page', async () => {
    const result = await activityHandler(context([activityRow({ id: 1, credentialId: 'credential:one', currency: 'USD' }), activityRow({ id: 2, credentialId: 'credential:two', currency: 'USD' })]), { principalId: 'principal:test', credentialId: 'credential:one', currency: 'USD', paginationOpts: { numItems: 50, cursor: null } })
    expect(result).toMatchObject({ kind: 'ok', isDone: true })
    expect(result.page).toHaveLength(1)
    expect(result.page[0]).toMatchObject({ activityRef: 'usage:1', credentialId: 'credential:one', grossAmount: { currency: 'USD', units: '1', exponent: 2 } })
  })

  it('reads one exact usage summary and returns canonical zero when absent', async () => {
    const summary: Row = {
      _id: 'moneyCredentialUsageSummaries:one',
      principalId: 'principal:test',
      credentialId: 'credential:one',
      currency: 'USD',
      exponent: 2,
      callCount: 2,
      paidCallCount: 1,
      freeCallCount: 1,
      grossSpendUnits: '500',
      states: ['paid', 'free_tier'],
      updatedAt: 2,
    }
    const source = context([summary, activityRow({ id: 1, credentialId: 'credential:one', currency: 'USD' })])
    await expect(keyUsageHandler(source, { principalId: 'principal:test', credentialId: 'credential:one', currency: 'USD' })).resolves.toMatchObject({ credentialId: 'credential:one', callCount: 2, grossSpend: { currency: 'USD', units: '500', exponent: 2 } })
    expect(source.db.queriedTables).not.toContain('moneyUsageEvents')
    const account: Row = {
      _id: 'moneyAccounts:operator',
      accountRef: 'account:test',
      accountKind: 'operator_credit',
      accountId: 'owner:test',
      currency: 'USD',
      exponent: 2,
      balanceUnits: '0',
      version: 0,
      state: 'active',
      createdAt: 1,
      updatedAt: 1,
    }
    const principal: Row = {
      _id: 'agentAccessPrincipals:test',
      principalId: 'principal:test',
      ownerId: 'owner:test',
    }
    await expect(keyUsageHandler(context([principal, account]), { principalId: 'principal:test', credentialId: 'credential:new', currency: 'USD' })).resolves.toEqual({ kind: 'ok', credentialId: 'credential:new', callCount: 0, paidCallCount: 0, freeCallCount: 0, grossSpend: { currency: 'USD', units: '0', exponent: 2 }, states: [] })
  })
})

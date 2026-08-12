import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../convex/sourceWriteAdmission', () => ({
  sourceWriteArgs: {},
  requireSourceWrite: vi.fn(async () => ({ kind: 'accepted' as const })),
}))
vi.mock('../../../src/modules/money/public', async () => {
  const actual = await vi.importActual('../../../src/modules/money/public')
  return {
    ...actual,
    evaluateLiveMoneyGate: () => ({
      kind: 'accepted' as const,
      policyId: 'test-money-policy',
    }),
  }
})

import {
  bindConnectAccount,
  beginPayoutTransfer,
  completePayoutTransfer,
  finalizeConnectAccount,
  reserveConnectAccount,
  reconcilePayoutTransfer,
  markPayoutTransferOutcomeUnknown,
  recordConnectAccountEvent,
} from '../../../convex/moneyLedger'

type Row = Record<string, unknown> & { _id: string }
type QueryBuilder = { eq: (field: string, value: unknown) => QueryBuilder }
type Query = {
  withIndex: (
    name: string,
    build: (query: QueryBuilder) => QueryBuilder,
  ) => Query
  order: (direction: 'asc' | 'desc') => Query
  unique: () => Promise<Row | null>
  collect: () => Promise<Row[]>
  take: (limit: number) => Promise<Row[]>
}

class MemoryDb {
  private readonly tables = new Map<string, Row[]>()

  constructor(private readonly maxLedgerCollectRows = Number.POSITIVE_INFINITY) {}

  seed(table: string, row: Row): void {
    this.tables.set(table, [...(this.tables.get(table) ?? []), row])
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  query(table: string): Query {
    const filters: Array<(row: Row) => boolean> = []
    let orderDirection: 'asc' | 'desc' | undefined
    const matches = () => {
      const rows = (this.tables.get(table) ?? []).filter((row) =>
        filters.every((filter) => filter(row)),
      )
      if (orderDirection === undefined) return rows
      return rows.sort((left, right) => {
        const leftUpdatedAt =
          typeof left.updatedAt === 'number' ? left.updatedAt : 0
        const rightUpdatedAt =
          typeof right.updatedAt === 'number' ? right.updatedAt : 0
        return orderDirection === 'asc'
          ? leftUpdatedAt - rightUpdatedAt
          : rightUpdatedAt - leftUpdatedAt
      })
    }
    const query: Query = {
      withIndex: (_name, build) => {
        const builder: QueryBuilder = {
          eq: (field, value) => {
            filters.push((row) => row[field] === value)
            return builder
          },
        }
        build(builder)
        return query
      },
      order: (direction) => {
        orderDirection = direction
        return query
      },
      unique: async () => {
        const rows = matches()
        if (rows.length > 1) throw new Error('expected_unique')
        return rows[0] ?? null
      },
      collect: async () => {
        const rows = matches()
        if (
          table === 'moneyLedgerEntries' &&
          rows.length > this.maxLedgerCollectRows
        )
          throw new Error('unbounded_ledger_read')
        return rows
      },
      take: async (limit) => matches().slice(0, limit),
    }
    return query
  }

  async insert(table: string, value: Record<string, unknown>): Promise<string> {
    const id = `${table}:${(this.tables.get(table) ?? []).length + 1}`
    this.seed(table, { ...value, _id: id })
    return id
  }

  async get(id: string): Promise<Row | null> {
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row !== undefined) return row
    }
    return null
  }

  async patch(
    idOrTable: string,
    valueOrId: Record<string, unknown> | string,
    maybeValue?: Record<string, unknown>,
  ): Promise<void> {
    const id = maybeValue === undefined ? idOrTable : valueOrId
    const value = maybeValue === undefined ? valueOrId : maybeValue
    if (typeof id !== 'string' || typeof value !== 'object' || value === null)
      throw new Error('invalid_patch')
    const row = await this.get(id)
    if (row === null) throw new Error(`missing_row:${id}`)
    for (const [key, next] of Object.entries(value)) {
      if (next === undefined) delete row[key]
      else row[key] = next
    }
  }

  async replace(
    table: string,
    id: string,
    value: Record<string, unknown>,
  ): Promise<void> {
    const rows = this.tables.get(table) ?? []
    const index = rows.findIndex((row) => row._id === id)
    if (index === -1) throw new Error(`missing_row:${id}`)
    rows[index] = { ...value, _id: id }
    this.tables.set(table, rows)
  }
}

type Handler = (
  ctx: {
    db: MemoryDb
    auth: {
      getUserIdentity: () => Promise<{ tokenIdentifier: string } | null>
    }
  },
  args: Record<string, unknown>,
) => Promise<unknown>
type HandlerExport = { _handler: Handler }
const begin = (beginPayoutTransfer as unknown as HandlerExport)._handler
const complete = (completePayoutTransfer as unknown as HandlerExport)._handler
const reconcile = (reconcilePayoutTransfer as unknown as HandlerExport)._handler
const markUnknown = (
  markPayoutTransferOutcomeUnknown as unknown as HandlerExport
)._handler
const reserveConnect = (reserveConnectAccount as unknown as HandlerExport)
  ._handler
const finalizeConnect = (finalizeConnectAccount as unknown as HandlerExport)
  ._handler
const bindConnect = (bindConnectAccount as unknown as HandlerExport)._handler
const connect = (recordConnectAccountEvent as unknown as HandlerExport)._handler

const sourceArgs = {
  operationKey: 'money:test',
  correlationId: 'money:test:1',
}
const amount = { currency: 'USD', units: '5000', exponent: 2 }
const identity = {
  getUserIdentity: async () => ({ tokenIdentifier: 'principal:test' }),
}

function seedPayout(
  db: MemoryDb,
  state:
    | 'held_threshold'
    | 'transfer_pending'
    | 'outcome_unknown' = 'held_threshold',
): void {
  db.seed('moneyAccounts', {
    _id: 'moneyAccounts:1',
    accountRef: 'provider:business-1:USD',
    accountKind: 'provider_earnings',
    businessId: 'business-1',
    currency: 'USD',
    exponent: 2,
    balanceUnits: '5000',
    version: 1,
    state: 'active',
    createdAt: 1,
    updatedAt: 1,
  })
  db.seed('moneyPayoutAccounts', {
    _id: 'moneyPayoutAccounts:1',
    businessId: 'business-1',
    currency: 'USD',
    exponent: 2,
    stripeAccountId: 'acct_1',
    state: 'ready',
    detailsSubmitted: true,
    recipientCapabilityActive: true,
    requirementsDigest: 'sha256:req',
    version: 1,
    createdAt: 1,
    updatedAt: 1,
  })
  db.seed('moneyPayouts', {
    _id: 'moneyPayouts:1',
    payoutRef: 'payout-1',
    businessId: 'business-1',
    currency: 'USD',
    exponent: 2,
    grossAccrualUnits: '5500',
    rakeUnits: '500',
    providerNetUnits: '5000',
    minimumPayoutUnits: '1000',
    state,
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    idempotencyKey: 'payout-old',
    createdAt: 1,
    updatedAt: 1,
  })
}

function commandArgs(): Record<string, unknown> {
  return {
    authority: { principalId: 'principal:test' },
    businessId: 'business-1',
    amount,
    providerAccountRef: 'provider:business-1:USD',
    destinationAccountId: 'acct_1',
    payoutRef: 'payout-1',
    commandId: 'command-1',
    inputDigest: 'sha256:input-1',
    requestDigest: 'sha256:request-1',
    idempotencyKey: 'payout-idempotency-1',
    providerRecoveryDeadlineAt: 82_800_010,
    observedAt: 10,
    ...sourceArgs,
  }
}

function evidence(
  status: 'succeeded' | 'failed' | 'reversed' | 'outcome_unknown' | 'pending',
  digest = 'sha256:evidence-1',
): Record<string, unknown> {
  return {
    provider: 'stripe',
    transferId: 'tr_1',
    destinationAccountId: 'acct_1',
    amount,
    status,
    requestDigest: 'sha256:request-1',
    evidenceDigest: digest,
    observedAt: 11,
  }
}

describe('Convex payout persistence', () => {
  it('begins without debiting, debits once on verified success, and replays exactly', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const before = db.rows('moneyAccounts')[0]?.balanceUnits
    const args = commandArgs()
    await expect(begin({ db, auth: identity }, args)).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'transfer_pending' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe(before)
    const completeArgs = {
      ...args,
      transactionRef: 'transaction-1',
      sourceDigest: 'sha256:source-1',
      evidenceRefs: ['stripe:transfer:tr_1'],
      evidence: evidence('succeeded'),
    }
    await expect(
      complete({ db, auth: identity }, completeArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'paid', transferStatus: 'succeeded' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('0')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
    await expect(
      complete({ db, auth: identity }, completeArgs),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'paid' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('0')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
  })
  it('uses the latest payout snapshot when ledger history exceeds the bounded read', async () => {
    const db = new MemoryDb(1_000)
    seedPayout(db)
    db.seed('moneyPayouts', {
      _id: 'moneyPayouts:prior',
      payoutRef: 'payout-prior',
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '7700',
      rakeUnits: '700',
      providerNetUnits: '7000',
      minimumPayoutUnits: '1000',
      state: 'paid',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      payoutCommandId: 'command-prior',
      inputDigest: 'sha256:input-prior',
      transferRequestDigest: 'sha256:request-prior',
      transferEvidenceDigest: 'sha256:evidence-prior',
      transferStatus: 'succeeded',
      stripeTransferId: 'tr_prior',
      providerHeldBeforeUnits: '12000',
      providerHeldAfterUnits: '5000',
      providerPaidBeforeUnits: '0',
      providerPaidAfterUnits: '7000',
      idempotencyKey: 'payout-prior-idempotency',
      createdAt: 1,
      updatedAt: 2,
    })
    for (let index = 0; index <= 1_000; index += 1) {
      db.seed('moneyLedgerEntries', {
        _id: `moneyLedgerEntries:history-${index}`,
        entryRef: `history-${index}`,
        accountRef: 'provider:business-1:USD',
        entryType: 'charge',
        direction: 'debit',
        amountUnits: '1',
        currency: 'USD',
        exponent: 2,
        transactionRef: `history-transaction-${index}`,
        idempotencyKey: `history-idempotency-${index}`,
        sourceDigest: `sha256:history-${index}`,
        evidenceRefs: [],
        createdAt: index,
      })
    }
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    await expect(
      complete(
        { db, auth: identity },
        {
          ...args,
          transactionRef: 'transaction-snapshot',
          sourceDigest: 'sha256:source-snapshot',
          evidenceRefs: ['stripe:transfer:tr_1'],
          evidence: evidence('succeeded'),
        },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'paid',
        providerPaidBefore: { currency: 'USD', units: '7000', exponent: 2 },
        providerPaidAfter: { currency: 'USD', units: '12000', exponent: 2 },
      },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('0')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1_002)
  })

  it('fails closed when the latest payout snapshot has a mismatched exponent', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    db.seed('moneyPayouts', {
      _id: 'moneyPayouts:prior',
      payoutRef: 'payout-prior',
      businessId: 'business-1',
      currency: 'USD',
      exponent: 3,
      grossAccrualUnits: '77000',
      rakeUnits: '7000',
      providerNetUnits: '70000',
      minimumPayoutUnits: '10000',
      state: 'paid',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      payoutCommandId: 'command-prior',
      inputDigest: 'sha256:input-prior',
      transferRequestDigest: 'sha256:request-prior',
      transferEvidenceDigest: 'sha256:evidence-prior',
      transferStatus: 'succeeded',
      stripeTransferId: 'tr_prior',
      providerHeldBeforeUnits: '120000',
      providerHeldAfterUnits: '50000',
      providerPaidBeforeUnits: '0',
      providerPaidAfterUnits: '70000',
      idempotencyKey: 'payout-prior-idempotency',
      createdAt: 1,
      updatedAt: 2,
    })
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    await expect(
      complete(
        { db, auth: identity },
        {
          ...args,
          transactionRef: 'transaction-mismatched-snapshot',
          sourceDigest: 'sha256:source-mismatched-snapshot',
          evidenceRefs: ['stripe:transfer:tr_1'],
          evidence: evidence('succeeded'),
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('5000')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(0)
  })

  it('reverses a paid transfer once, restores payable balance, and rejects conflicting evidence', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    const successArgs = {
      ...args,
      transactionRef: 'transaction-1',
      sourceDigest: 'sha256:source-1',
      evidenceRefs: ['stripe:transfer:tr_1'],
      evidence: evidence('succeeded'),
    }
    await expect(
      complete({ db, auth: identity }, successArgs),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'paid' } })
    const reversalArgs = {
      ...successArgs,
      transactionRef: 'transaction-reversal-1',
      sourceDigest: 'sha256:source-reversal-1',
      evidenceRefs: ['stripe:transfer-reversed:tr_1'],
      evidence: evidence('reversed', 'sha256:evidence-reversal-1'),
    }
    await expect(
      complete({ db, auth: identity }, reversalArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'reversed',
        transferStatus: 'reversed',
        evidenceDigest: 'sha256:evidence-reversal-1',
        reversalEvidenceDigest: 'sha256:evidence-reversal-1',
      },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('5000')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')[1]).toMatchObject({
      direction: 'credit',
      entryType: 'payout_accrual',
      reversalOf: 'transaction-1',
    })
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyTransactions')[0]).toMatchObject({
      transactionRef: 'transaction-1',
      state: 'reversed',
    })
    await expect(
      complete({ db, auth: identity }, reversalArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'reversed' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('5000')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    await expect(
      complete(
        { db, auth: identity },
        {
          ...reversalArgs,
          evidence: evidence('reversed', 'sha256:evidence-conflict'),
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
  })
  it('conserves net provider-paid snapshots after a reversal before the next payout', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    const first = {
      ...args,
      transactionRef: 'transaction-1',
      sourceDigest: 'sha256:source-1',
      evidenceRefs: ['stripe:transfer:tr_1'],
      evidence: evidence('succeeded'),
    }
    await complete({ db, auth: identity }, first)
    await complete(
      { db, auth: identity },
      {
        ...first,
        transactionRef: 'transaction-reversal-1',
        sourceDigest: 'sha256:source-reversal-1',
        evidenceRefs: ['stripe:transfer-reversed:tr_1'],
        evidence: evidence('reversed', 'sha256:evidence-reversal-1'),
      },
    )
    db.seed('moneyPayouts', {
      _id: 'moneyPayouts:2',
      payoutRef: 'payout-2',
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      grossAccrualUnits: '5500',
      rakeUnits: '500',
      providerNetUnits: '5000',
      minimumPayoutUnits: '1000',
      state: 'held_threshold',
      periodStart: '2026-08-01',
      periodEnd: '2026-08-31',
      idempotencyKey: 'payout-old-2',
      createdAt: 2,
      updatedAt: 2,
    })
    const second = {
      ...args,
      payoutRef: 'payout-2',
      commandId: 'command-2',
      inputDigest: 'sha256:input-2',
      requestDigest: 'sha256:request-2',
      idempotencyKey: 'payout-idempotency-2',
      transactionRef: 'transaction-2',
      sourceDigest: 'sha256:source-2',
      evidenceRefs: ['stripe:transfer:tr_2'],
      evidence: {
        ...evidence('succeeded', 'sha256:evidence-2'),
        requestDigest: 'sha256:request-2',
        transferId: 'tr_2',
      },
    }
    await expect(begin({ db, auth: identity }, second)).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'transfer_pending' },
    })
    await expect(
      complete({ db, auth: identity }, second),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'paid',
        providerPaidBefore: { currency: 'USD', units: '0', exponent: 2 },
        providerPaidAfter: { currency: 'USD', units: '5000', exponent: 2 },
      },
    })
    expect(db.rows('moneyLedgerEntries')).toHaveLength(3)
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('0')
  })

  it('returns failed transfers to held with no debit and rejects changed evidence', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    const completeArgs = {
      ...args,
      transactionRef: 'transaction-1',
      sourceDigest: 'sha256:source-1',
      evidenceRefs: ['stripe:transfer:tr_1'],
      evidence: evidence('failed'),
    }
    await expect(
      complete({ db, auth: identity }, completeArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold', transferStatus: 'failed' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('5000')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(0)
    await expect(
      complete(
        { db, auth: identity },
        { ...completeArgs, evidence: evidence('failed', 'sha256:other') },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
  })

  it('reconciles unknown not-released evidence back to held without a debit', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    await complete(
      { db, auth: identity },
      {
        ...args,
        transactionRef: 'transaction-1',
        sourceDigest: 'sha256:source-1',
        evidenceRefs: ['stripe:transfer:tr_1'],
        evidence: evidence('outcome_unknown'),
      },
    )
    expect(db.rows('moneyPayouts')[0]?.state).toBe('outcome_unknown')
    await expect(
      reconcile(
        { db, auth: identity },
        {
          ...args,
          transactionRef: 'transaction-1',
          sourceDigest: 'sha256:source-1',
          evidenceRefs: ['stripe:transfer:tr_1'],
          evidence: evidence('failed'),
          outcome: 'not_released',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('5000')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(0)
  })
  it('reconciles server-authenticated zero-match evidence without a transfer ID and replays', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    const completeArgs = {
      ...args,
      transactionRef: 'transaction-empty-1',
      sourceDigest: 'sha256:source-empty-1',
      evidenceRefs: ['sha256:group-empty'],
      evidence: {
        provider: 'stripe' as const,
        resolution: 'not_released' as const,
        destinationAccountId: 'acct_1',
        amount,
        status: 'failed' as const,
        requestDigest: 'sha256:request-1',
        evidenceDigest: 'sha256:group-empty',
        observedAt: 11,
      },
      outcome: 'not_released' as const,
    }
    await expect(
      reconcile({ db, auth: identity }, completeArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'held_threshold',
        transferStatus: 'failed',
      },
    })
    expect(db.rows('moneyPayouts')[0]).not.toHaveProperty('stripeTransferId')
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('5000')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(0)
    await expect(
      reconcile({ db, auth: identity }, completeArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold' },
    })
    expect(db.rows('moneyPayouts')[0]).not.toHaveProperty('stripeTransferId')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(0)
  })

  it('persists an ambiguous transfer without inventing a Stripe ID and blocks a new command', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    await expect(
      markUnknown(
        { db, auth: identity },
        { ...args, failureCode: 'payout_outcome_unknown', observedAt: 11 },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'outcome_unknown',
        transferStatus: 'outcome_unknown',
        providerRecoveryDeadlineAt: 82_800_010,
      },
    })
    expect(db.rows('moneyPayouts')[0]).not.toHaveProperty('stripeTransferId')
    await expect(
      begin(
        { db, auth: identity },
        {
          ...args,
          commandId: 'command-2',
          inputDigest: 'sha256:input-2',
          requestDigest: 'sha256:request-2',
          idempotencyKey: 'payout-idempotency-2',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
  })

  it('finalizes a successful Connect account atomically with its payout binding', async () => {
    const db = new MemoryDb()
    const args = {
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      commandRef: 'connect-command-success',
      inputDigest: 'sha256:connect-input-success',
      providerRequestDigest: 'sha256:connect-request-success',
      recoveryLeaseOwner: 'lease-success',
      idempotencyKey: 'connect-idempotency-success',
      ...sourceArgs,
    }
    await reserveConnect({ db, auth: identity }, args)
    const outcome = {
      state: 'succeeded' as const,
      stripeAccountId: 'acct_success',
      providerEvidenceRef: 'evidence:success',
    }
    await expect(
      finalizeConnect(
        { db, auth: identity },
        { ...args, recoveryLeaseGeneration: 1, outcome },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      command: {
        state: 'succeeded',
        stripeAccountId: 'acct_success',
        providerEvidenceRef: 'evidence:success',
      },
    })
    expect(db.rows('moneyPayoutAccounts')).toEqual([
      expect.objectContaining({
        businessId: 'business-1',
        currency: 'USD',
        stripeAccountId: 'acct_success',
        state: 'onboarding_started',
      }),
    ])
    await expect(
      finalizeConnect(
        { db, auth: identity },
        { ...args, recoveryLeaseGeneration: 1, outcome },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      command: { state: 'succeeded' },
    })
  })

  it('reacquires an expired Connect lease before the deadline and fences stale finalizers', async () => {
    const db = new MemoryDb()
    const args = {
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      commandRef: 'connect-command-1',
      inputDigest: 'sha256:connect-input-1',
      providerRequestDigest: 'sha256:connect-request-1',
      recoveryLeaseOwner: 'lease-1',
      idempotencyKey: 'connect-idempotency-1',
      ...sourceArgs,
    }
    await expect(
      reserveConnect({ db, auth: identity }, args),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: true,
      command: {
        state: 'pending',
        commandRef: args.commandRef,
        recoveryLeaseGeneration: 1,
      },
    })
    await expect(
      reserveConnect({ db, auth: identity }, args),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: false,
      command: {
        state: 'pending',
        recoveryLeaseGeneration: 1,
        recoveryLeaseOwner: 'lease-1',
      },
    })
    await expect(
      reserveConnect(
        { db, auth: identity },
        {
          ...args,
          commandRef: 'connect-command-2',
          inputDigest: 'sha256:connect-input-2',
          idempotencyKey: 'connect-idempotency-2',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })

    const original = db.rows('moneyConnectAccountCommands')[0]
    if (original === undefined) throw new Error('missing_connect_command')
    await db.patch(original._id, { recoveryLeaseExpiresAt: 0 })
    const recoveredArgs = { ...args, recoveryLeaseOwner: 'lease-2' }
    await expect(
      reserveConnect({ db, auth: identity }, recoveredArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: true,
      command: {
        state: 'pending',
        recoveryLeaseGeneration: 2,
        recoveryLeaseOwner: 'lease-2',
      },
    })

    await expect(
      finalizeConnect(
        { db, auth: identity },
        {
          ...args,
          recoveryLeaseGeneration: 1,
          outcome: {
            state: 'succeeded',
            stripeAccountId: 'acct_stale',
            providerEvidenceRef: 'evidence:stale',
          },
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
    expect(db.rows('moneyConnectAccountCommands')[0]).toMatchObject({
      state: 'pending',
      recoveryLeaseGeneration: 2,
      recoveryLeaseOwner: 'lease-2',
    })
    expect(db.rows('moneyPayoutAccounts')).toHaveLength(0)
    await db.patch(original._id, {
      stripeAccountId: 'acct_retained',
      providerEvidenceRef: 'evidence:retained',
    })
    const unknownResult = await finalizeConnect(
      { db, auth: identity },
      {
        ...recoveredArgs,
        recoveryLeaseGeneration: 2,
        outcome: {
          state: 'outcome_unknown',
          failureCode: 'payout_outcome_unknown',
          failureRetryable: false,
        },
      },
    )
    expect(unknownResult).toEqual({
      kind: 'accepted',
      execute: false,
      command: expect.objectContaining({
        state: 'outcome_unknown',
        stripeAccountId: 'acct_retained',
        providerEvidenceRef: 'evidence:retained',
      }),
    })
    expect(db.rows('moneyConnectAccountCommands')[0]).toMatchObject({
      state: 'outcome_unknown',
      stripeAccountId: 'acct_retained',
    })
    expect(db.rows('moneyConnectAccountCommands')[0]).not.toHaveProperty(
      'recoveryLeaseOwner',
    )

    const nextRecoveryArgs = { ...args, recoveryLeaseOwner: 'lease-3' }
    await expect(
      reserveConnect({ db, auth: identity }, nextRecoveryArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: true,
      command: {
        state: 'pending',
        recoveryLeaseGeneration: 3,
        recoveryLeaseOwner: 'lease-3',
        stripeAccountId: 'acct_retained',
      },
    })
    await expect(
      reserveConnect(
        { db, auth: identity },
        { ...args, recoveryLeaseOwner: 'lease-4' },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: false,
      command: {
        state: 'pending',
        recoveryLeaseGeneration: 3,
        recoveryLeaseOwner: 'lease-3',
      },
    })

    const current = db.rows('moneyConnectAccountCommands')[0]
    if (current === undefined)
      throw new Error('missing_recovered_connect_command')
    await db.patch(current._id, { providerRecoveryDeadlineAt: 0 })
    await expect(
      reserveConnect({ db, auth: identity }, nextRecoveryArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      execute: false,
      command: {
        state: 'outcome_unknown',
        failureCode: 'payout_reconciliation_required',
        stripeAccountId: 'acct_retained',
      },
    })
    await expect(
      reserveConnect(
        { db, auth: identity },
        {
          ...args,
          commandRef: 'connect-command-3',
          inputDigest: 'sha256:connect-input-3',
          idempotencyKey: 'connect-idempotency-3',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })

    const identityDb = new MemoryDb()
    const identityArgs = {
      businessId: 'business-identity',
      currency: 'USD',
      exponent: 2,
      commandRef: 'connect-command-identity',
      inputDigest: 'sha256:connect-input-identity',
      providerRequestDigest: 'sha256:connect-request-identity',
      recoveryLeaseOwner: 'lease-identity',
      idempotencyKey: 'connect-idempotency-identity',
      ...sourceArgs,
    }
    await reserveConnect({ db: identityDb, auth: identity }, identityArgs)
    identityDb.seed('moneyPayoutAccounts', {
      _id: 'moneyPayoutAccounts:identity',
      businessId: 'business-identity',
      currency: 'USD',
      exponent: 2,
      stripeAccountId: 'acct_existing',
      state: 'onboarding_started',
      detailsSubmitted: false,
      recipientCapabilityActive: false,
      requirementsDigest: 'sha256:req',
      createdAt: 1,
      updatedAt: 1,
    })
    await expect(
      finalizeConnect(
        { db: identityDb, auth: identity },
        {
          ...identityArgs,
          recoveryLeaseGeneration: 1,
          outcome: {
            state: 'succeeded',
            stripeAccountId: 'acct_conflict',
            providerEvidenceRef: 'evidence:conflict',
          },
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    await expect(
      reserveConnect({ db: identityDb, auth: identity }, identityArgs),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payment_binding_invalid',
    })
  })
  it('admits a verified account event once and refuses replay conflicts and stale downgrade', async () => {
    const db = new MemoryDb()
    db.seed('moneyPayoutAccounts', {
      _id: 'moneyPayoutAccounts:1',
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      stripeAccountId: 'acct_1',
      state: 'onboarding_started',
      detailsSubmitted: false,
      recipientCapabilityActive: false,
      requirementsDigest: 'sha256:req',
      version: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    const base = {
      businessId: 'business-1',
      currency: 'USD',
      exponent: 2,
      event: {
        kind: 'account',
        stripeEventId: 'evt_1',
        eventType: 'account.updated',
        externalRef: 'acct_1',
        stripeAccountId: 'acct_1',
        providerObjectDigest: 'sha256:v1-object-1',
        payloadDigest: 'sha256:event-1',
        observedAt: 10,
      },
      readback: {
        detailsSubmitted: true,
        recipientCapabilityActive: true,
        restricted: false,
        requirementsDigest: 'sha256:req-2',
        providerObjectDigest: 'sha256:v2-object-1',
        observedAt: 10,
      },
      expectedVersion: 0,
      operationKey: 'money:connect',
      correlationId: 'money:connect:1',
      sourceWriteRequest: {
        method: 'POST',
        initiatorOrigin: 'https://example.test',
        targetOrigin: 'https://example.test',
        targetPath: '/stripe',
        targetQuery: '',
        bodyDigest: 'sha256:body',
      },
    }
    await expect(connect({ db, auth: identity }, base)).resolves.toMatchObject({
      kind: 'accepted',
      account: { state: 'ready', lastStripeEventId: 'evt_1', version: 1 },
    })
    await expect(connect({ db, auth: identity }, base)).resolves.toMatchObject({
      kind: 'accepted',
      account: { state: 'ready', version: 1 },
    })

    await expect(
      connect(
        { db, auth: identity },
        {
          ...base,
          event: { ...base.event, payloadDigest: 'sha256:event-other' },
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
    })
    await expect(
      connect(
        { db, auth: identity },
        {
          ...base,
          expectedVersion: 1,
          event: {
            ...base.event,
            stripeEventId: 'evt_0',
            payloadDigest: 'sha256:event-0',
            providerObjectDigest: 'sha256:object-0',
            observedAt: 9,
          },
          readback: {
            ...base.readback,
            providerObjectDigest: 'sha256:object-0',
          },
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
  })

  it('refuses to bind one Stripe account to two owner payout accounts', async () => {
    const db = new MemoryDb()
    db.seed('moneyPayoutAccounts', {
      _id: 'moneyPayoutAccounts:other',
      businessId: 'business-other',
      currency: 'USD',
      exponent: 2,
      stripeAccountId: 'acct_shared',
      state: 'onboarding_started',
      detailsSubmitted: false,
      recipientCapabilityActive: false,
      requirementsDigest: 'sha256:req',
      version: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    await expect(
      bindConnect(
        { db, auth: identity },
        {
          businessId: 'business-1',
          currency: 'USD',
          exponent: 2,
          stripeAccountId: 'acct_shared',
          observedAt: 10,
          ...sourceArgs,
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payment_binding_invalid',
    })
  })
})

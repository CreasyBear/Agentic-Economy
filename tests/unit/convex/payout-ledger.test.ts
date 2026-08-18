import { describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'

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
  readOwnerPayoutTransfer,
  readOwnerProviderEarnings,
  readPayoutStatus,
  reserveConnectAccount,
  reconcilePayoutTransfer,
  markPayoutTransferOutcomeUnknown,
  recordConnectAccountEvent,
  runDailySupplierSettlement,
} from '../../../convex/moneyLedger'
import { STRIPE_TRANSFER_RECOVERY_WINDOW_MS } from '../../../src/modules/money/public'

type Row = Record<string, unknown> & { _id: string }
type QueryBuilder = { eq: (field: string, value: unknown) => QueryBuilder }
type Query = {
  withIndex: (
    name: string,
    build: (query: QueryBuilder) => QueryBuilder,
  ) => Query
  order: (direction: 'asc' | 'desc') => Query
  unique: () => Promise<Row | null>
  first: () => Promise<Row | null>
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
      first: async () => matches()[0] ?? null,
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
      getUserIdentity: () => Promise<{ tokenIdentifier: string; subject?: string } | null>
    }
  },
  args: Record<string, unknown>,
) => Promise<unknown>
type HandlerExport = { _handler: Handler }
const begin = (beginPayoutTransfer as unknown as HandlerExport)._handler
const dailySettle = (runDailySupplierSettlement as unknown as HandlerExport)
  ._handler
const readOwnerTransfer = (
  readOwnerPayoutTransfer as unknown as HandlerExport
)._handler
const readStatus = (readPayoutStatus as unknown as HandlerExport)._handler
const readOwnerEarnings = (
  readOwnerProviderEarnings as unknown as HandlerExport
)._handler
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
const ownerIdentity = {
  getUserIdentity: async () => ({
    tokenIdentifier: 'owner-token',
    subject: 'owner:test',
  }),
}
const dailyPayoutPeriodStart = '2026-07-01T00:00:00.000Z'
const dailyPayoutPeriodEnd = '2026-07-02T00:00:00.000Z'
const normalTransferObservedAt = Date.parse(dailyPayoutPeriodEnd) + 1
const normalProviderRecoveryDeadlineAt =
  normalTransferObservedAt + STRIPE_TRANSFER_RECOVERY_WINDOW_MS
const normalProviderEvidenceObservedAt = normalTransferObservedAt + 1
const dailyPayoutRef = canonicalDigest({
  format: 'money-daily-payout:v1',
  businessId: 'business-1',
  currency: 'USD',
  periodStart: dailyPayoutPeriodStart,
  periodEnd: dailyPayoutPeriodEnd,
} as const)
const dailyPayoutQualifiedUseRef = 'qualified-use:payout-1'
const dailyPayoutMaterialDigest = 'sha256:payout-material'
const dailyPayoutAllocationRef = canonicalDigest({
  format: 'money-qualified-use-allocation:v1',
  qualifiedUseRef: dailyPayoutQualifiedUseRef,
  materialDigest: dailyPayoutMaterialDigest,
} as const)

function seedPayout(
  db: MemoryDb,
  state:
    | 'held_threshold'
    | 'transfer_pending'
    | 'outcome_unknown' = 'held_threshold',
): void {
  db.seed('moneyAccounts', {
    _id: 'moneyAccounts:1',
    accountRef: 'business:business-1:USD',
    accountKind: 'provider_earnings',
    businessId: 'business-1',
    currency: 'USD',
    exponent: 2,
    balanceUnits: '5000',
    recoveryDueUnits: '0',
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
    payoutRef: dailyPayoutRef,
    businessId: 'business-1',
    currency: 'USD',
    exponent: 2,
    grossAccrualUnits: '5500',
    rakeUnits: '500',
    providerNetUnits: '5000',
    minimumPayoutUnits: '1000',
    cadence: 'daily',
    state,
    periodStart: dailyPayoutPeriodStart,
    periodEnd: dailyPayoutPeriodEnd,
    providerAccountRef: 'business:business-1:USD',
    idempotencyKey: 'payout-old',
    createdAt: 1,
    updatedAt: 1,
  })
  db.seed('moneyPayoutAllocations', {
    _id: 'moneyPayoutAllocations:1',
    allocationRef: dailyPayoutAllocationRef,
    payoutRef: dailyPayoutRef,
    qualifiedUseRef: dailyPayoutQualifiedUseRef,
    transactionRef: 'transaction:payout-1',
    usageRef: 'usage:payout-1',
    businessId: 'business-1',
    currency: 'USD',
    exponent: 2,
    grossAccrualUnits: '5500',
    rakeUnits: '500',
    providerNetUnits: '5000',
    qualifiedAt: Date.parse(dailyPayoutPeriodStart) + 1,
    sourceDigest: 'sha256:payout-source',
    materialDigest: dailyPayoutMaterialDigest,
    createdAt: 1,
  })
}
function seedAdditionalDailyPayout(
  db: MemoryDb,
  suffix: string,
  periodStart: string,
  periodEnd: string,
): string {
  const payoutRef = canonicalDigest({
    format: 'money-daily-payout:v1',
    businessId: 'business-1',
    currency: 'USD',
    periodStart,
    periodEnd,
  } as const)
  const qualifiedUseRef = `qualified-use:${suffix}`
  const materialDigest = `sha256:payout-material:${suffix}`
  const allocationRef = canonicalDigest({
    format: 'money-qualified-use-allocation:v1',
    qualifiedUseRef,
    materialDigest,
  } as const)
  db.seed('moneyPayouts', {
    _id: `moneyPayouts:${suffix}`,
    payoutRef,
    businessId: 'business-1',
    currency: 'USD',
    exponent: 2,
    grossAccrualUnits: '5500',
    rakeUnits: '500',
    providerNetUnits: '5000',
    minimumPayoutUnits: '0',
    cadence: 'daily',
    state: 'held_threshold',
    periodStart,
    periodEnd,
    providerAccountRef: 'business:business-1:USD',
    idempotencyKey: payoutRef,
    createdAt: Date.parse(periodStart),
    updatedAt: Date.parse(periodStart),
  })
  db.seed('moneyPayoutAllocations', {
    _id: `moneyPayoutAllocations:${suffix}`,
    allocationRef,
    payoutRef,
    qualifiedUseRef,
    materialDigest,
    transactionRef: `transaction:payout-${suffix}`,
    usageRef: `usage:payout-${suffix}`,
    businessId: 'business-1',
    currency: 'USD',
    exponent: 2,
    grossAccrualUnits: '5500',
    rakeUnits: '500',
    providerNetUnits: '5000',
    qualifiedAt: Date.parse(periodStart) + 1,
    sourceDigest: `sha256:payout-source:${suffix}`,
    createdAt: Date.parse(periodStart) + 1,
  })
  return payoutRef
}
function creditProvider(
  db: MemoryDb,
  units: string,
  observedAt: number,
): void {
  const provider = db.rows('moneyAccounts')[0]
  if (
    provider === undefined ||
    typeof provider.balanceUnits !== 'string' ||
    typeof provider.version !== 'number'
  )
    throw new Error('provider_fixture_missing')
  provider.balanceUnits = (
    BigInt(provider.balanceUnits) + BigInt(units)
  ).toString()
  provider.version += 1
  provider.updatedAt = observedAt
}

function commandArgs(): Record<string, unknown> {
  return {
    authority: { principalId: 'principal:test' },
    businessId: 'business-1',
    amount,
    providerAccountRef: 'business:business-1:USD',
    destinationAccountId: 'acct_1',
    payoutRef: dailyPayoutRef,
    commandId: 'command-1',
    inputDigest: 'sha256:input-1',
    requestDigest: 'sha256:request-1',
    idempotencyKey: 'payout-idempotency-1',
    providerRecoveryDeadlineAt: normalProviderRecoveryDeadlineAt,
    observedAt: normalTransferObservedAt,
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
    observedAt: normalProviderEvidenceObservedAt,
  }
}
function completionArgs(
  args: Record<string, unknown>,
  payoutEvidence: Record<string, unknown>,
): Record<string, unknown> {
  const evidenceDigest = payoutEvidence.evidenceDigest
  if (typeof evidenceDigest !== 'string')
    throw new Error('evidence_digest_missing')
  return {
    ...args,
    sourceDigest: canonicalDigest({
      format: 'money-payout-evidence:v1',
      evidence: evidenceDigest,
    }),
    evidenceRefs: [evidenceDigest],
    evidence: payoutEvidence,
  }
}

describe('Convex payout persistence', () => {
  it('atomically reserves provider earnings before transfer effect and replays exactly', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    const reservationRef = canonicalDigest({
      format: 'money-payout-reservation-transaction:v1',
      payoutRef: args.payoutRef,
      payoutCommandId: args.commandId,
      inputDigest: args.inputDigest,
      idempotencyKey: args.idempotencyKey,
    })
    await expect(begin({ db, auth: identity }, args)).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'transfer_pending',
        providerHeldBefore: amount,
        providerHeldAfter: { currency: 'USD', units: '0', exponent: 2 },
        providerPaidBefore: { currency: 'USD', units: '0', exponent: 2 },
      },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('0')
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    expect(db.rows('moneyTransactions')[0]).toMatchObject({
      transactionRef: reservationRef,
      kind: 'payout_accrual',
      state: 'pending',
      amountUnits: '5000',
      expectedAccountVersion: 1,
    })
    expect(db.rows('moneyLedgerEntries')[0]).toMatchObject({
      entryRef: `${reservationRef}:payout-reservation`,
      direction: 'debit',
      amountUnits: '5000',
    })
    expect(db.rows('moneyLedgerEntries')[0]).not.toHaveProperty('payoutRef')
    const replay = await begin({ db, auth: identity }, args)
    expect(replay).toMatchObject({
      kind: 'accepted',
      transfer: { state: 'transfer_pending' },
    })
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
  })
  it('replays a reservation despite malformed correction while new admission remains strict', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    db.seed('moneyLedgerEntries', {
      _id: 'moneyLedgerEntries:malformed-correction',
      entryRef: 'malformed-correction',
      accountRef: 'business:business-1:USD',
      entryType: 'refund',
      direction: 'debit',
      amountUnits: '5000',
      currency: 'USD',
      exponent: 2,
      transactionRef: 'malformed-correction',
      idempotencyKey: 'malformed-correction',
      businessId: 'business-1',
      payoutRef: dailyPayoutRef,
      allocationRef: 'allocation:missing',
      allocationCorrectionUnits: '5000',
      reversalOf: 'transaction:missing',
      sourceDigest: 'sha256:malformed-correction',
      evidenceRefs: ['sha256:malformed-correction'],
      createdAt: normalTransferObservedAt,
    })
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(begin({ db, auth: identity }, args)).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'transfer_pending' },
    })
    expect(db.rows('moneyAccounts')).toEqual(beforeReplay.accounts)
    expect(db.rows('moneyPayouts')).toEqual(beforeReplay.payouts)
    expect(db.rows('moneyTransactions')).toEqual(beforeReplay.transactions)
    expect(db.rows('moneyLedgerEntries')).toEqual(beforeReplay.entries)
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
    ).resolves.toMatchObject({ kind: 'refused', code: 'payout_not_ready' })
  })


  it('replays paid terminal reservation after same-period composition drift without writes', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    const successArgs = completionArgs(args, evidence('succeeded'))
    await expect(
      complete({ db, auth: identity }, successArgs),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'paid', transferStatus: 'succeeded' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1250')
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    expect(db.rows('moneyTransactions')[0]?.state).toBe('applied')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
    creditProvider(db, '500', normalTransferObservedAt + 2)
    await expect(
      complete({ db, auth: identity }, successArgs),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'paid' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1750')
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '250'
    provider.recoveryDueUnits = '125'
    provider.version = 3
    provider.updatedAt = normalTransferObservedAt + 3
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (allocation === undefined) throw new Error('allocation_fixture_missing')
    allocation.providerNetUnits = '6000'
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(begin({ db, auth: identity }, args)).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'paid' },
    })
    await expect(
      complete({ db, auth: identity }, successArgs),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'paid' } })
    expect(db.rows('moneyAccounts')).toEqual(beforeReplay.accounts)
    expect(db.rows('moneyPayouts')).toEqual(beforeReplay.payouts)
    expect(db.rows('moneyTransactions')).toEqual(beforeReplay.transactions)
    expect(db.rows('moneyLedgerEntries')).toEqual(beforeReplay.entries)
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
    ).resolves.toMatchObject({ kind: 'refused', code: 'payout_not_ready' })
  })

  it('preserves closed-period and bounded daily composition admission', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const beforePayouts = structuredClone(db.rows('moneyPayouts'))
    const beforeAccounts = structuredClone(db.rows('moneyAccounts'))
    await expect(
      begin(
        { db, auth: identity },
        {
          ...commandArgs(),
          observedAt: Date.parse(dailyPayoutPeriodEnd) - 1,
          providerRecoveryDeadlineAt:
            Date.parse(dailyPayoutPeriodEnd) - 1 +
            STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
        },
      ),
    ).resolves.toMatchObject({ kind: 'refused', code: 'payout_not_ready' })
    expect(db.rows('moneyPayouts')).toEqual(beforePayouts)
    expect(db.rows('moneyAccounts')).toEqual(beforeAccounts)
    const malformed = new MemoryDb()
    seedPayout(malformed)
    const allocation = malformed.rows('moneyPayoutAllocations')[0]
    if (allocation === undefined) throw new Error('allocation_fixture_missing')
    allocation.providerNetUnits = '4999'
    await expect(
      begin({ db: malformed, auth: identity }, commandArgs()),
    ).resolves.toMatchObject({ kind: 'refused', code: 'payout_not_ready' })
    expect(malformed.rows('moneyAccounts')[0]?.balanceUnits).toBe('5000')
    expect(malformed.rows('moneyTransactions')).toHaveLength(0)
  })

  it('uses the latest completed payout snapshot after bounded history reads', async () => {
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
        accountRef: 'business:business-1:USD',
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
      complete({ db, auth: identity }, completionArgs(args, evidence('succeeded'))),
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

  it.each([
    {
      name: 'source digest',
      mutate: (args: Record<string, unknown>) => {
        args.sourceDigest = 'sha256:wrong-source'
      },
    },
    {
      name: 'provider account',
      mutate: (args: Record<string, unknown>) => {
        args.providerAccountRef = 'provider:other:USD'
      },
    },
    {
      name: 'business',
      mutate: (args: Record<string, unknown>) => {
        args.businessId = 'business-other'
      },
    },
    {
      name: 'currency',
      mutate: (args: Record<string, unknown>) => {
        args.amount = { currency: 'EUR', units: '5000', exponent: 2 }
      },
    },
    {
      name: 'amount',
      mutate: (args: Record<string, unknown>) => {
        args.amount = { currency: 'USD', units: '4000', exponent: 2 }
      },
    },
    {
      name: 'destination account',
      mutate: (args: Record<string, unknown>) => {
        args.destinationAccountId = 'acct_other'
      },
    },
  ])('rejects $name substitution without partial writes', async ({ mutate }) => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    const attempted = completionArgs(args, evidence('succeeded'))
    mutate(attempted)
    const beforeAccounts = structuredClone(db.rows('moneyAccounts'))
    const beforeTransactions = structuredClone(db.rows('moneyTransactions'))
    const beforeEntries = structuredClone(db.rows('moneyLedgerEntries'))
    await expect(
      complete({ db, auth: identity }, attempted),
    ).resolves.toMatchObject({ kind: 'refused' })
    expect(db.rows('moneyAccounts')).toEqual(beforeAccounts)
    expect(db.rows('moneyTransactions')).toEqual(beforeTransactions)
    expect(db.rows('moneyLedgerEntries')).toEqual(beforeEntries)
  })

  it('rejects a regressed provider account generation without partial writes', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.version = 1
    const before = structuredClone(db.rows('moneyPayouts'))
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(args, evidence('succeeded')),
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    expect(db.rows('moneyPayouts')).toEqual(before)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
  })

  it('resolves an outcome-unknown reservation after a provider credit', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    await expect(
      markUnknown(
        { db, auth: identity },
        { ...args, failureCode: 'payout_outcome_unknown' },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'outcome_unknown' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1250')
    expect(db.rows('moneyTransactions')[0]?.state).toBe('outcome_unknown')
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(args, evidence('succeeded')),
      ),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'paid' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('1250')
    expect(db.rows('moneyTransactions')[0]?.state).toBe('applied')
    expect(db.rows('moneyLedgerEntries')).toHaveLength(1)
  })

  it('restores a failed reservation onto current provider balance and replays after credit', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    const failed = completionArgs(args, evidence('failed'))
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold', transferStatus: 'failed' },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('6250')
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyTransactions')[0]?.state).toBe('reversed')
    expect(db.rows('moneyTransactions')[1]?.expectedAccountVersion).toBe(3)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    const afterFailure = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'held_threshold',
        transferStatus: 'failed',
        amount,
        evidenceDigest: 'sha256:evidence-1',
      },
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(afterFailure)
    const differentArgs = {
      ...args,
      commandId: 'command-2',
      inputDigest: 'sha256:input-2',
      requestDigest: 'sha256:request-2',
      idempotencyKey: 'payout-idempotency-2',
    }
    const beforeDifferent = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      begin({ db, auth: identity }, differentArgs),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeDifferent)
    const changedCompletion = completionArgs(differentArgs, {
      ...evidence('failed', 'sha256:evidence-2'),
      requestDigest: 'sha256:request-2',
    })
    await expect(
      complete({ db, auth: identity }, changedCompletion),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
      retryable: false,
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeDifferent)


    creditProvider(db, '500', normalTransferObservedAt + 2)
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'held_threshold' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('6750')
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '4000'
    provider.recoveryDueUnits = '200'
    provider.version = 6
    provider.updatedAt = normalTransferObservedAt + 3
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'held_threshold' } })
    expect(db.rows('moneyAccounts')).toEqual(beforeReplay.accounts)
    expect(db.rows('moneyPayouts')).toEqual(beforeReplay.payouts)
    expect(db.rows('moneyTransactions')).toEqual(beforeReplay.transactions)
    expect(db.rows('moneyLedgerEntries')).toEqual(beforeReplay.entries)
  })
  it('replays failed reservation after canonical same-period provider correction', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    const failed = completionArgs(args, evidence('failed'))
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold', transferStatus: 'failed' },
    })
    const payout = db.rows('moneyPayouts')[0]
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (payout === undefined || allocation === undefined)
      throw new Error('payout_correction_fixture_missing')
    payout.grossAccrualUnits = '0'
    payout.rakeUnits = '0'
    payout.providerNetUnits = '0'
    allocation.grossAccrualUnits = '0'
    allocation.rakeUnits = '0'
    allocation.providerNetUnits = '0'
    db.seed('moneyLedgerEntries', {
      _id: 'moneyLedgerEntries:provider-refund-correction',
      entryRef: 'provider-refund-correction',
      accountRef: 'business:business-1:USD',
      entryType: 'refund',
      direction: 'debit',
      amountUnits: '5000',
      currency: 'USD',
      exponent: 2,
      transactionRef: 'provider-refund-correction',
      idempotencyKey: 'provider-refund-correction',
      businessId: 'business-1',
      payoutRef: dailyPayoutRef,
      allocationRef: dailyPayoutAllocationRef,
      allocationCorrectionUnits: '5000',
      reversalOf: 'transaction:payout-1',
      sourceDigest: 'sha256:provider-refund-correction',
      evidenceRefs: ['sha256:provider-refund-correction'],
      createdAt: normalTransferObservedAt + 2,
    })
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      begin({ db, auth: identity }, args),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold', amount },
    })
    await expect(
      complete({ db, auth: identity }, failed),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'held_threshold', amount },
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      allocations: db.rows('moneyPayoutAllocations'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeReplay)
    await expect(
      begin(
        { db, auth: identity },
        {
          ...args,
          commandId: 'command-2',
          inputDigest: 'sha256:input-2',
          idempotencyKey: 'payout-idempotency-2',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_not_ready',
    })
  })

  it('restores an unknown not-released reservation onto current balance', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    await markUnknown(
      { db, auth: identity },
      { ...args, failureCode: 'payout_outcome_unknown' },
    )
    const notReleased = {
      provider: 'stripe' as const,
      resolution: 'not_released' as const,
      destinationAccountId: 'acct_1',
      amount,
      status: 'failed' as const,
      requestDigest: 'sha256:request-1',
      evidenceDigest: 'sha256:group-empty',
      observedAt: normalProviderEvidenceObservedAt,
    }
    const reconciliation = {
      ...completionArgs(args, notReleased),
      outcome: 'not_released' as const,
    }
    await expect(
      reconcile({ db, auth: identity }, reconciliation),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'held_threshold' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('6250')
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    const afterReconciliation = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      reconcile({ db, auth: identity }, reconciliation),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'held_threshold',
        transferStatus: 'failed',
        amount,
        evidenceDigest: 'sha256:group-empty',
      },
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(afterReconciliation)
    const differentArgs = {
      ...args,
      commandId: 'command-2',
      inputDigest: 'sha256:input-2',
      requestDigest: 'sha256:request-2',
      idempotencyKey: 'payout-idempotency-2',
    }
    const beforeDifferent = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      begin({ db, auth: identity }, differentArgs),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeDifferent)
    const changedReconciliation = {
      ...completionArgs(differentArgs, {
        ...notReleased,
        requestDigest: 'sha256:request-2',
        evidenceDigest: 'sha256:group-empty-2',
      }),
      outcome: 'not_released' as const,
    }
    await expect(
      reconcile({ db, auth: identity }, changedReconciliation),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'ledger_idempotency_conflict',
      retryable: false,
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeDifferent)
    creditProvider(db, '500', normalTransferObservedAt + 2)
    const payout = db.rows('moneyPayouts')[0]
    const allocation = db.rows('moneyPayoutAllocations')[0]
    if (payout === undefined || allocation === undefined)
      throw new Error('payout_correction_fixture_missing')
    payout.grossAccrualUnits = '0'
    payout.rakeUnits = '0'
    payout.providerNetUnits = '0'
    allocation.grossAccrualUnits = '0'
    allocation.rakeUnits = '0'
    allocation.providerNetUnits = '0'
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      allocations: structuredClone(db.rows('moneyPayoutAllocations')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      reconcile({ db, auth: identity }, reconciliation),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'held_threshold' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('6750')
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      allocations: db.rows('moneyPayoutAllocations'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeReplay)
  })
  it('fences orphaned payout rows and journals without admitting a second command', async () => {
    const differentArgs = {
      ...commandArgs(),
      commandId: 'command-2',
      inputDigest: 'sha256:input-2',
      requestDigest: 'sha256:request-2',
      idempotencyKey: 'payout-idempotency-2',
    }
    const rowWithoutAttemptMaterial = new MemoryDb()
    seedPayout(rowWithoutAttemptMaterial)
    await begin(
      { db: rowWithoutAttemptMaterial, auth: identity },
      commandArgs(),
    )
    const attemptedPayout = rowWithoutAttemptMaterial.rows('moneyPayouts')[0]
    if (attemptedPayout === undefined)
      throw new Error('attempted_payout_fixture_missing')
    await rowWithoutAttemptMaterial.patch(attemptedPayout._id, {
      payoutCommandId: undefined,
      inputDigest: undefined,
      destinationAccountId: undefined,
      transferRequestDigest: undefined,
      transferStatus: undefined,
      providerRecoveryDeadlineAt: undefined,
      providerHeldBeforeUnits: undefined,
      providerHeldAfterUnits: undefined,
      providerPaidBeforeUnits: undefined,
      providerPaidAfterUnits: undefined,
      stripeTransferId: undefined,
      transferEvidenceDigest: undefined,
      transferReversalEvidenceDigest: undefined,
      transferObservedAt: undefined,
      failureCode: undefined,
    })
    const beforeMissingRowMaterial = {
      accounts: structuredClone(rowWithoutAttemptMaterial.rows('moneyAccounts')),
      payouts: structuredClone(rowWithoutAttemptMaterial.rows('moneyPayouts')),
      transactions: structuredClone(
        rowWithoutAttemptMaterial.rows('moneyTransactions'),
      ),
      entries: structuredClone(
        rowWithoutAttemptMaterial.rows('moneyLedgerEntries'),
      ),
    }
    await expect(
      begin(
        { db: rowWithoutAttemptMaterial, auth: identity },
        differentArgs,
      ),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    expect({
      accounts: rowWithoutAttemptMaterial.rows('moneyAccounts'),
      payouts: rowWithoutAttemptMaterial.rows('moneyPayouts'),
      transactions: rowWithoutAttemptMaterial.rows('moneyTransactions'),
      entries: rowWithoutAttemptMaterial.rows('moneyLedgerEntries'),
    }).toEqual(beforeMissingRowMaterial)

    const missingJournal = new MemoryDb()
    seedPayout(missingJournal)
    const orphanedPayout = missingJournal.rows('moneyPayouts')[0]
    if (orphanedPayout === undefined)
      throw new Error('orphaned_payout_fixture_missing')
    await missingJournal.patch(orphanedPayout._id, {
      payoutCommandId: 'command-prior',
      inputDigest: 'sha256:input-prior',
      destinationAccountId: 'acct_1',
      transferRequestDigest: 'sha256:request-prior',
      transferStatus: 'failed',
    })
    const beforeMissingJournal = {
      accounts: structuredClone(missingJournal.rows('moneyAccounts')),
      payouts: structuredClone(missingJournal.rows('moneyPayouts')),
      transactions: structuredClone(missingJournal.rows('moneyTransactions')),
      entries: structuredClone(missingJournal.rows('moneyLedgerEntries')),
    }
    await expect(
      begin({ db: missingJournal, auth: identity }, differentArgs),
    ).resolves.toEqual({
      kind: 'refused',
      code: 'payout_not_ready',
      retryable: false,
    })
    expect({
      accounts: missingJournal.rows('moneyAccounts'),
      payouts: missingJournal.rows('moneyPayouts'),
      transactions: missingJournal.rows('moneyTransactions'),
      entries: missingJournal.rows('moneyLedgerEntries'),
    }).toEqual(beforeMissingJournal)
  })
  it('derives bounded cumulative paid snapshots across older and latest reversals', async () => {
    const argsForPayout = (
      payoutRef: string,
      commandId: string,
      inputDigest: string,
      idempotencyKey: string,
      observedAt: number,
    ): Record<string, unknown> => ({
      ...commandArgs(),
      payoutRef,
      commandId,
      inputDigest,
      idempotencyKey,
      observedAt,
      providerRecoveryDeadlineAt:
        observedAt + STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
    })
    const argsA = commandArgs()
    const periodB = {
      start: '2026-07-02T00:00:00.000Z',
      end: '2026-07-03T00:00:00.000Z',
    }
    const periodC = {
      start: '2026-07-03T00:00:00.000Z',
      end: '2026-07-04T00:00:00.000Z',
    }
    const secondObservedAt = Date.parse(periodB.end) + 2
    const thirdObservedAt = Date.parse(periodC.end) + 1
    const db = new MemoryDb()
    seedPayout(db)
    const payoutB = seedAdditionalDailyPayout(
      db,
      'b',
      periodB.start,
      periodB.end,
    )
    const payoutC = seedAdditionalDailyPayout(
      db,
      'c',
      periodC.start,
      periodC.end,
    )
    await expect(
      begin({ db, auth: identity }, argsA),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'transfer_pending' },
    })
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(argsA, evidence('succeeded')),
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'paid', providerPaidAfter: amount },
    })
    creditProvider(db, '5000', normalTransferObservedAt + 2)
    const argsB = {
      ...argsForPayout(
        payoutB,
        'command-2',
        'sha256:input-2',
        'payout-idempotency-2',
        secondObservedAt,
      ),
      requestDigest: 'sha256:request-2',
    }
    const evidenceB = {
      ...evidence('succeeded', 'sha256:evidence-b'),
      transferId: 'tr_2',
      requestDigest: 'sha256:request-2',
      observedAt: secondObservedAt + 1,
    }
    await expect(
      begin({ db, auth: identity }, argsB),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'transfer_pending',
        providerPaidBefore: amount,
      },
    })
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(argsB, evidenceB),
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'paid',
        providerPaidAfter: { currency: 'USD', units: '10000', exponent: 2 },
      },
    })
    const reversalProcessedAt = secondObservedAt + 3
    const reverseA = completionArgs(
      { ...argsA, observedAt: reversalProcessedAt },
      {
        ...evidence('reversed', 'sha256:evidence-reversal-a'),
        observedAt: secondObservedAt,
      },
    )
    await expect(
      complete({ db, auth: identity }, reverseA),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'reversed', providerPaidAfter: amount },
    })
    const payoutARow = db.rows('moneyPayouts').find(
      (row) => row.payoutRef === dailyPayoutRef,
    )
    if (payoutARow === undefined) throw new Error('payout_a_missing')
    expect(payoutARow.providerPaidAfterUnits).toBe('5000')
    expect(payoutARow.transferObservedAt).toBe(secondObservedAt)
    expect(payoutARow.updatedAt).toBe(reversalProcessedAt)
    const beginC = await begin(
      { db, auth: identity },
      argsForPayout(
        payoutC,
        'command-3',
        'sha256:input-3',
        'payout-idempotency-3',
        thirdObservedAt,
      ),
    )
    expect(beginC).toMatchObject({
      kind: 'accepted',
      transfer: {
        providerPaidBefore: { currency: 'USD', units: '5000', exponent: 2 },
      },
    })
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      complete({ db, auth: identity }, reverseA),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'reversed' } })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeReplay)

    const latestDb = new MemoryDb()
    seedPayout(latestDb)
    const latestB = seedAdditionalDailyPayout(
      latestDb,
      'latest-b',
      periodB.start,
      periodB.end,
    )
    await begin({ db: latestDb, auth: identity }, argsA)
    await complete(
      { db: latestDb, auth: identity },
      completionArgs(argsA, evidence('succeeded')),
    )
    creditProvider(latestDb, '5000', normalTransferObservedAt + 2)
    const latestArgsB = {
      ...argsForPayout(
        latestB,
        'command-2',
        'sha256:input-2',
        'payout-idempotency-2',
        secondObservedAt,
      ),
      requestDigest: 'sha256:request-2',
    }
    await begin({ db: latestDb, auth: identity }, latestArgsB)
    await complete(
      { db: latestDb, auth: identity },
      completionArgs(latestArgsB, evidenceB),
    )
    const reverseLatestB = completionArgs(
      { ...latestArgsB, observedAt: secondObservedAt + 3 },
      {
        ...evidence('reversed', 'sha256:evidence-reversal-latest'),
        transferId: 'tr_2',
        requestDigest: 'sha256:request-2',
        observedAt: secondObservedAt + 3,
      },
    )
    await expect(
      complete({ db: latestDb, auth: identity }, reverseLatestB),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'reversed',
        providerPaidAfter: { currency: 'USD', units: '5000', exponent: 2 },
      },
    })
    const latestRow = latestDb.rows('moneyPayouts').find(
      (row) => row.payoutRef === latestB,
    )
    if (latestRow === undefined) throw new Error('latest_payout_missing')
    expect(latestRow.providerPaidAfterUnits).toBe('5000')
  })

  it('refreshes a new success snapshot after a delayed reversal', async () => {
    const argsForPayout = (
      payoutRef: string,
      commandId: string,
      inputDigest: string,
      idempotencyKey: string,
      observedAt: number,
    ): Record<string, unknown> => ({
      ...commandArgs(),
      payoutRef,
      commandId,
      inputDigest,
      idempotencyKey,
      observedAt,
      providerRecoveryDeadlineAt:
        observedAt + STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
    })
    const argsA = commandArgs()
    const periodB = {
      start: '2026-07-02T00:00:00.000Z',
      end: '2026-07-03T00:00:00.000Z',
    }
    const periodC = {
      start: '2026-07-03T00:00:00.000Z',
      end: '2026-07-04T00:00:00.000Z',
    }
    const secondObservedAt = Date.parse(periodB.end) + 2
    const thirdObservedAt = Date.parse(periodC.end) + 1
    const reversalProcessedAt = secondObservedAt + 3
    const successProcessedAt = reversalProcessedAt + 1
    const db = new MemoryDb()
    db.seed('owners', {
      _id: 'owners:status',
      clerkUserId: 'owner:test',
      createdAt: 1,
      updatedAt: 1,
    })
    db.seed('businesses', {
      _id: 'business-1',
      ownerId: 'owners:status',
      updatedAt: 1,
    })
    seedPayout(db)
    const payoutB = seedAdditionalDailyPayout(
      db,
      'delayed-b',
      periodB.start,
      periodB.end,
    )
    const payoutC = seedAdditionalDailyPayout(
      db,
      'delayed-c',
      periodC.start,
      periodC.end,
    )
    await begin({ db, auth: identity }, argsA)
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(argsA, evidence('succeeded')),
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'paid', providerPaidAfter: amount },
    })
    creditProvider(db, '5000', normalTransferObservedAt + 2)
    const argsB: Record<string, unknown> = {
      ...argsForPayout(
        payoutB,
        'command-delayed-b',
        'sha256:input-delayed-b',
        'payout-idempotency-delayed-b',
        secondObservedAt,
      ),
      requestDigest: 'sha256:request-delayed-b',
    }
    await expect(
      begin({ db, auth: identity }, argsB),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'transfer_pending',
        providerPaidBefore: amount,
      },
    })
    const reverseA = completionArgs(
      { ...argsA, observedAt: reversalProcessedAt },
      {
        ...evidence('reversed', 'sha256:evidence-delayed-reversal-a'),
        observedAt: secondObservedAt,
      },
    )
    await expect(
      complete({ db, auth: identity }, reverseA),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'reversed',
        providerPaidAfter: { currency: 'USD', units: '0', exponent: 2 },
      },
    })
    const reversedARow = db.rows('moneyPayouts').find(
      (row) => row.payoutRef === dailyPayoutRef,
    )
    if (reversedARow === undefined) throw new Error('delayed_payout_a_missing')
    expect(reversedARow.transferObservedAt).toBe(secondObservedAt)
    expect(reversedARow.updatedAt).toBe(reversalProcessedAt)
    const pendingStatus = await readStatus(
      { db, auth: identity },
      { businessId: 'business-1', currency: 'USD' },
    )
    expect(pendingStatus).toMatchObject({
      kind: 'ok',
      payoutState: 'transfer_pending',
      payoutRef: payoutB,
      transferStatus: 'pending',
      destinationAccountId: 'acct_1',
      requestDigest: 'sha256:request-delayed-b',
      providerRecoveryDeadlineAt: argsB.providerRecoveryDeadlineAt,
    })
    const pendingOwnerEarnings = await readOwnerEarnings(
      { db, auth: ownerIdentity },
      {},
    )
    expect(pendingOwnerEarnings).toMatchObject({
      kind: 'available',
      businessId: 'business-1',
      accounts: [
        {
          currency: 'USD',
          payout: {
            payoutState: 'transfer_pending',
            payoutRef: payoutB,
            transferStatus: 'pending',
            destinationAccountId: 'acct_1',
            requestDigest: 'sha256:request-delayed-b',
            providerRecoveryDeadlineAt: argsB.providerRecoveryDeadlineAt,
          },
        },
      ],
    })
    await expect(
      markUnknown(
        { db, auth: identity },
        {
          ...argsB,
          observedAt: reversalProcessedAt,
          failureCode: 'payout_delayed_reversal',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'outcome_unknown' },
    })
    const unknownStatus = await readStatus(
      { db, auth: identity },
      { businessId: 'business-1', currency: 'USD' },
    )
    expect(unknownStatus).toMatchObject({
      kind: 'ok',
      payoutState: 'outcome_unknown',
      payoutRef: payoutB,
      transferStatus: 'outcome_unknown',
      destinationAccountId: 'acct_1',
      requestDigest: 'sha256:request-delayed-b',
      providerRecoveryDeadlineAt: argsB.providerRecoveryDeadlineAt,
    })
    const evidenceB = {
      ...evidence('succeeded', 'sha256:evidence-delayed-success-b'),
      transferId: 'tr_delayed_b',
      requestDigest: 'sha256:request-delayed-b',
      observedAt: secondObservedAt + 1,
    }
    const completedBArgs = {
      ...argsB,
      observedAt: successProcessedAt,
    }
    await expect(
      complete(
        { db, auth: identity },
        completionArgs(completedBArgs, evidenceB),
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'paid',
        providerPaidBefore: { currency: 'USD', units: '0', exponent: 2 },
        providerPaidAfter: { currency: 'USD', units: '5000', exponent: 2 },
      },
    })
    const paidBRow = db.rows('moneyPayouts').find(
      (row) => row.payoutRef === payoutB,
    )
    if (paidBRow === undefined) throw new Error('delayed_payout_b_missing')
    expect(paidBRow.providerPaidBeforeUnits).toBe('0')
    expect(paidBRow.providerPaidAfterUnits).toBe('5000')
    expect(paidBRow.transferObservedAt).toBe(secondObservedAt + 1)
    expect(paidBRow.updatedAt).toBe(successProcessedAt)
    const beginC = await begin(
      { db, auth: identity },
      argsForPayout(
        payoutC,
        'command-delayed-c',
        'sha256:input-delayed-c',
        'payout-idempotency-delayed-c',
        thirdObservedAt,
      ),
    )
    expect(beginC).toMatchObject({
      kind: 'accepted',
      transfer: {
        providerPaidBefore: { currency: 'USD', units: '5000', exponent: 2 },
      },
    })
    const beforeReplay = {
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    }
    await expect(
      complete({ db, auth: identity }, reverseA),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'reversed' },
    })
    expect({
      accounts: db.rows('moneyAccounts'),
      payouts: db.rows('moneyPayouts'),
      transactions: db.rows('moneyTransactions'),
      entries: db.rows('moneyLedgerEntries'),
    }).toEqual(beforeReplay)
  })
  it('refuses multiple active payout status candidates', async () => {
    const db = new MemoryDb()
    seedPayout(db, 'transfer_pending')
    const secondRef = seedAdditionalDailyPayout(
      db,
      'status-conflict',
      '2026-07-02T00:00:00.000Z',
      '2026-07-03T00:00:00.000Z',
    )
    const second = db.rows('moneyPayouts').find(
      (row) => row.payoutRef === secondRef,
    )
    if (second === undefined) throw new Error('status_conflict_payout_missing')
    second.state = 'outcome_unknown'
    await expect(
      readStatus(
        { db, auth: identity },
        { businessId: 'business-1', currency: 'USD' },
      ),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
  })

  it('reverses a successful payout onto current balance and replays after credit', async () => {
    const db = new MemoryDb()
    db.seed('owners', {
      _id: 'owners:paid-readback',
      clerkUserId: 'owner:test',
      createdAt: 1,
      updatedAt: 1,
    })
    db.seed('businesses', {
      _id: 'business-1',
      ownerId: 'owners:paid-readback',
      updatedAt: 1,
    })
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    await complete(
      { db, auth: identity },
      completionArgs(args, evidence('succeeded')),
    )
    await expect(
      readOwnerTransfer(
        { db, auth: ownerIdentity },
        {
          businessId: 'business-1',
          currency: 'USD',
          payoutRef: dailyPayoutRef,
          idempotencyKey: 'payout-idempotency-1',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'paid',
        transferStatus: 'succeeded',
        amount,
      },
    })
    creditProvider(db, '1250', normalTransferObservedAt + 1)
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '250'
    provider.recoveryDueUnits = '700'
    provider.version = 4
    provider.updatedAt = normalTransferObservedAt + 2
    const payoutAccount = db.rows('moneyPayoutAccounts')[0]
    if (payoutAccount === undefined) throw new Error('payout_account_fixture_missing')
    payoutAccount.stripeAccountId = 'acct_changed'
    payoutAccount.state = 'restricted'
    payoutAccount.detailsSubmitted = false
    payoutAccount.recipientCapabilityActive = false
    const reversal = completionArgs(
      args,
      evidence('reversed', 'sha256:evidence-reversal-1'),
    )
    await expect(
      complete({ db, auth: identity }, reversal),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: { state: 'reversed', transferStatus: 'reversed' },
    })
    await expect(
      readOwnerTransfer(
        { db, auth: ownerIdentity },
        {
          businessId: 'business-1',
          currency: 'USD',
          payoutRef: dailyPayoutRef,
          idempotencyKey: 'payout-idempotency-1',
        },
      ),
    ).resolves.toMatchObject({
      kind: 'accepted',
      transfer: {
        state: 'reversed',
        transferStatus: 'reversed',
        amount,
      },
    })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('4550')
    expect(db.rows('moneyAccounts')[0]?.recoveryDueUnits).toBe('0')
    expect(db.rows('moneyAccounts')[0]?.version).toBe(5)
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyTransactions')[1]?.expectedAccountVersion).toBe(4)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')[1]).not.toHaveProperty('payoutRef')
    creditProvider(db, '500', normalTransferObservedAt + 3)
    await expect(
      complete({ db, auth: identity }, reversal),
    ).resolves.toMatchObject({ kind: 'accepted', transfer: { state: 'reversed' } })
    expect(db.rows('moneyAccounts')[0]?.balanceUnits).toBe('5050')
    expect(db.rows('moneyAccounts')[0]?.recoveryDueUnits).toBe('0')
    expect(db.rows('moneyAccounts')[0]?.version).toBe(6)
    expect(db.rows('moneyTransactions')).toHaveLength(2)
    expect(db.rows('moneyLedgerEntries')).toHaveLength(2)
  })

  it('keeps pending replay fenced by current account and recovery state', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '1'
    provider.recoveryDueUnits = '1'
    provider.version = 3
    await expect(
      begin({ db, auth: identity }, args),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
  })

  it('keeps outcome-unknown replay and new commands fenced by account/recovery state', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const args = commandArgs()
    await begin({ db, auth: identity }, args)
    await markUnknown(
      { db, auth: identity },
      { ...args, failureCode: 'payout_outcome_unknown' },
    )
    const provider = db.rows('moneyAccounts')[0]
    if (provider === undefined) throw new Error('provider_fixture_missing')
    provider.balanceUnits = '1'
    provider.recoveryDueUnits = '1'
    provider.version = 3
    await expect(
      begin({ db, auth: identity }, args),
    ).resolves.toMatchObject({
      kind: 'refused',
      code: 'payout_reconciliation_required',
    })
    const differentArgs = {
      ...args,
      commandId: 'command-2',
      inputDigest: 'sha256:input-2',
      requestDigest: 'sha256:request-2',
      idempotencyKey: 'payout-idempotency-2',
    }
    const different = await begin(
      { db, auth: identity },
      differentArgs,
    )
    expect(different).toMatchObject({
      kind: 'refused',
      code: 'payout_not_ready',
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
  it('rejects terminal replay tampering through begin and owner readback', async () => {
    const ownerReadbackArgs = {
      businessId: 'business-1',
      currency: 'USD',
      payoutRef: dailyPayoutRef,
      idempotencyKey: 'payout-idempotency-1',
    }
    const seedOwner = (db: MemoryDb): void => {
      db.seed('owners', {
        _id: 'owners:terminal-tamper',
        clerkUserId: 'owner:test',
        createdAt: 1,
        updatedAt: 1,
      })
      db.seed('businesses', {
        _id: 'business-1',
        ownerId: 'owners:terminal-tamper',
        updatedAt: 1,
      })
    }
    const snapshot = (db: MemoryDb) => ({
      accounts: structuredClone(db.rows('moneyAccounts')),
      payouts: structuredClone(db.rows('moneyPayouts')),
      transactions: structuredClone(db.rows('moneyTransactions')),
      entries: structuredClone(db.rows('moneyLedgerEntries')),
    })
    const paidFixture = async () => {
      const db = new MemoryDb()
      seedOwner(db)
      seedPayout(db)
      const args = commandArgs()
      await expect(begin({ db, auth: identity }, args)).resolves.toMatchObject({
        kind: 'accepted',
        transfer: { state: 'transfer_pending' },
      })
      await expect(
        complete(
          { db, auth: identity },
          completionArgs(args, evidence('succeeded')),
        ),
      ).resolves.toMatchObject({
        kind: 'accepted',
        transfer: { state: 'paid' },
      })
      return {
        db,
        args,
        reservationRef: canonicalDigest({
          format: 'money-payout-reservation-transaction:v1',
          payoutRef: args.payoutRef,
          payoutCommandId: args.commandId,
          inputDigest: args.inputDigest,
          idempotencyKey: args.idempotencyKey,
        } as const),
      }
    }
    const reversedFixture = async () => {
      const fixture = await paidFixture()
      await expect(
        complete(
          { db: fixture.db, auth: identity },
          completionArgs(
            fixture.args,
            evidence('reversed', 'sha256:evidence-reversal-tamper'),
          ),
        ),
      ).resolves.toMatchObject({
        kind: 'accepted',
        transfer: { state: 'reversed' },
      })
      return fixture
    }
    const failedFixture = async () => {
      const db = new MemoryDb()
      seedOwner(db)
      seedPayout(db)
      const args = commandArgs()
      await begin({ db, auth: identity }, args)
      await expect(
        complete(
          { db, auth: identity },
          completionArgs(args, evidence('failed')),
        ),
      ).resolves.toMatchObject({
        kind: 'accepted',
        transfer: { state: 'held_threshold', transferStatus: 'failed' },
      })
      return { db, args }
    }
    const assertTampered = async (
      fixture: {
        db: MemoryDb
        args: Record<string, unknown>
      },
    ) => {
      const before = snapshot(fixture.db)
      await expect(
        begin({ db: fixture.db, auth: identity }, fixture.args),
      ).resolves.toEqual({
        kind: 'refused',
        code: 'payout_reconciliation_required',
        retryable: false,
      })
      await expect(
        readOwnerTransfer(
          { db: fixture.db, auth: ownerIdentity },
          ownerReadbackArgs,
        ),
      ).resolves.toEqual({
        kind: 'refused',
        code: 'payout_reconciliation_required',
        retryable: false,
      })
      expect(snapshot(fixture.db)).toEqual(before)
    }

    for (const field of [
      'providerHeldBeforeUnits',
      'providerHeldAfterUnits',
    ] as const) {
      const fixture = await paidFixture()
      const payout = fixture.db.rows('moneyPayouts')[0]
      if (payout === undefined) throw new Error('paid_payout_fixture_missing')
      payout[field] = field === 'providerHeldBeforeUnits' ? '4999' : '1'
      await assertTampered(fixture)
    }

    for (const withCredit of [false, true]) {
      const fixture = await paidFixture()
      const linkedRef = `linked-reversal:${withCredit}`
      fixture.db.seed('moneyTransactions', {
        _id: `moneyTransactions:${linkedRef}`,
        transactionRef: linkedRef,
        kind: 'payout_accrual',
        idempotencyKey: linkedRef,
        inputDigest: 'sha256:linked-reversal',
        principalId: 'business:business-1',
        currency: 'USD',
        amountUnits: '5000',
        exponent: 2,
        state: 'reversed',
        expectedAccountVersion: 3,
        externalRef: dailyPayoutRef,
        reversalOf: fixture.reservationRef,
        createdAt: normalTransferObservedAt + 1,
        updatedAt: normalTransferObservedAt + 1,
      })
      if (withCredit) {
        fixture.db.seed('moneyLedgerEntries', {
          _id: `moneyLedgerEntries:${linkedRef}`,
          entryRef: `${linkedRef}:payout-reversal`,
          accountRef: 'business:business-1:USD',
          entryType: 'payout_accrual',
          direction: 'credit',
          amountUnits: '5000',
          currency: 'USD',
          exponent: 2,
          transactionRef: linkedRef,
          idempotencyKey: linkedRef,
          businessId: 'business-1',
          sourceDigest: 'sha256:linked-reversal',
          evidenceRefs: ['sha256:linked-reversal'],
          reversalOf: fixture.reservationRef,
          createdAt: normalTransferObservedAt + 1,
        })
      }
      await assertTampered(fixture)
    }

    {
      const fixture = await reversedFixture()
      const payout = fixture.db.rows('moneyPayouts')[0]
      if (payout === undefined)
        throw new Error('reversed_payout_fixture_missing')
      payout.transferReversalEvidenceDigest = undefined
      await assertTampered(fixture)
    }

    {
      const fixture = await reversedFixture()
      const reversalEntry = fixture.db
        .rows('moneyLedgerEntries')
        .find(
          (entry) =>
            typeof entry.entryRef === 'string' &&
            entry.entryRef.endsWith(':payout-reversal'),
        )
      if (reversalEntry === undefined)
        throw new Error('reversal_entry_fixture_missing')
      reversalEntry.sourceDigest = canonicalDigest({
        format: 'money-payout-evidence:v1',
        evidence: 'sha256:evidence-1',
      })
      reversalEntry.evidenceRefs = ['sha256:evidence-1']
      await assertTampered(fixture)
    }

    {
      const fixture = await failedFixture()
      const payout = fixture.db.rows('moneyPayouts')[0]
      if (payout === undefined)
        throw new Error('failed_payout_fixture_missing')
      payout.transferEvidenceDigest = undefined
      await assertTampered(fixture)
    }
  })

  it('reserves yesterday UTC daily payouts once and does not double-reserve on replay', async () => {
    const db = new MemoryDb()
    seedPayout(db)
    const now = Date.parse(dailyPayoutPeriodEnd) + 1
    await expect(
      dailySettle({ db, auth: identity }, { now }),
    ).resolves.toMatchObject({
      kind: 'ran',
      periodStart: dailyPayoutPeriodStart,
      begunCount: 1,
      unresolvedReservationCount: 0,
    })
    expect(db.rows('moneyTransactions')).toHaveLength(1)
    expect(db.rows('moneyPayouts')[0]).toMatchObject({
      state: 'transfer_pending',
      payoutRef: dailyPayoutRef,
    })
    await expect(
      dailySettle({ db, auth: identity }, { now }),
    ).resolves.toMatchObject({
      kind: 'ran',
      begunCount: 0,
    })
    expect(db.rows('moneyTransactions')).toHaveLength(1)
  })

  it('accounts an unresolved reservation instead of beginning a second transfer', async () => {
    const db = new MemoryDb()
    seedPayout(db, 'transfer_pending')
    seedAdditionalDailyPayout(
      db,
      'prior-day',
      '2026-06-30T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    )
    const now = Date.parse(dailyPayoutPeriodEnd) + 1
    await expect(
      dailySettle({ db, auth: identity }, { now }),
    ).resolves.toMatchObject({
      kind: 'ran',
      begunCount: 0,
    })
    const result = await dailySettle({ db, auth: identity }, { now })
    expect(result).toMatchObject({ kind: 'ran', begunCount: 0 })
    expect(
      (result as { unresolvedReservationCount: number }).unresolvedReservationCount,
    ).toBeGreaterThan(0)
    expect(db.rows('moneyTransactions')).toHaveLength(0)
  })
})

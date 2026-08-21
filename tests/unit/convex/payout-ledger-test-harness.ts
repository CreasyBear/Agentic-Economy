import { canonicalDigest } from '@/modules/common/canonical-digest'
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

export { canonicalDigest, STRIPE_TRANSFER_RECOVERY_WINDOW_MS }

export type Row = Record<string, unknown> & { _id: string }
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

export class MemoryDb {
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
export const begin = (beginPayoutTransfer as unknown as HandlerExport)._handler
export const dailySettle = (runDailySupplierSettlement as unknown as HandlerExport)
  ._handler
export const readOwnerTransfer = (
  readOwnerPayoutTransfer as unknown as HandlerExport
)._handler
export const readStatus = (readPayoutStatus as unknown as HandlerExport)._handler
export const readOwnerEarnings = (
  readOwnerProviderEarnings as unknown as HandlerExport
)._handler
export const complete = (completePayoutTransfer as unknown as HandlerExport)._handler
export const reconcile = (reconcilePayoutTransfer as unknown as HandlerExport)._handler
export const markUnknown = (
  markPayoutTransferOutcomeUnknown as unknown as HandlerExport
)._handler
export const reserveConnect = (reserveConnectAccount as unknown as HandlerExport)
  ._handler
export const finalizeConnect = (finalizeConnectAccount as unknown as HandlerExport)
  ._handler
export const bindConnect = (bindConnectAccount as unknown as HandlerExport)._handler
export const connect = (recordConnectAccountEvent as unknown as HandlerExport)._handler

export const sourceArgs = {
  operationKey: 'money:test',
  correlationId: 'money:test:1',
}
export const amount = { currency: 'USD', units: '5000', exponent: 2 }
export const identity = {
  getUserIdentity: async () => ({ tokenIdentifier: 'principal:test' }),
}
export const ownerIdentity = {
  getUserIdentity: async () => ({
    tokenIdentifier: 'owner-token',
    subject: 'owner:test',
  }),
}
export const dailyPayoutPeriodStart = '2026-07-01T00:00:00.000Z'
export const dailyPayoutPeriodEnd = '2026-07-02T00:00:00.000Z'
export const normalTransferObservedAt = Date.parse(dailyPayoutPeriodEnd) + 1
export const normalProviderRecoveryDeadlineAt =
  normalTransferObservedAt + STRIPE_TRANSFER_RECOVERY_WINDOW_MS
export const normalProviderEvidenceObservedAt = normalTransferObservedAt + 1
export const dailyPayoutRef = canonicalDigest({
  format: 'money-daily-payout:v1',
  businessId: 'business-1',
  currency: 'USD',
  periodStart: dailyPayoutPeriodStart,
  periodEnd: dailyPayoutPeriodEnd,
} as const)
export const dailyPayoutQualifiedUseRef = 'qualified-use:payout-1'
export const dailyPayoutMaterialDigest = 'sha256:payout-material'
export const dailyPayoutAllocationRef = canonicalDigest({
  format: 'money-qualified-use-allocation:v1',
  qualifiedUseRef: dailyPayoutQualifiedUseRef,
  materialDigest: dailyPayoutMaterialDigest,
} as const)

export function seedPayout(
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
export function seedAdditionalDailyPayout(
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
export function creditProvider(
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

export function commandArgs(): Record<string, unknown> {
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

export function evidence(
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
export function completionArgs(
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

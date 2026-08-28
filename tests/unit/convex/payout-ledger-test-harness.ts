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
import { interactiveCredentialExpiryNonce } from '../../../convex/interactiveCredentialLifecycle'
import { STRIPE_TRANSFER_RECOVERY_WINDOW_MS } from '../../../src/modules/money/public'
import {
  PHASE_2_CRON_ACCOUNT_REF,
  PHASE_2_CRON_PRINCIPAL_REF,
  type WorkloadCronSnapshot,
} from '../../../convex/workloadCron'

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

  normalizeId(table: string, id: string): string | null {
    return (this.tables.get(table) ?? []).some((row) => row._id === id)
      ? id
      : null
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
    scheduler?: Record<string, never>
    auth: {
      getUserIdentity: () => Promise<{ tokenIdentifier: string; subject?: string } | null>
    }
  },
  args: Record<string, unknown>,
) => Promise<unknown>
type HandlerExport = { _handler: Handler }
const withConsequenceScheduler = (handler: Handler): Handler => async (ctx, args) =>
  handler({ ...ctx, scheduler: {} }, args)
export const begin = withConsequenceScheduler(
  (beginPayoutTransfer as unknown as HandlerExport)._handler,
)
export const dailySettle = (runDailySupplierSettlement as unknown as HandlerExport)
  ._handler
export const readOwnerTransfer = (
  readOwnerPayoutTransfer as unknown as HandlerExport
)._handler
export const readStatus = (readPayoutStatus as unknown as HandlerExport)._handler
export const readOwnerEarnings = (
  readOwnerProviderEarnings as unknown as HandlerExport
)._handler
export const complete = withConsequenceScheduler(
  (completePayoutTransfer as unknown as HandlerExport)._handler,
)
export const reconcile = withConsequenceScheduler(
  (reconcilePayoutTransfer as unknown as HandlerExport)._handler,
)
export const markUnknown = withConsequenceScheduler((
  markPayoutTransferOutcomeUnknown as unknown as HandlerExport
)._handler)
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
  getUserIdentity: async () => ({
    subject: 'owner:payout',
    issuer: 'https://identity.example',
    tokenIdentifier: 'https://identity.example|owner:payout',
    exp: 8_000_000_000,
  }),
}
export const ownerIdentity = {
  getUserIdentity: identity.getUserIdentity,
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
export const payoutOwningAccountRef = 'acc_11111111111111111111111111111111'
export const payoutAuthorityPrincipalRef = 'prn_33333333333333333333333333333333'
export const payoutAuthorityGrantRef = 'grt_44444444444444444444444444444444'
export const payoutAuthorityGrantGeneration = 1
export const dailySettlementWorkload: WorkloadCronSnapshot = {
  name: 'run daily supplier settlement',
  workloadKind: 'cron',
  actorPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
  activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
  correlationRef: 'cron:test:daily-settlement',
  idempotencyRef: 'cron:test:daily-settlement',
  purpose: 'run daily supplier settlement',
  source: 'convex/workloadCron:runDailySupplierSettlement',
  principalRevision: 1,
  activeAccountRevision: 1,
  accessVia: 'membership',
  admittedAt: 1,
}
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
  const authorityContext = {
    actorPrincipalRef: payoutAuthorityPrincipalRef,
    activeAccountRef: payoutOwningAccountRef,
    correlationRef: 'payout:test:authority',
    idempotencyRef: 'payout:test:authority',
  }
  const workloadActionContext = {
    actorPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
    activeAccountRef: PHASE_2_CRON_ACCOUNT_REF,
    correlationRef: 'payout:test:workload-account',
    idempotencyRef: 'payout:test:workload-account',
  }
  const workloadOwnershipRef = 'own_55555555555555555555555555555555'
  const payoutOwnershipRef = 'own_66666666666666666666666666666666'
  db.seed('principals', {
    _id: 'principals:payout-authority',
    principalRef: payoutAuthorityPrincipalRef,
    kind: 'human',
    displayName: 'Payout authority',
    lifecycle: 'active',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  })
  db.seed('principals', {
    _id: 'principals:cron-workload',
    principalRef: PHASE_2_CRON_PRINCIPAL_REF,
    kind: 'workload',
    displayName: 'Phase 2 scheduled workload',
    lifecycle: 'active',
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  })
  db.seed('accounts', {
    _id: 'accounts:payout-authority',
    accountRef: payoutOwningAccountRef,
    displayName: 'Payout authority account',
    lifecycle: 'active',
    recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: payoutAuthorityPrincipalRef,
    creationIdempotencyRef: authorityContext.idempotencyRef,
    initialOwnershipRef: payoutOwnershipRef,
    revision: 1,
    currentOwnershipRef: payoutOwnershipRef,
    createdAt: 1,
    updatedAt: 1,
    lastAction: authorityContext,
  })
  db.seed('accounts', {
    _id: 'accounts:cron-workload',
    accountRef: PHASE_2_CRON_ACCOUNT_REF,
    displayName: 'Phase 2 scheduled workload account',
    lifecycle: 'active',
    recoveryPolicy: { kind: 'no_transfer', revision: 1 },
    creationActorPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
    creationIdempotencyRef: workloadActionContext.idempotencyRef,
    initialOwnershipRef: workloadOwnershipRef,
    revision: 1,
    currentOwnershipRef: workloadOwnershipRef,
    createdAt: 1,
    updatedAt: 1,
    lastAction: workloadActionContext,
  })
  db.seed('accountOwnerships', {
    _id: 'accountOwnerships:payout-authority',
    ownershipRef: payoutOwnershipRef,
    accountRef: payoutOwningAccountRef,
    ownerPrincipalRef: payoutAuthorityPrincipalRef,
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: 1,
    createdBy: authorityContext,
  })
  db.seed('accountOwnerships', {
    _id: 'accountOwnerships:cron-workload',
    ownershipRef: workloadOwnershipRef,
    accountRef: PHASE_2_CRON_ACCOUNT_REF,
    ownerPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
    lifecycle: 'active',
    changeKind: 'creation',
    revision: 1,
    createdAt: 1,
    createdBy: workloadActionContext,
  })
  db.seed('memberships', {
    _id: 'memberships:cron-workload',
    membershipRef: 'mem_99999999999999999999999999999999',
    accountRef: PHASE_2_CRON_ACCOUNT_REF,
    memberPrincipalRef: PHASE_2_CRON_PRINCIPAL_REF,
    lifecycle: 'active',
    revision: 1,
    createdAt: 1,
    createdBy: workloadActionContext,
  })
  db.seed('authorityDelegationGrants', {
    _id: 'authorityDelegationGrants:payout-authority',
    grantRef: payoutAuthorityGrantRef,
    accountRef: payoutOwningAccountRef,
    actorPrincipalRef: payoutAuthorityPrincipalRef,
    subjectPrincipalRef: payoutAuthorityPrincipalRef,
    scopes: ['money:payout'],
    resourceRefs: ['operation:money'],
    budgetLimit: 1,
    budgetUsed: 0,
    expiresAt: Number.MAX_SAFE_INTEGER,
    generation: payoutAuthorityGrantGeneration,
    revision: 1,
    lifecycle: 'active',
    createdAt: 1,
    createdBy: authorityContext,
  })
  const credentialExpiresAt = 8_000_000_000_000
  const bindingRef = 'eib_77777777777777777777777777777777'
  const credentialRef = 'crd_88888888888888888888888888888888'
  db.seed('externalIdentityBindings', {
    _id: 'externalIdentityBindings:payout-owner',
    bindingRef,
    principalRef: payoutAuthorityPrincipalRef,
    providerNamespace: 'clerk/user',
    providerIdentifier: 'https://identity.example|owner:payout',
    providerState: { kind: 'known', value: 'active' },
    lifecycle: 'active',
    credentialGeneration: 1,
    revision: 1,
    createdAt: 1,
    updatedAt: 1,
  })
  db.seed('credentials', {
    _id: 'credentials:payout-owner',
    credentialRef,
    bindingRef,
    principalRef: payoutAuthorityPrincipalRef,
    type: 'provider_token',
    lifecycle: 'active',
    generation: 1,
    issueIdempotencyRef: `issue:${credentialRef}`,
    revision: 1,
    issuedAt: 1,
    expiresAt: credentialExpiresAt,
    expiryMaterialization: {
      state: 'scheduled',
      credentialGeneration: 1,
      credentialExpiresAt,
      scheduleNonce: interactiveCredentialExpiryNonce({
        bindingRef,
        credentialRef,
        generation: 1,
        expiresAt: credentialExpiresAt,
      }),
      scheduleRef: `scheduled:${credentialRef}`,
      materializedAt: 1,
    },
    updatedAt: 1,
  })
  const existingBusiness = db.rows('businesses').find((row) => row._id === 'business-1')
  if (existingBusiness === undefined) {
    db.seed('businesses', {
      _id: 'business-1',
      owningAccountRef: payoutOwningAccountRef,
      slug: 'payout-owner',
      name: 'Payout Owner',
      normalizedName: 'payout owner',
      category: 'testing',
      businessContext: { kind: 'local_human', suburb: 'Perth', stateTerritory: 'WA' },
      publicStatus: 'published',
      trustTier: 'listed',
      sourceHash: 'source:payout-owner',
      createdAt: 1,
      updatedAt: 1,
    })
  } else {
    existingBusiness.owningAccountRef = payoutOwningAccountRef
  }
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
    owningAccountRef: payoutOwningAccountRef,
    authorityPrincipalRef: payoutAuthorityPrincipalRef,
    authorityGrantRef: payoutAuthorityGrantRef,
    authorityGrantGeneration: payoutAuthorityGrantGeneration,
    authorityResourceRefs: ['operation:money'],
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
    owningAccountRef: payoutOwningAccountRef,
    authorityPrincipalRef: payoutAuthorityPrincipalRef,
    authorityGrantRef: payoutAuthorityGrantRef,
    authorityGrantGeneration: payoutAuthorityGrantGeneration,
    authorityResourceRef: 'operation:money',
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
    owningAccountRef: payoutOwningAccountRef,
    authorityPrincipalRef: payoutAuthorityPrincipalRef,
    authorityGrantRef: payoutAuthorityGrantRef,
    authorityGrantGeneration: payoutAuthorityGrantGeneration,
    authorityResourceRefs: ['operation:money'],
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
    owningAccountRef: payoutOwningAccountRef,
    authorityPrincipalRef: payoutAuthorityPrincipalRef,
    authorityGrantRef: payoutAuthorityGrantRef,
    authorityGrantGeneration: payoutAuthorityGrantGeneration,
    authorityResourceRef: 'operation:money',
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
    authority: { principalId: payoutAuthorityPrincipalRef },
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

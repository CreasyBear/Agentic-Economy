import { completeWork } from '../../../convex/capabilityOperationInvocations'
import { recordQualifiedUse } from '../../../convex/qualifiedUse'
import {
  authorizeInvocationCharge,
  readOperatorAccountVersion,
  markChargeOutcomeUnknown,
  reconcileCharge,
  reconcileInvocationCharge,
  reverseDisputedQualifiedUse,
} from '../../../convex/moneyLedger'
import {
  markChargeOutcomeUnknownHandler,
  reconcileInvocationChargeHandler,
} from '../../../convex/moneyChargeReconcile'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
} from '@/modules/money/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  buildDevelopmentPublishedOperationEvidence,
} from '../../../tools/dev/fixtures/capability-supply/development-published-operation-evidence'
import {
  createPublicOperationRef,
  materializeRuntimePublishedOperation,
  type PublishedOperation,
} from '@/modules/capability-supply/public'

export type Row = Record<string, unknown> & { _id: string }
type QueryBuilder = {
  eq: (field: string, value: unknown) => QueryBuilder
  gte: (field: string, value: unknown) => QueryBuilder
  lt: (field: string, value: unknown) => QueryBuilder
}
type Query = {
  withIndex: (
    name: string,
    build: (query: QueryBuilder) => QueryBuilder,
  ) => Query
  unique: () => Promise<Row | null>
  take: (limit: number) => Promise<Row[]>
}

export class MemoryDb {
  private readonly tables = new Map<string, Row[]>()

  seed(table: string, row: Row): void {
    this.tables.set(table, [...(this.tables.get(table) ?? []), row])
  }

  rows(table: string): Row[] {
    return [...(this.tables.get(table) ?? [])]
  }

  remove(table: string, predicate: (row: Row) => boolean): void {
    this.tables.set(
      table,
      (this.tables.get(table) ?? []).filter((row) => !predicate(row)),
    )
  }

  query(table: string): Query {
    const filters: Array<(row: Row) => boolean> = []
    const matches = () =>
      (this.tables.get(table) ?? []).filter((row) =>
        filters.every((filter) => filter(row)),
      )
    const query: Query = {
      withIndex: (_name, build) => {
        const builder: QueryBuilder = {
          eq: (field, value) => {
            filters.push((row) => row[field] === value)
            return builder
          },
          gte: (field, value) => {
            filters.push((row) =>
              typeof row[field] === 'number' &&
              typeof value === 'number' &&
              row[field] >= value,
            )
            return builder
          },
          lt: (field, value) => {
            filters.push((row) =>
              typeof row[field] === 'number' &&
              typeof value === 'number' &&
              row[field] < value,
            )
            return builder
          },
        }
        build(builder)
        return query
      },
      unique: async () => {
        const rows = matches()
        if (rows.length > 1) throw new Error('expected_unique')
        return rows[0] ?? null
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
    for (const rows of this.tables.values()) {
      const row = rows.find((candidate) => candidate._id === id)
      if (row === undefined) continue
      for (const [key, next] of Object.entries(value)) {
        if (next === undefined) delete row[key]
        else row[key] = next
      }
      return
    }
    throw new Error(`missing_row:${id}`)
  }
}

export type HandlerContext = {
  db: MemoryDb
  auth?: { getUserIdentity: () => Promise<{ tokenIdentifier: string } | null> }
  runMutation?: (
    reference: unknown,
    args: Record<string, unknown>,
  ) => Promise<unknown>
}
type Handler = (
  ctx: HandlerContext,
  args: Record<string, unknown>,
) => Promise<unknown>
type HandlerExport = { _handler: Handler }
const authorizeExport = authorizeInvocationCharge as unknown as HandlerExport
const reconcileExport = reconcileInvocationCharge as unknown as HandlerExport
const chargeReconcileExport = reconcileCharge as unknown as HandlerExport
const markerExport = markChargeOutcomeUnknown as unknown as HandlerExport
const disputeExport = reverseDisputedQualifiedUse as unknown as HandlerExport
const qualifiedUseExport = recordQualifiedUse as unknown as HandlerExport
const completionExport = completeWork as unknown as HandlerExport
const accountVersionExport = readOperatorAccountVersion as unknown as HandlerExport
export const authorizeHandler = authorizeExport._handler
export const authorityBoundChargeReconcileHandler = chargeReconcileExport._handler
export const authorityBoundMarkerHandler = markerExport._handler
export const markerHandler = markChargeOutcomeUnknownHandler as unknown as Handler
export const accountVersionHandler = accountVersionExport._handler
export const authorityBoundReconcileHandler = reconcileExport._handler
export const reconcileHandler = reconcileInvocationChargeHandler as unknown as Handler
export const disputeHandler = disputeExport._handler
const rawQualifiedUseHandler = qualifiedUseExport._handler
export const qualifiedUseHandler: Handler = async (ctx, args) =>
  await rawQualifiedUseHandler(
    { ...ctx, runMutation: async () => undefined },
    args,
  )
export const completionHandler = completionExport._handler
export const invocationRef = 'operation-invocation:test-money'
export const principalId = 'prn_33333333333333333333333333333333'
export const ownerId = 'owner:test-money'
export const credentialId = 'credential:test-money'
export const attemptRef = `operation-attempt:${invocationRef}:1`
export const transactionRef = `operation-money:${invocationRef}:${attemptRef}:1`
export const refundTransactionRef = `operation-money-refund:${invocationRef}:${attemptRef}:1`
export const input = { symbol: 'BTC', convert: 'USD' }
export const inputDigest = canonicalDigest(input)
export const sourceDigest = 'sha256:source-money'
export const now = 1_000

export function reconciliationArgs(
  outcome: 'not_released' | 'released' = 'not_released',
  identity: Readonly<{
    invocationRef: string
    attemptRef: string
    transactionRef: string
  }> = { invocationRef, attemptRef, transactionRef },
): Record<string, unknown> {
  const nextRefundTransactionRef =
    `operation-money-refund:${identity.invocationRef}:${identity.attemptRef}:1`
  return {
    invocationRef: identity.invocationRef,
    principalId,
    credentialId,
    attemptRef: identity.attemptRef,
    transactionRef: identity.transactionRef,
    inputDigest,
    outcome,
    refundTransactionRef: nextRefundTransactionRef,
    refundIdempotencyKey: nextRefundTransactionRef,
    refundInputDigest: canonicalDigest({
      format: 'operation-money-refund:v1',
      invocationRef: identity.invocationRef,
      attemptRef: identity.attemptRef,
      inputDigest,
      transactionRef: identity.transactionRef,
      outcome,
    }),
    sourceDigest,
    evidenceRefs: ['operation-money-reconciliation:sha256:evidence-money'],
    observedAt: now,
  }
}


export const authorizationAmount = { currency: 'USD', units: '0', exponent: 2 }
export const authorizationMaximumSpend = { currency: 'USD', units: '0', exponent: 2 }
export const authorizationPriceDigest = canonicalDigest({
  version: 'pricing:v2',
  unit: 'call',
  paidAmount: authorizationAmount,
})
export const authorizationOperation: PublishedOperation = (() => {
  const original = buildDevelopmentPublishedOperationEvidence().operation
  const pricingConfig = {
    version: 'pricing:v2' as const,
    unit: 'call' as const,
    paidAmount: authorizationAmount,
  }
  const identity = {
    ...original.identity,
    businessId: 'business:money',
    offeringId: 'offering:money',
    price: { kind: 'fixed' as const, amount: authorizationAmount },
    priceDigest: authorizationPriceDigest,
    pricingConfig,
  }
  return {
    ...original,
    operationId: 'operation:money',
    materialDigest: canonicalDigest(identity as never),
    identity,
    priceDigest: authorizationPriceDigest,
    pricingConfig,
    offering: {
      ...original.offering,
      businessId: 'business:money',
      offeringId: 'offering:money',
      presentation: {
        ...original.offering.presentation,
        price: { kind: 'fixed' as const, amount: authorizationAmount },
      },
    },
    readiness: {
      ...original.readiness,
      evidenceRefs: ['evidence:money'],
    },
  } as PublishedOperation
})()
export const authorizationOperationRef = createPublicOperationRef({
  operationId: authorizationOperation.operationId,
  publicationRef: authorizationOperation.identity.publicationRef,
  publicationRevision: authorizationOperation.identity.publicationRevision,
  contractRef: authorizationOperation.contract.ref,
})
export const authorizationDescriptor = materializeRuntimePublishedOperation(
  authorizationOperation,
)
export const authorizationBasis = {
  kind: 'approve_each' as const,
  authorityRef: 'authority:money',
}
export const authorizationExpiresAt = new Date(now + 60_000).toISOString()
export const authorizationAuthorityMaterial = {
  format: 'operation-invoke-authority:v1' as const,
  invocationRef,
  operationRef: authorizationOperationRef,
  inputDigest,
  grantRef: 'grant:money',
  grantGeneration: 1,
  grantDigest: 'sha256:policy-money',
  reference: authorizationBasis.authorityRef,
  targetDigest: canonicalDigest(authorizationOperation.identity as never),
  consequence: authorizationDescriptor.consequenceClass,
  limits: { amount: authorizationAmount },
  expiresAt: authorizationExpiresAt,
  acceptedBasis: authorizationBasis,
}
export const authorizationAuthority = {
  ...authorizationAuthorityMaterial,
  decisionDigest: canonicalDigest(authorizationAuthorityMaterial as never),
}


export function authorizationArgs(): Record<string, unknown> {
  return {
    principalId,
    amount: authorizationAmount,
    operatorAccountRef: accountRefForOwner(ownerId, 'USD'),
    providerAccountRef: accountRefForProvider('business:money', 'USD'),
    rakeAccountRef: accountRefForRake('USD'),
    transactionRef,
    idempotencyKey: transactionRef,
    inputDigest,
    expectedAccountVersion: 1,
    rakeBps: 1_000,
    priceDigest: authorizationPriceDigest,
    priceSourceDigest: authorizationPriceDigest,
    authorityMaximumSpend: authorizationMaximumSpend,
    credentialId,
    applicationRef: 'application:test-money',
    serviceRef: authorizationOperation.operationId,
    offeringRef: authorizationOperation.identity.offeringId,
    businessId: authorizationOperation.identity.businessId,
    invocationRef,
    attemptRef,
    operationKey: authorizationOperationRef,
    sourceDigest: authorizationOperation.materialDigest,
    evidenceRefs: [...authorizationOperation.readiness.evidenceRefs],
    observedAt: now,
    freeTier: false,
    credentialBudgetGrantRef: 'grant:money',
    credentialBudgetGeneration: 1,
  }
}

export function qualifiedUseArgs(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    invocationRef,
    attemptRef,
    effectGeneration: 1,
    businessId: 'business:money',
    operationRef: 'operation:money',
    publicationRef: 'publication:money',
    publicationRevision: 1,
    contractDigest: 'sha256:contract-qualified',
    bindingDigest: 'sha256:binding-qualified',
    principalClass: 'agent_key',
    requestDigest: 'sha256:request-qualified',
    responseDigest: 'sha256:response-qualified',
    evidenceRefs: ['evidence:qualified'],
    principalId,
    environment: 'production',
    qualifiedAt: now,
    usageRef: `${invocationRef}:usage`,
    transactionRef,
    ...overrides,
  }
}
export type FreeTierFixture = Readonly<{
  invocationRef: string
  attemptRef: string
  transactionRef: string
  usageRef: string
  principalId: string
  businessId: string
  operationRef: string
}>

export function freeTierQualifiedUseArgs(
  fixture: FreeTierFixture,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return qualifiedUseArgs({
    invocationRef: fixture.invocationRef,
    attemptRef: fixture.attemptRef,
    principalId: fixture.principalId,
    businessId: fixture.businessId,
    operationRef: fixture.operationRef,
    usageRef: fixture.usageRef,
    transactionRef: fixture.transactionRef,
    ...overrides,
  })
}

export function completionContext(db: MemoryDb): {
  db: MemoryDb
  runMutation: (
    reference: unknown,
    args: Record<string, unknown>,
  ) => Promise<unknown>
} {
  return {
    db,
    runMutation: async (_reference, args) =>
      await reconcileHandler({ db }, args),
  }
}
export function markerContext(db: MemoryDb): HandlerContext {
  return {
    db,
    auth: {
      getUserIdentity: async () => ({ tokenIdentifier: principalId }),
    },
  }
}

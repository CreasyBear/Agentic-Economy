import type { Doc } from './_generated/dataModel'
import type { MutationCtx } from './_generated/server'
import { canonicalDigest } from '../src/modules/common/canonical-digest'
import type { StableHashValue } from '../src/modules/common/stable-hash'
import {
  accountRefForOwner,
  accountRefForProvider,
  accountRefForRake,
  addExactAmounts,
  amountFromParts,
  compareExactAmounts,
  payoutAccrualFromChargeAmounts,
  qualifiedUseMaterialDigest,
  qualifiedUseRef,
  zeroExactAmount,
  type ExactAmount,
  type QualifiedUseReceipt,
} from '../src/modules/money/public'
import { accountFromRow } from './moneyCanonicalAccounts'
import {
  chargeJournalRecoveryAmount,
  type MoneyLedgerEntryRow,
  validateChargeJournal,
} from './moneyChargeJournal'
import {
  DELEGATION_MAX_RESOURCES,
  delegationGrantRef,
  DelegationService,
  type DelegationStore,
} from '../src/modules/authority/delegation/public'
import {
  accountRef,
  principalRef,
} from '../src/modules/principal-account/public'
import {
  createConvexDelegationContextPort,
  createConvexDelegationStore,
} from './lib/delegationPersistence'

const DAILY_PAYOUT_ALLOCATION_READ_LIMIT = 1_000
const ACCOUNT_REF_PATTERN = /^acc_[0-9a-f]{32}$/u

export type CanonicalPayoutAuthority = Readonly<{
  owningAccountRef: string
  authorityPrincipalRef: string
  authorityGrantRef: string
  authorityGrantGeneration: number
}>

export type CanonicalQualifiedUseAuthority = CanonicalPayoutAuthority &
  Readonly<{ authorityResourceRef: string }>

export type CanonicalPayoutSettlementAuthority = CanonicalPayoutAuthority &
  Readonly<{ authorityResourceRefs: readonly string[] }>

type PinnedAuthorityFields = Readonly<{
  owningAccountRef?: string
  authorityPrincipalRef?: string
  authorityGrantRef?: string
  authorityGrantGeneration?: number
}>

type PinnedResourceFields = Readonly<{
  authorityResourceRef?: string
  authorityResourceRefs?: readonly string[]
}>

function qualifiedUseAuthorityFailure(): never {
  throw new Error('qualified_use_authority_invalid')
}

function pinnedAuthorityFromRow(
  row: PinnedAuthorityFields,
): CanonicalPayoutAuthority | undefined {
  return typeof row.owningAccountRef === 'string' &&
    /^acc_[0-9a-f]{32}$/u.test(row.owningAccountRef) &&
    typeof row.authorityPrincipalRef === 'string' &&
    /^prn_[0-9a-f]{32}$/u.test(row.authorityPrincipalRef) &&
    typeof row.authorityGrantRef === 'string' &&
    /^grt_[0-9a-f]{32}$/u.test(row.authorityGrantRef) &&
    Number.isSafeInteger(row.authorityGrantGeneration) &&
    (row.authorityGrantGeneration ?? -1) >= 0
    ? {
        owningAccountRef: row.owningAccountRef,
        authorityPrincipalRef: row.authorityPrincipalRef,
        authorityGrantRef: row.authorityGrantRef,
        authorityGrantGeneration: row.authorityGrantGeneration as number,
      }
    : undefined
}

function samePinnedAuthority(
  row: PinnedAuthorityFields,
  authority: CanonicalPayoutAuthority,
): boolean {
  return row.owningAccountRef === authority.owningAccountRef &&
    row.authorityPrincipalRef === authority.authorityPrincipalRef &&
    row.authorityGrantRef === authority.authorityGrantRef &&
    row.authorityGrantGeneration === authority.authorityGrantGeneration
}

async function resolveCurrentGrantAuthority(
  ctx: MutationCtx,
  input: Readonly<{
    grantRef: string
    generation: number
    expectedAccountRef?: string
    expectedPrincipalRef?: string
    expectedExpiresAt?: number
    requiredResourceRefs: readonly string[]
  }>,
): Promise<CanonicalPayoutAuthority> {
  if (!/^grt_[0-9a-f]{32}$/u.test(input.grantRef) ||
    !Number.isSafeInteger(input.generation) || input.generation < 0)
    return qualifiedUseAuthorityFailure()
  const grant = await ctx.db
    .query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', input.grantRef))
    .unique()
  const consequenceNow = Date.now()
  if (grant === null || !Number.isFinite(consequenceNow) ||
    grant.grantRef !== input.grantRef ||
    grant.generation !== input.generation ||
    grant.lifecycle !== 'active' || grant.expiresAt <= consequenceNow ||
    (input.expectedExpiresAt !== undefined &&
      grant.expiresAt !== input.expectedExpiresAt) ||
    (input.expectedPrincipalRef !== undefined &&
      grant.subjectPrincipalRef !== input.expectedPrincipalRef) ||
    (input.expectedAccountRef !== undefined &&
      grant.accountRef !== input.expectedAccountRef) ||
    grant.createdBy.activeAccountRef !== grant.accountRef ||
    !ACCOUNT_REF_PATTERN.test(grant.accountRef))
    return qualifiedUseAuthorityFailure()
  const account = await ctx.db
    .query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', grant.accountRef))
    .unique()
  if (account === null || account.accountRef !== grant.accountRef ||
    account.lifecycle !== 'active') return qualifiedUseAuthorityFailure()
  const trustedPrincipalRef = grant.subjectPrincipalRef
  try {
    const baseStore = createConvexDelegationStore(ctx)
    const readOnlyStore: DelegationStore = {
      transact: async (operation) => await baseStore.transact(
        async (transaction) => await operation({
          ...transaction,
          getSnapshotByAdmissionIdempotency: async () => undefined,
          getSnapshot: async () => undefined,
          commit: async () => undefined,
        }),
      ),
    }
    const evidenceRef = canonicalDigest({
      format: 'qualified-use-authority-validation:v1',
      grantRef: grant.grantRef,
      generation: grant.generation,
      accountRef: grant.accountRef,
      principalRef: trustedPrincipalRef,
      resourceRefs: [...input.requiredResourceRefs],
    } as StableHashValue)
    const snapshot = await new DelegationService(
      readOnlyStore,
      createConvexDelegationContextPort(ctx, principalRef(trustedPrincipalRef)),
      { randomUuid: () => '00000000-0000-4000-8000-000000000001' },
    ).admitConsequence({
      grantRef: delegationGrantRef(grant.grantRef),
      expectedGeneration: grant.generation,
      context: {
        actorPrincipalRef: principalRef(trustedPrincipalRef),
        activeAccountRef: accountRef(grant.accountRef),
        correlationRef: evidenceRef,
        idempotencyRef: evidenceRef,
      },
      requiredScopes: grant.scopes,
      resourceRefs: input.requiredResourceRefs,
      budgetAmount: 0,
    })
    if (snapshot.accountRef !== grant.accountRef ||
      snapshot.actorPrincipalRef !== trustedPrincipalRef ||
      snapshot.subjectPrincipalRef !== trustedPrincipalRef ||
      snapshot.grantRef !== grant.grantRef ||
      snapshot.generation !== grant.generation) return qualifiedUseAuthorityFailure()
  } catch (error) {
    void error
    return qualifiedUseAuthorityFailure()
  }
  return {
    owningAccountRef: grant.accountRef,
    authorityPrincipalRef: trustedPrincipalRef,
    authorityGrantRef: grant.grantRef,
    authorityGrantGeneration: grant.generation,
  }
}

/** Resolve Account provenance only from the durable invocation's pinned grant. */
export async function resolveCanonicalInvocationAuthority(
  ctx: MutationCtx,
  invocationRef: string,
): Promise<CanonicalQualifiedUseAuthority> {
  if (invocationRef.trim().length === 0) return qualifiedUseAuthorityFailure()
  const invocation = await ctx.db
    .query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) =>
      query.eq('invocationRef', invocationRef),
    )
    .unique()
  if (invocation === null || invocation.invocationRef !== invocationRef ||
    invocation.environment !== 'production') return qualifiedUseAuthorityFailure()
  return await resolveCurrentGrantAuthority(ctx, {
    grantRef: invocation.grantRef,
    generation: invocation.grantGeneration,
    expectedPrincipalRef: invocation.principalId,
    expectedExpiresAt: invocation.grantExpiresAt,
    requiredResourceRefs: [invocation.operationRef],
  }).then((authority) => ({
    ...authority,
    authorityResourceRef: invocation.operationRef,
  }))
}

/**
 * Consequence-time seam for payout settlement. Legacy rows and mixed authority
 * compositions are held instead of becoming transferable.
 */
export async function requireCanonicalPayoutAuthority(
  ctx: MutationCtx,
  payout: Pick<Doc<'moneyPayouts'>, '_id' | 'payoutRef'> &
    PinnedAuthorityFields & PinnedResourceFields,
): Promise<CanonicalPayoutSettlementAuthority> {
  const pinned = pinnedAuthorityFromRow(payout)
  if (pinned === undefined) return qualifiedUseAuthorityFailure()
  const allocations = await ctx.db
    .query('moneyPayoutAllocations')
    .withIndex('by_payoutRef_and_qualifiedAt', (query) =>
      query.eq('payoutRef', payout.payoutRef),
    )
    .take(DAILY_PAYOUT_ALLOCATION_READ_LIMIT + 1)
  const resourceRefs = canonicalAuthorityResourceRefs(
    allocations.map((allocation) =>
      (allocation as typeof allocation & PinnedResourceFields)
        .authorityResourceRef,
    ),
  )
  const pinnedResourceRefs = canonicalAuthorityResourceRefs(
    payout.authorityResourceRefs ?? [],
  )
  if (allocations.length === 0 ||
    allocations.length > DAILY_PAYOUT_ALLOCATION_READ_LIMIT ||
    resourceRefs === undefined || pinnedResourceRefs === undefined ||
    resourceRefs.length !== pinnedResourceRefs.length ||
    resourceRefs.some((resourceRef, index) =>
      resourceRef !== pinnedResourceRefs[index]) ||
    allocations.some((allocation) => !samePinnedAuthority(
      allocation as typeof allocation & PinnedAuthorityFields,
      pinned,
    ))) return qualifiedUseAuthorityFailure()
  const authority = await resolveCurrentGrantAuthority(ctx, {
    grantRef: pinned.authorityGrantRef,
    generation: pinned.authorityGrantGeneration,
    expectedAccountRef: pinned.owningAccountRef,
    expectedPrincipalRef: pinned.authorityPrincipalRef,
    requiredResourceRefs: resourceRefs,
  })
  return { ...authority, authorityResourceRefs: resourceRefs }
}

function canonicalAuthorityResourceRefs(
  values: readonly unknown[],
): readonly string[] | undefined {
  if (values.length === 0 || values.length > DELEGATION_MAX_RESOURCES ||
    values.some((value) => typeof value !== 'string' ||
      !/^[A-Za-z0-9*][A-Za-z0-9._:/*-]{0,199}$/u.test(value))) return undefined
  const sorted = [...new Set(values as readonly string[])].sort()
  return sorted.length === values.length ? sorted : undefined
}
type QualifiedUsePayoutAmounts = Readonly<{
  businessId: string
  currency: string
  exponent: number
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
  sourceDigest: string
}>
type QualifiedUsePayoutResolution =
  | Readonly<{
      kind: 'eligible'
      amounts: QualifiedUsePayoutAmounts
    }>
  | Readonly<{
      kind: 'excluded'
      reason: 'free_tier'
    }>
  | Readonly<{
      kind: 'excluded'
      reason: 'refunded_before_delivery'
      amounts: QualifiedUsePayoutAmounts
    }>

export type DailyPayoutIdentity = Readonly<{
  payoutRef: string
  periodStart: string
  periodEnd: string
  periodStartAt: number
  periodEndAt: number
}>

function utcDayStartAt(timestamp: number): number {
  const date = new Date(timestamp)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

export function utcPeriodStartIso(now: number, daysAgo: number): string {
  return new Date(utcDayStartAt(now) - daysAgo * 86_400_000).toISOString()
}

export function dailyPayoutIdentity(
  businessId: string,
  currency: string,
  qualifiedAt: number,
): DailyPayoutIdentity {
  const timestamp = new Date(qualifiedAt).getTime()
  if (!Number.isFinite(timestamp))
    throw new Error('qualified_use_payout_allocation_invalid')
  const periodStartAt = utcDayStartAt(timestamp)
  const periodEndAt = periodStartAt + 86_400_000
  const periodStart = new Date(periodStartAt).toISOString()
  const periodEnd = new Date(periodEndAt).toISOString()
  return {
    payoutRef: canonicalDigest({
      format: 'money-daily-payout:v1',
      businessId,
      currency,
      periodStart,
      periodEnd,
    } as StableHashValue),
    periodStart,
    periodEnd,
    periodStartAt,
    periodEndAt,
  }
}
export function dailyPayoutIdentityFromRow(
  row: Doc<'moneyPayouts'>,
): DailyPayoutIdentity | undefined {
  if (row.cadence !== 'daily') return undefined
  const periodStartAt = Date.parse(row.periodStart)
  if (!Number.isFinite(periodStartAt)) return undefined
  let period: DailyPayoutIdentity
  try {
    period = dailyPayoutIdentity(row.businessId, row.currency, periodStartAt)
  } catch {
    return undefined
  }
  return row.payoutRef === period.payoutRef &&
    row.periodStart === period.periodStart &&
    row.periodEnd === period.periodEnd
    ? period
    : undefined
}

export function qualifiedUseAllocationRef(
  receipt: Pick<QualifiedUseReceipt, 'qualifiedUseRef' | 'materialDigest'>,
): string {
  return canonicalDigest({
    format: 'money-qualified-use-allocation:v1',
    qualifiedUseRef: receipt.qualifiedUseRef,
    materialDigest: receipt.materialDigest,
  } as StableHashValue)
}

function qualifiedUsePayoutFailure(): never {
  throw new Error('qualified_use_payout_allocation_invalid')
}
function isCanonicalFreeTierCharge(
  receipt: QualifiedUseReceipt,
  principalId: string,
  transaction: Doc<'moneyTransactions'>,
  usage: Doc<'moneyUsageEvents'>,
  entries: readonly MoneyLedgerEntryRow[],
  allowReversedTransaction: boolean,
): boolean {
  const transactionAmount =
    transaction.amountUnits === undefined
      ? undefined
      : amountFromParts(
          transaction.currency,
          transaction.amountUnits,
          transaction.exponent,
        )
  const usageAmount = amountFromParts(
    usage.currency,
    usage.amountUnits,
    usage.exponent,
  )
  return (
    entries.length === 0 &&
    transactionAmount !== undefined &&
    usageAmount !== undefined &&
    transaction.kind === 'charge' &&
    (transaction.state === 'applied' ||
      (allowReversedTransaction && transaction.state === 'reversed')) &&
    transaction.idempotencyKey === transaction.transactionRef &&
    transaction.transactionRef === receipt.transactionRef &&
    transaction.accountId !== undefined &&
    transaction.accountId === usage.accountId &&
    transaction.principalId === principalId &&
    usage.principalId === principalId &&
    transaction.budgetEnvironment === receipt.environment &&
    receipt.environment === 'production' &&
    transaction.currency === usage.currency &&
    transaction.exponent === usage.exponent &&
    transactionAmount.units === '0' &&
    usage.usageRef === receipt.usageRef &&
    usage.transactionRef === receipt.transactionRef &&
    usage.chargeState === 'free_tier' &&
    usageAmount.units === '0' &&
    usage.businessId === receipt.businessId &&
    usage.invocationRef === receipt.invocationRef &&
    usage.attemptRef === receipt.attemptRef &&
    usage.operationKey === receipt.operationRef &&
    usage.serviceRef.trim().length > 0 &&
    usage.offeringRef.trim().length > 0 &&
    usage.observedAt === transaction.createdAt
  )
}

async function readQualifiedUsePayoutAmounts(
  ctx: Pick<MutationCtx, 'db'>,
  receipt: QualifiedUseReceipt,
  eligibilityPrincipalId: string,
  allowReversedFreeTier = false,
): Promise<QualifiedUsePayoutResolution> {
  if (
    eligibilityPrincipalId.trim().length === 0 ||
    receipt.environment !== 'production' ||
    receipt.qualifiedUseRef !== qualifiedUseRef(receipt) ||
    receipt.materialDigest !== qualifiedUseMaterialDigest(receipt) ||
    receipt.qualifiedUseRef.length === 0 ||
    receipt.materialDigest.length === 0 ||
    receipt.transactionRef === undefined ||
    receipt.transactionRef.length === 0 ||
    receipt.usageRef === undefined ||
    receipt.usageRef.length === 0
  )
    return qualifiedUsePayoutFailure()
  const transactionRef = receipt.transactionRef
  const usageRef = receipt.usageRef
  const [transaction, usage, entries] = await Promise.all([
    ctx.db
      .query('moneyTransactions')
      .withIndex('by_transactionRef', (query) =>
        query.eq('transactionRef', transactionRef),
      )
      .unique(),
    ctx.db
      .query('moneyUsageEvents')
      .withIndex('by_usageRef', (query) =>
        query.eq('usageRef', usageRef),
      )
      .unique(),
    ctx.db
      .query('moneyLedgerEntries')
      .withIndex('by_transactionRef', (query) =>
        query.eq('transactionRef', transactionRef),
      )
      .take(10),
  ])
  if (transaction === null || usage === null)
    return qualifiedUsePayoutFailure()
  if (
    transaction.principalId !== eligibilityPrincipalId ||
    usage.principalId !== eligibilityPrincipalId ||
    transaction.budgetEnvironment !== receipt.environment ||
    receipt.environment !== 'production'
  )
    return qualifiedUsePayoutFailure()
  if (
    transaction.amountUnits === '0' ||
    usage.chargeState === 'free_tier'
  )
    return isCanonicalFreeTierCharge(
      receipt,
      eligibilityPrincipalId,
      transaction,
      usage,
      entries,
      allowReversedFreeTier,
    )
      ? { kind: 'excluded' as const, reason: 'free_tier' as const }
      : qualifiedUsePayoutFailure()
  const refundedBeforeDelivery =
    transaction.state === 'reversed' &&
    transaction.budgetState === 'released' &&
    transaction.settledAt !== undefined
  const settledPaidCharge =
    transaction.state === 'applied' &&
    transaction.budgetState === 'settled' &&
    transaction.settledAt !== undefined
  if (
    (!settledPaidCharge && !refundedBeforeDelivery) ||
    transaction.amountUnits === undefined ||
    transaction.amountUnits === '0' ||
    usage.usageRef !== receipt.usageRef ||
    usage.transactionRef !== receipt.transactionRef ||
    usage.chargeState !== 'paid' ||
    usage.invocationRef !== receipt.invocationRef ||
    usage.attemptRef !== receipt.attemptRef ||
    usage.businessId !== receipt.businessId ||
    usage.operationKey !== receipt.operationRef
  )
    return qualifiedUsePayoutFailure()
  const journal = validateChargeJournal(
    transaction,
    usage,
    entries,
  )
  if (
    journal === undefined ||
    journal.businessId !== receipt.businessId ||
    journal.usage.invocationRef !== receipt.invocationRef ||
    journal.usage.attemptRef !== receipt.attemptRef ||
    journal.selected.charge.sourceDigest.length === 0
  )
    return qualifiedUsePayoutFailure()
  const [operatorAccount, providerAccount, rakeAccount] = await Promise.all([
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', journal.selected.charge.accountRef),
      )
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', journal.selected.provider.accountRef),
      )
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (query) =>
        query.eq('accountRef', journal.selected.rake.accountRef),
      )
      .unique(),
  ])
  const operatorDomain =
    operatorAccount === null ? undefined : accountFromRow(operatorAccount)
  const providerDomain =
    providerAccount === null ? undefined : accountFromRow(providerAccount)
  const rakeDomain =
    rakeAccount === null ? undefined : accountFromRow(rakeAccount)
  if (
    operatorAccount === null ||
    providerAccount === null ||
    rakeAccount === null ||
    operatorDomain === undefined ||
    providerDomain === undefined ||
    rakeDomain === undefined ||
    operatorAccount.accountRef !== accountRefForOwner(journal.accountId, transaction.currency) ||
    operatorAccount.accountKind !== 'operator_credit' ||
    operatorAccount.accountId !== journal.accountId ||
    operatorAccount.businessId !== undefined ||
    providerAccount.accountRef !== accountRefForProvider(journal.businessId, transaction.currency) ||
    providerAccount.accountKind !== 'provider_earnings' ||
    providerAccount.businessId !== journal.businessId ||
    providerAccount.accountId !== undefined ||
    rakeAccount.accountRef !== accountRefForRake(transaction.currency) ||
    rakeAccount.accountKind !== 'ae_rake' ||
    rakeAccount.accountId !== undefined ||
    rakeAccount.businessId !== undefined ||
    operatorAccount.currency !== transaction.currency ||
    providerAccount.currency !== transaction.currency ||
    rakeAccount.currency !== transaction.currency ||
    operatorAccount.exponent !== transaction.exponent ||
    providerAccount.exponent !== transaction.exponent ||
    rakeAccount.exponent !== transaction.exponent ||
    new Set([
      journal.selected.charge.accountRef,
      journal.selected.provider.accountRef,
      journal.selected.rake.accountRef,
    ]).size !== 3
  )
    return qualifiedUsePayoutFailure()
  const recoveryAmount = chargeJournalRecoveryAmount(journal)
  if (recoveryAmount === undefined) return qualifiedUsePayoutFailure()
  const accrual = payoutAccrualFromChargeAmounts({
    transactionRef: transaction.transactionRef,
    businessId: journal.businessId,
    chargeAmount: journal.chargeAmount,
    providerAmount: journal.providerAmount,
    rakeAmount: journal.rakeAmount,
    recoveryAmount,
    accountCurrency: providerAccount.currency,
    accountExponent: providerAccount.exponent,
  })
  if (accrual === undefined) return qualifiedUsePayoutFailure()
  const amounts = {
    businessId: accrual.businessId,
    currency: accrual.currency,
    exponent: accrual.exponent,
    grossAccrual: accrual.grossAccrual,
    rake: accrual.rake,
    providerNet: accrual.providerNet,
    sourceDigest: journal.selected.charge.sourceDigest,
  }
  return refundedBeforeDelivery
    ? {
        kind: 'excluded' as const,
        reason: 'refunded_before_delivery' as const,
        amounts,
      }
    : { kind: 'eligible' as const, amounts }
}

export function allocationAmountsFromRow(
  row: Doc<'moneyPayoutAllocations'>,
): Readonly<{
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
}> | undefined {
  const grossAccrual = amountFromParts(
    row.currency,
    row.grossAccrualUnits,
    row.exponent,
  )
  const rake = amountFromParts(row.currency, row.rakeUnits, row.exponent)
  const providerNet = amountFromParts(
    row.currency,
    row.providerNetUnits,
    row.exponent,
  )
  const expectedGross =
    rake === undefined || providerNet === undefined
      ? undefined
      : addExactAmounts(providerNet, rake)
  return grossAccrual === undefined ||
    rake === undefined ||
    providerNet === undefined ||
    expectedGross === undefined ||
    compareExactAmounts(expectedGross, grossAccrual) !== 0
    ? undefined
    : { grossAccrual, rake, providerNet }
}

export type DailyPayoutComposition = Readonly<{
  rows: readonly Doc<'moneyPayoutAllocations'>[]
  grossAccrual: ExactAmount
  rake: ExactAmount
  providerNet: ExactAmount
}>
export async function readDailyPayoutComposition(
  ctx: Pick<MutationCtx, 'db'>,
  period: DailyPayoutIdentity,
  businessId: string,
  currency: string,
  exponent: number,
): Promise<DailyPayoutComposition> {
  const rows = await ctx.db
    .query('moneyPayoutAllocations')
    .withIndex('by_payoutRef_and_qualifiedAt', (query) =>
      query.eq('payoutRef', period.payoutRef),
    )
    .take(DAILY_PAYOUT_ALLOCATION_READ_LIMIT + 1)
  if (rows.length > DAILY_PAYOUT_ALLOCATION_READ_LIMIT)
    return qualifiedUsePayoutFailure()
  const allocations = new Map<string, Doc<'moneyPayoutAllocations'>>()
  let compositionAuthority: CanonicalPayoutAuthority | undefined
  let grossAccrual = zeroExactAmount(currency, exponent)
  let rake = zeroExactAmount(currency, exponent)
  let providerNet = zeroExactAmount(currency, exponent)
  if (grossAccrual === undefined || rake === undefined || providerNet === undefined)
    return qualifiedUsePayoutFailure()
  for (const row of rows) {
    const amounts = allocationAmountsFromRow(row)
    const rowAuthority = pinnedAuthorityFromRow(
      row as typeof row & PinnedAuthorityFields,
    )
    const rowResourceRef = (
      row as typeof row & PinnedResourceFields
    ).authorityResourceRef
    if (
      amounts === undefined ||
      rowAuthority === undefined ||
      canonicalAuthorityResourceRefs([rowResourceRef]) === undefined ||
      (compositionAuthority !== undefined &&
        !samePinnedAuthority(rowAuthority, compositionAuthority)) ||
      row.allocationRef !== qualifiedUseAllocationRef({
        qualifiedUseRef: row.qualifiedUseRef,
        materialDigest: row.materialDigest,
      }) ||
      row.allocationRef.trim().length === 0 ||
      row.payoutRef !== period.payoutRef ||
      row.businessId !== businessId ||
      row.currency !== currency ||
      row.exponent !== exponent ||
      row.qualifiedAt < period.periodStartAt ||
      row.qualifiedAt >= period.periodEndAt ||
      row.sourceDigest.trim().length === 0 ||
      row.materialDigest.trim().length === 0 ||
      allocations.has(row.allocationRef)
    )
      return qualifiedUsePayoutFailure()
    compositionAuthority = rowAuthority
    allocations.set(row.allocationRef, row)
  }
  const corrections = await ctx.db
    .query('moneyLedgerEntries')
    .withIndex('by_payoutRef_and_allocationRef', (query) =>
      query.eq('payoutRef', period.payoutRef),
    )
    .take(DAILY_PAYOUT_ALLOCATION_READ_LIMIT + 1)
  if (corrections.length > DAILY_PAYOUT_ALLOCATION_READ_LIMIT)
    return qualifiedUsePayoutFailure()
  const correctedAllocations = new Map<string, ExactAmount>()
  for (const correction of corrections) {
    const allocation =
      correction.allocationRef === undefined
        ? undefined
        : allocations.get(correction.allocationRef)
    const allocationAmounts =
      allocation === undefined
        ? undefined
        : allocationAmountsFromRow(allocation)
    const correctionAmount = amountFromParts(
      correction.currency,
      correction.amountUnits,
      correction.exponent,
    )
    const allocationCorrectionAmount =
      correction.allocationCorrectionUnits === undefined
        ? undefined
        : amountFromParts(
            correction.currency,
            correction.allocationCorrectionUnits,
            correction.exponent,
          )
    const expectedAllocationCorrectionAmount =
      allocation === undefined
        ? undefined
        : amountFromParts(
            allocation.currency,
            allocation.providerNetUnits,
            allocation.exponent,
          )
    if (
      allocation === undefined ||
      allocationAmounts === undefined ||
      correction.entryType !== 'refund' ||
      correction.direction !== 'debit' ||
      correction.accountRef !== accountRefForProvider(businessId, currency) ||
      correction.businessId !== businessId ||
      correction.payoutRef !== period.payoutRef ||
      correction.allocationRef !== allocation.allocationRef ||
      correction.reversalOf !== allocation.transactionRef ||
      correction.allocationCorrectionUnits !== allocation.providerNetUnits ||
      correction.currency !== currency ||
      correction.exponent !== exponent ||
      correctionAmount === undefined ||
      allocationCorrectionAmount === undefined ||
      expectedAllocationCorrectionAmount === undefined ||
      compareExactAmounts(
        allocationCorrectionAmount,
        expectedAllocationCorrectionAmount,
      ) !== 0 ||
      compareExactAmounts(correctionAmount, allocationCorrectionAmount) === -1 ||
      correction.sourceDigest.trim().length === 0 ||
      correction.transactionRef.trim().length === 0 ||
      correctedAllocations.has(allocation.allocationRef)
    )
      return qualifiedUsePayoutFailure()
    correctedAllocations.set(
      allocation.allocationRef,
      allocationCorrectionAmount,
    )
  }
  for (const row of rows) {
    const correctionAmount = correctedAllocations.get(row.allocationRef)
    const amounts = allocationAmountsFromRow(row)
    if (correctionAmount !== undefined) {
      if (
        amounts === undefined ||
        compareExactAmounts(amounts.providerNet, correctionAmount) !== 0
      )
        return qualifiedUsePayoutFailure()
      continue
    }
    if (amounts === undefined) return qualifiedUsePayoutFailure()
    const nextGross = addExactAmounts(grossAccrual, amounts.grossAccrual)
    const nextRake = addExactAmounts(rake, amounts.rake)
    const nextProvider = addExactAmounts(providerNet, amounts.providerNet)
    if (nextGross === undefined || nextRake === undefined || nextProvider === undefined)
      return qualifiedUsePayoutFailure()
    grossAccrual = nextGross
    rake = nextRake
    providerNet = nextProvider
  }
  return { rows, grossAccrual, rake, providerNet }
}

function allocationReplayMatchesReceipt(
  row: Doc<'moneyPayoutAllocations'>,
  receipt: QualifiedUseReceipt,
  allocationRef: string,
  authority: CanonicalQualifiedUseAuthority,
): boolean {
  const amounts = allocationAmountsFromRow(row)
  let period: DailyPayoutIdentity
  try {
    period = dailyPayoutIdentity(
      row.businessId,
      row.currency,
      row.qualifiedAt,
    )
  } catch {
    return false
  }
  return (
    receipt.environment === 'production' &&
    receipt.qualifiedUseRef.length > 0 &&
    receipt.materialDigest.length > 0 &&
    receipt.qualifiedUseRef === qualifiedUseRef(receipt) &&
    receipt.materialDigest === qualifiedUseMaterialDigest(receipt) &&
    row.allocationRef === allocationRef &&
    samePinnedAuthority(row as typeof row & PinnedAuthorityFields, authority) &&
    (row as typeof row & PinnedResourceFields).authorityResourceRef ===
      authority.authorityResourceRef &&
    row.qualifiedUseRef === receipt.qualifiedUseRef &&
    row.transactionRef === receipt.transactionRef &&
    row.usageRef === receipt.usageRef &&
    row.businessId === receipt.businessId &&
    row.qualifiedAt === receipt.qualifiedAt &&
    row.materialDigest === receipt.materialDigest &&
    row.sourceDigest.trim().length > 0 &&
    row.materialDigest.trim().length > 0 &&
    row.payoutRef === period.payoutRef &&
    amounts !== undefined
  )
}
async function validateQualifiedUseAllocationReplay(
  ctx: Pick<MutationCtx, 'db'>,
  receipt: QualifiedUseReceipt,
  eligibilityPrincipalId: string,
  allocation: Doc<'moneyPayoutAllocations'>,
  allocationRef: string,
  authority: CanonicalQualifiedUseAuthority,
): Promise<void> {
  if (
    !allocationReplayMatchesReceipt(
      allocation,
      receipt,
      allocationRef,
      authority,
    ) ||
    receipt.transactionRef === undefined ||
    receipt.usageRef === undefined
  )
    return qualifiedUsePayoutFailure()
  const period = dailyPayoutIdentity(
    allocation.businessId,
    allocation.currency,
    allocation.qualifiedAt,
  )
  const resolution = await readQualifiedUsePayoutAmounts(
    ctx,
    receipt,
    eligibilityPrincipalId,
    true,
  )
  const sourceAmounts =
    resolution.kind === 'eligible'
      ? resolution.amounts
      : resolution.reason === 'refunded_before_delivery'
        ? resolution.amounts
        : undefined
  const allocationAmounts = allocationAmountsFromRow(allocation)
  if (
    sourceAmounts === undefined ||
    allocationAmounts === undefined ||
    sourceAmounts.businessId !== allocation.businessId ||
    sourceAmounts.currency !== allocation.currency ||
    sourceAmounts.exponent !== allocation.exponent ||
    allocation.sourceDigest !== sourceAmounts.sourceDigest ||
    compareExactAmounts(sourceAmounts.grossAccrual, allocationAmounts.grossAccrual) !==
      0 ||
    compareExactAmounts(sourceAmounts.rake, allocationAmounts.rake) !== 0 ||
    compareExactAmounts(sourceAmounts.providerNet, allocationAmounts.providerNet) !==
      0
  )
    return qualifiedUsePayoutFailure()
  const [payout, providerAccount, composition] = await Promise.all([
    ctx.db
      .query('moneyPayouts')
      .withIndex('by_payoutRef', (query) =>
        query.eq('payoutRef', period.payoutRef),
      )
      .unique(),
    ctx.db
      .query('moneyAccounts')
      .withIndex('by_accountRef', (query) =>
        query.eq(
          'accountRef',
          accountRefForProvider(allocation.businessId, allocation.currency),
        ),
      )
      .unique(),
    readDailyPayoutComposition(
      ctx,
      period,
      allocation.businessId,
      allocation.currency,
      allocation.exponent,
    ),
  ])
  const currentGross =
    payout === null
      ? undefined
      : amountFromParts(
          payout.currency,
          payout.grossAccrualUnits,
          payout.exponent,
        )
  const currentRake =
    payout === null
      ? undefined
      : amountFromParts(payout.currency, payout.rakeUnits, payout.exponent)
  const currentProvider =
    payout === null
      ? undefined
      : amountFromParts(
          payout.currency,
          payout.providerNetUnits,
          payout.exponent,
        )
  const minimumPayout =
    payout === null
      ? undefined
      : amountFromParts(
          payout.currency,
          payout.minimumPayoutUnits,
          payout.exponent,
        )
  const currentExpectedGross =
    currentRake === undefined || currentProvider === undefined
      ? undefined
      : addExactAmounts(currentProvider, currentRake)
  if (
    payout === null ||
    providerAccount === null ||
    currentGross === undefined ||
    currentRake === undefined ||
    currentProvider === undefined ||
    minimumPayout === undefined ||
    currentExpectedGross === undefined ||
    payout.payoutRef !== period.payoutRef ||
    payout.cadence !== 'daily' ||
    payout.businessId !== allocation.businessId ||
    payout.currency !== allocation.currency ||
    payout.exponent !== allocation.exponent ||
    payout.periodStart !== period.periodStart ||
    payout.periodEnd !== period.periodEnd ||
    payout.providerAccountRef !==
      accountRefForProvider(allocation.businessId, allocation.currency) ||
    payout.idempotencyKey !== period.payoutRef ||
    !samePinnedAuthority(
      payout as typeof payout & PinnedAuthorityFields,
      authority,
    ) ||
    !sameAuthorityResourceComposition(
      payout as typeof payout & PinnedResourceFields,
      composition.rows,
    ) ||
    minimumPayout.units !== '0' ||
    compareExactAmounts(currentExpectedGross, currentGross) !== 0 ||
    providerAccount.accountRef !== payout.providerAccountRef ||
    providerAccount.accountKind !== 'provider_earnings' ||
    providerAccount.businessId !== allocation.businessId ||
    providerAccount.accountId !== undefined ||
    providerAccount.currency !== allocation.currency ||
    providerAccount.exponent !== allocation.exponent
  )
    return qualifiedUsePayoutFailure()
  if (
    payout.state === 'review' ||
    payout.state === 'held_kyc' ||
    payout.state === 'held_threshold' ||
    payout.state === 'failed'
  ) {
    if (
      compareExactAmounts(currentGross, composition.grossAccrual) !== 0 ||
      compareExactAmounts(currentRake, composition.rake) !== 0 ||
      compareExactAmounts(currentProvider, composition.providerNet) !== 0
    )
      return qualifiedUsePayoutFailure()
  }
}

function sameQualifiedUseReceipt(
  row: Doc<'qualifiedUseReceipts'>,
  receipt: QualifiedUseReceipt,
  authority: CanonicalQualifiedUseAuthority,
): boolean {
  if (!Array.isArray(row.evidenceRefs)) return false
  const identity = {
    invocationRef: row.invocationRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
  }
  const material = {
    ...identity,
    businessId: row.businessId,
    operationRef: row.operationRef,
    publicationRef: row.publicationRef,
    publicationRevision: row.publicationRevision,
    contractDigest: row.contractDigest,
    bindingDigest: row.bindingDigest,
    principalClass: row.principalClass,
    requestDigest: row.requestDigest,
    responseDigest: row.responseDigest,
    evidenceRefs: row.evidenceRefs,
  }
  return (
    qualifiedUseRef(identity) === row.qualifiedUseRef &&
    qualifiedUseMaterialDigest(material) === row.materialDigest &&
    row.qualifiedUseRef === receipt.qualifiedUseRef &&
    samePinnedAuthority(row as typeof row & PinnedAuthorityFields, authority) &&
    (row as typeof row & PinnedResourceFields).authorityResourceRef ===
      authority.authorityResourceRef &&
    row.materialDigest === receipt.materialDigest &&
    row.invocationRef === receipt.invocationRef &&
    row.attemptRef === receipt.attemptRef &&
    row.effectGeneration === receipt.effectGeneration &&
    row.businessId === receipt.businessId &&
    row.operationRef === receipt.operationRef &&
    row.publicationRef === receipt.publicationRef &&
    row.publicationRevision === receipt.publicationRevision &&
    row.contractDigest === receipt.contractDigest &&
    row.bindingDigest === receipt.bindingDigest &&
    row.principalClass === receipt.principalClass &&
    row.requestDigest === receipt.requestDigest &&
    row.responseDigest === receipt.responseDigest &&
    row.evidenceRefs.length === receipt.evidenceRefs.length &&
    row.evidenceRefs.every((ref, index) => ref === receipt.evidenceRefs[index]) &&
    row.environment === receipt.environment &&
    row.qualifiedAt === receipt.qualifiedAt &&
    row.usageRef === receipt.usageRef &&
    row.transactionRef === receipt.transactionRef
  )
}

/**
 * Records the only payout allocation authority for Qualified Use. The receipt
 * carries the journal link; all economic and period identity is recovered here.
 */
export async function recordQualifiedUsePayoutAllocation(
  ctx: MutationCtx,
  receipt: QualifiedUseReceipt,
  eligibilityPrincipalId: string,
): Promise<
  'allocated' | 'excluded_free_tier' | 'excluded_refunded_before_delivery'
> {
  if (receipt.transactionRef === undefined || receipt.usageRef === undefined)
    return qualifiedUsePayoutFailure()
  const transactionRef = receipt.transactionRef
  const usageRef = receipt.usageRef
  const authority = await resolveCanonicalInvocationAuthority(
    ctx,
    receipt.invocationRef,
  )
  if (authority.authorityResourceRef !== receipt.operationRef)
    return qualifiedUseAuthorityFailure()
  const persistedReceipt = await ctx.db
    .query('qualifiedUseReceipts')
    .withIndex('by_qualifiedUseRef', (query) =>
      query.eq('qualifiedUseRef', receipt.qualifiedUseRef),
    )
    .unique()
  if (
    persistedReceipt !== null &&
    !sameQualifiedUseReceipt(persistedReceipt, receipt, authority)
  )
    return qualifiedUsePayoutFailure()
  const allocationRef = qualifiedUseAllocationRef(receipt)
  const [allocationByRef, allocationByQualifiedUse, allocationByTransaction] =
    await Promise.all([
      ctx.db
        .query('moneyPayoutAllocations')
        .withIndex('by_allocationRef', (query) =>
          query.eq('allocationRef', allocationRef),
        )
        .unique(),
      ctx.db
        .query('moneyPayoutAllocations')
        .withIndex('by_qualifiedUseRef', (query) =>
          query.eq('qualifiedUseRef', receipt.qualifiedUseRef),
        )
        .unique(),
      ctx.db
        .query('moneyPayoutAllocations')
        .withIndex('by_transactionRef', (query) =>
          query.eq('transactionRef', transactionRef),
        )
        .unique(),
    ])
  const sameAllocation =
    allocationByRef !== null &&
    allocationByQualifiedUse !== null &&
    allocationByTransaction !== null &&
    allocationByQualifiedUse._id === allocationByRef._id &&
    allocationByTransaction._id === allocationByRef._id
  if (
    (allocationByRef !== null ||
      allocationByQualifiedUse !== null ||
      allocationByTransaction !== null) &&
    (persistedReceipt === null || !sameAllocation)
  )
    return qualifiedUsePayoutFailure()
  if (allocationByRef !== null) {
    await validateQualifiedUseAllocationReplay(
      ctx,
      receipt,
      eligibilityPrincipalId,
      allocationByRef,
      allocationRef,
      authority,
    )
    return 'allocated'
  }
  const resolution = await readQualifiedUsePayoutAmounts(
    ctx,
    receipt,
    eligibilityPrincipalId,
    persistedReceipt !== null,
  )
  if (resolution.kind === 'excluded') {
    if (resolution.reason === 'free_tier') return 'excluded_free_tier'
    if (persistedReceipt !== null) return qualifiedUsePayoutFailure()
    return 'excluded_refunded_before_delivery'
  }
  if (persistedReceipt !== null) return qualifiedUsePayoutFailure()
  const amounts = resolution.amounts
  const period = dailyPayoutIdentity(
    amounts.businessId,
    amounts.currency,
    receipt.qualifiedAt,
  )
  const [payout, composition] = await Promise.all([
    ctx.db
      .query('moneyPayouts')
      .withIndex('by_payoutRef', (query) =>
        query.eq('payoutRef', period.payoutRef),
      )
      .unique(),
    readDailyPayoutComposition(
      ctx,
      period,
      amounts.businessId,
      amounts.currency,
      amounts.exponent,
    ),
  ])
  if (payout === null) {
    if (composition.rows.length > 0)
      return qualifiedUsePayoutFailure()
  } else {
    const currentGross = amountFromParts(
      payout.currency,
      payout.grossAccrualUnits,
      payout.exponent,
    )
    const currentRake = amountFromParts(
      payout.currency,
      payout.rakeUnits,
      payout.exponent,
    )
    const currentProvider = amountFromParts(
      payout.currency,
      payout.providerNetUnits,
      payout.exponent,
    )
    const currentExpectedGross =
      currentRake === undefined || currentProvider === undefined
        ? undefined
        : addExactAmounts(currentProvider, currentRake)
    if (
      payout.cadence !== 'daily' ||
      payout.payoutRef !== period.payoutRef ||
      payout.businessId !== amounts.businessId ||
      payout.currency !== amounts.currency ||
      payout.exponent !== amounts.exponent ||
      payout.periodStart !== period.periodStart ||
      payout.periodEnd !== period.periodEnd ||
      payout.providerAccountRef !==
        accountRefForProvider(amounts.businessId, amounts.currency) ||
      payout.idempotencyKey !== period.payoutRef ||
      payout.minimumPayoutUnits !== '0' ||
      !samePinnedAuthority(
        payout as typeof payout & PinnedAuthorityFields,
        authority,
      ) ||
      !sameAuthorityResourceComposition(
        payout as typeof payout & PinnedResourceFields,
        composition.rows,
      ) ||
      composition.rows.some((row) => !samePinnedAuthority(
        row as typeof row & PinnedAuthorityFields,
        authority,
      )) ||
      payout.state === 'paid' ||
      payout.state === 'reversed' ||
      payout.state === 'transfer_pending' ||
      payout.state === 'outcome_unknown' ||
      currentGross === undefined ||
      currentRake === undefined ||
      currentProvider === undefined ||
      currentExpectedGross === undefined ||
      compareExactAmounts(currentExpectedGross, currentGross) !== 0 ||
      compareExactAmounts(currentGross, composition.grossAccrual) !== 0 ||
      compareExactAmounts(currentRake, composition.rake) !== 0 ||
      compareExactAmounts(currentProvider, composition.providerNet) !== 0
    )
      return qualifiedUsePayoutFailure()
  }
  if (composition.rows.length >= DAILY_PAYOUT_ALLOCATION_READ_LIMIT)
    return qualifiedUsePayoutFailure()
  await ctx.db.insert('moneyPayoutAllocations', {
    allocationRef,
    payoutRef: period.payoutRef,
    qualifiedUseRef: receipt.qualifiedUseRef,
    transactionRef,
    usageRef,
    businessId: amounts.businessId,
    ...authority,
    currency: amounts.currency,
    exponent: amounts.exponent,
    grossAccrualUnits: amounts.grossAccrual.units,
    rakeUnits: amounts.rake.units,
    providerNetUnits: amounts.providerNet.units,
    qualifiedAt: receipt.qualifiedAt,
    sourceDigest: amounts.sourceDigest,
    materialDigest: receipt.materialDigest,
    createdAt: receipt.qualifiedAt,
  })
  if (payout === null) {
    const { authorityResourceRef, ...payoutAuthority } = authority
    await ctx.db.insert('moneyPayouts', {
      payoutRef: period.payoutRef,
      businessId: amounts.businessId,
      ...payoutAuthority,
      authorityResourceRefs: [authorityResourceRef],
      currency: amounts.currency,
      exponent: amounts.exponent,
      grossAccrualUnits: amounts.grossAccrual.units,
      rakeUnits: amounts.rake.units,
      providerNetUnits: amounts.providerNet.units,
      minimumPayoutUnits: '0',
      cadence: 'daily',
      state: 'held_threshold',
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      providerAccountRef: accountRefForProvider(
        amounts.businessId,
        amounts.currency,
      ),
      idempotencyKey: period.payoutRef,
      createdAt: receipt.qualifiedAt,
      updatedAt: receipt.qualifiedAt,
    })
    return 'allocated'
  }
  const currentGross = amountFromParts(
    payout.currency,
    payout.grossAccrualUnits,
    payout.exponent,
  )
  const currentRake = amountFromParts(
    payout.currency,
    payout.rakeUnits,
    payout.exponent,
  )
  const currentProvider = amountFromParts(
    payout.currency,
    payout.providerNetUnits,
    payout.exponent,
  )
  const nextGross =
    currentGross === undefined
      ? undefined
      : addExactAmounts(currentGross, amounts.grossAccrual)
  const nextRake =
    currentRake === undefined
      ? undefined
      : addExactAmounts(currentRake, amounts.rake)
  const nextProvider =
    currentProvider === undefined
      ? undefined
      : addExactAmounts(currentProvider, amounts.providerNet)
  const currentResourceRefs = canonicalAuthorityResourceRefs(
    (payout as typeof payout & PinnedResourceFields).authorityResourceRefs ?? [],
  )
  const nextResourceRefs = currentResourceRefs === undefined
    ? undefined
    : canonicalAuthorityResourceRefs([
        ...new Set([...currentResourceRefs, authority.authorityResourceRef]),
      ])
  if (nextGross === undefined || nextRake === undefined ||
    nextProvider === undefined || nextResourceRefs === undefined)
    return qualifiedUsePayoutFailure()
  await ctx.db.patch(payout._id, {
    grossAccrualUnits: nextGross.units,
    rakeUnits: nextRake.units,
    providerNetUnits: nextProvider.units,
    authorityResourceRefs: [...nextResourceRefs],
    updatedAt: Math.max(payout.updatedAt, receipt.qualifiedAt),
  })
  return 'allocated'
}

function sameAuthorityResourceComposition(
  payout: PinnedResourceFields,
  allocations: readonly Doc<'moneyPayoutAllocations'>[],
): boolean {
  const payoutResourceRefs = canonicalAuthorityResourceRefs(
    payout.authorityResourceRefs ?? [],
  )
  const allocationResourceRefs = canonicalAuthorityResourceRefs(
    [...new Set(allocations.map((allocation) =>
      (allocation as typeof allocation & PinnedResourceFields)
        .authorityResourceRef,
    ))],
  )
  return payoutResourceRefs !== undefined &&
    allocationResourceRefs !== undefined &&
    payoutResourceRefs.length === allocationResourceRefs.length &&
    payoutResourceRefs.every((resourceRef, index) =>
      resourceRef === allocationResourceRefs[index])
}

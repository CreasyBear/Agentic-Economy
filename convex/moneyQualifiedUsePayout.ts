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

const DAILY_PAYOUT_ALLOCATION_READ_LIMIT = 1_000
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
  let grossAccrual = zeroExactAmount(currency, exponent)
  let rake = zeroExactAmount(currency, exponent)
  let providerNet = zeroExactAmount(currency, exponent)
  if (grossAccrual === undefined || rake === undefined || providerNet === undefined)
    return qualifiedUsePayoutFailure()
  for (const row of rows) {
    const amounts = allocationAmountsFromRow(row)
    if (
      amounts === undefined ||
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
): Promise<void> {
  if (
    !allocationReplayMatchesReceipt(allocation, receipt, allocationRef) ||
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
  const [payout, providerAccount] = await Promise.all([
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
  ])
  const composition = await readDailyPayoutComposition(
    ctx,
    period,
    allocation.businessId,
    allocation.currency,
    allocation.exponent,
  )
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
  ctx: Pick<MutationCtx, 'db'>,
  receipt: QualifiedUseReceipt,
  eligibilityPrincipalId: string,
): Promise<
  'allocated' | 'excluded_free_tier' | 'excluded_refunded_before_delivery'
> {
  if (receipt.transactionRef === undefined || receipt.usageRef === undefined)
    return qualifiedUsePayoutFailure()
  const transactionRef = receipt.transactionRef
  const usageRef = receipt.usageRef
  const persistedReceipt = await ctx.db
    .query('qualifiedUseReceipts')
    .withIndex('by_qualifiedUseRef', (query) =>
      query.eq('qualifiedUseRef', receipt.qualifiedUseRef),
    )
    .unique()
  if (
    persistedReceipt !== null &&
    !sameQualifiedUseReceipt(persistedReceipt, receipt)
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
  const payout = await ctx.db
    .query('moneyPayouts')
    .withIndex('by_payoutRef', (query) =>
      query.eq('payoutRef', period.payoutRef),
    )
    .unique()
  const composition = await readDailyPayoutComposition(
    ctx,
    period,
    amounts.businessId,
    amounts.currency,
    amounts.exponent,
  )
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
    await ctx.db.insert('moneyPayouts', {
      payoutRef: period.payoutRef,
      businessId: amounts.businessId,
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
  if (nextGross === undefined || nextRake === undefined || nextProvider === undefined)
    return qualifiedUsePayoutFailure()
  await ctx.db.patch(payout._id, {
    grossAccrualUnits: nextGross.units,
    rakeUnits: nextRake.units,
    providerNetUnits: nextProvider.units,
    updatedAt: Math.max(payout.updatedAt, receipt.qualifiedAt),
  })
  return 'allocated'
}

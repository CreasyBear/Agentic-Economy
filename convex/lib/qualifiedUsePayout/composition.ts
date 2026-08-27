import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import {
  accountRefForProvider,
  addExactAmounts,
  amountFromParts,
  compareExactAmounts,
  zeroExactAmount,
  type ExactAmount,
} from '../../../src/modules/money/public'
import type { MoneyLedgerEntryRow } from '../../moneyChargeJournal'
import {
  canonicalAuthorityResourceRefs,
  pinnedAuthorityFromRow,
  samePinnedAuthority,
} from './authority'
import {
  DAILY_PAYOUT_ALLOCATION_READ_LIMIT,
  qualifiedUsePayoutFailure,
  type CanonicalPayoutAuthority,
  type DailyPayoutComposition,
  type DailyPayoutIdentity,
  type PinnedResourceFields,
} from './contracts'
import { qualifiedUseAllocationRef } from './identity'
import { allocationAmountsFromRow } from './journal'

function validateAllocations(
  rows: readonly Doc<'moneyPayoutAllocations'>[],
  period: DailyPayoutIdentity,
  businessId: string,
  currency: string,
  exponent: number,
): Map<string, Doc<'moneyPayoutAllocations'>> {
  const allocations = new Map<string, Doc<'moneyPayoutAllocations'>>()
  let authority: CanonicalPayoutAuthority | undefined
  for (const row of rows) {
    const rowAuthority = pinnedAuthorityFromRow(row)
    const resourceRef = (row as PinnedResourceFields).authorityResourceRef
    const authorityMatches = rowAuthority !== undefined &&
      (authority === undefined || samePinnedAuthority(rowAuthority, authority))
    const valid = [
      allocationAmountsFromRow(row) !== undefined,
      authorityMatches,
      canonicalAuthorityResourceRefs([resourceRef]) !== undefined,
      row.allocationRef === qualifiedUseAllocationRef(row),
      row.allocationRef.trim().length > 0,
      row.payoutRef === period.payoutRef,
      row.businessId === businessId,
      row.currency === currency,
      row.exponent === exponent,
      row.qualifiedAt >= period.periodStartAt,
      row.qualifiedAt < period.periodEndAt,
      row.sourceDigest.trim().length > 0,
      row.materialDigest.trim().length > 0,
      !allocations.has(row.allocationRef),
    ].every(Boolean)
    if (!valid || rowAuthority === undefined) return qualifiedUsePayoutFailure()
    authority = rowAuthority
    allocations.set(row.allocationRef, row)
  }
  return allocations
}

function validatedCorrectionAmount(
  correction: MoneyLedgerEntryRow,
  allocation: Doc<'moneyPayoutAllocations'> | undefined,
  period: DailyPayoutIdentity,
  businessId: string,
  currency: string,
  exponent: number,
): ExactAmount | undefined {
  if (allocation === undefined) return undefined
  const correctionAmount = amountFromParts(
    correction.currency, correction.amountUnits, correction.exponent,
  )
  const allocationCorrection = correction.allocationCorrectionUnits === undefined
    ? undefined
    : amountFromParts(
        correction.currency,
        correction.allocationCorrectionUnits,
        correction.exponent,
      )
  const expected = amountFromParts(
    allocation.currency, allocation.providerNetUnits, allocation.exponent,
  )
  const valid = [
    allocationAmountsFromRow(allocation) !== undefined,
    correction.entryType === 'refund', correction.direction === 'debit',
    correction.accountRef === accountRefForProvider(businessId, currency),
    correction.businessId === businessId, correction.payoutRef === period.payoutRef,
    correction.allocationRef === allocation.allocationRef,
    correction.reversalOf === allocation.transactionRef,
    correction.allocationCorrectionUnits === allocation.providerNetUnits,
    correction.currency === currency, correction.exponent === exponent,
    correctionAmount !== undefined, allocationCorrection !== undefined,
    expected !== undefined,
    allocationCorrection !== undefined && expected !== undefined &&
      compareExactAmounts(allocationCorrection, expected) === 0,
    correctionAmount !== undefined && allocationCorrection !== undefined &&
      compareExactAmounts(correctionAmount, allocationCorrection) !== -1,
    correction.sourceDigest.trim().length > 0,
    correction.transactionRef.trim().length > 0,
  ].every(Boolean)
  return valid ? allocationCorrection : undefined
}

function validateCorrections(
  rows: readonly MoneyLedgerEntryRow[],
  allocations: ReadonlyMap<string, Doc<'moneyPayoutAllocations'>>,
  period: DailyPayoutIdentity,
  businessId: string,
  currency: string,
  exponent: number,
): Map<string, ExactAmount> {
  const corrected = new Map<string, ExactAmount>()
  for (const row of rows) {
    const allocation = row.allocationRef === undefined
      ? undefined
      : allocations.get(row.allocationRef)
    const amount = validatedCorrectionAmount(
      row, allocation, period, businessId, currency, exponent,
    )
    if (allocation === undefined || amount === undefined ||
      corrected.has(allocation.allocationRef)) return qualifiedUsePayoutFailure()
    corrected.set(allocation.allocationRef, amount)
  }
  return corrected
}

function initialComposition(currency: string, exponent: number): Readonly<{
  gross: ExactAmount
  rake: ExactAmount
  provider: ExactAmount
}> {
  const gross = zeroExactAmount(currency, exponent)
  const rake = zeroExactAmount(currency, exponent)
  const provider = zeroExactAmount(currency, exponent)
  if (gross === undefined || rake === undefined || provider === undefined)
    return qualifiedUsePayoutFailure()
  return { gross, rake, provider }
}

function addAllocation(
  current: Readonly<{ gross: ExactAmount; rake: ExactAmount; provider: ExactAmount }>,
  amounts: NonNullable<ReturnType<typeof allocationAmountsFromRow>>,
): Readonly<{ gross: ExactAmount; rake: ExactAmount; provider: ExactAmount }> {
  const gross = addExactAmounts(current.gross, amounts.grossAccrual)
  const rake = addExactAmounts(current.rake, amounts.rake)
  const provider = addExactAmounts(current.provider, amounts.providerNet)
  if (gross === undefined || rake === undefined || provider === undefined)
    return qualifiedUsePayoutFailure()
  return { gross, rake, provider }
}

function sumComposition(
  rows: readonly Doc<'moneyPayoutAllocations'>[],
  corrected: ReadonlyMap<string, ExactAmount>,
  currency: string,
  exponent: number,
): Omit<DailyPayoutComposition, 'rows'> {
  let current = initialComposition(currency, exponent)
  for (const row of rows) {
    const amounts = allocationAmountsFromRow(row)
    if (amounts === undefined) return qualifiedUsePayoutFailure()
    const correction = corrected.get(row.allocationRef)
    if (correction !== undefined) {
      if (compareExactAmounts(amounts.providerNet, correction) !== 0)
        return qualifiedUsePayoutFailure()
      continue
    }
    current = addAllocation(current, amounts)
  }
  return {
    grossAccrual: current.gross,
    rake: current.rake,
    providerNet: current.provider,
  }
}

export async function readDailyPayoutComposition(
  ctx: Pick<MutationCtx, 'db'>,
  period: DailyPayoutIdentity,
  businessId: string,
  currency: string,
  exponent: number,
): Promise<DailyPayoutComposition> {
  const rows = await ctx.db.query('moneyPayoutAllocations').withIndex(
    'by_payoutRef_and_qualifiedAt',
    (query) => query.eq('payoutRef', period.payoutRef),
  ).take(DAILY_PAYOUT_ALLOCATION_READ_LIMIT + 1)
  if (rows.length > DAILY_PAYOUT_ALLOCATION_READ_LIMIT)
    return qualifiedUsePayoutFailure()
  const allocations = validateAllocations(
    rows, period, businessId, currency, exponent,
  )
  const corrections = await ctx.db.query('moneyLedgerEntries').withIndex(
    'by_payoutRef_and_allocationRef',
    (query) => query.eq('payoutRef', period.payoutRef),
  ).take(DAILY_PAYOUT_ALLOCATION_READ_LIMIT + 1)
  if (corrections.length > DAILY_PAYOUT_ALLOCATION_READ_LIMIT)
    return qualifiedUsePayoutFailure()
  const corrected = validateCorrections(
    corrections, allocations, period, businessId, currency, exponent,
  )
  return { rows, ...sumComposition(rows, corrected, currency, exponent) }
}

export function sameAuthorityResourceComposition(
  payout: PinnedResourceFields,
  allocations: readonly Doc<'moneyPayoutAllocations'>[],
): boolean {
  const payoutRefs = canonicalAuthorityResourceRefs(
    payout.authorityResourceRefs ?? [],
  )
  const allocationRefs = canonicalAuthorityResourceRefs([
    ...new Set(allocations.map((allocation) =>
      (allocation as PinnedResourceFields).authorityResourceRef)),
  ])
  return payoutRefs !== undefined && allocationRefs !== undefined &&
    payoutRefs.length === allocationRefs.length &&
    payoutRefs.every((ref, index) => ref === allocationRefs[index])
}

import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import { accountRefForProvider, addExactAmounts, amountFromParts, compareExactAmounts, qualifiedUseMaterialDigest, qualifiedUseRef, type QualifiedUseReceipt } from '../../../src/modules/money/public'
import { samePinnedAuthority } from './authority'
import { qualifiedUsePayoutFailure, type CanonicalQualifiedUseAuthority, type DailyPayoutComposition, type DailyPayoutIdentity, type PinnedResourceFields, type QualifiedUsePayoutAmounts, type QualifiedUsePayoutResolution } from './contracts'
import { readDailyPayoutComposition, sameAuthorityResourceComposition } from './composition'
import { dailyPayoutIdentity } from './identity'
import { allocationAmountsFromRow, readQualifiedUsePayoutAmounts } from './journal'

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
  return [
    receipt.environment === 'production', receipt.qualifiedUseRef.length > 0,
    receipt.materialDigest.length > 0,
    receipt.qualifiedUseRef === qualifiedUseRef(receipt),
    receipt.materialDigest === qualifiedUseMaterialDigest(receipt),
    row.allocationRef === allocationRef, samePinnedAuthority(row, authority),
    (row as PinnedResourceFields).authorityResourceRef === authority.authorityResourceRef,
    row.qualifiedUseRef === receipt.qualifiedUseRef,
    row.transactionRef === receipt.transactionRef, row.usageRef === receipt.usageRef,
    row.businessId === receipt.businessId, row.qualifiedAt === receipt.qualifiedAt,
    row.materialDigest === receipt.materialDigest,
    row.sourceDigest.trim().length > 0, row.materialDigest.trim().length > 0,
    row.payoutRef === period.payoutRef, amounts !== undefined,
  ].every(Boolean)
}

function sourceAmountsMatchAllocation(
  source: QualifiedUsePayoutAmounts | undefined,
  allocation: Doc<'moneyPayoutAllocations'>,
): boolean {
  const stored = allocationAmountsFromRow(allocation)
  if (source === undefined || stored === undefined) return false
  return [
    source.businessId === allocation.businessId,
    source.currency === allocation.currency,
    source.exponent === allocation.exponent,
    source.sourceDigest === allocation.sourceDigest,
    compareExactAmounts(source.grossAccrual, stored.grossAccrual) === 0,
    compareExactAmounts(source.rake, stored.rake) === 0,
    compareExactAmounts(source.providerNet, stored.providerNet) === 0,
  ].every(Boolean)
}

function replaySourceAmounts(
  resolution: QualifiedUsePayoutResolution,
): QualifiedUsePayoutAmounts | undefined {
  if (resolution.kind === 'eligible') return resolution.amounts
  if (resolution.reason === 'refunded_before_delivery') return resolution.amounts
  return undefined
}

function validateReplayPayout(
  payout: Doc<'moneyPayouts'>,
  providerAccount: Doc<'moneyAccounts'>,
  allocation: Doc<'moneyPayoutAllocations'>,
  period: DailyPayoutIdentity,
  composition: DailyPayoutComposition,
  authority: CanonicalQualifiedUseAuthority,
): void {
  const gross = amountFromParts(
    payout.currency, payout.grossAccrualUnits, payout.exponent,
  )
  const rake = amountFromParts(payout.currency, payout.rakeUnits, payout.exponent)
  const provider = amountFromParts(
    payout.currency, payout.providerNetUnits, payout.exponent,
  )
  const minimum = amountFromParts(
    payout.currency, payout.minimumPayoutUnits, payout.exponent,
  )
  const expectedGross = rake === undefined || provider === undefined
    ? undefined : addExactAmounts(provider, rake)
  const valid = [
    gross !== undefined, rake !== undefined, provider !== undefined,
    minimum?.units === '0', expectedGross !== undefined,
    payout.payoutRef === period.payoutRef, payout.cadence === 'daily',
    payout.businessId === allocation.businessId,
    payout.currency === allocation.currency, payout.exponent === allocation.exponent,
    payout.periodStart === period.periodStart, payout.periodEnd === period.periodEnd,
    payout.providerAccountRef === accountRefForProvider(
      allocation.businessId, allocation.currency,
    ),
    payout.idempotencyKey === period.payoutRef, samePinnedAuthority(payout, authority),
    sameAuthorityResourceComposition(payout, composition.rows),
    gross !== undefined && expectedGross !== undefined &&
      compareExactAmounts(expectedGross, gross) === 0,
    providerAccount.accountRef === payout.providerAccountRef,
    providerAccount.accountKind === 'provider_earnings',
    providerAccount.businessId === allocation.businessId,
    providerAccount.accountId === undefined,
    providerAccount.currency === allocation.currency,
    providerAccount.exponent === allocation.exponent,
  ].every(Boolean)
  if (!valid) return qualifiedUsePayoutFailure()
  const currentGross = gross as NonNullable<typeof gross>
  const currentRake = rake as NonNullable<typeof rake>
  const currentProvider = provider as NonNullable<typeof provider>
  const mutable = ['review', 'held_kyc', 'held_threshold', 'failed']
    .includes(payout.state)
  const compositionMatches = [
    compareExactAmounts(currentGross, composition.grossAccrual) === 0,
    compareExactAmounts(currentRake, composition.rake) === 0,
    compareExactAmounts(currentProvider, composition.providerNet) === 0,
  ].every(Boolean)
  if (mutable && !compositionMatches) return qualifiedUsePayoutFailure()
}
export async function validateQualifiedUseAllocationReplay(
  ctx: Pick<MutationCtx, 'db'>,
  receipt: QualifiedUseReceipt,
  eligibilityPrincipalId: string,
  allocation: Doc<'moneyPayoutAllocations'>,
  allocationRef: string,
  authority: CanonicalQualifiedUseAuthority,
): Promise<void> {
  if (!allocationReplayMatchesReceipt(allocation, receipt, allocationRef, authority))
    return qualifiedUsePayoutFailure()
  if (receipt.transactionRef === undefined || receipt.usageRef === undefined)
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
  if (!sourceAmountsMatchAllocation(replaySourceAmounts(resolution), allocation))
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
  if (payout === null || providerAccount === null)
    return qualifiedUsePayoutFailure()
  validateReplayPayout(
    payout, providerAccount, allocation, period, composition, authority,
  )
}

export function sameQualifiedUseReceipt(
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
  return [
    qualifiedUseRef(identity) === row.qualifiedUseRef,
    qualifiedUseMaterialDigest(material) === row.materialDigest,
    row.qualifiedUseRef === receipt.qualifiedUseRef,
    samePinnedAuthority(row, authority),
    (row as PinnedResourceFields).authorityResourceRef === authority.authorityResourceRef,
    row.materialDigest === receipt.materialDigest,
    row.invocationRef === receipt.invocationRef, row.attemptRef === receipt.attemptRef,
    row.effectGeneration === receipt.effectGeneration,
    row.businessId === receipt.businessId, row.operationRef === receipt.operationRef,
    row.publicationRef === receipt.publicationRef,
    row.publicationRevision === receipt.publicationRevision,
    row.contractDigest === receipt.contractDigest,
    row.bindingDigest === receipt.bindingDigest,
    row.principalClass === receipt.principalClass,
    row.requestDigest === receipt.requestDigest,
    row.responseDigest === receipt.responseDigest,
    row.evidenceRefs.length === receipt.evidenceRefs.length,
    row.evidenceRefs.every((ref, index) => ref === receipt.evidenceRefs[index]),
    row.environment === receipt.environment, row.qualifiedAt === receipt.qualifiedAt,
    row.usageRef === receipt.usageRef, row.transactionRef === receipt.transactionRef,
  ].every(Boolean)
}

/**
 * Records the only payout allocation authority for Qualified Use. The receipt
 * carries the journal link; all economic and period identity is recovered here.
 */

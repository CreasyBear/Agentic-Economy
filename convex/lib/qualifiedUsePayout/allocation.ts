import type { Doc } from '../../_generated/dataModel'
import type { MutationCtx } from '../../_generated/server'
import {
  accountRefForProvider,
  addExactAmounts,
  amountFromParts,
  compareExactAmounts,
  type ExactAmount,
  type QualifiedUseReceipt,
} from '../../../src/modules/money/public'
import {
  canonicalAuthorityResourceRefs,
  resolveCanonicalInvocationAuthority,
  samePinnedAuthority,
} from './authority'
import {
  DAILY_PAYOUT_ALLOCATION_READ_LIMIT,
  qualifiedUseAuthorityFailure,
  qualifiedUsePayoutFailure,
  type CanonicalQualifiedUseAuthority,
  type DailyPayoutComposition,
  type DailyPayoutIdentity,
  type PinnedResourceFields,
  type QualifiedUsePayoutAmounts,
} from './contracts'
import {
  readDailyPayoutComposition,
  sameAuthorityResourceComposition,
} from './composition'
import { dailyPayoutIdentity, qualifiedUseAllocationRef } from './identity'
import { readQualifiedUsePayoutAmounts } from './journal'
import {
  sameQualifiedUseReceipt,
  validateQualifiedUseAllocationReplay,
} from './replay'

type CompleteReceipt = QualifiedUseReceipt & Readonly<{
  transactionRef: string
  usageRef: string
}>
type AllocationResult = 'allocated' | 'excluded_free_tier' |
  'excluded_refunded_before_delivery'
type NewAllocation = Readonly<{
  allocationRef: string
  amounts: QualifiedUsePayoutAmounts
  transactionRef: string
  usageRef: string
}>

function completeReceipt(receipt: QualifiedUseReceipt): CompleteReceipt {
  if (receipt.transactionRef === undefined || receipt.usageRef === undefined)
    return qualifiedUsePayoutFailure()
  return receipt as CompleteReceipt
}

function allocationRowsCollide(
  rows: readonly [
    Doc<'moneyPayoutAllocations'> | null,
    Doc<'moneyPayoutAllocations'> | null,
    Doc<'moneyPayoutAllocations'> | null,
  ],
  persistedReceipt: Doc<'qualifiedUseReceipts'> | null,
): boolean {
  const [byRef, byQualifiedUse, byTransaction] = rows
  const sameAllocation = rows.every((row) => row !== null) && byRef !== null &&
    byQualifiedUse?._id === byRef._id && byTransaction?._id === byRef._id
  return rows.some((row) => row !== null) &&
    (persistedReceipt === null || !sameAllocation)
}

async function admitAllocation(
  ctx: MutationCtx,
  receipt: CompleteReceipt,
  eligibilityPrincipalId: string,
  authority: CanonicalQualifiedUseAuthority,
  persistedReceipt: Doc<'qualifiedUseReceipts'> | null,
): Promise<NewAllocation | AllocationResult> {
  const allocationRef = qualifiedUseAllocationRef(receipt)
  const [byRef, byQualifiedUse, byTransaction] = await Promise.all([
    ctx.db.query('moneyPayoutAllocations').withIndex(
      'by_allocationRef', (query) => query.eq('allocationRef', allocationRef),
    ).unique(),
    ctx.db.query('moneyPayoutAllocations').withIndex(
      'by_qualifiedUseRef',
      (query) => query.eq('qualifiedUseRef', receipt.qualifiedUseRef),
    ).unique(),
    ctx.db.query('moneyPayoutAllocations').withIndex(
      'by_transactionRef',
      (query) => query.eq('transactionRef', receipt.transactionRef),
    ).unique(),
  ])
  if (allocationRowsCollide(
    [byRef, byQualifiedUse, byTransaction], persistedReceipt,
  )) return qualifiedUsePayoutFailure()
  if (byRef !== null) {
    await validateQualifiedUseAllocationReplay(
      ctx, receipt, eligibilityPrincipalId, byRef, allocationRef, authority,
    )
    return 'allocated'
  }
  const resolution = await readQualifiedUsePayoutAmounts(
    ctx, receipt, eligibilityPrincipalId, persistedReceipt !== null,
  )
  if (resolution.kind === 'excluded') {
    if (resolution.reason === 'free_tier') return 'excluded_free_tier'
    if (persistedReceipt !== null) return qualifiedUsePayoutFailure()
    return 'excluded_refunded_before_delivery'
  }
  if (persistedReceipt !== null) return qualifiedUsePayoutFailure()
  return {
    allocationRef,
    amounts: resolution.amounts,
    transactionRef: receipt.transactionRef,
    usageRef: receipt.usageRef,
  }
}

function existingPayoutMatches(
  payout: Doc<'moneyPayouts'>,
  period: DailyPayoutIdentity,
  amounts: QualifiedUsePayoutAmounts,
  composition: DailyPayoutComposition,
  authority: CanonicalQualifiedUseAuthority,
): boolean {
  const gross = amountFromParts(
    payout.currency, payout.grossAccrualUnits, payout.exponent,
  )
  const rake = amountFromParts(payout.currency, payout.rakeUnits, payout.exponent)
  const provider = amountFromParts(
    payout.currency, payout.providerNetUnits, payout.exponent,
  )
  const expectedGross = rake === undefined || provider === undefined
    ? undefined : addExactAmounts(provider, rake)
  const immutable = ['paid', 'reversed', 'transfer_pending', 'outcome_unknown']
    .includes(payout.state)
  return [
    payout.cadence === 'daily', payout.payoutRef === period.payoutRef,
    payout.businessId === amounts.businessId, payout.currency === amounts.currency,
    payout.exponent === amounts.exponent,
    payout.periodStart === period.periodStart, payout.periodEnd === period.periodEnd,
    payout.providerAccountRef === accountRefForProvider(
      amounts.businessId, amounts.currency,
    ),
    payout.idempotencyKey === period.payoutRef, payout.minimumPayoutUnits === '0',
    samePinnedAuthority(payout, authority),
    sameAuthorityResourceComposition(payout, composition.rows),
    composition.rows.every((row) => samePinnedAuthority(row, authority)),
    !immutable, gross !== undefined, rake !== undefined, provider !== undefined,
    expectedGross !== undefined,
    gross !== undefined && expectedGross !== undefined &&
      compareExactAmounts(expectedGross, gross) === 0,
    gross !== undefined && compareExactAmounts(gross, composition.grossAccrual) === 0,
    rake !== undefined && compareExactAmounts(rake, composition.rake) === 0,
    provider !== undefined &&
      compareExactAmounts(provider, composition.providerNet) === 0,
  ].every(Boolean)
}

async function readAllocationTarget(
  ctx: MutationCtx,
  receipt: QualifiedUseReceipt,
  allocation: NewAllocation,
  authority: CanonicalQualifiedUseAuthority,
): Promise<Readonly<{
  payout: Doc<'moneyPayouts'> | null
  period: DailyPayoutIdentity
}>> {
  const { amounts } = allocation
  const period = dailyPayoutIdentity(
    amounts.businessId, amounts.currency, receipt.qualifiedAt,
  )
  const [payout, composition] = await Promise.all([
    ctx.db.query('moneyPayouts').withIndex(
      'by_payoutRef', (query) => query.eq('payoutRef', period.payoutRef),
    ).unique(),
    readDailyPayoutComposition(
      ctx, period, amounts.businessId, amounts.currency, amounts.exponent,
    ),
  ])
  if (payout === null && composition.rows.length > 0)
    return qualifiedUsePayoutFailure()
  if (payout !== null && !existingPayoutMatches(
    payout, period, amounts, composition, authority,
  )) return qualifiedUsePayoutFailure()
  if (composition.rows.length >= DAILY_PAYOUT_ALLOCATION_READ_LIMIT)
    return qualifiedUsePayoutFailure()
  return { payout, period }
}

function nextPayoutValues(
  payout: Doc<'moneyPayouts'>,
  amounts: QualifiedUsePayoutAmounts,
  authority: CanonicalQualifiedUseAuthority,
): Readonly<{
  gross: ExactAmount
  rake: ExactAmount
  provider: ExactAmount
  resourceRefs: readonly string[]
}> {
  const currentGross = amountFromParts(
    payout.currency, payout.grossAccrualUnits, payout.exponent,
  )
  const currentRake = amountFromParts(
    payout.currency, payout.rakeUnits, payout.exponent,
  )
  const currentProvider = amountFromParts(
    payout.currency, payout.providerNetUnits, payout.exponent,
  )
  const gross = currentGross === undefined ? undefined :
    addExactAmounts(currentGross, amounts.grossAccrual)
  const rake = currentRake === undefined ? undefined :
    addExactAmounts(currentRake, amounts.rake)
  const provider = currentProvider === undefined ? undefined :
    addExactAmounts(currentProvider, amounts.providerNet)
  const currentRefs = canonicalAuthorityResourceRefs(
    (payout as PinnedResourceFields).authorityResourceRefs ?? [],
  )
  const resourceRefs = currentRefs === undefined ? undefined :
    canonicalAuthorityResourceRefs([
      ...new Set([...currentRefs, authority.authorityResourceRef]),
    ])
  if ([gross, rake, provider, resourceRefs].some((value) => value === undefined))
    return qualifiedUsePayoutFailure()
  return {
    gross: gross as ExactAmount,
    rake: rake as ExactAmount,
    provider: provider as ExactAmount,
    resourceRefs: resourceRefs as readonly string[],
  }
}

async function persistAllocation(
  ctx: MutationCtx,
  receipt: QualifiedUseReceipt,
  allocation: NewAllocation,
  authority: CanonicalQualifiedUseAuthority,
  target: Readonly<{
    payout: Doc<'moneyPayouts'> | null
    period: DailyPayoutIdentity
  }>,
): Promise<'allocated'> {
  const { amounts, allocationRef, transactionRef, usageRef } = allocation
  const { payout, period } = target
  await ctx.db.insert('moneyPayoutAllocations', {
    allocationRef, payoutRef: period.payoutRef,
    qualifiedUseRef: receipt.qualifiedUseRef, transactionRef, usageRef,
    businessId: amounts.businessId, ...authority, currency: amounts.currency,
    exponent: amounts.exponent, grossAccrualUnits: amounts.grossAccrual.units,
    rakeUnits: amounts.rake.units, providerNetUnits: amounts.providerNet.units,
    qualifiedAt: receipt.qualifiedAt, sourceDigest: amounts.sourceDigest,
    materialDigest: receipt.materialDigest, createdAt: receipt.qualifiedAt,
  })
  if (payout === null) {
    const { authorityResourceRef, ...payoutAuthority } = authority
    await ctx.db.insert('moneyPayouts', {
      payoutRef: period.payoutRef, businessId: amounts.businessId,
      ...payoutAuthority, authorityResourceRefs: [authorityResourceRef],
      currency: amounts.currency, exponent: amounts.exponent,
      grossAccrualUnits: amounts.grossAccrual.units, rakeUnits: amounts.rake.units,
      providerNetUnits: amounts.providerNet.units, minimumPayoutUnits: '0',
      cadence: 'daily', state: 'held_threshold', periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      providerAccountRef: accountRefForProvider(amounts.businessId, amounts.currency),
      idempotencyKey: period.payoutRef, createdAt: receipt.qualifiedAt,
      updatedAt: receipt.qualifiedAt,
    })
    return 'allocated'
  }
  const next = nextPayoutValues(payout, amounts, authority)
  await ctx.db.patch(payout._id, {
    grossAccrualUnits: next.gross.units, rakeUnits: next.rake.units,
    providerNetUnits: next.provider.units,
    authorityResourceRefs: [...next.resourceRefs],
    updatedAt: Math.max(payout.updatedAt, receipt.qualifiedAt),
  })
  return 'allocated'
}

export async function recordQualifiedUsePayoutAllocation(
  ctx: MutationCtx,
  receipt: QualifiedUseReceipt,
  eligibilityPrincipalId: string,
): Promise<AllocationResult> {
  const receiptWithJournal = completeReceipt(receipt)
  const authority = await resolveCanonicalInvocationAuthority(
    ctx, receipt.invocationRef,
  )
  if (authority.authorityPrincipalRef !== eligibilityPrincipalId)
    return qualifiedUsePayoutFailure()
  if (authority.authorityResourceRef !== receipt.operationRef)
    return qualifiedUseAuthorityFailure()
  const persistedReceipt = await ctx.db.query('qualifiedUseReceipts').withIndex(
    'by_qualifiedUseRef',
    (query) => query.eq('qualifiedUseRef', receipt.qualifiedUseRef),
  ).unique()
  if (persistedReceipt !== null &&
    !sameQualifiedUseReceipt(persistedReceipt, receipt, authority))
    return qualifiedUsePayoutFailure()
  const admission = await admitAllocation(
    ctx, receiptWithJournal, eligibilityPrincipalId, authority, persistedReceipt,
  )
  if (typeof admission === 'string') return admission
  const target = await readAllocationTarget(ctx, receipt, admission, authority)
  return await persistAllocation(ctx, receipt, admission, authority, target)
}

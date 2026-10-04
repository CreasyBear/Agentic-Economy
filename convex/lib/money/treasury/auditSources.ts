import { v, type Infer, type Validator } from 'convex/values'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { isRecord } from '@/modules/common/is-record'
import { treasuryBatchValue, type TreasuryIdentity } from '@/modules/money/treasury'
import { X402_SPEND_HISTORY_LIMIT, X402_SPEND_WINDOW_MS, x402SpendPolicyFromEnvironment } from '@/modules/money/x402-spend-admission'
import { env, type QueryCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { readBookingHandler, readBookingResult } from '../managedCall/booking'
import { configuredTreasuryIdentity } from './progress'

const PAGE_LIMIT = 25
const HISTORY_LIMIT = 25
const pageFailureValue = v.object({ kind: v.literal('unavailable'), code: v.string() })
const environmentValue = v.union(v.literal('sandbox'), v.literal('production'))
const financialStateValue = v.union(v.literal('reservation_pending'), v.literal('reserved'),
  v.literal('possibly_submitted'), v.literal('outcome_unknown'), v.literal('released'), v.literal('settled'))
const attemptStateValue = v.union(v.literal('prepared'), v.literal('possibly_submitted'),
  v.literal('observed'), v.literal('reconciliation_required'))
const settlementStatusValue = v.union(v.literal('settled'), v.literal('not_settled'), v.literal('unknown'))
const reservationStateValue = v.union(v.literal('liability'), v.literal('settled'), v.literal('unused'))
export const auditSourcePageArgs = {
  cutoffAt: v.number(), cursor: v.optional(v.string()), limit: v.optional(v.number()),
}
export type AuditSourcePageArgs = Infer<typeof pageArgsValue>
const pageArgsValue = v.object(auditSourcePageArgs)

function pageValue<T>(row: Validator<T, 'required', string>) {
  return v.union(pageFailureValue, v.object({ kind: v.literal('available'), cutoffAt: v.number(),
    rows: v.array(row), isDone: v.boolean(), cursor: v.union(v.null(), v.string()) }))
}
export const treasuryBatchSourcesReturns = pageValue(treasuryBatchValue)
export type TreasuryBatchSourcesResult = Infer<typeof treasuryBatchSourcesReturns>

const attemptMaterialValue = v.object({
  dispatchRef: v.string(), attemptRef: v.string(), effectGeneration: v.number(),
  toolRef: v.optional(v.string()), inputDigest: v.optional(v.string()), paymentIdentifier: v.string(),
  challengeDigest: v.string(), scheme: v.string(),
  network: v.string(), asset: v.string(), payTo: v.string(), amountUnits: v.string(), currency: v.string(), exponent: v.number(),
  custodyRef: v.string(), custodyBudgetRef: v.optional(v.string()), custodyGeneration: v.optional(v.number()),
  authorizationDigest: v.string(), reservationRef: v.optional(v.string()), spendReservationRef: v.optional(v.string()),
  paymentIdentityDigest: v.optional(v.string()), paymentUnsignedMaterialDigest: v.optional(v.string()),
  paymentSigningIdempotencyKey: v.optional(v.string()), paymentSignatureDigest: v.optional(v.string()),
  paymentPayer: v.optional(v.string()), paymentNonce: v.optional(v.string()),
  paymentAuthorizationValidBefore: v.optional(v.string()), paymentAuthorizationExpiresAt: v.optional(v.number()),
  paymentSigningClaimedAt: v.optional(v.number()), authorizationFailureObservedAt: v.optional(v.number()),
  state: attemptStateValue, preparedAt: v.number(), submissionStartedAt: v.optional(v.number()), observedAt: v.optional(v.number()),
  settlementStatus: v.optional(settlementStatusValue), transportObservationDigest: v.optional(v.string()),
  transportRequestDigest: v.optional(v.string()), paymentObservationDigest: v.optional(v.string()),
  paymentResponseDigest: v.optional(v.string()), reconciliationEvidenceRef: v.optional(v.string()),
  reconciliationEvidenceDigest: v.optional(v.string()), evidenceRefs: v.array(v.string()),
})
const callSourceValue = v.object({
  callRef: v.string(), quoteRef: v.optional(v.string()), accountRef: v.string(), principalRef: v.string(),
  toolRef: v.string(), inputDigest: v.string(), attemptRef: v.optional(v.string()),
  state: v.string(), financialState: v.optional(financialStateValue), createdAt: v.number(), updatedAt: v.number(),
  reservationRefs: v.array(v.string()), settlementRefs: v.array(v.string()), releaseRefs: v.array(v.string()),
  evidenceHash: v.optional(v.string()), externalSettlementRef: v.optional(v.string()), lossState: v.optional(v.string()),
})
const quoteSourceValue = v.object({
  quoteRef: v.string(), accountRef: v.string(), principalRef: v.string(), toolRef: v.string(), inputDigest: v.string(),
  custodyRef: v.optional(v.string()), custodyGeneration: v.optional(v.number()), providerAmountUnits: v.optional(v.string()),
  buyerAmountUnits: v.string(), evidenceDigest: v.string(), x402RequirementDigest: v.optional(v.string()),
  rateEvidenceDigest: v.optional(v.string()), treasuryEvidenceDigest: v.optional(v.string()),
  createdAt: v.number(), updatedAt: v.number(),
})
const obligationSourceValue = v.object({
  obligationRef: v.string(), callRef: v.string(), toolRef: v.string(), providerRef: v.string(), buyerAccountRef: v.string(),
  providerAmountUnits: v.string(), state: v.string(), settlementTransactionRef: v.optional(v.string()),
  reversalTransactionRef: v.optional(v.string()), reversalState: v.optional(v.string()), evidenceRefs: v.array(v.string()),
  createdAt: v.number(), updatedAt: v.number(), settledAt: v.optional(v.number()), reversedAt: v.optional(v.number()),
})
export const treasuryAttemptSourceValue = v.object({
  material: attemptMaterialValue, call: v.union(v.null(), callSourceValue), quote: v.union(v.null(), quoteSourceValue),
  obligation: v.union(v.null(), obligationSourceValue), native: readBookingResult, joinIssues: v.array(v.string()),
})
export const treasuryAttemptSourcesReturns = pageValue(treasuryAttemptSourceValue)
export type TreasuryAttemptSource = Infer<typeof treasuryAttemptSourceValue>
export type TreasuryAttemptSourcesResult = Infer<typeof treasuryAttemptSourcesReturns>
export const treasuryCallSourceValue = v.object({
  call: callSourceValue, native: readBookingResult, obligation: v.union(v.null(), obligationSourceValue), joinIssues: v.array(v.string()),
})
export const treasuryCallSourcesReturns = pageValue(treasuryCallSourceValue)
export type TreasuryCallSource = Infer<typeof treasuryCallSourceValue>
export type TreasuryCallSourcesResult = Infer<typeof treasuryCallSourcesReturns>

const fundingSourceValue = v.object({
  commandRef: v.string(), accountRef: v.string(), legalCustomerRef: v.string(), environment: environmentValue,
  actorPrincipalRef: v.string(), successReturnRef: v.string(), providerRecoveryDeadlineAt: v.number(),
  cancelReturnRef: v.optional(v.string()), checkoutExpiresAt: v.optional(v.number()),
  currency: v.literal('AUD'), exponent: v.literal(6), principalUnits: v.string(), serviceFeeUnits: v.string(),
  taxUnits: v.string(), totalUnits: v.string(), commercialPolicyDigest: v.string(), commercialPolicyRefs: v.array(v.string()),
  inputDigest: v.string(), idempotencyKey: v.string(), requestDigest: v.optional(v.string()),
  externalRef: v.optional(v.string()), paymentId: v.optional(v.string()), paymentIntentDigest: v.optional(v.string()),
  checkoutSessionDigest: v.optional(v.string()), metadataDigest: v.optional(v.string()), evidenceDigest: v.optional(v.string()),
  providerEvidenceRef: v.optional(v.string()), appliedStripeEventId: v.optional(v.string()),
  appliedPayloadDigest: v.optional(v.string()), appliedTransactionRef: v.optional(v.string()),
  state: v.union(v.literal('pending'), v.literal('succeeded'), v.literal('failed'), v.literal('outcome_unknown'), v.literal('reversed')),
  providerStatus: v.optional(v.union(v.literal('pending'), v.literal('succeeded'), v.literal('failed'), v.literal('outcome_unknown'), v.literal('reversed'))),
  reversalState: v.optional(v.union(v.literal('pending'), v.literal('succeeded'), v.literal('outcome_unknown'))),
  reversalStripeEventId: v.optional(v.string()), reversalRefundId: v.optional(v.string()), reversalChargeId: v.optional(v.string()),
  reversalEvidenceDigest: v.optional(v.string()), reversalTransactionRef: v.optional(v.string()), reversalStatusRef: v.optional(v.string()),
  reversedAt: v.optional(v.number()), createdAt: v.number(), updatedAt: v.number(),
})
export const treasuryFundingSourcesReturns = pageValue(fundingSourceValue)
export type TreasuryFundingSourcesResult = Infer<typeof treasuryFundingSourcesReturns>

export const treasurySpendReservationSourceValue = v.object({
  reservationRef: v.string(), platformBudgetRef: v.string(), custodyBudgetRef: v.string(), custodyRef: v.string(),
  custodyGeneration: v.number(), environment: environmentValue, network: v.string(), asset: v.string(),
  currency: v.literal('USDC'), exponent: v.literal(6), dispatchRef: v.string(), attemptRef: v.string(), effectGeneration: v.number(),
  authorizationDigest: v.string(), paymentIdentityDigest: v.string(), paymentUnsignedMaterialDigest: v.string(),
  paymentSigningIdempotencyKey: v.string(), typedDataDigest: v.string(), normalizedPayTo: v.string(), amountUnits: v.string(),
  reservedAt: v.number(), policyRevision: v.string(), initialScreeningCheckRef: v.string(), state: reservationStateValue,
  settledAt: v.optional(v.number()), resolvedAt: v.optional(v.number()), resolutionEvidenceDigest: v.optional(v.string()),
  unusedProof: v.optional(v.union(v.literal('expired_unused'), v.literal('authorization_cancelled'), v.literal('definitively_not_signed'))),
})
export const treasurySpendReservationSourcesArgs = { ...auditSourcePageArgs, state: v.optional(reservationStateValue) }
const reservationPageArgsValue = v.object(treasurySpendReservationSourcesArgs)
export type TreasurySpendReservationSourcesArgs = Infer<typeof reservationPageArgsValue>
export const treasurySpendReservationSourcesReturns = pageValue(treasurySpendReservationSourceValue)
export type TreasurySpendReservationSourcesResult = Infer<typeof treasurySpendReservationSourcesReturns>
export const treasurySpendExposureArgs = { cutoffAt: v.number() }
export const treasurySpendExposureReturns = v.union(pageFailureValue, v.object({
  kind: v.literal('available'), cutoffAt: v.number(), platformBudgetRef: v.string(),
  liabilityUnits: v.string(), settledLast24hUnits: v.string(), totalExposureUnits: v.string(),
  liabilityRefs: v.array(v.string()), settledRefs: v.array(v.string()),
}))
export type TreasurySpendExposureResult = Infer<typeof treasurySpendExposureReturns>

/** Requires configured identity, a safe server cutoff, and a cursor bound to that
 * exact source and cutoff. Ensures <=25 compact rows and explicit incomplete joins.
 * Invariant: no mutable post-cutoff evidence or partial exposure is called complete.
 * On violation: unavailable; never writes, invents zero or infers payment from delivery.
 * Complexity: one internal adapter centralizes four indexed source projections and
 * existing booking joins; it adds no storage, financial authority or cursor service.
 */
export async function readTreasuryBatchSources(ctx: QueryCtx, args: AuditSourcePageArgs): Promise<TreasuryBatchSourcesResult> {
  const scope = pageScope(args, 'batches')
  if (scope.kind === 'unavailable') return scope
  try {
    const page = await ctx.db.query('moneyTreasuryBatches').withIndex('by_custody_and_createdAt', q =>
      q.eq('custodyRef', scope.identity.custodyRef).lte('createdAt', args.cutoffAt))
      .filter(q => q.eq(q.field('custodyGeneration'), scope.identity.custodyGeneration))
      .order('asc').paginate(scope.pagination)
    for (const row of page.page) {
      if (!validTime(row.createdAt, args.cutoffAt)
        || row.observation.environment !== scope.identity.environment || row.observation.network !== scope.identity.network
        || row.observation.asset !== scope.identity.asset || row.observation.address !== scope.identity.address) {
        return unavailable('treasury_source_identity_invalid')
      }
      if (!validTime(row.observation.observedAt, args.cutoffAt)
        || (row.state.kind === 'booked' && !validTime(row.state.completedAt, args.cutoffAt))) {
        return unavailable('treasury_source_cutoff_changed')
      }
    }
    return sourcePage(scope, page, page.page.map(row => project(row, treasuryBatchValue.fields)))
  } catch { return unavailable('treasury_source_read_unavailable') }
}

export async function readTreasuryFundingSources(ctx: QueryCtx, args: AuditSourcePageArgs): Promise<TreasuryFundingSourcesResult> {
  const scope = pageScope(args, 'funding')
  if (scope.kind === 'unavailable') return scope
  try {
    const page = await ctx.db.query('moneyFundingCommands').withIndex('by_environment_and_createdAt', q =>
      q.eq('environment', scope.identity.environment).lte('createdAt', args.cutoffAt)).order('asc').paginate(scope.pagination)
    for (const row of page.page) {
      if (!validTime(row.createdAt, args.cutoffAt) || !validTime(row.updatedAt, args.cutoffAt)
        || (row.reversedAt !== undefined && !validTime(row.reversedAt, args.cutoffAt))) {
        return unavailable('treasury_source_cutoff_changed')
      }
      if (![row.principalUnits, row.serviceFeeUnits, row.taxUnits, row.totalUnits].every(validUnits)
        || BigInt(row.principalUnits) + BigInt(row.serviceFeeUnits) + BigInt(row.taxUnits) !== BigInt(row.totalUnits)) {
        return unavailable('treasury_source_identity_invalid')
      }
    }
    return sourcePage(scope, page, page.page.map(row => project(row, fundingSourceValue.fields)))
  } catch { return unavailable('treasury_source_read_unavailable') }
}

export async function readTreasuryAttemptSources(ctx: QueryCtx, args: AuditSourcePageArgs): Promise<TreasuryAttemptSourcesResult> {
  const scope = pageScope(args, 'attempts')
  if (scope.kind === 'unavailable') return scope
  try {
    const page = await ctx.db.query('moneyX402PaymentAttempts').withIndex('by_custodyBudgetRef_and_preparedAt', q =>
      q.eq('custodyBudgetRef', scope.identity.custodyRef).lte('preparedAt', args.cutoffAt))
      .filter(q => q.eq(q.field('custodyGeneration'), scope.identity.custodyGeneration)).order('asc').paginate(scope.pagination)
    const rows: TreasuryAttemptSource[] = []
    for (const row of page.page) {
      if (!attemptWithinCutoff(row, args.cutoffAt)) return unavailable('treasury_source_cutoff_changed')
      const joined = await joinAttempt(ctx, row, scope.identity, args.cutoffAt)
      if (joined.kind === 'unavailable') return joined
      rows.push(joined.row)
    }
    return sourcePage(scope, page, rows)
  } catch { return unavailable('treasury_source_read_unavailable') }
}

/** Native financial reservations exist before payment-attempt preparation. */
export async function readTreasuryCallSources(ctx: QueryCtx, args: AuditSourcePageArgs): Promise<TreasuryCallSourcesResult> {
  const scope = pageScope(args, 'calls')
  if (scope.kind === 'unavailable') return scope
  try {
    const page = await ctx.db.query('capabilityCalls').withIndex('by_environment_and_createdAt', q =>
      q.eq('environment', scope.identity.environment).lte('createdAt', args.cutoffAt)).order('asc').paginate(scope.pagination)
    const rows: TreasuryCallSource[] = []
    for (const call of page.page) {
      const quoteRef = call.quoteRef
      const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes')
        .withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
      if (call.formanceFinancialState === undefined && quote?.sourceUsdcUnits === undefined) continue
      // Historical other-custody bookings belong to their own cutover audit.
      // Missing identity on an otherwise managed Call remains explicit evidence.
      if (quote?.treasuryCustodyRef !== undefined && (quote.treasuryCustodyRef !== scope.identity.custodyRef
        || quote.treasuryCustodyGeneration !== scope.identity.custodyGeneration)) continue
      if (!validTime(call.createdAt, args.cutoffAt) || !validTime(call.updatedAt, args.cutoffAt)
        || (quote !== null && (!validTime(quote.createdAt, args.cutoffAt) || !validTime(quote.updatedAt, args.cutoffAt)))) {
        return unavailable('treasury_source_cutoff_changed')
      }
      const native = await readBookingHandler(ctx, { callRef: call.callRef })
      const issues: string[] = []
      if (native.kind !== 'available') issues.push('native_booking_unavailable')
      else if (native.booking.treasuryRef !== scope.identity.custodyRef
        || native.booking.treasuryGeneration !== scope.identity.custodyGeneration
        || native.booking.toolRef !== call.toolRef || native.booking.inputDigest !== call.inputDigest) issues.push('native_booking_mismatch')
      if (quote === null) issues.push('missing_quote')
      else if (quote.inputDigest !== call.inputDigest || quote.toolRef !== call.toolRef
        || quote.accountRef !== call.ownerId || quote.principalId !== call.principalId
        || quote.credentialId !== call.credentialId || quote.applicationRef !== call.applicationRef
        || quote.grantRef !== call.grantRef || quote.grantGeneration !== call.grantGeneration
        || quote.grantPolicyDigest !== call.policyDigest || quote.grantExpiresAt !== call.grantExpiresAt) issues.push('quote_call_mismatch')
      const obligation = await ctx.db.query('moneyProviderObligations').withIndex('by_callRef', q => q.eq('callRef', call.callRef)).unique()
      if (obligation !== null && (!validTime(obligation.createdAt, args.cutoffAt) || !validTime(obligation.updatedAt, args.cutoffAt)
        || (obligation.settledAt !== undefined && !validTime(obligation.settledAt, args.cutoffAt))
        || (obligation.reversedAt !== undefined && !validTime(obligation.reversedAt, args.cutoffAt)))) return unavailable('treasury_source_cutoff_changed')
      if (obligation === null && (call.formanceSettlementRefs?.length ?? 0) > 0) issues.push('missing_provider_obligation')
      if (obligation !== null && (obligation.toolRef !== call.toolRef || obligation.buyerAccountRef !== call.ownerId
        || (native.kind === 'available' && (obligation.providerRef !== native.booking.providerRef
          || obligation.providerAmountUnits !== native.booking.providerAmountUnits))
        || (obligation.settlementTransactionRef !== undefined && !call.formanceSettlementRefs?.includes(obligation.settlementTransactionRef)))) {
        issues.push('provider_obligation_mismatch')
      }
      rows.push({ call: projectCall(call), native, obligation: obligation === null ? null : project(obligation, obligationSourceValue.fields), joinIssues: issues })
    }
    return sourcePage(scope, page, rows)
  } catch { return unavailable('treasury_source_read_unavailable') }
}

export async function readTreasurySpendReservationSources(
  ctx: QueryCtx, args: TreasurySpendReservationSourcesArgs,
): Promise<TreasurySpendReservationSourcesResult> {
  const scope = pageScope(args, `reservations:${args.state ?? 'all'}`)
  if (scope.kind === 'unavailable') return scope
  const policy = platformPolicy(scope.identity)
  if (policy === undefined) return unavailable('treasury_spend_configuration_unavailable')
  try {
    // State is intentionally not a database filter: a post-cutoff resolution
    // must remain visible before a caller selects liabilities or settled rows.
    const page = await ctx.db.query('moneyX402SpendReservations')
      .withIndex('by_platformBudgetRef_and_normalizedPayTo_and_reservedAt', q => q.eq('platformBudgetRef', policy.platformBudgetRef))
      .filter(q => q.lte(q.field('reservedAt'), args.cutoffAt)).order('asc').paginate(scope.pagination)
    for (const row of page.page) {
      if (!reservationWithinCutoff(row, args.cutoffAt)) return unavailable('treasury_source_cutoff_changed')
      if (!reservationIdentityMatches(row, scope.identity)) return unavailable('treasury_source_identity_invalid')
    }
    const rows = page.page.filter(row => args.state === undefined || row.state === args.state)
      .map(row => project({ ...row, settledAt: row.state === 'settled' ? row.settledAt : undefined,
        resolvedAt: row.state === 'unused' ? row.resolvedAt : undefined,
        resolutionEvidenceDigest: row.state === 'liability' ? undefined : row.resolutionEvidenceDigest,
        unusedProof: row.state === 'unused' ? row.unusedProof : undefined }, treasurySpendReservationSourceValue.fields) as Infer<typeof treasurySpendReservationSourceValue>)
    return sourcePage(scope, page, rows)
  } catch { return unavailable('treasury_source_read_unavailable') }
}

export async function readTreasurySpendExposure(ctx: Pick<QueryCtx, 'db'>, args: { cutoffAt: number }): Promise<TreasurySpendExposureResult> {
  const scope = pageScope(args, 'exposure')
  if (scope.kind === 'unavailable') return scope
  const policy = platformPolicy(scope.identity)
  if (policy === undefined) return unavailable('treasury_spend_configuration_unavailable')
  try {
    const [liabilities, settled, laterUnused] = await Promise.all([
      ctx.db.query('moneyX402SpendReservations').withIndex('by_platformBudgetRef_and_state_and_settledAt', q =>
        q.eq('platformBudgetRef', policy.platformBudgetRef).eq('state', 'liability'))
        .filter(q => q.lte(q.field('reservedAt'), args.cutoffAt)).take(X402_SPEND_HISTORY_LIMIT + 1),
      ctx.db.query('moneyX402SpendReservations').withIndex('by_platformBudgetRef_and_state_and_settledAt', q =>
        q.eq('platformBudgetRef', policy.platformBudgetRef).eq('state', 'settled')
          .gte('settledAt', Math.max(0, args.cutoffAt - X402_SPEND_WINDOW_MS)))
        .filter(q => q.lte(q.field('reservedAt'), args.cutoffAt)).take(X402_SPEND_HISTORY_LIMIT + 1),
      ctx.db.query('moneyX402SpendReservations').withIndex('by_platformBudgetRef_and_state_and_resolvedAt', q =>
        q.eq('platformBudgetRef', policy.platformBudgetRef).eq('state', 'unused').gt('resolvedAt', args.cutoffAt))
        .filter(q => q.lte(q.field('reservedAt'), args.cutoffAt)).take(1),
    ])
    if (laterUnused.length > 0 || [...liabilities, ...settled].some(row => !reservationWithinCutoff(row, args.cutoffAt))) {
      return unavailable('treasury_source_cutoff_changed')
    }
    const rows = [...liabilities, ...settled]
    if (rows.length > X402_SPEND_HISTORY_LIMIT) return unavailable('treasury_spend_history_incomplete')
    if (rows.some(row => !reservationIdentityMatches(row, scope.identity))
      || new Set(rows.map(row => row.reservationRef)).size !== rows.length) return unavailable('treasury_source_identity_invalid')
    const liabilityUnits = liabilities.reduce((sum, row) => sum + BigInt(row.amountUnits), 0n)
    const settledUnits = settled.reduce((sum, row) => sum + BigInt(row.amountUnits), 0n)
    return { kind: 'available', cutoffAt: args.cutoffAt, platformBudgetRef: policy.platformBudgetRef,
      liabilityUnits: liabilityUnits.toString(), settledLast24hUnits: settledUnits.toString(),
      totalExposureUnits: (liabilityUnits + settledUnits).toString(),
      liabilityRefs: liabilities.map(row => row.reservationRef), settledRefs: settled.map(row => row.reservationRef) }
  } catch { return unavailable('treasury_source_read_unavailable') }
}

async function joinAttempt(ctx: QueryCtx, row: Doc<'moneyX402PaymentAttempts'>, identity: TreasuryIdentity, cutoffAt: number): Promise<
  { kind: 'available'; row: TreasuryAttemptSource } | Infer<typeof pageFailureValue>
> {
  const issues: string[] = []
  const call = await ctx.db.query('capabilityCalls').withIndex('by_callRef', q => q.eq('callRef', row.dispatchRef)).unique()
  const quoteRef = call?.quoteRef
  const quote = quoteRef === undefined ? null : await ctx.db.query('capabilityQuotes')
    .withIndex('by_quoteRef', q => q.eq('quoteRef', quoteRef)).unique()
  if ((call !== null && (!validTime(call.createdAt, cutoffAt) || !validTime(call.updatedAt, cutoffAt)))
    || (quote !== null && (!validTime(quote.createdAt, cutoffAt) || !validTime(quote.updatedAt, cutoffAt)))) {
    return unavailable('treasury_source_cutoff_changed')
  }
  if (call === null) issues.push('missing_call')
  else {
    if (call.attemptRef !== row.attemptRef) issues.push('call_attempt_mismatch')
    if (row.toolRef === undefined || row.inputDigest === undefined || call.toolRef !== row.toolRef
      || call.inputDigest !== row.inputDigest || call.environment !== identity.environment) issues.push('call_material_mismatch')
  }
  if (quote === null) issues.push('missing_quote')
  else if (call !== null && (quote.accountRef !== call.ownerId || quote.principalId !== call.principalId
    || quote.toolRef !== call.toolRef || quote.inputDigest !== call.inputDigest
    || quote.credentialId !== call.credentialId || quote.applicationRef !== call.applicationRef
    || quote.grantRef !== call.grantRef || quote.grantGeneration !== call.grantGeneration
    || quote.grantPolicyDigest !== call.policyDigest || quote.grantExpiresAt !== call.grantExpiresAt)) issues.push('quote_call_mismatch')
  if (row.network !== identity.network || row.asset.toLowerCase() !== identity.asset || row.currency !== 'USDC' || row.exponent !== 6
    || (row.paymentPayer !== undefined && row.paymentPayer.toLowerCase() !== identity.address)
    || !validUnits(row.amountUnits) || row.amountUnits === '0'
    || (quote !== null && (quote.treasuryCustodyRef !== identity.custodyRef
      || quote.treasuryCustodyGeneration !== identity.custodyGeneration || quote.sourceUsdcUnits !== row.amountUnits))) issues.push('custody_mismatch')
  const native = await readBookingHandler(ctx, { callRef: row.dispatchRef })
  if (native.kind !== 'available') issues.push('native_booking_unavailable')
  else if (native.booking.treasuryRef !== identity.custodyRef || native.booking.treasuryGeneration !== identity.custodyGeneration
    || native.booking.toolRef !== row.toolRef || native.booking.inputDigest !== row.inputDigest
    || native.booking.providerAmountUnits !== row.amountUnits) issues.push('native_booking_mismatch')
  const obligation = await ctx.db.query('moneyProviderObligations')
    .withIndex('by_callRef', q => q.eq('callRef', row.dispatchRef)).unique()
  if (obligation !== null && (!validTime(obligation.createdAt, cutoffAt) || !validTime(obligation.updatedAt, cutoffAt)
    || (obligation.settledAt !== undefined && !validTime(obligation.settledAt, cutoffAt))
    || (obligation.reversedAt !== undefined && !validTime(obligation.reversedAt, cutoffAt)))) {
    return unavailable('treasury_source_cutoff_changed')
  }
  if (obligation !== null && (obligation.toolRef !== row.toolRef || obligation.providerAmountUnits !== row.amountUnits
    || (call !== null && obligation.buyerAccountRef !== call.ownerId)
    || (native.kind === 'available' && obligation.providerRef !== native.booking.providerRef)
    || (obligation.settlementTransactionRef !== undefined && !call?.formanceSettlementRefs?.includes(obligation.settlementTransactionRef)))) {
    issues.push('provider_obligation_mismatch')
  }
  if (obligation === null && (call?.formanceSettlementRefs?.length ?? 0) > 0) issues.push('missing_provider_obligation')
  const siblings = await ctx.db.query('moneyX402PaymentAttempts').withIndex('by_dispatchRef', q => q.eq('dispatchRef', row.dispatchRef))
    .take(HISTORY_LIMIT + 1)
  if (siblings.length > HISTORY_LIMIT) issues.push('attempt_history_incomplete')
  else {
    let paid = 0
    let exactUnused = false
    for (const sibling of siblings) {
      // Later-created attempts cannot contaminate the cutoff, but a later
      // observation of an existing attempt makes this snapshot unreconstructable.
      if (sibling.preparedAt > cutoffAt) continue
      if (!attemptWithinCutoff(sibling, cutoffAt)) return unavailable('treasury_source_cutoff_changed')
      const reservations = await ctx.db.query('moneyX402SpendReservations')
        .withIndex('by_attemptRef_and_effectGeneration', q => q.eq('attemptRef', sibling.attemptRef).eq('effectGeneration', sibling.effectGeneration)).take(2)
      const reservation = reservations[0]
      const matches = reservation !== undefined && reservationMatchesAttempt(reservation, sibling)
      if (reservations.length > 1 || (reservation !== undefined && !matches)) {
        issues.push('spend_reservation_conflict')
      }
      if (reservation !== undefined && !reservationWithinCutoff(reservation, cutoffAt)) return unavailable('treasury_source_cutoff_changed')
      if (reservation?.state === 'unused' && matches) {
        if (sibling._id === row._id) exactUnused = true
        continue
      }
      if (reservation?.state === 'settled' || (sibling.settlementStatus === 'settled'
        && [...sibling.evidenceRefs, sibling.reconciliationEvidenceRef ?? ''].some(ref => ref.startsWith(`chain:${sibling.network}:`)))) paid += 1
    }
    if (paid > 1) issues.push('multiple_paid_attempts')
    if (exactUnused) {
      const mismatch = issues.indexOf('call_attempt_mismatch')
      if (mismatch >= 0) issues.splice(mismatch, 1)
    }
  }
  return { kind: 'available', row: {
    material: project(row, attemptMaterialValue.fields), joinIssues: [...new Set(issues)], native,
    obligation: obligation === null ? null : project(obligation, obligationSourceValue.fields),
    call: call === null ? null : projectCall(call),
    quote: quote === null ? null : { quoteRef: quote.quoteRef, accountRef: quote.accountRef, principalRef: quote.principalId,
      toolRef: quote.toolRef, inputDigest: quote.inputDigest, buyerAmountUnits: quote.decisionAudUnits,
      ...(quote.treasuryCustodyRef === undefined ? {} : { custodyRef: quote.treasuryCustodyRef }),
      ...(quote.treasuryCustodyGeneration === undefined ? {} : { custodyGeneration: quote.treasuryCustodyGeneration }),
      ...(quote.sourceUsdcUnits === undefined ? {} : { providerAmountUnits: quote.sourceUsdcUnits }),
      evidenceDigest: quote.evidenceDigest, ...(quote.x402RequirementDigest === undefined ? {} : { x402RequirementDigest: quote.x402RequirementDigest }),
      ...(quote.rateEvidenceDigest === undefined ? {} : { rateEvidenceDigest: quote.rateEvidenceDigest }),
      ...(quote.treasuryEvidenceDigest === undefined ? {} : { treasuryEvidenceDigest: quote.treasuryEvidenceDigest }),
      createdAt: quote.createdAt, updatedAt: quote.updatedAt },
  } }
}

type PageScope = { kind: 'configured'; identity: TreasuryIdentity; cutoffAt: number; binding: string;
  pagination: { cursor: string | null; numItems: number; maximumRowsRead: number; maximumBytesRead: number } }
function pageScope(args: AuditSourcePageArgs, category: string): PageScope | Infer<typeof pageFailureValue> {
  const identity = configuredTreasuryIdentity()
  if (identity === undefined) return unavailable('treasury_configuration_unavailable')
  const limit = args.limit ?? PAGE_LIMIT
  if (!Number.isSafeInteger(args.cutoffAt) || args.cutoffAt < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > PAGE_LIMIT) {
    return unavailable('treasury_source_input_invalid')
  }
  const binding = canonicalDigest({ kind: 'ae.treasury-source-page:v1', identity, category, cutoffAt: args.cutoffAt })
  let nativeCursor: string | null = null
  if (args.cursor !== undefined) {
    if (args.cursor.length > 16_000) return unavailable('treasury_source_cursor_invalid')
    try {
      const cursor: unknown = JSON.parse(args.cursor)
      if (!isRecord(cursor) || cursor.binding !== binding || typeof cursor.cursor !== 'string'
        || cursor.cursor.length === 0 || Object.keys(cursor).length !== 2) return unavailable('treasury_source_cursor_invalid')
      nativeCursor = cursor.cursor
    } catch { return unavailable('treasury_source_cursor_invalid') }
  }
  return { kind: 'configured', identity, cutoffAt: args.cutoffAt, binding,
    pagination: { cursor: nativeCursor, numItems: limit, maximumRowsRead: 250, maximumBytesRead: 2 * 1024 * 1024 } }
}
function sourcePage<T>(scope: PageScope, page: { page: readonly unknown[]; isDone: boolean; continueCursor: string }, rows: T[]):
  { kind: 'available'; cutoffAt: number; rows: T[]; isDone: boolean; cursor: string | null } | Infer<typeof pageFailureValue> {
  if (page.page.length > scope.pagination.numItems || rows.length > PAGE_LIMIT
    || (!page.isDone && (page.continueCursor.length === 0 || page.continueCursor === scope.pagination.cursor))) {
    return unavailable('treasury_source_page_invalid')
  }
  return { kind: 'available', cutoffAt: scope.cutoffAt, rows, isDone: page.isDone,
    cursor: page.isDone ? null : JSON.stringify({ binding: scope.binding, cursor: page.continueCursor }) }
}
function project<T, K extends keyof T>(row: T, fields: Record<K, unknown>): Pick<T, K> {
  const result = {} as Pick<T, K>
  for (const key of Object.keys(fields) as K[]) if (row[key] !== undefined) result[key] = row[key]
  return result
}
function projectCall(call: Doc<'capabilityCalls'>): Infer<typeof callSourceValue> {
  const receipt = call.result !== undefined && 'receipt' in call.result ? call.result.receipt : undefined
  return { callRef: call.callRef, ...(call.quoteRef === undefined ? {} : { quoteRef: call.quoteRef }),
    accountRef: call.ownerId, principalRef: call.principalId, toolRef: call.toolRef, inputDigest: call.inputDigest,
    ...(call.attemptRef === undefined ? {} : { attemptRef: call.attemptRef }), state: call.state,
    ...(call.formanceFinancialState === undefined ? {} : { financialState: call.formanceFinancialState }),
    createdAt: call.createdAt, updatedAt: call.updatedAt, reservationRefs: call.formanceReservationRefs ?? [],
    settlementRefs: call.formanceSettlementRefs ?? [], releaseRefs: call.formanceReleaseRefs ?? [],
    ...(call.evidenceHash === undefined ? {} : { evidenceHash: call.evidenceHash }),
    ...(receipt?.externalSettlementRef === undefined ? {} : { externalSettlementRef: receipt.externalSettlementRef }),
    ...(receipt?.lossState === undefined ? {} : { lossState: receipt.lossState }),
  }
}
function validTime(value: number, cutoffAt: number) { return Number.isSafeInteger(value) && value >= 0 && value <= cutoffAt }
function validUnits(value: string) { return /^(?:0|[1-9][0-9]{0,77})$/u.test(value) }
function attemptWithinCutoff(row: Doc<'moneyX402PaymentAttempts'>, cutoffAt: number) {
  return validTime(row.preparedAt, cutoffAt) && [row.observedAt, row.submissionStartedAt,
    row.paymentSigningClaimedAt, row.authorizationFailureObservedAt].every(time => time === undefined || validTime(time, cutoffAt))
}
function reservationWithinCutoff(row: Doc<'moneyX402SpendReservations'>, cutoffAt: number) {
  return validTime(row.reservedAt, cutoffAt) && (row.state === 'liability'
    || (row.state === 'settled' ? validTime(row.settledAt, cutoffAt) : validTime(row.resolvedAt, cutoffAt)))
}
function reservationIdentityMatches(row: Doc<'moneyX402SpendReservations'>, identity: TreasuryIdentity) {
  return row.environment === identity.environment && row.network === identity.network && row.asset === identity.asset
    && validUnits(row.amountUnits) && row.amountUnits !== '0' && Number.isSafeInteger(row.custodyGeneration) && row.custodyGeneration > 0
    && Number.isSafeInteger(row.effectGeneration) && row.effectGeneration > 0
}
function reservationMatchesAttempt(reservation: Doc<'moneyX402SpendReservations'>, attempt: Doc<'moneyX402PaymentAttempts'>) {
  return reservation.dispatchRef === attempt.dispatchRef && reservation.attemptRef === attempt.attemptRef
    && reservation.effectGeneration === attempt.effectGeneration && reservation.custodyRef === attempt.custodyRef
    && reservation.custodyBudgetRef === attempt.custodyBudgetRef && reservation.custodyGeneration === attempt.custodyGeneration
    && reservation.reservationRef === attempt.spendReservationRef && reservation.authorizationDigest === attempt.authorizationDigest
    && reservation.paymentIdentityDigest === attempt.paymentIdentityDigest
    && reservation.paymentUnsignedMaterialDigest === attempt.paymentUnsignedMaterialDigest
    && reservation.paymentSigningIdempotencyKey === attempt.paymentSigningIdempotencyKey
    && reservation.normalizedPayTo === attempt.payTo.toLowerCase() && reservation.amountUnits === attempt.amountUnits
    && reservation.currency === attempt.currency && reservation.exponent === attempt.exponent
    && reservation.network === attempt.network && reservation.asset === attempt.asset.toLowerCase()
}
function platformPolicy(identity: TreasuryIdentity) {
  return x402SpendPolicyFromEnvironment(env, { environment: identity.environment, network: identity.network, asset: identity.asset })
}
function unavailable(code: string) { return { kind: 'unavailable' as const, code } }

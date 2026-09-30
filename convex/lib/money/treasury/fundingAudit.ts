"use node"

import Stripe from 'stripe'
import { deploymentPaymentEnvironment } from '@/lib/deployment/environment'
import { boundaryCauseKind, degradeBackend } from '@/lib/observability/degrade-backend'
import { compareExactAmounts, isMoneyRefusal, rescaleExactAmount, type ExactAmount } from '@/modules/money/public'
import type { TreasuryCheck } from '@/modules/money/treasury-report'
import {
  createStripeMoneyProvider, mapStripeFundingRefundEvidence, readStripeFundingRefund,
  readStripeMoneyReadbackProviderConfig, resolveStripeMoneyProviderContext,
  type StripeMoneyClient, type StripeMoneyProviderConfig, type StripeFundingRefundEvidence,
} from '../../../../src/lib/server/stripe-money-provider'
import {
  isTreasuryFundingAuditTransaction, matchTreasuryFunding, treasuryFundingPrincipalDelta,
  type FormanceFundingBooking, type FormanceTreasuryAuditTransaction,
} from '../formance/gateway'
import type { TreasuryFundingSourcesResult } from './auditSources'

export const TREASURY_FUNDING_READBACK_LIMIT = 250
export const TREASURY_FUNDING_DEADLINE_MS = 120_000
export const TREASURY_FUNDING_REQUEST_TIMEOUT_MS = 5_000
const REFUND_PAGE_SIZE = 100
const REFUND_HISTORY_LIMIT = 1_000
const EVIDENCE_LIMIT = 20
const MAX_UNITS = BigInt(Number.MAX_SAFE_INTEGER)
type FundingSource = Extract<TreasuryFundingSourcesResult, { kind: 'available' }>['rows'][number]
type ProcessorContext = Readonly<{ client: StripeMoneyClient; config: StripeMoneyProviderConfig; deadlineAt: number }>
type Unavailable = Extract<TreasuryCheck, { kind: 'unavailable' }>
const unavailable = (code: string): Unavailable => ({ kind: 'unavailable', code })
const aud = (units: string): ExactAmount => ({ currency: 'AUD', exponent: 6, units })
const validUnits = (units: string): boolean => /^(?:0|[1-9]\d{0,15})$/u.test(units) && BigInt(units) <= MAX_UNITS
const safeTotal = (units: bigint): boolean => units >= -MAX_UNITS && units <= MAX_UNITS
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_:-]{1,500}$/u.test(value)
const objectId = (value: string | { id: string } | null): string | undefined =>
  typeof value === 'string' ? value : value?.id

/**
 * Requires complete cutoff-bound funding/native source pages from the producer,
 * original durable checkout/refund evidence and the admitted deployment environment.
 * Ensures fresh Stripe identity/status/refund reads plus exact canonical native
 * principal/fee/tax/total postings for every terminal credit or full refund.
 * Invariant: purchased principal movements are not current balances; a newly seen,
 * partial or pending processor refund cannot prove a cutoff-native reversal.
 * On violation: mismatch for evidenced contradictions, attention for unresolved
 * processing, unavailable for missing source coverage/readback. No financial writes.
 * COMPLEXITY: one Node helper adds bounded checkout/charge/refund reads; the existing
 * provider and money gateway retain Stripe binding and native chart/hash knowledge.
 * Keep: stored success flags cannot discover refunds missing from webhook ingestion.
 * Alpha limit: <=250 funding rows, <=1,000 refunds/charge, <=120s total;
 * every SDK request has a 5s wall-clock abort covering fetch AND response body,
 * independent of the SDK header timer, and zero retries. Proven mismatches survive
 * an unrelated read outage/deadline; missing work never becomes a matched check.
 */
export async function auditTreasuryFunding(
  rows: readonly FundingSource[],
  transactions: readonly FormanceTreasuryAuditTransaction[],
  environment: 'sandbox' | 'production',
): Promise<TreasuryCheck> {
  const deadlineAt = Date.now() + TREASURY_FUNDING_DEADLINE_MS
  if (rows.length > TREASURY_FUNDING_READBACK_LIMIT) return unavailable('treasury_funding_readback_incomplete')
  const nativeFunding = transactions.filter(isTreasuryFundingAuditTransaction)
  const byReference = new Map<string, FormanceTreasuryAuditTransaction>()
  let observed = 0n
  for (const transaction of nativeFunding) {
    const delta = treasuryFundingPrincipalDelta(transaction)
    if (delta === undefined) return unavailable('treasury_funding_native_units_unavailable')
    observed += BigInt(delta)
    if (!safeTotal(observed)) return unavailable('treasury_funding_units_unsafe')
    if (transaction.commandRef !== null) {
      if (byReference.has(transaction.commandRef)) return unavailable('treasury_funding_native_identity_invalid')
      byReference.set(transaction.commandRef, transaction)
    }
  }
  let expected = 0n
  const sourceRefs = new Set<string>()
  for (const row of rows) {
    if (row.environment !== environment || sourceRefs.has(row.commandRef)
      || ![row.principalUnits, row.serviceFeeUnits, row.taxUnits, row.totalUnits].every(validUnits)
      || BigInt(row.principalUnits) + BigInt(row.serviceFeeUnits) + BigInt(row.taxUnits) !== BigInt(row.totalUnits)) {
      return unavailable('treasury_funding_source_identity_invalid')
    }
    sourceRefs.add(row.commandRef)
    if (row.state === 'succeeded' || row.state === 'reversed') expected += BigInt(row.principalUnits)
    if (row.state === 'reversed' && row.reversalState === 'succeeded') expected -= BigInt(row.principalUnits)
    if (!safeTotal(expected)) return unavailable('treasury_funding_units_unsafe')
  }
  if (rows.length === 0 && nativeFunding.length === 0) return matched(0, 0n)
  if (rows.length === 0) return mismatch('treasury_funding_native_orphan', nativeFunding.length, expected, observed,
    nativeFunding.slice(0, EVIDENCE_LIMIT).map(transactionRef))
  const claimed = new Set<string>()
  const attentionRefs = new Set<string>()
  const mismatchRefs = new Set<string>()
  let attentionCode: string | undefined
  let mismatchCode: string | undefined
  const attention = (code: string, ref: string) => { attentionCode ??= code; attentionRefs.add(ref) }
  const difference = (code: string, ref: string) => { mismatchCode ??= code; mismatchRefs.add(ref) }
  const failed = (code: string): TreasuryCheck => mismatchCode === undefined ? unavailable(code)
    : mismatch(mismatchCode, rows.length, expected, observed, [...mismatchRefs].slice(0, EVIDENCE_LIMIT))
  // Native contradictions can be established without Stripe availability. A
  // pending native booking earns attention only through an exact source match.
  for (const row of rows) {
    const terminal = row.state === 'succeeded' || row.state === 'reversed'
    const original = row.appliedTransactionRef === undefined ? undefined : byReference.get(row.appliedTransactionRef)
    const processorRef = row.externalRef
    const evidenceDigest = row.evidenceDigest
    const refundId = row.reversalRefundId
    const reversalEvidenceDigest = row.reversalEvidenceDigest
    if (terminal && processorRef !== undefined && evidenceDigest !== undefined && row.appliedTransactionRef !== undefined) {
      if (original !== undefined) claimed.add(original.id)
      if (original === undefined || !matchTreasuryFunding(original, settlementBooking(row, processorRef, evidenceDigest), 'settlement')) difference('treasury_funding_native_binding_invalid', row.commandRef)
    } else if (!terminal && (row.state === 'pending' || row.state === 'outcome_unknown') && processorRef !== undefined && evidenceDigest !== undefined) {
      const pending = nativeFunding.find(native => native.metadata.external_evidence_digest === evidenceDigest.slice(7)
        && matchTreasuryFunding(native, settlementBooking(row, processorRef, evidenceDigest), 'settlement'))
      if (pending !== undefined) { claimed.add(pending.id); attention('treasury_funding_native_unattributed', row.commandRef) }
    }
    if (refundId !== undefined && processorRef !== undefined && reversalEvidenceDigest !== undefined) {
      const reversal = row.reversalTransactionRef === undefined ? undefined : byReference.get(row.reversalTransactionRef)
      if (row.state === 'reversed' && row.reversalState === 'succeeded' && row.reversalTransactionRef !== undefined) {
        if (reversal !== undefined) claimed.add(reversal.id)
        if (reversal === undefined || !matchTreasuryFunding(reversal, reversalBooking(row, processorRef, reversalEvidenceDigest, refundId), 'reversal')) difference('treasury_funding_native_reversal_invalid', row.commandRef)
      } else if (row.reversalState === 'pending' || row.reversalState === 'outcome_unknown') {
        const pending = nativeFunding.find(native => native.metadata.external_evidence_digest === reversalEvidenceDigest.slice(7)
          && matchTreasuryFunding(native, reversalBooking(row, processorRef, reversalEvidenceDigest, refundId), 'reversal'))
        if (pending !== undefined) { claimed.add(pending.id); attention('treasury_funding_native_unattributed', row.commandRef) }
      }
    }
  }
  for (const native of nativeFunding) if (!claimed.has(native.id)) difference('treasury_funding_native_orphan', transactionRef(native))
  if (deploymentPaymentEnvironment(globalThis.process.env) !== environment) return failed('treasury_funding_environment_invalid')
  const config = readStripeMoneyReadbackProviderConfig(globalThis.process.env, environment === 'production' ? 'live' : 'test')
  if (isMoneyRefusal(config)) return failed('treasury_funding_processor_unavailable')
  try {
    const resolved = resolveStripeMoneyProviderContext({ config, client: new Stripe(config.secretKey, {
      apiVersion: Stripe.API_VERSION, typescript: true, timeout: TREASURY_FUNDING_REQUEST_TIMEOUT_MS, maxNetworkRetries: 0,
      // Stripe's default Node timeout is inactivity-based; its Fetch adapter's
      // own timer ends at headers. This independent signal remains bound to the
      // native fetch response body until consumption finishes or aborts.
      httpClient: Stripe.createFetchHttpClient((url, init) => globalThis.fetch(url, {
        ...init, signal: AbortSignal.any([
          AbortSignal.timeout(TREASURY_FUNDING_REQUEST_TIMEOUT_MS),
          ...(init?.signal === undefined || init.signal === null ? [] : [init.signal]),
        ]),
      })),
    }) })
    if (isMoneyRefusal(resolved)) return failed('treasury_funding_processor_unavailable')
    const context: ProcessorContext = { ...resolved, deadlineAt }
    const provider = createStripeMoneyProvider({ config, client: context.client })
    for (const row of rows) {
      if (!readBudgetAvailable(deadlineAt)) return failed('treasury_funding_read_budget_exhausted')
      const terminalCredit = row.state === 'succeeded' || row.state === 'reversed'
      if (row.appliedTransactionRef !== undefined) {
        const native = byReference.get(row.appliedTransactionRef)
        if (native !== undefined) claimed.add(native.id)
      }
      if (row.reversalTransactionRef !== undefined) {
        const native = byReference.get(row.reversalTransactionRef)
        if (native !== undefined) claimed.add(native.id)
      }
      if (row.externalRef === undefined) { attention('treasury_funding_source_incomplete', row.commandRef); continue }
      const payment = await provider.readCreditPayment({
        commandRef: row.commandRef, principalId: row.actorPrincipalRef, accountRef: row.accountRef,
        amount: aud(row.totalUnits), idempotencyKey: row.idempotencyKey, inputDigest: row.inputDigest,
        successReturnRef: row.successReturnRef, providerRecoveryDeadlineAt: row.providerRecoveryDeadlineAt,
        principalAmount: aud(row.principalUnits), serviceFeeAmount: aud(row.serviceFeeUnits), taxAmount: aud(row.taxUnits),
        ...(row.cancelReturnRef === undefined ? {} : { cancelReturnRef: row.cancelReturnRef }),
        ...(row.checkoutExpiresAt === undefined ? {} : { checkoutExpiresAt: row.checkoutExpiresAt }),
        externalRef: row.externalRef,
      })
      if (isMoneyRefusal(payment)) {
        if (payment.code === 'payment_binding_invalid' || payment.code === 'ledger_idempotency_conflict'
          || payment.code === 'credit_topup_amount_invalid') { difference('treasury_funding_processor_binding_invalid', row.commandRef); continue }
        return failed('treasury_funding_processor_read_unavailable')
      }
      const evidence = payment.evidence
      if (evidence.externalRef !== row.externalRef || compareExactAmounts(evidence.amount, aud(row.totalUnits)) !== 0
        || (row.requestDigest !== undefined && evidence.requestDigest !== row.requestDigest)
        || (row.metadataDigest !== undefined && evidence.metadataDigest !== row.metadataDigest)
        || (terminalCredit && (evidence.requestDigest !== row.requestDigest || evidence.metadataDigest !== row.metadataDigest
          || evidence.checkoutSessionDigest !== row.checkoutSessionDigest || evidence.paymentId !== row.paymentId
          || evidence.paymentIntentDigest !== row.paymentIntentDigest || evidence.evidenceDigest !== row.evidenceDigest))) {
        difference('treasury_funding_processor_binding_invalid', row.commandRef); continue
      }
      if (!terminalCredit) {
        if (row.state === 'failed' && evidence.status === 'failed' && evidence.paymentId === undefined
          && row.appliedTransactionRef === undefined) continue
        attention(evidence.status === 'succeeded' ? 'treasury_funding_payment_unapplied' : 'treasury_funding_processing_pending', row.commandRef)
        // A successful but unprojected checkout still needs refund discovery.
        if (evidence.status !== 'succeeded' || evidence.paymentId === undefined) continue
      } else {
        if (evidence.status !== 'succeeded' || evidence.checkoutStatus !== 'complete' || evidence.paymentStatus !== 'paid') {
          difference('treasury_funding_processor_not_settled', row.commandRef); continue
        }
        if (row.appliedStripeEventId === undefined || row.appliedPayloadDigest === undefined || row.evidenceDigest === undefined
          || row.appliedTransactionRef === undefined || row.paymentId === undefined) {
          attention('treasury_funding_source_incomplete', row.commandRef); continue
        }
        const native = byReference.get(row.appliedTransactionRef)
        if (native === undefined || !matchTreasuryFunding(native, settlementBooking(row, row.externalRef, row.evidenceDigest), 'settlement')) {
          difference('treasury_funding_native_binding_invalid', row.commandRef)
        }
      }
      if (evidence.paymentId === undefined) { attention('treasury_funding_payment_identity_unavailable', row.commandRef); continue }
      const charge = await readSettledCharge(context, evidence.paymentId, row.totalUnits)
      if (charge.kind === 'unavailable') return failed(charge.code)
      if (charge.kind === 'mismatch') { difference('treasury_funding_charge_binding_invalid', row.commandRef); continue }
      const refunds = await readChargeRefunds(context, charge.value, evidence.paymentId)
      if (refunds.kind === 'unavailable') return failed(refunds.code)
      let refunded = 0n
      for (const refund of refunds.rows) {
        if (refund.status === 'pending') attention('treasury_funding_refund_pending', row.commandRef)
        if (refund.status !== 'succeeded') continue
        const amount = rescaleExactAmount(refund.amount, 6)
        if (amount === undefined || amount.currency !== 'AUD' || !validUnits(amount.units)) return failed('treasury_funding_refund_units_unavailable')
        refunded += BigInt(amount.units)
        if (!safeTotal(refunded)) return failed('treasury_funding_units_unsafe')
        if (refund.refundId !== row.reversalRefundId) attention('treasury_funding_refund_unrecorded', row.commandRef)
        if (compareExactAmounts(refund.amount, aud(row.totalUnits)) !== 0) attention('treasury_funding_refund_partial', row.commandRef)
      }
      if (compareExactAmounts(aud(refunded.toString()), { currency: 'AUD', exponent: 2, units: String(charge.value.amount_refunded) }) !== 0) {
        // Stripe reads can straddle a new refund; retain attention rather than
        // alleging native drift from two inconsistent current observations.
        attention('treasury_funding_refund_observation_changed', row.commandRef)
      }
      if (row.reversalRefundId !== undefined) {
        if (!readBudgetAvailable(deadlineAt)) return failed('treasury_funding_read_budget_exhausted')
        const refund = await readStripeFundingRefund(context.client, context.config, row.reversalRefundId)
        if (isMoneyRefusal(refund)) return failed('treasury_funding_refund_read_unavailable')
        if (refund.paymentId !== evidence.paymentId || refund.chargeId !== charge.value.id
          || refund.refundId !== row.reversalRefundId || refund.chargeId !== row.reversalChargeId) {
          difference('treasury_funding_refund_binding_invalid', row.commandRef); continue
        }
        if (refund.status !== 'succeeded' || compareExactAmounts(refund.amount, aud(row.totalUnits)) !== 0
          || row.state !== 'reversed' || row.reversalState !== 'succeeded') {
          attention('treasury_funding_refund_unresolved', row.commandRef); continue
        }
        if (refund.evidenceDigest !== row.reversalEvidenceDigest || row.reversalStripeEventId === undefined
          || row.reversalTransactionRef === undefined || row.reversalEvidenceDigest === undefined
          || compareExactAmounts({ currency: 'AUD', exponent: 2, units: String(charge.value.amount_refunded) }, aud(row.totalUnits)) !== 0) {
          difference('treasury_funding_refund_binding_invalid', row.commandRef); continue
        }
        const native = byReference.get(row.reversalTransactionRef)
        if (native === undefined || !matchTreasuryFunding(native, reversalBooking(row, row.externalRef, row.reversalEvidenceDigest, row.reversalRefundId), 'reversal')) difference('treasury_funding_native_reversal_invalid', row.commandRef)
      } else if (row.state === 'reversed' || row.reversalState !== undefined || row.reversalTransactionRef !== undefined) {
        attention('treasury_funding_refund_source_incomplete', row.commandRef)
      }
    }
  } catch (cause) {
    return degradeBackend(boundaryCauseKind(cause), failed('treasury_funding_processor_read_unavailable'), {
      site: 'auditTreasuryFunding', reason: 'source_unavailable',
    })
  }
  if (Date.now() >= deadlineAt) return failed('treasury_funding_read_budget_exhausted')
  if (mismatchCode !== undefined) return mismatch(mismatchCode, rows.length, expected, observed, [...mismatchRefs].slice(0, EVIDENCE_LIMIT))
  if (attentionCode !== undefined) return { kind: 'attention', code: attentionCode, pendingCount: attentionRefs.size,
    pendingUnits: null, evidenceRefs: [...attentionRefs].slice(0, EVIDENCE_LIMIT) }
  if (expected !== observed) return mismatch('treasury_funding_principal_difference', rows.length, expected, observed, [...sourceRefs].slice(0, EVIDENCE_LIMIT))
  return matched(rows.length, expected)
}

function settlementBooking(row: FundingSource, processorRef: string, evidenceDigest: string): FormanceFundingBooking {
  return { commandRef: row.commandRef, idempotencyKey: row.idempotencyKey, accountRef: row.accountRef,
    processorRef, principalUnits: row.principalUnits, serviceFeeUnits: row.serviceFeeUnits,
    taxUnits: row.taxUnits, totalUnits: row.totalUnits, policyDigest: row.commercialPolicyDigest, externalEvidenceDigest: evidenceDigest }
}
function reversalBooking(row: FundingSource, processorRef: string, reversalEvidenceDigest: string, refundId: string): FormanceFundingBooking {
  return { ...settlementBooking(row, processorRef, reversalEvidenceDigest), commandRef: `funding-reversal:${refundId}`,
    idempotencyKey: `funding-reversal:${refundId}` }
}
const transactionRef = (transaction: FormanceTreasuryAuditTransaction): string => transaction.commandRef ?? `native:${transaction.id}`
function matched(checkedCount: number, units: bigint): TreasuryCheck {
  return { kind: 'matched', checkedCount, expectedUnits: units.toString(), observedUnits: units.toString(), differenceUnits: '0' }
}
function mismatch(code: string, checkedCount: number, expected: bigint, observed: bigint, evidenceRefs: string[]): TreasuryCheck {
  return { kind: 'mismatch', code, checkedCount, expectedUnits: expected.toString(), observedUnits: observed.toString(),
    differenceUnits: (observed - expected).toString(), evidenceRefs }
}

async function readSettledCharge(context: ProcessorContext, paymentId: string, totalUnits: string): Promise<
  Unavailable | { kind: 'mismatch' } | { kind: 'available'; value: Stripe.Charge }
> {
  let charge: Stripe.Charge | null
  if (!readBudgetAvailable(context.deadlineAt)) return unavailable('treasury_funding_read_budget_exhausted')
  if (paymentId.startsWith('pi_')) {
    const intent = await context.client.paymentIntents.retrieve(paymentId, { expand: ['latest_charge'] })
    if (intent.id !== paymentId || intent.livemode !== (context.config.mode === 'live') || intent.status !== 'succeeded'
      || intent.currency !== 'aud' || !Number.isSafeInteger(intent.amount) || !Number.isSafeInteger(intent.amount_received)
      || compareExactAmounts({ currency: 'AUD', exponent: 2, units: String(intent.amount) }, aud(totalUnits)) !== 0
      || intent.amount_received !== intent.amount) return { kind: 'mismatch' }
    if (typeof intent.latest_charge === 'string' && !readBudgetAvailable(context.deadlineAt)) return unavailable('treasury_funding_read_budget_exhausted')
    charge = typeof intent.latest_charge === 'string' ? await context.client.charges.retrieve(intent.latest_charge) : intent.latest_charge
  } else if (paymentId.startsWith('ch_')) charge = await context.client.charges.retrieve(paymentId)
  else return unavailable('treasury_funding_payment_identity_unavailable')
  if (charge === null) return unavailable('treasury_funding_charge_unavailable')
  if (!identifier(charge.id) || charge.object !== 'charge' || charge.livemode !== (context.config.mode === 'live')
    || (paymentId.startsWith('pi_') ? objectId(charge.payment_intent) !== paymentId : charge.id !== paymentId)
    || charge.currency !== 'aud' || charge.paid !== true || charge.captured !== true || charge.status !== 'succeeded'
    || !Number.isSafeInteger(charge.amount) || charge.amount <= 0
    || charge.amount_captured !== charge.amount || !Number.isSafeInteger(charge.amount_refunded)
    || charge.amount_refunded < 0 || charge.amount_refunded > charge.amount
    || charge.refunded !== (charge.amount_refunded === charge.amount)
    || compareExactAmounts({ currency: 'AUD', exponent: 2, units: String(charge.amount) }, aud(totalUnits)) !== 0) return { kind: 'mismatch' }
  return { kind: 'available', value: charge }
}

async function readChargeRefunds(context: ProcessorContext, charge: Stripe.Charge, paymentId: string): Promise<
  Unavailable | { kind: 'available'; rows: readonly StripeFundingRefundEvidence[] }
> {
  const rows: StripeFundingRefundEvidence[] = []
  const ids = new Set<string>()
  let cursor: string | undefined
  do {
    if (!readBudgetAvailable(context.deadlineAt)) return unavailable('treasury_funding_read_budget_exhausted')
    const page = await context.client.refunds.list({ charge: charge.id, limit: REFUND_PAGE_SIZE,
      ...(cursor === undefined ? {} : { starting_after: cursor }) })
    if (page.object !== 'list' || !Array.isArray(page.data) || page.data.length > REFUND_PAGE_SIZE
      || typeof page.has_more !== 'boolean') return unavailable('treasury_funding_refund_response_invalid')
    if (rows.length + page.data.length > REFUND_HISTORY_LIMIT) return unavailable('treasury_funding_refund_history_incomplete')
    for (const raw of page.data) {
      const refund = mapStripeFundingRefundEvidence({ refund: raw, config: context.config })
      if (isMoneyRefusal(refund) || refund.chargeId !== charge.id || refund.paymentId !== paymentId
        || refund.amount.currency !== 'AUD' || ids.has(refund.refundId)) return unavailable('treasury_funding_refund_evidence_unavailable')
      ids.add(refund.refundId)
      rows.push(refund)
    }
    if (!page.has_more) return { kind: 'available', rows }
    const next = page.data.at(-1)?.id
    if (!identifier(next) || next === cursor || page.data.length === 0) return unavailable('treasury_funding_refund_cursor_invalid')
    cursor = next
  } while (cursor !== undefined)
  return unavailable('treasury_funding_refund_cursor_invalid')
}

function readBudgetAvailable(deadlineAt: number): boolean {
  // Reserve a whole configured SDK timeout before starting another request.
  return Date.now() + TREASURY_FUNDING_REQUEST_TIMEOUT_MS <= deadlineAt
}

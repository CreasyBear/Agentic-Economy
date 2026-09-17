import { v, type Infer } from 'convex/values'
import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'
import { exactAmountSchema, type ExactAmount } from '@/modules/money/public'

/** Buyer-facing Seller identity for principal-reseller Calls. */
export const AGENTIC_ECONOMY_SELLER_REF = 'ae.seller:agentic_economy_australia_pty_ltd'

export const purchaseTerminalStateValues = [
  'completed',
  'refunded',
  'released',
  'disputed',
] as const
export type PurchaseTerminalState = (typeof purchaseTerminalStateValues)[number]

export const purchaseResolutionDeliveryStateValues = [
  'delivered',
  'not_delivered',
  'unknown',
] as const
export type PurchaseResolutionDeliveryState = (typeof purchaseResolutionDeliveryStateValues)[number]

export const purchaseResolutionPaymentStateValues = [
  'settled',
  'released',
  'unknown',
  'not_applicable',
] as const
export type PurchaseResolutionPaymentState = (typeof purchaseResolutionPaymentStateValues)[number]

const purchaseResolutionExactAmountValue = v.object({
  currency: v.string(),
  units: v.string(),
  exponent: v.number(),
})

export const purchaseResolutionRecordValidator = v.object({
  resolutionRef: v.string(),
  recordDigest: v.string(),
  callRef: v.string(),
  quoteRef: v.string(),
  accountRef: v.string(),
  customerRef: v.string(),
  agentPrincipalRef: v.string(),
  sellerRef: v.string(),
  providerRef: v.string(),
  paymentRecipientRef: v.string(),
  terminalState: v.union(
    v.literal('completed'),
    v.literal('refunded'),
    v.literal('released'),
    v.literal('disputed'),
  ),
  deliveryState: v.union(
    v.literal('delivered'),
    v.literal('not_delivered'),
    v.literal('unknown'),
  ),
  paymentState: v.union(
    v.literal('settled'),
    v.literal('released'),
    v.literal('unknown'),
    v.literal('not_applicable'),
  ),
  considerationAmount: purchaseResolutionExactAmountValue,
  considerationNetUnits: v.string(),
  considerationGstUnits: v.string(),
  providerObligationAmount: purchaseResolutionExactAmountValue,
  resolvedAt: v.number(),
})

export type PurchaseResolutionRecord = Infer<typeof purchaseResolutionRecordValidator>

export const purchaseResolutionRecordSchema = z.strictObject({
  resolutionRef: z.string().min(1),
  recordDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  callRef: z.string().min(1),
  quoteRef: z.string().min(1),
  accountRef: z.string().min(1),
  customerRef: z.string().min(1),
  agentPrincipalRef: z.string().min(1),
  sellerRef: z.string().min(1),
  providerRef: z.string().min(1),
  paymentRecipientRef: z.string().min(1),
  terminalState: z.enum(purchaseTerminalStateValues),
  deliveryState: z.enum(purchaseResolutionDeliveryStateValues),
  paymentState: z.enum(purchaseResolutionPaymentStateValues),
  considerationAmount: exactAmountSchema,
  considerationNetUnits: z.string().regex(/^\d+$/),
  considerationGstUnits: z.string().regex(/^\d+$/),
  providerObligationAmount: exactAmountSchema,
  resolvedAt: z.number().int().nonnegative(),
})

export type PurchaseResolutionBuildInput = Readonly<{
  callRef: string
  quoteRef: string
  accountRef: string
  customerRef: string
  agentPrincipalRef: string
  sellerRef: string
  providerRef: string
  paymentRecipientRef: string
  callState: 'completed' | 'refused' | 'reconciliation_required'
  deliveryState: PurchaseResolutionDeliveryState
  paymentState: PurchaseResolutionPaymentState
  providerObligationState?: 'accrued' | 'held' | 'payable' | 'settled' | 'reversed' | 'disputed'
  receiptState?: 'settled' | 'refunded' | 'reconciliation_required'
  receiptRefundState?: 'released' | 'not_applicable' | 'unknown'
  considerationAmount: ExactAmount
  considerationNetUnits: string
  considerationGstUnits: string
  providerObligationAmount: ExactAmount
  resolvedAt: number
}>

export type PurchaseResolutionBuildResult =
  | Readonly<{ kind: 'admitted'; record: PurchaseResolutionRecord }>
  | Readonly<{ kind: 'open'; reason: 'delivery_unknown' | 'payment_unknown' | 'not_terminal' }>
  | Readonly<{
      kind: 'refused'
      reason:
        | 'consideration_mismatch'
        | 'customer_is_agent'
        | 'party_role_collision'
        | 'invalid_terminal_state'
    }>

export function buildPurchaseResolutionRecord(
  input: PurchaseResolutionBuildInput,
): PurchaseResolutionBuildResult {
  if (input.deliveryState === 'unknown') return { kind: 'open', reason: 'delivery_unknown' }
  if (input.paymentState === 'unknown') return { kind: 'open', reason: 'payment_unknown' }

  const terminalState = derivePurchaseTerminalState(input)
  if (terminalState === null) return { kind: 'open', reason: 'not_terminal' }
  if (!purchaseTerminalStateValues.includes(terminalState)) {
    return { kind: 'refused', reason: 'invalid_terminal_state' }
  }

  if (input.accountRef === input.agentPrincipalRef || input.customerRef === input.agentPrincipalRef) {
    return { kind: 'refused', reason: 'customer_is_agent' }
  }

  const parties = [input.sellerRef, input.providerRef, input.paymentRecipientRef]
  if (new Set(parties).size !== parties.length) {
    return { kind: 'refused', reason: 'party_role_collision' }
  }

  if (input.considerationAmount.currency !== 'AUD' || input.considerationAmount.exponent !== 6) {
    return { kind: 'refused', reason: 'consideration_mismatch' }
  }
  if (input.providerObligationAmount.currency !== 'USDC' || input.providerObligationAmount.exponent !== 6) {
    return { kind: 'refused', reason: 'consideration_mismatch' }
  }

  const totalConsideration = BigInt(input.considerationAmount.units)
  const net = BigInt(input.considerationNetUnits)
  const gst = BigInt(input.considerationGstUnits)
  if (totalConsideration !== net + gst) {
    return { kind: 'refused', reason: 'consideration_mismatch' }
  }

  const recordDigest = canonicalDigest(purchaseResolutionDigestMaterial(input, terminalState))
  const resolutionRef = `purchase-resolution:${recordDigest.slice('sha256:'.length)}`
  const record: PurchaseResolutionRecord = {
    resolutionRef,
    recordDigest,
    callRef: input.callRef,
    quoteRef: input.quoteRef,
    accountRef: input.accountRef,
    customerRef: input.customerRef,
    agentPrincipalRef: input.agentPrincipalRef,
    sellerRef: input.sellerRef,
    providerRef: input.providerRef,
    paymentRecipientRef: input.paymentRecipientRef,
    terminalState,
    deliveryState: input.deliveryState,
    paymentState: input.paymentState,
    considerationAmount: input.considerationAmount,
    considerationNetUnits: input.considerationNetUnits,
    considerationGstUnits: input.considerationGstUnits,
    providerObligationAmount: input.providerObligationAmount,
    resolvedAt: input.resolvedAt,
  }
  const parsed = purchaseResolutionRecordSchema.safeParse(record)
  if (!parsed.success) return { kind: 'refused', reason: 'invalid_terminal_state' }
  return { kind: 'admitted', record }
}

function derivePurchaseTerminalState(
  input: PurchaseResolutionBuildInput,
): PurchaseTerminalState | null {
  if (input.providerObligationState === 'disputed') return 'disputed'
  if (input.paymentState === 'released' || input.receiptRefundState === 'released') return 'released'
  if (input.receiptState === 'refunded' || input.providerObligationState === 'reversed') {
    return 'refunded'
  }
  if (
    input.callState === 'completed'
    && input.deliveryState === 'delivered'
    && (input.paymentState === 'settled' || input.paymentState === 'not_applicable')
  ) {
    return 'completed'
  }
  if (
    input.callState === 'refused'
    && input.deliveryState === 'not_delivered'
    && input.paymentState === 'not_applicable'
  ) {
    return 'released'
  }
  return null
}

function purchaseResolutionDigestMaterial(
  input: PurchaseResolutionBuildInput,
  terminalState: PurchaseTerminalState,
): StableHashValue {
  return {
    callRef: input.callRef,
    quoteRef: input.quoteRef,
    accountRef: input.accountRef,
    customerRef: input.customerRef,
    agentPrincipalRef: input.agentPrincipalRef,
    sellerRef: input.sellerRef,
    providerRef: input.providerRef,
    paymentRecipientRef: input.paymentRecipientRef,
    terminalState,
    deliveryState: input.deliveryState,
    paymentState: input.paymentState,
    considerationAmount: input.considerationAmount,
    considerationNetUnits: input.considerationNetUnits,
    considerationGstUnits: input.considerationGstUnits,
    providerObligationAmount: input.providerObligationAmount,
    resolvedAt: input.resolvedAt,
  }
}

export function projectDeliveryStateForPurchaseResolution(
  callState: 'completed' | 'refused' | 'reconciliation_required',
): PurchaseResolutionDeliveryState {
  if (callState === 'completed') return 'delivered'
  return callState === 'reconciliation_required' ? 'unknown' : 'not_delivered'
}

export function projectPaymentStateForPurchaseResolution(
  receiptState?: 'settled' | 'refunded' | 'reconciliation_required',
): PurchaseResolutionPaymentState {
  if (receiptState === 'settled') return 'settled'
  if (receiptState === 'refunded') return 'released'
  if (receiptState === 'reconciliation_required') return 'unknown'
  return 'not_applicable'
}

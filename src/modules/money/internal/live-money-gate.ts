import { z } from 'zod'

import { canonicalDigest } from '@/modules/common/canonical-digest'

import { currencySchema, moneyRefSchema } from './pricing-contract'
import type { MoneyRefusal } from '../public'

export const LIVE_MONEY_COUNSEL_DECISIONS = [
  'transaction_and_agency_role',
  'gst_registration_supply_allocation_invoicing',
  'serr_classification_reporting',
  'refund_dispute_chargeback_responsibility',
  'privacy_policy_notices_rights_retention',
  'stripe_connect_flow_payout_reconciliation',
] as const
export const liveMoneyCounselDecisionSchema = z.enum(LIVE_MONEY_COUNSEL_DECISIONS)
export type LiveMoneyCounselDecision = z.infer<typeof liveMoneyCounselDecisionSchema>

const counselSignoffSchema = z.strictObject({
  decision: liveMoneyCounselDecisionSchema,
  status: z.enum(['open', 'accepted']),
  artifactRef: moneyRefSchema.optional(),
}).superRefine((row, ctx) => {
  if (row.status === 'accepted' && row.artifactRef === undefined) ctx.addIssue({ code: 'custom', message: 'accepted_counsel_requires_artifact' })
})
export type LiveMoneyCounselSignoff = z.infer<typeof counselSignoffSchema>

const stripeReadinessSchema = z.strictObject({
  mode: z.enum(['test', 'live']),
  readiness: z.enum(['unavailable', 'ready']),
})

export const liveMoneyGatePolicySchema = z.strictObject({
  policyId: moneyRefSchema,
  revision: moneyRefSchema,
  counselPackRef: moneyRefSchema,
  counselSignoffs: z.array(counselSignoffSchema).min(1),
  stripe: stripeReadinessSchema,
})
export type LiveMoneyGatePolicy = z.infer<typeof liveMoneyGatePolicySchema>

/** Source-owned first-dollar policy. Do not replace this with an environment flag. */
export const LIVE_MONEY_GATE_POLICY = liveMoneyGatePolicySchema.parse({
  policyId: 'first-dollar-compliance-au',
  revision: '2026-08-01',
  counselPackRef: '.planning/research/2026-08-01-compliance-first-dollar-counsel-pack.md',
  counselSignoffs: [
    { decision: 'transaction_and_agency_role', status: 'open' },
    { decision: 'gst_registration_supply_allocation_invoicing', status: 'open' },
    { decision: 'serr_classification_reporting', status: 'open' },
    { decision: 'refund_dispute_chargeback_responsibility', status: 'open' },
    { decision: 'privacy_policy_notices_rights_retention', status: 'open' },
    { decision: 'stripe_connect_flow_payout_reconciliation', status: 'open' },
  ],
  stripe: { mode: 'test', readiness: 'unavailable' },
})

export type LiveMoneyGateResult =
  | Readonly<{ kind: 'accepted'; policyId: string; policyDigest: string }>
  | Readonly<{ kind: 'refused'; code: MoneyRefusal['code']; retryable: false; openDecisions: readonly LiveMoneyCounselDecision[] }>

export function evaluateLiveMoneyGate(policy: LiveMoneyGatePolicy = LIVE_MONEY_GATE_POLICY): LiveMoneyGateResult {
  const parsed = liveMoneyGatePolicySchema.safeParse(policy)
  if (!parsed.success) {
    return { kind: 'refused', code: 'live_money_gate_open', retryable: false, openDecisions: [] }
  }
  const signoffs = parsed.data.counselSignoffs
  const uniqueDecisions = new Set(signoffs.map((row) => row.decision))
  const incompleteRecord = signoffs.length !== LIVE_MONEY_COUNSEL_DECISIONS.length
    || uniqueDecisions.size !== LIVE_MONEY_COUNSEL_DECISIONS.length
  const openDecisions = LIVE_MONEY_COUNSEL_DECISIONS.filter((decision) => signoffs.find((row) => row.decision === decision)?.status !== 'accepted')
  if (incompleteRecord || openDecisions.length > 0) {
    return { kind: 'refused', code: 'live_money_gate_open', retryable: false, openDecisions }
  }
  if (parsed.data.stripe.mode !== 'live' || parsed.data.stripe.readiness !== 'ready') {
    return { kind: 'refused', code: 'stripe_setup_required', retryable: false, openDecisions: [] }
  }
  return { kind: 'accepted', policyId: parsed.data.policyId, policyDigest: canonicalDigest(parsed.data) }
}

export const paymentBindingSchema = z.strictObject({
  amountMinor: z.number().int().nonnegative().safe(),
  currency: currencySchema,
  providerRef: moneyRefSchema,
  actionVersion: moneyRefSchema,
  expiresAt: z.number().finite(),
  idempotencyKey: moneyRefSchema,
})
export type PaymentBinding = z.infer<typeof paymentBindingSchema>

export type PaymentBindingValidation =
  | Readonly<{ kind: 'accepted'; binding: PaymentBinding }>
  | MoneyRefusal

export function validatePaymentBinding(input: Readonly<{
  approved: unknown
  requested: unknown
  now: number
}>): PaymentBindingValidation {
  const approved = paymentBindingSchema.safeParse(input.approved)
  const requested = paymentBindingSchema.safeParse(input.requested)
  if (!approved.success || !requested.success || !Number.isFinite(input.now)) {
    return { kind: 'refused', code: 'payment_binding_invalid', retryable: false }
  }
  const approvedBinding = approved.data
  const requestedBinding = requested.data
  if (approvedBinding.amountMinor !== requestedBinding.amountMinor
    || approvedBinding.currency !== requestedBinding.currency
    || approvedBinding.providerRef !== requestedBinding.providerRef
    || approvedBinding.actionVersion !== requestedBinding.actionVersion
    || approvedBinding.expiresAt !== requestedBinding.expiresAt
    || approvedBinding.idempotencyKey !== requestedBinding.idempotencyKey) {
    return { kind: 'refused', code: 'fresh_approval_required', retryable: false }
  }
  if (approvedBinding.expiresAt <= input.now) {
    return { kind: 'refused', code: 'payment_approval_expired', retryable: false }
  }
  return { kind: 'accepted', binding: approvedBinding }
}

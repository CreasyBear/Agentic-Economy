import { z } from 'zod'
import { v, type Infer } from 'convex/values'
import { compareExactAmounts, exactAmountSchema, type ExactAmount } from '@/modules/money/public'
import { PACKAGE4_FORMANCE_REQUIREMENTS } from '@/modules/money/internal/commercial-policy'
import { agentAccessBudgetPolicyValue } from './internal/convex-schema'

const reference = z.string().trim().min(1).max(300)
function atMost(left: ExactAmount, right: ExactAmount): boolean {
  if (left.units.length > 16 || right.units.length > 16) return false
  const order = compareExactAmounts(left, right)
  return order === -1 || order === 0
}
const aud = exactAmountSchema.extend({ currency: z.literal('AUD'), exponent: z.literal(6) })
  .refine(amount => amount.units.length <= 16
    && atMost(amount, { currency: 'AUD', exponent: 6,
      units: PACKAGE4_FORMANCE_REQUIREMENTS.maximumSdkIntegerUnits }), 'unsupported_spending_limit')

/** Caller edits monetary limits only. Authority identities and policy generations
 * are derived by the owner transaction; credential/rate/scope are not editable. */
export const agentSpendingLimitsUpdateSchema = z.strictObject({
  principalRef: reference,
  expectedGeneration: z.number().int().safe().positive(),
  idempotencyKey: reference,
  maximumSpendPerCall: aud,
  maximumDailySpend: aud,
  maximumMonthlySpend: aud,
}).refine(input => atMost(input.maximumSpendPerCall, input.maximumDailySpend)
  && atMost(input.maximumDailySpend, input.maximumMonthlySpend), 'spending_limits_out_of_order')
export type AgentSpendingLimitsUpdate = z.infer<typeof agentSpendingLimitsUpdateSchema>

const amounts = agentAccessBudgetPolicyValue.pick('maximumSpendPerCall', 'maximumDailySpend', 'maximumMonthlySpend').fields
export const agentSpendingLimitsUpdateArgs = {
  principalRef: v.string(), expectedGeneration: v.number(), idempotencyKey: v.string(),
  ...amounts, correlationRef: v.string(),
}
export const agentSpendingLimitsResultValue = v.union(
  v.object({ kind: v.union(v.literal('completed'), v.literal('replayed')),
    principalRef: v.string(), grantRef: v.string(), generation: v.number(),
    spendingPolicyDigest: v.string(), correlationRef: v.string() }),
  v.object({ kind: v.literal('conflict'), code: v.union(
    v.literal('account_ownership_required'), v.literal('agent_not_found'), v.literal('policy_invalid'),
    v.literal('revision_conflict'), v.literal('idempotency_conflict'),
    v.literal('credential_replacement_pending'), v.literal('authority_unavailable'),
  ), correlationRef: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.union(v.literal('authentication_required'), v.literal('source_unavailable')),
    correlationRef: v.string() }),
)
export type AgentSpendingLimitsResult = Infer<typeof agentSpendingLimitsResultValue>
export const agentSpendingLimitsReadResultValue = v.union(
  v.object({ kind: v.literal('current'), principalRef: v.string(), grantRef: v.string(), generation: v.number(),
    spendingPolicyDigest: v.string(), ...amounts }),
  v.object({ kind: v.literal('refused'), code: v.union(v.literal('authentication_required'),
    v.literal('account_ownership_required'), v.literal('agent_not_found'), v.literal('authority_unavailable'),
    v.literal('source_unavailable')) }),
)
export type AgentSpendingLimitsReadResult = Infer<typeof agentSpendingLimitsReadResultValue>

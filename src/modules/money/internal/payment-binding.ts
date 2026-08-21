import { z } from 'zod'

import { exactAmountSchema, compareExactAmounts } from './exact-amount'
import { moneyRefSchema } from './pricing-contract'
import type { MoneyRefusal } from '../public'

export const paymentBindingSchema = z.strictObject({
  amount: exactAmountSchema,
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
  if (compareExactAmounts(approvedBinding.amount, requestedBinding.amount) !== 0
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

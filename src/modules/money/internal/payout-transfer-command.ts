import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import type { ExactAmount } from './exact-amount'
import { STRIPE_TRANSFER_RECOVERY_WINDOW_MS } from './payout-policy'

export type PayoutTransferCommandInput = Readonly<{
  businessId: string
  payoutRef: string
  amount: ExactAmount
  providerAccountRef: string
  destinationAccountId: string
  idempotencyKey: string
  observedAt: number
}>

export type PayoutTransferCommand = Readonly<{
  businessId: string
  amount: ExactAmount
  providerAccountRef: string
  destinationAccountId: string
  payoutRef: string
  commandId: string
  inputDigest: string
  requestDigest: string
  idempotencyKey: string
  providerRecoveryDeadlineAt: number
  observedAt: number
}>

export function payoutTransferCommand(
  input: PayoutTransferCommandInput,
): PayoutTransferCommand | undefined {
  if (
    input.businessId.length === 0 ||
    input.payoutRef.length === 0 ||
    input.providerAccountRef.length === 0 ||
    input.destinationAccountId.length === 0 ||
    input.idempotencyKey.length === 0 ||
    input.amount.units === '0'
  ) {
    return undefined
  }
  const commandId = canonicalDigest({
    format: 'money-payout-command:v1',
    businessId: input.businessId,
    payoutRef: input.payoutRef,
    idempotencyKey: input.idempotencyKey,
  } as StableHashValue)
  const inputDigest = canonicalDigest({
    format: 'money-payout-input:v1',
    businessId: input.businessId,
    payoutRef: input.payoutRef,
    amount: input.amount,
    idempotencyKey: input.idempotencyKey,
  } as StableHashValue)
  const requestDigest = canonicalDigest({
    format: 'money-transfer-request:v1',
    payoutRef: input.payoutRef,
    commandId,
    providerAccountRef: input.providerAccountRef,
    amount: input.amount,
    inputDigest,
    idempotencyKey: input.idempotencyKey,
  } as StableHashValue)
  return {
    businessId: input.businessId,
    amount: input.amount,
    providerAccountRef: input.providerAccountRef,
    destinationAccountId: input.destinationAccountId,
    payoutRef: input.payoutRef,
    commandId,
    inputDigest,
    requestDigest,
    idempotencyKey: input.idempotencyKey,
    providerRecoveryDeadlineAt:
      input.observedAt + STRIPE_TRANSFER_RECOVERY_WINDOW_MS,
    observedAt: input.observedAt,
  }
}

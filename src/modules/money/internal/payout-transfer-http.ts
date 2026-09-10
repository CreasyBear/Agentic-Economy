import { createServerFn } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { z } from 'zod'

import {
  exactAmountSchema,
  type ExactAmount,
  type MoneyRefusal,
} from '../public'
import { ownerBusiness, type OwnerMoneyServerRuntime } from './payout-http-runtime'

type OwnerPayoutTransferView = Readonly<{
  businessId: string
  payoutRef: string
  payoutCommandId: string
  state: string
  idempotencyKey: string
  inputDigest: string
  amount: ExactAmount
  destinationAccountId: string
  stripeTransferId?: string
  transferStatus?: 'pending' | 'succeeded' | 'failed' | 'outcome_unknown'
  requestDigest?: string
  evidenceDigest?: string
  reversalEvidenceDigest?: string
  providerRecoveryDeadlineAt?: number
  recoveryState?: 'provider_id' | 'idempotency_key' | 'admin_intervention'
  providerHeldBefore?: ExactAmount
  providerHeldAfter?: ExactAmount
  providerPaidBefore?: ExactAmount
  providerPaidAfter?: ExactAmount
}>

export type OwnerPayoutTransferResult =
  | Readonly<{ kind: 'ok'; transfer: OwnerPayoutTransferView }>
  | MoneyRefusal

export type OwnerPayoutTransferInput = Readonly<{
  businessId: string
  currency: string
  payoutRef: string
  amount: ExactAmount
  expectedPayoutRevision?: number
  expectedAccountVersion?: number
  idempotencyKey: string
}>

export type OwnerPayoutTransferReadInput = Readonly<{
  businessId: string
  currency: string
  payoutRef: string
  idempotencyKey: string
}>

const ownerPayoutTransferInputSchema = z.strictObject({
  businessId: z.string().trim().min(1).max(500),
  currency: z.string().regex(/^[A-Z][A-Z0-9]{2,19}$/u),
  payoutRef: z.string().trim().min(1).max(500),
  amount: exactAmountSchema,
  expectedPayoutRevision: z.number().int().positive(),
  expectedAccountVersion: z.number().int().nonnegative(),
  idempotencyKey: z.string().trim().min(8).max(200),
})

const ownerPayoutTransferReadInputSchema = z.strictObject({
  businessId: z.string().trim().min(1).max(500),
  currency: z.string().regex(/^[A-Z][A-Z0-9]{2,19}$/u),
  payoutRef: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(8).max(200),
})

const unavailable: MoneyRefusal = Object.freeze({
  kind: 'refused',
  code: 'payout_not_ready',
  retryable: false,
})

export const beginOwnerPayoutTransferServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerPayoutTransferInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerPayoutTransferResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await runOwnerPayoutTransferThroughSource(data, context)
  })

export const recoverOwnerPayoutTransferServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerPayoutTransferInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerPayoutTransferResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await runOwnerPayoutTransferThroughSource(data, context, {
      recovery: true,
    })
  })

export const readOwnerPayoutTransferServer = createServerFn({ method: 'POST' })
  .validator((data) => ownerPayoutTransferReadInputSchema.parse(data))
  .handler(async ({ data, context }): Promise<OwnerPayoutTransferResult> => {
    setResponseHeader('cache-control', 'no-store')
    return await readOwnerPayoutTransferThroughSource(data, context)
  })

/**
 * Provider payouts stay disabled until PR7 binds an eligible Provider
 * obligation to a Formance transaction. No Stripe transfer or retired Convex
 * financial write is reachable through this temporary boundary.
 */
export async function runOwnerPayoutTransferThroughSource(
  input: OwnerPayoutTransferInput,
  context?: unknown,
  _options: Readonly<{ recovery?: boolean; proof?: unknown }> = {},
  _runtime: OwnerMoneyServerRuntime = {},
): Promise<OwnerPayoutTransferResult> {
  const owner = await ownerBusiness(input.businessId, context)
  return owner.kind === 'refused' ? owner : unavailable
}

export async function readOwnerPayoutTransferThroughSource(
  input: OwnerPayoutTransferReadInput,
  context?: unknown,
  _runtime: OwnerMoneyServerRuntime = {},
): Promise<OwnerPayoutTransferResult> {
  const owner = await ownerBusiness(input.businessId, context)
  return owner.kind === 'refused' ? owner : unavailable
}

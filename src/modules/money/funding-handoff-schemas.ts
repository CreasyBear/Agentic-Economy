import { z } from 'zod'

import {
  idempotencyKeySchema,
  type ActionAgentAccessPrincipal,
} from '@/modules/common/action'

import { exactAmountSchema } from './public'

export const FUNDING_HANDOFF_CONFIG_ACTION_ID = 'funding.handoff.config' as const
export const FUNDING_HANDOFF_CREATE_ACTION_ID = 'funding.handoff.create' as const
export const FUNDING_HANDOFF_STATUS_ACTION_ID = 'funding.handoff.status' as const
export const FUNDING_HANDOFF_CONFIG_PATH = '/api/v1/account/funding/config' as const
export const FUNDING_HANDOFF_CREATE_PATH = '/api/v1/account/funding-sessions' as const
export const FUNDING_HANDOFF_STATUS_PATH = '/api/v1/account/funding-sessions/{fundingSessionId}' as const

const quoteSchema = z.strictObject({
  principalAmount: exactAmountSchema,
  serviceFeeAmount: exactAmountSchema,
  taxAmount: exactAmountSchema,
  totalPaymentAmount: exactAmountSchema,
})

export const fundingHandoffConfigInputSchema = z.strictObject({})
export const fundingHandoffConfigResultSchema = z.strictObject({
  kind: z.literal('funding_config'),
  success: z.literal(true),
  currency: z.literal('AUD'),
  minimum: exactAmountSchema,
  maximum: exactAmountSchema,
  increment: exactAmountSchema,
  checkout: z.literal('stripe_hosted'),
  payerGainsAuthority: z.literal(false),
  reusablePaymentAuthority: z.literal(false),
})

export const createFundingHandoffInputSchema = z.strictObject({
  principalAmount: exactAmountSchema.refine(
    (value) => value.currency === 'AUD' && value.exponent === 6 && /^[1-9]\d*$/u.test(value.units),
    'principalAmount must be a positive exact AUD amount with exponent 6',
  ),
  idempotencyKey: idempotencyKeySchema,
})

export const fundingCreateReplayNextSchema = z.strictObject({
  action: z.literal(FUNDING_HANDOFF_CREATE_ACTION_ID),
  args: createFundingHandoffInputSchema,
  authority: z.literal('agent_key'),
})

export const fundingStatusNextSchema = z.strictObject({
  action: z.literal(FUNDING_HANDOFF_STATUS_ACTION_ID),
  args: z.strictObject({ fundingSessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/u) }),
  authority: z.literal('same_principal'),
  retryAfterMs: z.literal(5000),
})
export const fundingCreateNextSchema = z.strictObject({
  action: z.literal(FUNDING_HANDOFF_CREATE_ACTION_ID),
  args: z.strictObject({ principalAmount: exactAmountSchema }),
  authority: z.literal('agent_key'),
  requiredInput: z.tuple([z.literal('idempotencyKey')]).describe('A new funding intent requires a new key; never reuse the expired or failed session key.'),
})
const payerHandoffSchema = z.strictObject({
  actor: z.literal('payer'),
  reason: z.literal('funding_payment_required'),
  url: z.string().url(),
})

export const createFundingHandoffResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('funding_session'),
    success: z.literal(true),
    fundingSessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/u),
    checkoutUrl: z.string().url(),
    statusUrl: z.string().url(),
    expiresAt: z.number().int().positive(),
    quote: quoteSchema,
    humanHandoff: payerHandoffSchema,
    next: fundingStatusNextSchema,
    idempotentReplay: z.boolean(),
  }),
  z.strictObject({
    kind: z.literal('refused'),
    code: z.string().min(1),
    retryable: z.boolean(),
    correlationRef: z.string().min(1).optional(),
  }),
])

const statusBase = {
  success: z.literal(true),
  fundingSessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/u),
  quote: quoteSchema,
} as const

export const fundingHandoffStatusInputSchema = z.strictObject({
  fundingSessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/u),
})

export const fundingHandoffStatusResultSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('awaiting_payment'), ...statusBase,
    state: z.literal('awaiting_payment'), paymentStatus: z.literal('unpaid'),
    humanHandoff: payerHandoffSchema,
    next: fundingStatusNextSchema,
  }),
  z.strictObject({
    kind: z.literal('processing'), ...statusBase,
    state: z.literal('processing'), paymentStatus: z.enum(['unpaid', 'paid']),
    next: fundingStatusNextSchema,
  }),
  z.strictObject({
    kind: z.literal('ready'), ...statusBase,
    state: z.literal('ready'), paymentStatus: z.literal('paid'),
    balance: z.strictObject({ usableAmount: exactAmountSchema }),
  }),
  z.strictObject({
    kind: z.literal('expired'), ...statusBase,
    state: z.literal('expired'), paymentStatus: z.literal('unpaid'),
    next: fundingCreateNextSchema,
  }),
  z.strictObject({
    kind: z.literal('failed'), ...statusBase,
    state: z.literal('failed'), paymentStatus: z.literal('failed'),
    next: fundingCreateNextSchema,
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({
    kind: z.literal('error'), code: z.string().min(1), retryable: z.boolean(),
    correlationRef: z.string().min(1), next: fundingStatusNextSchema.optional(),
  }),
])

export type FundingHandoffConfigResult = z.infer<typeof fundingHandoffConfigResultSchema>
export type CreateFundingHandoffInput = z.infer<typeof createFundingHandoffInputSchema>
export type CreateFundingHandoffResult = z.infer<typeof createFundingHandoffResultSchema>
export type FundingHandoffStatusInput = z.infer<typeof fundingHandoffStatusInputSchema>
export type FundingHandoffStatusResult = z.infer<typeof fundingHandoffStatusResultSchema>

export type FundingHandoffRequest<Input> = Readonly<{
  input: Input
  principal: ActionAgentAccessPrincipal
  correlationId: string
}>

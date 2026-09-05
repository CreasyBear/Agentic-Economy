import { z } from 'zod'

import {
  defineAction,
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
  idempotencyKey: z.string().trim().min(1).max(255),
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
    humanHandoff: z.strictObject({ message: z.string().min(1), instruction: z.string().min(1) }),
    pollAfterMs: z.literal(5000),
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
    nextAction: z.strictObject({ kind: z.literal('share_checkout'), checkoutUrl: z.string().url() }),
    pollAfterMs: z.literal(5000),
  }),
  z.strictObject({
    kind: z.literal('processing'), ...statusBase,
    state: z.literal('processing'), paymentStatus: z.enum(['unpaid', 'paid']),
    nextAction: z.strictObject({ kind: z.literal('poll') }), pollAfterMs: z.literal(5000),
  }),
  z.strictObject({
    kind: z.literal('ready'), ...statusBase,
    state: z.literal('ready'), paymentStatus: z.literal('paid'),
    balance: z.strictObject({ usableAmount: exactAmountSchema }),
    nextAction: z.strictObject({ kind: z.literal('continue') }),
  }),
  z.strictObject({
    kind: z.literal('expired'), ...statusBase,
    state: z.literal('expired'), paymentStatus: z.literal('unpaid'),
    nextAction: z.strictObject({ kind: z.literal('create_new') }),
  }),
  z.strictObject({
    kind: z.literal('failed'), ...statusBase,
    state: z.literal('failed'), paymentStatus: z.literal('failed'),
    nextAction: z.strictObject({ kind: z.literal('create_new') }),
  }),
  z.strictObject({ kind: z.literal('not_found') }),
  z.strictObject({
    kind: z.literal('error'), code: z.string().min(1), retryable: z.boolean(),
    correlationRef: z.string().min(1), nextAction: z.strictObject({ kind: z.literal('poll') }),
  }),
])

export type FundingHandoffConfigResult = z.infer<typeof fundingHandoffConfigResultSchema>
export type CreateFundingHandoffInput = z.infer<typeof createFundingHandoffInputSchema>
export type CreateFundingHandoffResult = z.infer<typeof createFundingHandoffResultSchema>
export type FundingHandoffStatusInput = z.infer<typeof fundingHandoffStatusInputSchema>
export type FundingHandoffStatusResult = z.infer<typeof fundingHandoffStatusResultSchema>

type FundingHandoffRequest<Input> = Readonly<{
  input: Input
  principal: ActionAgentAccessPrincipal
  correlationId: string
}>

export type FundingHandoffService = Readonly<{
  config: (request: FundingHandoffRequest<Record<string, never>>) => Promise<FundingHandoffConfigResult>
  create: (request: FundingHandoffRequest<CreateFundingHandoffInput>) => Promise<CreateFundingHandoffResult>
  status: (request: FundingHandoffRequest<FundingHandoffStatusInput>) => Promise<FundingHandoffStatusResult>
}>

function service(context: import('@/modules/common/action').ActionContext): FundingHandoffService {
  if (context.fundingHandoffService === undefined) throw new Error('funding_handoff_service_unavailable')
  return context.fundingHandoffService
}

export const fundingHandoffConfigAction = defineAction<Record<string, never>, FundingHandoffConfigResult>({
  id: FUNDING_HANDOFF_CONFIG_ACTION_ID,
  name: 'Read agent funding configuration',
  summary: 'Read exact AUD funding limits before creating a Stripe-hosted payer handoff.',
  boundaries: ['Requires a connected buyer agent.', 'Creates no payment and grants no payer authority.'],
  schema: fundingHandoffConfigInputSchema,
  outputSchema: fundingHandoffConfigResultSchema,
  parameters: [], readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: [], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp'],
  credentialAdmission: { scope: 'market_operations:invoke', authority: 'descriptor_classified' },
  invocationContract: {
    version: 'funding-handoff-config:v1', consequenceClass: 'read_only', materialInputPaths: [], authorityRequirement: 'principal',
    retryClass: 'replayable', expectedEvidence: ['funding_constraints'], safeContinuations: [FUNDING_HANDOFF_CREATE_ACTION_ID],
    invalidationConditions: ['commercial_policy_changed'],
  },
  run: async ({ context }) => service(context).config({
    input: {}, principal: context.agentAccessPrincipal!, correlationId: context.correlationId ?? crypto.randomUUID(),
  }),
})

export const fundingHandoffCreateAction = defineAction<CreateFundingHandoffInput, CreateFundingHandoffResult>({
  id: FUNDING_HANDOFF_CREATE_ACTION_ID,
  name: 'Create a human funding handoff',
  summary: 'Create one durable Stripe-hosted funding session and return the direct payer URL.',
  boundaries: [
    'The payer receives no AE identity, ownership, Mandate, credential, or reusable payment authority.',
    'Persist fundingSessionId and poll status after handing checkoutUrl to the payer.',
    'Creating a session does not retry the blocked Operation.',
  ],
  schema: createFundingHandoffInputSchema, outputSchema: createFundingHandoffResultSchema,
  parameters: [
    { name: 'principalAmount', type: 'object', description: 'Exact AUD Account credit to add.', required: true },
    { name: 'idempotencyKey', type: 'string', description: 'Stable key for this logical funding attempt.', required: true },
  ],
  readOnly: false,
  effect: { class: 'external_state_change', reversible: true, recipientKind: 'provider_system', dataClasses: ['payment_handoff'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp'],
  mcp: { idempotent: true, openWorld: true, destructive: false },
  credentialAdmission: { scope: 'market_operations:invoke', authority: 'descriptor_classified' },
  invocationContract: {
    version: 'funding-handoff-create:v1', consequenceClass: 'external_effect', materialInputPaths: ['principalAmount', 'idempotencyKey'],
    authorityRequirement: 'principal', retryClass: 'replayable', expectedEvidence: ['stripe_checkout_session'],
    safeContinuations: [FUNDING_HANDOFF_STATUS_ACTION_ID], invalidationConditions: ['amount_changed', 'idempotency_key_changed'],
  },
  run: async ({ data, context }) => service(context).create({
    input: data, principal: context.agentAccessPrincipal!, correlationId: context.correlationId ?? crypto.randomUUID(),
  }),
})

export const fundingHandoffStatusAction = defineAction<FundingHandoffStatusInput, FundingHandoffStatusResult>({
  id: FUNDING_HANDOFF_STATUS_ACTION_ID,
  name: 'Read a funding handoff',
  summary: 'Poll the same funding session until signed payment fulfilment makes Account credit usable.',
  boundaries: ['Only the requesting Agent Principal may read private status.', 'Polling and browser redirects never credit the Account.'],
  schema: fundingHandoffStatusInputSchema, outputSchema: fundingHandoffStatusResultSchema,
  parameters: [{ name: 'fundingSessionId', type: 'string', description: 'Stripe Checkout Session ID returned by create.', required: true }],
  readOnly: true,
  effect: { class: 'observation', reversible: true, recipientKind: 'none', dataClasses: ['payment_handoff'], spendExposure: 'none', approval: 'none' },
  surfaces: ['http', 'mcp'],
  credentialAdmission: { scope: 'market_operations:invoke', authority: 'descriptor_classified' },
  invocationContract: {
    version: 'funding-handoff-status:v1', consequenceClass: 'read_only', materialInputPaths: ['fundingSessionId'], authorityRequirement: 'principal',
    retryClass: 'replayable', expectedEvidence: ['funding_lifecycle', 'usable_balance'], safeContinuations: ['operation.invoke'],
    invalidationConditions: ['credential_revoked', 'session_expired'],
  },
  run: async ({ data, context }) => service(context).status({
    input: data, principal: context.agentAccessPrincipal!, correlationId: context.correlationId ?? crypto.randomUUID(),
  }),
})

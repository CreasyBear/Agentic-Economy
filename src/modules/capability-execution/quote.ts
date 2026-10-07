import { z } from 'zod'

import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import {
  commercialPolicyRefusalReasonSchema,
  exactAmountSchema,
  type CommercialPolicyRefusalReason,
} from '@/modules/money/public'
import { idempotencyKeySchema } from '@/modules/common/action'

export const TOOL_QUOTE_ACTION_ID = 'tool.quote' as const
export const TOOL_QUOTE_PATH = '/api/v1/tools/quote' as const
export const toolQuoteInputSchema = z.strictObject({
  toolRef: z.string().regex(/^operation:v1:[0-9a-f]{64}$/u),
  input: z.record(z.string(), jsonValueSchema),
})

export type ToolQuoteInput = Readonly<{
  toolRef: string
  input: Record<string, JsonValue>
}>

const callContinuationSchema = z.strictObject({
  action: z.literal('tool.call'),
  args: z.strictObject({
    quoteRef: z.string(),
    idempotencyKey: idempotencyKeySchema,
  }),
})

const toolQuoteRefusalCodeValues = [
  'tool_not_found',
  'tool_not_current',
  'tool_not_ready',
  'tool_unsupported',
  'input_invalid',
  'grant_not_found',
  'budget_exceeded',
  'insufficient_balance',
  'treasury_capacity_unavailable',
  'payments_paused',
  'payments_admins_only',
  'payments_not_ready',
  'pricing_setup_required',
  'commercial_policy_unavailable',
  'inspection_unavailable',
] as const
export const toolQuoteRefusalCodeSchema = z.enum(toolQuoteRefusalCodeValues)
export type ToolQuoteRefusalCode = (typeof toolQuoteRefusalCodeValues)[number]

const quoteContinuationSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('registry.tools.list'),
    args: z.strictObject({ limit: z.literal(10) }),
  }),
  z.strictObject({
    action: z.literal('registry.tools.search'),
    args: z.strictObject({ query: z.string().min(1), limit: z.literal(10) }),
  }),
  z.strictObject({
    action: z.literal('registry.tools.describe'),
    args: z.strictObject({ toolRef: z.string() }),
  }),
  z.strictObject({
    action: z.literal('tool.quote'),
    args: toolQuoteInputSchema,
    retryAfterMs: z.union([z.literal(5000), z.literal(30000)]),
  }),
  z.strictObject({
    action: z.literal('funding.handoff.create'),
    args: z.strictObject({
      principalAmount: exactAmountSchema,
      idempotencyKey: idempotencyKeySchema,
    }),
  }),
  z.strictObject({
    action: z.literal('funding.handoff.config'),
    args: z.strictObject({}),
  }),
])

const ownerHandoffSchema = z.strictObject({
  actor: z.enum(['account_owner', 'ae_support']),
  reason: z.string().min(1),
  destination: z.union([z.literal('/agent-access'), z.literal('/support')]).optional(),
})

export const toolQuoteResultSchema = z.union([
  z.strictObject({
    kind: z.literal('committed'),
    quoteRef: z.string(),
    toolRef: z.string(),
    toolVersion: z.number().int().positive(),
    expiresAt: z.number().int().nonnegative(),
    price: exactAmountSchema,
    sourceRequirement: exactAmountSchema.optional(),
    account: z.strictObject({
      accountRef: z.string(),
      available: exactAmountSchema,
    }),
    budget: z.strictObject({
      principalRef: z.string(),
      maximumPerCall: exactAmountSchema,
    }),
    policyRefs: z.array(z.string()),
    evidenceDigest: z.string(),
    parties: z.strictObject({
      seller: z.string(),
      provider: z.string(),
      paymentRecipient: z.string(),
    }).optional(),
    continuation: callContinuationSchema,
  }),
  z.strictObject({
    kind: z.literal('refused'),
    toolRef: z.string(),
    code: toolQuoteRefusalCodeSchema,
    // `commercial_policy_unavailable` forwards a `CommercialPolicyRefusalReason`
    // verbatim; other codes carry free-text operator detail.
    reason: z.string().min(1).optional(),
    retryable: z.boolean(),
    correlationRef: z.string().min(1),
    continuation: quoteContinuationSchema.optional(),
    ownerHandoff: ownerHandoffSchema.optional(),
  }),
])

export type ToolQuoteResult = z.infer<typeof toolQuoteResultSchema>

type RefusedToolQuote = Extract<ToolQuoteResult, { kind: 'refused' }>

export function projectToolQuoteRefusal(input: Readonly<{
  toolRef: string
  input: Record<string, JsonValue>
  code: ToolQuoteRefusalCode
  retryable: boolean
  correlationRef: string
  /** For `commercial_policy_unavailable` this must be a `CommercialPolicyRefusalReason`. */
  reason?: string
  capabilityId?: string
  funding?: Readonly<{ principalAmount: z.infer<typeof exactAmountSchema>; idempotencyKey: string }>
}>): RefusedToolQuote {
  const base = {
    kind: 'refused' as const,
    toolRef: input.toolRef,
    code: input.code,
    retryable: input.retryable,
    correlationRef: input.correlationRef,
    ...(input.reason === undefined ? {} : { reason: input.reason }),
  }
  const list = {
    action: 'registry.tools.list' as const,
    args: { limit: 10 as const },
  }
  const inspect = (retryAfterMs: 5000 | 30000) => ({
    action: 'tool.quote' as const,
    args: { toolRef: input.toolRef, input: input.input },
    retryAfterMs,
  })
  const requiredAction = (support: boolean) => ({
    actor: support ? 'ae_support' as const : 'account_owner' as const,
    reason: support
      ? 'AE could not establish the commercial policy required to call this Tool.'
      : 'The owner must review this agent’s access or budget before it can call this Tool.',
    destination: support ? '/support' as const : '/agent-access' as const,
  })
  const operatorAction = (reason: string, destination: '/agent-access' | '/support') => ({
    actor: destination === '/support' ? 'ae_support' as const : 'account_owner' as const,
    reason,
    destination,
  })
  switch (input.code) {
    case 'tool_not_ready':
      return { ...base, continuation: inspect(5000) }
    case 'inspection_unavailable':
      if (input.reason === 'spending_period_legacy_history_requires_support') {
        return { ...base, retryable: false, ownerHandoff: operatorAction('AE support must verify this Agent’s earlier spending before it can authorize new purchases.', '/support') }
      }
      return input.retryable
        ? { ...base, continuation: inspect(5000) }
        : { ...base, ownerHandoff: operatorAction('AE could not complete this Quote request. Contact support before trying again.', '/support') }
    case 'payments_not_ready':
      return { ...base, retryable: true, reason: 'Paid Tool purchases are temporarily unavailable. You can keep searching and comparing Tools.', continuation: inspect(30000) }
    case 'payments_paused':
      return { ...base, retryable: false, reason: 'Paid Tool purchases are temporarily paused. You can keep searching and comparing Tools.' }
    case 'payments_admins_only':
      return { ...base, retryable: false, reason: 'Paid Tool purchases are currently available to Admins only. You can keep searching and comparing Tools.' }
    case 'treasury_capacity_unavailable':
      return { ...base, continuation: inspect(30000) }
    case 'input_invalid':
      return {
        ...base,
        continuation: {
          action: 'registry.tools.describe', args: { toolRef: input.toolRef },
        },
      }
    case 'tool_not_current':
    case 'tool_unsupported':
      return input.capabilityId === undefined
        ? { ...base, continuation: list }
        : {
            ...base,
            continuation: {
              action: 'registry.tools.search', args: { query: input.capabilityId, limit: 10 },
            },
          }
    case 'grant_not_found':
      return { ...base, ownerHandoff: requiredAction(false) }
    case 'budget_exceeded': {
      if (input.reason === 'account_limit') return { ...base, ownerHandoff: operatorAction('Wait for existing purchases to resolve or contact support to review the Account’s purchase capacity. Adding credit does not increase this limit.', '/support') }
      const period = input.reason === 'daily_limit_exhausted' ? 'day'
        : input.reason === 'monthly_limit_exhausted' ? 'month' : undefined
      return period === undefined
        ? { ...base, ownerHandoff: requiredAction(false) }
        : { ...base, ownerHandoff: operatorAction(`Wait for spending capacity to become available or ask the owner to review this Agent’s limit. ${period === 'day' ? 'Daily limits reset at midnight UTC.' : 'Monthly limits reset on the first day of each month at midnight UTC.'}`, '/agent-access') }
    }
    case 'commercial_policy_unavailable': {
      const parsed = commercialPolicyRefusalReasonSchema.safeParse(input.reason)
      if (!parsed.success) return { ...base, ownerHandoff: requiredAction(true) }
      const reason: CommercialPolicyRefusalReason = parsed.data
      switch (reason) {
        case 'legal_customer_required':
          return {
            ...base,
            continuation: {
              action: 'funding.handoff.config',  args: {},
            },
            ownerHandoff: operatorAction('The owner must confirm this Account’s legal customer on the AE Account page before this Agent can call Tools.', '/agent-access'),
          }
        case 'commercial_policy_fixture_required':
        case 'commercial_policy_deployment_profile_invalid':
          return {
            ...base,
            continuation: inspect(30000),
            ownerHandoff: requiredAction(true),
          }
        case 'commercial_policy_missing':
        case 'commercial_policy_environment_mismatch':
        case 'commercial_policy_not_effective':
        case 'commercial_policy_expired':
        case 'commercial_policy_suspended':
        case 'commercial_policy_superseded':
        case 'commercial_policy_conflict':
          return {
            ...base,
            continuation: inspect(30000),
            ownerHandoff: requiredAction(true),
          }
        default: {
          const unreachable: never = reason
          return unreachable
        }
      }
    }
    case 'insufficient_balance':
      return input.funding === undefined
        ? {
            ...base,
            ownerHandoff: {
              actor: 'account_owner',
              reason: 'The owner must review funding because one hosted funding session cannot satisfy this shortfall.',
            },
          }
        : {
            ...base,
            continuation: {
              action: 'funding.handoff.create', args: input.funding,
            },
          }
    case 'tool_not_found':
    case 'pricing_setup_required':
      return { ...base, continuation: list }
  }
}

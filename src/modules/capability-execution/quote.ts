import { z } from 'zod'

import { jsonValueSchema, type JsonValue } from '@/modules/capability-contract/public'
import {
  commercialPolicyRefusalReasonSchema,
  exactAmountSchema,
  type CommercialPolicyRefusalReason,
} from '@/modules/money/public'
import {
  FUNDING_HANDOFF_CONFIG_PATH,
  FUNDING_HANDOFF_CREATE_PATH,
} from '@/modules/money/funding-handoff.actions'
import {
  TOOL_MARKET_DESCRIBE_PATH,
  TOOL_MARKET_LIST_PATH,
  TOOL_MARKET_SEARCH_PATH,
} from '@/modules/common/market-tool-paths'
import { idempotencyKeySchema } from '@/modules/common/action'

export const TOOL_QUOTE_ACTION_ID = 'tool.quote' as const
export const TOOL_QUOTE_PATH = '/api/v1/tools/quote' as const
/** Operator command that activates or replaces a commercial policy approval. */
export const COMMERCIAL_POLICY_ADMIN_SURFACE = 'moneyCommercialPolicy.change' as const

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
  method: z.literal('POST'),
  path: z.literal('/api/v1/tools/call'),
  input: z.strictObject({
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
  'pricing_setup_required',
  'commercial_policy_unavailable',
  'inspection_unavailable',
] as const
export type ToolQuoteRefusalCode = (typeof toolQuoteRefusalCodeValues)[number]

const quoteContinuationSchema = z.discriminatedUnion('action', [
  z.strictObject({
    action: z.literal('registry.tools.list'),
    method: z.literal('POST'),
    path: z.literal(TOOL_MARKET_LIST_PATH),
    input: z.strictObject({ limit: z.literal(10) }),
  }),
  z.strictObject({
    action: z.literal('registry.tools.search'),
    method: z.literal('POST'),
    path: z.literal(TOOL_MARKET_SEARCH_PATH),
    input: z.strictObject({ query: z.string().min(1), limit: z.literal(10) }),
  }),
  z.strictObject({
    action: z.literal('registry.tools.describe'),
    method: z.literal('POST'),
    path: z.literal(TOOL_MARKET_DESCRIBE_PATH),
    input: z.strictObject({ toolRef: z.string() }),
  }),
  z.strictObject({
    action: z.literal('tool.quote'),
    method: z.literal('POST'),
    path: z.literal(TOOL_QUOTE_PATH),
    input: toolQuoteInputSchema,
    retryAfterMs: z.union([z.literal(5000), z.literal(30000)]),
  }),
  z.strictObject({
    action: z.literal('funding.handoff.create'),
    method: z.literal('POST'),
    path: z.literal(FUNDING_HANDOFF_CREATE_PATH),
    input: z.strictObject({
      principalAmount: exactAmountSchema,
      idempotencyKey: idempotencyKeySchema,
    }),
  }),
  z.strictObject({
    action: z.literal('funding.handoff.config'),
    method: z.literal('GET'),
    path: z.literal(FUNDING_HANDOFF_CONFIG_PATH),
    input: z.strictObject({}),
  }),
])

const requiredActionSchema = z.strictObject({
  action: z.string().min(1),
  blockedCapabilities: z.tuple([z.literal('tool.call')]),
  cta: z.union([z.literal('/agent-access'), z.literal('/support'), z.null()]),
  ctaLabel: z.string().min(1),
  description: z.string().min(1),
  iconUrl: z.null(),
  status: z.enum(['required', 'pending']),
  title: z.string().min(1),
})

export const toolQuoteResultSchema = z.union([
  z.strictObject({
    kind: z.literal('committed'),
    quoteRef: z.string(),
    toolRef: z.string(),
    toolVersion: z.number().int().positive(),
    expiresAt: z.number().int().nonnegative(),
    normalizedInput: z.record(z.string(), jsonValueSchema),
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
    continuation: callContinuationSchema,
  }),
  z.strictObject({
    kind: z.literal('refused'),
    toolRef: z.string(),
    code: z.enum(toolQuoteRefusalCodeValues),
    // `commercial_policy_unavailable` forwards a `CommercialPolicyRefusalReason`
    // verbatim; other codes carry free-text operator detail.
    reason: z.string().min(1).optional(),
    retryable: z.boolean(),
    correlationRef: z.string().min(1),
    continuation: quoteContinuationSchema.optional(),
    requiredActions: z.tuple([requiredActionSchema]).optional(),
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
    method: 'POST' as const,
    path: TOOL_MARKET_LIST_PATH,
    input: { limit: 10 as const },
  }
  const inspect = (retryAfterMs: 5000 | 30000) => ({
    action: 'tool.quote' as const,
    method: 'POST' as const,
    path: TOOL_QUOTE_PATH,
    input: { toolRef: input.toolRef, input: input.input },
    retryAfterMs,
  })
  const requiredAction = (support: boolean) => ({
    action: support ? 'contact_support' : 'review_agent_access',
    blockedCapabilities: ['tool.call'] as ['tool.call'],
    cta: support ? '/support' as const : '/agent-access' as const,
    ctaLabel: support ? 'Contact support' : 'Review agent access',
    description: support
      ? 'AE could not establish the commercial policy required to call this Tool.'
      : 'The owner must review this agent’s access or budget before it can call this Tool.',
    iconUrl: null,
    status: 'required' as const,
    title: support ? 'Contact support' : 'Review agent access',
  })
  const operatorAction = (
    action: string,
    title: string,
    description: string,
    cta: '/agent-access' | '/support',
  ) => ({
    action,
    blockedCapabilities: ['tool.call'] as ['tool.call'],
    cta,
    ctaLabel: cta === '/support' ? 'Contact support' : 'Review agent access',
    description,
    iconUrl: null,
    status: 'required' as const,
    title,
  })
  switch (input.code) {
    case 'tool_not_ready':
      return { ...base, continuation: inspect(5000) }
    case 'inspection_unavailable':
      return input.retryable
        ? { ...base, continuation: inspect(5000) }
        : { ...base, requiredActions: [requiredAction(true)] }
    case 'treasury_capacity_unavailable':
      return { ...base, continuation: inspect(30000) }
    case 'input_invalid':
      return {
        ...base,
        continuation: {
          action: 'registry.tools.describe', method: 'POST', path: TOOL_MARKET_DESCRIBE_PATH,
          input: { toolRef: input.toolRef },
        },
      }
    case 'tool_not_current':
    case 'tool_unsupported':
      return input.capabilityId === undefined
        ? { ...base, continuation: list }
        : {
            ...base,
            continuation: {
              action: 'registry.tools.search', method: 'POST', path: TOOL_MARKET_SEARCH_PATH,
              input: { query: input.capabilityId, limit: 10 },
            },
          }
    case 'grant_not_found':
    case 'budget_exceeded':
      return { ...base, requiredActions: [requiredAction(false)] }
    case 'commercial_policy_unavailable': {
      const parsed = commercialPolicyRefusalReasonSchema.safeParse(input.reason)
      if (!parsed.success) return { ...base, requiredActions: [requiredAction(true)] }
      const reason: CommercialPolicyRefusalReason = parsed.data
      switch (reason) {
        case 'legal_customer_required':
          return {
            ...base,
            continuation: {
              action: 'funding.handoff.config', method: 'GET',
              path: FUNDING_HANDOFF_CONFIG_PATH, input: {},
            },
            requiredActions: [operatorAction(
              'review_account_legal_customer',
              'Review account ownership',
              'The owner must confirm this Account’s legal customer on the AE Account page before this Agent can call Tools.',
              '/agent-access',
            )],
          }
        case 'commercial_policy_fixture_required':
        case 'commercial_policy_deployment_profile_invalid':
          return {
            ...base,
            continuation: inspect(30000),
            requiredActions: [operatorAction(
              'set_sandbox_deployment_profile',
              'Contact support',
              'An AE operator must set AE_PACKAGE4_SANDBOX_DEPLOYMENT_PROFILE to local_ci or synthetic_vps_fixture before this Tool can be quoted.',
              '/support',
            )],
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
            requiredActions: [operatorAction(
              'activate_commercial_policy',
              'Contact support',
              `An AE operator must resolve ${reason} on the ${COMMERCIAL_POLICY_ADMIN_SURFACE} admin surface before this Tool can be quoted.`,
              '/support',
            )],
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
            requiredActions: [{
              action: 'review_funding',
              blockedCapabilities: ['tool.call'],
              cta: null,
              ctaLabel: 'Review funding',
              description: 'The owner must review funding because one hosted funding session cannot satisfy this shortfall.',
              iconUrl: null,
              status: 'required',
              title: 'Review funding',
            }],
          }
        : {
            ...base,
            continuation: {
              action: 'funding.handoff.create', method: 'POST', path: FUNDING_HANDOFF_CREATE_PATH,
              input: input.funding,
            },
          }
    case 'tool_not_found':
    case 'pricing_setup_required':
      return { ...base, continuation: list }
  }
}

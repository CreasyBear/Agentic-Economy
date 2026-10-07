import { z } from 'zod'

import { idempotencyKeySchema } from '@/modules/common/action'
import { exactAmountSchema } from '@/modules/money/public'
import { FUNDING_HANDOFF_CONFIG_PATH, FUNDING_HANDOFF_CREATE_PATH } from '@/modules/money/funding-handoff.actions'
import { TOOL_MARKET_DESCRIBE_PATH, TOOL_MARKET_LIST_PATH, TOOL_MARKET_SEARCH_PATH } from '@/modules/common/market-tool-paths'
import { TOOL_QUOTE_PATH, toolQuoteInputSchema, toolQuoteResultSchema } from '@/modules/capability-execution/quote'

// Historical full Quote tool output is decoded only by the chat renderer.
// Live HTTP, MCP and action output validation use the current strict schema.
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
  'payments_paused',
  'payments_admins_only',
  'payments_not_ready',
  'pricing_setup_required',
  'commercial_policy_unavailable',
  'inspection_unavailable',
] as const
const toolQuoteRefusalCodeSchema = z.enum(toolQuoteRefusalCodeValues)

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

const storedLegacyQuoteSchema = z.union([
  z.strictObject({
    kind: z.literal('committed'),
    quoteRef: z.string(),
    toolRef: z.string(),
    toolVersion: z.number().int().positive(),
    expiresAt: z.number().int().nonnegative(),
    normalizedInput: toolQuoteInputSchema.shape.input,
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
    requiredActions: z.tuple([requiredActionSchema]).optional(),
  }),
])

/** Read a current or known historical Quote for presentation, never admission. */
export function parseStoredToolQuoteOutput(value: unknown) {
  const current = toolQuoteResultSchema.safeParse(value)
  if (current.success) return current
  const legacy = storedLegacyQuoteSchema.safeParse(value)
  if (!legacy.success) return current
  const result = legacy.data
  const continuation = result.continuation === undefined ? undefined : (() => {
    const { method: _method, path: _path, input: args, ...operation } = result.continuation
    return { ...operation, args }
  })()
  if (result.kind === 'committed') {
    const { normalizedInput: _normalizedInput, continuation: _continuation, ...facts } = result
    return toolQuoteResultSchema.safeParse({ ...facts, continuation })
  }
  const { requiredActions, continuation: _continuation, ...facts } = result
  const handoff = requiredActions?.[0]
  return toolQuoteResultSchema.safeParse({
    ...facts,
    ...(continuation === undefined ? {} : { continuation }),
    ...(handoff === undefined ? {} : {
      ownerHandoff: {
        actor: handoff.cta === '/support' ? 'ae_support' : 'account_owner',
        reason: handoff.description,
        ...(handoff.cta === null ? {} : { destination: handoff.cta }),
      },
    }),
  })
}

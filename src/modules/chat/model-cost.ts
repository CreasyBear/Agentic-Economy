import Decimal from 'decimal.js'
import { v, type Infer } from 'convex/values'

export const CHAT_MODEL_COST_MAX_REQUESTS = 256
export const CHAT_MODEL_COST_IDENTIFIER_MAX_LENGTH = 200
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/u
const modelPattern = /^[A-Za-z0-9~_][A-Za-z0-9~_./:@+-]{0,199}$/u
const CostDecimal = Decimal.clone({ precision: 64 })

export const chatModelCostBindingValue = v.object({
  turnRef: v.string(), threadId: v.string(), promptMessageId: v.string(),
})
export type ChatModelCostBinding = Infer<typeof chatModelCostBindingValue>
export const chatModelCostSourceValue = v.union(v.literal('openrouter'), v.literal('jev'))
export const chatModelCostPurposeValue = v.union(
  v.literal('initial'), v.literal('immediate_explanation'), v.literal('final_answer'),
  v.literal('discovery_rerank'), v.literal('discovery_recommendation'),
)
export const chatModelCostAccountingValue = v.union(
  v.object({ status: v.literal('unpriced'), reason: v.union(
    v.literal('missing_usage'), v.literal('request_failed'), v.literal('jev_usage_only'), v.literal('lookup_failed'),
  ) }),
  v.object({ status: v.literal('priced'), amountUsd: v.string(), source: v.union(v.literal('inline'), v.literal('generation_stats')) }),
)
export const chatModelCostStoredAccountingValue = v.union(
  v.object({ status: v.literal('pending') }), chatModelCostAccountingValue,
)
export const chatModelCostBeginValue = chatModelCostBindingValue.extend({
  requestRef: v.string(), source: chatModelCostSourceValue,
  purpose: chatModelCostPurposeValue, requestedModel: v.string(),
})
export const chatModelCostObserveValue = chatModelCostBindingValue.extend({
  requestRef: v.string(), model: v.optional(v.string()), inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()), providerGenerationId: v.optional(v.string()), accounting: chatModelCostAccountingValue,
})
export type ChatModelCostBegin = Infer<typeof chatModelCostBeginValue>
export type ChatModelCostObserve = Infer<typeof chatModelCostObserveValue>
export const chatModelCostRequestValue = v.object({
  requestRef: v.string(), source: chatModelCostSourceValue, purpose: chatModelCostPurposeValue,
  requestedModel: v.string(), model: v.optional(v.string()), inputTokens: v.optional(v.number()),
  outputTokens: v.optional(v.number()), providerGenerationId: v.optional(v.string()),
  accounting: chatModelCostStoredAccountingValue,
})
export const chatModelCostSummaryValue = v.object({
  turnRef: v.string(), status: v.union(v.literal('complete'), v.literal('incomplete'), v.literal('untracked'), v.literal('limit_exceeded')),
  knownCostUsd: v.string(), requestCount: v.number(), unknownRequestCount: v.number(), requests: v.array(chatModelCostRequestValue),
})
export type ChatModelCostSummary = Infer<typeof chatModelCostSummaryValue>
export const chatModelCostStatsClaimValue = v.union(v.null(), chatModelCostBindingValue.extend({
  requestRef: v.string(), providerGenerationId: v.string(), model: v.optional(v.string()),
  inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()),
}))
export type ChatModelCostStatsClaim = Infer<typeof chatModelCostStatsClaimValue>

export function isChatModelCostIdentifier(value: string): boolean {
  return identifierPattern.test(value)
}
export function isChatModelCostModel(value: string): boolean {
  return modelPattern.test(value)
}

/** Exact reported USD only; zero is valid, missing or invalid values are absent. */
export function parseModelCostUsd(value: unknown): string | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) return undefined
  const text = String(value)
  if (text.length > 256 || !/^\d+(?:\.\d+)?(?:[eE][+-]?\d{1,3})?$/u.test(text)) return undefined
  const decimal = new CostDecimal(text)
  if (!decimal.isFinite() || decimal.isNegative()) return undefined
  const canonical = decimal.toFixed()
  const [integer, fraction = ''] = canonical.split('.')
  return integer !== undefined && integer.length <= 18 && fraction.length <= 30 ? canonical : undefined
}

/** 256 bounded amounts need at most 51 significant digits; precision 64 is exact. */
export function sumModelCostUsd(amounts: readonly string[]): string {
  if (amounts.length > CHAT_MODEL_COST_MAX_REQUESTS) throw new Error('model_cost_limit_exceeded')
  let total = new CostDecimal(0)
  for (const amount of amounts) {
    const parsed = parseModelCostUsd(amount)
    if (parsed === undefined) throw new Error('model_cost_amount_invalid')
    total = total.plus(parsed)
  }
  return total.toFixed()
}

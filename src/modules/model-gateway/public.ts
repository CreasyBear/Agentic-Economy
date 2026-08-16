import { createOpenRouter, type OpenRouterProvider } from '@openrouter/ai-sdk-provider'
import {
  addToolInputExamplesMiddleware,
  wrapLanguageModel,
  type LanguageModel,
  type ProviderMetadata,
} from 'ai'

/**
 * The single AE seam onto the OpenRouter language-model provider.
 *
 * Every AE model call goes through the Vercel AI SDK (`ai`) with this provider.
 * Modules must not open their own HTTP transport to a model provider: the SDK
 * already owns request shaping, tool-call encoding, structured output, retries,
 * abort propagation, usage accounting, and typed errors.
 */

export type OpenRouterGatewayConfig = Readonly<{
  /**
   * Absent means "no credential in this environment". The provider still
   * resolves it lazily, so callers that must refuse before spending a turn
   * check this field; callers that just want to fail at request time do not.
   */
  apiKey?: string
  /** Default model for callers that do not pick one explicitly. */
  model: string
  baseUrl?: string
  siteUrl?: string
}>

export const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4-flash'

export function openRouterGatewayConfig(): OpenRouterGatewayConfig {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  const baseUrl = process.env.AE_OPENROUTER_API_BASE_URL?.trim()
  const siteUrl = process.env.SITE_URL?.trim()
  return {
    ...(apiKey === undefined || apiKey.length === 0 ? {} : { apiKey }),
    model: process.env.AE_LLM_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL,
    ...(baseUrl === undefined || baseUrl.length === 0 ? {} : { baseUrl }),
    ...(siteUrl === undefined || siteUrl.length === 0 ? {} : { siteUrl }),
  }
}

type ProviderCacheKey = string

let providerCache: { key: ProviderCacheKey; provider: OpenRouterProvider } | undefined

/**
 * Providers are stateless request factories, so one instance per credential set
 * is enough. Rebuilding per call re-reads env and re-allocates on every turn.
 * A caller-supplied `fetch` is a test seam and is never cached.
 */
function openRouterProvider(
  config: OpenRouterGatewayConfig,
  fetchImpl?: typeof fetch,
): OpenRouterProvider {
  const settings = {
    ...(config.apiKey === undefined ? {} : { apiKey: config.apiKey }),
    ...(config.baseUrl === undefined ? {} : { baseURL: config.baseUrl }),
    appName: 'Agentic Economy',
    ...(config.siteUrl === undefined ? {} : { appUrl: config.siteUrl }),
  }
  if (fetchImpl !== undefined) {
    return createOpenRouter({ ...settings, fetch: fetchImpl })
  }
  const key: ProviderCacheKey = `${config.apiKey ?? ''}\u0000${config.baseUrl ?? ''}\u0000${config.siteUrl ?? ''}`
  if (providerCache?.key === key) {
    return providerCache.provider
  }
  const provider = createOpenRouter(settings)
  providerCache = { key, provider }
  return provider
}

export type OpenRouterModelOptions = Readonly<{
  /** Ask OpenRouter for strict JSON-schema structured outputs. */
  structuredOutputs?: boolean
  /** Disable reasoning tokens for latency-sensitive deterministic roles. */
  excludeReasoning?: boolean
  /**
   * Coarse JSON mode for models without strict schema support. The caller still
   * has to validate the parsed text: JSON mode guarantees syntax, not shape.
   */
  jsonObjectResponse?: boolean
  /**
   * A provider-native `json_schema` response format, for callers that already
   * own an exact OpenRouter schema payload rather than an AI SDK output spec.
   */
  jsonSchemaResponse?: Readonly<Record<string, unknown>>
  /** Budget reasoning tokens instead of suppressing them outright. */
  reasoningEffort?: 'low' | 'medium' | 'high'
  /**
   * Request reasoning AND return its content in the response so callers can
   * surface it. Mirrors `reasoningEffort` but keeps `exclude` off so the SDK
   * populates `reasoningText`; use for user-facing deliberation, never for
   * latency-sensitive or deterministic roles.
   */
  surfaceReasoning?: 'low' | 'medium' | 'high'
  /** Enable OpenRouter's web plugin, capped at this many results. */
  webSearchMaxResults?: number
  /** Test seam: route the provider's HTTP through a supplied fetch. */
  fetch?: typeof fetch
}>

/**
 * Builds the language model with AE's standing provider options: usage
 * accounting is always requested so cost is attributable on every request.
 */
export function openRouterModel(
  config: OpenRouterGatewayConfig,
  modelId: string,
  options: OpenRouterModelOptions = {},
): LanguageModel {
  const extraBody: Record<string, unknown> = {
    ...(options.jsonObjectResponse === true ? { response_format: { type: 'json_object' } } : {}),
    ...(options.jsonSchemaResponse === undefined
      ? {}
      : { response_format: { type: 'json_schema', json_schema: options.jsonSchemaResponse } }),
    ...(options.excludeReasoning === true ? { reasoning: { exclude: true, effort: 'none' } } : {}),
    ...(options.reasoningEffort === undefined
      ? {}
      : { reasoning: { effort: options.reasoningEffort, exclude: true } }),
    ...(options.surfaceReasoning === undefined
      ? {}
      : { reasoning: { effort: options.surfaceReasoning } }),
    ...(options.webSearchMaxResults === undefined
      ? {}
      : { plugins: [{ id: 'web', max_results: options.webSearchMaxResults }] }),
  }
  const model = openRouterProvider(config, options.fetch)(modelId, {
    provider: {
      allow_fallbacks: true,
      require_parameters: options.structuredOutputs ?? false,
    },
    ...(options.structuredOutputs === true ? { structuredOutputs: { strict: true } } : {}),
    ...(Object.keys(extraBody).length === 0 ? {} : { extraBody }),
    usage: { include: true },
  })
  return wrapLanguageModel({
    model,
    middleware: addToolInputExamplesMiddleware(),
  })
}

/**
 * OpenRouter reports settled request cost in provider metadata. Absence is
 * normal (streaming, cached, or accounting-disabled responses), so callers must
 * treat `undefined` as "cost unavailable", never as zero.
 */
export function openRouterCostUsd(metadata: ProviderMetadata | undefined): number | undefined {
  const usage: unknown = metadata?.openrouter?.usage
  if (typeof usage !== 'object' || usage === null || !('cost' in usage)) {
    return undefined
  }
  const cost: unknown = usage.cost
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : undefined
}

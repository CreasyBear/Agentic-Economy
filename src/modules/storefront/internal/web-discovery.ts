import { APICallError, generateText, RetryError, type LanguageModelUsage } from 'ai'
import { uniq } from 'es-toolkit/array'
import { z } from 'zod'

import type { ActionModelRequestObservation, ActionModelUsage } from '@/modules/common/action'
import { openRouterModel, type OpenRouterGatewayConfig } from '@/modules/model-gateway/public'

export type WebDiscoveryInput = {
  query: string
  location?: string
}

export type WebDiscoveryClaim = {
  businessName: string
  suburb: string
  phone?: string
  websiteUrl?: string
  serviceSummary?: string
  sourceUrl: string
}

export type WebDiscoveryResult =
  | { kind: 'found'; query: string; claims: readonly WebDiscoveryClaim[] }
  | { kind: 'none'; query: string; reason: 'no_matches' }
  | { kind: 'unavailable'; reason: 'llm_not_configured' }
  | { kind: 'error'; code: 'discovery_failed'; retryable: boolean; reason: string }

export type WebDiscoveryOptions = {
  fetch?: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => Promise<Response>
  timeoutMs?: number
  onModelRequest?: (observation: ActionModelRequestObservation) => void
}

const MAX_REQUEST_BYTES = 1_000_000
const MAX_ATTEMPTS = 2
const DEFAULT_TIMEOUT_MS = 20_000
const MAX_RESULTS = 5

const SYSTEM_INSTRUCTION = [
  'Find real published businesses using web search results and return only businesses supported by those results.',
  'Return one JSON object with a businesses array. Each item must include businessName, suburb, and sourceUrl; sourceUrl must copy the exact supporting web-search citation URL for that business. It may also include phone, websiteUrl, and serviceSummary.',
  'Include a claim, phone number, or website only when it appears in that same cited search evidence. Never invent details, availability, prices, credentials, or AE listing status.',
  'Use the business suburb exactly as grounded by its cited result. Return at most five distinct businesses.',
  'If no suitable business exists in the requested place, widen to the nearest real specialists and keep their actual location; do not imply they are local.',
].join(' ')

const discoveryFieldsSchema = z.object({
  businesses: z.array(z.object({
    businessName: z.string().optional(),
    suburb: z.string().optional(),
    phone: z.string().optional(),
    websiteUrl: z.string().optional(),
    serviceSummary: z.string().optional(),
    sourceUrl: z.string().optional(),
  })).max(MAX_RESULTS),
})

export async function discoverBusinessesFromWebSearch(
  input: WebDiscoveryInput,
  config: OpenRouterGatewayConfig | undefined,
  options: WebDiscoveryOptions = {},
): Promise<WebDiscoveryResult> {
  if (config?.apiKey === undefined || config.apiKey.trim().length === 0 || config.model.trim().length === 0) {
    return { kind: 'unavailable', reason: 'llm_not_configured' }
  }

  const query = input.query.trim()
  if (query.length === 0) return { kind: 'none', query, reason: 'no_matches' }

  const location = input.location?.trim()
  const prompt = `Find real published businesses for "${query}"${location === undefined || location.length === 0 ? '' : ` near ${location}`}.`
  if (new TextEncoder().encode(SYSTEM_INSTRUCTION + prompt).byteLength > MAX_REQUEST_BYTES) {
    return discoveryFailed('The discovery request was too large to send.')
  }

  const completion = await requestCompletion({ system: SYSTEM_INSTRUCTION, prompt }, config, options)
  if (completion.kind === 'failed') return completion.result

  const fields = parseDiscoveryFields(completion.content)
  if (fields === undefined || fields.businesses.length === 0 || completion.citations.length === 0) {
    return { kind: 'none', query, reason: 'no_matches' }
  }

  const citations = new Set(completion.citations)
  const claims = fields.businesses.flatMap((business) => {
    const businessName = business.businessName?.trim()
    const suburb = business.suburb?.trim()
    const sourceUrl = business.sourceUrl?.trim()
    if (businessName === undefined || businessName.length === 0 || suburb === undefined || suburb.length === 0
      || sourceUrl === undefined || !citations.has(sourceUrl)) return []
    return [{
      businessName,
      suburb,
      sourceUrl,
      ...(business.phone === undefined || business.phone.trim().length === 0 ? {} : { phone: business.phone.trim() }),
      ...(business.websiteUrl === undefined || business.websiteUrl.trim().length === 0 ? {} : { websiteUrl: business.websiteUrl.trim() }),
      ...(business.serviceSummary === undefined || business.serviceSummary.trim().length === 0 ? {} : { serviceSummary: business.serviceSummary.trim() }),
    }]
  })

  return claims.length === 0
    ? { kind: 'none', query, reason: 'no_matches' }
    : { kind: 'found', query, claims }
}

async function requestCompletion(
  request: Readonly<{ system: string; prompt: string }>,
  config: OpenRouterGatewayConfig,
  options: WebDiscoveryOptions,
): Promise<
  | { kind: 'ok'; content: string; citations: readonly string[] }
  | { kind: 'failed'; result: WebDiscoveryResult }
> {
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const result = await generateText({
      model: openRouterModel(config, config.model, {
        jsonObjectResponse: true,
        webSearchMaxResults: MAX_RESULTS,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      }),
      maxRetries: MAX_ATTEMPTS - 1,
      temperature: 0,
      instructions: request.system,
      prompt: request.prompt,
      abortSignal: timeoutSignal,
    })
    const endedAt = Date.now()
    const usage = modelUsage(result.usage)
    options.onModelRequest?.({
      provider: 'openrouter',
      model: config.model,
      status: 'ok',
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      stopReason: result.finishReason,
      ...(usage === undefined ? {} : { usage }),
      costUnavailableReason: 'provider_cost_not_reported',
    })
    if (result.text.length === 0) return { kind: 'failed', result: discoveryFailed('The discovery service returned no content.') }
    const citations = uniq(result.sources.flatMap((source) =>
      source.sourceType === 'url' && source.url.trim().length > 0 ? [source.url] : []
    ))
    return { kind: 'ok', content: result.text, citations }
  } catch (error) {
    const endedAt = Date.now()
    options.onModelRequest?.({
      provider: 'openrouter',
      model: config.model,
      status: 'error',
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      errorCode: 'request_failed',
      costUnavailableReason: 'request_failed',
    })
    return { kind: 'failed', result: discoveryFailed(failureReason(error, timeoutSignal)) }
  }
}

function parseDiscoveryFields(content: string): z.infer<typeof discoveryFieldsSchema> | undefined {
  try {
    const result = discoveryFieldsSchema.safeParse(JSON.parse(content))
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}

function modelUsage(usage: LanguageModelUsage): ActionModelUsage | undefined {
  const mapped: ActionModelUsage = {
    ...(usage.inputTokens === undefined ? {} : { inputTokens: usage.inputTokens }),
    ...(usage.outputTokens === undefined ? {} : { outputTokens: usage.outputTokens }),
    ...(usage.inputTokenDetails.cacheReadTokens === undefined ? {} : { cachedInputTokens: usage.inputTokenDetails.cacheReadTokens }),
    ...(usage.inputTokenDetails.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens }),
    ...(usage.outputTokenDetails.reasoningTokens === undefined ? {} : { reasoningOutputTokens: usage.outputTokenDetails.reasoningTokens }),
    ...(usage.totalTokens === undefined ? {} : { totalTokens: usage.totalTokens }),
  }
  return Object.keys(mapped).length === 0 ? undefined : mapped
}

function failureReason(error: unknown, timeoutSignal: AbortSignal): string {
  if (timeoutSignal.aborted || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
    return 'The discovery service did not respond. Try again.'
  }
  const providerError = APICallError.isInstance(error)
    ? error
    : RetryError.isInstance(error) && APICallError.isInstance(error.lastError) ? error.lastError : undefined
  if (providerError === undefined) return 'The discovery service was unavailable.'
  return providerError.statusCode === undefined || providerError.statusCode === 200
    ? 'The discovery service returned an unreadable response.'
    : `The discovery service refused the request (${providerError.statusCode}).`
}

function discoveryFailed(reason: string): WebDiscoveryResult {
  return { kind: 'error', code: 'discovery_failed', retryable: true, reason }
}

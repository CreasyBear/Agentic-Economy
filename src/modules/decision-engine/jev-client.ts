import { TypeSafeClient, type EntryType } from '@typesafe-ai/sdk'
import type {
  DecisionGatewayOptions,
  DecisionGatewayRequest,
  DecisionGatewayResponse,
  JevAnswer,
} from './contracts'

const DEFAULT_JEV_MODEL = '~typesafe/jev-latest'
const DEFAULT_JEV_TIMEOUT_MS = 1500

export async function callJevSystemOne(
  request: DecisionGatewayRequest,
  options: DecisionGatewayOptions = {},
): Promise<DecisionGatewayResponse> {
  const startedAt = Date.now()
  const apiKey =
    options.typesafeApiKey ||
    options.openrouterApiKey ||
    process.env.TYPESAFE_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    ''

  if (apiKey.length === 0) {
    throw new Error('missing_openrouter_api_key')
  }

  const isOpenRouter = apiKey.startsWith('sk-or-') || !apiKey.startsWith('ts-')
  const defaultBaseURL = isOpenRouter
    ? 'https://openrouter.ai/api/alpha'
    : 'https://api.typesafe.ai'
  const baseURL = options.baseURL ?? process.env.TYPESAFE_BASE_URL ?? defaultBaseURL
  const defaultModel = options.jevModel ?? (isOpenRouter ? DEFAULT_JEV_MODEL : 'jev-latest')
  const timeout = options.timeoutMs ?? DEFAULT_JEV_TIMEOUT_MS
  const baseFetch = options.fetchImpl ?? fetch

  // Adapt fetch to map OpenRouter alpha endpoint and append referral metadata
  const adaptedFetch: typeof fetch = async (url, init) => {
    let resolvedUrl = url.toString()
    if (resolvedUrl.includes('openrouter.ai') && resolvedUrl.endsWith('/v1/systemone')) {
      resolvedUrl = resolvedUrl.replace('/v1/systemone', '/decisions')
    }
    const headers = new Headers(init?.headers)
    if (resolvedUrl.includes('openrouter.ai')) {
      headers.set('HTTP-Referer', 'https://agentic-economy.local')
      headers.set('X-Title', 'Agentic Economy Decision Engine')
    }
    return baseFetch(resolvedUrl, { ...init, headers })
  }

  const client = new TypeSafeClient({
    apiKey,
    baseURL,
    defaultModel,
    timeout,
    fetch: adaptedFetch,
    retry: { maxRetries: options.maxRetries ?? 1 },
  })

  const result = await client.systemOne({
    state: request.state as EntryType,
    questions: request.questions,
    model: defaultModel,
  })

  const inputTokens = result.usage?.input_tokens ?? 120
  const outputTokens = result.usage?.output_tokens ?? 0
  const durationMs = Date.now() - startedAt

  return {
    tier: 'jev_system_one',
    model: result.model || defaultModel,
    answers: result.answers as Record<string, JevAnswer>,
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostAud: `A$${((inputTokens * 0.042) / 1_000_000).toFixed(6)}`,
    },
    durationMs,
    attemptedTiers: ['jev_system_one'],
  }
}

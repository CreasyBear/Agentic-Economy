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
    options.openrouterApiKey ??
    process.env.OPENROUTER_API_KEY ??
    ''

  if (apiKey.length === 0) {
    throw new Error('missing_openrouter_api_key')
  }

  const model = options.jevModel ?? process.env.JEV_MODEL ?? DEFAULT_JEV_MODEL
  const timeoutMs = options.timeoutMs ?? DEFAULT_JEV_TIMEOUT_MS
  const fetchFn = options.fetchImpl ?? fetch

  const response = await fetchFn('https://openrouter.ai/api/alpha/decisions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://agentic-economy.local',
      'X-Title': 'Agentic Economy Decision Engine',
    },
    body: JSON.stringify({
      model,
      state: request.state,
      questions: request.questions,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`jev_api_error_${response.status}:${errorBody.slice(0, 100)}`)
  }

  const data = (await response.json()) as {
    model: string
    answers: Record<string, JevAnswer>
    usage?: { input_tokens?: number; output_tokens?: number; cost?: number }
  }

  const inputTokens = data.usage?.input_tokens ?? 120
  const outputTokens = data.usage?.output_tokens ?? 0
  const durationMs = Date.now() - startedAt

  return {
    tier: 'jev_system_one',
    model: data.model || model,
    answers: data.answers,
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostAud: `A$${((inputTokens * 0.042) / 1_000_000).toFixed(6)}`,
    },
    durationMs,
    attemptedTiers: ['jev_system_one'],
  }
}

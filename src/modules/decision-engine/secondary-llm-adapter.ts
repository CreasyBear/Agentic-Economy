import type {
  DecisionGatewayOptions,
  DecisionGatewayRequest,
  DecisionGatewayResponse,
  JevAnswer,
  JevChoiceAnswer,
  JevNoulAnswer,
  JevScoreAnswer,
} from './contracts'

const DEFAULT_SECONDARY_MODEL = 'google/gemini-2.5-flash'
const DEFAULT_SECONDARY_TIMEOUT_MS = 2500

export async function callSecondaryLlmAdapter(
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

  const model = options.secondaryModel ?? DEFAULT_SECONDARY_MODEL
  const timeoutMs = options.timeoutMs ?? DEFAULT_SECONDARY_TIMEOUT_MS
  const fetchFn = options.fetchImpl ?? fetch

  const systemPrompt = `You are a calibrated System One probabilistic decision engine.
Given the input state and questions, evaluate each question strictly.
Respond ONLY with a valid JSON object matching this schema:
{
  "answers": {
    "<question_name>": {
      "type": "choice" | "noul" | "score",
      "choice": "<selected_key>", // if choice
      "confidence": 0.0 - 1.0,    // if choice or score
      "noul": 0.0 - 1.0,          // if noul (probability of proposition being true)
      "score": 0.0 - 5.0          // if score
    }
  }
}`

  const userPrompt = `STATE:
${typeof request.state === 'string' ? request.state : JSON.stringify(request.state, null, 2)}

QUESTIONS:
${JSON.stringify(request.questions, null, 2)}`

  const response = await fetchFn('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://agentic-economy.local',
      'X-Title': 'Agentic Economy Decision Engine (Fallback)',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    throw new Error(`secondary_llm_error_${response.status}:${errorBody.slice(0, 100)}`)
  }

  const data = (await response.json()) as {
    choices: readonly { message: { content: string } }[]
    usage?: { prompt_tokens?: number; completion_tokens?: number }
  }

  const content = data.choices[0]?.message.content ?? '{}'
  const parsed = JSON.parse(content) as { answers?: Record<string, Record<string, unknown>> }
  const rawAnswers = parsed.answers ?? {}

  const answers: Record<string, JevAnswer> = {}

  for (const [qKey, qVal] of Object.entries(request.questions)) {
    const raw = rawAnswers[qKey] ?? {}
    if (qVal.type === 'choice') {
      const choice = typeof raw.choice === 'string' ? raw.choice : Object.keys(qVal.criteria)[0] ?? 'unsupported'
      const confidence = typeof raw.confidence === 'number' ? Math.min(Math.max(raw.confidence, 0), 1) : 0.75
      const ans: JevChoiceAnswer = {
        type: 'choice',
        choice,
        probabilities: { [choice]: confidence },
        confidence,
      }
      answers[qKey] = ans
    } else if (qVal.type === 'noul') {
      const noul = typeof raw.noul === 'number' ? Math.min(Math.max(raw.noul, 0), 1) : 0.5
      const ans: JevNoulAnswer = {
        type: 'noul',
        noul,
      }
      answers[qKey] = ans
    } else if (qVal.type === 'score') {
      const score = typeof raw.score === 'number' ? raw.score : 0
      const confidence = typeof raw.confidence === 'number' ? raw.confidence : 0.7
      const ans: JevScoreAnswer = {
        type: 'score',
        score,
        legend: {},
        probabilities: { [String(score)]: confidence },
        confidence,
      }
      answers[qKey] = ans
    }
  }

  const inputTokens = data.usage?.prompt_tokens ?? 300
  const outputTokens = data.usage?.completion_tokens ?? 50
  const durationMs = Date.now() - startedAt

  return {
    tier: 'secondary_llm_adapter',
    model,
    answers,
    usage: {
      inputTokens,
      outputTokens,
      estimatedCostAud: `A$${((inputTokens * 0.15 + outputTokens * 0.60) / 1_000_000).toFixed(6)}`,
    },
    durationMs,
    attemptedTiers: ['secondary_llm_adapter'],
  }
}

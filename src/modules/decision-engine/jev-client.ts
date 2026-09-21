import { APIConnectionError, APIError, APITimeoutError, APIUserAbortError, TypeSafeClient, type EntryType, type RequestOptions } from '@typesafe-ai/sdk'
import { JevUnavailableError } from './contracts'
import { observedInferenceModel, observedInferenceUsage, recordInferenceAttempt } from './inference-observation'
import type {
  DecisionGatewayOptions,
  DecisionGatewayRequest,
  DecisionGatewayResponse,
  JevAnswer,
} from './contracts'

const DEFAULT_JEV_MODEL = '~typesafe/jev-latest'
const DEFAULT_JEV_TIMEOUT_MS = 1500

/**
 * Requires valid SDK questions and positive timing/retry configuration.
 * Ensures consumed answers are validated, or a classified operational failure.
 * Discovery has one attempt and a total <= 1,500 ms budget, including body delivery.
 * Invariant: SDK owns I/O; no payload/credentials escape in operational errors.
 * On programmer/configuration defects: throw; never manufacture fallback answers.
 */
export async function callJevSystemOne(
  request: DecisionGatewayRequest,
  options: DecisionGatewayOptions = {},
): Promise<DecisionGatewayResponse> {
  const startedAt = Date.now()
  const configuredTimeout = options.timeoutMs ?? DEFAULT_JEV_TIMEOUT_MS
  if (!Number.isFinite(configuredTimeout) || configuredTimeout <= 0
    || (options.deadlineAt !== undefined && !Number.isFinite(options.deadlineAt))
    || (options.maxRetries !== undefined && (!Number.isInteger(options.maxRetries) || options.maxRetries < 0))) {
    throw new RangeError('Invalid Jev timing or retry configuration')
  }
  if (options.signal?.aborted) throw new JevUnavailableError('cancelled')
  if (options.disableJev === true) throw new JevUnavailableError('disabled')
  const discovery = options.purpose === 'discovery'
  if (discovery && process.env.AE_JEV_DISCOVERY_ENABLED === 'false') throw new JevUnavailableError('disabled')
  if (discovery && JSON.stringify(request.state).length > 32_000) throw new JevUnavailableError('evidence_too_large')
  const deadlineAt = Math.min(
    options.deadlineAt ?? Infinity,
    discovery ? startedAt + Math.min(configuredTimeout, DEFAULT_JEV_TIMEOUT_MS) : Infinity,
  )
  const timeout = Math.min(configuredTimeout, deadlineAt - Date.now())
  if (timeout <= 0) throw new JevUnavailableError('timeout')
  const apiKey =
    options.typesafeApiKey ||
    options.openrouterApiKey ||
    process.env.TYPESAFE_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    ''

  if (apiKey.length === 0) {
    throw new JevUnavailableError('missing_key')
  }

  const isOpenRouter = apiKey.startsWith('sk-or-') || !apiKey.startsWith('ts-')
  const defaultBaseURL = isOpenRouter
    ? 'https://openrouter.ai/api/alpha'
    : 'https://api.typesafe.ai'
  const baseURL = options.baseURL ?? process.env.TYPESAFE_BASE_URL ?? defaultBaseURL
  const defaultModel = options.jevModel ?? (isOpenRouter ? DEFAULT_JEV_MODEL : 'jev-latest')
  if (!URL.canParse(baseURL)) throw new TypeError('Invalid Jev base URL')
  const baseFetch = options.fetchImpl ?? fetch

  // Adapt fetch to map OpenRouter alpha endpoint and append referral metadata
  let outboundAttempts = 0
  const adaptedFetch: typeof fetch = async (url, init) => {
    let resolvedUrl = url.toString()
    const isOpenRouterHost = new URL(resolvedUrl).hostname === 'openrouter.ai'
    if (isOpenRouterHost && resolvedUrl.endsWith('/v1/systemone')) {
      resolvedUrl = resolvedUrl.replace('/v1/systemone', '/decisions')
    }
    const headers = new Headers(init?.headers)
    if (isOpenRouterHost) {
      headers.set('HTTP-Referer', 'https://agentic-economy.local')
      headers.set('X-Title', 'Agentic Economy Decision Engine')
    }
    outboundAttempts += 1
    return baseFetch(resolvedUrl, { ...init, headers })
  }

  const client = new TypeSafeClient({
    apiKey,
    baseURL,
    defaultModel,
    timeout,
    logLevel: 'off',
    fetch: adaptedFetch,
    retry: { maxRetries: discovery ? 0 : options.maxRetries ?? 1 },
  })

  const remainingMs = deadlineAt - Date.now()
  if (remainingMs <= 0) throw new JevUnavailableError('timeout')
  const deadlineSignal = Number.isFinite(remainingMs) ? AbortSignal.timeout(Math.ceil(remainingMs)) : undefined
  const signals = [options.signal, deadlineSignal].filter((signal): signal is AbortSignal => signal !== undefined)
  const requestOptions: RequestOptions = {
    timeout: Math.min(timeout, remainingMs),
    retry: { maxRetries: discovery ? 0 : options.maxRetries ?? 1 },
    ...(signals.length === 0 ? {} : { signal: AbortSignal.any(signals) }),
  }
  // SDK owns transport, body buffering, timeout cleanup and retries. Only its
  // operational errors become unavailable; configuration/programming errors escape.
  try {
    const result = await client.systemOne({
      state: request.state as EntryType,
      questions: request.questions,
      model: defaultModel,
    }, requestOptions)
    if (options.signal?.aborted) throw new JevUnavailableError('cancelled')
    if (Date.now() >= deadlineAt) throw new JevUnavailableError('timeout')
    if (!validAnswers(result?.answers, request)) throw new JevUnavailableError('invalid_response')
    // A successful retry does not disclose the failed attempt's consumption.
    const usage = outboundAttempts > 1 ? observedInferenceUsage(null, null)
      : observedInferenceUsage(result.usage?.input_tokens, result.usage?.output_tokens)
    const durationMs = Date.now() - startedAt
    const { model, modelSource } = observedInferenceModel(result.model, defaultModel)
    recordInferenceAttempt({ tier: 'jev_system_one', purpose: options.purpose, model, modelSource, outcome: 'completed', outboundAttempts, durationMs, usage })
    return { tier: 'jev_system_one', model, answers: result.answers as Record<string, JevAnswer>, usage, durationMs, attemptedTiers: ['jev_system_one'] }
  } catch (cause) {
    const failure = classifyFailure(cause, options.signal)
    recordInferenceAttempt({
      tier: 'jev_system_one', purpose: options.purpose, model: defaultModel, modelSource: 'requested', outcome: 'failed',
      reason: failure instanceof JevUnavailableError ? failure.reason : failure instanceof TypeError ? 'invalid_request' : 'unexpected',
      outboundAttempts, durationMs: Date.now() - startedAt, usage: observedInferenceUsage(null, null),
    })
    throw failure
  }
}

function classifyFailure(cause: unknown, signal: AbortSignal | undefined): unknown {
  if (cause instanceof APIUserAbortError) return new JevUnavailableError(signal?.aborted ? 'cancelled' : 'timeout')
  if (cause instanceof APITimeoutError) return new JevUnavailableError('timeout')
  if (cause instanceof APIConnectionError) return new JevUnavailableError('connection')
  if (cause instanceof APIError) {
    if (cause.status === 400 || cause.status === 422) return new TypeError('Jev request rejected as invalid', { cause: { status: cause.status } })
    return new JevUnavailableError(cause.status === 429 ? 'rate_limited'
      : cause.status === 401 || cause.status === 403 ? 'authentication' : 'service_unavailable')
  }
  return cause
}

function validAnswers(answers: unknown, request: DecisionGatewayRequest): boolean {
  if (typeof answers !== 'object' || answers === null || Array.isArray(answers)) return false
  const values = answers as Record<string, JevAnswer>
  const probability = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1
  return Object.entries(request.questions).every(([key, question]) => {
    const answer = values[key]
    if (!Object.hasOwn(values, key) || answer?.type !== question.type) return false
    if (answer.type === 'noul') return probability(answer.noul)
    if (!probability(answer.confidence)) return false
    if (answer.type === 'choice' && question.type === 'choice') return Object.hasOwn(question.criteria, answer.choice)
    return answer.type === 'score' && question.type === 'score'
      && Number.isFinite(answer.score) && answer.score >= 0 && answer.score <= question.criteria.length - 1
  })
}

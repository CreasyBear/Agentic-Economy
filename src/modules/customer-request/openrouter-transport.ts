import type { CustomerRequestInterpretationTransport } from './interpreter'
import type { CustomerRequestSemanticInterpretationTransport } from './semantic-interpreter'

type OpenRouterConfiguration = Readonly<{
  apiKey: string
  model: string
  siteUrl?: string
  attemptTimeoutMs?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
  maximumCompletionTokens?: number
}>

const MAX_OPENROUTER_REQUEST_BYTES = 1_000_000
const TRANSIENT_PROVIDER_STATUSES = new Set([408, 429, 500, 502, 503, 504])
const MAX_PROVIDER_ATTEMPTS = 2
const DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS = 20_000

export function createOpenRouterCustomerRequestTransport(config: OpenRouterConfiguration): CustomerRequestInterpretationTransport {
  return createOpenRouterJsonTransport(config)
}

export function createOpenRouterCustomerRequestSemanticTransport(config: OpenRouterConfiguration): CustomerRequestSemanticInterpretationTransport {
  return createOpenRouterJsonTransport(config)
}

function createOpenRouterJsonTransport<TPayload>(config: OpenRouterConfiguration): Readonly<{
  generateJson: (input: Readonly<{
    systemInstruction: string
    payload: TPayload
    signal: AbortSignal
    responseSchema?: Readonly<Record<string, unknown>>
  }>) => Promise<Readonly<{ content: string }>>
}> {
  if (!config.apiKey.trim() || !config.model.trim()) throw new Error('customer_request_interpreter_configuration_invalid')
  if (config.attemptTimeoutMs !== undefined
    && (!Number.isSafeInteger(config.attemptTimeoutMs) || config.attemptTimeoutMs <= 0)) {
    throw new Error('customer_request_interpreter_configuration_invalid')
  }
  if (config.maximumCompletionTokens !== undefined
    && (!Number.isSafeInteger(config.maximumCompletionTokens) || config.maximumCompletionTokens <= 0)) {
    throw new Error('customer_request_interpreter_configuration_invalid')
  }
  const attemptTimeoutMs = config.attemptTimeoutMs ?? DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS
  return Object.freeze({
    generateJson: async ({ systemInstruction, payload, signal, responseSchema }) => {
      const requestBody = JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: responseSchema === undefined
          ? { type: 'json_object' }
          : { type: 'json_schema', json_schema: responseSchema },
        ...(config.reasoningEffort === undefined
          ? { temperature: 0 }
          : { reasoning: { effort: config.reasoningEffort, exclude: true } }),
        ...(config.maximumCompletionTokens === undefined
          ? {}
          : { max_completion_tokens: config.maximumCompletionTokens }),
      })
      if (new TextEncoder().encode(requestBody).byteLength > MAX_OPENROUTER_REQUEST_BYTES) {
        throw new Error('customer_request_interpretation_request_too_large')
      }
      for (let attempt = 1; attempt <= MAX_PROVIDER_ATTEMPTS; attempt += 1) {
        const attemptController = new AbortController()
        const propagateParentAbort = () => attemptController.abort(signal.reason)
        if (signal.aborted) propagateParentAbort()
        else signal.addEventListener('abort', propagateParentAbort, { once: true })
        const attemptTimeout = setTimeout(() => {
          attemptController.abort(new Error('customer_request_interpretation_provider_timeout'))
        }, attemptTimeoutMs)
        let response: Response
        try {
          response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': config.siteUrl ?? 'https://agentic-economy-phi.vercel.app',
              'X-Title': 'Agentic Economy',
            },
            body: requestBody,
            signal: attemptController.signal,
          })
        } catch (error) {
          if (signal.aborted) throw error
          if (!attemptController.signal.aborted || attempt === MAX_PROVIDER_ATTEMPTS) {
            throw attemptController.signal.reason instanceof Error
              ? attemptController.signal.reason
              : error
          }
          continue
        } finally {
          clearTimeout(attemptTimeout)
          signal.removeEventListener('abort', propagateParentAbort)
        }
        if (!response.ok) {
          if (attempt < MAX_PROVIDER_ATTEMPTS && !signal.aborted
            && TRANSIENT_PROVIDER_STATUSES.has(response.status)) continue
          throw new Error(`customer_request_interpretation_provider_${response.status}`)
        }
        const body: unknown = await response.json()
        const content = extractContent(body)
        if (content === undefined) throw new Error('customer_request_interpretation_provider_invalid')
        return { content }
      }
      throw new Error('customer_request_interpretation_provider_unavailable')
    },
  })
}

function extractContent(value: unknown): string | undefined {
  if (!isRecord(value) || !Array.isArray(value.choices)) return undefined
  const first: unknown = value.choices[0]
  if (!isRecord(first) || !isRecord(first.message)) return undefined
  return typeof first.message.content === 'string' ? first.message.content : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

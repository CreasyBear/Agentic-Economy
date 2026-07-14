import type { CustomerRequestInterpretationTransport } from './interpreter'
import type { CustomerRequestSemanticInterpretationTransport } from './semantic-interpreter'

type OpenRouterConfiguration = Readonly<{
  apiKey: string
  model: string
  siteUrl?: string
}>

const MAX_OPENROUTER_REQUEST_BYTES = 1_000_000

export function createOpenRouterCustomerRequestTransport(config: OpenRouterConfiguration): CustomerRequestInterpretationTransport {
  return createOpenRouterJsonTransport(config)
}

export function createOpenRouterCustomerRequestSemanticTransport(config: OpenRouterConfiguration): CustomerRequestSemanticInterpretationTransport {
  return createOpenRouterJsonTransport(config)
}

function createOpenRouterJsonTransport<TPayload>(config: OpenRouterConfiguration): Readonly<{
  generateJson: (input: Readonly<{ systemInstruction: string; payload: TPayload; signal: AbortSignal }>) => Promise<Readonly<{ content: string }>>
}> {
  if (!config.apiKey.trim() || !config.model.trim()) throw new Error('customer_request_interpreter_configuration_invalid')
  return Object.freeze({
    generateJson: async ({ systemInstruction, payload, signal }) => {
      const requestBody = JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: JSON.stringify(payload) },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      })
      if (new TextEncoder().encode(requestBody).byteLength > MAX_OPENROUTER_REQUEST_BYTES) {
        throw new Error('customer_request_interpretation_request_too_large')
      }
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': config.siteUrl ?? 'https://agentic-economy-phi.vercel.app',
          'X-Title': 'Agentic Economy',
        },
        body: requestBody,
        signal,
      })
      if (!response.ok) throw new Error(`customer_request_interpretation_provider_${response.status}`)
      const body: unknown = await response.json()
      const content = extractContent(body)
      if (content === undefined) throw new Error('customer_request_interpretation_provider_invalid')
      return { content }
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

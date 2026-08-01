import { APICallError, generateText, NoContentGeneratedError, RetryError } from 'ai'

import {
  openRouterModel,
  openRouterProvider,
  type OpenRouterGatewayConfig,
} from '@/modules/model-gateway/public'

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
  const gatewayConfig: OpenRouterGatewayConfig = {
    apiKey: config.apiKey,
    model: config.model,
    ...(config.siteUrl === undefined ? {} : { siteUrl: config.siteUrl }),
  }
  return Object.freeze({
    generateJson: async ({ systemInstruction, payload, signal, responseSchema }) => {
      const serializedPayload = JSON.stringify(payload) ?? ''
      const serializedInput = JSON.stringify({ systemInstruction, payload: serializedPayload })
      if (new TextEncoder().encode(serializedInput).byteLength > MAX_OPENROUTER_REQUEST_BYTES) {
        throw new Error('customer_request_interpretation_request_too_large')
      }
      const attemptTimeoutSignal = AbortSignal.timeout(attemptTimeoutMs)
      const abortSignal = AbortSignal.any([signal, attemptTimeoutSignal])
      const model = openRouterModel(gatewayConfig, config.model, {
        ...(responseSchema === undefined
          ? { jsonObjectResponse: true }
          : { jsonSchemaResponse: responseSchema }),
        ...(config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort }),
      })
      const result = await generateText({
        ...(config.maximumCompletionTokens === undefined
          ? {}
          : { maxOutputTokens: config.maximumCompletionTokens }),
        maxRetries: 1,
        model,
        ...(config.reasoningEffort === undefined ? { temperature: 0 } : {}),
        system: systemInstruction,
        prompt: serializedPayload,
        abortSignal,
      }).catch((error: unknown) => {
        if (signal.aborted) throw error
        if (attemptTimeoutSignal.aborted
          || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
          throw new Error('customer_request_interpretation_provider_timeout')
        }
        const providerError = APICallError.isInstance(error)
          ? error
          : RetryError.isInstance(error) && APICallError.isInstance(error.lastError)
            ? error.lastError
            : undefined
        // A 200 that the SDK could not turn into content is an unusable answer,
        // not a transport failure, so it joins the empty-completion path.
        if (
          NoContentGeneratedError.isInstance(error)
          || (RetryError.isInstance(error) && NoContentGeneratedError.isInstance(error.lastError))
          || providerError?.statusCode === 200
        ) {
          throw invalidProviderResponse(config.model, undefined)
        }
        if (providerError?.statusCode !== undefined) {
          throw new Error(`customer_request_interpretation_provider_${providerError.statusCode}`)
        }
        throw new Error('customer_request_interpretation_provider_unavailable')
      })
      if (result.text.length === 0) {
        throw invalidProviderResponse(config.model, result.finishReason)
      }
      return { content: result.text }
    },
  })
}

/**
 * Surfaces WHY the provider produced nothing usable (commonly `length`, when
 * the completion budget is exhausted) without ever logging model output.
 */
function invalidProviderResponse(model: string, finishReason: string | undefined): Error {
  console.error(
    'customer_request_interpretation_provider_invalid',
    model,
    finishReason ?? 'unknown_finish_reason',
  )
  return new Error('customer_request_interpretation_provider_invalid')
}

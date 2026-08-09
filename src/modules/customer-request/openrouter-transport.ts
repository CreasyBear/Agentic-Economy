import {
  APICallError,
  generateText,
  NoContentGeneratedError,
  NoObjectGeneratedError,
  Output,
  RetryError,
} from 'ai'
import type { FlexibleSchema } from 'ai'

import {
  openRouterModel,
  type OpenRouterGatewayConfig,
} from '@/modules/model-gateway/public'

import type {
  CustomerRequestSemanticInterpretationTransport,
  CustomerRequestSemanticInterpreterPayload,
  CustomerRequestSemanticModelProposal,
} from './semantic-interpreter'

type OpenRouterConfiguration = Readonly<{
  apiKey: string
  model: string
  siteUrl?: string
  attemptTimeoutMs?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
  maximumCompletionTokens?: number
  maxRetries?: number
}>

const MAX_OPENROUTER_REQUEST_BYTES = 1_000_000
const DEFAULT_PROVIDER_ATTEMPT_TIMEOUT_MS = 20_000

export function createOpenRouterCustomerRequestSemanticTransport(config: OpenRouterConfiguration): CustomerRequestSemanticInterpretationTransport {
  return createOpenRouterJsonTransport(config)
}

export type OpenRouterJsonTransport = Readonly<{
  generateJson: <TPayload, TOutput>(input: Readonly<{
    systemInstruction: string
    payload: TPayload
    signal: AbortSignal
    responseSchema: FlexibleSchema<TOutput>
  }>) => Promise<TOutput>
}>

export function createOpenRouterJsonTransport(config: OpenRouterConfiguration): OpenRouterJsonTransport {
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
      const model = openRouterModel(gatewayConfig, config.model, {
        structuredOutputs: true,
        ...(config.reasoningEffort === undefined ? {} : { reasoningEffort: config.reasoningEffort }),
      })
      const result = await generateText({
        ...(config.maximumCompletionTokens === undefined
          ? {}
          : { maxOutputTokens: config.maximumCompletionTokens }),
        ...(config.maxRetries === undefined ? { maxRetries: 1 } : { maxRetries: config.maxRetries }),
        model,
        ...(config.reasoningEffort === undefined ? { temperature: 0 } : {}),
        instructions: systemInstruction,
        prompt: serializedPayload,
        output: Output.object({ schema: responseSchema, name: 'customer_request_semantic_proposal' }),
        timeout: attemptTimeoutMs,
        abortSignal: signal,
      }).catch((error: unknown) => {
        if (signal.aborted) throw error
        if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
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
          || (NoObjectGeneratedError.isInstance(error)
            && (error.text === undefined || error.text.length === 0))
          || (RetryError.isInstance(error) && NoContentGeneratedError.isInstance(error.lastError))
          || providerError?.statusCode === 200
        ) {
          throw invalidProviderResponse()
        }
        if (NoObjectGeneratedError.isInstance(error)) throw error
        if (providerError?.statusCode !== undefined) {
          throw new Error(`customer_request_interpretation_provider_${providerError.statusCode}`)
        }
        throw new Error('customer_request_interpretation_provider_unavailable')
      })
      if (result.text.length === 0 || result.finishReason !== 'stop') {
        throw invalidProviderResponse()
      }
      return result.output
    },
  })
}

/**
 * Surfaces WHY the provider produced nothing usable (commonly `length`, when
 * the completion budget is exhausted) without ever logging model output.
 */
function invalidProviderResponse(): Error {
  // Expected selection-decline, not a system fault: a model whose completion budget is exhausted
  // (`length`) or which returns no usable JSON on an ordinary query is normal and the composite
  // interpreter degrades gracefully. Return the typed error silently — logging here would alarm the
  // operator channel (CLI/stderr) on every routine selection-decline on the hot path. Genuine
  // provider/auth outages remain visible to operators via interpreter.ts (provider_4xx ->
  // console.error). The return value is what matters; the message identifies the cause.
  return new Error('customer_request_interpretation_provider_invalid')
}

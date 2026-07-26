import {
  createJsonCustomerRequestSemanticInterpreter,
  type CustomerRequestSemanticInterpreter,
} from '@/modules/customer-request/semantic-interpreter'
import { createOpenRouterCustomerRequestSemanticTransport } from '@/modules/customer-request/openrouter-transport'

import { createDeterministicCustomerRequestInterpreter } from './deterministic-interpreter'

export type InterpreterEnvironment = Readonly<{
  openRouterApiKey?: string
  modelName?: string
  siteUrl?: string
  maximumCompletionTokens?: number
  maximumDescriptorBytes: number
}>

/** Reasoning-capable models spend part of the completion budget on reasoning tokens, so a
 *  budget sized for a non-reasoning model truncates them to `finish_reason: length` with a
 *  null message. Keep enough headroom for the proposal plus reasoning. */
const DEFAULT_MAXIMUM_COMPLETION_TOKENS = 4_096

/**
 * Always returns an interpreter. Without a provider key the deterministic one answers alone; with
 * one it leads and the deterministic one catches provider failures, so no billing or availability
 * problem at the model provider can leave a customer with an uninterpretable Request.
 */
export function createConfiguredRequestInterpreter(env: InterpreterEnvironment): CustomerRequestSemanticInterpreter {
  const deterministic = createDeterministicCustomerRequestInterpreter()
  const apiKey = env.openRouterApiKey?.trim()
  if (apiKey === undefined || apiKey.length === 0) return deterministic
  const modelName = env.modelName?.trim() || 'openai/gpt-5-mini'
  const model = createJsonCustomerRequestSemanticInterpreter({
    interpreterId: `openrouter:${modelName}`,
    transport: createOpenRouterCustomerRequestSemanticTransport({
      apiKey, model: modelName,
      ...(env.siteUrl?.trim() ? { siteUrl: env.siteUrl.trim() } : {}),
      reasoningEffort: 'low',
      maximumCompletionTokens: env.maximumCompletionTokens ?? DEFAULT_MAXIMUM_COMPLETION_TOKENS,
    }),
    timeoutMs: 45_000,
    maximumPayloadBytes: env.maximumDescriptorBytes,
    maximumResponseBytes: 64_000,
  })
  return Object.freeze({
    interpreterId: `${model.interpreterId}+fallback:${deterministic.interpreterId}`,
    propose: async (input) => {
      try {
        // The JSON interpreter does not name itself on its proposal. Stamping it here keeps a
        // model answer from being recorded under the composite identity, and keeps the fallback's
        // own identity on the answers it produces.
        return { ...await model.propose(input), interpreterId: model.interpreterId }
      } catch (error) {
        // Let the caller retry the model first. A 503 blip that clears on the next attempt must
        // still be answered by the model; only an exhausted attempt is worth degrading for.
        if (input.finalAttempt !== true) throw error
        // Provider refusal, timeout or abort with no attempt left. Report it so the outage stays
        // visible to operators, then answer from the request text rather than refusing.
        console.error('customer_request_semantic_interpretation_fell_back', interpreterFailureCode(error))
        return await deterministic.propose(input)
      }
    },
  })
}

export function interpreterFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown'
  if (error.name === 'AbortError') return 'aborted'
  return error.message.startsWith('customer_request_') ? error.message : 'unknown'
}

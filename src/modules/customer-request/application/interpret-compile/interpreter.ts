import { createJsonCustomerRequestSemanticInterpreter } from '@/modules/customer-request/semantic-interpreter'
import { createOpenRouterCustomerRequestSemanticTransport } from '@/modules/customer-request/openrouter-transport'

export type InterpreterEnvironment = Readonly<{
  openRouterApiKey?: string
  modelName?: string
  siteUrl?: string
  maximumDescriptorBytes: number
}>

export function createConfiguredRequestInterpreter(env: InterpreterEnvironment) {
  const apiKey = env.openRouterApiKey?.trim()
  if (apiKey === undefined || apiKey.length === 0) return undefined
  const modelName = env.modelName?.trim() || 'openai/gpt-5-mini'
  return createJsonCustomerRequestSemanticInterpreter({
    interpreterId: `openrouter:${modelName}`,
    transport: createOpenRouterCustomerRequestSemanticTransport({
      apiKey, model: modelName,
      ...(env.siteUrl?.trim() ? { siteUrl: env.siteUrl.trim() } : {}),
      reasoningEffort: 'low',
      maximumCompletionTokens: 1_024,
    }),
    timeoutMs: 45_000,
    maximumPayloadBytes: env.maximumDescriptorBytes,
    maximumResponseBytes: 64_000,
  })
}

export function interpreterFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown'
  if (error.name === 'AbortError') return 'aborted'
  return error.message.startsWith('customer_request_') ? error.message : 'unknown'
}

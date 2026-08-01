import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from 'ai'

import {
  openRouterCostUsd,
  openRouterModel,
  openRouterGatewayConfig,
} from '@/modules/model-gateway/public'
import { z } from 'zod'

import { ROLE_TIMEOUT_MS } from './budgets'
import { ENGINE_MODELS } from './engine-config'

const MODEL_ATTEMPT_TIMEOUT_MS = 12_000

export type ProposalModelRequest = Readonly<{
  role: 'proposal'
  system: string
  prompt: string
  schema: z.ZodType<unknown>
  signal?: AbortSignal
}>

export type ProposalModelResponse = Readonly<{
  object: unknown
  usage: { inputTokens: number; outputTokens: number }
  costUsd?: number
  latencyMs: number
  modelId: string
}>

export class ProposalTransportError extends Error {
  readonly code: 'timeout' | 'invalid_response' | 'provider_error'

  constructor(code: ProposalTransportError['code'], cause?: unknown) {
    super(`proposal_transport_${code}`, { cause })
    this.name = 'ProposalTransportError'
    this.code = code
  }
}

const MAX_PROPOSAL_OUTPUT_TOKENS = 2_000

export async function requestProposalModel(req: ProposalModelRequest): Promise<ProposalModelResponse> {
  const startedAt = performance.now()
  const config = ENGINE_MODELS[req.role]
  const gateway = openRouterGatewayConfig()
  const turnTimeoutSignal = AbortSignal.timeout(ROLE_TIMEOUT_MS[req.role])
  const callerSignal = req.signal === undefined
    ? turnTimeoutSignal
    : AbortSignal.any([req.signal, turnTimeoutSignal])

  let lastError: unknown
  for (const [index, model] of config.models.entries()) {
    const attemptTimeoutSignal = AbortSignal.timeout(MODEL_ATTEMPT_TIMEOUT_MS)
    const abortSignal = AbortSignal.any([callerSignal, attemptTimeoutSignal])
    const prompt = model.structuredOutputs
      ? req.prompt
      : `${req.prompt}\n\nRespond with one JSON object matching this schema exactly:\n${JSON.stringify(z.toJSONSchema(req.schema))}`
    try {
      const result = await generateText({
        maxOutputTokens: MAX_PROPOSAL_OUTPUT_TOKENS,
        maxRetries: 0,
        model: openRouterModel(gateway, model.id, {
          structuredOutputs: model.structuredOutputs,
          ...(model.structuredOutputs ? {} : { jsonObjectResponse: true, excludeReasoning: true }),
        }),
        system: req.system,
        prompt,
        ...(model.structuredOutputs ? { output: Output.object({ schema: req.schema }) } : {}),
        abortSignal,
      })
      const object = model.structuredOutputs
        ? result.output
        : req.schema.parse(JSON.parse(result.text))
      const costUsd = openRouterCostUsd(result.providerMetadata)

      return {
        object,
        usage: {
          inputTokens: result.usage.inputTokens ?? 0,
          outputTokens: result.usage.outputTokens ?? 0,
        },
        ...(costUsd === undefined ? {} : { costUsd }),
        latencyMs: performance.now() - startedAt,
        modelId: result.response.modelId ?? model.id,
      }
    } catch (error) {
      lastError = error
      if (turnTimeoutSignal.aborted || req.signal?.aborted) {
        throw new ProposalTransportError('timeout', error)
      }
      if (attemptTimeoutSignal.aborted || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))) {
        if (index < config.models.length - 1) continue
        throw new ProposalTransportError('timeout', error)
      }
      if (index < config.models.length - 1) continue
    }
  }
  if (
    NoObjectGeneratedError.isInstance(lastError)
    || NoOutputGeneratedError.isInstance(lastError)
    || lastError instanceof SyntaxError
    || lastError instanceof z.ZodError
  ) {
    throw new ProposalTransportError('invalid_response', lastError)
  }
  throw new ProposalTransportError('provider_error', lastError)
}

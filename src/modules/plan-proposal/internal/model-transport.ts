import { generateText, NoObjectGeneratedError, NoOutputGeneratedError, Output } from 'ai'

import {
  openRouterCostUsd,
  openRouterModel,
  openRouterGatewayConfig,
} from '@/modules/model-gateway/public'
import { z } from 'zod'

import { ROLE_TIMEOUT_MS } from './budgets'
import { ENGINE_MODELS } from './engine-config'

const MODEL_ATTEMPT_TIMEOUT_MS = 30_000

export type ProposalModelRequest = Readonly<{
  role: 'proposal'
  system: string
  prompt: string
  schema: z.ZodType<unknown>
  signal?: AbortSignal
  /**
   * Semantic gate applied after schema parsing. Returns a rejection reason to
   * refuse the object, or `undefined` to accept it. A refused object is fed
   * back to the same model once with the reason attached before the next
   * fallback model is tried: the AI SDK has no validation-retry seam of its
   * own (`maxRetries` covers transport only, and `repairText` exists solely on
   * the deprecated `generateObject` and only for JSON/type errors).
   */
  accept?: (object: unknown) => string | undefined
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

/**
 * A ceiling, not a reservation: the fast strict-schema model settles around
 * 1.6k output tokens, while a reasoning model spends several thousand more
 * before emitting the map and finished `length` at 4k. There is no
 * continuation API to fall back on — `experimental_continueSteps` was removed
 * in AI SDK 5 and the documented remedy for a `length` finish is a higher
 * output limit.
 */
const MAX_PROPOSAL_OUTPUT_TOKENS = 8_000

class ProposalRejectedError extends Error {
  readonly reason: string

  constructor(reason: string, cause?: unknown) {
    super(`proposal_rejected_${reason}`, { cause })
    this.name = 'ProposalRejectedError'
    this.reason = reason
  }
}

class TruncatedOutputError extends Error {
  constructor(readonly modelId: string) {
    super(`proposal_output_truncated_${modelId}`)
    this.name = 'TruncatedOutputError'
  }
}

function repairInstruction(invalidText: string, reason: string): string {
  return [
    '',
    'Your previous response was rejected. Return a corrected JSON object.',
    `Rejection reason: ${reason}`,
    'Previous rejected response:',
    invalidText,
  ].join('\n')
}


export async function requestProposalModel(req: ProposalModelRequest): Promise<ProposalModelResponse> {
  const startedAt = performance.now()
  const config = ENGINE_MODELS[req.role]
  const gateway = openRouterGatewayConfig()
  const turnTimeoutSignal = AbortSignal.timeout(ROLE_TIMEOUT_MS[req.role])
  const callerSignal = req.signal === undefined
    ? turnTimeoutSignal
    : AbortSignal.any([req.signal, turnTimeoutSignal])

  let lastError: unknown
  let inputTokens = 0
  let outputTokens = 0
  let costUsd = 0
  let costAvailable = true
  const schemaInstruction = `\n\nRespond with one JSON object matching this schema exactly:\n${JSON.stringify(z.toJSONSchema(req.schema))}`

  for (const [index, model] of config.models.entries()) {
    const isLastModel = index === config.models.length - 1
    const basePrompt = model.structuredOutputs ? req.prompt : `${req.prompt}${schemaInstruction}`
    let repair: string | undefined

    // Two passes per model: the initial attempt, then one repair attempt that
    // carries the exact rejection reason back to the same model.
    for (let pass = 0; pass < 2; pass += 1) {
      const attemptTimeoutSignal = AbortSignal.timeout(MODEL_ATTEMPT_TIMEOUT_MS)
      const abortSignal = AbortSignal.any([callerSignal, attemptTimeoutSignal])
      try {
        const result = await generateText({
          maxOutputTokens: MAX_PROPOSAL_OUTPUT_TOKENS,
          maxRetries: 0,
          model: openRouterModel(gateway, model.id, {
            structuredOutputs: model.structuredOutputs,
            ...(model.structuredOutputs ? {} : { jsonObjectResponse: true }),
            ...(model.excludeReasoning ? { excludeReasoning: true } : {}),
          }),
          system: req.system,
          prompt: repair === undefined ? basePrompt : `${basePrompt}${repair}`,
          ...(model.structuredOutputs ? { output: Output.object({ schema: req.schema }) } : {}),
          abortSignal,
        })
        inputTokens += result.usage.inputTokens ?? 0
        outputTokens += result.usage.outputTokens ?? 0
        const attemptCostUsd = openRouterCostUsd(result.providerMetadata)
        if (attemptCostUsd === undefined) {
          costAvailable = false
        } else {
          costUsd += attemptCostUsd
        }
        const modelId = result.response.modelId ?? model.id
        // A `length` finish means the object was cut off mid-structure, so any
        // parse failure below would misreport a truncation as a bad shape.
        if (result.finishReason === 'length') throw new TruncatedOutputError(modelId)

        const object = model.structuredOutputs
          ? result.output
          : req.schema.parse(JSON.parse(result.text))
        let rejection: string | undefined
        try {
          rejection = req.accept?.(object)
        } catch (error) {
          // A gate that throws is still a refusal of this object, not a
          // transport fault: keep the fallback ladder intact.
          rejection = 'proposal_gate_failed'
          lastError = error
        }
        if (rejection !== undefined) {
          repair = repairInstruction(
            model.structuredOutputs ? JSON.stringify(object) : result.text,
            rejection,
          )
          throw new ProposalRejectedError(rejection)
        }

        return {
          object,
          usage: { inputTokens, outputTokens },
          ...(costAvailable ? { costUsd } : {}),
          latencyMs: performance.now() - startedAt,
          modelId,
        }
      } catch (error) {
        lastError = error
        if (turnTimeoutSignal.aborted || req.signal?.aborted) {
          throw new ProposalTransportError('timeout', error)
        }
        const timedOut = attemptTimeoutSignal.aborted
          || (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError'))
        if (timedOut) {
          if (isLastModel) throw new ProposalTransportError('timeout', error)
          break
        }
        // Only a semantic rejection is worth re-asking the same model; every
        // other failure moves straight to the next fallback.
        if (!(error instanceof ProposalRejectedError)) break
      }
    }
  }
  if (
    NoObjectGeneratedError.isInstance(lastError)
    || NoOutputGeneratedError.isInstance(lastError)
    || lastError instanceof SyntaxError
    || lastError instanceof z.ZodError
    || lastError instanceof ProposalRejectedError
    || lastError instanceof TruncatedOutputError
  ) {
    throw new ProposalTransportError('invalid_response', lastError)
  }
  throw new ProposalTransportError('provider_error', lastError)
}

import type { LanguageModel, StepResult, ToolSet } from 'ai'
import { boundaryCauseKind, degradeBackend } from '@/lib/observability/degrade-backend'
import { isChatModelCostIdentifier, isChatModelCostModel, parseModelCostUsd, type ChatModelCostBinding } from '@/modules/chat/model-cost'
import { openRouterCostUsd } from '@/modules/model-gateway/public'
import { internal } from '../../../_generated/api'
import type { ActionCtx } from '../../../_generated/server'

type Purpose = 'initial' | 'immediate_explanation' | 'final_answer'
type CostStep = Pick<StepResult<ToolSet>,
  'callId' | 'stepNumber' | 'response' | 'usage' | 'providerMetadata' | 'finishReason'>
function boundedIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && isChatModelCostIdentifier(value) ? value : undefined
}

function boundedModel(value: unknown): string | undefined {
  return typeof value === 'string' && isChatModelCostModel(value) ? value : undefined
}

function providerGenerationId(value: unknown): string | undefined {
  return typeof value === 'string' && /^[a-zA-Z0-9_.:-]{1,200}$/u.test(value) ? value : undefined
}

function requestRef(callId: string | undefined, stepNumber: number): string {
  if (boundedIdentifier(callId) === undefined || !Number.isSafeInteger(stepNumber) || stepNumber < 0) {
    throw new Error('chat_model_request_identity_invalid')
  }
  const reference = `chat-model-request:v1:${callId}:${stepNumber}`
  if (boundedIdentifier(reference) === undefined) throw new Error('chat_model_request_identity_invalid')
  return reference
}

function tokenCount(value: number | undefined): number | undefined {
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

/**
 * Requires a matching durable Turn and SDK generation/step identity before I/O.
 * Ensures an awaited start from prepareStep; notification callbacks cannot fence I/O.
 * Invariant: reported zero is priced, absent/invalid cost is unknown, and only
 * the provider's response header establishes a generation ID.
 * On completion-write failure: retain the pending record and the usable answer.
 * Legacy generations without a Turn deliberately remain outside this report.
 */
export function chatModelCostHooks(
  ctx: Pick<ActionCtx, 'runMutation'>,
  binding: ChatModelCostBinding | undefined,
  purpose: Purpose,
) {
  let callId: string | undefined
  const requestedModels = new Map<number, string>()
  return {
    onStart(event: Readonly<{ callId: string }>): void {
      callId = event.callId
      requestedModels.clear()
    },
    async prepareStep(options: Readonly<{ stepNumber: number; model: LanguageModel }>): Promise<undefined> {
      if (binding === undefined) return
      const reference = requestRef(callId, options.stepNumber)
      const requestedModel = boundedModel(typeof options.model === 'string' ? options.model : options.model.modelId)
      if (requestedModel === undefined) throw new Error('chat_model_request_model_invalid')
      await ctx.runMutation(internal.chatModelCost.begin, {
        ...binding, requestRef: reference, source: 'openrouter', purpose, requestedModel,
      })
      requestedModels.set(options.stepNumber, requestedModel)
      return undefined
    },
    async onStepEnd(step: CostStep): Promise<void> {
      if (binding === undefined) return
      try {
        if (step.callId !== callId) throw new Error('chat_model_request_identity_invalid')
        const reference = requestRef(step.callId, step.stepNumber)
        // AI SDK initializes response.modelId from the requested model and
        // keeps that fallback when the provider omits model metadata. Only a
        // differing value proves a reported model; stats may later enrich it.
        const responseModel = boundedModel(step.response.modelId)
        const requestedModel = requestedModels.get(step.stepNumber)
        const model = responseModel !== requestedModel && requestedModel !== undefined ? responseModel : undefined
        const inputTokens = tokenCount(step.usage.inputTokens)
        const outputTokens = tokenCount(step.usage.outputTokens)
        const generationHeader = Object.entries(step.response.headers ?? {})
          .find(([name]) => name.toLowerCase() === 'x-generation-id')?.[1]
        const generationId = providerGenerationId(generationHeader)
        const amountUsd = parseModelCostUsd(openRouterCostUsd(step.providerMetadata))
        await ctx.runMutation(internal.chatModelCost.observe, {
          ...binding, requestRef: reference,
          ...(model === undefined ? {} : { model }),
          ...(inputTokens === undefined ? {} : { inputTokens }),
          ...(outputTokens === undefined ? {} : { outputTokens }),
          ...(generationId === undefined ? {} : { providerGenerationId: generationId }),
          accounting: amountUsd === undefined
            ? { status: 'unpriced', reason: step.finishReason === 'error' ? 'request_failed' : 'missing_usage' }
            : { status: 'priced', amountUsd, source: 'inline' },
        })
      } catch (cause) {
        degradeBackend(boundaryCauseKind(cause), undefined, {
          site: 'chat.modelCost.observe', reason: 'source_unavailable',
        })
      }
    },
  }
}

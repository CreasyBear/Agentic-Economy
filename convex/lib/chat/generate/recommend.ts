// Chat picks only among offered callable Tools; like procure, Jev cannot authorize a purchase.
import { degradeBackend } from '@/lib/observability/degrade-backend'
import { jevDecisionOptions } from '../../decision/jevDecisionOptions'
import { MIN_MODEL_CONFIDENCE, routeSelection } from '@/modules/capability-execution/route-selection'
import { jevDiscoveryRecipient } from '@/modules/decision-engine/public'
import type { ToolChoiceSearchOutput } from '@/modules/registry/tool-choice-contracts'
import type { ChatModelCostBinding } from '@/modules/chat/model-cost'
import type { ActionCtx } from '../../../_generated/server'
import { createJevModelCostObserver } from '../turns/jevModelCost'

type RecommendToolInput = Readonly<{
  catalogue: ToolChoiceSearchOutput
  promptText: string
  ownerId: string
  threadId: string
  promptMessageId: string
  signal?: AbortSignal
  modelCostBinding?: ChatModelCostBinding
}>
type RecommendationDecision = Readonly<{
  kind: 'chat_recommend'
  accountRef: string
  correlationId: string
  threadId: string
  promptMessageId: string
  offered: readonly Readonly<{ toolRef: string; rank: number; score: number }>[]
  tier: 'jev_system_one'
  fit: readonly Readonly<{ toolRef: string; noul?: number }>[]
  latencyMs: number
  pickedToolRef?: string
  modelConfidence?: number
}>
type RecommendationResult = Readonly<{
  recommendation: Readonly<{ toolRef: string; by: string }> | null
  decision: RecommendationDecision | null
}>

function withinSignal<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  const { promise, reject } = Promise.withResolvers<never>()
  const abort = () => reject(signal.reason ?? new Error('chat_recommend_deadline_exceeded'))
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  return Promise.race([work, promise]).finally(() => signal.removeEventListener('abort', abort))
}

export async function recommendTool(input: RecommendToolInput, ctx?: Pick<ActionCtx, 'runMutation'>): Promise<RecommendationResult> {
  if (input.catalogue.kind !== 'match' && input.catalogue.kind !== 'scoped') {
    return { recommendation: null, decision: null }
  }
  const candidates = input.catalogue.results
    .filter(result => result.access === 'ae_callable' && result.toolRef !== undefined)
    .slice(0, 8)
    .flatMap(result => result.toolRef === undefined ? [] : [{
      toolRef: result.toolRef,
      name: result.title,
      description: result.summary,
    }])
  if (candidates.length === 0) return { recommendation: null, decision: null }

  try {
    if (input.modelCostBinding !== undefined && ctx === undefined) throw new Error('jev_cost_context_required')
    const baseOptions = {
      ...jevDecisionOptions(1_000),
      purpose: 'discovery' as const,
      ...(input.modelCostBinding === undefined || ctx === undefined ? {} : {
        inferenceObserver: createJevModelCostObserver(ctx, input.modelCostBinding, 'discovery_recommendation'),
      }),
    }
    const options = input.signal === undefined || baseOptions.signal === undefined
      ? baseOptions
      : { ...baseOptions, signal: AbortSignal.any([baseOptions.signal, input.signal]) }
    const recipient = jevDiscoveryRecipient(options)
    if (recipient === undefined) return { recommendation: null, decision: null }

    const request = routeSelection(input.promptText, candidates, options)
    const routing = options.signal === undefined ? await request : await withinSignal(request, options.signal)
    const selectedCandidate = routing.tool === null
      ? undefined
      : candidates.find(candidate => candidate.toolRef === routing.tool?.toolRef)
    const confidence = routing.modelConfidence
    const observedConfidence = typeof confidence === 'number'
      && Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : undefined
    const shown = routing.tier === 'jev_system_one'
      && selectedCandidate !== undefined
      && observedConfidence !== undefined
      && observedConfidence >= MIN_MODEL_CONFIDENCE

    const decision: RecommendationDecision | null = routing.tier === 'jev_system_one'
      ? {
        kind: 'chat_recommend',
        accountRef: input.ownerId,
        correlationId: `${input.threadId}:${input.promptMessageId}`,
        threadId: input.threadId,
        promptMessageId: input.promptMessageId,
        offered: candidates.map((candidate, rank) => ({ toolRef: candidate.toolRef, rank, score: 0 })),
        tier: routing.tier,
        fit: routing.fit.map(fit => ({
          toolRef: fit.toolRef,
          ...(fit.noul === null ? {} : { noul: fit.noul }),
        })),
        latencyMs: routing.latencyMs,
        ...(selectedCandidate === undefined ? {} : { pickedToolRef: selectedCandidate.toolRef }),
        ...(observedConfidence === undefined ? {} : { modelConfidence: observedConfidence }),
      }
      : null

    return {
      recommendation: !shown || selectedCandidate === undefined
        ? null
        : {
          toolRef: selectedCandidate.toolRef,
          by: `${recipient.label} (${recipient.host})`.slice(0, 80),
        },
      decision,
    }
  } catch (cause) {
    degradeBackend(cause, null, { site: 'chatRecommend', reason: 'source_unavailable' })
    return { recommendation: null, decision: null }
  }
}

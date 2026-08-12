import {
  answerOperationCandidateSetDigest,
  buildAgentJsonUrl,
  buildBoundaryNextStep,
  buildBoundaryOneLine,
  buildBoundarySummary,
  buildSafetyRefusalNextStep,
  buildSafetyRefusalOneLine,
  buildSafetyRefusalSummary,
  buildUnsupportedNextStep,
  buildUnsupportedOneLine,
  buildUnsupportedSummary,
} from '@/modules/answer/public'

import { finalizeAnswerTurnSnapshot } from '../answer-turn-safety'
import {
  DEFAULT_TURN_PROVIDER_LIMIT,
  rejectBlockedSnapshot,
  reindexProviders,
  withFollowUpLayout,
  type TurnPath,
  type TurnPathContext,
  type TurnPathResult,
} from './types'

type BoundaryKind = 'boundary_explain' | 'unsupported' | 'web_search_unavailable' | 'safety_refusal'

export const boundaryTurnPath: TurnPath<[BoundaryKind]> = {
  id: 'boundary_explain',
  async run(ctx, kind) {
    return streamBoundaryTurn(ctx, kind)
  },
}

async function streamBoundaryTurn(
  ctx: TurnPathContext,
  kind: BoundaryKind,
): Promise<TurnPathResult> {
  const isWebSearchUnavailable = kind === 'web_search_unavailable'
  const isSafetyRefusal = kind === 'safety_refusal'
  const providers = isWebSearchUnavailable || isSafetyRefusal ? [] : reindexProviders(ctx.priorProviders)
  const oneLine = isWebSearchUnavailable
    ? 'I cannot search the web here because no executable web-search operation is available.'
    : isSafetyRefusal
      ? buildSafetyRefusalOneLine()
      : kind === 'boundary_explain'
        ? buildBoundaryOneLine()
        : buildUnsupportedOneLine()
  const summary = isWebSearchUnavailable
    ? 'No web search was run for this request.'
    : isSafetyRefusal
      ? buildSafetyRefusalSummary()
      : kind === 'boundary_explain'
        ? buildBoundarySummary(providers)
        : buildUnsupportedSummary(providers)
  const nextStep = isWebSearchUnavailable
    ? 'Try again when a web-search operation is available, or ask for a supported live data lookup.'
    : isSafetyRefusal
      ? buildSafetyRefusalNextStep()
      : kind === 'boundary_explain'
        ? buildBoundaryNextStep(providers)
        : buildUnsupportedNextStep(providers)

  if (!isWebSearchUnavailable && !isSafetyRefusal) {

    const routeStartedAt = Date.now()
    ctx.workLog.emit({
      id: 'route.next_step',
      phase: 'route',
      status: 'running',
      title: 'Putting together the answer',
      summary: 'Working out what can happen next.',
      startedAtMs: routeStartedAt,
    })
    ctx.workLog.emit({
      id: 'route.next_step',
      phase: 'route',
      status: 'complete',
      title: 'Putting together the answer',
      summary: 'The business confirms timing, price, and availability, and decides whether it can take on the request.',
      detailRows: [{ label: 'Businesses carried forward', value: String(providers.length) }],
      relatedProviderSlugs: providers.map((provider) => provider.slug),
      startedAtMs: routeStartedAt,
      completedAtMs: Date.now(),
    })
  }
  const operationEvidence = ctx.operationCandidates.length === 0
    ? {}
    : {
        operationCandidates: [...ctx.operationCandidates],
        operationCandidatesDigest: answerOperationCandidateSetDigest(ctx.operationCandidates),
      }

  const snapshot = isWebSearchUnavailable
    ? {
        query: ctx.query,
        oneLine,
        providers,
        summary,
        nextStep,
        agentJsonUrl: '',
        layoutProfile: 'data_answer' as const,
        ...operationEvidence,
      }
    : isSafetyRefusal
      ? {
          query: ctx.query,
          oneLine,
          providers,
          summary,
          nextStep,
          agentJsonUrl: '',
          layoutProfile: 'safety_refusal' as const,
          ...operationEvidence,
        }
      : withFollowUpLayout(
          {
            query: ctx.query,
            oneLine,
            providers,
            summary,
            nextStep,
            agentJsonUrl: buildAgentJsonUrl(ctx.query, DEFAULT_TURN_PROVIDER_LIMIT),
            ...operationEvidence,
          },
          ctx.priorTurnsCount,
          ctx.intent,
        )

  const allowedSlugs = new Set(ctx.priorAllowedSlugs)
  const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot([], allowedSlugs, finalized)
  }
  const assembly = await ctx.emitOrDeferSnapshot(
    finalized.snapshot,
    isWebSearchUnavailable ? 'capability_unavailable' : kind,
    {
      planMode: isWebSearchUnavailable || isSafetyRefusal
        ? isWebSearchUnavailable ? 'answer' : 'boundary'
        : kind === 'boundary_explain' ? 'boundary' : 'unsupported',
    },
  )
  return {
    snapshot: finalized.snapshot,
    toolCalls: [],
    allowedSlugs,
    errorCopyId: undefined,
    gate: finalized.gate,
    ...(assembly === undefined ? {} : { assembly }),
  }
}

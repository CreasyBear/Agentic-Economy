import {
  buildAgentJsonUrl,
  buildBoundaryNextStep,
  buildBoundaryOneLine,
  buildBoundarySummary,
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

type BoundaryKind = 'boundary_explain' | 'unsupported'

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
  const providers = reindexProviders(ctx.priorProviders)
  const oneLine = kind === 'boundary_explain' ? buildBoundaryOneLine() : buildUnsupportedOneLine()
  const summary =
    kind === 'boundary_explain'
      ? buildBoundarySummary(providers)
      : buildUnsupportedSummary(providers)
  const nextStep =
    kind === 'boundary_explain'
      ? buildBoundaryNextStep(providers)
      : buildUnsupportedNextStep(providers)
  const routeStartedAt = Date.now()
  ctx.workLog.emit({
    id: 'route.next_step',
    phase: 'route',
    status: 'running',
    title: 'Preparing the next step',
    summary: 'Separating listed facts from actions this page does not handle.',
    startedAtMs: routeStartedAt,
  })
  ctx.workLog.emit({
    id: 'route.next_step',
    phase: 'route',
    status: 'complete',
    title: 'Preparing the next step',
    summary: 'This page can help read, compare, and route to a listed business page. It does not book, take payment, or dispatch work.',
    detailRows: [{ label: 'Listed businesses carried forward', value: String(providers.length) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    startedAtMs: routeStartedAt,
    completedAtMs: Date.now(),
  })

  const snapshot = withFollowUpLayout(
    {
      query: ctx.query,
      oneLine,
      providers,
      summary,
      nextStep,
      agentJsonUrl: buildAgentJsonUrl(ctx.query, DEFAULT_TURN_PROVIDER_LIMIT),
    },
    ctx.priorTurnsCount,
    ctx.intent,
  )

  const allowedSlugs = new Set(ctx.priorAllowedSlugs)
  const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot(ctx, [], allowedSlugs, finalized)
  }
  const assembly = await ctx.emitOrDeferSnapshot(finalized.snapshot, kind, { planMode: 'boundary' })
  return {
    snapshot: finalized.snapshot,
    toolCalls: [],
    allowedSlugs,
    errorCopyId: undefined,
    gate: finalized.gate,
    ...(assembly === undefined ? {} : { assembly }),
  }
}

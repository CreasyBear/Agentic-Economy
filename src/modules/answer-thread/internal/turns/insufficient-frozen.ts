import { buildAgentJsonUrl } from '@/modules/answer/public'

import { finalizeAnswerTurnSnapshot } from '../answer-turn-safety'
import {
  DEFAULT_TURN_PROVIDER_LIMIT,
  rejectBlockedSnapshot,
  withFollowUpLayout,
  type TurnPath,
  type TurnPathContext,
  type TurnPathResult,
} from './types'

type FrozenRouteKind = 'frozen_filter' | 'frozen_compare'

export const insufficientFrozenTurnPath: TurnPath<[FrozenRouteKind]> = {
  id: 'frozen_filter',
  async run(ctx, routeKind) {
    return streamInsufficientFrozenContextTurn(ctx, routeKind)
  },
}

async function streamInsufficientFrozenContextTurn(
  ctx: TurnPathContext,
  routeKind: FrozenRouteKind,
): Promise<TurnPathResult> {
  const isCompare = routeKind === 'frozen_compare'
  const snapshot = withFollowUpLayout(
    {
      query: ctx.query,
      oneLine: isCompare ? 'No two listed businesses to compare yet.' : 'No listed businesses to filter yet.',
      providers: [],
      summary: isCompare
        ? 'There are not enough listed businesses in the latest answer to compare.'
        : 'There are no listed businesses in the latest answer to filter.',
      nextStep: 'Ask for a need and place, then compare or filter the listed businesses that appear.',
      agentJsonUrl: buildAgentJsonUrl(ctx.query, DEFAULT_TURN_PROVIDER_LIMIT),
    },
    ctx.priorTurnsCount,
    ctx.intent,
  )

  ctx.workLog.emit({
    id: 'read.providers',
    phase: 'read',
    status: 'skipped',
    title: 'Using previous listed businesses',
    summary: 'There were not enough listed businesses in the latest answer for this follow-up.',
    detailRows: [{ label: 'Available from latest answer', value: '0' }],
    completedAtMs: Date.now(),
  })

  const allowedSlugs = new Set<string>()

  const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot(ctx, [], allowedSlugs, finalized)
  }
  const assembly = await ctx.emitOrDeferSnapshot(
    finalized.snapshot,
    routeKind,
    { planMode: routeKind === 'frozen_compare' ? 'compare' : 'filter' },
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

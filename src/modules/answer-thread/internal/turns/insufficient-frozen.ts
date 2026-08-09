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
      oneLine: isCompare ? 'Not enough matches to compare yet.' : 'No matches found yet.',
      providers: [],
      summary: isCompare
        ? 'There are not enough matches in the latest answer to compare.'
        : 'There are no matches in the latest answer to filter.',
      nextStep: 'Tell me what you need and where, then compare the matches or narrow them down.',
      agentJsonUrl: buildAgentJsonUrl(ctx.query, DEFAULT_TURN_PROVIDER_LIMIT),
    },
    ctx.priorTurnsCount,
    ctx.intent,
  )

  ctx.workLog.emit({
    id: 'read.providers',
    phase: 'read',
    status: 'skipped',
    title: 'Checking the matches already found',
    summary: 'There were not enough matches in the latest answer for this follow-up.',
    detailRows: [{ label: 'Matches from latest answer', value: '0' }],
    completedAtMs: Date.now(),
  })

  const allowedSlugs = new Set<string>()

  const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot([], allowedSlugs, finalized)
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

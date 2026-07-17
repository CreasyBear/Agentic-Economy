import {
  type AnswerSource,
  buildAgentJsonUrl,
  buildCompactFollowUpProse,
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

type FrozenRouteKind = 'frozen_filter' | 'frozen_compare'

export const frozenKnownTurnPath: TurnPath<[readonly AnswerSource[], FrozenRouteKind]> = {
  id: 'frozen_filter',
  async run(ctx, providers, routeKind) {
    return streamFrozenKnownProviderTurn(ctx, providers, routeKind)
  },
}

async function streamFrozenKnownProviderTurn(
  ctx: TurnPathContext,
  providers: readonly AnswerSource[],
  routeKind: FrozenRouteKind,
): Promise<TurnPathResult> {
  const prose = buildCompactFollowUpProse({
    followUpIntent: ctx.intent,
    displayQuery: ctx.query,
    providers,
  })
  const snapshot = withFollowUpLayout(
    {
      query: ctx.query,
      providers,
      oneLine: prose.oneLine,
      summary: prose.summary,
      nextStep: prose.nextStep,
      agentJsonUrl: buildAgentJsonUrl(ctx.query, DEFAULT_TURN_PROVIDER_LIMIT),
    },
    ctx.priorTurnsCount,
    ctx.intent,
  )
  const allowedSlugs = new Set(ctx.priorAllowedSlugs.length > 0
    ? ctx.priorAllowedSlugs
    : providers.map((provider) => provider.slug))

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

export function selectFrozenProviders(
  routeKind: FrozenRouteKind,
  priorProviders: readonly AnswerSource[],
): AnswerSource[] {
  if (routeKind === 'frozen_filter') {
    return reindexProviders(priorProviders.filter((provider) => provider.inquiryUrl !== undefined))
  }
  return reindexProviders(priorProviders.slice(0, 2))
}

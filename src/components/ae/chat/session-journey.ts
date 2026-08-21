import type { AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection } from '@/modules/answer-thread/public'
import {
  activeSelectedProviderForTurns,
  listedProvidersFromArtifacts,
} from './session-provider-context'

export type SessionJourneyStatus = 'complete' | 'active' | 'pending'

export type SessionJourneyStep = {
  id: 'search' | 'compare' | 'follow_up'
  label: string
  detail: string
  status: SessionJourneyStatus
}

export type SessionJourney = {
  providerCount: number
  selectedProvider?: {
    name: string
  }
  heading: string
  statusText: string
  guidance: string
  steps: readonly SessionJourneyStep[]
}

export type SessionJourneyInput = {
  projection: PublicThreadProjection | null
  liveTurn?: {
    intent: FollowUpIntent
  } | null
}

export function buildSessionJourney(input: SessionJourneyInput): SessionJourney | null {
  const completedTurns = input.projection?.turns.filter((turn) => turn.status === 'complete') ?? []
  const allArtifacts = completedTurns.flatMap((turn) => turn.artifacts)
  const providers = listedProvidersFromArtifacts(allArtifacts)
  const providerSlugs = new Set<string>()
  for (const provider of providers) providerSlugs.add(provider.slug)
  const providerCount = providerSlugs.size
  const selectedProvider = activeSelectedProviderForTurns(completedTurns)
  const completedTurnCount = completedTurns.length
  const liveTurnCount = input.liveTurn === null || input.liveTurn === undefined ? 0 : 1
  const totalTurnCount = completedTurnCount + liveTurnCount

  if (totalTurnCount === 0) {
    return null
  }

  const hasFollowUp = completedTurns.some((turn) => turn.seq > 1) || (completedTurnCount > 0 && liveTurnCount > 0)
  const hasSearchStarted = totalTurnCount > 0
  const hasSearchCompleted = completedTurnCount > 0
  const hasProviderEvidence = providerCount > 0

  // Nothing to orient yet: no matches and no contact activity. An empty
  // "request" only restates "nothing found", so suppress it entirely and
  // let the answer's own recovery prompts carry the empty case.
  if (!hasProviderEvidence && selectedProvider === undefined) {
    return null
  }

  return {
    providerCount,
    ...(selectedProvider === undefined
      ? {}
      : {
          selectedProvider: {
            name: selectedProvider.name,
          },
        }),
    heading: 'Next steps',
    statusText: buildSessionJourneyStatusText({ providerCount, selectedProvider }),
    guidance: buildSessionJourneyGuidance({
      providerCount,
      selectedProvider,
      hasSearchCompleted,
    }),
    steps: [
      {
        id: 'search',
        label: 'Find',
        detail: hasSearchCompleted ? 'Matches checked' : "Checking what's available",
        status: hasSearchCompleted ? 'complete' : hasSearchStarted ? 'active' : 'pending',
      },
      {
        id: 'compare',
        label: 'Compare',
        detail:
          providerCount > 0
            ? `${providerCount} ${providerCount === 1 ? 'match' : 'matches'}`
            : 'Area and response',
        status: hasProviderEvidence ? 'complete' : hasSearchCompleted ? 'active' : 'pending',
      },
      {
        id: 'follow_up',
        label: 'Follow up',
        detail: 'Narrow, compare, or ask about limits',
        status: hasFollowUp ? 'complete' : hasProviderEvidence ? 'active' : 'pending',
      },
    ],
  }
}

function buildSessionJourneyGuidance(input: {
  providerCount: number
  selectedProvider: AnswerSource | undefined
  hasSearchCompleted: boolean
}): string {
  if (!input.hasSearchCompleted) {
    return "Checking what's available before any contact step."
  }

  if (input.providerCount <= 0) {
    return 'No clear match yet. Refine the request before contacting a business.'
  }

  return 'Compare the published details, then use a listed contact channel when one is available.'
}

function buildSessionJourneyStatusText(input: {
  providerCount: number
  selectedProvider: AnswerSource | undefined
}): string {
  if (input.selectedProvider !== undefined) {
    return `${input.selectedProvider.name} selected for review`
  }

  if (input.providerCount > 0) {
    return `${input.providerCount} ${input.providerCount === 1 ? 'match' : 'matches'} ready to compare`
  }

  return 'Finding a match'
}

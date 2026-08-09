import type { AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection } from '@/modules/answer-thread/public'
import {
  activeSelectedProviderForTurns,
  listedProvidersFromArtifacts,
  providerHasInquiryPath,
} from './session-provider-context'

export type SessionJourneyStatus = 'complete' | 'active' | 'pending'

export type SessionJourneyStep = {
  id: 'search' | 'compare' | 'follow_up' | 'inquiry'
  label: string
  detail: string
  status: SessionJourneyStatus
}

export type SessionJourney = {
  providerCount: number
  hasInquiryReadyProvider: boolean
  selectedProvider?: {
    name: string
    hasInquiryPath: boolean
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
  const hasInquiryReadyProvider = providers.some((provider) => providerHasInquiryPath(provider))
  const selectedProvider = activeSelectedProviderForTurns(completedTurns)
  const completedTurnCount = completedTurns.length
  const liveIntent = input.liveTurn?.intent
  const liveTurnCount = input.liveTurn === null || input.liveTurn === undefined ? 0 : 1
  const totalTurnCount = completedTurnCount + liveTurnCount

  if (totalTurnCount === 0) {
    return null
  }

  const handoffActive = liveIntent === 'inquiry_handoff'
  const handoffComplete = selectedProvider !== undefined && completedTurns.some((turn) => turn.intent === 'inquiry_handoff')
  const hasFollowUp = completedTurns.some((turn) => turn.seq > 1) || (completedTurnCount > 0 && liveTurnCount > 0)
  const hasSearchStarted = totalTurnCount > 0
  const hasSearchCompleted = completedTurnCount > 0
  const hasProviderEvidence = providerCount > 0

  // Nothing to orient yet: no matches and no contact activity. An empty
  // "request" only restates "nothing found", so suppress it entirely and
  // let the answer's own recovery prompts carry the empty case.
  if (!hasProviderEvidence && selectedProvider === undefined && !handoffActive && !handoffComplete && !hasInquiryReadyProvider) {
    return null
  }

  return {
    providerCount,
    hasInquiryReadyProvider,
    ...(selectedProvider === undefined
      ? {}
      : {
          selectedProvider: {
            name: selectedProvider.name,
            hasInquiryPath: providerHasInquiryPath(selectedProvider),
          },
        }),
    heading: 'Next steps',
    statusText: buildSessionJourneyStatusText({ providerCount, selectedProvider }),
    guidance: buildSessionJourneyGuidance({
      providerCount,
      hasInquiryReadyProvider,
      selectedProvider,
      handoffActive,
      handoffComplete,
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
      {
        id: 'inquiry',
        label: 'Ask the business',
        detail: inquiryStepDetail({ hasInquiryReadyProvider, selectedProvider }),
        status: handoffComplete ? 'complete' : handoffActive ? 'active' : 'pending',
      },
    ],
  }
}

function buildSessionJourneyGuidance(input: {
  providerCount: number
  hasInquiryReadyProvider: boolean
  selectedProvider: AnswerSource | undefined
  handoffActive: boolean
  handoffComplete: boolean
  hasSearchCompleted: boolean
}): string {
  if (input.handoffActive) {
    return 'Preparing a request to the business. The business still confirms timing, quote, and availability.'
  }

  if (input.handoffComplete) {
    if (input.selectedProvider !== undefined && !providerHasInquiryPath(input.selectedProvider)) {
      return `${input.selectedProvider.name} is selected for review. This business does not have a request form yet.`
    }
    if (input.selectedProvider !== undefined) {
      return `${input.selectedProvider.name} is selected for contact. The business still confirms timing, quote, and availability.`
    }
  }

  if (!input.hasSearchCompleted) {
    return "Checking what's available before any contact step."
  }

  if (input.providerCount <= 0) {
    return 'No clear match yet. Refine the request before contacting a business.'
  }

  if (input.hasInquiryReadyProvider) {
    return 'Compare the options, then choose a business to contact. The business still confirms timing, quote, and availability.'
  }

  return 'Compare the published details first; these options do not have a request form yet.'
}

function buildSessionJourneyStatusText(input: {
  providerCount: number
  selectedProvider: AnswerSource | undefined
}): string {
  if (input.selectedProvider !== undefined) {
    return providerHasInquiryPath(input.selectedProvider)
      ? `${input.selectedProvider.name} selected for contact`
      : `${input.selectedProvider.name} selected for review`
  }

  if (input.providerCount > 0) {
    return `${input.providerCount} ${input.providerCount === 1 ? 'match' : 'matches'} ready to compare`
  }

  return 'Finding a match'
}

function inquiryStepDetail(input: {
  hasInquiryReadyProvider: boolean
  selectedProvider: AnswerSource | undefined
}): string {
  if (input.selectedProvider !== undefined) {
    return providerHasInquiryPath(input.selectedProvider) ? 'Request form available' : 'No request form yet'
  }

  return input.hasInquiryReadyProvider ? 'Request form available' : 'Choose a business first'
}


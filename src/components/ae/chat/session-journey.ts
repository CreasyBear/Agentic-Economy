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

  // Nothing to orient yet: no listings found and no inquiry activity. An empty
  // "inquiry path" only restates "nothing found", so suppress it entirely and
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
    heading: 'Inquiry path',
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
        label: 'Find listings',
        detail: hasSearchCompleted ? 'Published matches checked' : 'Checking published details',
        status: hasSearchCompleted ? 'complete' : hasSearchStarted ? 'active' : 'pending',
      },
      {
        id: 'compare',
        label: 'Compare fit',
        detail:
          providerCount > 0
            ? `${providerCount} listed ${providerCount === 1 ? 'business' : 'businesses'}`
            : 'Service area and response',
        status: hasProviderEvidence ? 'complete' : hasSearchCompleted ? 'active' : 'pending',
      },
      {
        id: 'follow_up',
        label: 'Follow up',
        detail: 'Narrow, compare, or ask limits',
        status: hasFollowUp ? 'complete' : hasProviderEvidence ? 'active' : 'pending',
      },
      {
        id: 'inquiry',
        label: 'Inquiry next step',
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
    return 'AE is preparing the qualified inquiry next step. The business still confirms timing, quote, and availability.'
  }

  if (input.handoffComplete) {
    if (input.selectedProvider !== undefined && !providerHasInquiryPath(input.selectedProvider)) {
      return `${input.selectedProvider.name} is selected for listing review. This business needs a published inquiry path before AE can route contact.`
    }
    if (input.selectedProvider !== undefined) {
      return `${input.selectedProvider.name} is selected for qualified inquiry review. The business still confirms timing, quote, and availability.`
    }
  }

  if (!input.hasSearchCompleted) {
    return 'AE is checking published service details before any contact step.'
  }

  if (input.providerCount <= 0) {
    return 'No clear listed match yet. Refine the search before contact.'
  }

  if (input.hasInquiryReadyProvider) {
    return 'Compare fit, then choose a business to contact. The business still confirms timing, quote, and availability.'
  }

  return 'Compare the published facts first; these listings need a published inquiry path before contact.'
}

function buildSessionJourneyStatusText(input: {
  providerCount: number
  selectedProvider: AnswerSource | undefined
}): string {
  if (input.selectedProvider !== undefined) {
    return providerHasInquiryPath(input.selectedProvider)
      ? `${input.selectedProvider.name} selected for inquiry review`
      : `${input.selectedProvider.name} selected for listing review`
  }

  if (input.providerCount > 0) {
    return `${input.providerCount} listed ${input.providerCount === 1 ? 'business' : 'businesses'} ready to compare`
  }

  return 'Finding the right listed business'
}

function inquiryStepDetail(input: {
  hasInquiryReadyProvider: boolean
  selectedProvider: AnswerSource | undefined
}): string {
  if (input.selectedProvider !== undefined) {
    return providerHasInquiryPath(input.selectedProvider) ? 'Qualified inquiry only' : 'Needs listed inquiry path'
  }

  return input.hasInquiryReadyProvider ? 'Qualified inquiry only' : 'Needs listed inquiry path'
}


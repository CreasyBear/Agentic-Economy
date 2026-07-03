import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection } from '@/modules/answer-thread/public'

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
  status: string
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
  const providerCount = countSessionProviders(allArtifacts)
  const hasInquiryReadyProvider = hasInquiryPath(allArtifacts)
  const selectedProvider = latestSelectedProvider(completedTurns)
  const completedTurnCount = completedTurns.length
  const liveIntent = input.liveTurn?.intent
  const liveTurnCount = input.liveTurn === null || input.liveTurn === undefined ? 0 : 1
  const totalTurnCount = completedTurnCount + liveTurnCount

  if (totalTurnCount === 0) {
    return null
  }

  const handoffActive = liveIntent === 'inquiry_handoff'
  const handoffComplete = completedTurns.some((turn) => turn.intent === 'inquiry_handoff')
  const hasFollowUp = completedTurns.some((turn) => turn.seq > 1) || (completedTurnCount > 0 && liveTurnCount > 0)
  const hasSearchStarted = totalTurnCount > 0
  const hasSearchCompleted = completedTurnCount > 0
  const hasProviderEvidence = providerCount > 0

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
    status: buildSessionJourneyStatus({ providerCount, selectedProvider }),
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
    return 'AE has selected the business for qualified inquiry review. The business still confirms timing, quote, and availability.'
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

function buildSessionJourneyStatus(input: {
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

function countSessionProviders(artifacts: readonly AnswerArtifact[]): number {
  const slugs = new Set<string>()

  for (const artifact of artifacts) {
    switch (artifact.kind) {
      case 'selected-provider':
        slugs.add(artifact.provider.slug)
        break
      case 'provider-cards':
      case 'provider-compare-table':
        for (const provider of artifact.providers) {
          slugs.add(provider.slug)
        }
        break
      default:
        break
    }
  }

  return slugs.size
}

function latestSelectedProvider(
  turns: readonly NonNullable<PublicThreadProjection['turns']>[number][],
): AnswerSource | undefined {
  for (const turn of [...turns].reverse()) {
    for (const artifact of [...turn.artifacts].reverse()) {
      if (artifact.kind === 'selected-provider') {
        return artifact.provider
      }
    }
  }
  return undefined
}

function hasInquiryPath(artifacts: readonly AnswerArtifact[]): boolean {
  return artifacts.some((artifact) => {
    switch (artifact.kind) {
      case 'selected-provider':
        return artifact.provider.inquiryUrl !== undefined && artifact.provider.inquiryUrl.length > 0
      case 'provider-cards':
      case 'provider-compare-table':
        return artifact.providers.some((provider) => provider.inquiryUrl !== undefined && provider.inquiryUrl.length > 0)
      default:
        return false
    }
  })
}

function providerHasInquiryPath(provider: AnswerSource): boolean {
  return provider.inquiryUrl !== undefined && provider.inquiryUrl.length > 0
}

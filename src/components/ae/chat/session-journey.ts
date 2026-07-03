import type { AnswerArtifact } from '@/modules/answer/public'
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
  heading: string
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
    heading: 'Inquiry path',
    guidance: buildSessionJourneyGuidance({
      providerCount,
      hasInquiryReadyProvider,
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
        detail: hasInquiryReadyProvider ? 'Qualified inquiry only' : 'Needs listed inquiry path',
        status: handoffComplete ? 'complete' : handoffActive ? 'active' : 'pending',
      },
    ],
  }
}

function buildSessionJourneyGuidance(input: {
  providerCount: number
  hasInquiryReadyProvider: boolean
  handoffActive: boolean
  handoffComplete: boolean
  hasSearchCompleted: boolean
}): string {
  if (input.handoffActive) {
    return 'AE is preparing the qualified inquiry next step. The business still confirms timing, quote, and availability.'
  }

  if (input.handoffComplete) {
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

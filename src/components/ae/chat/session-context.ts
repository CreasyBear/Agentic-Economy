import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'

export type SessionContextFact = {
  id: 'focus' | 'businesses' | 'selected' | 'inquiry' | 'boundary'
  label: string
  value: string
}

export type SessionContext = {
  badgeLabel: string
  summary: string
  facts: readonly SessionContextFact[]
}

export type SessionContextInput = {
  projection: PublicThreadProjection | null
  liveTurn?: {
    query: string
    intent: FollowUpIntent
  } | null
}

export function buildSessionContext(input: SessionContextInput): SessionContext | null {
  const completedTurns = input.projection?.turns.filter((turn) => turn.status === 'complete') ?? []
  const latestTurn = completedTurns.at(-1)
  if (latestTurn === undefined) {
    return null
  }

  const providers = listedProvidersFromTurns(completedTurns)
  const selectedProvider = latestSelectedProvider(completedTurns)
  const inquiryReadyCount = providers.filter((provider) => hasInquiryPath(provider)).length
  const liveTurn = input.liveTurn ?? null

  return {
    badgeLabel: liveTurn === null ? 'Saved context' : intentLabel(liveTurn.intent),
    summary: contextSummary({ providerCount: providers.length, selectedProvider, liveTurn }),
    facts: [
      {
        id: 'focus',
        label: liveTurn === null ? 'Last request' : 'Current follow-up',
        value: liveTurn?.query ?? latestTurn.query,
      },
      {
        id: 'businesses',
        label: 'Listed businesses',
        value: providerListLabel(providers),
      },
      ...(selectedProvider === undefined
        ? []
        : [{
            id: 'selected' as const,
            label: 'Selected business',
            value: selectedProvider.name,
          }]),
      {
        id: 'inquiry',
        label: 'Inquiry readiness',
        value: inquiryReadinessLabel(inquiryReadyCount),
      },
      {
        id: 'boundary',
        label: 'Boundary',
        value: 'Business confirms timing, price, and availability.',
      },
    ],
  }
}

function contextSummary(input: {
  providerCount: number
  selectedProvider: AnswerSource | undefined
  liveTurn: { query: string; intent: FollowUpIntent } | null
}): string {
  if (input.liveTurn !== null) {
    return `${intentSummary(input.liveTurn.intent)} using the businesses already found in this thread.`
  }

  if (input.selectedProvider !== undefined) {
    return `${input.selectedProvider.name} is the current business selected for inquiry review.`
  }

  if (input.providerCount > 0) {
    return 'AE is holding the listed businesses from this thread for comparison and follow-up.'
  }

  return 'AE has not found a listed business to carry forward yet.'
}

function intentLabel(intent: FollowUpIntent): string {
  switch (intent) {
    case 'filter_known':
      return 'Filtering'
    case 'compare_known':
      return 'Comparing'
    case 'inquiry_handoff':
      return 'Inquiry path'
    case 'explain_boundary':
      return 'Checking limits'
    case 'unsupported':
      return 'Needs redirect'
    case 'refine_search':
      return 'Refining'
  }
}

function intentSummary(intent: FollowUpIntent): string {
  switch (intent) {
    case 'filter_known':
      return 'This follow-up is narrowing the known results'
    case 'compare_known':
      return 'This follow-up is comparing known options'
    case 'inquiry_handoff':
      return 'This follow-up is preparing a qualified inquiry next step'
    case 'explain_boundary':
      return "This follow-up is checking AE's inquiry-only limits"
    case 'unsupported':
      return 'This follow-up is being routed back to published listings'
    case 'refine_search':
      return 'This follow-up is searching again'
  }
}

function listedProvidersFromTurns(turns: readonly PublicThreadTurn[]): AnswerSource[] {
  const providersBySlug = new Map<string, AnswerSource>()

  for (const turn of turns) {
    for (const provider of listedProvidersFromArtifacts(turn.artifacts)) {
      providersBySlug.set(provider.slug, provider)
    }
  }

  return [...providersBySlug.values()]
}

function listedProvidersFromArtifacts(artifacts: readonly AnswerArtifact[]): AnswerSource[] {
  const providers: AnswerSource[] = []

  for (const artifact of artifacts) {
    switch (artifact.kind) {
      case 'selected-provider':
        providers.push(artifact.provider)
        break
      case 'provider-cards':
      case 'provider-compare-table':
        providers.push(...artifact.providers)
        break
      default:
        break
    }
  }

  return providers
}

function latestSelectedProvider(turns: readonly PublicThreadTurn[]): AnswerSource | undefined {
  for (const turn of [...turns].reverse()) {
    for (const artifact of [...turn.artifacts].reverse()) {
      if (artifact.kind === 'selected-provider') {
        return artifact.provider
      }
    }
  }
  return undefined
}

function providerListLabel(providers: readonly AnswerSource[]): string {
  if (providers.length === 0) {
    return 'No listed business yet'
  }

  const names = providers.slice(0, 3).map((provider) => provider.name)
  const extra = providers.length - names.length
  return extra > 0 ? `${names.join(', ')} + ${extra} more` : names.join(', ')
}

function inquiryReadinessLabel(count: number): string {
  if (count <= 0) {
    return 'No listed inquiry path yet'
  }
  return `${count} listed ${count === 1 ? 'business publishes' : 'businesses publish'} an inquiry path`
}

function hasInquiryPath(provider: AnswerSource): boolean {
  return provider.inquiryUrl !== undefined && provider.inquiryUrl.length > 0
}

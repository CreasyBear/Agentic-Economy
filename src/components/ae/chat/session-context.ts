import type { AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'
import {
  activeSelectedProviderForTurns,
  listedProvidersFromArtifacts,
  providerHasInquiryPath,
  selectedProviderFromArtifacts,
} from './session-provider-context'

export type SessionContextFact = {
  id: 'focus' | 'current' | 'businesses' | 'selected' | 'inquiry' | 'boundary'
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
  const latestProviders = listedProvidersFromArtifacts(latestTurn.artifacts)
  const selectedProvider = activeSelectedProviderForTurns(completedTurns)
  const currentSelectedProvider = selectedProviderFromArtifacts(latestTurn.artifacts)
  const inquiryReadyCount = providers.filter(providerHasInquiryPath).length
  const liveTurn = input.liveTurn ?? null

  // No listings and nothing selected: the context card would just repeat "no
  // listed business" in six rows, so suppress it and keep the empty turn lean.
  if (providers.length === 0 && selectedProvider === undefined && currentSelectedProvider === undefined) {
    return null
  }

  return {
    badgeLabel: liveTurn === null ? 'Saved context' : intentLabel(liveTurn.intent),
    summary: contextSummary({
      providerCount: providers.length,
      currentProviders: latestProviders,
      selectedProvider: selectedProvider ?? currentSelectedProvider,
      latestIntent: latestTurn.intent,
      liveTurn,
    }),
    facts: [
      {
        id: 'focus',
        label: liveTurn === null ? 'Last request' : 'Current follow-up',
        value: liveTurn?.query ?? latestTurn.query,
      },
      {
        id: 'current',
        label: liveTurn === null ? 'Current answer' : 'Last answer',
        value: currentAnswerLabel(latestTurn),
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
        value: 'Business confirms timing, quote, and availability.',
      },
    ],
  }
}

function contextSummary(input: {
  providerCount: number
  currentProviders: readonly AnswerSource[]
  selectedProvider: AnswerSource | undefined
  latestIntent: FollowUpIntent
  liveTurn: { query: string; intent: FollowUpIntent } | null
}): string {
  if (input.liveTurn !== null) {
    return liveIntentSummary(input.liveTurn.intent)
  }

  if (input.selectedProvider !== undefined) {
    return providerHasInquiryPath(input.selectedProvider)
      ? `${input.selectedProvider.name} is the current business selected for inquiry review.`
      : `${input.selectedProvider.name} is the current business selected for listing review.`
  }

  if (input.currentProviders.length > 0 && input.providerCount > input.currentProviders.length) {
    return `This answer is narrowed to ${providerListLabel(input.currentProviders)} while AE keeps earlier listed businesses in the thread.`
  }

  if (input.currentProviders.length === 0 && input.providerCount > 0 && input.latestIntent !== 'refine_search') {
    return `${completedIntentSummary(input.latestIntent)} while AE keeps earlier listed businesses in the thread.`
  }

  if (input.providerCount > 0) {
    return 'AE is holding the listed businesses from this thread for comparison and follow-up.'
  }

  return 'AE has not found a listed business to carry forward yet.'
}

function liveIntentSummary(intent: FollowUpIntent): string {
  switch (intent) {
    case 'filter_known':
    case 'compare_known':
    case 'inquiry_handoff':
    case 'explain_boundary':
      return `${intentSummary(intent)} using the businesses already found in this thread.`
    case 'unsupported':
      return 'This follow-up is being routed back to published listings while AE keeps this thread visible.'
    case 'refine_search':
      return 'This follow-up is searching published listings again while AE keeps this thread visible.'
  }
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
      return 'This follow-up is checking the supported next step'
    case 'unsupported':
      return 'This follow-up is being routed back to published listings'
    case 'refine_search':
      return 'This follow-up is searching again'
  }
}

function completedIntentSummary(intent: FollowUpIntent): string {
  switch (intent) {
    case 'filter_known':
      return 'This answer narrowed the known results'
    case 'compare_known':
      return 'This answer compared known options'
    case 'inquiry_handoff':
      return 'This answer prepared a qualified inquiry next step'
    case 'explain_boundary':
      return 'This answer checked the supported next step'
    case 'unsupported':
      return 'This answer routed the request back to published listings'
    case 'refine_search':
      return 'This answer searched again'
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

function currentAnswerLabel(turn: PublicThreadTurn): string {
  const selectedProvider = selectedProviderFromArtifacts(turn.artifacts)
  if (selectedProvider !== undefined) {
    return providerHasInquiryPath(selectedProvider)
      ? `${selectedProvider.name} selected for inquiry review`
      : `${selectedProvider.name} selected for listing review`
  }

  const providers = listedProvidersFromArtifacts(turn.artifacts)
  if (providers.length === 0) {
    return 'No listed business in this answer'
  }

  if (providers.length === 1 && providers[0] !== undefined) {
    return `${providers[0].name} in this answer`
  }

  return `${providers.length} listed businesses in this answer: ${providerListLabel(providers)}`
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


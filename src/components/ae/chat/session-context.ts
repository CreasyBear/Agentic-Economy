import { neutralizeBidiFormattingControls, type AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'
import {
  activeSelectedProviderForTurns,
  listedProvidersFromArtifacts,
  selectedProviderFromArtifacts,
} from './session-provider-context'

export type SessionContextFact = {
  id: 'focus' | 'current' | 'businesses' | 'selected' | 'boundary'
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
  const liveTurn = input.liveTurn ?? null

  // No matches and nothing selected: the context card would just repeat "no
  // clear match" in six rows, so suppress it and keep the empty turn lean.
  if (providers.length === 0 && selectedProvider === undefined && currentSelectedProvider === undefined) {
    return null
  }

  const context: SessionContext = {
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
        label: 'Matches',
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
        id: 'boundary',
        label: 'Boundary',
        value: 'Business confirms timing, quote, and availability.',
      },
    ],
  }
  return {
    ...context,
    summary: neutralizeBidiFormattingControls(context.summary),
    facts: context.facts.map((fact) => ({
      ...fact,
      label: neutralizeBidiFormattingControls(fact.label),
      value: neutralizeBidiFormattingControls(fact.value),
    })),
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
    return `${input.selectedProvider.name} is selected for review.`
  }

  if (input.currentProviders.length > 0 && input.providerCount > input.currentProviders.length) {
    return `This answer is narrowed to ${providerListLabel(input.currentProviders)} while earlier matches stay in the thread.`
  }

  if (input.currentProviders.length === 0 && input.providerCount > 0 && input.latestIntent !== 'refine_search') {
    return `${completedIntentSummary(input.latestIntent)} while earlier matches stay in the thread.`
  }

  if (input.providerCount > 0) {
    return 'Keeping the matches from this thread ready for comparison and follow-up.'
  }

  return 'No clear match has been found to carry forward yet.'
}

function liveIntentSummary(intent: FollowUpIntent): string {
  switch (intent) {
    case 'filter_known':
    case 'compare_known':
    case 'explain_boundary':
      return `${intentSummary(intent)} using the matches already found in this thread.`
    case 'unsupported':
      return 'This follow-up needs another approach, so the options stay visible here.'
    case 'refine_search':
      return "Checking what's available again while keeping this thread visible."
  }
}

function intentLabel(intent: FollowUpIntent): string {
  switch (intent) {
    case 'filter_known':
      return 'Narrowing'
    case 'compare_known':
      return 'Comparing'
    case 'explain_boundary':
      return 'Checking limits'
    case 'unsupported':
      return 'Needs another approach'
    case 'refine_search':
      return 'Finding more'
  }
}

function intentSummary(intent: FollowUpIntent): string {
  switch (intent) {
    case 'filter_known':
      return 'This follow-up is narrowing the matches'
    case 'compare_known':
      return 'This follow-up is comparing the options'
    case 'explain_boundary':
      return 'This follow-up is checking what can happen next'
    case 'unsupported':
      return 'This follow-up is looking for another way forward'
    case 'refine_search':
      return "This follow-up is checking what's available again"
  }
}

function completedIntentSummary(intent: FollowUpIntent): string {
  switch (intent) {
    case 'filter_known':
      return 'This answer narrowed the matches'
    case 'compare_known':
      return 'This answer compared the options'
    case 'explain_boundary':
      return 'This answer checked what can happen next'
    case 'unsupported':
      return 'This answer looked for another way forward'
    case 'refine_search':
      return 'This answer checked what is available'
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
    return `${selectedProvider.name} selected for review`
  }

  const providers = listedProvidersFromArtifacts(turn.artifacts)
  if (providers.length === 0) {
    return 'No clear match in this answer'
  }

  if (providers.length === 1 && providers[0] !== undefined) {
    return `${providers[0].name} in this answer`
  }

  return `${providers.length} matches in this answer: ${providerListLabel(providers)}`
}

function providerListLabel(providers: readonly AnswerSource[]): string {
  if (providers.length === 0) {
    return 'No matches yet'
  }

  const names = providers.slice(0, 3).map((provider) => provider.name)
  const extra = providers.length - names.length
  return extra > 0 ? `${names.join(', ')} + ${extra} more` : names.join(', ')
}

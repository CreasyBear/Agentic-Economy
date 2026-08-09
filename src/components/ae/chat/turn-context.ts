import { neutralizeBidiFormattingControls, type AnswerArtifact, type AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent } from '@/modules/answer-thread/public'
import {
  listedProvidersFromArtifacts,
  providerHasInquiryPath,
  selectedProviderFromArtifacts,
} from './session-provider-context'
export type TurnContextLineInput = {
  intent: FollowUpIntent
  seq: number
  artifacts: readonly AnswerArtifact[]
}

export function buildTurnContextLine(input: TurnContextLineInput): string | undefined {
  const providers = listedProvidersFromArtifacts(input.artifacts)
  const providersBySlug = new Map<string, AnswerSource>()
  for (const provider of providers) providersBySlug.set(provider.slug, provider)
  const providerCount = providersBySlug.size
  const providerLabel = formatProviderCount(providerCount)

  switch (input.intent) {
    case 'filter_known':
      return providerLabel === undefined
        ? 'Narrowing matches from this thread.'
        : `Narrowing ${providerLabel} from this thread.`
    case 'compare_known':
      return providerLabel === undefined
        ? 'Explaining the earlier search result.'
        : `Comparing ${providerLabel} from this thread.`
    case 'inquiry_handoff':
      return buildInquiryHandoffContextLine(input.artifacts)
    case 'explain_boundary':
      return 'Checking the supported next step.'
    case 'unsupported':
      return 'This request is outside the current path; the answer will return to other options.'
    case 'refine_search':
      return input.seq <= 1 ? undefined : 'Checking again with this follow-up.'
  }
}

export function countListedProvidersInArtifacts(artifacts: readonly AnswerArtifact[]): number {
  const providersBySlug = new Map<string, AnswerSource>()
  for (const provider of listedProvidersFromArtifacts(artifacts)) providersBySlug.set(provider.slug, provider)
  return providersBySlug.size
}

function formatProviderCount(count: number): string | undefined {
  if (count <= 0) {
    return undefined
  }
  return `${count} ${count === 1 ? 'match' : 'matches'}`
}

function buildInquiryHandoffContextLine(artifacts: readonly AnswerArtifact[]): string {
  const selectedProvider = selectedProviderFromArtifacts(artifacts)
  if (selectedProvider === undefined) {
    return 'No business is selected yet. Find a match before sending a request.'
  }
  const providerName = neutralizeBidiFormattingControls(selectedProvider.name)
  if (!providerHasInquiryPath(selectedProvider)) {
    return `${providerName} does not have a request form here yet.`
  }
  return `Preparing a request to ${providerName}.`
}


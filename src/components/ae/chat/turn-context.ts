import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'
import type { FollowUpIntent } from '@/modules/answer-thread/public'
import { listedProvidersFromArtifacts } from './session-provider-context'

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
        ? 'Filtering listed businesses from this thread.'
        : `Filtering ${providerLabel} from this thread.`
    case 'compare_known':
      return providerLabel === undefined
        ? 'Comparing listed businesses from this thread.'
        : `Comparing ${providerLabel} from this thread.`
    case 'inquiry_handoff':
      return buildInquiryHandoffContextLine([...providersBySlug.values()])
    case 'explain_boundary':
      return 'Checking the supported next step.'
    case 'unsupported':
      return "This request is outside AE's current inquiry path; the answer will route back to published listings."
    case 'refine_search':
      return input.seq <= 1 ? undefined : 'Searching again for this follow-up.'
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
  return `${count} listed ${count === 1 ? 'business' : 'businesses'}`
}

function buildInquiryHandoffContextLine(providers: readonly AnswerSource[]): string {
  const firstProvider = providers[0]
  if (providers.length === 1 && firstProvider !== undefined) {
    return `Preparing the qualified inquiry next step for ${firstProvider.name}.`
  }
  if (providers.length > 1) {
    return `Preparing the qualified inquiry next step from ${providers.length} listed businesses.`
  }
  return 'Preparing the qualified inquiry next step from this thread.'
}


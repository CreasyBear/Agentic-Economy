import type { AnswerArtifact } from '@/modules/answer/public'
import type { FollowUpIntent } from '@/modules/answer-thread/public'

export type TurnContextLineInput = {
  intent: FollowUpIntent
  seq: number
  artifacts: readonly AnswerArtifact[]
}

export function buildTurnContextLine(input: TurnContextLineInput): string | undefined {
  const providerCount = countListedProvidersInArtifacts(input.artifacts)
  const providerLabel = formatProviderCount(providerCount)

  switch (input.intent) {
    case 'filter_known':
      return providerLabel === undefined
        ? 'Filtering listed providers from this thread.'
        : `Filtering ${providerLabel} from this thread.`
    case 'compare_known':
      return providerLabel === undefined
        ? 'Comparing listed providers from this thread.'
        : `Comparing ${providerLabel} from this thread.`
    case 'explain_boundary':
      return "Checking this request against AE's inquiry-only limits."
    case 'unsupported':
      return "This request is outside AE's current inquiry path; the answer will route back to published listings."
    case 'refine_search':
      return input.seq <= 1 ? undefined : 'Searching again for this follow-up.'
  }
}

export function countListedProvidersInArtifacts(artifacts: readonly AnswerArtifact[]): number {
  const providerSlugs = new Set<string>()

  for (const artifact of artifacts) {
    switch (artifact.kind) {
      case 'provider-cards':
      case 'provider-compare-table':
        for (const provider of artifact.providers) {
          providerSlugs.add(provider.slug)
        }
        break
      default:
        break
    }
  }

  return providerSlugs.size
}

function formatProviderCount(count: number): string | undefined {
  if (count <= 0) {
    return undefined
  }
  return `${count} listed ${count === 1 ? 'provider' : 'providers'}`
}

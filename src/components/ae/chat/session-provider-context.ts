import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'

export function activeSelectedProviderForTurns(
  turns: readonly PublicThreadTurn[],
): AnswerSource | undefined {
  const latestTurn = turns.at(-1)
  if (latestTurn === undefined) {
    return undefined
  }

  const currentSelectedProvider = selectedProviderFromArtifacts(latestTurn.artifacts)
  if (currentSelectedProvider !== undefined) {
    return currentSelectedProvider
  }

  if (hasProviderContext(latestTurn.artifacts)) {
    return undefined
  }

  return latestTurn.intent === 'explain_boundary' || latestTurn.intent === 'unsupported'
    ? latestSelectedProvider(turns)
    : undefined
}

export function selectedProviderFromArtifacts(artifacts: readonly AnswerArtifact[]): AnswerSource | undefined {
  for (const artifact of [...artifacts].reverse()) {
    if (artifact.kind === 'selected-provider') {
      return artifact.provider
    }
  }
  return undefined
}

export function hasProviderContext(artifacts: readonly AnswerArtifact[]): boolean {
  return artifacts.some((artifact) => {
    switch (artifact.kind) {
      case 'selected-provider':
        return true
      case 'provider-cards':
      case 'provider-compare-table':
        return artifact.providers.length > 0
      default:
        return false
    }
  })
}

export function providerHasInquiryPath(provider: AnswerSource): boolean {
  return provider.inquiryUrl !== undefined && provider.inquiryUrl.length > 0
}

function latestSelectedProvider(turns: readonly PublicThreadTurn[]): AnswerSource | undefined {
  for (const turn of [...turns].reverse()) {
    const selectedProvider = selectedProviderFromArtifacts(turn.artifacts)
    if (selectedProvider !== undefined) {
      return selectedProvider
    }
  }
  return undefined
}

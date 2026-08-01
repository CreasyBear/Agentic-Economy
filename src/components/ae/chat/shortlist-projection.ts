import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'
import type { NeedTiming } from '@/modules/answer/search-context'
import { listedProvidersFromArtifacts } from './session-provider-context'

export type ShortlistTerminal = {
  providers: readonly AnswerSource[]
  timing: NeedTiming | undefined
}

export function settledShortlistFromArtifacts(
  artifacts: readonly AnswerArtifact[],
  timing: NeedTiming | undefined,
): ShortlistTerminal | null {
  const shortlistArtifacts = artifacts.filter(
    (artifact) => artifact.kind === 'provider-cards' || artifact.kind === 'provider-compare-table',
  )
  const listedProviders = listedProvidersFromArtifacts(shortlistArtifacts)
  const providersBySlug = new Map<string, AnswerSource>()
  for (const provider of listedProviders) providersBySlug.set(provider.slug, provider)
  const providers = [...providersBySlug.values()]
  if (providers.length === 0) return null
  return { providers: orderProviders(providers, timing), timing }
}

export function orderShortlistArtifacts(
  artifacts: readonly AnswerArtifact[],
  timing: NeedTiming | undefined,
): readonly AnswerArtifact[] {
  if (timing !== 'today') return artifacts
  return artifacts.map((artifact) => {
    if (artifact.kind === 'provider-cards' || artifact.kind === 'provider-compare-table') {
      return { ...artifact, providers: orderProviders(artifact.providers, timing) }
    }
    return artifact
  })
}

export function directCallHref(provider: AnswerSource | undefined): string | undefined {
  const dialNumber = provider?.publishedPhone?.replace(/[^+\d]/g, '')
  return dialNumber !== undefined && /\d{6,}/.test(dialNumber) ? `tel:${dialNumber}` : undefined
}

function orderProviders(providers: readonly AnswerSource[], timing: NeedTiming | undefined): readonly AnswerSource[] {
  if (timing !== 'today') return providers
  return providers
    .map((provider, index) => ({ provider, index }))
    .sort((left, right) => contactPriority(right.provider) - contactPriority(left.provider) || left.index - right.index)
    .map(({ provider }) => provider)
}

function contactPriority(provider: AnswerSource): number {
  if (directCallHref(provider) !== undefined) return 2
  return typeof provider.inquiryUrl === 'string' && provider.inquiryUrl.length > 0 ? 1 : 0
}

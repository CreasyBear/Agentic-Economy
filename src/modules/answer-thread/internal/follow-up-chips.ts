import type { PublicThreadTurn } from '../answer-thread.schema'
import { hasEpistemicVocabulary } from '@/modules/answer/public'
import { classifyFollowUpIntent } from './follow-up-intent'

export type FollowUpChip = {
  label: string
  submitQuery: string
}

export type FollowUpChipBuildInput = {
  turn: PublicThreadTurn
  llmChips?: readonly string[]
}

export function buildFollowUpChips(input: FollowUpChipBuildInput): FollowUpChip[] {
  const deterministic = buildDeterministicFollowUpChips(input.turn)
  const llm: FollowUpChip[] = []
  const selectedProviderContext = hasSelectedProviderArtifact(input.turn.artifacts)
  for (const chip of input.llmChips ?? []) {
    if (selectedProviderContext && classifyFollowUpIntent(chip, 1) === 'inquiry_handoff') {
      continue
    }
    if (validateFollowUpChip(chip, 1)) {
      llm.push({ label: chip, submitQuery: chip })
    }
  }
  const merged = [...deterministic]
  for (const chip of llm) {
    if (merged.some((existing) => existing.submitQuery === chip.submitQuery)) {
      continue
    }
    merged.push(chip)
  }
  return merged.slice(0, 7)
}

export function buildDeterministicFollowUpChips(turn: PublicThreadTurn): FollowUpChip[] {
  const chips: FollowUpChip[] = []
  const providers = providersForFollowUps(turn.artifacts)
  const inquiryReadyProviders = providers.filter(hasPublishedInquiryPath)
  const selectedProviderContext = hasSelectedProviderArtifact(turn.artifacts)

  const inquiryHandoffChip = buildInquiryHandoffChip(providers, inquiryReadyProviders)
  if (!selectedProviderContext && inquiryHandoffChip !== undefined) {
    chips.push(inquiryHandoffChip)
  }

  if (inquiryReadyProviders.length > 0) {
    chips.push({
      label: 'Only inquiry-ready listings',
      submitQuery: 'Show only businesses that accept inquiries',
    })
  }

  const suburb = inferSuburbLabel(turn.query, providers)
  if (suburb !== undefined) {
    chips.push({
      label: `Narrow to ${suburb}`,
      submitQuery: `Narrow to ${suburb}`,
    })
  }

  if (providers.length >= 2) {
    chips.push({
      label: 'Compare the top two listings',
      submitQuery: 'Compare the top two',
    })
  }


  return chips.slice(0, 4)
}

function hasSelectedProviderArtifact(artifacts: PublicThreadTurn['artifacts']): boolean {
  return artifacts.some((artifact) => artifact.kind === 'selected-provider')
}

function providersForFollowUps(
  artifacts: PublicThreadTurn['artifacts'],
): Array<{ slug: string; name: string; suburb: string; inquiryUrl?: string }> {
  const providersBySlug = new Map<string, { slug: string; name: string; suburb: string; inquiryUrl?: string }>()

  for (const artifact of artifacts) {
    if (artifact.kind === 'selected-provider') {
      const provider = artifact.provider
      providersBySlug.set(provider.slug, {
        slug: provider.slug,
        name: provider.name,
        suburb: provider.suburb,
        ...(provider.inquiryUrl === undefined ? {} : { inquiryUrl: provider.inquiryUrl }),
      })
      continue
    }

    if (artifact.kind !== 'provider-cards' && artifact.kind !== 'provider-compare-table') {
      continue
    }

    for (const provider of artifact.providers) {
      if (providersBySlug.has(provider.slug)) {
        continue
      }
      providersBySlug.set(provider.slug, {
        slug: provider.slug,
        name: provider.name,
        suburb: provider.suburb,
        ...(provider.inquiryUrl === undefined ? {} : { inquiryUrl: provider.inquiryUrl }),
      })
    }
  }

  return [...providersBySlug.values()]
}

function buildInquiryHandoffChip(
  providers: ReadonlyArray<{ name: string; inquiryUrl?: string }>,
  inquiryReadyProviders: ReadonlyArray<{ name: string; inquiryUrl?: string }>,
): FollowUpChip | undefined {
  const firstProvider = providers[0]
  if (firstProvider !== undefined && hasPublishedInquiryPath(firstProvider)) {
    return {
      label: `Prepare qualified inquiry with ${firstProvider.name}`,
      submitQuery: `Prepare a qualified inquiry for ${firstProvider.name}`,
    }
  }

  const onlyInquiryReady = inquiryReadyProviders[0]
  if (inquiryReadyProviders.length === 1 && onlyInquiryReady !== undefined) {
    return {
      label: `Prepare qualified inquiry with ${onlyInquiryReady.name}`,
      submitQuery: `Prepare a qualified inquiry for ${onlyInquiryReady.name}`,
    }
  }

  return undefined
}

export function validateFollowUpChip(chip: string, priorQueryCount: number): boolean {
  const trimmed = chip.trim()
  if (trimmed.length === 0 || trimmed.length > 120) {
    return false
  }

  if (hasEpistemicVocabulary(trimmed)) {
    return false
  }

  const intent = classifyFollowUpIntent(trimmed, priorQueryCount)
  if (intent === 'unsupported') {
    return false
  }

  return true
}

function inferSuburbLabel(
  query: string,
  providers: ReadonlyArray<{ suburb: string }>,
): string | undefined {
  const suburbSet = new Set<string>()
  for (const provider of providers) {
    const value = provider.suburb.trim()
    if (value.length > 0) {
      suburbSet.add(value)
    }
  }
  const suburbs = [...suburbSet]
  if (suburbs.length === 1) {
    return suburbs[0]
  }

  const queryLower = query.toLowerCase()
  const match = suburbs.find((suburb) => queryLower.includes(suburb.toLowerCase()))
  if (match !== undefined) {
    return match
  }

  const counts = new Map<string, number>()
  for (const provider of providers) {
    const suburb = provider.suburb.trim()
    if (suburb.length === 0) {
      continue
    }
    counts.set(suburb, (counts.get(suburb) ?? 0) + 1)
  }

  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1])
  const top = ranked[0]
  const runnerUp = ranked[1]
  if (top !== undefined && runnerUp !== undefined && top[1] > runnerUp[1]) {
    return top[0]
  }

  return undefined
}

function hasPublishedInquiryPath(provider: { inquiryUrl?: string }): boolean {
  return provider.inquiryUrl !== undefined && provider.inquiryUrl.length > 0
}

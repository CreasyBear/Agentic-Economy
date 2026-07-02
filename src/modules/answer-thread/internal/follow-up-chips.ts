import type { PublicThreadTurn } from '../answer-thread.schema'
import { hasEpistemicVocabulary, hasOverclaim } from '@/modules/answer/public'
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
  const llm = (input.llmChips ?? [])
    .filter((chip) => validateFollowUpChip(chip, 1))
    .map((chip) => ({ label: chip, submitQuery: chip }))
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
  const providerCards = turn.artifacts.find((artifact) => artifact.kind === 'provider-cards')
  const providers =
    providerCards?.kind === 'provider-cards' ? providerCards.providers : []

  if (providers.some((provider) => provider.inquiryUrl !== undefined)) {
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

export function validateFollowUpChip(chip: string, priorQueryCount: number): boolean {
  const trimmed = chip.trim()
  if (trimmed.length === 0 || trimmed.length > 120) {
    return false
  }

  if (hasEpistemicVocabulary(trimmed) || hasOverclaim(trimmed)) {
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
  const suburbs = [...new Set(providers.map((provider) => provider.suburb.trim()).filter((value) => value.length > 0))]
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

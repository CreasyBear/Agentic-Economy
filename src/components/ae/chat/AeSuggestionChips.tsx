import { useEffect, useState } from 'react'

import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { loadEnabledFollowUpChips } from '@/modules/answer-thread/client'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'
import {
  buildDeterministicFollowUpChips,
  type FollowUpChip,
} from '@/modules/answer-thread/public'

export type AeSuggestionItem = {
  label: string
  value: string
}

export type AeAnswerSuggestionsProps = {
  suggestions: readonly string[] | readonly AeSuggestionItem[]
  onSelect: (query: string) => void
  /** Landing example pills vs thread follow-up chips. */
  variant?: 'landing' | 'follow-up'
  disabled?: boolean
  'aria-label'?: string
}

function normalizeSuggestions(
  suggestions: readonly string[] | readonly AeSuggestionItem[],
): readonly AeSuggestionItem[] {
  return suggestions.map((item) =>
    typeof item === 'string' ? { label: item, value: item } : item,
  )
}

/** Shared chip row for landing examples and thread follow-ups. */
export function AeAnswerSuggestions({
  suggestions,
  onSelect,
  variant = 'landing',
  disabled = false,
  'aria-label': ariaLabel,
}: AeAnswerSuggestionsProps) {
  const items = normalizeSuggestions(suggestions)
  if (items.length === 0) {
    return null
  }

  return (
    <Suggestions
      {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
    >
      {items.map((item) => (
        <Suggestion
          key={item.value}
          suggestion={item.value}
          variant="secondary"
          size="sm"
          disabled={disabled}
          onClick={onSelect}
        >
          {item.label}
        </Suggestion>
      ))}
    </Suggestions>
  )
}

export type AeFollowUpChipsProps = {
  turn: PublicThreadTurn
  onSelect?: (query: string) => void
  contextPlacement?: 'current' | 'carried'
}

/** Deterministic follow-ups with optional LLM chips after eval gate. */
export function AeFollowUpChips({ turn, onSelect, contextPlacement = 'current' }: AeFollowUpChipsProps) {
  const hydrated = useClientMounted()
  const [chips, setChips] = useState<FollowUpChip[]>(() => buildDeterministicFollowUpChips(turn))

  useEffect(() => {
    const controller = new AbortController()
    setChips(buildDeterministicFollowUpChips(turn))

    void loadEnabledFollowUpChips(turn, controller.signal).then((loadedChips) => {
      if (loadedChips !== undefined && !controller.signal.aborted) setChips([...loadedChips])
    })

    return () => {
      controller.abort()
    }
  }, [turn])

  if (chips.length === 0 || onSelect === undefined) {
    return null
  }

  const summary = followUpSummary(turn, chips, contextPlacement)

  return (
    <section className="grid gap-3 rounded-md border border-border bg-card p-3" aria-label="Continue this thread">
      <div className="grid gap-0.5">
        <p className="font-heading text-sm text-foreground">Continue with these listings</p>
        <p className="text-xs leading-snug text-muted-foreground">{summary}</p>
      </div>
      <AeAnswerSuggestions
        variant="follow-up"
        aria-label="Suggested follow-ups"
        suggestions={chips.map((chip) => ({ label: chip.label, value: chip.submitQuery }))}
        disabled={!hydrated}
        onSelect={onSelect}
      />
    </section>
  )
}

function followUpSummary(
  turn: PublicThreadTurn,
  chips: readonly FollowUpChip[],
  contextPlacement: NonNullable<AeFollowUpChipsProps['contextPlacement']>,
): string {
  const providers = extractProviders(turn)
  const hasListedBusinesses = providers.length > 0
  const hasInquiryReadyBusiness = providers.some((provider) =>
    typeof provider.inquiryUrl === 'string' && provider.inquiryUrl.length > 0)

  if (chips.some(isInquiryHandoffChip)) {
    if (contextPlacement === 'carried') {
      return 'Narrow, compare, or prepare a qualified inquiry from the businesses already found in this thread.'
    }
    return 'Narrow, compare, or prepare a qualified inquiry from the listed businesses above.'
  }

  if (hasListedBusinesses && !hasInquiryReadyBusiness) {
    return 'These listings need a published inquiry path before AE can route contact. Narrow, compare, or review a listing.'
  }

  if (turn.artifacts.some((artifact) => artifact.kind === 'selected-provider')) {
    if (contextPlacement === 'carried') {
      return 'Use the selected inquiry path from this thread, or keep narrowing this thread.'
    }
    return 'Use the selected inquiry path above, or keep narrowing this thread.'
  }

  if (chips.some((chip) => chip.label === 'Only inquiry-ready listings')) {
    return 'Filter to inquiry-ready listings, or keep narrowing this thread.'
  }

  return 'Narrow or compare the listed businesses from this thread.'
}

function isInquiryHandoffChip(chip: FollowUpChip): boolean {
  return /^(?:prepare|send|start) a qualified inquiry(?:\s+(?:for|to|with)\b|$)/i.test(chip.submitQuery.trim())
}

function extractProviders(turn: PublicThreadTurn): Record<string, unknown>[] {
  const providersBySlug = new Map<string, Record<string, unknown>>()

  for (const artifact of turn.artifacts) {
    if (artifact.kind === 'selected-provider') {
      providersBySlug.set(artifact.provider.slug, { ...artifact.provider })
      continue
    }

    if (artifact.kind !== 'provider-cards' && artifact.kind !== 'provider-compare-table') {
      continue
    }

    for (const provider of artifact.providers) {
      if (providersBySlug.has(provider.slug)) {
        continue
      }
      providersBySlug.set(provider.slug, { ...provider })
    }
  }

  return [...providersBySlug.values()]
}

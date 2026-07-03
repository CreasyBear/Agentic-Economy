import { useEffect, useState } from 'react'

import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
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
  'aria-label': ariaLabel,
}: AeAnswerSuggestionsProps) {
  const items = normalizeSuggestions(suggestions)
  if (items.length === 0) {
    return null
  }

  return (
    <Suggestions
      aria-label={ariaLabel}
      wrap
    >
      {items.map((item) => (
        <Suggestion
          key={item.value}
          suggestion={item.value}
          variant="secondary"
          size="sm"
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
  const [chips, setChips] = useState<FollowUpChip[]>(() => buildDeterministicFollowUpChips(turn))

  useEffect(() => {
    let cancelled = false
    setChips(buildDeterministicFollowUpChips(turn))

    void fetch('/api/answer/eval-status')
      .then(async (response) => {
        if (!response.ok || cancelled) {
          return false
        }
        const body = (await response.json()) as { llmChipsEnabled?: boolean }
        return body.llmChipsEnabled === true
      })
      .then(async (llmChipsEnabled) => {
        if (!llmChipsEnabled || cancelled) {
          return
        }

        const providers = extractProviders(turn)
        const response = await fetch('/api/answer/follow-up-chips', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: turn.query, providers }),
        })
        if (!response.ok || cancelled) {
          return
        }

        const body = (await response.json()) as { chips?: FollowUpChip[] }
        if (cancelled || !Array.isArray(body.chips) || body.chips.length === 0) {
          return
        }
        setChips(body.chips)
      })
      .catch(() => {
        // Deterministic chips already shown.
      })

    return () => {
      cancelled = true
    }
  }, [turn])

  if (chips.length === 0 || onSelect === undefined) {
    return null
  }

  const summary = followUpSummary(turn, chips, contextPlacement)

  return (
    <section className="grid gap-3 rounded-md border border-border bg-surface p-3" aria-label="Continue this thread">
      <div className="grid gap-0.5">
        <p className="font-heading text-sm text-primary">Continue with these listings</p>
        <p className="text-xs leading-snug text-secondary">{summary}</p>
      </div>
      <AeAnswerSuggestions
        variant="follow-up"
        aria-label="Suggested follow-ups"
        suggestions={chips.map((chip) => ({ label: chip.label, value: chip.submitQuery }))}
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
  if (chips.some((chip) => chip.label === 'Start qualified inquiry')) {
    if (contextPlacement === 'carried') {
      return 'Narrow, compare, or start a qualified inquiry from the businesses already found in this thread.'
    }
    return 'Narrow, compare, or start a qualified inquiry from the listed businesses above.'
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

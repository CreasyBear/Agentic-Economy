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

  const chipClass =
    variant === 'follow-up' ? 'ae-follow-up-chips__chip' : 'ae-query-box__example'

  return (
    <Suggestions
      className={variant === 'follow-up' ? 'ae-follow-up-chips' : 'ae-query-box__examples'}
      aria-label={ariaLabel}
      wrap={variant === 'follow-up'}
    >
      {items.map((item) => (
        <Suggestion
          key={item.value}
          suggestion={item.value}
          variant="outline"
          size="sm"
          className={`${chipClass} rounded-[var(--ae-radius-sm)]`}
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
}

/** Deterministic follow-ups with optional LLM chips after eval gate. */
export function AeFollowUpChips({ turn, onSelect }: AeFollowUpChipsProps) {
  const [chips, setChips] = useState<FollowUpChip[]>(() => buildDeterministicFollowUpChips(turn))
  const [llmChipsEnabled, setLlmChipsEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetch('/api/answer/eval-status')
      .then(async (response) => {
        if (!response.ok || cancelled) {
          return
        }
        const body = (await response.json()) as { llmChipsEnabled?: boolean }
        if (!cancelled) {
          setLlmChipsEnabled(body.llmChipsEnabled === true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLlmChipsEnabled(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (llmChipsEnabled !== true) {
      setChips(buildDeterministicFollowUpChips(turn))
      return
    }

    let cancelled = false
    const providers = extractProviders(turn)

    void fetch('/api/answer/follow-up-chips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: turn.query, providers }),
    })
      .then(async (response) => {
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
  }, [turn.turnId, turn.query, turn.artifacts, llmChipsEnabled])

  if (chips.length === 0 || onSelect === undefined) {
    return null
  }

  return (
    <AeAnswerSuggestions
      variant="follow-up"
      aria-label="Suggested follow-ups"
      suggestions={chips.map((chip) => ({ label: chip.label, value: chip.submitQuery }))}
      onSelect={onSelect}
    />
  )
}

function extractProviders(turn: PublicThreadTurn): Record<string, unknown>[] {
  const providerCards = turn.artifacts.find((artifact) => artifact.kind === 'provider-cards')
  if (providerCards?.kind !== 'provider-cards') {
    return []
  }
  return providerCards.providers.map((provider) => ({ ...provider }))
}

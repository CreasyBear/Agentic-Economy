import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'

export type AeSuggestionItem = {
  label: string
  value: string
}

export type AeAnswerSuggestionsProps = {
  suggestions: readonly string[] | readonly AeSuggestionItem[]
  onSelect: (query: string) => void
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

/** Landing example pills. Thread follow-up chips were removed from the chat host. */
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
      variant={variant}
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

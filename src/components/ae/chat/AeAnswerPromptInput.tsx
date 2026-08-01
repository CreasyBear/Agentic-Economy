import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { SearchIcon } from 'lucide-react'

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Button } from '@/components/ui/button'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { NeedTimingValues, type NeedTiming } from '@/modules/answer/search-context'

import { AeAnswerSuggestions } from './AeSuggestionChips'

export type AeAnswerPromptInputProps = {
  onSubmit: (query: string, timing: NeedTiming, timingDate?: string) => void
  defaultValue?: string
  initialTiming?: NeedTiming
  initialTimingDate?: string
  examples?: readonly string[]
  busy?: boolean
  compact?: boolean
  placeholder?: string
  /** Stable accessible name for the searchbox; defaults to a fixed prompt so it does not shift with the visible placeholder. */
  inputLabel?: string
  ariaLabel?: string
  submitLabel?: string
  focusOnMount?: boolean
}

const DEFAULT_EXAMPLES: readonly string[] = [
  'Emergency plumber Brunswick',
  'Locksmith open now Footscray',
  'Electrician same day Geelong',
]

const QUERY_MAX_LENGTH = 200

// Stable accessible name for the query field. The visible placeholder rotates
// with context (examples, follow-up prompts), but the searchbox's name must not
// - a shifting accessible name is hostile to screen readers and test targeting.
const SEARCHBOX_LABEL = 'What do you need done?'

export function AeAnswerPromptInput({
  defaultValue = '',
  initialTiming = 'flexible',
  initialTimingDate = '',
  examples = DEFAULT_EXAMPLES,
  ...props
}: AeAnswerPromptInputProps) {
  const inputId = useId()
  const initialValue = defaultValue.slice(0, QUERY_MAX_LENGTH)

  return (
    <AeAnswerPromptInputInner
      key={`${initialValue}:${initialTiming}:${initialTimingDate}`}
      inputId={inputId}
      initialValue={initialValue}
      initialTiming={initialTiming}
      initialTimingDate={initialTimingDate}
      examples={examples}
      {...props}
    />
  )
}

function AeAnswerPromptInputInner({
  inputId,
  initialValue,
  initialTiming,
  initialTimingDate,
  onSubmit,
  examples,
  busy = false,
  compact: compactOverride,
  placeholder = 'What do you need done?',
  inputLabel = SEARCHBOX_LABEL,
  ariaLabel = 'Find local service businesses',
  submitLabel = 'Search',
  focusOnMount = false,
}: Omit<AeAnswerPromptInputProps, 'defaultValue' | 'examples' | 'initialTiming' | 'initialTimingDate'> & {
  inputId: string
  initialValue: string
  initialTiming: NeedTiming
  initialTimingDate: string
  examples: NonNullable<AeAnswerPromptInputProps['examples']>
}) {
  const counterId = `${inputId}-counter`
  const hintId = `${inputId}-hint`
  const placeholderId = `${inputId}-placeholder`
  const [value, setValue] = useState(initialValue)
  const [timing, setTiming] = useState<NeedTiming>(initialTiming)
  const hydrated = useClientMounted()
  const [timingDate, setTimingDate] = useState(initialTimingDate)
  const [isComposing, setIsComposing] = useState(false)
  const timingDateValid = timing !== 'date' || (timingDate.length > 0 && timingDate >= localToday())
  const charactersRemaining = QUERY_MAX_LENGTH - value.length
  const showCharacterLimit = charactersRemaining <= 40
  const compact = compactOverride ?? examples.length === 0

  useEffect(() => {
    if (focusOnMount) document.getElementById(inputId)?.focus()
  }, [focusOnMount, inputId])

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || isComposing || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    submitQuery(value)
  }

  function updateValue(nextValue: string) {
    setValue(nextValue.slice(0, QUERY_MAX_LENGTH))
  }

  function submitQuery(query: string) {
    const trimmed = query.slice(0, QUERY_MAX_LENGTH).trim()
    if (trimmed.length === 0 || busy || !timingDateValid) {
      return
    }
    onSubmit(trimmed, timing, timing === 'date' ? timingDate : undefined)
  }

  function handlePromptSubmit(message: PromptInputMessage) {
    submitQuery(message.text)
  }

  return (
    <div className={`flex w-full min-w-0 flex-col${compact ? ' gap-2' : ' gap-3'}`}>
      <PromptInput
        role="search"
        aria-label={ariaLabel}
        className="w-full min-w-0"
        onSubmit={handlePromptSubmit}
      >
        {!compact ? (
          <PromptInputHeader>
            <span className="inline-flex min-h-6 items-center gap-1 text-xs font-medium text-muted-foreground">
              <SearchIcon aria-hidden="true" className="size-4" />
              Local service need
            </span>
            <span
              id={counterId}
              className={`inline-flex min-h-6 items-center font-mono text-xs leading-none text-muted-foreground${showCharacterLimit ? ' opacity-100' : ' opacity-0'}`}
              data-numeric
              aria-live="polite"
            >
              {charactersRemaining} left
            </span>
          </PromptInputHeader>
        ) : null}
        <PromptInputBody>
          <span id={placeholderId} className="sr-only">{placeholder}</span>
          <PromptInputTextarea
            id={inputId}
            className={`max-h-36 min-w-0 w-full flex-1 overflow-y-auto py-1 text-base leading-snug text-foreground placeholder:text-muted-foreground${compact ? ' min-h-9' : ' min-h-12'}`}
            placeholder={placeholder}
            value={value}
            maxLength={QUERY_MAX_LENGTH}
            onChange={(event) => updateValue(event.currentTarget.value)}
            onCompositionEnd={() => setIsComposing(false)}
            onCompositionStart={() => setIsComposing(true)}
            onKeyDown={handleInputKeyDown}
            role="searchbox"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            rows={1}
            aria-describedby={showCharacterLimit ? `${placeholderId} ${hintId} ${counterId}` : `${placeholderId} ${hintId}`}
            aria-label={inputLabel}
            disabled={busy || !hydrated}
          />
        </PromptInputBody>
        <PromptInputFooter className="flex-wrap">
          <PromptInputTools className="flex-wrap">
            <fieldset
              className="flex min-w-0 flex-wrap items-center gap-1 border-0 p-0"
              disabled={busy || !hydrated}
            >
              <legend className="text-xs font-medium text-foreground">When do you need this?</legend>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="When do you need this?">
                {NeedTimingValues.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    variant={timing === option ? 'default' : 'secondary'}
                    size="sm"
                    role="radio"
                    aria-checked={timing === option}
                    disabled={busy || !hydrated}
                    onClick={() => setTiming(option)}
                  >
                    {timingLabel(option)}
                  </Button>
                ))}
              </div>
              {timing === 'date' ? (
                <label className="flex items-center gap-1 text-xs font-medium text-foreground">
                  Date
                  <input
                    type="date"
                    value={timingDate}
                    min={localToday()}
                    required
                    className="min-h-8 rounded-md border border-border bg-card px-2 text-foreground"
                    onChange={(event) => setTimingDate(event.currentTarget.value)}
                  />
                </label>
              ) : null}
            </fieldset>
          </PromptInputTools>
          {!compact ? (
            <span className="hidden text-xs text-muted-foreground sm:block">
              Cited answers from published business details.
            </span>
          ) : null}
          <PromptInputSubmit
            aria-label={busy ? 'Starting your thread' : submitLabel}
            disabled={busy || !hydrated || value.trim().length === 0 || !timingDateValid}
            status={busy ? 'submitted' : 'ready'}
          />
        </PromptInputFooter>
      </PromptInput>

      {examples.length > 0 ? (
        <AeAnswerSuggestions
          suggestions={examples}
          variant="landing"
          aria-label="Example queries"
          onSelect={(example) => {
            setValue(example)
            document.getElementById(inputId)?.focus()
          }}
        />
      ) : null}

      <p id={hintId} className={`text-sm leading-snug text-muted-foreground${compact ? ' hidden' : ''}`}>
        Type a real need. Name another place only when you want to search there.
      </p>
    </div>
  )
}

function timingLabel(timing: NeedTiming): string {
  switch (timing) {
    case 'today': return 'Today'
    case 'this_week': return 'This week'
    case 'flexible': return 'Flexible'
    case 'date': return 'Choose a date'
  }
}

function localToday(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

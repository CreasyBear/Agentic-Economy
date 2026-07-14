import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { SearchIcon } from 'lucide-react'

import { ChatComposer } from '@astryxdesign/core/Chat'
import { Text } from '@astryxdesign/core/Text'
import { Button } from '@astryxdesign/core/Button'

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
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(initialValue)
  const [timing, setTiming] = useState<NeedTiming>(initialTiming)
  const hydrated = useClientMounted()
  const [timingDate, setTimingDate] = useState(initialTimingDate)
  const timingDateValid = timing !== 'date' || (timingDate.length > 0 && timingDate >= localToday())
  const charactersRemaining = QUERY_MAX_LENGTH - value.length
  const showCharacterLimit = charactersRemaining <= 40
  const compact = compactOverride ?? examples.length === 0

  useEffect(() => {
    const input = inputRef.current
    if (input === null) {
      return
    }
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }, [value])

  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus()
  }, [focusOnMount])

  const headerContext = useMemo(
    () => (
      <span
        id={counterId}
        className={`inline-flex min-h-6 items-center font-mono text-xs leading-none text-secondary${showCharacterLimit ? ' opacity-100' : ' opacity-0'}${compact ? ' hidden' : ''}`}
        data-numeric
        aria-live="polite"
      >
        {charactersRemaining} left
      </span>
    ),
    [charactersRemaining, compact, counterId, showCharacterLimit],
  )

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

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    event.preventDefault()
    submitQuery(value)
  }

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitQuery(value)
  }

  return (
    <form
      role="search"
      aria-label={ariaLabel}
      className={`flex w-full min-w-0 flex-col${compact ? ' gap-2' : ' gap-3'}`}
      onSubmit={handleFormSubmit}
    >
      <fieldset className="grid gap-2" disabled={busy || !hydrated}>
        <legend className="text-sm font-medium text-primary">When do you need this?</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="When do you need this?">
          {NeedTimingValues.map((option) => (
            <Button
              key={option}
              label={timingLabel(option)}
              type="button"
              variant={timing === option ? 'primary' : 'secondary'}
              size="sm"
              role="radio"
              aria-checked={timing === option}
              isDisabled={busy || !hydrated}
              onClick={() => setTiming(option)}
            />
          ))}
        </div>
        {timing === 'date' ? (
          <label className="grid max-w-xs gap-1 text-sm font-medium text-primary">
            Date
            <input
              type="date"
              value={timingDate}
              min={localToday()}
              required
              className="min-h-11 rounded-md border border-border bg-card px-3 text-primary"
              onChange={(event) => setTimingDate(event.currentTarget.value)}
            />
          </label>
        ) : null}
      </fieldset>
      <ChatComposer
        className="w-full min-w-0"
        value={value}
        onChange={updateValue}
        onSubmit={submitQuery}
        placeholder={placeholder}
        isDisabled={busy || !hydrated}
        isStopShown={busy}
        density={compact ? 'compact' : 'balanced'}
        headerActions={
          <span className={`inline-flex items-center gap-1 text-xs font-medium text-secondary${compact ? ' hidden' : ''}`}>
            <SearchIcon aria-hidden="true" />
            Local service need
          </span>
        }
        headerContext={headerContext}
        footerActions={
          compact ? null : (
            <Text type="supporting" color="secondary" size="sm" className="hidden sm:block">
              Cited answers from published business details.
            </Text>
          )
        }
        sendButton={<Button label={busy ? 'Starting your thread' : submitLabel} type="submit" variant="primary" isDisabled={busy || !hydrated || value.trim().length === 0 || !timingDateValid} />}
        input={
          <textarea
            id={inputId}
            ref={inputRef}
            name="q"
            className={`max-h-36 min-w-0 w-full flex-1 resize-none overflow-y-auto border-0 bg-transparent py-1 text-base leading-snug text-primary outline-none placeholder:text-secondary${compact ? ' min-h-9' : ' min-h-12'}`}
            placeholder={placeholder}
            value={value}
            maxLength={QUERY_MAX_LENGTH}
            onChange={(event) => updateValue(event.currentTarget.value)}
            onKeyDown={handleInputKeyDown}
            role="searchbox"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            rows={1}
            aria-describedby={showCharacterLimit ? `${hintId} ${counterId}` : hintId}
            aria-label={inputLabel}
            disabled={busy || !hydrated}
          />
        }
      />

      {examples.length > 0 ? (
        <AeAnswerSuggestions
          suggestions={examples}
          variant="landing"
          aria-label="Example queries"
          onSelect={(example) => {
            setValue(example)
            inputRef.current?.focus()
          }}
        />
      ) : null}

      <p id={hintId} className={`text-sm leading-snug text-secondary${compact ? ' hidden' : ''}`}>
        Type a real need. Name another place only when you want to search there.
      </p>
    </form>
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

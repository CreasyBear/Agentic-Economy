import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { SearchIcon } from 'lucide-react'

import { ChatComposer } from '@astryxdesign/core/Chat'
import { Text } from '@astryxdesign/core/Text'

import { useClientMounted } from '@/hooks/use-client-mounted'

import { AeAnswerSuggestions } from './AeSuggestionChips'

export type AeAnswerPromptInputProps = {
  onSubmit: (query: string) => void
  defaultValue?: string
  examples?: readonly string[]
  busy?: boolean
  compact?: boolean
  placeholder?: string
  ariaLabel?: string
}

const DEFAULT_EXAMPLES: readonly string[] = [
  'Emergency plumber Brunswick',
  'Locksmith open now Footscray',
  'Electrician same day Geelong',
]

const QUERY_MAX_LENGTH = 200

export function AeAnswerPromptInput({
  onSubmit,
  defaultValue = '',
  examples = DEFAULT_EXAMPLES,
  busy = false,
  compact: compactOverride,
  placeholder = 'What do you need done?',
  ariaLabel = 'Find local service businesses',
}: AeAnswerPromptInputProps) {
  const inputId = useId()
  const counterId = `${inputId}-counter`
  const hintId = `${inputId}-hint`
  const initialValue = defaultValue.slice(0, QUERY_MAX_LENGTH)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(initialValue)
  const hydrated = useClientMounted()
  const charactersRemaining = QUERY_MAX_LENGTH - value.length
  const showCharacterLimit = charactersRemaining <= 40
  const compact = compactOverride ?? examples.length === 0

  useEffect(() => {
    setValue(defaultValue.slice(0, QUERY_MAX_LENGTH))
  }, [defaultValue])

  useEffect(() => {
    const input = inputRef.current
    if (input === null) {
      return
    }
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }, [value])

  function updateValue(nextValue: string) {
    setValue(nextValue.slice(0, QUERY_MAX_LENGTH))
  }

  function submitQuery(query: string) {
    const trimmed = query.slice(0, QUERY_MAX_LENGTH).trim()
    if (trimmed.length === 0) {
      return
    }
    onSubmit(trimmed)
    if (!busy) {
      setValue('')
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    event.preventDefault()
    submitQuery(value)
  }

  return (
    <div className={`flex w-full min-w-0 flex-col${compact ? ' gap-2' : ' gap-3'}`}>
      <ChatComposer
        className="w-full min-w-0"
        role="search"
        aria-label={ariaLabel}
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
        headerContext={
          <span
            id={counterId}
            className={`inline-flex min-h-6 items-center font-mono text-xs leading-none text-secondary${showCharacterLimit ? ' opacity-100' : ' opacity-0'}${compact ? ' hidden' : ''}`}
            data-numeric
            aria-live="polite"
          >
            {charactersRemaining} left
          </span>
        }
        footerActions={
          compact ? null : (
            <Text type="supporting" color="secondary" size="sm" className="hidden sm:block">
              Cited answers from published business details.
            </Text>
          )
        }
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
            aria-label={placeholder}
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
            submitQuery(example)
          }}
        />
      ) : null}

      <p id={hintId} className={`text-sm leading-snug text-secondary${compact ? ' hidden' : ''}`}>
        Type a real need. Name another place only when you want to search there.
      </p>
    </div>
  )
}

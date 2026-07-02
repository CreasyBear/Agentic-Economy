import { useEffect, useId, useRef, useState } from 'react'
import { SearchIcon } from 'lucide-react'

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { Spinner } from '@/components/ui/spinner'

import { AeAnswerSuggestions } from './AeSuggestionChips'

export type AeAnswerPromptInputProps = {
  onSubmit: (query: string) => void
  defaultValue?: string
  examples?: readonly string[]
  busy?: boolean
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
}: AeAnswerPromptInputProps) {
  const inputId = useId()
  const counterId = `${inputId}-counter`
  const initialValue = defaultValue.slice(0, QUERY_MAX_LENGTH)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(initialValue)
  const [hydrated, setHydrated] = useState(false)
  const charactersRemaining = QUERY_MAX_LENGTH - value.length
  const showCharacterLimit = charactersRemaining <= 40
  const compact = examples.length === 0

  useEffect(() => {
    setHydrated(true)
  }, [])

  useEffect(() => {
    const input = inputRef.current
    if (input === null) {
      return
    }
    input.style.height = 'auto'
    input.style.height = `${input.scrollHeight}px`
  }, [value])

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

  return (
    <div className={`ae-query-box ae-answer-prompt-input${compact ? ' ae-answer-prompt-input--compact' : ''}`}>
      <PromptInput
        action="/ask"
        method="get"
        className="ae-answer-prompt-input__form"
        role="search"
        aria-label="Find local service providers"
        onSubmit={(message) => submitQuery(message.text)}
      >
        <PromptInputHeader className="ae-query-box__toolbar">
          <PromptInputTools>
            <span className="ae-query-box__icon" aria-hidden="true">
              <SearchIcon />
            </span>
            <span className="ae-query-box__toolbar-label">Local service need</span>
          </PromptInputTools>
          <span
            id={counterId}
            className={`ae-query-box__counter${showCharacterLimit ? ' ae-query-box__counter--visible' : ''}`}
            data-numeric
            aria-live="polite"
          >
            {charactersRemaining} left
          </span>
        </PromptInputHeader>
        <PromptInputBody>
          <PromptInputTextarea
            id={inputId}
            name="q"
            className="ae-query-box__input ae-query-box__textarea"
            placeholder="What do you need done?"
            ref={inputRef}
            value={value}
            maxLength={QUERY_MAX_LENGTH}
            onChange={(event) => setValue(event.currentTarget.value)}
            role="searchbox"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            rows={1}
            aria-describedby={showCharacterLimit ? `${inputId}-hint ${counterId}` : `${inputId}-hint`}
            aria-label="What do you need done?"
            disabled={busy || !hydrated}
          />
        </PromptInputBody>
        <PromptInputFooter className="ae-query-box__footer">
          <PromptInputSubmit
            status={busy ? 'submitted' : 'ready'}
            variant="landingPrimary"
            size="sm"
            className="ae-query-box__submit"
            aria-label={busy ? 'Building answer' : 'Ask'}
            disabled={busy || !hydrated}
          >
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {busy ? 'Building' : 'Ask'}
          </PromptInputSubmit>
        </PromptInputFooter>
      </PromptInput>

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

      <p id={`${inputId}-hint`} className="ae-query-box__hint">
        Type a real need. Name another place only when you want to search there.
      </p>
    </div>
  )
}

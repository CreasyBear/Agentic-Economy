import { useId, useState, type FormEvent, type KeyboardEvent } from 'react'
import { SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
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
  const [value, setValue] = useState(defaultValue.slice(0, QUERY_MAX_LENGTH))
  const charactersRemaining = QUERY_MAX_LENGTH - value.length
  const showCharacterLimit = charactersRemaining <= 40

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitQuery(value)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault()
      submitQuery(value)
    }
  }

  return (
    <div className="ae-query-box ae-answer-prompt-input">
      <label htmlFor={inputId} className="ae-query-box__label">
        What do you need done?
      </label>

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

      <form
        action="/ask"
        method="get"
        className="ae-answer-prompt-input__form"
        role="search"
        aria-label="Find local service providers"
        onSubmit={handleSubmit}
      >
        <InputGroup className="ae-answer-prompt-input__group ae-query-box__row">
          <InputGroupAddon align="inline-start" className="ae-query-box__icon">
            <SearchIcon aria-hidden="true" className="size-5" />
          </InputGroupAddon>
          <InputGroupInput
            id={inputId}
            name="q"
            type="search"
            className="ae-query-box__input"
            placeholder="No hot water in Preston 3072"
            value={value}
            maxLength={QUERY_MAX_LENGTH}
            onChange={(event) => setValue(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            aria-describedby={`${inputId}-hint`}
            disabled={busy}
          />
          <InputGroupAddon align="inline-end">
            <Button
              type="submit"
              variant="landingPrimary"
              className="ae-query-box__submit"
              disabled={busy || value.trim().length === 0}
            >
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Ask
            </Button>
          </InputGroupAddon>
        </InputGroup>
      </form>

      <p id={`${inputId}-hint`} className="ae-query-box__hint">
        Type a real need and a place. The answer cites listed local businesses.
        {showCharacterLimit ? ` ${charactersRemaining} characters left.` : null}
      </p>
    </div>
  )
}

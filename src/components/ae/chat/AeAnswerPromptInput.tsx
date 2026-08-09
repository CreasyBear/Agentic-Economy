import { type ClipboardEvent, useEffect, useId, useState } from 'react'
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
import { buttonVariants } from '@/components/ui/button-variants'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useClientMounted } from '@/hooks/use-client-mounted'
import { cn } from '@/lib/utils'
import { QUERY_MAX_LENGTH } from '@/lib/query-length'
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
  showTiming?: boolean
  placeholder?: string
  /** Stable accessible name for the searchbox; defaults to a fixed prompt so it does not shift with the visible placeholder. */
  inputLabel?: string
  ariaLabel?: string
  submitLabel?: string
  focusOnMount?: boolean
}

const DEFAULT_EXAMPLES: readonly string[] = [
  'I need an emergency plumber in Brunswick',
  'I need a locksmith in Footscray right now',
  'I need an electrician in Geelong today',
]


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
  const initialValue = defaultValue
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
  showTiming = true,
  compact: compactOverride,
  placeholder = 'e.g. Get a quote for solar installation, or the current price of bitcoin',
  inputLabel = SEARCHBOX_LABEL,
  ariaLabel = 'Ask a question or describe what you need done',
  submitLabel = 'Ask',
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
  const timingDateId = `${inputId}-timing-date`
  const [value, setValue] = useState(initialValue)
  const [queryError, setQueryError] = useState(false)
  const [timing, setTiming] = useState<NeedTiming>(initialTiming)
  const hydrated = useClientMounted()
  const [timingDate, setTimingDate] = useState(initialTimingDate)
  const timingDateValid = timing !== 'date' || (timingDate.length > 0 && timingDate >= localToday())
  const charactersRemaining = QUERY_MAX_LENGTH - value.length
  const queryTooLong = value.length > QUERY_MAX_LENGTH
  const showCharacterLimit = queryTooLong || charactersRemaining <= 40
  const compact = compactOverride ?? examples.length === 0

  useEffect(() => {
    if (focusOnMount) document.getElementById(inputId)?.focus()
  }, [focusOnMount, inputId])


  function updateValue(nextValue: string) {
    setValue(nextValue)
    setQueryError(false)
  }

  function submitQuery(query: string) {
    if (query.length > QUERY_MAX_LENGTH) {
      setQueryError(true)
      return
    }
    const trimmed = query.trim()
    if (trimmed.length === 0 || busy || !timingDateValid) {
      return
    }
    setQueryError(false)
    onSubmit(trimmed, timing, timing === 'date' ? timingDate : undefined)
  }

  function handlePromptSubmit(message: PromptInputMessage) {
    submitQuery(message.text)
  }

  function handlePromptPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData?.getData('text') ?? ''
    const start = event.currentTarget.selectionStart ?? value.length
    const end = event.currentTarget.selectionEnd ?? value.length
    const nextLength = value.length - (end - start) + pasted.length
    if (nextLength > QUERY_MAX_LENGTH) {
      event.preventDefault()
      setQueryError(true)
    }
  }


  return (
    <div className={cn('flex w-full min-w-0 flex-col', compact ? 'gap-2' : 'gap-3')}>
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
              What you need done?
            </span>
            <span
              id={counterId}
              className={cn('inline-flex min-h-6 items-center font-mono text-xs leading-none text-muted-foreground', showCharacterLimit ? 'opacity-100' : 'opacity-0')}
              data-numeric
              aria-live={showCharacterLimit ? 'polite' : undefined}
            >
              {value.length} / {QUERY_MAX_LENGTH} characters
            </span>
          </PromptInputHeader>
        ) : null}
        <PromptInputBody>
          <span id={placeholderId} className="sr-only">{placeholder}</span>
          <PromptInputTextarea
            id={inputId}
            className={cn('max-h-36 min-w-0 w-full flex-1 overflow-y-auto py-1 text-base leading-snug text-foreground placeholder:text-muted-foreground', compact ? 'min-h-11 sm:min-h-9' : 'min-h-12')}
            placeholder={placeholder}
            value={value}
            maxLength={QUERY_MAX_LENGTH}
            onChange={(event) => updateValue(event.currentTarget.value)}
            onInvalid={() => setQueryError(true)}
            onPaste={handlePromptPaste}
            role="searchbox"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            rows={1}
            aria-describedby={`${placeholderId} ${hintId} ${counterId}`}
            aria-invalid={queryError || queryTooLong ? 'true' : undefined}
            aria-label={inputLabel}
            disabled={busy || !hydrated}
          />
        </PromptInputBody>
        <PromptInputFooter className="flex-wrap">
          {/* Timing selection is an idle-only choice: showing it disabled during a
              turn implies the selection is still editable. Selected timing state
              lives in this component, so it returns unchanged once the turn settles. */}
          {busy || !showTiming ? null : (
            <PromptInputTools className="flex-wrap">
              <fieldset
                className="flex min-w-0 flex-wrap items-center gap-1 border-0 p-0"
                disabled={!hydrated}
              >
                <legend className="text-xs font-medium text-foreground">When do you need this?</legend>
                <RadioGroup
                  value={timing}
                  onValueChange={(value) => setTiming(value as NeedTiming)}
                  disabled={!hydrated}
                  aria-label="When do you need this?"
                  className="flex flex-wrap gap-1.5"
                >
                  {NeedTimingValues.map((option) => (
                    <RadioGroupItem
                      key={option}
                      value={option}
                      className={cn(buttonVariants({ variant: timing === option ? 'default' : 'secondary', size: 'sm' }), 'aspect-auto w-auto [&_[data-slot=radio-group-indicator]]:hidden')}
                    >
                      {timingLabel(option)}
                    </RadioGroupItem>
                  ))}
                </RadioGroup>
                {timing === 'date' ? (
                  <Field
                    orientation="horizontal"
                    className="w-auto flex-none items-center gap-1.5 [&>[data-slot=field-label]]:flex-none"
                  >
                    <FieldLabel htmlFor={timingDateId} className="text-xs font-medium text-foreground">
                      Date
                    </FieldLabel>
                    <Input
                      id={timingDateId}
                      type="date"
                      value={timingDate}
                      min={localToday()}
                      required
                      className="h-8 w-auto min-w-0 bg-card px-2 text-xs max-sm:h-8 md:text-xs"
                      onChange={(event) => setTimingDate(event.currentTarget.value)}
                    />
                  </Field>
                ) : null}
              </fieldset>
            </PromptInputTools>
          )}
          {!compact ? (
            <span className="hidden text-xs text-muted-foreground sm:block">
              Answers based on business information.
            </span>
          ) : (
            <span
              id={counterId}
              className="font-mono text-xs tabular-nums text-muted-foreground"
              data-numeric
              aria-live={showCharacterLimit ? 'polite' : undefined}
            >
              {value.length} / {QUERY_MAX_LENGTH} characters
            </span>
          )}
          <PromptInputSubmit
            aria-label={busy ? 'Starting your thread' : submitLabel}
            disabled={busy || !hydrated || value.trim().length === 0 || queryTooLong || !timingDateValid}
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
            setQueryError(false)
            document.getElementById(inputId)?.focus()
          }}
        />
      ) : null}

      <p id={hintId} className="text-sm leading-snug text-muted-foreground">
        {queryError || queryTooLong
          ? `Keep your question to ${QUERY_MAX_LENGTH} characters or fewer before asking.`
          : `Describe what you need done. Add a place if it matters. Up to ${QUERY_MAX_LENGTH} characters.`}
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

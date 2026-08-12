import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { ArrowUpIcon } from 'lucide-react'

import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from '@/components/ui/input-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
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
  const composingRef = useRef(false)
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

  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    submitQuery(value)
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }
    if (composingRef.current || event.nativeEvent.isComposing) {
      return
    }
    event.preventDefault()
    event.currentTarget.form?.requestSubmit()
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
      <form
        role="search"
        aria-label={ariaLabel}
        aria-busy={busy}
        className="w-full min-w-0"
        onSubmit={handleFormSubmit}
      >
        <InputGroup className="overflow-hidden">
          <span id={placeholderId} className="sr-only">{placeholder}</span>
          <InputGroupTextarea
            id={inputId}
            name="message"
            className={cn(
              'min-w-0 w-full flex-1 overflow-y-auto p-3.5 text-base leading-snug text-foreground placeholder:text-muted-foreground',
              compact ? 'max-h-24 min-h-11 sm:min-h-9' : 'max-h-36 min-h-12',
            )}
            placeholder={placeholder}
            value={value}
            maxLength={QUERY_MAX_LENGTH}
            onChange={(event) => updateValue(event.currentTarget.value)}
            onCompositionStart={() => {
              composingRef.current = true
            }}
            onCompositionEnd={() => {
              composingRef.current = false
            }}
            onInvalid={() => setQueryError(true)}
            onKeyDown={handlePromptKeyDown}
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
          <InputGroupAddon align="block-end" className="flex-wrap justify-between gap-2">
            {/* Timing selection is an idle-only choice: showing it disabled during a
                turn implies the selection is still editable. Selected timing state
                lives in this component, so it returns unchanged once the turn settles. */}
            {busy || !showTiming ? null : (
              <>
                <Select
                  value={timing}
                  onValueChange={(value) => setTiming(value as NeedTiming)}
                  disabled={!hydrated}
                >
                  <SelectTrigger
                    size="sm"
                    aria-label="When do you need this?"
                    className="max-w-full flex-none"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {NeedTimingValues.map((option) => (
                        <SelectItem key={option} value={option}>
                          {timingLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
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
                      disabled={!hydrated}
                      className="h-8 w-auto min-w-0 bg-card px-2 text-xs max-sm:h-8 md:text-xs"
                      onChange={(event) => setTimingDate(event.currentTarget.value)}
                    />
                  </Field>
                ) : null}
              </>
            )}
            {!compact ? (
              <>
                <span
                  id={counterId}
                  className={cn('font-mono text-xs leading-none text-muted-foreground', showCharacterLimit ? 'opacity-100' : 'opacity-0')}
                  data-numeric
                  aria-live={showCharacterLimit ? 'polite' : undefined}
                >
                  {value.length} / {QUERY_MAX_LENGTH} characters
                </span>
                <span className="hidden text-xs text-muted-foreground sm:block">
                  Answers based on business information.
                </span>
              </>
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
            <InputGroupButton
              type="submit"
              size="icon-sm"
              variant="default"
              aria-label={busy ? 'Starting your thread' : submitLabel}
              className="ml-auto flex-none"
              disabled={busy || !hydrated || value.trim().length === 0 || queryTooLong || !timingDateValid}
            >
              {busy ? <Spinner /> : <ArrowUpIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>

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

      <p id={hintId} className={compact ? 'sr-only' : 'text-sm leading-snug text-muted-foreground'}>
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

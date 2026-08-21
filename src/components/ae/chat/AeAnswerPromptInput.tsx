import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { ArrowUpIcon, SquareIcon } from 'lucide-react'

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
import { AE_CATALOG_EXAMPLE_ASKS } from '@/modules/answer/catalog-example-asks'
import { NeedTimingValues, type NeedTiming } from '@/modules/answer/search-context'

import { AeAnswerSuggestions, type AeSuggestionItem } from './AeSuggestionChips'

export type AeAnswerPromptInputProps = {
  onSubmit: (query: string, timing: NeedTiming, timingDate?: string) => void
  defaultValue?: string
  onStop?: () => void
  initialTiming?: NeedTiming
  initialTimingDate?: string
  examples?: readonly string[] | readonly AeSuggestionItem[]
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

export const AE_CHAT_MARKET_EXAMPLES: readonly AeSuggestionItem[] = AE_CATALOG_EXAMPLE_ASKS.map(
  (ask) => ({ label: ask.label, value: ask.query }),
)


// Stable accessible name for the query field. The visible placeholder rotates
// with context (examples, follow-up prompts), but the searchbox's name must not
// - a shifting accessible name is hostile to screen readers and test targeting.
const SEARCHBOX_LABEL = 'What do you need done?'

export function AeAnswerPromptInput({
  defaultValue = '',
  initialTiming = 'flexible',
  initialTimingDate = '',
  examples = AE_CHAT_MARKET_EXAMPLES,
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
  onStop,
  busy = false,
  showTiming = true,
  compact: compactOverride,
  placeholder = 'Get a solar installation quote',
  inputLabel = SEARCHBOX_LABEL,
  ariaLabel = 'Ask a question or describe what you need done',
  submitLabel = 'Send',
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
  const [queryError, setQueryError] = useState<'empty' | 'too-long' | null>(null)
  const [timing, setTiming] = useState<NeedTiming>(initialTiming)
  const hydrated = useClientMounted()
  const [timingDate, setTimingDate] = useState(initialTimingDate)
  const charactersRemaining = QUERY_MAX_LENGTH - value.length
  const queryTooLong = value.length > QUERY_MAX_LENGTH
  const showCharacterLimit = queryTooLong || charactersRemaining <= 40
  const compact = compactOverride ?? examples.length === 0

  useEffect(() => {
    if (focusOnMount) document.getElementById(inputId)?.focus()
  }, [focusOnMount, inputId])

  function updateValue(nextValue: string) {
    setValue(nextValue)
    setQueryError(null)
  }

  function submitQuery(query: string) {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setQueryError('empty')
      document.getElementById(inputId)?.focus()
      return
    }
    if (query.length > QUERY_MAX_LENGTH) {
      setQueryError('too-long')
      document.getElementById(inputId)?.focus()
      return
    }
    if (busy) return
    setQueryError(null)
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
            onChange={(event) => updateValue(event.currentTarget.value)}
            onCompositionStart={() => {
              composingRef.current = true
            }}
            onCompositionEnd={() => {
              composingRef.current = false
            }}
            onKeyDown={handlePromptKeyDown}
            role="searchbox"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            rows={1}
            aria-describedby={`${placeholderId} ${hintId}${showCharacterLimit ? ` ${counterId}` : ''}`}
            aria-invalid={queryError !== null ? 'true' : undefined}
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
                    className="max-w-full flex-none max-sm:min-h-11"
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
                      className="h-8 w-auto min-w-0 bg-card px-2 text-base max-sm:h-8 md:text-xs"
                      onChange={(event) => setTimingDate(event.currentTarget.value)}
                    />
                  </Field>
                ) : null}
              </>
            )}
            {showCharacterLimit ? (
              <span
                id={counterId}
                className="font-mono text-xs leading-none text-muted-foreground"
                data-numeric
                aria-live="polite"
              >
                {value.length} / {QUERY_MAX_LENGTH} characters
              </span>
            ) : null}
            <InputGroupButton
              type={busy ? 'button' : 'submit'}
              size="icon-sm"
              variant="default"
              aria-label={busy && onStop !== undefined ? 'Stop generating' : busy ? 'Sending' : submitLabel}
              className="ml-auto flex-none"
              disabled={busy ? onStop === undefined : !hydrated}
              onClick={busy ? onStop : undefined}
            >
              {busy ? (onStop === undefined ? <Spinner /> : <SquareIcon />) : <ArrowUpIcon />}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      <p
        id={hintId}
        className={cn(
          'text-sm leading-snug',
          queryError !== null
            ? 'text-destructive'
            : compact
              ? 'sr-only'
              : 'text-muted-foreground',
        )}
        role={queryError !== null ? 'alert' : undefined}
      >
        {queryError === 'empty'
          ? 'Enter a question or describe what you need before sending.'
          : queryError === 'too-long'
            ? `Your question is too long. Keep it to ${QUERY_MAX_LENGTH} characters or fewer.`
          : `Add a location if it matters. ${QUERY_MAX_LENGTH} characters max.`}
      </p>

      {examples.length > 0 ? (
        <AeAnswerSuggestions
          suggestions={examples}
          variant="landing"
          aria-label="Example queries"
          onSelect={(example) => {
            setValue(example)
            setQueryError(null)
            document.getElementById(inputId)?.focus()
          }}
        />
      ) : null}

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

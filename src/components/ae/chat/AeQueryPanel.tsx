import {
  aeSearchContextLocationLabel,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { AeAnswerPromptInput } from './AeAnswerPromptInput'

export type AeQueryPanelProps = {
  onSubmit: (query: string, timing: AeSearchContext['timing'], timingDate?: string) => void
  defaultValue?: string
  busy?: boolean
  searchContext?: AeSearchContext
  initialTiming?: AeSearchContext['timing']
  initialTimingDate?: string
  showExamples?: boolean
  placeholder?: string
  loopHint?: string
}

export function AeQueryPanel({
  onSubmit,
  defaultValue = '',
  busy = false,
  searchContext,
  initialTiming = 'flexible',
  initialTimingDate = '',
  showExamples = true,
  placeholder,
  loopHint,
}: AeQueryPanelProps) {
  const examples = showExamples ? buildContextExamples(searchContext) : []

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <AeAnswerPromptInput
        onSubmit={onSubmit}
        defaultValue={defaultValue}
        initialTiming={initialTiming}
        initialTimingDate={initialTimingDate}
        busy={busy}
        examples={examples}
        {...(placeholder === undefined ? {} : { placeholder, inputLabel: placeholder })}
      />
      {loopHint !== undefined && loopHint.length > 0 ? (
        <p className="font-mono text-xs leading-snug text-secondary">{loopHint}</p>
      ) : null}
      {showExamples ? (
        <p className="font-mono text-xs leading-snug text-secondary">Cited answers from published business details.</p>
      ) : null}
    </div>
  )
}

function buildContextExamples(searchContext: AeSearchContext | undefined): readonly string[] {
  if (searchContext?.mode !== 'near_me') {
    return [
      'Emergency plumber Parramatta',
      'Compare emergency plumbers',
      'Who can take an inquiry?',
    ]
  }

  const label = aeSearchContextLocationLabel(searchContext)
  if (label === undefined) {
    return [
      'Emergency plumber near me',
      'Locksmith open now',
      'Who can take an inquiry?',
    ]
  }

  const place = label.replace(/,\s*[A-Z]{2,3}$/i, '')
  return [
    `Emergency plumber near ${place}`,
    `Locksmith open now near ${place}`,
    `Who can take an inquiry near ${place}?`,
  ]
}

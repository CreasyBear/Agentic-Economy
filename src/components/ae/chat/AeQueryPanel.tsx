import {
  aeSearchContextLocationLabel,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { AeAnswerPromptInput } from './AeAnswerPromptInput'

export type AeQueryPanelProps = {
  onSubmit: (query: string, timing: AeSearchContext['timing'], timingDate?: string) => void
  onStop?: () => void
  defaultValue?: string
  busy?: boolean
  searchContext?: AeSearchContext
  initialTiming?: AeSearchContext['timing']
  initialTimingDate?: string
  showExamples?: boolean
  showTiming?: boolean
  placeholder?: string
  loopHint?: string
  focusOnMount?: boolean
}

export function AeQueryPanel({
  onSubmit,
  onStop,
  defaultValue = '',
  busy = false,
  searchContext,
  initialTiming = 'flexible',
  initialTimingDate = '',
  showExamples = true,
  showTiming = true,
  placeholder,
  loopHint,
  focusOnMount = false,
}: AeQueryPanelProps) {
  const examples = showExamples ? buildContextExamples(searchContext) : []

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <AeAnswerPromptInput
        onSubmit={onSubmit}
        {...(onStop === undefined ? {} : { onStop })}
        defaultValue={defaultValue}
        initialTiming={initialTiming}
        initialTimingDate={initialTimingDate}
        busy={busy}
        examples={examples}
        showTiming={showTiming}
        focusOnMount={focusOnMount}
        {...(placeholder === undefined ? {} : { placeholder })}
      />
      {loopHint !== undefined && loopHint.length > 0 ? (
        <p className="text-sm leading-snug text-muted-foreground">{loopHint}</p>
      ) : null}
      {showExamples ? (
        <p className="text-sm leading-snug text-muted-foreground">
          Answers can use published business information or available live data.
        </p>
      ) : null}
    </div>
  )
}

function buildContextExamples(searchContext: AeSearchContext | undefined): readonly {
  label: string
  value: string
}[] {
  if (searchContext?.mode !== 'near_me') {
    return [
      { label: 'Emergency plumber', value: 'I need an emergency plumber in Parramatta' },
      { label: 'Locksmith now', value: 'I need a locksmith right now' },
      { label: 'Electrician today', value: 'I need an electrician today' },
    ]
  }

  const label = aeSearchContextLocationLabel(searchContext)
  if (label === undefined) {
    return [
      { label: 'Emergency plumber', value: 'I need an emergency plumber near me' },
      { label: 'Locksmith now', value: 'I need a locksmith near me right now' },
      { label: 'Electrician today', value: 'I need an electrician near me today' },
    ]
  }

  const place = label.replace(/,\s*[A-Z]{2,3}$/i, '')
  return [
    { label: 'Emergency plumber', value: `I need an emergency plumber near ${place}` },
    { label: 'Locksmith now', value: `I need a locksmith near ${place} right now` },
    { label: 'Electrician today', value: `I need an electrician near ${place} today` },
  ]
}

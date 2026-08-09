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
  showTiming?: boolean
  placeholder?: string
  loopHint?: string
  focusOnMount?: boolean
}

export function AeQueryPanel({
  onSubmit,
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
        <p className="font-mono text-xs leading-snug text-muted-foreground">{loopHint}</p>
      ) : null}
      {showExamples ? (
        <p className="font-mono text-xs leading-snug text-muted-foreground">Answers based on business information.</p>
      ) : null}
    </div>
  )
}

function buildContextExamples(searchContext: AeSearchContext | undefined): readonly string[] {
  if (searchContext?.mode !== 'near_me') {
    return [
      'I need an emergency plumber in Parramatta',
      'I need a locksmith right now',
      'I need an electrician today',
    ]
  }

  const label = aeSearchContextLocationLabel(searchContext)
  if (label === undefined) {
    return [
      'I need an emergency plumber near me',
      'I need a locksmith near me right now',
      'I need an electrician near me today',
    ]
  }

  const place = label.replace(/,\s*[A-Z]{2,3}$/i, '')
  return [
    `I need an emergency plumber near ${place}`,
    `I need a locksmith near ${place} right now`,
    `I need an electrician near ${place} today`,
  ]
}

import {
  aeSearchContextLocationLabel,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { AE_CHAT_MARKET_EXAMPLES, AeAnswerPromptInput } from './AeAnswerPromptInput'

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
        <p className="text-xs leading-snug text-muted-foreground">
          Results use published Operation contracts and available live evidence.
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
    return AE_CHAT_MARKET_EXAMPLES
  }

  const label = aeSearchContextLocationLabel(searchContext)
  if (label === undefined) {
    return AE_CHAT_MARKET_EXAMPLES
  }

  const place = label.replace(/,\s*[A-Z]{2,3}$/i, '')
  return [
    ...AE_CHAT_MARKET_EXAMPLES.slice(0, 2),
    { label: 'Local weather', value: `What is the current weather in ${place}?` },
  ]
}

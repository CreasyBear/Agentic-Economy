import {
  aeSearchContextLocationLabel,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { AeAnswerPromptInput } from './AeAnswerPromptInput'
import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'
import { AeModelSelector } from './AeModelSelector'

export type AeQueryPanelProps = {
  onSubmit: (query: string) => void
  defaultValue?: string
  busy?: boolean
  searchContext?: AeSearchContext
  showExamples?: boolean
}

export function AeQueryPanel({
  onSubmit,
  defaultValue = '',
  busy = false,
  searchContext,
  showExamples = true,
}: AeQueryPanelProps) {
  const showModelSelector = import.meta.env.DEV && isStructuredAnswerModeEnabled()
  const examples = showExamples ? buildContextExamples(searchContext) : []

  return (
    <div className="ae-query-panel">
      {showModelSelector ? (
        <div className="ae-query-panel__toolbar">
          <AeModelSelector />
        </div>
      ) : null}
      <AeAnswerPromptInput
        onSubmit={onSubmit}
        defaultValue={defaultValue}
        busy={busy}
        examples={examples}
      />
      <p className="ae-query-panel__boundary">No booking or payment on this page.</p>
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

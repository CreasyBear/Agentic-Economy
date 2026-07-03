import {
  aeSearchContextLocationLabel,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import { AeAnswerPromptInput } from './AeAnswerPromptInput'

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
  const examples = showExamples ? buildContextExamples(searchContext) : []

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <AeAnswerPromptInput
        onSubmit={onSubmit}
        defaultValue={defaultValue}
        busy={busy}
        examples={examples}
      />
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

import { AeAnswerPromptInput } from './AeAnswerPromptInput'
import { isStructuredAnswerModeEnabled } from './AeStructuredAnswerChat'
import { AeModelSelector } from './AeModelSelector'

export type AeQueryPanelProps = {
  onSubmit: (query: string) => void
  defaultValue?: string
  busy?: boolean
}

export function AeQueryPanel({ onSubmit, defaultValue = '', busy = false }: AeQueryPanelProps) {
  const showModelSelector = import.meta.env.DEV && isStructuredAnswerModeEnabled()

  return (
    <div className="ae-query-panel">
      {showModelSelector ? (
        <div className="ae-query-panel__toolbar">
          <AeModelSelector />
        </div>
      ) : null}
      <AeAnswerPromptInput onSubmit={onSubmit} defaultValue={defaultValue} busy={busy} />
      <p className="ae-query-panel__boundary">No booking or payment on this page.</p>
    </div>
  )
}

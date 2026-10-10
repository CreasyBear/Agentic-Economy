// Invariant: chat loads RJSF only after review and keeps JSON editing outside a failed lazy chunk, following Market's form boundary.
import { lazy, Suspense, useState } from 'react'
import { Skeleton } from '@/components/arc/skeleton/skeleton'
import { Textarea } from '@/components/arc/textarea/textarea'
import { chatToolPanel } from '@/lib/public/chat-ia'
import { ToolInputFormBoundary } from '@/components/ae/shared/tool-input-form/ToolInputFormBoundary'
import type { ToolPanelFormProps } from '../tool-panel.contracts'

const LazyAeToolInputForm = lazy(() => import('@/components/ae/shared/tool-input-form/AeToolInputForm')
  .then(module => ({ default: module.AeToolInputForm })))

export function ToolPanelForm({ view, idPrefix, onInputTextChange }: ToolPanelFormProps) {
  const [touched, setTouched] = useState(false)
  const jsonEditor = <Textarea id={`${idPrefix}-json`} label={chatToolPanel.jsonLabel} description={chatToolPanel.jsonHelp}
    value={view.inputText} rows={4} spellCheck={false}
    aria-invalid={(touched && view.incomplete !== undefined) || undefined}
    aria-describedby={view.incomplete === undefined ? undefined : `${idPrefix}-incomplete`}
    onChange={event => { setTouched(true); onInputTextChange(event.target.value) }}
    className="min-w-0 max-w-full break-words font-mono text-base sm:text-sm" />

  return (
    <fieldset disabled={view.submission !== 'idle'} aria-busy={view.submission === 'submitting'} className="arc-tool-review-form grid min-w-0 max-w-full gap-3">
      <legend className="sr-only">{chatToolPanel.inputLegend}</legend>
      {view.phase === 'form' && view.schema !== undefined && view.formData !== undefined ? (
        <ToolInputFormBoundary fallback={jsonEditor}>
          <Suspense fallback={<Skeleton label={chatToolPanel.loading} lines={3} className="min-w-0" />}>
            <LazyAeToolInputForm idPrefix={idPrefix} schema={view.schema} value={view.formData}
              {...(view.uiSchema === undefined ? {} : { uiSchema: view.uiSchema })}
              onChange={value => { setTouched(true); onInputTextChange(JSON.stringify(value, null, 2) ?? '') }} />
          </Suspense>
        </ToolInputFormBoundary>
      ) : jsonEditor}
    </fieldset>
  )
}

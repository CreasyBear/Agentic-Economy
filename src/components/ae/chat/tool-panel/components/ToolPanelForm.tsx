// Invariant: chat loads RJSF only after review and keeps JSON editing outside a failed lazy chunk, following Market's form boundary.
import { lazy, Suspense } from 'react'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { chatToolPanel } from '@/lib/public/chat-ia'
import { ToolInputFormBoundary } from '@/components/ae/shared/tool-input-form/ToolInputFormBoundary'
import type { ToolPanelFormProps } from '../tool-panel.contracts'

const LazyAeToolInputForm = lazy(() => import('@/components/ae/shared/tool-input-form/AeToolInputForm')
  .then(module => ({ default: module.AeToolInputForm })))

function ToolPanelFormSkeleton() {
  return <div role="status" className="grid min-w-0 gap-4">
    <div className="grid min-w-0 gap-2">
      <p className="min-h-4 break-words text-sm leading-4 text-muted-foreground">{chatToolPanel.loading}</p>
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-3 w-2/5" />
    </div>
    <div className="grid min-w-0 gap-2">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  </div>
}

export function ToolPanelForm({ view, idPrefix, onInputTextChange }: ToolPanelFormProps) {
  const jsonEditor = <FieldGroup className="min-w-0">
    <Field data-invalid={view.incomplete !== undefined} className="min-w-0">
      <FieldLabel htmlFor={`${idPrefix}-json`}>{chatToolPanel.jsonLabel}</FieldLabel>
      <Textarea id={`${idPrefix}-json`} value={view.inputText} rows={4} spellCheck={false}
        aria-invalid={view.incomplete !== undefined || undefined} aria-describedby={view.incomplete === undefined
          ? `${idPrefix}-json-help`
          : `${idPrefix}-json-help ${idPrefix}-incomplete`}
        onChange={event => onInputTextChange(event.target.value)}
        className="min-w-0 max-w-full break-words font-mono text-base sm:text-sm" />
      <FieldDescription id={`${idPrefix}-json-help`}>{chatToolPanel.jsonHelp}</FieldDescription>
    </Field>
  </FieldGroup>

  return (
    <fieldset disabled={view.submission !== 'idle'} aria-busy={view.submission === 'submitting'} className="arc-tool-review-form grid min-w-0 max-w-full gap-3">
      <legend className="sr-only">{chatToolPanel.inputLegend}</legend>
      {view.phase === 'form' && view.schema !== undefined && view.formData !== undefined ? (
        <ToolInputFormBoundary fallback={jsonEditor}>
          <Suspense fallback={<ToolPanelFormSkeleton />}>
            <LazyAeToolInputForm idPrefix={idPrefix} schema={view.schema} value={view.formData}
              {...(view.uiSchema === undefined ? {} : { uiSchema: view.uiSchema })}
              onChange={value => onInputTextChange(JSON.stringify(value, null, 2) ?? '')} />
          </Suspense>
        </ToolInputFormBoundary>
      ) : jsonEditor}
    </fieldset>
  )
}

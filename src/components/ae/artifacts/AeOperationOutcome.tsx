import { Link } from '@tanstack/react-router'

import { cn } from '@/lib/utils'
import { isRecord } from '@/modules/common/is-record'
import { formatCurrencyAmount } from '@/modules/money/public'
import {
  neutralizeBidiFormattingControls,
  type AnswerOperationOutcome,
  type AnswerOperationResultAnnotation,
  type AnswerOperationResultView,
} from '@/modules/answer/public'

import {
  formatMachineLabel,
  OPERATION_JSON_MAX_BYTES,
  REVEAL_ENTER,
} from './AeGenerativeAnswerCopy'

export function OperationOutcome({
  outcome,
  view,
}: {
  outcome: AnswerOperationOutcome
  view: AnswerOperationResultView
}) {
  const result = outcome.result
  const presentation = view.presentation
  const rawOutput = view.output === undefined ? undefined : boundedOutcomeJson(view.output)

  return (
    <section className={cn(REVEAL_ENTER, 'grid min-w-0 gap-3 rounded-md border border-border bg-card p-3')} aria-label="Operation outcome">
      <header className="grid gap-1">
        <p className="text-sm font-semibold text-foreground">{view.stateLabel}</p>
        {presentation === undefined ? null : (
          <h2
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
            className="break-words text-base font-semibold text-foreground"
          >
            {neutralizeBidiFormattingControls(presentation.operationLabel)}
          </h2>
        )}
      </header>

      {view.output === undefined ? (
        <p dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words text-sm leading-relaxed text-foreground">
          {result.kind === 'pending'
            ? 'The operation is still pending. Check its current status before relying on a result.'
            : result.kind === 'needs_authority'
              ? 'The operation needs approval before it can run.'
              : result.kind === 'reconciliation_required'
                ? 'The outcome is uncertain and must be reconciled before retrying.'
                : result.kind === 'error'
                  ? neutralizeBidiFormattingControls(result.reason)
                  : result.kind === 'refused'
                    ? `The operation was not run: ${formatMachineLabel(
                        'code' in result ? result.code : result.reason,
                      )}.`
                    : 'No result was recorded.'}
        </p>
      ) : (
        <section className="grid min-w-0 gap-2" aria-label="Result">
          <h3 dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words text-xs font-medium text-muted-foreground">
            {neutralizeBidiFormattingControls(
              view.annotations.find((annotation) => annotation.pointer === '')?.label ?? 'Result',
            )}
          </h3>
          <ResultValue
            value={view.output}
            pointer=""
            annotations={view.annotations}
            depth={0}
          />
        </section>
      )}

      <div className="grid min-w-0 gap-1 border-t border-border pt-3 text-sm">
        <p dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words font-medium text-foreground">
          {presentation === undefined
            ? 'Recorded operation'
            : neutralizeBidiFormattingControls(presentation.sourceLabel)}
        </p>
        <p className="break-words text-muted-foreground">
          {presentation === undefined
            ? 'Runtime actor and time were not recorded.'
            : `Runtime execution · ${formatObservedAt(presentation.observedAt)}`}
        </p>
      </div>

      <details className="group min-w-0 rounded-md border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Technical details
        </summary>
        <div className="grid min-w-0 gap-4 border-t border-border p-3">
          <div className="grid gap-2">
            <Link
              to="/operations/$operationRef"
              params={{ operationRef: outcome.operationRef }}
              className="inline-flex min-h-6 w-fit max-w-full items-center break-all text-xs text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <code dir="ltr" style={{ unicodeBidi: 'isolate' }}>{outcome.operationRef}</code>
            </Link>
            {'invocationRef' in result ? (
              <Link
                to="/operations/invocations/$invocationRef"
                params={{ invocationRef: result.invocationRef }}
                aria-label="View current status"
                className="inline-flex min-h-6 w-fit items-center text-sm font-semibold text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <code dir="ltr" style={{ unicodeBidi: 'isolate' }}>{result.invocationRef}</code>
              </Link>
            ) : null}
          </div>

          <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            {result.kind === 'completed' ? (
              <>
                <OutcomeFact label="Charge state" value={formatMachineLabel(result.usage.chargeState)} />
                <OutcomeFact label="Exact amount" value={formatCurrencyAmount(result.usage.amount)} />
                <OutcomeFact label="Usage ref" value={result.usage.usageRef} />
                <OutcomeFact label="Observed" value={formatObservedAt(result.usage.observedAt)} />
                <OutcomeFact label="Price digest" value={result.usage.priceDigest} />
                <OutcomeFact label="Transaction ref" value={result.usage.transactionRef ?? 'Not recorded'} />
                <OutcomeFact label="Duration" value={result.usage.durationMs === undefined ? 'Not recorded' : `${result.usage.durationMs} ms`} />
                <OutcomeFact label="Evidence hash" value={result.evidenceHash} />
              </>
            ) : result.kind === 'ok' ? (
              <OutcomeFact label="Evidence hash" value={result.evidenceHash} />
            ) : result.kind === 'pending' ? (
              <OutcomeFact label="Retry after" value={`${result.retryAfterMs} ms`} />
            ) : result.kind === 'needs_authority' ? (
              <>
                <OutcomeFact label="Consequence" value={formatMachineLabel(result.authorityRequest.consequence)} />
                <OutcomeFact label="Retry class" value={formatMachineLabel(result.authorityRequest.retryClass)} />
                <OutcomeFact label="Maximum spend" value={result.authorityRequest.maximumSpend === undefined ? 'Not specified' : formatCurrencyAmount(result.authorityRequest.maximumSpend)} />
                <OutcomeFact label="Data fields" value={result.authorityRequest.dataFields.length === 0 ? 'None' : result.authorityRequest.dataFields.join(', ')} />
                <OutcomeFact label="Authority expires" value={result.authorityRequest.expiresAt ?? 'Not specified'} />
              </>
            ) : result.kind === 'reconciliation_required' ? (
              <>
                <OutcomeFact label="Attempt ref" value={result.evidence.attemptRef} />
                <OutcomeFact label="Effect generation" value={String(result.evidence.effectGeneration)} />
                <OutcomeFact label="Required at" value={result.evidence.requiredAt} />
                <OutcomeFact label="Retry policy" value={formatMachineLabel(result.evidence.retry)} />
                <OutcomeFact label="Evidence source" value={result.evidence.evidenceSource} />
              </>
            ) : result.kind === 'error' ? (
              <>
                <OutcomeFact label="Code" value={formatMachineLabel(result.code)} />
                <OutcomeFact label="Retryable" value={result.retryable ? 'Yes' : 'No'} />
                <OutcomeFact label="Detail" value={result.reason} />
                {result.composition === undefined ? null : <OutcomeFact label="Composition" value={JSON.stringify(result.composition)} />}
              </>
            ) : result.kind === 'unsafe_output' ? (
              <OutcomeFact label="Code" value="Result withheld" />
            ) : (
              <>
                <OutcomeFact
                  label="Code"
                  value={formatMachineLabel('code' in result ? result.code : result.reason)}
                />
                {'retryable' in result ? <OutcomeFact label="Retryable" value={result.retryable ? 'Yes' : 'No'} /> : null}
                {'nextAction' in result && result.nextAction !== undefined ? <OutcomeFact label="Next action" value={result.nextAction} /> : null}
                {'composition' in result && result.composition !== undefined ? <OutcomeFact label="Composition" value={JSON.stringify(result.composition)} /> : null}
              </>
            )}
            {presentation === undefined ? null : (
              <>
                <OutcomeFact label="Descriptor digest" value={presentation.descriptorDigest} />
                <OutcomeFact label="Output schema digest" value={presentation.outputSchemaDigest} />
                <OutcomeFact label="Runtime actor" value="ae_runtime" />
              </>
            )}
            <OutcomeFact label="Canonical result digest" value={outcome.resultDigest} />
            <OutcomeFact label="Tool record digest" value={outcome.toolCallDigest} />
          </dl>

          {rawOutput === undefined ? null : (
            <div className="grid min-w-0 gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Raw bounded JSON</p>
              <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                {rawOutput}
              </pre>
            </div>
          )}
        </div>
      </details>
    </section>
  )
}

function ResultValue({
  value,
  pointer,
  annotations,
  depth,
}: {
  value: unknown
  pointer: string
  annotations: readonly AnswerOperationResultAnnotation[]
  depth: number
}) {
  const annotation = annotations.find((item) => item.pointer === pointer)
  if (annotation?.href !== undefined) {
    return (
      <a
        href={annotation.href}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className="inline-flex min-h-6 w-fit max-w-full items-center break-all text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {neutralizeBidiFormattingControls(annotation.label)}
      </a>
    )
  }
  if (value === null || typeof value !== 'object') {
    return (
      <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words text-sm leading-relaxed text-foreground">
        {value === null
          ? 'null'
          : typeof value === 'string'
            ? neutralizeBidiFormattingControls(value)
            : String(value)}
      </span>
    )
  }
  if (depth >= 5) {
    return (
      <span className="break-words text-sm text-muted-foreground">
        Additional nested data is available in Technical details.
      </span>
    )
  }
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value
    return (
      <ol className="grid min-w-0 gap-2">
        {items.slice(0, 24).map((item, index) => {
          const itemPointer = `${pointer}/${index}`
          const itemAnnotation = annotations.find((candidate) => candidate.pointer === itemPointer)
          return (
            <li key={itemPointer} className="grid min-w-0 gap-1 rounded-md bg-muted p-3">
              <span className="text-xs font-medium text-muted-foreground">
                {itemAnnotation === undefined
                  ? `Item ${index + 1}`
                  : neutralizeBidiFormattingControls(itemAnnotation.label)}
              </span>
              <ResultValue value={item} pointer={itemPointer} annotations={annotations} depth={depth + 1} />
            </li>
          )
        })}
        {items.length > 24 ? (
          <li className="text-sm text-muted-foreground">
            {items.length - 24} more items are available in Technical details.
          </li>
        ) : null}
      </ol>
    )
  }
  if (!isRecord(value)) {
    return null
  }
  const entries = Object.entries(value)
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      {entries.slice(0, 24).map(([key, item]) => {
        const itemPointer = `${pointer}/${key.replace(/~/gu, '~0').replace(/\//gu, '~1')}`
        const itemAnnotation = annotations.find((candidate) => candidate.pointer === itemPointer)
        return (
          <div key={itemPointer} className="grid min-w-0 gap-1">
            <dt dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words text-xs font-medium text-muted-foreground">
              {neutralizeBidiFormattingControls(itemAnnotation?.label ?? formatMachineLabel(key))}
            </dt>
            <dd className="min-w-0">
              <ResultValue value={item} pointer={itemPointer} annotations={annotations} depth={depth + 1} />
            </dd>
          </div>
        )
      })}
      {entries.length > 24 ? (
        <div className="text-sm text-muted-foreground">
          {entries.length - 24} more fields are available in Technical details.
        </div>
      ) : null}
    </dl>
  )
}

function OutcomeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-all text-sm text-foreground">{neutralizeBidiFormattingControls(value)}</dd>
    </div>
  )
}

function boundedOutcomeJson(value: unknown): string {
  const json = neutralizeBidiFormattingControls(JSON.stringify(value, null, 2) ?? 'null')
  return new TextEncoder().encode(json).byteLength <= OPERATION_JSON_MAX_BYTES
    ? json
    : 'Output exceeded the 256 KiB answer-artifact limit. Use the canonical result digest and recovery surface.'
}

function formatObservedAt(value: number): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

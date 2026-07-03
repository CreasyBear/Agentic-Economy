import { useEffect, useRef, useState } from 'react'
import { AlertCircleIcon, CheckIcon, ChevronDownIcon, CircleIcon, Loader2Icon, SquareIcon } from 'lucide-react'

import {
  AeCollapsible as Collapsible,
  AeCollapsibleContent as CollapsibleContent,
  AeCollapsibleTrigger as CollapsibleTrigger,
} from '@/components/ae/primitives/AeCollapsible'
import { cn } from '@/lib/utils'
import type { AnswerWorkStep } from '@/modules/answer/public'
import type { PublicAnswerCheckSummary } from '@/modules/answer-thread/public'

const STATUS_TONE =
  'data-[status=complete]:border-green-ring data-[status=complete]:bg-green-subtle data-[status=complete]:text-green-vivid data-[status=running]:border-border-strong data-[status=running]:text-primary data-[status=error]:border-red-ring data-[status=error]:bg-red-subtle data-[status=error]:text-red-vivid data-[status=stopped]:border-red-ring data-[status=stopped]:bg-red-subtle data-[status=stopped]:text-red-vivid'

export type AeResearchProcessProps = {
  isStreaming: boolean
  steps: readonly AnswerWorkStep[]
  checkSummary?: PublicAnswerCheckSummary | undefined
}

/**
 * Public check trace. This shows the sanitized work log AE already stores for
 * replay, not hidden chain-of-thought.
 */
export function AeResearchProcess({ isStreaming, steps, checkSummary }: AeResearchProcessProps) {
  const needsReview = steps.some((step) => step.status === 'error' || step.status === 'stopped')
  const userManagedOpenRef = useRef(false)
  const defaultOpen = isStreaming || needsReview || steps.length > 0 || checkSummary !== undefined
  const [open, setOpen] = useState(defaultOpen)

  useEffect(() => {
    if (userManagedOpenRef.current) {
      return
    }
    setOpen(defaultOpen)
  }, [defaultOpen])

  if (steps.length === 0 && checkSummary === undefined) {
    return null
  }

  const overallStatus = steps.length === 0 && checkSummary !== undefined ? 'complete' : getOverallStatus(steps)
  const running = steps.find((step) => step.status === 'running')
  const latest = running ?? steps.at(-1)
  const statusLabel = checkSummary === undefined ? getOverallStatusLabel(overallStatus, latest) : answerCheckSummaryLine(checkSummary)

  function handleOpenChange(nextOpen: boolean) {
    userManagedOpenRef.current = true
    setOpen(nextOpen)
  }

  return (
    <Collapsible
      className="overflow-hidden rounded-md border border-border bg-surface"
      open={open}
      onOpenChange={handleOpenChange}
    >
      <CollapsibleTrigger
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted data-[state=open]:border-b data-[state=open]:border-border"
        type="button"
      >
        <span
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-full border border-border bg-card text-secondary',
            STATUS_TONE,
          )}
          data-status={overallStatus}
          aria-hidden="true"
        >
          <OverallStatusIcon status={overallStatus} />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-secondary">
            How AE checked this
          </span>
          <span className="truncate text-xs text-secondary">{statusLabel}</span>
        </span>
        <ChevronDownIcon
          className={cn('size-4 justify-self-end text-secondary transition-transform', open ? 'rotate-180' : 'rotate-0')}
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="p-3">
        <p className="mb-3 text-xs leading-snug text-secondary">
          Public checks and listed facts, not private reasoning.
        </p>
        {checkSummary === undefined ? null : (
          <dl className="mb-3 grid gap-2 rounded-md border border-border bg-card p-2 sm:grid-cols-3" aria-label="Answer check summary">
            <CheckSummaryFact label="Searches" value={String(checkSummary.catalogSearches)} />
            <CheckSummaryFact label="Listings read" value={String(checkSummary.listingsRead)} />
            <CheckSummaryFact label="Checks" value={`${checkSummary.checksPassed}/${checkSummary.checksPassed + checkSummary.checksFailed}`} />
          </dl>
        )}
        {steps.length === 0 ? null : <ol className="grid gap-3" aria-label="AE check steps">
          {steps.map((step) => {
            const detailRows = visibleDetailRows(step.detailRows)
            const summary = step.summary?.trim()
            const showSummary = summary !== undefined && summary.length > 0 && summary !== step.title

            return (
              <li
                key={step.id}
                className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 data-[status=skipped]:opacity-60"
                data-status={step.status}
              >
                <span
                  className={cn(
                    'mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-secondary',
                    STATUS_TONE,
                  )}
                  data-status={step.status}
                  aria-hidden="true"
                >
                  <StepStatusIcon step={step} />
                </span>
                <span className="grid min-w-0 gap-1">
                  <span className="text-sm font-medium leading-snug text-primary">{step.title}</span>
                  {showSummary ? <span className="text-sm leading-snug text-secondary">{summary}</span> : null}
                  {detailRows.length > 0 ? (
                    <span className="grid gap-1 pt-1">
                      {detailRows.map((row) => (
                        <span key={`${step.id}-${row.label}`} className="grid gap-0.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
                          <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-secondary">
                            {row.label}
                          </span>
                          <span className="min-w-0 break-words text-xs leading-snug text-secondary">{row.value}</span>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>}
      </CollapsibleContent>
    </Collapsible>
  )
}

function CheckSummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="font-mono text-2xs font-semibold uppercase tracking-wider text-secondary">{label}</dt>
      <dd className="text-sm font-medium leading-snug text-primary">{value}</dd>
    </div>
  )
}

function visibleDetailRows(rows: AnswerWorkStep['detailRows']): NonNullable<AnswerWorkStep['detailRows']> {
  if (rows === undefined) {
    return []
  }
  return rows
    .filter((row) => row.label.trim().length > 0 && row.value.trim().length > 0)
    .slice(0, 4)
}

function StepStatusIcon({ step }: { step: AnswerWorkStep }) {
  const className = 'size-2.5'
  switch (step.status) {
    case 'complete':
    case 'skipped':
      return <CheckIcon className={className} aria-hidden="true" />
    case 'error':
      return <AlertCircleIcon className={className} aria-hidden="true" />
    case 'stopped':
      return <SquareIcon className={className} aria-hidden="true" />
    case 'running':
      return <Loader2Icon className={cn(className, 'motion-safe:animate-spin')} aria-hidden="true" />
  }
}

function OverallStatusIcon({ status }: { status: OverallStatus }) {
  switch (status) {
    case 'running':
      return <Loader2Icon className="size-4 motion-safe:animate-spin" aria-hidden="true" />
    case 'complete':
      return <CheckIcon className="size-4" aria-hidden="true" />
    case 'error':
      return <AlertCircleIcon className="size-4" aria-hidden="true" />
    case 'stopped':
      return <SquareIcon className="size-4" aria-hidden="true" />
    case 'idle':
      return <CircleIcon className="size-4" aria-hidden="true" />
  }
}

type OverallStatus = 'idle' | 'running' | 'complete' | 'error' | 'stopped'

function getOverallStatus(steps: readonly AnswerWorkStep[]): OverallStatus {
  if (steps.some((step) => step.status === 'running')) {
    return 'running'
  }
  if (steps.some((step) => step.status === 'error')) {
    return 'error'
  }
  if (steps.some((step) => step.status === 'stopped')) {
    return 'stopped'
  }
  if (steps.length > 0 && steps.every((step) => step.status === 'complete' || step.status === 'skipped')) {
    return 'complete'
  }
  return 'idle'
}

function getOverallStatusLabel(status: OverallStatus, latest: AnswerWorkStep | undefined): string {
  switch (status) {
    case 'running':
      return latest?.title ?? 'In progress'
    case 'complete':
      return 'Ready'
    case 'error':
      return 'Needs attention'
    case 'stopped':
      return 'Stopped'
    case 'idle':
      return latest?.title ?? 'Planning'
  }
}

function answerCheckSummaryLine(summary: PublicAnswerCheckSummary): string {
  const total = summary.checksPassed + summary.checksFailed
  return [
    `${summary.catalogSearches} ${summary.catalogSearches === 1 ? 'search' : 'searches'}`,
    `${summary.listingsRead} read`,
    `${summary.listedBusinesses} listed`,
    `${summary.checksPassed}/${total} checks`,
    formatElapsed(summary.elapsedMs),
  ].join(' · ')
}

function formatElapsed(ms: number): string {
  if (ms <= 0) {
    return '<1s'
  }
  if (ms < 1_000) {
    return `${ms}ms`
  }
  if (ms < 10_000) {
    return `${(ms / 1_000).toFixed(1)}s`
  }
  return `${Math.round(ms / 1_000)}s`
}

import { useState } from 'react'
import { ChevronRightIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  neutralizeBidiFormattingControls,
  type AnswerWorkStep,
  type AnswerWorkStepDetailRow,
} from '@/modules/answer/public'
import type {
  PublicAnswerCheckSummary,
  ThinkingStep,
} from '@/modules/answer-thread/public'

export type AeWorkDisclosureProps = {
  isStreaming: boolean
  workSteps: readonly AnswerWorkStep[]
  thinkingSteps: readonly string[]
  thinkingLabel: string
  thinkingStep?: ThinkingStep
  checkSummary?: PublicAnswerCheckSummary
  query?: string
}

const EmptyThinkingSteps: readonly string[] = []

const StatusLabels: Record<AnswerWorkStep['status'], string> = {
  running: 'Running',
  complete: 'Complete',
  error: 'Failed',
  stopped: 'Stopped',
  skipped: 'Skipped',
}

export function AeWorkDisclosure({
  isStreaming,
  workSteps,
  thinkingSteps = EmptyThinkingSteps,
  thinkingLabel,
  checkSummary,
}: AeWorkDisclosureProps) {
  const [managedOpen, setManagedOpen] = useState<boolean | null>(null)
  const runningStep = workSteps.find((step) => step.status === 'running')
  const isActive = isStreaming || runningStep !== undefined
  const hasError = workSteps.some((step) => step.status === 'error')
  const wasStopped = workSteps.some((step) => step.status === 'stopped')

  if (
    workSteps.length === 0 &&
    thinkingSteps.length === 0 &&
    checkSummary === undefined &&
    !isActive
  ) {
    return null
  }

  const elapsedLabel =
    checkSummary === undefined
      ? workedForLabel(workSteps)
      : formatElapsed(checkSummary.elapsedMs)
  const stepCountLabel = stepCountText(workSteps.length)
  const primary = isActive
    ? runningStep?.title ||
      (thinkingLabel.trim().length > 0 ? thinkingLabel : 'Thinking…')
    : hasError
      ? 'Work failed'
      : wasStopped
        ? 'Work stopped'
        : elapsedLabel.length > 0
          ? `Worked for ${elapsedLabel}`
          : stepCountLabel || 'Worked'
  const secondary =
    isActive || checkSummary === undefined
      ? ''
      : answerCheckLine(checkSummary)
  const open = managedOpen ?? (isActive || hasError || wasStopped)

  return (
    <Collapsible
      open={open}
      onOpenChange={setManagedOpen}
      data-ae-work-disclosure
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          data-ae-work-trigger
        >
          <span
            className="min-w-0 flex-1 truncate font-medium text-foreground"
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
          >
            {neutralizeBidiFormattingControls(primary)}
          </span>
          {secondary.length > 0 ? (
            <span
              className="shrink-0 text-xs"
              dir="auto"
              style={{ unicodeBidi: 'isolate' }}
            >
              {neutralizeBidiFormattingControls(secondary)}
            </span>
          ) : null}
          <ChevronRightIcon
            className="size-4 shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]:rotate-90"
            aria-hidden="true"
          />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="ml-2 border-l border-border py-1 pl-3">
          {thinkingSteps.length > 0 ? (
            <ul
              className="grid gap-1 pb-2 text-xs text-muted-foreground"
              aria-label="Answer thinking"
              data-ae-work-thinking
            >
              {thinkingSteps.map((label, index) => (
                <li
                  key={`${index}-${label}`}
                  dir="auto"
                  style={{ unicodeBidi: 'isolate' }}
                >
                  {neutralizeBidiFormattingControls(label)}
                </li>
              ))}
            </ul>
          ) : null}

          {workSteps.length > 0 ? (
            <ol className="divide-y divide-border" aria-label="Answer work steps">
              {workSteps.map((step) => (
                <WorkStep key={step.id} step={step} />
              ))}
            </ol>
          ) : null}

          {checkSummary === undefined ? null : (
            <CheckSummaryFacts summary={checkSummary} />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function WorkStep({ step }: { step: AnswerWorkStep }) {
  const detailRows = (step.detailRows ?? []).filter(
    (row) => row.label.trim().length > 0 && row.value.trim().length > 0,
  )
  const title = neutralizeBidiFormattingControls(step.title)
  const summary = neutralizeBidiFormattingControls(step.summary?.trim() ?? '')

  return (
    <li
      className="grid gap-1.5 py-2 first:pt-1 last:pb-1"
      data-ae-work-step
      data-status={step.status}
      data-work-step={step.id}
    >
      <div className="flex min-w-0 items-start gap-2">
        <p
          className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground"
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
        >
          {title}
        </p>
        <StatusBadge status={step.status} />
      </div>
      {summary.length > 0 && summary !== title ? (
        <p
          className="text-xs leading-relaxed text-muted-foreground"
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
        >
          {summary}
        </p>
      ) : null}
      {detailRows.length > 0 ? <DetailRows rows={detailRows} /> : null}
    </li>
  )
}

function StatusBadge({ status }: { status: AnswerWorkStep['status'] }) {
  const variant =
    status === 'error' || status === 'stopped'
      ? 'destructive'
      : status === 'running'
        ? 'secondary'
        : 'outline'
  return (
    <Badge className="shrink-0" variant={variant}>
      {StatusLabels[status]}
    </Badge>
  )
}

function DetailRows({ rows }: { rows: readonly AnswerWorkStepDetailRow[] }) {
  return (
    <dl
      className="grid gap-1 text-xs"
      aria-label="Work step details"
      data-ae-work-details
    >
      {rows.map((row) => (
        <div
          key={`${row.label}-${row.value}`}
          className="grid gap-0.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-2"
          data-ae-work-detail
        >
          <dt
            className="font-medium text-muted-foreground"
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
          >
            {neutralizeBidiFormattingControls(row.label)}
          </dt>
          <dd
            className="min-w-0 break-words text-foreground"
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
          >
            {neutralizeBidiFormattingControls(row.value)}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function CheckSummaryFacts({ summary }: { summary: PublicAnswerCheckSummary }) {
  const total = summary.checksPassed + summary.checksFailed
  return (
    <dl
      className="grid grid-cols-3 gap-2 pt-2 text-xs"
      aria-label="Answer check summary"
      data-ae-work-check-summary
    >
      <div className="grid gap-0.5">
        <dt className="text-muted-foreground">Searches</dt>
        <dd className="font-medium text-foreground">
          {summary.catalogSearches}
        </dd>
      </div>
      <div className="grid gap-0.5">
        <dt className="text-muted-foreground">Details read</dt>
        <dd className="font-medium text-foreground">
          {summary.listingsRead}
        </dd>
      </div>
      <div className="grid gap-0.5">
        <dt className="text-muted-foreground">Checks</dt>
        <dd className="font-medium text-foreground">
          {summary.checksPassed}/{total}
        </dd>
      </div>
    </dl>
  )
}

function workedForLabel(steps: readonly AnswerWorkStep[]): string {
  const durations = steps
    .map((step) => step.durationMs ?? 0)
    .filter((duration) => duration > 0)
  if (durations.length > 0) {
    return formatElapsed(
      durations.reduce((total, duration) => total + duration, 0),
    )
  }

  const startedAt = steps
    .map((step) => step.startedAtMs)
    .filter((value): value is number => value !== undefined)
  const completedAt = steps
    .map((step) => step.completedAtMs)
    .filter((value): value is number => value !== undefined)
  if (startedAt.length > 0 && completedAt.length > 0) {
    const span = Math.max(...completedAt) - Math.min(...startedAt)
    if (span > 0) {
      return formatElapsed(span)
    }
  }
  return ''
}

function stepCountText(count: number): string {
  if (count > 1) return `Ran ${count} steps`
  if (count === 1) return 'Ran 1 step'
  return ''
}

function answerCheckLine(summary: PublicAnswerCheckSummary): string {
  const total = summary.checksPassed + summary.checksFailed
  return [
    summary.listedBusinesses > 0
      ? `compared ${summary.listedBusinesses} ${summary.listedBusinesses === 1 ? 'match' : 'matches'}`
      : '',
    total > 0 ? `checked ${total} ${total === 1 ? 'fact' : 'facts'}` : '',
  ]
    .filter((part) => part.length > 0)
    .join('; ')
}

function formatElapsed(ms: number): string {
  if (ms <= 0) return '<1s'
  if (ms < 1_000) return `${ms}ms`
  if (ms < 10_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${Math.round(ms / 1_000)}s`
}

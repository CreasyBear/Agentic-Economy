import { forwardRef, useState } from 'react'
import { AlertCircleIcon, CheckIcon, Loader2Icon, SquareIcon, type LucideIcon, type LucideProps } from 'lucide-react'
import { cn } from '@/lib/utils'

import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from '@/components/ai-elements/chain-of-thought'
import type { AnswerWorkStep } from '@/modules/answer/public'
import type { PublicAnswerCheckSummary } from '@/modules/answer-thread/public'

export type AeResearchProcessProps = {
  isStreaming: boolean
  steps: readonly AnswerWorkStep[]
  checkSummary?: PublicAnswerCheckSummary | undefined
  query?: string | undefined
}

const RunningStepIcon = forwardRef<SVGSVGElement, LucideProps>(({ className, ...props }, ref) => (
  <Loader2Icon {...props} ref={ref} className={cn('motion-safe:animate-spin', className)} />
))

const STEP_ICON: Record<AnswerWorkStep['status'], LucideIcon> = {
  running: RunningStepIcon,
  error: AlertCircleIcon,
  stopped: SquareIcon,
  complete: CheckIcon,
  skipped: CheckIcon,
}

const STEP_STATUS: Record<AnswerWorkStep['status'], 'complete' | 'active' | 'pending'> = {
  running: 'active',
  error: 'pending',
  stopped: 'pending',
  complete: 'complete',
  skipped: 'complete',
}

/**
 * Public check trace, built on the ai-elements ChainOfThought primitives. It
 * shows the sanitized work log AE already stores for replay - public checks and
 * listed facts, never hidden model reasoning. Streaming keeps it open and the
 * steps reveal one at a time; a settled, healthy answer collapses to the
 * summary line so completed turns do not dump the full audit log.
 */
export function AeResearchProcess({ isStreaming, steps, checkSummary, query }: AeResearchProcessProps) {
  const needsReview = steps.some((step) => step.status === 'error' || step.status === 'stopped')
  const [managedOpen, setManagedOpen] = useState<boolean | null>(null)
  const open = managedOpen ?? (isStreaming || needsReview)

  if (steps.length === 0 && checkSummary === undefined) {
    return null
  }

  const overallStatus = steps.length === 0 && checkSummary !== undefined ? 'complete' : getOverallStatus(steps)
  const running = steps.find((step) => step.status === 'running')
  const latest = running ?? latestProblemStep(steps) ?? steps.at(-1)
  const queryContext = buildQueryContext(query)
  const statusLabel =
    checkSummary === undefined ? getOverallStatusLabel(overallStatus, latest, steps, queryContext) : answerCheckSummaryLine(checkSummary, queryContext)

  return (
    <ChainOfThought
      className="rounded-md border border-border bg-card p-3"
      open={open}
      onOpenChange={setManagedOpen}
    >
      <ChainOfThoughtHeader>
        <span className="grid min-w-0 gap-0.5">
          <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            How AE checked this
          </span>
          <span className="truncate text-xs text-muted-foreground">{statusLabel}</span>
        </span>
      </ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        <p className="text-xs leading-snug text-muted-foreground">Public checks and listed facts, not private reasoning.</p>
        {checkSummary === undefined ? null : (
          <dl className="grid gap-2 rounded-md border border-border bg-card p-2 sm:grid-cols-3" aria-label="Answer check summary">
            <CheckSummaryFact label="Searches" value={String(checkSummary.catalogSearches)} />
            <CheckSummaryFact label="Listings read" value={String(checkSummary.listingsRead)} />
            <CheckSummaryFact label="Checks" value={`${checkSummary.checksPassed}/${checkSummary.checksPassed + checkSummary.checksFailed}`} />
          </dl>
        )}
        {steps.length === 0 ? null : (
          <ol className="grid gap-3" aria-label="AE check steps">
            {steps.map((step, index) => {
              // While streaming, only the running/problem step shows its dense
              // detail rows; completed steps stay compact so the trace steps
              // forward instead of growing into a wall. A settled trace the user
              // expanded shows the full audit log for every step.
              const showDetail = !isStreaming || step.status === 'running' || step.status === 'error' || step.status === 'stopped'
              const detailRows = showDetail ? visibleDetailRows(step.detailRows) : []
              const summary = step.summary?.trim()
              const showSummary = summary !== undefined && summary.length > 0 && summary !== step.title
              const stepLabel = workStepLabel(step, queryContext)
              const accessibleStepLabel = step.status === 'error' ? `${stepLabel} (failed)` : stepLabel
              const description =
                step.status === 'error'
                  ? summary !== undefined && summary.length > 0
                    ? `Failed: ${summary}`
                    : 'Failed'
                  : showSummary
                    ? summary
                    : undefined

              return (
                <li key={step.id}>
                  <ChainOfThoughtStep
                    icon={STEP_ICON[step.status]}
                    status={STEP_STATUS[step.status]}
                    aria-label={accessibleStepLabel}
                    label={stepLabel}
                    {...(step.status === 'error' ? { className: 'text-destructive' } : {})}
                    {...(description === undefined ? {} : { description })}
                  >
                    {detailRows.length > 0 ? (
                      <dl className="grid gap-1 pt-1">
                        {detailRows.map((row) => (
                          <div key={`${step.id}-${row.label}`} className="grid gap-0.5 sm:grid-cols-[7rem_minmax(0,1fr)]">
                            <dt className="font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {row.label}
                            </dt>
                            <dd className="min-w-0 break-words text-xs leading-snug text-muted-foreground">{row.value}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : null}
                  </ChainOfThoughtStep>
                </li>
              )
            })}
          </ol>
        )}
      </ChainOfThoughtContent>
    </ChainOfThought>
  )
}

function CheckSummaryFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium leading-snug text-foreground">{value}</dd>
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

function latestProblemStep(steps: readonly AnswerWorkStep[]): AnswerWorkStep | undefined {
  return steps.find((step) => step.status === 'error') ?? steps.find((step) => step.status === 'stopped')
}

function getOverallStatusLabel(
  status: OverallStatus,
  latest: AnswerWorkStep | undefined,
  steps: readonly AnswerWorkStep[],
  queryContext: string,
): string {
  switch (status) {
    case 'running':
      return latest === undefined ? `Checking published facts${queryContext}` : `Checking now: ${workStepLabel(latest, queryContext)}`
    case 'complete':
      return completedWorkLabel(steps, latest, queryContext)
    case 'error':
      return latest === undefined ? 'Needs attention' : `Needs attention: ${workStepLabel(latest, queryContext)}`
    case 'stopped':
      return latest === undefined ? 'Stopped' : `Stopped at ${workStepLabel(latest, queryContext)}`
    case 'idle':
      return latest === undefined ? `Planning public checks${queryContext}` : workStepLabel(latest, queryContext)
  }
}

function completedWorkLabel(steps: readonly AnswerWorkStep[], latest: AnswerWorkStep | undefined, queryContext: string): string {
  const stepCount = steps.length
  const prefix = `${stepCount === 1 ? '1 public check' : `${stepCount} public checks`} complete${queryContext}`
  const summary = latest?.summary?.trim()

  if (summary === undefined || summary.length === 0 || summary === latest?.title) {
    return prefix
  }

  return `${prefix} · ${summary}`
}

function answerCheckSummaryLine(summary: PublicAnswerCheckSummary, queryContext: string): string {
  const total = summary.checksPassed + summary.checksFailed
  const parts = [
    summary.listedBusinesses > 0 ? `compared ${summary.listedBusinesses} ${summary.listedBusinesses === 1 ? 'listed business' : 'listed businesses'}` : '',
    total > 0 ? `checked ${total} ${total === 1 ? 'fact' : 'facts'}` : '',
    `done in ${formatElapsed(summary.elapsedMs)}`,
  ].filter((part) => part.length > 0)
  const line = parts.join('; ')
  return queryContext.length > 0 ? `For ${queryContext.slice(5)}: ${line}.` : `${line.replace(/^./, (char) => char.toUpperCase())}.`
}

function workStepLabel(step: AnswerWorkStep, queryContext: string): string {
  if (queryContext.length === 0) {
    return step.title
  }

  switch (step.phase) {
    case 'interpret':
      return `Reading the request${queryContext}`
    case 'search':
      return `Searching listed businesses${queryContext}`
    case 'read':
      return `Reading listings${queryContext}`
    case 'compare':
      return `Comparing listed facts${queryContext}`
    case 'assemble':
      return `Writing the answer${queryContext}`
    case 'route':
      return `Choosing the next step${queryContext}`
  }
}

function buildQueryContext(query: string | undefined): string {
  const normalized = query?.replace(/\s+/g, ' ').trim() ?? ''
  if (normalized.length === 0) {
    return ''
  }
  const short = normalized.length > 72 ? `${normalized.slice(0, 69).trimEnd()}…` : normalized
  return ` for “${short}”`
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

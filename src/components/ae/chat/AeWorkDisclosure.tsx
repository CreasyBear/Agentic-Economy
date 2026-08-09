import { useEffect, useRef, useState } from 'react'
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronRightIcon,
  Loader2Icon,
  SquareIcon,
  type LucideIcon,
} from 'lucide-react'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'

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
const MIN_WORK_STEP_VISIBLE_MS = 700

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

type PendingWorkStep = {
  releaseAtMs: number
  step: AnswerWorkStep
  timer: number
}

function shouldSkipWorkStepPacing(): boolean {
  if (
    typeof window === 'undefined' ||
    typeof window.matchMedia !== 'function'
  ) {
    return true
  }
  return window.matchMedia(REDUCED_MOTION_QUERY).matches
}

function stepDurationMs(step: AnswerWorkStep): number | undefined {
  if (step.durationMs !== undefined) {
    return step.durationMs
  }
  if (step.startedAtMs === undefined || step.completedAtMs === undefined) {
    return undefined
  }
  return Math.max(0, step.completedAtMs - step.startedAtMs)
}

function shouldHoldCompletedStep(
  step: AnswerWorkStep,
  previous: AnswerWorkStep | undefined,
  isStreaming: boolean,
): boolean {
  if (step.status !== 'complete' && step.status !== 'skipped') {
    return false
  }
  const duration = stepDurationMs(step)
  return (
    previous?.status === 'running' ||
    (duration !== undefined && duration < MIN_WORK_STEP_VISIBLE_MS) ||
    (isStreaming && duration === undefined)
  )
}

function asVisibleRunningStep(step: AnswerWorkStep): AnswerWorkStep {
  return { ...step, status: 'running' }
}

function usePacedWorkSteps(
  workSteps: readonly AnswerWorkStep[],
  isStreaming: boolean,
): readonly AnswerWorkStep[] {
  const [visibleWorkSteps, setVisibleWorkSteps] =
    useState<readonly AnswerWorkStep[]>(workSteps)
  const previousWorkStepsRef = useRef(workSteps)
  const firstSeenAtRef = useRef(new Map<string, number>())
  const pendingWorkStepsRef = useRef(new Map<string, PendingWorkStep>())

  useEffect(() => {
    const previousById = new Map(
      previousWorkStepsRef.current.map((step) => [step.id, step]),
    )
    previousWorkStepsRef.current = workSteps

    if (shouldSkipWorkStepPacing()) {
      for (const pending of pendingWorkStepsRef.current.values()) {
        clearTimeout(pending.timer)
      }
      pendingWorkStepsRef.current.clear()
      firstSeenAtRef.current.clear()
      setVisibleWorkSteps(workSteps)
      return
    }

    const incomingIds = new Set(workSteps.map((step) => step.id))
    for (const [id, pending] of pendingWorkStepsRef.current) {
      if (!incomingIds.has(id)) {
        clearTimeout(pending.timer)
        pendingWorkStepsRef.current.delete(id)
      }
    }
    for (const id of firstSeenAtRef.current.keys()) {
      if (!incomingIds.has(id)) {
        firstSeenAtRef.current.delete(id)
      }
    }

    const now = Date.now()
    const next = workSteps.map((step) => {
      if (step.status === 'running') {
        firstSeenAtRef.current.set(
          step.id,
          firstSeenAtRef.current.get(step.id) ?? now,
        )
        const pending = pendingWorkStepsRef.current.get(step.id)
        if (pending !== undefined) {
          clearTimeout(pending.timer)
          pendingWorkStepsRef.current.delete(step.id)
        }
        return step
      }

      const pending = pendingWorkStepsRef.current.get(step.id)
      if (pending !== undefined) {
        if (step.status === 'complete' || step.status === 'skipped') {
          pending.step = step
          return asVisibleRunningStep(step)
        }
        clearTimeout(pending.timer)
        pendingWorkStepsRef.current.delete(step.id)
      }

      if (
        !shouldHoldCompletedStep(step, previousById.get(step.id), isStreaming)
      ) {
        firstSeenAtRef.current.delete(step.id)
        return step
      }

      const startedAt = firstSeenAtRef.current.get(step.id) ?? now
      const releaseAtMs = startedAt + MIN_WORK_STEP_VISIBLE_MS
      if (releaseAtMs <= now) {
        firstSeenAtRef.current.delete(step.id)
        return step
      }

      const pendingWorkStep: PendingWorkStep = {
        releaseAtMs,
        step,
        timer: window.setTimeout(() => {
          const current = pendingWorkStepsRef.current.get(step.id)
          if (current === undefined || current.releaseAtMs !== releaseAtMs) {
            return
          }
          pendingWorkStepsRef.current.delete(step.id)
          firstSeenAtRef.current.delete(step.id)
          setVisibleWorkSteps((currentSteps) =>
            currentSteps.map((currentStep) =>
              currentStep.id === step.id ? current.step : currentStep,
            ),
          )
        }, releaseAtMs - now),
      }
      pendingWorkStepsRef.current.set(step.id, pendingWorkStep)
      return asVisibleRunningStep(step)
    })
    setVisibleWorkSteps(next)
  }, [isStreaming, workSteps])

  useEffect(
    () => () => {
      for (const pending of pendingWorkStepsRef.current.values()) {
        clearTimeout(pending.timer)
      }
    },
    [],
  )

  return visibleWorkSteps
}

/** Perplexity-style phase trail shown while the engine has not yet emitted its work log. */
const THINKING_TRAIL: readonly { step: ThinkingStep; label: string }[] = [
  { step: 'search', label: 'Searching for matches' },
  { step: 'read', label: 'Reading the details' },
  { step: 'write', label: 'Choosing the next step' },
]

/**
 * The agent-native "Worked" disclosure: a compact, quiet collapsible that sits
 * above the answer prose and reads as "the agent did X" — not a side console.
 * Each real engine work-step is a quiet inline row (spinner while running,
 * check when done); accumulated reasoning folds into a "Thought" cell. It
 * reuses the live thinking/workLog state the turn reducer already maintains.
 */
export function AeWorkDisclosure({
  isStreaming,
  workSteps,
  thinkingSteps = EmptyThinkingSteps,
  thinkingLabel,
  thinkingStep,
  checkSummary,
  query,
}: AeWorkDisclosureProps) {
  const visibleWorkSteps = usePacedWorkSteps(workSteps, isStreaming)
  const hasSteps = visibleWorkSteps.length > 0
  // The Thought cell holds the reasoning history; the live label lives in the header.
  const thoughtLabels =
    thinkingSteps.length > 0
      ? thinkingSteps
      : thinkingLabel.trim().length > 0
        ? [thinkingLabel]
        : []
  const [managedOpen, setManagedOpen] = useState<boolean | null>(null)
  const visibleIsStreaming =
    isStreaming || visibleWorkSteps.some((step) => step.status === 'running')
  if (
    !hasSteps &&
    checkSummary === undefined &&
    thoughtLabels.length === 0 &&
    !visibleIsStreaming
  ) {
    return null
  }

  const needsReview = visibleWorkSteps.some(
    (step) => step.status === 'error' || step.status === 'stopped',
  )
  const open = managedOpen ?? (visibleIsStreaming || needsReview)

  const runningStep = visibleWorkSteps.find((step) => step.status === 'running')
  const queryContext = buildQueryContext(query)
  const elapsedLabel =
    checkSummary !== undefined
      ? formatElapsed(checkSummary.elapsedMs)
      : workedForLabel(visibleWorkSteps)
  const stepCountLabel = stepCountText(visibleWorkSteps.length)
  const checkLine =
    checkSummary === undefined ? '' : answerCheckLine(checkSummary)

  const primary = visibleIsStreaming
    ? runningStep !== undefined
      ? 'Working'
      : thinkingLabel
    : elapsedLabel.length > 0
      ? `Worked for ${elapsedLabel}`
      : stepCountLabel.length > 0
        ? stepCountLabel
        : 'Worked'
  const secondary = visibleIsStreaming
    ? stepCountLabel
    : checkSummary !== undefined
      ? checkLine
      : elapsedLabel.length > 0
        ? stepCountLabel
        : ''
  const displayPrimary = neutralizeBidiFormattingControls(primary)

  return (
    <Collapsible
      className="rounded-md border border-border bg-muted/40"
      open={open}
      onOpenChange={setManagedOpen}
    >
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="group flex min-h-11 w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {visibleIsStreaming ? (
            <Loader2Icon
              className="size-3.5 shrink-0 text-brand motion-safe:animate-spin"
              aria-hidden="true"
            />
          ) : (
            <ChevronRightIcon
              className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90"
              aria-hidden="true"
            />
          )}
          <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="min-w-0 flex-1 truncate font-medium">{displayPrimary}</span>
          {secondary.length > 0 ? (
            <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="shrink-0 font-mono text-2xs tabular-nums">
              {secondary}
            </span>
          ) : null}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-3 px-3 pb-3 pt-0.5">
          {hasSteps ? (
            <ol className="grid gap-1.5" aria-label="Answer work steps">
              {visibleWorkSteps.map((step) => (
                <WorkStepRow
                  key={step.id}
                  step={step}
                  queryContext={queryContext}
                  isStreaming={visibleIsStreaming}
                />
              ))}
            </ol>
          ) : (
            <PhaseTrail
              thinkingStep={thinkingStep}
              isStreaming={visibleIsStreaming}
            />
          )}
          {thoughtLabels.length > 0 ? (
            <ThoughtCell
              labels={thoughtLabels}
              isStreaming={visibleIsStreaming}
            />
          ) : null}
          {checkSummary === undefined ? null : (
            <CheckSummaryFacts summary={checkSummary} />
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const STEP_ICON: Record<AnswerWorkStep['status'], LucideIcon> = {
  running: Loader2Icon,
  error: AlertCircleIcon,
  stopped: SquareIcon,
  complete: CheckIcon,
  skipped: CheckIcon,
}

function WorkStepRow({
  step,
  queryContext,
  isStreaming,
}: {
  step: AnswerWorkStep
  queryContext: string
  isStreaming: boolean
}) {
  const Icon = STEP_ICON[step.status]
  const label = neutralizeBidiFormattingControls(workStepLabel(step, queryContext))
  const summary = step.summary === undefined ? undefined : neutralizeBidiFormattingControls(step.summary.trim())
  const showSummary =
    summary !== undefined && summary.length > 0 && summary !== neutralizeBidiFormattingControls(step.title)
  // While streaming only the running/problem step shows its dense detail rows;
  // a settled (expanded) disclosure shows every step's rows.
  const showDetail =
    !isStreaming ||
    step.status === 'running' ||
    step.status === 'error' ||
    step.status === 'stopped'
  const detailRows = showDetail ? visibleDetailRows(step.detailRows) : []
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 motion-safe:transition-opacity motion-safe:duration-fast motion-safe:ease-standard">
      <span
        className="mt-px inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground"
        aria-hidden="true"
      >
        <Icon
          key={step.status}
          className={cn(
            'size-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-base motion-safe:ease-standard',
            step.status === 'running' && 'text-brand motion-safe:animate-spin',
          )}
        />
      </span>
      <span className="grid min-w-0 gap-0.5 motion-safe:transition-opacity motion-safe:duration-fast motion-safe:ease-standard">
        <span
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
          className={cn(
            'text-xs leading-snug',
            step.status === 'error'
              ? 'text-destructive'
              : 'text-muted-foreground',
          )}
        >
          {step.status === 'error' ? `${label} (failed)` : label}
        </span>
        {showSummary ? (
          <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="text-2xs text-muted-foreground">{summary}</span>
        ) : null}
        {detailRows.length > 0 ? (
          <dl className="grid gap-0.5 pt-0.5">
            {detailRows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2"
              >
                <dt dir="auto" style={{ unicodeBidi: 'isolate' }} className="font-mono text-2xs uppercase tracking-wider text-muted-foreground">
                  {neutralizeBidiFormattingControls(row.label)}
                </dt>
                <dd dir="auto" style={{ unicodeBidi: 'isolate' }} className="min-w-0 break-words text-2xs text-muted-foreground">
                  {neutralizeBidiFormattingControls(row.value)}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </span>
    </li>
  )
}

function PhaseTrail({
  thinkingStep,
  isStreaming,
}: {
  thinkingStep: ThinkingStep | undefined
  isStreaming: boolean
}) {
  const activeIndex =
    thinkingStep === undefined
      ? 0
      : Math.max(
          0,
          THINKING_TRAIL.findIndex((item) => item.step === thinkingStep),
        )

  return (
    <ol className="grid gap-1.5" aria-label="Answer thinking steps">
      {THINKING_TRAIL.map((item, index) => {
        const state =
          index < activeIndex
            ? 'complete'
            : index === activeIndex
              ? 'active'
              : 'pending'
        return (
          <li
            key={item.step}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 motion-safe:transition-opacity motion-safe:duration-fast motion-safe:ease-standard"
          >
            <span
              className="mt-px inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground"
              aria-hidden="true"
            >
              {state === 'complete' ? (
                <CheckIcon
                  key={state}
                  className="size-3.5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-fast motion-safe:ease-standard"
                />
              ) : state === 'active' && isStreaming ? (
                <Loader2Icon
                  key={state}
                  className="size-3.5 text-brand motion-safe:animate-spin motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-fast"
                />
              ) : (
                <span
                  key={state}
                  className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-fast"
                />
              )}
            </span>
            <span
              className={cn(
                'text-xs leading-snug',
                state === 'pending' && 'opacity-60',
              )}
            >
              {item.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ThoughtCell({
  labels,
  isStreaming,
}: {
  labels: readonly string[]
  isStreaming: boolean
}) {
  if (labels.length === 0) {
    return null
  }
  return (
    <details className="group/thought rounded-md border border-border bg-card">
      <summary className="flex min-h-8 cursor-pointer select-none items-center gap-2 px-2.5 py-1.5 text-2xs font-medium uppercase tracking-wider text-muted-foreground marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <ChevronRightIcon
          className="size-3 transition-transform group-open/thought:rotate-90"
          aria-hidden="true"
        />
        Thought{isStreaming ? '…' : ''}
      </summary>
      <ul
        className="grid gap-1 px-2.5 pb-2 text-xs leading-snug text-muted-foreground"
        aria-label="Answer thinking"
      >
        {labels.map((label, index) => (
          <li key={`${index}-${label}`} dir="auto" style={{ unicodeBidi: 'isolate' }}>
            {neutralizeBidiFormattingControls(label)}
          </li>
        ))}
      </ul>
    </details>
  )
}

function CheckSummaryFacts({ summary }: { summary: PublicAnswerCheckSummary }) {
  const total = summary.checksPassed + summary.checksFailed
  return (
    <dl
      className="grid gap-2 rounded-md border border-border bg-card p-2 sm:grid-cols-3"
      aria-label="Answer check summary"
    >
      <Fact label="Searches" value={String(summary.catalogSearches)} />
      <Fact label="Details read" value={String(summary.listingsRead)} />
      <Fact label="Checks" value={`${summary.checksPassed}/${total}`} />
    </dl>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-sm font-medium leading-snug text-foreground">
        {value}
      </dd>
    </div>
  )
}

function visibleDetailRows(
  rows: readonly AnswerWorkStepDetailRow[] | undefined,
): readonly AnswerWorkStepDetailRow[] {
  if (rows === undefined) {
    return []
  }
  return rows
    .filter((row) => row.label.trim().length > 0 && row.value.trim().length > 0)
    .slice(0, 4)
}

/** Sum of completed step durations, falling back to the recorded start/end span. */
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
  if (count > 1) {
    return `Ran ${count} steps`
  }
  if (count === 1) {
    return 'Ran 1 step'
  }
  return ''
}

function answerCheckLine(summary: PublicAnswerCheckSummary): string {
  const total = summary.checksPassed + summary.checksFailed
  const parts = [
    summary.listedBusinesses > 0
      ? `compared ${summary.listedBusinesses} ${summary.listedBusinesses === 1 ? 'match' : 'matches'}`
      : '',
    total > 0 ? `checked ${total} ${total === 1 ? 'fact' : 'facts'}` : '',
  ].filter((part) => part.length > 0)
  return parts.join('; ')
}

function workStepLabel(step: AnswerWorkStep, queryContext: string): string {
  if (step.id === 'capability.execute' || /^(?:Running|Ran|Tried) /.test(step.title) || step.title === 'Presented available capabilities') {
    return step.title
  }
  if (queryContext.length === 0) {
    return step.title
  }
  switch (step.phase) {
    case 'interpret':
      return `Reading the request${queryContext}`
    case 'search':
      return `Searching for matches${queryContext}`
    case 'read':
      return `Reading the details${queryContext}`
    case 'compare':
      return `Comparing the matches${queryContext}`
    case 'assemble':
      return `Putting together the answer${queryContext}`
    case 'route':
      return `Choosing the next step${queryContext}`
  }
}

function buildQueryContext(query: string | undefined): string {
  const normalized = neutralizeBidiFormattingControls(query?.replace(/\s+/g, ' ').trim() ?? '')
  if (normalized.length === 0) {
    return ''
  }
  const short =
    normalized.length > 72
      ? `${normalized.slice(0, 69).trimEnd()}…`
      : normalized
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

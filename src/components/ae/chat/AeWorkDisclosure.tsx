import { ChevronRightIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
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
  /** Overrides only the initial automatic disclosure policy; users can still toggle it. */
  defaultOpen?: boolean
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
  defaultOpen,
}: AeWorkDisclosureProps) {
  const runningStep = workSteps.find((step) => step.status === 'running')
  const isActive = isStreaming || runningStep !== undefined
  // Natural-language thread: accumulated labels plus the live label.
  const thread = buildThinkingThread(thinkingSteps, thinkingLabel)
  const hasProvence = workSteps.length > 0 || checkSummary !== undefined

  if (thread.length === 0 && !hasProvence && !isActive) {
    return null
  }

  return (
    <div className="grid gap-1" data-ae-work-disclosure>
      {thread.length > 0 ? (
        <ol
          className="grid gap-1 text-xs text-muted-foreground"
          aria-label="Search progress"
          data-ae-work-thinking
        >
          {thread.map((label, index) => {
            const isLive = isStreaming && index === thread.length - 1
            return (
              <li
                key={`${index}-${label}`}
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
                className={isLive ? 'font-medium text-foreground' : undefined}
              >
                {neutralizeBidiFormattingControls(label)}
              </li>
            )
          })}
        </ol>
      ) : null}

      {hasProvence ? (
        <Sheet {...(defaultOpen === undefined ? {} : { defaultOpen })}>
          <SheetTrigger asChild>
            <button
              type="button"
              className="group flex min-h-9 w-fit items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-ae-work-trigger
            >
              How this was checked
              <ChevronRightIcon
                className="size-3.5 shrink-0 transition-transform motion-reduce:transition-none group-data-[state=open]:rotate-90"
                aria-hidden="true"
              />
            </button>
          </SheetTrigger>
          <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
            <SheetHeader className="border-b border-border">
              <SheetTitle className="text-base font-semibold">
                How this was checked
              </SheetTitle>
              <SheetDescription className="sr-only">
                The searches and checks behind these results.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {workSteps.length > 0 ? (
                <ol
                  className="divide-y divide-border"
                  aria-label="Search work steps"
                >
                  {workSteps.map((step) => (
                    <WorkStep key={step.id} step={step} />
                  ))}
                </ol>
              ) : null}

              {checkSummary === undefined ? null : (
                <CheckSummaryFacts summary={checkSummary} />
              )}
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  )
}

function buildThinkingThread(
  thinkingSteps: readonly string[],
  thinkingLabel: string,
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const label of [...thinkingSteps, thinkingLabel]) {
    const trimmed = label.trim()
    if (trimmed.length === 0 || seen.has(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
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
      aria-label="Search check summary"
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

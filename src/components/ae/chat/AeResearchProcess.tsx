import { useEffect, useRef, useState } from 'react'
import { AlertCircleIcon, CheckIcon, ChevronDownIcon, CircleIcon, Loader2Icon, SquareIcon } from 'lucide-react'

import {
  AeCollapsible as Collapsible,
  AeCollapsibleContent as CollapsibleContent,
  AeCollapsibleTrigger as CollapsibleTrigger,
} from '@/components/ae/primitives/AeCollapsible'
import { cn } from '@/lib/utils'
import type { AnswerWorkStep } from '@/modules/answer/public'

const STATUS_TONE =
  'data-[status=complete]:border-green-ring data-[status=complete]:bg-green-subtle data-[status=complete]:text-green-vivid data-[status=running]:border-border-strong data-[status=running]:text-primary data-[status=error]:border-red-ring data-[status=error]:bg-red-subtle data-[status=error]:text-red-vivid data-[status=stopped]:border-red-ring data-[status=stopped]:bg-red-subtle data-[status=stopped]:text-red-vivid'

export type AeResearchProcessProps = {
  isStreaming: boolean
  steps: readonly AnswerWorkStep[]
}

/**
 * Concise reasoning trace: one plain line per step (no internal search
 * parameters). Expands while the answer is being worked out, collapses once
 * it is ready. Full step evidence stays in the agent JSON / replay payload.
 */
export function AeResearchProcess({ isStreaming, steps }: AeResearchProcessProps) {
  const needsReview = steps.some((step) => step.status === 'error' || step.status === 'stopped')
  const userManagedOpenRef = useRef(false)
  const [open, setOpen] = useState(isStreaming || needsReview)

  useEffect(() => {
    if (userManagedOpenRef.current) {
      return
    }
    setOpen(isStreaming || needsReview)
  }, [isStreaming, needsReview])

  if (steps.length === 0) {
    return null
  }

  const overallStatus = getOverallStatus(steps)
  const running = steps.find((step) => step.status === 'running')
  const latest = running ?? steps.at(-1)
  const statusLabel = getOverallStatusLabel(overallStatus, latest)

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
          <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-secondary">Reasoning</span>
          <span className="truncate text-xs text-secondary">{statusLabel}</span>
        </span>
        <ChevronDownIcon
          className={cn('size-4 justify-self-end text-secondary transition-transform', open ? 'rotate-180' : 'rotate-0')}
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="p-3">
        <ol className="grid gap-2" aria-label="Reasoning steps">
          {steps.map((step) => (
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
              <span className="text-sm leading-snug text-secondary">{step.summary ?? step.title}</span>
            </li>
          ))}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
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

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  FileTextIcon,
  Loader2Icon,
  RouteIcon,
  SearchIcon,
  SquareIcon,
} from 'lucide-react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import type { AnswerWorkStep, AnswerWorkStepPhase, AnswerWorkStepStatus } from '@/modules/answer/public'

export type AeResearchProcessProps = {
  isStreaming: boolean
  steps: readonly AnswerWorkStep[]
}

export function AeResearchProcess({ isStreaming, steps }: AeResearchProcessProps) {
  const needsReview = steps.some((step) => step.status === 'error' || step.status === 'stopped')
  const userManagedOpenRef = useRef(false)
  const [open, setOpen] = useState(isStreaming || needsReview)
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>(() => initialExpandedSteps(steps))
  const completedCount = steps.filter((step) => step.status === 'complete' || step.status === 'skipped').length
  const running = steps.find((step) => step.status === 'running')
  const latest = running ?? steps.at(-1)
  const overallStatus = getOverallStatus(steps)
  const statusLabel = getOverallStatusLabel(overallStatus, latest)
  const progressLabel = isStreaming
    ? `${completedCount}/${steps.length} · ${statusLabel}`
    : needsReview
      ? statusLabel
      : 'Published details checked'

  useEffect(() => {
    if ((isStreaming && !userManagedOpenRef.current) || needsReview) {
      setOpen(true)
    }
  }, [isStreaming, needsReview])

  useEffect(() => {
    setExpandedSteps((current) => {
      const next: Record<string, boolean> = {}
      for (const step of steps) {
        next[step.id] = current[step.id] ?? step.status === 'running'
      }
      return next
    })
  }, [steps])

  const ordered = useMemo(() => [...steps], [steps])

  if (steps.length === 0) {
    return null
  }

  function handleOpenChange(nextOpen: boolean) {
    userManagedOpenRef.current = true
    setOpen(nextOpen)
  }

  return (
    <Collapsible className="ae-research-process" open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger className="ae-research-process__trigger" type="button">
        <span className="ae-research-process__header-icon" data-status={overallStatus} aria-hidden="true">
          <OverallStatusIcon status={overallStatus} />
        </span>
        <span className="ae-research-process__header-copy">
          <span className="ae-research-process__title">What AE checked</span>
          <span className="ae-research-process__meta">
            {progressLabel}
          </span>
        </span>
        <ChevronDownIcon
          className={cn('ae-research-process__chevron', open ? 'rotate-180' : 'rotate-0')}
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="ae-research-process__content">
        <ol className="ae-research-process__steps" aria-label="Answer process steps">
          {ordered.map((step, index) => {
            const isExpanded = expandedSteps[step.id] ?? step.status === 'running'
            const expandable = hasStepDetail(step)
            const isLast = index === ordered.length - 1
            const durationLabel = step.durationMs === undefined ? undefined : formatDuration(step.durationMs)
            const stepMeta = durationLabel ?? formatStepStatus(step.status)

            return (
              <li
                key={step.id}
                className="ae-research-process__step"
                data-status={step.status}
                data-expanded={isExpanded ? 'true' : 'false'}
              >
                <span className="ae-research-process__timeline" data-last={isLast ? 'true' : 'false'} aria-hidden="true">
                  <span className="ae-research-process__node">
                    <StepStatusIcon step={step} />
                  </span>
                </span>
                <div className="ae-research-process__step-body">
                  <Collapsible open={isExpanded} onOpenChange={(nextOpen) => setExpandedSteps((current) => ({ ...current, [step.id]: nextOpen }))}>
                    {expandable ? (
                      <CollapsibleTrigger className="ae-research-process__step-trigger" type="button">
                        <StepTitle step={step} stepMeta={stepMeta} expandable expanded={isExpanded} />
                      </CollapsibleTrigger>
                    ) : (
                      <div className="ae-research-process__step-trigger ae-research-process__step-trigger--static">
                        <StepTitle step={step} stepMeta={stepMeta} />
                      </div>
                    )}
                    {expandable ? (
                      <CollapsibleContent className="ae-research-process__step-content">
                        <div className="ae-research-process__step-panel">
                          {step.summary !== undefined ? (
                            <p className="ae-research-process__summary">{step.summary}</p>
                          ) : null}
                          {step.detailRows !== undefined && step.detailRows.length > 0 ? (
                            <dl className="ae-research-process__details">
                              {step.detailRows.slice(0, 6).map((row) => (
                                <div key={`${step.id}-${row.label}`} className="ae-research-process__detail">
                                  <dt>{row.label}</dt>
                                  <dd>{row.value}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : null}
                        </div>
                      </CollapsibleContent>
                    ) : null}
                  </Collapsible>
                </div>
              </li>
            )
          })}
        </ol>
      </CollapsibleContent>
    </Collapsible>
  )
}

function StepStatusIcon({ step }: { step: AnswerWorkStep }) {
  const className = 'ae-research-process__icon'
  switch (step.status) {
    case 'complete':
      return <CheckIcon className={className} aria-hidden="true" />
    case 'error':
      return <AlertCircleIcon className={className} aria-hidden="true" />
    case 'stopped':
      return <SquareIcon className={className} aria-hidden="true" />
    case 'running':
      return <Loader2Icon className={`${className} ae-research-process__icon--spin`} aria-hidden="true" />
    case 'skipped':
      return <PhaseIcon phase={step.phase} className={className} />
  }
}

function StepTitle({
  step,
  stepMeta,
  expandable = false,
  expanded = false,
}: {
  step: AnswerWorkStep
  stepMeta: string
  expandable?: boolean
  expanded?: boolean
}) {
  return (
    <>
      <span className="ae-research-process__phase" aria-hidden="true">
        <PhaseIcon phase={step.phase} className="ae-research-process__phase-icon" />
      </span>
      <span className="ae-research-process__step-copy">
        <span className="ae-research-process__step-title">{step.title}</span>
        <span className="ae-research-process__step-state">{formatStepStatus(step.status)}</span>
      </span>
      <span className="ae-research-process__step-tools">
        <span className="ae-research-process__duration">{stepMeta}</span>
        {expandable ? (
          expanded ? (
            <ChevronDownIcon className="ae-research-process__step-chevron" aria-hidden="true" />
          ) : (
            <ChevronRightIcon className="ae-research-process__step-chevron" aria-hidden="true" />
          )
        ) : null}
      </span>
    </>
  )
}

function OverallStatusIcon({ status }: { status: OverallStatus }) {
  switch (status) {
    case 'running':
      return <Loader2Icon className="ae-research-process__header-status ae-research-process__icon--spin" aria-hidden="true" />
    case 'complete':
      return <CheckIcon className="ae-research-process__header-status" aria-hidden="true" />
    case 'error':
      return <AlertCircleIcon className="ae-research-process__header-status" aria-hidden="true" />
    case 'stopped':
      return <SquareIcon className="ae-research-process__header-status" aria-hidden="true" />
    case 'idle':
      return <CircleIcon className="ae-research-process__header-status" aria-hidden="true" />
  }
}

function PhaseIcon({ phase, className }: { phase: AnswerWorkStepPhase; className: string }) {
  switch (phase) {
    case 'interpret':
      return <FileTextIcon className={className} aria-hidden="true" />
    case 'search':
      return <SearchIcon className={className} aria-hidden="true" />
    case 'read':
      return <FileTextIcon className={className} aria-hidden="true" />
    case 'compare':
      return <CircleIcon className={className} aria-hidden="true" />
    case 'route':
      return <RouteIcon className={className} aria-hidden="true" />
    case 'assemble':
      return <CheckIcon className={className} aria-hidden="true" />
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

function hasStepDetail(step: AnswerWorkStep): boolean {
  return step.summary !== undefined || (step.detailRows !== undefined && step.detailRows.length > 0)
}

function initialExpandedSteps(steps: readonly AnswerWorkStep[]): Record<string, boolean> {
  return steps.reduce<Record<string, boolean>>((expanded, step) => {
    expanded[step.id] = step.status === 'running' || step.status === 'error'
    return expanded
  }, {})
}

function formatStepStatus(status: AnswerWorkStepStatus): string {
  switch (status) {
    case 'running':
      return 'In progress'
    case 'complete':
      return 'Done'
    case 'skipped':
      return 'Skipped'
    case 'error':
      return 'Needs retry'
    case 'stopped':
      return 'Stopped'
  }
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1_000) {
    return `${Math.round(durationMs)}ms`
  }
  return `${(durationMs / 1_000).toFixed(1)}s`
}

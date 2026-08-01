import {
  CircleCheckIcon,
  CircleIcon,
  CircleXIcon,
  LoaderCircleIcon,
  MinusCircleIcon,
} from 'lucide-react'

import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan'

import type { EnginePlanStreamEvent } from '@/modules/answer/public'
import { cn } from '@/lib/utils'

type EnginePlan = Omit<Extract<EnginePlanStreamEvent, { type: 'plan-contract' }>, 'type'>
type PlanStep = EnginePlan['steps'][number]

export function AePlanWork({ plan }: { plan: EnginePlan }) {
  const initial = plan.steps.every(({ status }) => status === 'pending')
  if (initial) return <PlanContract plan={plan} />

  const completeCount = plan.steps.filter(({ status }) => status === 'completed').length
  const activeStep = plan.steps.find(({ status }) => status === 'in_progress')

  return (
    <Plan
      defaultOpen={false}
      aria-live="polite"
      className="gap-0 border-0 bg-transparent p-0 shadow-none"
    >
      <PlanHeader className="flex min-h-11 items-center gap-2 rounded-md p-0 text-sm text-muted-foreground">
        {activeStep === undefined
          ? <CircleCheckIcon className="size-4 shrink-0" aria-hidden="true" />
          : <LoaderCircleIcon className="size-4 shrink-0 motion-safe:animate-spin" aria-hidden="true" />}
        <PlanTitle className="min-w-0 flex-1 font-medium text-foreground [overflow-wrap:anywhere]">
          {activeStep?.title ?? 'Working through your plan'}
        </PlanTitle>
        <span className="shrink-0 text-xs tabular-nums">{completeCount}/{plan.steps.length}</span>
        <PlanAction className="shrink-0">
          <PlanTrigger aria-label="Toggle plan details" />
        </PlanAction>
      </PlanHeader>
      <PlanContent className="grid gap-2 px-0 pb-2 pt-1">
        <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">{plan.goalText}</p>
        <PlanStepList steps={plan.steps} showStatus />
      </PlanContent>
    </Plan>
  )
}

function PlanContract({ plan }: { plan: EnginePlan }) {
  return (
    <Plan
      open
      aria-label="Plan for your request"
      aria-live="polite"
      className="grid gap-3 border border-border bg-card p-4"
    >
      <PlanHeader className="grid min-w-0 gap-1 p-0">
        <PlanTitle className="text-sm font-semibold text-brand">Here’s the plan</PlanTitle>
        <PlanDescription className="text-base font-medium text-foreground [overflow-wrap:anywhere]">
          {plan.goalText}
        </PlanDescription>
      </PlanHeader>
      <PlanContent className="p-0">
        <PlanStepList steps={plan.steps} />
      </PlanContent>
      <PlanFooter className="p-0">
        <p className="text-xs text-muted-foreground">I’ll keep this plan visible as the work progresses.</p>
      </PlanFooter>
    </Plan>
  )
}

// The official Element provides the Card/collapsible shell; engine plan-contract
// statuses, labels, and icons are not part of that API and stay in this adapter.

function PlanStepList({ steps, showStatus = false }: { steps: EnginePlan['steps']; showStatus?: boolean }) {
  return (
    <ol className="grid gap-1.5">
      {steps.map((step) => (
        <li key={step.id} className="flex min-w-0 items-start gap-2 text-sm text-muted-foreground">
          <PlanStepIcon status={step.status} />
          <span className={cn(
            'min-w-0 flex-1 [overflow-wrap:anywhere]',
            step.status === 'in_progress' && 'font-medium text-foreground',
            step.status === 'failed' && 'text-destructive',
          )}>
            {step.title}
          </span>
          {showStatus ? <span className="shrink-0 text-xs">{statusLabel(step.status)}</span> : null}
          {!showStatus ? <span className="sr-only"> — {statusLabel(step.status)}</span> : null}
        </li>
      ))}
    </ol>
  )
}

function PlanStepIcon({ status }: { status: PlanStep['status'] }) {
  const className = 'mt-0.5 size-4 shrink-0'
  switch (status) {
    case 'completed':
      return <CircleCheckIcon className={className} aria-hidden="true" />
    case 'in_progress':
      return <LoaderCircleIcon className={cn(className, 'motion-safe:animate-spin')} aria-hidden="true" />
    case 'failed':
      return <CircleXIcon className={cn(className, 'text-destructive')} aria-hidden="true" />
    case 'skipped':
      return <MinusCircleIcon className={className} aria-hidden="true" />
    case 'pending':
      return <CircleIcon className={className} aria-hidden="true" />
  }
}

function statusLabel(status: PlanStep['status']): string {
  switch (status) {
    case 'completed': return 'Complete'
    case 'in_progress': return 'In progress'
    case 'failed': return 'Failed'
    case 'skipped': return 'Skipped'
    case 'pending': return 'Pending'
  }
}

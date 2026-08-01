import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

import type {
  ConsumerPlan,
  ConsumerPlanOption,
  ConsumerPlanResult,
  ConsumerPlanStep,
} from '@/modules/customer-request/application/public'

import { AeDecisionTrail } from './AeDecisionTrail'
import { formatPublishedPrice } from '../services/money'

export type AeConsumerPlanProps = Readonly<{
  plan: ConsumerPlan
}>

export function AeConsumerPlan({ plan }: AeConsumerPlanProps) {
  return (
    <section aria-labelledby="consumer-plan-title" className="grid gap-6">
      <header className="grid gap-2 border-b border-border pb-4">
        <p className="block text-sm font-semibold text-muted-foreground">YOUR REQUEST</p>
        <h2 id="consumer-plan-title" className="text-xl font-semibold text-foreground">{plan.destination.label}</h2>
        <p className="block max-w-3xl text-muted-foreground">
          Here are the steps, options, and next decision for this request.
        </p>
        <p role="status" className="text-muted-foreground">
          Step {plan.frontier.step} is ready to compare. Choose an option to decide what happens next.
        </p>
      </header>

      <ol className="m-0 grid list-none gap-5 p-0" aria-label="Plan steps">
        {plan.steps.map((step) => <PlanStepView key={step.step} step={step} />)}
      </ol>
    </section>
  )
}
export function AeConsumerPlanResult({ result }: Readonly<{ result: ConsumerPlanResult }>) {
  if (result.kind === 'plan') return <AeConsumerPlan plan={result} />
  if (result.kind === 'needs_information') {
    return (
      <Card className="border border-border bg-card" role="status">
        <CardHeader>
          <CardTitle>A little more detail will shape the plan</CardTitle>
          <CardDescription>{result.prompt}</CardDescription>
        </CardHeader>
      </Card>
    )
  }
  return (
    <Card className="border border-border bg-card" role="status">
      <CardHeader>
        <CardTitle>These options changed</CardTitle>
        <CardDescription>The published options changed before you could compare them. Refine your request or start a new one.</CardDescription>
      </CardHeader>
    </Card>
  )
}

function PlanStepView({ step }: Readonly<{ step: ConsumerPlanStep }>) {
  const stateText = stateLabel(step)
  return (
    <li>
      <Card className="border border-border bg-card p-0" aria-labelledby={`plan-step-${step.step}`}>
        <CardHeader className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="grid gap-1">
              <p className="text-sm font-semibold text-muted-foreground">STEP {step.step}</p>
              <CardTitle id={`plan-step-${step.step}`} role="heading" aria-level={3} className="text-xl text-foreground">{step.title}</CardTitle>
              <CardDescription>{step.purpose}</CardDescription>
            </div>
            <Badge variant="outline">{stateText}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 pt-0">
          {step.dependsOn.length === 0 ? null : (
            <p className="text-sm text-muted-foreground">After step {step.dependsOn.join(' and ')}</p>
          )}
          {step.options.length === 0 ? (
            <p role="status" className="text-muted-foreground">Options for this step are not available right now. Check again or change your request.</p>
          ) : (
            <ol className="m-0 grid list-none gap-3 p-0" aria-label={`Options for step ${step.step}`}>
              {step.options.map((option, index) => <PlanOption key={option.optionRef} option={option} index={index} />)}
            </ol>
          )}
        </CardContent>
        <CardFooter className="border-t border-border p-5 pt-3">
          <p className="text-sm text-muted-foreground">Next decision: {step.nextAction.label}</p>
        </CardFooter>
      </Card>
    </li>
  )
}

function PlanOption({ option, index }: Readonly<{ option: ConsumerPlanOption; index: number }>) {
  const location = option.business.location === undefined ? '' : ` · ${option.business.location}`
  const price = option.price.kind === 'published'
    ? formatPublishedPrice(option.price.published)
    : 'No price published yet'
  const timing = option.availability.kind === 'published'
    ? option.availability.summary ?? 'Timing is published but needs a fresh check'
    : 'Timing is not published; ask the business'
  return (
    <li>
      <Card className="grid gap-3 border border-border p-4">
        <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid gap-1">
            <p className="text-sm font-semibold text-muted-foreground">Option {index + 1}</p>
            <h3 className="text-lg font-semibold text-foreground">{option.offering.name}</h3>
            <p className="text-sm text-muted-foreground">{option.business.name}{location}</p>
          </div>
          <div className="sm:text-right">
            <p className="text-sm text-muted-foreground">Price</p>
            <p className="font-semibold text-foreground">{price}</p>
          </div>
        </div>
        <p className="text-foreground">{option.offering.summary}</p>
        <dl className="grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Timing</dt>
            <dd className="m-0 text-foreground">{timing}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">Published by</dt>
            <dd className="m-0 text-foreground">{option.evidence.source === 'ae_sandbox' ? 'AE example business' : 'Business'}</dd>
          </div>
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {option.nextAction.href === undefined ? (
            <p className="text-sm text-muted-foreground">Next decision: {option.nextAction.label}</p>
          ) : (
            <Button asChild variant="secondary" className="min-h-11">
              <a href={option.nextAction.href}>{option.nextAction.label}</a>
            </Button>
          )}
        </div>
      </Card>
    </li>
  )
}

function stateLabel(step: ConsumerPlanStep): string {
  if (step.state === 'frontier') return 'Ready for your decision'
  if (step.state === 'queued') return 'Waiting for the earlier step'
  if (step.state === 'needs_attention') return 'Needs a fresh check'
  if (step.state === 'completed') return 'Checked'
  if (step.state === 'running') return 'Checking now'
  return 'Waiting for the earlier step'
}

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'

import type {
  ConsumerPlan,
  ConsumerPlanOption,
  ConsumerPlanResult,
  ConsumerPlanStep,
} from './consumer-plan'

import { ProvenanceBadge } from '@/components/ae/status/ProvenanceBadge'
import { useErrorShake } from '@/components/ae/magic/useErrorShake'
import { formatPublishedPrice } from '../services/money'

export type AeConsumerPlanProps = Readonly<{
  plan: ConsumerPlan
}>

export function AeConsumerPlan({ plan }: AeConsumerPlanProps) {
  return (
    <section aria-labelledby="consumer-plan-title" className="grid gap-6">
      <header className="grid gap-2 border-b border-border pb-4">
        <h2 id="consumer-plan-title" className="text-xl font-semibold text-foreground">{plan.destination.label}</h2>
        <p className="block max-w-3xl text-muted-foreground">
          Here's what we found for that — choose an option to continue.
        </p>
      </header>

      <ol className="m-0 grid list-none gap-5 p-0" aria-label="Options for this ask">
        {plan.steps.map((step) => (
          <PlanStepView key={step.step} step={step} isFrontier={step.state === 'frontier'} />
        ))}
      </ol>
    </section>
  )
}
export function AeConsumerPlanResult({
  result,
  initialQuery = '',
}: Readonly<{ result: ConsumerPlanResult; initialQuery?: string }>) {
  if (result.kind === 'plan') return <AeConsumerPlan plan={result} />
  if (result.kind === 'needs_information') {
    return <NeedsInformationCard prompt={result.prompt} initialQuery={initialQuery} />
  }
  return (
    <Card className="border border-border bg-card" role="status">
      <CardHeader>
        <CardTitle>These options changed</CardTitle>
        <CardDescription>The published options changed before you could compare them. Refine your ask or start a new one.</CardDescription>
      </CardHeader>
      <CardFooter>
        <Button asChild variant="secondary" className="min-h-11">
          <Link to="/">Try a different ask</Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

function NeedsInformationCard({ prompt, initialQuery }: Readonly<{ prompt: string; initialQuery: string }>) {
  const navigate = useNavigate()
  const [detail, setDetail] = useState(initialQuery)
  const { ref: shakeRef, shake } = useErrorShake()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const next = detail.trim()
    if (next.length === 0) {
      shake()
      return
    }
    // The root route is query-driven: navigating re-runs the plan loader with
    // the refined ask.
    void navigate({ to: '/', search: { q: next } })
  }

  return (
    <Card ref={shakeRef} className="border border-border bg-card" role="status">
      <CardHeader>
        <CardTitle>A little more detail will give you better options</CardTitle>
        <CardDescription>{prompt}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3" onSubmit={submit}>
          <label htmlFor="refine-request-input" className="text-sm font-medium text-foreground">
            Add the detail to continue
          </label>
          <div className="flex flex-wrap gap-2">
            <Input
              id="refine-request-input"
              value={detail}
              onChange={(event) => setDetail(event.target.value)}
              placeholder="Your answer"
              className="sm:max-w-sm"
            />
            <Button type="submit" variant="default" data-variant="primary" className="min-h-11">
              Refine request
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Refining re-runs the search with your added detail. Or{' '}
            <Link to="/" className="underline-offset-4 hover:text-foreground hover:underline">start a new ask</Link>.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}

function PlanStepView({ step, isFrontier }: Readonly<{ step: ConsumerPlanStep; isFrontier: boolean }>) {
  return (
    <li>
      <Card className="border border-border bg-card p-0" aria-labelledby={`plan-step-${step.step}`}>
        <CardHeader className="p-5 pb-0">
          <div className="grid gap-1">
            <CardTitle id={`plan-step-${step.step}`} role="heading" aria-level={3} className="text-xl text-foreground">{step.title}</CardTitle>
            <CardDescription>{step.purpose}</CardDescription>
            {step.state === 'needs_attention' || step.state === 'running' ? (
              <p role="status" className="text-sm text-muted-foreground">Needs a fresh check.</p>
            ) : null}
          </div>
        </CardHeader>
        {isFrontier ? (
          <CardContent className="grid gap-4 p-5 pt-4">
            {step.options.length === 0 ? (
              <p role="status" className="text-muted-foreground">Options for this step are not available right now. Check again or change your ask.</p>
            ) : (
              <ol className="m-0 grid list-none gap-3 p-0" aria-label={`Options for step ${step.step}`}>
                {step.options.map((option, index) => <PlanOption key={option.optionRef} option={option} index={index} />)}
              </ol>
            )}
          </CardContent>
        ) : (
          <p className="px-5 pb-5 pt-2 text-sm text-muted-foreground">Coming up after you choose.</p>
        )}
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
      <Card className="grid h-full gap-4 border p-5" data-variant="offering">
        <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid gap-1">
            <p className="text-sm font-semibold text-muted-foreground">Option {index + 1}</p>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-foreground">{option.offering.name}</h3>
              <ProvenanceBadge source={option.evidence.source} />
            </div>
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
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {option.nextAction.href === undefined ? (
            <p className="text-sm text-muted-foreground">Next: {option.nextAction.label}</p>
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

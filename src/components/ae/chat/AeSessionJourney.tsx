import { CheckIcon, CircleIcon, Loader2Icon } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { FollowUpIntent, PublicThreadProjection } from '@/modules/answer-thread/public'
import type { SessionJourneyStatus } from './session-journey'
import { buildSessionJourney } from './session-journey'

export type AeSessionJourneyProps = {
  projection: PublicThreadProjection | null
  liveTurn?: { intent: FollowUpIntent } | null
}

export function AeSessionJourney({ projection, liveTurn = null }: AeSessionJourneyProps) {
  const journey = buildSessionJourney({ projection, liveTurn })

  if (journey === null) {
    return null
  }

  return (
    <section className="mx-auto w-full max-w-[52rem] px-4 pt-3 md:px-6" aria-label="Inquiry path">
      <div className="grid gap-3 rounded-md border border-border bg-surface p-3 shadow-sm">
        <div className="grid gap-1 sm:grid-cols-[minmax(9rem,0.55fr)_minmax(0,1fr)] sm:items-center sm:gap-4">
          <div className="grid gap-0.5">
            <p className="font-mono text-2xs font-semibold uppercase tracking-wider text-secondary">
              {journey.heading}
            </p>
            <p className="text-sm font-medium leading-snug text-primary">
              {journey.providerCount > 0
                ? `${journey.providerCount} listed ${journey.providerCount === 1 ? 'provider' : 'providers'} ready to compare`
                : 'Finding the right listed provider'}
            </p>
          </div>
          <p className="text-sm leading-snug text-secondary">{journey.guidance}</p>
        </div>
        <ol className="grid gap-2 sm:grid-cols-4" aria-label="Session stages">
          {journey.steps.map((step) => (
            <li
              key={step.id}
              data-status={step.status}
              aria-current={step.status === 'active' ? 'step' : undefined}
              className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border border-border bg-card p-2 data-[status=active]:border-border-strong data-[status=active]:bg-muted data-[status=complete]:border-green-ring data-[status=complete]:bg-green-subtle data-[status=pending]:opacity-70"
            >
              <span
                className="mt-px inline-flex size-5 items-center justify-center rounded-full border border-border bg-surface text-secondary data-[status=complete]:border-green-ring data-[status=complete]:text-green-vivid data-[status=active]:border-border-strong data-[status=active]:text-primary"
                data-status={step.status}
                aria-hidden="true"
              >
                <SessionJourneyIcon status={step.status} />
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="sr-only">{statusLabel(step.status)}: </span>
                <span className="text-sm font-medium leading-snug text-primary">{step.label}</span>
                <span className="text-xs leading-snug text-secondary">{step.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function SessionJourneyIcon({ status }: { status: SessionJourneyStatus }) {
  const className = cn('size-3', status === 'active' ? 'motion-safe:animate-spin' : '')

  switch (status) {
    case 'complete':
      return <CheckIcon className="size-3" aria-hidden="true" />
    case 'active':
      return <Loader2Icon className={className} aria-hidden="true" />
    case 'pending':
      return <CircleIcon className="size-3" aria-hidden="true" />
  }
}

function statusLabel(status: SessionJourneyStatus): string {
  switch (status) {
    case 'complete':
      return 'Complete'
    case 'active':
      return 'Current'
    case 'pending':
      return 'Pending'
  }
}

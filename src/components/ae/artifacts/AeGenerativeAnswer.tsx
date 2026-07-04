import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckIcon, SearchIcon } from 'lucide-react'

import { Badge } from '@astryxdesign/core/Badge'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Text } from '@astryxdesign/core/Text'

import {
  artifactsToMessageParts,
  inferLayoutProfileFromArtifacts,
  type AnswerLayoutProfile,
  type AnswerMessagePart,
} from '@/modules/answer/public'
import type { AnswerArtifact, AnswerCompareField, AnswerSource } from '@/modules/answer/public'
import { AeProviderCard } from '@/components/ae/primitives/AeProviderCard'
import { AeKicker } from '@/components/ae/primitives/AeKicker'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeStreamingLabel } from '@/components/ae/chat/AeStreamingLabel'
import { AeGenerativeMap } from './AeGenerativeMap'

const REVEAL_ENTER =
  'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300'

export type AeGenerativeAnswerPhase =
  | 'idle'
  | 'streaming'
  | 'reconnecting'
  | 'complete'
  | 'stopped'
  | 'error'

export type AeGenerativeAnswerProps = {
  artifacts: readonly AnswerArtifact[]
  query: string
  layoutProfile?: AnswerLayoutProfile
  busy?: boolean
  oneLineFallback?: string
  onStop?: () => void
  phase?: AeGenerativeAnswerPhase
  errorMessage?: ReactNode | null
  /** Thread this answer belongs to, if one exists yet. Lets provider links carry a "back to answer" origin instead of always falling back to home. */
  threadId?: string
}

export function AeGenerativeAnswer({
  artifacts,
  query,
  layoutProfile,
  busy = false,
  oneLineFallback = '',
  onStop,
  phase = 'idle',
  errorMessage = null,
  threadId,
}: AeGenerativeAnswerProps) {
  const profile = inferLayoutProfileFromArtifacts({
    artifacts,
    ...(layoutProfile === undefined ? {} : { layoutProfile }),
    busy,
  })

  const parts = artifactsToMessageParts(artifacts, profile)
  const oneLinePart = parts.find((part) => part.kind === 'one-line')
  const headline =
    oneLinePart?.kind === 'one-line'
      ? oneLinePart.text
      : oneLineFallback.length > 0
        ? oneLineFallback
        : ''

  const empty = phase === 'complete' && profile === 'empty_state'
  const isFirstTurnProfile = profile === 'discovery_full' || profile === 'empty_state'
  const hasProviderEvidence = parts.some(isProviderEvidencePart)
  const hasSummary = parts.some((part) => part.kind === 'prose' && part.text.trim().length > 0)
  const hasNextStep = parts.some((part) => part.kind === 'what-to-do-now' && part.text.trim().length > 0)

  return (
    <section
      className="grid gap-4"
      data-phase={phase}
      data-profile={profile}
      data-empty={empty ? 'true' : 'false'}
      aria-busy={busy}
    >
      <div className="flex items-start justify-between gap-3">
        {headline.length > 0 ? (
          <p
            className={
              isFirstTurnProfile
                ? `${REVEAL_ENTER} min-w-0 flex-1 font-heading text-2xl leading-snug text-balance text-primary`
                : 'min-w-0 flex-1 text-sm text-secondary'
            }
            aria-live={busy ? 'polite' : 'off'}
          >
            {headline}
          </p>
        ) : busy ? (
          <p
            className="min-w-0 flex-1 text-lg text-secondary"
            aria-live="polite"
            aria-label="Finding listed businesses"
          >
            <AeStreamingLabel as="span">Finding listed businesses</AeStreamingLabel>
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-lg text-secondary">Finding listed businesses</p>
        )}

        {phase === 'reconnecting' ? (
          <span className="shrink-0 text-xs text-secondary" role="status">
            <AeStreamingLabel as="span">Reconnecting…</AeStreamingLabel>
          </span>
        ) : null}

        {busy && onStop !== undefined ? (
          <Button label="Stop" type="button" variant="secondary" size="sm" onClick={onStop} />
        ) : null}
      </div>

      {phase === 'error' && errorMessage !== null ? (
        <div className="rounded-md border border-red-ring bg-red-subtle p-4 text-sm text-red-vivid" role="alert">
          <div>{errorMessage}</div>
        </div>
      ) : null}

      <AeAnswerJourney
        phase={phase}
        profile={profile}
        hasHeadline={headline.length > 0}
        hasProviderEvidence={hasProviderEvidence}
        hasSummary={hasSummary}
        hasNextStep={hasNextStep}
      />

      {parts.map((part, index) => (
        <AnswerPartView key={`${part.kind}-${index}`} part={part} query={query} empty={empty} phase={phase} threadId={threadId} />
      ))}

      {phase === 'complete' && !empty ? (
        <p className="sr-only" role="status">
          Answer ready.
        </p>
      ) : null}
    </section>
  )
}

function isProviderEvidencePart(part: AnswerMessagePart): boolean {
  switch (part.kind) {
    case 'selected-provider':
    case 'provider-cards':
    case 'provider-compare-table':
      return true
    default:
      return false
  }
}

type AnswerJourneyState = 'complete' | 'active' | 'pending' | 'error' | 'stopped'

function AeAnswerJourney({
  phase,
  profile,
  hasHeadline,
  hasProviderEvidence,
  hasSummary,
  hasNextStep,
}: {
  phase: AeGenerativeAnswerPhase
  profile: AnswerLayoutProfile
  hasHeadline: boolean
  hasProviderEvidence: boolean
  hasSummary: boolean
  hasNextStep: boolean
}) {
  const empty = profile === 'empty_state'
  const steps = [
    {
      label: 'Understand need',
      detail: 'AE reads the request, place, and service intent.',
      record: 'need read',
    },
    {
      label: 'Check listings',
      detail: 'Published business details are checked for this turn.',
      record: 'published facts',
    },
    {
      label: 'Compare published facts',
      detail: 'Published area, response, and next-step details are compared.',
      record: 'facts compared',
    },
    {
      label: 'Hand off next step',
      detail: empty
        ? 'AE offers a sharper route when no listed fit is clear.'
        : 'Open a listing or send a qualified inquiry for owner review.',
      record: 'handoff ready',
    },
  ] as const

  const completedIndex = getJourneyCompletedIndex({
    phase,
    empty,
    hasHeadline,
    hasProviderEvidence,
    hasSummary,
    hasNextStep,
  })
  const activeIndex =
    phase === 'streaming'
      ? Math.min(completedIndex + 1, steps.length - 1)
      : Math.max(0, Math.min(completedIndex, steps.length - 1))
  const guidance =
    phase === 'streaming'
      ? 'AE is assembling the proof spine as the answer arrives.'
      : empty
        ? 'No clear published match yet; use the route below to sharpen the search.'
        : 'AE reads, checks, compares, and routes. The business still confirms timing, quote, and availability.'

  return (
    <Card
      padding={4}
      className={`${REVEAL_ENTER} grid gap-5 border border-border bg-surface`}
      aria-label="AE proof spine"
      data-phase={phase}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <img
            src="/brand/logo/ae-seal.svg"
            alt=""
            aria-hidden="true"
            className="mt-0.5 size-8 shrink-0"
            loading="lazy"
          />
          <div className="grid min-w-0 gap-1">
            <Badge variant="neutral" className="w-fit" label="Proof spine" />
            <Text type="large" weight="semibold" color="primary" display="block">
              The handoff is a record.
            </Text>
            <Text color="secondary" className="max-w-[58ch] text-pretty" display="block">
              {guidance}
            </Text>
          </div>
        </div>
        <Text type="supporting" color="secondary" className="font-mono tabular-nums" display="block">
          {phase === 'complete' ? 'record ready' : phase === 'streaming' ? 'assembling' : 'handoff record'}
        </Text>
      </div>

      <ol
        className="grid gap-4 border-l border-border pl-5 sm:grid-cols-4 sm:gap-5 sm:border-l-0 sm:border-t sm:pl-0 sm:pt-5"
        aria-live={phase === 'streaming' ? 'polite' : 'off'}
        aria-label="Answer handoff proof spine"
      >
        {steps.map((step, index) => {
          const state = getJourneyState({ index, activeIndex, completedIndex, phase })
          const nodeClassName = [
            'absolute -left-[1.85rem] top-0 inline-flex size-5 items-center justify-center rounded-full border font-mono text-2xs font-semibold tabular-nums sm:-top-[1.9rem] sm:left-0',
            state === 'complete' ? 'border-accent bg-accent text-on-accent' : '',
            state === 'active' ? 'border-accent bg-surface text-accent' : '',
            state === 'pending' ? 'border-border bg-surface text-secondary' : '',
            state === 'error' || state === 'stopped' ? 'border-red-ring bg-red-subtle text-red-vivid' : '',
          ].join(' ')

          return (
            <li
              key={step.label}
              data-state={state}
              aria-current={state === 'active' ? 'step' : undefined}
              className="relative grid min-w-0 gap-1 data-[state=pending]:opacity-70"
            >
              <span className={nodeClassName} aria-hidden="true">
                {state === 'complete' ? <CheckIcon className="size-3" /> : index + 1}
              </span>
              <span className="sr-only">{journeyStateLabel(state)}: </span>
              <Text type="supporting" weight="semibold" color="primary" display="block">
                {step.label}
              </Text>
              <Text type="supporting" color="secondary" className="text-pretty" display="block">
                {step.detail}
              </Text>
              <Text type="supporting" color="secondary" className="font-mono text-2xs tabular-nums" display="block">
                {step.record}
              </Text>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

function getJourneyCompletedIndex({
  phase,
  empty,
  hasHeadline,
  hasProviderEvidence,
  hasSummary,
  hasNextStep,
}: {
  phase: AeGenerativeAnswerPhase
  empty: boolean
  hasHeadline: boolean
  hasProviderEvidence: boolean
  hasSummary: boolean
  hasNextStep: boolean
}): number {
  if (phase === 'complete') {
    return 3
  }

  let completed = -1
  if (hasHeadline || hasProviderEvidence || hasSummary || hasNextStep || empty) {
    completed = 0
  }
  if (hasProviderEvidence || hasSummary || hasNextStep || empty) {
    completed = 1
  }
  if (hasSummary || hasNextStep || empty) {
    completed = 2
  }
  if (hasNextStep) {
    completed = 3
  }
  return completed
}

function getJourneyState({
  index,
  activeIndex,
  completedIndex,
  phase,
}: {
  index: number
  activeIndex: number
  completedIndex: number
  phase: AeGenerativeAnswerPhase
}): AnswerJourneyState {
  if (index <= completedIndex) {
    return 'complete'
  }
  if ((phase === 'error' || phase === 'stopped') && index === activeIndex) {
    return phase
  }
  if ((phase === 'streaming' || phase === 'reconnecting' || phase === 'idle') && index === activeIndex) {
    return 'active'
  }
  return 'pending'
}

function journeyStateLabel(state: AnswerJourneyState): string {
  switch (state) {
    case 'complete':
      return 'Complete'
    case 'active':
      return 'Current'
    case 'pending':
      return 'Pending'
    case 'error':
      return 'Needs attention'
    case 'stopped':
      return 'Stopped'
  }
}

function AnswerPartView({
  part,
  query,
  empty,
  phase,
  threadId,
}: {
  part: AnswerMessagePart
  query: string
  empty: boolean
  phase: AeGenerativeAnswerPhase
  threadId: string | undefined
}) {
  switch (part.kind) {
    case 'one-line':
      return null
    case 'selected-provider':
      return <SelectedProviderConfirmation provider={part.provider} threadId={threadId} />
    case 'provider-cards':
      return <ProviderCardsRail providers={part.providers} scroll={part.scroll === true} threadId={threadId} />
    case 'provider-compare-table':
      return (
        <ProviderCompareTable
          providers={part.providers}
          threadId={threadId}
          {...(part.fields === undefined ? {} : { fields: part.fields })}
        />
      )
    case 'recovery-prompts':
      return empty ? (
        <RecoveryPrompts prompts={part.prompts} {...(part.title === undefined ? {} : { title: part.title })} />
      ) : null
    case 'location-map':
      return <AeGenerativeMap label={part.label} placeQuery={part.placeQuery} />
    case 'empty-state':
      return empty ? (
        <div className={`${REVEAL_ENTER} rounded-md border border-border bg-surface p-4 text-sm text-primary`} role="status">
          <p>{part.text}</p>
        </div>
      ) : null
    case 'prose':
      return !empty && part.text.length > 0 ? (
        <p className={`${REVEAL_ENTER} max-w-[68ch] text-pretty text-base leading-relaxed text-primary`} aria-live="off">
          {part.text}
        </p>
      ) : null
    case 'what-to-do-now':
      return !empty && part.text.length > 0 ? (
        part.compact === true ? (
          <p className={`${REVEAL_ENTER} text-sm text-secondary`}>{part.text}</p>
        ) : (
          <p className={`${REVEAL_ENTER} grid gap-1 border-l-2 border-border-strong py-1 pl-3 text-base text-primary`}>
            <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-secondary">What to do now</span>
            <span>{part.text}</span>
          </p>
        )
      ) : null
    case 'agent-json':
      return <AeAgentJsonAffordance agentJsonUrl={part.url} query={query} />
    case 'protected-by-ae':
      return null
    default: {
      const _exhaustive: never = part
      void _exhaustive
      return null
    }
  }
}

function SelectedProviderConfirmation({ provider, threadId }: { provider: AnswerSource; threadId: string | undefined }) {
  const inquiryUrl = provider.inquiryUrl
  const hasInquiryForm = inquiryUrl !== undefined
  const detailHref = appendThreadOrigin(provider.detailUrl, threadId)
  const inquiryHref = inquiryUrl === undefined ? undefined : appendThreadOrigin(inquiryUrl, threadId)
  const selectionScope = threadId === undefined ? 'in this answer' : 'from this thread'

  return (
    <section
      className={`${REVEAL_ENTER} grid gap-3 rounded-md border border-border bg-surface p-4`}
      aria-label="Selected business"
    >
      <header className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
        <div className="grid min-w-0 gap-0.5">
          <AeKicker marker>Selected business</AeKicker>
          <p className="font-heading text-base leading-snug text-primary">{provider.name}</p>
          <p className="text-sm leading-snug text-secondary">
            Choice {provider.citationIndex} {selectionScope} · {provider.category} ·{' '}
            {provider.serviceArea || provider.suburb}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-secondary">
          <CheckIcon className="size-3" aria-hidden="true" />
          {hasInquiryForm ? 'Inquiry form published' : 'Review listing first'}
        </span>
      </header>
      <p className="text-sm leading-relaxed text-primary">
        {hasInquiryForm
          ? [
              'AE can open this business\'s qualified inquiry form for owner review.',
              'The business still confirms timing, quote, and availability.',
            ].join(' ')
          : [
              'This business does not publish an AE inquiry form yet.',
              'Review the listing and use its published contact guidance.',
            ].join(' ')}
      </p>
      <div className="flex flex-wrap gap-2">
        {inquiryHref !== undefined ? (
          <Button label="Open inquiry form" variant="primary" size="sm" href={inquiryHref} />
        ) : null}
        <Button
          label="Review listing"
          variant={hasInquiryForm ? 'secondary' : 'primary'}
          size="sm"
          href={detailHref}
        />
      </div>
    </section>
  )
}

function ProviderCardsRail({
  providers,
  scroll,
  threadId,
}: {
  providers: readonly AnswerSource[]
  scroll: boolean
  threadId: string | undefined
}) {
  if (providers.length === 0) {
    return null
  }

  return (
    <section className={`${REVEAL_ENTER} grid gap-3`} aria-label="Business shortlist">
      <header className="grid gap-1 rounded-md border border-border bg-surface px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="grid min-w-0 gap-0.5">
          <AeKicker marker>Business shortlist</AeKicker>
          <p className="text-sm font-medium text-primary">These are the listed businesses AE found for this request.</p>
          <p className="text-xs leading-snug text-secondary">
            Compare area, response, and next step before opening a listing or inquiry form.
          </p>
        </div>
        <span className="w-fit rounded-md border border-border bg-card px-2 py-1 font-mono text-2xs text-secondary">
          {listingCountLabel(providers.length)}
        </span>
      </header>
      <ul
        className={
          scroll
            ? 'flex snap-x snap-proximity gap-3 overflow-x-auto pb-1 [&>li]:w-[min(18rem,85vw)] [&>li]:shrink-0 [&>li]:snap-start'
            : 'grid gap-3 sm:grid-cols-2'
        }
        aria-label="Listed businesses found for this answer"
      >
        {providers.map((source) => (
          <li key={source.slug}>
            <AeProviderCard variant="answer" source={source} {...(threadId === undefined ? {} : { threadId })} />
          </li>
        ))}
      </ul>
      <p className="font-mono text-2xs text-secondary">
        A person at the business still confirms timing, quote, and availability.
      </p>
    </section>
  )
}

function appendThreadOrigin(href: string, threadId: string | undefined): string {
  if (threadId === undefined || threadId.length === 0) {
    return href
  }

  const separator = href.includes('?') ? '&' : '?'
  return `${href}${separator}from=thread&id=${encodeURIComponent(threadId)}`
}

const DEFAULT_COMPARE_FIELDS: readonly AnswerCompareField[] = ['area', 'response', 'availability', 'hours', 'trust', 'freshness', 'nextStep']

function ProviderCompareTable({
  providers,
  threadId,
  fields = DEFAULT_COMPARE_FIELDS,
}: {
  providers: readonly AnswerSource[]
  threadId: string | undefined
  fields?: readonly AnswerCompareField[]
}) {
  if (providers.length === 0) {
    return null
  }

  return (
    <section
      className={`${REVEAL_ENTER} grid gap-0 overflow-hidden rounded-lg border border-border bg-surface`}
      aria-label="Business comparison"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="grid gap-1">
          <AeKicker marker>Compare</AeKicker>
          <p className="font-heading text-base text-primary">Published facts, side by side</p>
        </div>
        <p className="shrink-0 font-mono text-2xs text-secondary">{listingCountLabel(providers.length)}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">Comparison based on published business details.</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-[13.5rem] border-b border-border bg-surface px-4 py-3 text-left font-mono text-2xs font-medium uppercase tracking-wider text-secondary"
              >
                Business
              </th>
              {fields.map((field) => (
                <th
                  key={field}
                  scope="col"
                  className="border-b border-border px-4 py-3 text-left font-mono text-2xs font-medium uppercase tracking-wider text-secondary"
                >
                  {compareFieldLabel(field)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <ProviderCompareRow key={provider.slug} provider={provider} fields={fields} threadId={threadId} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ProviderCompareRow({
  provider,
  fields,
  threadId,
}: {
  provider: AnswerSource
  fields: readonly AnswerCompareField[]
  threadId: string | undefined
}) {
  const detailHref = appendThreadOrigin(provider.detailUrl, threadId)

  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 border-t border-border bg-surface px-4 py-3 text-left align-top">
        <span className="grid gap-0.5">
          <a href={detailHref} className="font-medium text-primary underline-offset-4 hover:underline">
            {provider.name}
          </a>
          <span className="font-mono text-2xs text-secondary">{provider.category}</span>
        </span>
      </th>
      {fields.map((field) => (
        <td
          key={`${provider.slug}-${field}`}
          className={`border-t border-border px-4 py-3 align-top tabular-nums text-secondary ${field === 'freshness' ? 'font-mono text-2xs tracking-wide' : ''}`}
        >
          {compareFieldValue(provider, field)}
        </td>
      ))}
    </tr>
  )
}




function RecoveryPrompts({
  title,
  prompts,
}: {
  title?: string
  prompts: readonly { label: string; query: string }[]
}) {
  if (prompts.length === 0) {
    return null
  }

  return (
    <section
      className={`${REVEAL_ENTER} grid gap-3 rounded-lg border border-border bg-surface p-4`}
      aria-label={title ?? 'Try another search'}
    >
      <header className="flex items-center gap-2">
        <span
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-secondary"
          aria-hidden="true"
        >
          <SearchIcon className="size-4" />
        </span>
        <div className="grid gap-0.5">
          <AeKicker marker>Refine search</AeKicker>
          <p className="font-heading text-base text-primary">{title ?? 'Try a narrower query'}</p>
        </div>
      </header>
      <ul className="flex flex-wrap gap-2">
        {prompts.map((prompt) => (
          <li key={`${prompt.label}-${prompt.query}`}>
            <Link
              className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-4 text-sm text-primary transition-colors hover:bg-muted active:scale-[0.96]"
              to="/"
              search={{ q: prompt.query }}
            >
              {prompt.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}










function compareFieldLabel(field: AnswerCompareField): string {
  switch (field) {
    case 'area':
      return 'Area'
    case 'response':
      return 'Response'
    case 'availability':
      return 'Availability'
    case 'hours':
      return 'Hours'
    case 'trust':
      return 'Published detail'
    case 'freshness':
      return 'Updated'
    case 'nextStep':
      return 'Next step'
  }
}

function compareFieldValue(provider: AnswerSource, field: AnswerCompareField): string {
  switch (field) {
    case 'area':
      return provider.serviceArea
    case 'response':
      return provider.responseTimeLabel
    case 'availability':
      return provider.availabilityLabel
    case 'hours':
      return provider.hoursLabel
    case 'trust':
      return provider.trustCue
    case 'freshness':
      return provider.freshnessLabel ?? ''
    case 'nextStep':
      return provider.nextStepLabel
  }
}

function listingCountLabel(count: number): string {
  if (count === 1) {
    return '1 listing'
  }
  if (count <= 0) {
    return 'published listings'
  }
  return `${count} listings`
}

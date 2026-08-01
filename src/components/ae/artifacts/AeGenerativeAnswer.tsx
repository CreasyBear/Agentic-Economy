import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckIcon, SearchIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import {
  artifactsToMessageParts,
  inferLayoutProfileFromArtifacts,
  type AnswerLayoutProfile,
  type AnswerMessagePart,
} from '@/modules/answer/public'
import type { AnswerArtifact, AnswerCompareField, AnswerSource } from '@/modules/answer/public'
import { AeProviderCard } from '@/components/ae/primitives/AeProviderCard'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeStreamingLabel } from '@/components/ae/chat/AeStreamingLabel'
import { AeGenerativeMap } from './AeGenerativeMap'
import { AeConsumerPlanResult } from '@/components/ae/plan/AeConsumerPlan'
import { AeImportedClaims } from '@/components/ae/services/AeImportedClaims'
import { appendThreadOrigin } from '@/lib/ui/append-thread-origin'
import { cn } from '@/lib/utils'

// Calm fade-only reveal. Slide-from-bottom on every streamed part stacks into
// jitter when several artifacts arrive in quick succession, so parts just fade.
const REVEAL_ENTER = 'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-base motion-safe:ease-standard'

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
  // One headline size token drives both the streaming placeholder and the final
  // one-line so the lead answer text does not resize as it settles. The first
  // substantive answer leads with the heading scale; follow-ups read at body.
  const headlineSize = isFirstTurnProfile
    ? 'font-heading text-2xl leading-snug text-balance'
    : 'text-base font-medium leading-snug'
  const hasProviderEvidence = parts.some(isProviderEvidencePart)
  const summaryPart = parts.find(
    (part): part is Extract<AnswerMessagePart, { kind: 'prose' }> =>
      part.kind === 'prose' && part.text.trim().length > 0,
  )
  const hasSummary = summaryPart !== undefined
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
            className={cn(
              'min-w-0 flex-1 text-foreground',
              headlineSize,
              isFirstTurnProfile && REVEAL_ENTER,
            )}
            aria-live={busy ? 'polite' : 'off'}
          >
            {headline}
          </p>
        ) : (
          <p
            className={cn('min-w-0 flex-1 text-muted-foreground', headlineSize)}
            {...(busy ? { 'aria-live': 'polite' as const } : {})}
            aria-label="Finding the right business"
          >
            {busy ? <AeStreamingLabel as="span">Finding the right business</AeStreamingLabel> : 'Finding the right business'}
          </p>
        )}

        {phase === 'reconnecting' ? (
          <span className="shrink-0 text-xs text-muted-foreground" role="status">
            <AeStreamingLabel as="span">Reconnecting…</AeStreamingLabel>
          </span>
        ) : null}

        {busy && onStop !== undefined ? (
          <Button type="button" variant="secondary" size="sm" onClick={onStop}>Stop</Button>
        ) : null}
      </div>

      {phase === 'error' && errorMessage !== null ? (
        <div className="rounded-md border border-red-ring bg-red-subtle p-4 text-sm text-red-vivid" role="alert">
          <div>{errorMessage}</div>
        </div>
      ) : null}

      {summaryPart === undefined ? null : (
        <AnswerPartView
          part={summaryPart}
          query={query}
          empty={empty}
          phase={phase}
          threadId={threadId}
          hasAnswerFirstSummary={hasSummary}
        />
      )}

      {parts.filter((part) => part.kind !== 'prose').map((part) => (
        <AnswerPartView
          key={part.kind}
          part={part}
          query={query}
          empty={empty}
          phase={phase}
          threadId={threadId}
          hasAnswerFirstSummary={hasSummary}
        />
      ))}

      {/* The construction record supports inspection without competing with the answer.
          It stays complete and reachable, but ordinary users do not need to read it first. */}
      {hasProviderEvidence ? (
        <details className="group rounded-md border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer items-center px-4 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            How AE checked this
          </summary>
          <div className="border-t border-border p-4">
            <AeAnswerJourney
              phase={phase}
              profile={profile}
              progress={{
                headline: headline.length > 0,
                providerEvidence: hasProviderEvidence,
                summary: hasSummary,
                nextStep: hasNextStep,
              }}
            />
          </div>
        </details>
      ) : null}

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

type AnswerJourneyProgress = {
  headline: boolean
  providerEvidence: boolean
  summary: boolean
  nextStep: boolean
}

function AeAnswerJourney({
  phase,
  profile,
  progress,
}: {
  phase: AeGenerativeAnswerPhase
  profile: AnswerLayoutProfile
  progress: AnswerJourneyProgress
}) {
  const empty = profile === 'empty_state'
  const steps = [
    {
      label: 'Understand need',
      detail: 'AE reads the request, place, and service intent.',
      record: 'need read',
    },
    {
      label: 'Find the fit',
      detail: 'AE checks what businesses publish for this ask.',
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
        ? 'List a business or sharpen the ask.'
        : 'Choose a business or send a qualified inquiry for owner review.',
      record: 'handoff ready',
    },
  ] as const

  const completedIndex = getJourneyCompletedIndex({ phase, empty, progress })
  const activeIndex =
    phase === 'streaming'
      ? Math.min(completedIndex + 1, steps.length - 1)
      : Math.max(0, Math.min(completedIndex, steps.length - 1))
  const guidance =
    phase === 'streaming'
      ? 'AE is putting the answer record together as the answer arrives.'
      : empty
        ? 'No listed match yet. List a business or sharpen the ask.'
        : 'AE reads, checks, compares, and routes. The business still confirms timing, quote, and availability.'

  // The handoff record is settled evidence, not live chrome. During streaming
  // the research trace + streaming answer already show progress, so this stays
  // out until the turn settles and then fades in as one card.
  // no strip-to-card swap, no mid-stream layout jump.
  if (phase === 'idle' || phase === 'streaming' || phase === 'reconnecting') {
    return null
  }

  return (
    <Card
      className={`${REVEAL_ENTER} grid gap-5 border border-border bg-card p-4`}
      aria-label="How this answer was put together"
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
            <Badge variant="outline" className="w-fit">How this was put together</Badge>
            <p className="text-lg font-semibold text-foreground">
              The handoff is a record.
            </p>
            <p className="max-w-[58ch] text-pretty text-muted-foreground">
              {guidance}
            </p>
          </div>
        </div>
        <p className="font-mono tabular-nums text-sm text-muted-foreground">
          {phase === 'complete' ? 'record ready' : 'handoff record'}
        </p>
      </div>

      <ol
        className="grid gap-4 border-l border-border pl-5 sm:grid-cols-4 sm:gap-5 sm:border-l-0 sm:border-t sm:pl-0 sm:pt-5"
        aria-live="off"
        aria-label="How this answer was put together"
      >
        {steps.map((step, index) => {
          const state = getJourneyState({ index, activeIndex, completedIndex, phase })
          const nodeClassName = [
            'absolute -left-[1.85rem] top-0 inline-flex size-5 items-center justify-center rounded-full border font-mono text-2xs font-semibold tabular-nums sm:-top-[1.9rem] sm:left-0',
            state === 'complete' ? 'border-brand bg-brand text-on-brand' : '',
            state === 'active' ? 'border-brand bg-card text-brand' : '',
            state === 'pending' ? 'border-border bg-card text-muted-foreground' : '',
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
              <span className="block text-sm font-semibold text-foreground">{step.label}</span>
              <span className="block text-pretty text-sm text-muted-foreground">{step.detail}</span>
              <span className="block font-mono text-2xs tabular-nums text-muted-foreground">{step.record}</span>
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
  progress,
}: {
  phase: AeGenerativeAnswerPhase
  empty: boolean
  progress: AnswerJourneyProgress
}): number {
  if (phase === 'complete') {
    return 3
  }

  const { headline, providerEvidence, summary, nextStep } = progress
  let completed = -1
  if (headline || providerEvidence || summary || nextStep || empty) {
    completed = 0
  }
  if (providerEvidence || summary || nextStep || empty) {
    completed = 1
  }
  if (summary || nextStep || empty) {
    completed = 2
  }
  if (nextStep) {
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
  hasAnswerFirstSummary,
}: {
  part: AnswerMessagePart
  query: string
  empty: boolean
  phase: AeGenerativeAnswerPhase
  threadId: string | undefined
  hasAnswerFirstSummary: boolean
}) {
  switch (part.kind) {
    case 'consumer-plan':
      return <AeConsumerPlanResult result={part.plan} />
    case 'one-line':
      return null
    case 'selected-provider':
      return <SelectedProviderConfirmation provider={part.provider} threadId={threadId} />
    case 'provider-cards':
      return <ProviderCardsRail providers={part.providers} scroll={part.scroll === true} threadId={threadId} />
    case 'imported-claims':
      return <AeImportedClaims claims={part.claims} query={query} />
    case 'provider-compare-table':
      return hasAnswerFirstSummary ? (
        <details className={`${REVEAL_ENTER} group rounded-lg border border-border bg-card`}>
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            <span>See full comparison</span>
            <span className="font-mono text-2xs text-muted-foreground">{listingCountLabel(part.providers.length)}</span>
          </summary>
          <div className="border-t border-border">
            <ProviderCompareTable
              providers={part.providers}
              threadId={threadId}
              {...(part.fields === undefined ? {} : { fields: part.fields })}
            />
          </div>
        </details>
      ) : (
        <ProviderCompareTable
          providers={part.providers}
          threadId={threadId}
          {...(part.fields === undefined ? {} : { fields: part.fields })}
        />
      )
    case 'recovery-prompts':
      return empty ? (
        <RecoveryPrompts prompts={part.prompts} {...(part.links === undefined ? {} : { links: part.links })} {...(part.title === undefined ? {} : { title: part.title })} />
      ) : null
    case 'location-map':
      return <AeGenerativeMap label={part.label} placeQuery={part.placeQuery} />
    case 'empty-state':
      return empty ? (
        <div className={`${REVEAL_ENTER} rounded-md border border-border bg-card p-4 text-sm text-foreground`} role="status">
          <p>{part.text}</p>
        </div>
      ) : null
    case 'prose':
      return !empty && part.text.length > 0 ? (
        <p className={`${REVEAL_ENTER} max-w-[68ch] text-pretty text-base leading-relaxed text-foreground`} aria-live="off">
          {part.text}
        </p>
      ) : null
    case 'what-to-do-now':
      return !empty && part.text.length > 0 ? (
        part.compact === true ? (
          <p className={`${REVEAL_ENTER} text-sm text-muted-foreground`}>{part.text}</p>
        ) : (
          <p className={`${REVEAL_ENTER} grid gap-1 border-l-2 border-border-strong py-1 pl-3 text-base text-foreground`}>
            <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">What to do now</span>
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
      className={`${REVEAL_ENTER} grid gap-3 rounded-md border border-border bg-card p-4`}
      aria-label="Selected business"
    >
      <header className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-3">
        <div className="grid min-w-0 gap-0.5">
          <p className="block text-sm font-medium text-muted-foreground">Selected business</p>
          <p className="font-heading text-base leading-snug text-foreground">{provider.name}</p>
          <p className="text-sm leading-snug text-muted-foreground">
            Choice {provider.citationIndex} {selectionScope} · {provider.category} ·{' '}
            {provider.serviceArea || provider.suburb}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground">
          <CheckIcon className="size-3" aria-hidden="true" />
          {hasInquiryForm ? 'Inquiry form published' : 'Review business first'}
        </span>
      </header>
      <p className="text-sm leading-relaxed text-foreground">
        {hasInquiryForm
          ? [
              'AE can open this business\'s qualified inquiry form for owner review.',
              'The business still confirms timing, quote, and availability.',
            ].join(' ')
          : [
              'This business does not publish an AE inquiry form yet.',
              'Review the business page and use its published contact guidance.',
            ].join(' ')}
      </p>
      <div className="flex flex-wrap gap-2">
        {inquiryHref !== undefined ? (
          <Button asChild variant="default" size="sm">
            <a href={inquiryHref}>Open inquiry form</a>
          </Button>
        ) : null}
        <Button asChild variant={hasInquiryForm ? 'secondary' : 'default'} size="sm">
          <a href={detailHref}>Review business</a>
        </Button>
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
  return (
    <section className={`${REVEAL_ENTER} grid gap-3`} aria-label="Business shortlist">
      <header className="grid gap-1 rounded-md border border-border bg-card px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="grid min-w-0 gap-0.5">
          <p className="block text-sm font-medium text-muted-foreground">Business shortlist</p>
          <p className="text-sm font-medium text-foreground">These are the businesses AE found for this request.</p>
          <p className="text-xs leading-snug text-muted-foreground">
            Compare area, response, and next step before choosing a business or opening an inquiry form.
          </p>
        </div>
        <span className="w-fit rounded-md border border-border bg-card px-2 py-1 font-mono text-2xs text-muted-foreground">
          {listingCountLabel(providers.length)}
        </span>
      </header>
      <ul
        className={
          scroll
            ? 'flex snap-x snap-proximity gap-3 overflow-x-auto pb-1 [&>li]:w-[min(18rem,85vw)] [&>li]:shrink-0 [&>li]:snap-start'
            : 'grid gap-3 sm:grid-cols-2'
        }
        aria-label="Businesses found for this answer"
      >
        {providers.map((source) => (
          <li key={source.slug}>
            <AeProviderCard variant="answer" source={source} {...(threadId === undefined ? {} : { threadId })} />
          </li>
        ))}
      </ul>
      <p className="font-mono text-2xs text-muted-foreground">
        A person at the business still confirms timing, quote, and availability.
      </p>
    </section>
  )
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
      className={`${REVEAL_ENTER} grid gap-0 overflow-hidden rounded-lg border border-border bg-card`}
      aria-label="Business comparison"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="grid gap-1">
          <p className="block text-sm font-medium text-muted-foreground">Compare</p>
          <p className="font-heading text-base text-foreground">Published facts, side by side</p>
        </div>
        <p className="shrink-0 font-mono text-2xs text-muted-foreground">{listingCountLabel(providers.length)}</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[44rem] border-collapse text-sm">
          <caption className="sr-only">Comparison based on published business details.</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 w-[13.5rem] border-b border-border bg-card px-4 py-3 text-left font-mono text-2xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Business
              </th>
              {fields.map((field) => (
                <th
                  key={field}
                  scope="col"
                  className="border-b border-border px-4 py-3 text-left font-mono text-2xs font-medium uppercase tracking-wider text-muted-foreground"
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
  const detailSearch = threadId === undefined ? {} : { from: 'thread' as const, id: threadId }

  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 border-t border-border bg-card px-4 py-3 text-left align-top">
        <span className="grid gap-0.5">
          <Link to="/$slug" params={{ slug: provider.slug }} search={detailSearch} className="font-medium text-foreground underline-offset-4 hover:underline">
            {provider.name}
          </Link>
          <span className="font-mono text-2xs text-muted-foreground">{provider.category}</span>
        </span>
      </th>
      {fields.map((field) => (
        <td
          key={`${provider.slug}-${field}`}
          className={`border-t border-border px-4 py-3 align-top tabular-nums text-muted-foreground ${field === 'freshness' ? 'font-mono text-2xs tracking-wide' : ''}`}
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
  links = [],
}: {
  title?: string
  prompts: readonly { label: string; query: string }[]
  links?: readonly { label: string; href: '/claim' | '/registry' }[]
}) {
  if (prompts.length === 0 && links.length === 0) {
    return null
  }

  return (
    <section
      className={`${REVEAL_ENTER} grid gap-3 rounded-lg border border-border bg-card p-4`}
      aria-label={title ?? 'Try another search'}
    >
      <header className="flex items-center gap-2">
        <span
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
          aria-hidden="true"
        >
          <SearchIcon className="size-4" />
        </span>
        <div className="grid gap-0.5">
          <p className="block text-sm font-medium text-muted-foreground">Refine search</p>
          <p className="font-heading text-base text-foreground">{title ?? 'Try a narrower query'}</p>
        </div>
      </header>
      {prompts.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {prompts.map((prompt) => (
            <li key={`${prompt.label}-${prompt.query}`}>
              <Link
                className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-4 text-sm text-foreground transition-colors motion-safe:duration-fast motion-safe:ease-standard hover:bg-muted motion-safe:active:scale-press"
                to="/"
                search={{ q: prompt.query }}
              >
                {prompt.label}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {links.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground" aria-label="More ways to continue">
          {links.map((link) => (
            <li key={link.href}>
              {link.href === '/claim' ? (
                <Link className="underline-offset-4 hover:text-foreground hover:underline" to="/claim">
                  {link.label}
                </Link>
              ) : (
                <Link className="underline-offset-4 hover:text-foreground hover:underline" to="/registry" search={{ q: '', limit: 10 }}>
                  {link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      ) : null}
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
    return '1 business'
  }
  if (count <= 0) {
    return 'businesses'
  }
  return `${count} businesses`
}

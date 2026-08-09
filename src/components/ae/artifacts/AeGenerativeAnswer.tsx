import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckIcon, SearchIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

import {
  artifactsToMessageParts,
  inferLayoutProfileFromArtifacts,
  neutralizeBidiFormattingControls,
  type AnswerLayoutProfile,
  type AnswerMessagePart,
} from '@/modules/answer/public'
import type { AnswerArtifact, AnswerCompareField, AnswerSource, AnswerWorkStep } from '@/modules/answer/public'
import type { PublicAnswerCheckSummary, ThinkingStep } from '@/modules/answer-thread/public'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeStreamingLabel } from '@/components/ae/chat/AeStreamingLabel'
import { AeWorkDisclosure } from '@/components/ae/chat/AeWorkDisclosure'
import { AeGenerativeMap } from './AeGenerativeMap'
import { AeImportedClaims } from '@/components/ae/services/AeImportedClaims'
import { cn } from '@/lib/utils'

const EmptyWorkSteps: readonly AnswerWorkStep[] = []
const EmptyThinkingSteps: readonly string[] = []

// Calm fade-only reveal. Slide-from-bottom on every streamed part stacks into
// jitter when several artifacts arrive in quick succession, so parts just fade.
const PLAIN_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/iu

function projectPlainActionCopy(text: string): string {
  const normalized = neutralizeBidiFormattingControls(text)
  const url = normalized.match(PLAIN_URL_PATTERN)?.[0]?.replace(/[),.;!?]+$/u, '')
  if (url !== undefined && /\b(?:click|tap)\b/iu.test(normalized)) {
    return `Copy this URL: ${url}`
  }
  return normalized.replace(/\b(?:click|tap)\b/giu, 'Use')
}
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
  /** Real engine work steps rendered as a compact "Worked" disclosure above the answer prose. */
  workSteps?: readonly AnswerWorkStep[]
  /** Accumulated thinking labels folded into the disclosure's "Thought" cell. */
  thinkingSteps?: readonly string[]
  thinkingLabel?: string
  thinkingStep?: ThinkingStep
  /** Settled-turn check summary for replay surfaces (header line + fact grid). */
  checkSummary?: PublicAnswerCheckSummary
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
  workSteps,
  thinkingSteps,
  thinkingLabel,
  thinkingStep,
  checkSummary,
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
      ? neutralizeBidiFormattingControls(oneLinePart.text)
      : oneLineFallback.length > 0
        ? neutralizeBidiFormattingControls(oneLineFallback)
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
  const hasNextStep = parts.some(
    (part) => part.kind === 'what-to-do-now' && part.text.trim().length > 0,
  )
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
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
            className={cn(
              'min-w-0 flex-1 text-foreground',
              headlineSize,
              isFirstTurnProfile && REVEAL_ENTER,
            )}
          >
            {headline}
          </p>
        ) : (
          <p
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
            className={cn('min-w-0 flex-1 text-muted-foreground', headlineSize)}
            aria-label="Checking what's available"
          >
            {busy ? <AeStreamingLabel as="span">Checking what's available</AeStreamingLabel> : 'Checking what\'s available'}
          </p>
        )}

        {phase === 'reconnecting' ? (
          <span className="shrink-0 text-xs text-muted-foreground">
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
      {phase === 'stopped' && errorMessage !== null ? (
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
      ) : null}

      <AeWorkDisclosure
        isStreaming={busy}
        workSteps={workSteps ?? EmptyWorkSteps}
        thinkingSteps={thinkingSteps ?? EmptyThinkingSteps}
        thinkingLabel={thinkingLabel ?? ''}
        {...(thinkingStep === undefined ? {} : { thinkingStep })}
        {...(checkSummary === undefined ? {} : { checkSummary })}
        query={query}
      />

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

      {parts.flatMap((part) => (part.kind === 'prose' ? [] : [
        <AnswerPartView
          key={part.kind}
          part={part}
          query={query}
          empty={empty}
          phase={phase}
          threadId={threadId}
          hasAnswerFirstSummary={hasSummary}
        />
      ]))}

      {/* The construction record supports inspection without competing with the answer.
          It stays complete and reachable, but ordinary users do not need to read it first. */}
      {hasProviderEvidence ? (
        <details className="group rounded-md border border-border bg-card">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            How this was checked
            <span className="shrink-0 text-xs font-normal text-muted-foreground">Sources reviewed</span>
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
        <p className="sr-only">
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

/** Flowing Perplexity-style body: split the streamed summary into a quiet reading column. */
function ProseBody({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((paragraph) => neutralizeBidiFormattingControls(paragraph.trim()))
    .filter((paragraph) => paragraph.length > 0)

  return (
    <div className={cn(REVEAL_ENTER, 'grid gap-3')}>
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
          className="max-w-[68ch] text-pretty text-base leading-relaxed text-foreground"
          aria-live="off"
        >
          {paragraph}
        </p>
      ))}
    </div>
  )
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
      label: 'Understand your request',
      detail: 'Reading the request and what you want done.',
      record: 'request read',
    },
    {
      label: "Find what's available",
      detail: 'Checking the businesses that can help.',
      record: 'available details',
    },
    {
      label: 'Compare options',
      detail: 'Comparing area, response, and next-step details.',
      record: 'options compared',
    },
    {
      label: 'Choose what happens next',
      detail: empty
        ? 'Ask a business or sharpen the request.'
        : 'Choose a business or send a request for the business to review.',
      record: 'next step ready',
    },
  ] as const

  const completedIndex = getJourneyCompletedIndex({ phase, empty, progress })
  const activeIndex =
    phase === 'streaming'
      ? Math.min(completedIndex + 1, steps.length - 1)
      : Math.max(0, Math.min(completedIndex, steps.length - 1))
  const guidance =
    phase === 'streaming'
      ? 'Putting the answer together as information arrives.'
      : empty
        ? 'No clear match yet. Try a more specific request.'
        : 'Options are compared using published details. The business still confirms timing, price, and availability before anything is sent.'

  // The handoff record is settled evidence, not live chrome. During streaming
  // the research trace + streaming answer already show progress, so this stays
  // out until the turn settles and then fades in as one card.
  // no strip-to-card swap, no mid-stream layout jump.
  if (phase === 'idle' || phase === 'streaming' || phase === 'reconnecting') {
    return null
  }

  return (
    <Card
      className={cn(REVEAL_ENTER, 'grid gap-5 border border-border bg-card p-4')}
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
              What was checked, and what happens next.
            </p>
            <p className="max-w-[58ch] text-pretty text-muted-foreground">
              {guidance}
            </p>
          </div>
        </div>
        <p className="font-mono tabular-nums text-sm text-muted-foreground">
          {phase === 'complete' ? 'ready' : 'next step'}
        </p>
      </div>

      <ol
        className="grid gap-4 border-l border-border pl-5 sm:grid-cols-4 sm:gap-5 sm:border-l-0 sm:border-t sm:pl-0 sm:pt-5"
        aria-live="off"
        aria-label="How this answer was put together"
      >
        {steps.map((step, index) => {
          const state = getJourneyState({ index, activeIndex, completedIndex, phase })
          const nodeClassName = cn(
            'absolute -left-[1.85rem] top-0 inline-flex size-5 items-center justify-center rounded-full border font-mono text-2xs font-semibold tabular-nums sm:-top-[1.9rem] sm:left-0',
            state === 'complete' && 'border-brand bg-brand text-on-brand',
            state === 'active' && 'border-brand bg-card text-brand',
            state === 'pending' && 'border-border bg-card text-muted-foreground',
            (state === 'error' || state === 'stopped') && 'border-red-ring bg-red-subtle text-red-vivid',
          )

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
    case 'one-line':
      return null
    case 'selected-provider':
      return <SelectedSource provider={part.provider} threadId={threadId} />
    case 'provider-cards':
      return <SourcesList providers={part.providers} threadId={threadId} />
    case 'imported-claims':
      return <AeImportedClaims claims={part.claims} query={query} />
    case 'provider-compare-table':
      return hasAnswerFirstSummary ? (
        <details className={cn(REVEAL_ENTER, 'group rounded-lg border border-border bg-card')}>
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
        <div className={cn(REVEAL_ENTER, 'rounded-md border border-border bg-card p-4 text-sm text-foreground')}>
          <p dir="auto" style={{ unicodeBidi: 'isolate' }}>{neutralizeBidiFormattingControls(part.text)}</p>
        </div>
      ) : null
    case 'prose':
      return !empty && part.text.length > 0 ? <ProseBody text={part.text} /> : null
    case 'what-to-do-now': {
      const actionText = projectPlainActionCopy(part.text)
      return !empty && actionText.length > 0 ? (
        part.compact === true ? (
          <p dir="auto" style={{ unicodeBidi: 'isolate' }} className={cn(REVEAL_ENTER, 'text-sm text-muted-foreground')}>{actionText}</p>
        ) : (
          <p className={cn(REVEAL_ENTER, 'grid gap-1 border-l-2 border-border-strong py-1 pl-3 text-base text-foreground')}>
            <span className="font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">What to do now</span>
            <span dir="auto" style={{ unicodeBidi: 'isolate' }}>{actionText}</span>
          </p>
        )
      ) : null
    }
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

function SelectedSource({ provider, threadId }: { provider: AnswerSource; threadId: string | undefined }) {
  const inquiryUrl = provider.inquiryUrl
  const hasInquiryForm = inquiryUrl !== undefined
  // Protocol-relative `//host` is external; only a rooted path is router-owned.
  const detailIsInternal = provider.detailUrl.startsWith('/') && !provider.detailUrl.startsWith('//')
  const inquiryIsInternal = inquiryUrl !== undefined && inquiryUrl.startsWith('/') && !inquiryUrl.startsWith('//')
  const threadSearch = threadId === undefined || threadId.length === 0 ? {} : { from: 'thread' as const, id: threadId }
  const selectionScope = threadId === undefined ? 'in this answer' : 'from this thread'
  const basis = [provider.category.trim(), (provider.serviceArea || provider.suburb).trim()]
    .map(neutralizeBidiFormattingControls)
    .filter((part) => part.length > 0)
    .join(' · ')
  const providerName = neutralizeBidiFormattingControls(provider.name)
  const initial = providerName.trim().charAt(0).toUpperCase() || '?'

  return (
    <section
      className={cn(REVEAL_ENTER, 'grid gap-3 rounded-lg border border-border bg-card p-4')}
      aria-label="Selected business"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-mono text-base font-semibold text-muted-foreground"
        >
          {initial}
        </span>
        <div className="grid min-w-0 flex-1 gap-0.5">
          <p className="font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Recommended</p>
          <p className="truncate font-heading text-base font-medium leading-snug text-foreground">
            {detailIsInternal ? (
              <Link
                to="/$slug"
                params={{ slug: provider.slug }}
                search={threadSearch}
                className="underline-offset-4 hover:underline"
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
              >
                {providerName}
              </Link>
            ) : (
              <a
                href={provider.detailUrl}
                className="underline-offset-4 hover:underline"
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
              >
                {providerName}
              </a>
            )}
          </p>
          <p dir="auto" style={{ unicodeBidi: 'isolate' }} className="truncate text-sm text-muted-foreground">
            Choice {provider.citationIndex} {selectionScope} {basis.length > 0 ? `· ${basis}` : ''}
          </p>
        </div>
        <span
          className="inline-flex w-fit shrink-0 items-center gap-1 rounded-full border border-border bg-card px-2 py-1 text-xs text-muted-foreground"
          data-tone={hasInquiryForm ? 'inquiry' : 'review'}
        >
          <CheckIcon className="size-3" aria-hidden="true" />
          {hasInquiryForm ? 'Request form available' : 'Review this business first'}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {hasInquiryForm
          ? [
              'A request can be sent to this business for the business to review.',
              'The business still confirms timing, quote, and availability.',
            ].join(' ')
          : [
              'This business does not have a request form yet.',
              'Review the business page and use the contact details it provides.',
            ].join(' ')}
      </p>
      <div className="flex flex-wrap gap-2">
        {inquiryUrl === undefined ? null : (
          <Button asChild variant="default" size="sm">
            {inquiryIsInternal ? (
              <Link to="/$slug/inquiry" params={{ slug: provider.slug }} search={threadSearch}>Open request form</Link>
            ) : (
              <a href={inquiryUrl}>Open request form</a>
            )}
          </Button>
        )}
        <Button asChild variant={hasInquiryForm ? 'secondary' : 'default'} size="sm">
          {detailIsInternal ? (
            <Link to="/$slug" params={{ slug: provider.slug }} search={threadSearch}>Review business</Link>
          ) : (
            <a href={provider.detailUrl}>Review business</a>
          )}
        </Button>
      </div>
    </section>
  )
}

function SourcesList({
  providers,
  threadId,
}: {
  providers: readonly AnswerSource[]
  threadId: string | undefined
}) {
  if (providers.length === 0) {
    return null
  }
  return (
    <section className={cn(REVEAL_ENTER, 'grid gap-3')} aria-label="Sources">
      <header className="grid gap-0.5">
        <p className="font-mono text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
        <p className="text-sm text-muted-foreground">
          {listingCountLabel(providers.length)} compared on published area, response, and next step.
        </p>
      </header>
      <ul className="grid gap-2 sm:grid-cols-2" aria-label="Sources for this answer">
        {providers.map((source) => (
          <SourceCard key={source.slug} source={source} threadId={threadId} />
        ))}
      </ul>
    </section>
  )
}

function SourceCard({
  source,
  threadId,
}: {
  source: AnswerSource
  threadId: string | undefined
}) {
  const detailIsInternal = source.detailUrl.startsWith('/') && !source.detailUrl.startsWith('//')
  const search = threadId === undefined || threadId.length === 0 ? {} : { from: 'thread' as const, id: threadId }
  const basis = [source.category.trim(), (source.serviceArea || source.suburb).trim()]
    .map(neutralizeBidiFormattingControls)
    .filter((part) => part.length > 0)
    .join(' · ')
  const sourceName = neutralizeBidiFormattingControls(source.name)
  const initial = sourceName.trim().charAt(0).toUpperCase() || '?'
  const gridCls = 'grid items-center gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]'
  const content = (
    <>
      <span
        aria-hidden="true"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted font-mono text-sm font-semibold text-muted-foreground"
      >
        {initial}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="truncate text-sm font-medium text-foreground underline-offset-4">{sourceName}</span>
        <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="truncate text-xs text-muted-foreground">{basis}</span>
      </span>
      <span className="hidden shrink-0 items-center justify-center rounded-full border border-border bg-card px-2 py-0.5 font-mono text-2xs tabular-nums text-muted-foreground sm:inline-flex">
        {source.citationIndex}
      </span>
    </>
  )

  return (
    <li className="rounded-lg border border-border bg-card transition-colors hover:bg-muted motion-safe:duration-fast motion-safe:ease-standard">
      {detailIsInternal ? (
        <Link to="/$slug" params={{ slug: source.slug }} search={search} className={gridCls}>
          {content}
        </Link>
      ) : (
        <a href={source.detailUrl} className={gridCls}>{content}</a>
      )}
    </li>
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
      className={cn(REVEAL_ENTER, 'grid gap-0 overflow-hidden rounded-lg border border-border bg-card')}
      aria-label="Business comparison"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="grid gap-1">
          <p className="block text-sm font-medium text-muted-foreground">Compare</p>
          <p className="font-heading text-base text-foreground">Published details, side by side</p>
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
  const providerName = neutralizeBidiFormattingControls(provider.name)
  const category = neutralizeBidiFormattingControls(provider.category)

  return (
    <tr>
      <th scope="row" className="sticky left-0 z-10 border-t border-border bg-card px-4 py-3 text-left align-top">
        <span className="grid gap-0.5">
          <Link
            to="/$slug"
            params={{ slug: provider.slug }}
            search={detailSearch}
            className="font-medium text-foreground underline-offset-4 hover:underline"
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
          >
            {providerName}
          </Link>
          <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="font-mono text-2xs text-muted-foreground">{category}</span>
        </span>
      </th>
      {fields.map((field) => (
        <td
          key={`${provider.slug}-${field}`}
          className={cn('border-t border-border px-4 py-3 align-top tabular-nums text-muted-foreground', field === 'freshness' && 'font-mono text-2xs tracking-wide')}
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
        >
          {neutralizeBidiFormattingControls(compareFieldValue(provider, field))}
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
  links?: readonly { label: string; href: '/claim' }[]
}) {
  if (prompts.length === 0 && links.length === 0) {
    return null
  }
  const titleText = title === undefined ? 'Try a different request' : neutralizeBidiFormattingControls(title)

  return (
    <section
      className={cn(REVEAL_ENTER, 'grid gap-3 rounded-lg border border-border bg-card p-4')}
      aria-label={titleText}
    >
      <header className="flex items-center gap-2">
        <span
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
          aria-hidden="true"
        >
          <SearchIcon className="size-4" />
        </span>
        <div className="grid gap-0.5">
          <p className="block text-sm font-medium text-muted-foreground">Try another way</p>
          <p dir="auto" style={{ unicodeBidi: 'isolate' }} className="font-heading text-base text-foreground">{titleText}</p>
        </div>
      </header>
      {prompts.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {prompts.map((prompt) => {
            const promptLabel = neutralizeBidiFormattingControls(prompt.label)
            return (
              <li key={`${prompt.label}-${prompt.query}`}>
                <Link
                  className="inline-flex min-h-9 items-center rounded-full border border-border bg-card px-4 text-sm text-foreground transition-colors motion-safe:duration-fast motion-safe:ease-standard hover:bg-muted motion-safe:active:scale-press"
                  to="/"
                  search={{ q: prompt.query }}
                  dir="auto"
                  style={{ unicodeBidi: 'isolate' }}
                >
                  {promptLabel}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : null}
      {links.length > 0 ? (
        <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground" aria-label="More ways to continue">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                className="underline-offset-4 hover:text-foreground hover:underline"
                to={link.href}
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
              >
                {neutralizeBidiFormattingControls(link.label)}
              </Link>
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
    return '1 match'
  }
  if (count <= 0) {
    return 'matches'
  }
  return `${count} matches`
}

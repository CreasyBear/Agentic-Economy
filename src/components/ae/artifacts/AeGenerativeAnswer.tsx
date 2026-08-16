import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { CheckIcon, SearchIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@/components/ui/item'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  answerOperationCandidateSetDigest,
  artifactsToMessageParts,
  inferLayoutProfileFromArtifacts,
  neutralizeBidiFormattingControls,
  type AnswerLayoutProfile,
  type AnswerMessagePart,
} from '@/modules/answer/public'
import type {
  AnswerArtifact,
  AnswerCompareField,
  AnswerOperationCandidate,
  AnswerOperationOutcome,
  AnswerOperationResultAnnotation,
  AnswerOperationResultView,
  AnswerSource,
  AnswerWorkStep,
} from '@/modules/answer/public'
import { formatCurrencyAmount } from '@/modules/money/public'
import type { PublicAnswerCheckSummary, ThinkingStep } from '@/modules/answer-thread/public'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeStreamingLabel } from '@/components/ae/chat/AeStreamingLabel'
import { AeWorkDisclosure } from '@/components/ae/chat/AeWorkDisclosure'
import { AeGenerativeMap } from './AeGenerativeMap'
import { AeImportedClaims } from '@/components/ae/services/AeImportedClaims'
import { cn } from '@/lib/utils'
import { isRecord } from '@/modules/common/is-record'

const EmptyWorkSteps: readonly AnswerWorkStep[] = []
const EmptyThinkingSteps: readonly string[] = []
const OPERATION_PARAMETER_PREVIEW_LIMIT = 6
const OPERATION_EVIDENCE_PREVIEW_LIMIT = 3
const OPERATION_JSON_MAX_BYTES = 256 * 1024
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
  onOperationSelect?: (operationRef: string, input: Record<string, unknown>, candidateSetDigest: string) => void
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
  onOperationSelect,
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
  const retryableOperationRef = retryableExecutionOperationRef(parts)
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
  const summaryPart = parts.find(
    (part): part is Extract<AnswerMessagePart, { kind: 'prose' }> =>
      part.kind === 'prose' && part.text.trim().length > 0,
  )
  const hasSummary = summaryPart !== undefined
  return (
    <section
      className="grid gap-4"
      data-phase={phase}
      data-profile={profile}
      data-empty={empty ? 'true' : 'false'}
      aria-busy={busy}
    >
      {phase === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>Unable to finish this response.</AlertTitle>
          {errorMessage === null ? null : (
            <AlertDescription>{errorMessage}</AlertDescription>
          )}
        </Alert>
      ) : (
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
      )}
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
        {...(phase === 'error' ? { defaultOpen: false } : {})}
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
          onOperationSelect={onOperationSelect}
          retryableOperationRef={retryableOperationRef}
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
          onOperationSelect={onOperationSelect}
          retryableOperationRef={retryableOperationRef}
        />
      ]))}

    </section>
  )
}

function retryableExecutionOperationRef(parts: readonly AnswerMessagePart[]): string | undefined {
  let operationRef: string | undefined
  for (const part of parts) {
    if (part.kind !== 'operation-outcome') continue
    operationRef = part.outcome.toolId === 'operation.execute'
      && part.outcome.result.kind === 'error'
      && part.outcome.result.retryable
      ? part.outcome.operationRef
      : undefined
  }
  return operationRef
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

function AnswerPartView({
  part,
  query,
  empty,
  phase,
  threadId,
  hasAnswerFirstSummary,
  onOperationSelect,
  retryableOperationRef,
}: {
  part: AnswerMessagePart
  query: string
  empty: boolean
  phase: AeGenerativeAnswerPhase
  threadId: string | undefined
  hasAnswerFirstSummary: boolean
  onOperationSelect: ((operationRef: string, input: Record<string, unknown>, candidateSetDigest: string) => void) | undefined
  retryableOperationRef: string | undefined
}) {
  switch (part.kind) {
    case 'one-line':
      return null
    case 'selected-provider':
      return <SelectedSource provider={part.provider} threadId={threadId} />
    case 'provider-cards':
      return <SourcesList providers={part.providers} threadId={threadId} />
    case 'operation-candidates':
      return (
        <OperationCandidateList
          candidates={part.candidates}
          candidateSetDigest={part.operationCandidatesDigest ?? answerOperationCandidateSetDigest(part.candidates)}
          selectedOperationRef={part.selection?.operationRef}
          onOperationSelect={onOperationSelect}
          retryableOperationRef={retryableOperationRef}
        />
      )
    case 'operation-comparison':
    case 'operation-plan':
      return null
    case 'operation-outcome':
      return <OperationOutcome outcome={part.outcome} view={part.resultView} />
    case 'imported-claims':
      return <AeImportedClaims claims={part.claims} query={query} />
    case 'provider-compare-table':
      return hasAnswerFirstSummary ? (
        <details className={cn(REVEAL_ENTER, 'group rounded-lg border border-border bg-card')}>
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            <span>See full comparison</span>
            <span className="font-mono text-xs text-muted-foreground">{listingCountLabel(part.providers.length)}</span>
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
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">What to do now</span>
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

function OperationCandidateList({
  candidates,
  candidateSetDigest,
  selectedOperationRef,
  onOperationSelect,
  retryableOperationRef,
}: {
  candidates: readonly AnswerOperationCandidate[]
  candidateSetDigest: string
  selectedOperationRef: string | undefined
  onOperationSelect: ((operationRef: string, input: Record<string, unknown>, candidateSetDigest: string) => void) | undefined
  retryableOperationRef: string | undefined
}) {
  if (candidates.length === 0) {
    return null
  }

  return (
    <section className={cn(REVEAL_ENTER, 'grid gap-3')} aria-label="Operation candidates">
      <header className="grid gap-0.5">
        <h2 className="font-heading text-base font-semibold text-foreground">
          Choose an operation
        </h2>
        <p className="text-sm text-muted-foreground">
          Compare the published requirements and select the exact operation to continue.
        </p>
      </header>
      <ul className="grid gap-3" aria-label="Matching operations">
        {candidates.map((candidate) => (
          <OperationCandidateCard
            key={candidate.operationRef}
            candidateSetDigest={candidateSetDigest}
            candidate={candidate}
            selected={candidate.operationRef === selectedOperationRef}
            onOperationSelect={onOperationSelect}
            retryable={candidate.operationRef === retryableOperationRef}
          />
        ))}
      </ul>
    </section>
  )
}

function OperationCandidateCard({
  candidate,
  candidateSetDigest,
  selected,
  onOperationSelect,
  retryable,
}: {
  candidate: AnswerOperationCandidate
  candidateSetDigest: string
  selected: boolean
  onOperationSelect: ((operationRef: string, input: Record<string, unknown>, candidateSetDigest: string) => void) | undefined
  retryable: boolean
}) {
  const inputId = useId()
  const errorId = `${inputId}-error`
  const [composing, setComposing] = useState(false)
  const [inputJson, setInputJson] = useState('{}')
  const [inputError, setInputError] = useState<string | undefined>()
  const businessName = neutralizeBidiFormattingControls(candidate.business.name)
  const offeringLabel = neutralizeBidiFormattingControls(candidate.offering.label)
  const operationId = neutralizeBidiFormattingControls(candidate.operationId)
  const candidateLabel = `${businessName}: ${offeringLabel} · ${operationId} (option ${candidate.rank})`
  const matchReason = neutralizeBidiFormattingControls(candidate.matchReason)
  const summary = neutralizeBidiFormattingControls(candidate.summary || candidate.offering.summary)
  const requiredParameters = candidate.requiredParameters.slice(0, OPERATION_PARAMETER_PREVIEW_LIMIT)
  const optionalParameters = candidate.optionalParameters.slice(0, OPERATION_PARAMETER_PREVIEW_LIMIT)
  const evidence = candidate.evidence.slice(0, OPERATION_EVIDENCE_PREVIEW_LIMIT)
  const availability = [
    formatMachineLabel(candidate.availability.posture),
    candidate.availability.reason === undefined ? '' : formatMachineLabel(candidate.availability.reason),
  ].filter(Boolean).join(' · ')
  const authority = [
    formatMachineLabel(candidate.authority.publisher),
    formatMachineLabel(candidate.authority.sourceKind),
    operationAuthenticationLabel(candidate.authority.authentication),
  ].join(' · ')
  const executionAvailabilityReason = operationExecutionAvailabilityReason(candidate.availability)
  const selectionUnavailable = (selected && !retryable) || onOperationSelect === undefined || executionAvailabilityReason !== undefined
  function submitOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const bytes = new TextEncoder().encode(inputJson).byteLength
    if (bytes > OPERATION_JSON_MAX_BYTES) {
      setInputError('Input must be 256 KiB or smaller.')
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(inputJson)
    } catch {
      setInputError('Enter valid JSON before running this operation.')
      return
    }
    if (!isRecord(parsed)) {
      setInputError('Operation input must be one JSON object.')
      return
    }
    const envelopeBytes = new TextEncoder().encode(JSON.stringify({
      operationRef: candidate.operationRef,
      input: parsed,
      candidateSetDigest,
    })).byteLength
    if (envelopeBytes > OPERATION_JSON_MAX_BYTES) {
      setInputError('Operation reference, input, and candidate digest together must be 256 KiB or smaller.')
      return
    }
    setInputError(undefined)
    onOperationSelect?.(candidate.operationRef, parsed, candidateSetDigest)
  }

  return (
    <li>
      <Card className="grid gap-4 rounded-lg border-border p-4 shadow-none" data-selected={selected ? 'true' : 'false'}>
        <header className="grid min-w-0 gap-1">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="grid min-w-0 gap-0.5">
              <h3
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
                className="line-clamp-2 break-words font-heading text-base font-semibold text-foreground"
              >
                {businessName}
              </h3>
              <p
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
                className="line-clamp-2 break-words text-sm font-medium text-foreground"
              >
                {offeringLabel} · {operationId}
              </p>
            </div>
            <Badge variant={selected ? 'default' : 'outline'} className="shrink-0">
              {selected ? 'Selected' : `Match ${candidate.rank}`}
            </Badge>
          </div>
          <p dir="auto" style={{ unicodeBidi: 'isolate' }} className="line-clamp-3 break-words text-sm leading-relaxed text-muted-foreground">
            {summary}
          </p>
        </header>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <CandidateFact label="Why it matches" value={matchReason} />
          <CandidateFact label="Price" value={operationPriceLabel(candidate)} />
          <CandidateFact label="Availability / readiness" value={availability} />
          <CandidateFact label="Authority" value={authority} />
        </dl>

        <div className="grid gap-3 sm:grid-cols-2">
          <CandidateList
            label="Required inputs"
            items={requiredParameters.map(parameterLabel)}
            total={candidate.requiredParameters.length}
            emptyLabel="No required inputs"
          />
          <CandidateList
            label="Optional inputs"
            items={optionalParameters.map(parameterLabel)}
            total={candidate.optionalParameters.length}
            emptyLabel="No optional inputs"
          />
          <CandidateList
            label="Evidence"
            items={evidence.map((item) => (
              `${formatMachineLabel(item.purpose)} · ${neutralizeBidiFormattingControls(item.outputPointer)}`
            ))}
            total={candidate.evidence.length}
            emptyLabel="No evidence summary provided"
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="min-h-11 w-full sm:w-fit">
            <Link
              to="/operations/$operationRef"
              params={{ operationRef: candidate.operationRef }}
              aria-label={`Review and use ${candidateLabel}`}
            >
              Review and use
            </Link>
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-fit"
            variant="secondary"
            disabled={selectionUnavailable}
            aria-expanded={selectionUnavailable ? undefined : composing}
            aria-controls={selectionUnavailable ? undefined : inputId}
            aria-label={
              selected && retryable
                ? `Retry ${candidateLabel} from this answer`
                : selected
                  ? `Selected ${candidateLabel} from this answer`
                  : executionAvailabilityReason === undefined
                    ? `Run ${candidateLabel} from this answer`
                    : `Not executable from this answer: ${candidateLabel}`
            }
            onClick={selectionUnavailable ? undefined : () => setComposing((current) => !current)}
          >
            {selected && retryable
              ? composing
                ? 'Close retry input'
                : 'Retry operation'
              : selected
                ? 'Selected operation'
                : executionAvailabilityReason !== undefined
                  ? 'Not executable from this answer'
                  : onOperationSelect === undefined
                    ? 'Run unavailable in replay'
                    : composing
                      ? 'Close input'
                      : 'Run from this answer'}
          </Button>
        </div>
        {executionAvailabilityReason === undefined ? null : (
          <p className="text-sm text-muted-foreground" role="note">
            {executionAvailabilityReason}
          </p>
        )}

        {composing && !selectionUnavailable ? (
          <form className="grid gap-3 border-t border-border pt-4" onSubmit={submitOperation}>
            <div className="grid gap-1.5">
              <label htmlFor={inputId} className="text-sm font-medium text-foreground">Input JSON</label>
              <p className="text-xs text-muted-foreground">
                {candidate.exactRebindRequired
                  ? 'The server will re-read and validate the current published schema before execution.'
                  : 'The server will re-read the operation and validate this object against the current published schema.'}
              </p>
              <Textarea
                id={inputId}
                value={inputJson}
                spellCheck={false}
                aria-invalid={inputError === undefined ? undefined : true}
                aria-describedby={inputError === undefined ? undefined : errorId}
                className="min-h-28 font-mono text-xs"
                onChange={(event) => {
                  setInputJson(event.target.value)
                  setInputError(undefined)
                }}
              />
              {inputError === undefined ? null : (
                <p id={errorId} role="alert" className="text-sm text-destructive">{inputError}</p>
              )}
            </div>
            <Button type="submit" className="min-h-11 w-full sm:w-fit">Validate and run</Button>
          </form>
        ) : null}
      </Card>
    </li>
  )
}

function parameterLabel(parameter: AnswerOperationCandidate['requiredParameters'][number] | AnswerOperationCandidate['optionalParameters'][number]): string {
  const metadata = [
    neutralizeBidiFormattingControls(parameter.name),
    formatMachineLabel(parameter.group),
    neutralizeBidiFormattingControls(parameter.type),
  ]
  if (parameter.description !== undefined) {
    metadata.push(neutralizeBidiFormattingControls(parameter.description))
  }
  if (parameter.example !== undefined) {
    metadata.push(`Example: ${neutralizeBidiFormattingControls(JSON.stringify(parameter.example))}`)
  }
  if (parameter.enumValues !== undefined && parameter.enumValues.length > 0) {
    metadata.push(`Allowed: ${parameter.enumValues.map(neutralizeBidiFormattingControls).join(', ')}`)
  }
  if (parameter.default !== undefined) {
    metadata.push(`Default: ${neutralizeBidiFormattingControls(JSON.stringify(parameter.default))}`)
  }
  if (parameter.style !== undefined) {
    metadata.push(`Style: ${formatMachineLabel(parameter.style)}`)
  }
  if (parameter.explode !== undefined) {
    metadata.push(`Explode: ${parameter.explode ? 'Yes' : 'No'}`)
  }
  return metadata.join(' · ')
}

function CandidateFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words text-sm text-foreground">
        {value}
      </dd>
    </div>
  )
}

function CandidateList({
  label,
  items,
  total,
  emptyLabel,
}: {
  label: string
  items: readonly string[]
  total: number
  emptyLabel: string
}) {
  return (
    <section className="grid min-w-0 gap-1.5" aria-label={label}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-foreground">{emptyLabel}</p>
      ) : (
        <ul className="grid gap-1 text-sm text-foreground">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words">
              {item}
            </li>
          ))}
          {total > items.length ? <li className="text-muted-foreground">+{total - items.length} more</li> : null}
        </ul>
      )}
    </section>
  )
}

function OperationOutcome({
  outcome,
  view,
}: {
  outcome: AnswerOperationOutcome
  view: AnswerOperationResultView
}) {
  const result = outcome.result
  const presentation = view.presentation
  const rawOutput = view.output === undefined ? undefined : boundedOutcomeJson(view.output)

  return (
    <section className={cn(REVEAL_ENTER, 'grid min-w-0 gap-4 rounded-md border border-border bg-card p-4')} aria-label="Operation outcome">
      <header className="grid gap-1">
        <p className="text-sm font-semibold text-foreground">{view.stateLabel}</p>
        {presentation === undefined ? null : (
          <h2
            dir="auto"
            style={{ unicodeBidi: 'isolate' }}
            className="break-words font-heading text-lg font-semibold text-foreground"
          >
            {neutralizeBidiFormattingControls(presentation.operationLabel)}
          </h2>
        )}
      </header>

      {view.output === undefined ? (
        <p dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words text-sm leading-relaxed text-foreground">
          {result.kind === 'pending'
            ? 'The operation is still pending. Check its current status before relying on a result.'
            : result.kind === 'needs_authority'
              ? 'The operation needs approval before it can run.'
              : result.kind === 'reconciliation_required'
                ? 'The outcome is uncertain and must be reconciled before retrying.'
                : result.kind === 'error'
                  ? neutralizeBidiFormattingControls(result.reason)
                  : result.kind === 'refused'
                    ? `The operation was not run: ${formatMachineLabel(
                        'code' in result ? result.code : result.reason,
                      )}.`
                    : 'No result was recorded.'}
        </p>
      ) : (
        <section className="grid min-w-0 gap-2" aria-label="Result">
          <h3 dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words text-xs font-medium text-muted-foreground">
            {neutralizeBidiFormattingControls(
              view.annotations.find((annotation) => annotation.pointer === '')?.label ?? 'Result',
            )}
          </h3>
          <ResultValue
            value={view.output}
            pointer=""
            annotations={view.annotations}
            depth={0}
          />
        </section>
      )}

      <div className="grid min-w-0 gap-1 border-t border-border pt-3 text-sm">
        <p dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words font-medium text-foreground">
          {presentation === undefined
            ? 'Recorded operation'
            : neutralizeBidiFormattingControls(presentation.sourceLabel)}
        </p>
        <p className="break-words text-muted-foreground">
          {presentation === undefined
            ? 'Runtime actor and time were not recorded.'
            : `Run by AE runtime · ${formatObservedAt(presentation.observedAt)}`}
        </p>
      </div>

      <details className="group min-w-0 rounded-md border border-border">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Technical details
        </summary>
        <div className="grid min-w-0 gap-4 border-t border-border p-3">
          <div className="grid gap-2">
            <Link
              to="/operations/$operationRef"
              params={{ operationRef: outcome.operationRef }}
              className="inline-flex min-h-6 w-fit max-w-full items-center break-all text-xs text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <code dir="ltr" style={{ unicodeBidi: 'isolate' }}>{outcome.operationRef}</code>
            </Link>
            {'invocationRef' in result ? (
              <Link
                to="/operations/invocations/$invocationRef"
                params={{ invocationRef: result.invocationRef }}
                aria-label="View current status"
                className="inline-flex min-h-6 w-fit items-center text-sm font-semibold text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <code dir="ltr" style={{ unicodeBidi: 'isolate' }}>{result.invocationRef}</code>
              </Link>
            ) : null}
          </div>

          <dl className="grid min-w-0 gap-3 text-sm sm:grid-cols-2">
            {result.kind === 'completed' ? (
              <>
                <OutcomeFact label="Charge state" value={formatMachineLabel(result.usage.chargeState)} />
                <OutcomeFact label="Exact amount" value={formatCurrencyAmount(result.usage.amount)} />
                <OutcomeFact label="Usage ref" value={result.usage.usageRef} />
                <OutcomeFact label="Observed" value={formatObservedAt(result.usage.observedAt)} />
                <OutcomeFact label="Price digest" value={result.usage.priceDigest} />
                <OutcomeFact label="Transaction ref" value={result.usage.transactionRef ?? 'Not recorded'} />
                <OutcomeFact label="Duration" value={result.usage.durationMs === undefined ? 'Not recorded' : `${result.usage.durationMs} ms`} />
                <OutcomeFact label="Evidence hash" value={result.evidenceHash} />
              </>
            ) : result.kind === 'ok' ? (
              <OutcomeFact label="Evidence hash" value={result.evidenceHash} />
            ) : result.kind === 'pending' ? (
              <OutcomeFact label="Retry after" value={`${result.retryAfterMs} ms`} />
            ) : result.kind === 'needs_authority' ? (
              <>
                <OutcomeFact label="Consequence" value={formatMachineLabel(result.authorityRequest.consequence)} />
                <OutcomeFact label="Retry class" value={formatMachineLabel(result.authorityRequest.retryClass)} />
                <OutcomeFact label="Maximum spend" value={result.authorityRequest.maximumSpend === undefined ? 'Not specified' : formatCurrencyAmount(result.authorityRequest.maximumSpend)} />
                <OutcomeFact label="Data fields" value={result.authorityRequest.dataFields.length === 0 ? 'None' : result.authorityRequest.dataFields.join(', ')} />
                <OutcomeFact label="Authority expires" value={result.authorityRequest.expiresAt ?? 'Not specified'} />
              </>
            ) : result.kind === 'reconciliation_required' ? (
              <>
                <OutcomeFact label="Attempt ref" value={result.evidence.attemptRef} />
                <OutcomeFact label="Effect generation" value={String(result.evidence.effectGeneration)} />
                <OutcomeFact label="Required at" value={result.evidence.requiredAt} />
                <OutcomeFact label="Retry policy" value={formatMachineLabel(result.evidence.retry)} />
                <OutcomeFact label="Evidence source" value={result.evidence.evidenceSource} />
              </>
            ) : result.kind === 'error' ? (
              <>
                <OutcomeFact label="Code" value={formatMachineLabel(result.code)} />
                <OutcomeFact label="Retryable" value={result.retryable ? 'Yes' : 'No'} />
                <OutcomeFact label="Detail" value={result.reason} />
                {result.composition === undefined ? null : <OutcomeFact label="Composition" value={JSON.stringify(result.composition)} />}
              </>
            ) : result.kind === 'unsafe_output' ? (
              <OutcomeFact label="Code" value="Result withheld" />
            ) : (
              <>
                <OutcomeFact
                  label="Code"
                  value={formatMachineLabel('code' in result ? result.code : result.reason)}
                />
                {'retryable' in result ? <OutcomeFact label="Retryable" value={result.retryable ? 'Yes' : 'No'} /> : null}
                {'nextAction' in result && result.nextAction !== undefined ? <OutcomeFact label="Next action" value={result.nextAction} /> : null}
                {'composition' in result && result.composition !== undefined ? <OutcomeFact label="Composition" value={JSON.stringify(result.composition)} /> : null}
              </>
            )}
            {presentation === undefined ? null : (
              <>
                <OutcomeFact label="Descriptor digest" value={presentation.descriptorDigest} />
                <OutcomeFact label="Output schema digest" value={presentation.outputSchemaDigest} />
                <OutcomeFact label="Runtime actor" value="ae_runtime" />
              </>
            )}
            <OutcomeFact label="Canonical result digest" value={outcome.resultDigest} />
            <OutcomeFact label="Tool record digest" value={outcome.toolCallDigest} />
          </dl>

          {rawOutput === undefined ? null : (
            <div className="grid min-w-0 gap-1.5">
              <p className="text-xs font-medium text-muted-foreground">Raw bounded JSON</p>
              <pre className="max-h-80 min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs text-foreground">
                {rawOutput}
              </pre>
            </div>
          )}
        </div>
      </details>
    </section>
  )
}

function ResultValue({
  value,
  pointer,
  annotations,
  depth,
}: {
  value: unknown
  pointer: string
  annotations: readonly AnswerOperationResultAnnotation[]
  depth: number
}) {
  const annotation = annotations.find((item) => item.pointer === pointer)
  if (annotation?.href !== undefined) {
    return (
      <a
        href={annotation.href}
        target="_blank"
        rel="noopener noreferrer"
        referrerPolicy="no-referrer"
        className="inline-flex min-h-6 w-fit max-w-full items-center break-all text-brand underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {neutralizeBidiFormattingControls(annotation.label)}
      </a>
    )
  }
  if (value === null || typeof value !== 'object') {
    return (
      <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words text-sm leading-relaxed text-foreground">
        {value === null
          ? 'null'
          : typeof value === 'string'
            ? neutralizeBidiFormattingControls(value)
            : String(value)}
      </span>
    )
  }
  if (depth >= 5) {
    return (
      <span className="break-words text-sm text-muted-foreground">
        Additional nested data is available in Technical details.
      </span>
    )
  }
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value
    return (
      <ol className="grid min-w-0 gap-2">
        {items.slice(0, 24).map((item, index) => {
          const itemPointer = `${pointer}/${index}`
          const itemAnnotation = annotations.find((candidate) => candidate.pointer === itemPointer)
          return (
            <li key={itemPointer} className="grid min-w-0 gap-1 rounded-md bg-muted p-3">
              <span className="text-xs font-medium text-muted-foreground">
                {itemAnnotation === undefined
                  ? `Item ${index + 1}`
                  : neutralizeBidiFormattingControls(itemAnnotation.label)}
              </span>
              <ResultValue value={item} pointer={itemPointer} annotations={annotations} depth={depth + 1} />
            </li>
          )
        })}
        {items.length > 24 ? (
          <li className="text-sm text-muted-foreground">
            {items.length - 24} more items are available in Technical details.
          </li>
        ) : null}
      </ol>
    )
  }
  if (!isRecord(value)) {
    return null
  }
  const entries = Object.entries(value)
  return (
    <dl className="grid min-w-0 gap-3 sm:grid-cols-2">
      {entries.slice(0, 24).map(([key, item]) => {
        const itemPointer = `${pointer}/${key.replace(/~/gu, '~0').replace(/\//gu, '~1')}`
        const itemAnnotation = annotations.find((candidate) => candidate.pointer === itemPointer)
        return (
          <div key={itemPointer} className="grid min-w-0 gap-1">
            <dt dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words text-xs font-medium text-muted-foreground">
              {neutralizeBidiFormattingControls(itemAnnotation?.label ?? formatMachineLabel(key))}
            </dt>
            <dd className="min-w-0">
              <ResultValue value={item} pointer={itemPointer} annotations={annotations} depth={depth + 1} />
            </dd>
          </div>
        )
      })}
      {entries.length > 24 ? (
        <div className="text-sm text-muted-foreground">
          {entries.length - 24} more fields are available in Technical details.
        </div>
      ) : null}
    </dl>
  )
}

function OutcomeFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-all text-sm text-foreground">{neutralizeBidiFormattingControls(value)}</dd>
    </div>
  )
}

function boundedOutcomeJson(value: unknown): string {
  const json = neutralizeBidiFormattingControls(JSON.stringify(value, null, 2) ?? 'null')
  return new TextEncoder().encode(json).byteLength <= OPERATION_JSON_MAX_BYTES
    ? json
    : 'Output exceeded the 256 KiB answer-artifact limit. Use the canonical result digest and recovery surface.'
}

function formatObservedAt(value: number): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

function operationPriceLabel(candidate: AnswerOperationCandidate): string {
  switch (candidate.commercial.price.kind) {
    case 'fixed':
      return formatCurrencyAmount(candidate.commercial.price.amount)
    case 'range':
      return `${formatCurrencyAmount(candidate.commercial.price.minimum)} – ${formatCurrencyAmount(candidate.commercial.price.maximum)}`
    case 'on_request':
      return 'Price on request'
  }
}

function operationAuthenticationLabel(authentication: AnswerOperationCandidate['authority']['authentication']): string {
  switch (authentication.kind) {
    case 'keyless':
      return 'Keyless'
    case 'platform_credential':
      return authentication.scheme === 'api_key'
        ? `Platform credential · API key (${formatMachineLabel(authentication.in)})`
        : 'Platform credential · Bearer'
    case 'x402':
      return 'x402 payment'
    case 'unknown':
      return 'Authentication unknown'
  }
}

function operationExecutionAvailabilityReason(
  availability: AnswerOperationCandidate['availability'],
): string | undefined {
  switch (availability.posture) {
    case 'routeable':
      return undefined
    case 'integrated':
      return 'Not executable from this answer: integrated availability requires review on the operation page.'
    case 'unavailable':
      return `Not executable from this answer: ${formatMachineLabel(availability.reason ?? 'unavailable')}.`
  }
}

function formatMachineLabel(value: string): string {
  const label = neutralizeBidiFormattingControls(value)
    .replaceAll('_', ' ')
    .replace(/\b(?:ae|http|mcp)\b/giu, (part) => part.toUpperCase())
  return label.charAt(0).toUpperCase() + label.slice(1)
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
          <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recommended</p>
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
        <p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sources</p>
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
  const content = (
    <>
      <ItemMedia variant="icon" aria-hidden="true" className="font-mono text-sm font-semibold text-muted-foreground">
        {initial}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
          className="truncate underline-offset-4"
        >
          {sourceName}
        </ItemTitle>
        <ItemDescription
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
          className="truncate text-left text-xs"
        >
          {basis}
        </ItemDescription>
      </ItemContent>
      <ItemActions className="hidden shrink-0 sm:flex">
        <Badge variant="outline" className="font-mono text-xs tabular-nums">
          {source.citationIndex}
        </Badge>
      </ItemActions>
    </>
  )

  return (
    <li>
      <Item asChild variant="outline" size="sm" className="bg-card">
        {detailIsInternal ? (
          <Link to="/$slug" params={{ slug: source.slug }} search={search}>
            {content}
          </Link>
        ) : (
          <a href={source.detailUrl}>{content}</a>
        )}
      </Item>
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
        <p className="shrink-0 font-mono text-xs text-muted-foreground">{listingCountLabel(providers.length)}</p>
      </header>
      <Table className="min-w-[44rem] border-collapse">
        <TableCaption className="sr-only">Comparison based on published business details.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead
              scope="col"
              className="sticky left-0 z-10 h-auto w-[13.5rem] border-b border-border bg-card px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              Business
            </TableHead>
            {fields.map((field) => (
              <TableHead
                key={field}
                scope="col"
                className="h-auto border-b border-border px-4 py-3 font-mono text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                {compareFieldLabel(field)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {providers.map((provider) => (
            <ProviderCompareRow key={provider.slug} provider={provider} fields={fields} threadId={threadId} />
          ))}
        </TableBody>
      </Table>
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
    <TableRow>
      <TableHead scope="row" className="sticky left-0 z-10 h-auto border-t border-border bg-card px-4 py-3 text-left align-top">
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
          <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="font-mono text-xs text-muted-foreground">{category}</span>
        </span>
      </TableHead>
      {fields.map((field) => (
        <TableCell
          key={`${provider.slug}-${field}`}
          className={cn('border-t border-border px-4 py-3 align-top whitespace-normal tabular-nums text-muted-foreground', field === 'freshness' && 'font-mono text-xs tracking-wide')}
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
        >
          {neutralizeBidiFormattingControls(compareFieldValue(provider, field))}
        </TableCell>
      ))}
    </TableRow>
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

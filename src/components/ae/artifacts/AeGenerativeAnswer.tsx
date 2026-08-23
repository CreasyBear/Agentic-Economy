import type { ReactNode } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeStreamingLabel } from '@/components/ae/chat/AeStreamingLabel'
import { AeWorkDisclosure } from '@/components/ae/chat/AeWorkDisclosure'
import { cn } from '@/lib/utils'
import {
  answerOperationCandidateSetDigest,
  artifactsToMessageParts,
  inferLayoutProfileFromArtifacts,
  neutralizeBidiFormattingControls,
  type AnswerLayoutProfile,
  type AnswerMessagePart,
} from '@/modules/answer/public'
import type { AnswerArtifact, AnswerWorkStep } from '@/modules/answer/public'
import type { PublicAnswerCheckSummary, ThinkingStep } from '@/modules/answer-thread/public'

import { SelectedSource, SourcesList } from './AeAnswerSources'
import { REVEAL_ENTER } from './AeGenerativeAnswerCopy'
import { OperationCandidateList } from './AeOperationCandidates'
import { OperationOutcome } from './AeOperationOutcome'
import { ProviderCompareTable } from './AeProviderCompare'
import { RecoveryPrompts } from './AeRecoveryPrompts'

const EmptyWorkSteps: readonly AnswerWorkStep[] = []
const EmptyThinkingSteps: readonly string[] = []
const PLAIN_URL_PATTERN = /https?:\/\/[^\s<>"'`]+/iu

function projectPlainActionCopy(text: string): string {
  const normalized = neutralizeBidiFormattingControls(text)
  const url = normalized.match(PLAIN_URL_PATTERN)?.[0]?.replace(/[),.;!?]+$/u, '')
  if (url !== undefined && /\b(?:click|tap)\b/iu.test(normalized)) {
    return `Copy this URL: ${url}`
  }
  return normalized.replace(/\b(?:click|tap)\b/giu, 'Use')
}

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
  /** Real search and verification steps rendered as a compact disclosure above the result. */
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
    ? 'text-lg font-semibold leading-snug text-balance'
    : 'text-base font-medium leading-snug'
  const summaryPart = parts.find(
    (part): part is Extract<AnswerMessagePart, { kind: 'prose' }> =>
      part.kind === 'prose' && part.text.trim().length > 0,
  )
  return (
    <section
      className="grid gap-3"
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
              aria-label="Searching operations"
            >
              {busy ? <AeStreamingLabel as="span">Searching operations</AeStreamingLabel> : 'Searching operations'}
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
          threadId={threadId}
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
          threadId={threadId}
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

/** Split the streamed summary into a compact, readable market-workbench column. */
function ProseBody({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n+/)
    .map((paragraph) => neutralizeBidiFormattingControls(paragraph.trim()))
    .filter((paragraph) => paragraph.length > 0)

  return (
    <div className={cn(REVEAL_ENTER, 'grid gap-2.5')}>
      {paragraphs.map((paragraph, index) => (
        <p
          key={index}
          dir="auto"
          style={{ unicodeBidi: 'isolate' }}
          className="max-w-[72ch] text-pretty text-sm leading-relaxed text-foreground"
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
  threadId,
  onOperationSelect,
  retryableOperationRef,
}: {
  part: AnswerMessagePart
  query: string
  empty: boolean
  threadId: string | undefined
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
    case 'imported-claims':
    case 'location-map':
    case 'empty-state':
    case 'operation-comparison':
    case 'operation-plan':
    case 'protected-by-ae':
      return null
    case 'provider-compare-table':
      return (
        <ProviderCompareTable
          providers={part.providers}
          threadId={threadId}
          {...(part.fields === undefined ? {} : { fields: part.fields })}
        />
      )
    case 'recovery-prompts':
      return (
        <RecoveryPrompts
          prompts={part.prompts}
          {...(part.title === undefined ? {} : { title: part.title })}
          {...(part.links === undefined ? {} : { links: part.links })}
        />
      )
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
    case 'operation-outcome':
      return <OperationOutcome outcome={part.outcome} view={part.resultView} />
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
    default: {
      const _exhaustive: never = part
      void _exhaustive
      return null
    }
  }
}

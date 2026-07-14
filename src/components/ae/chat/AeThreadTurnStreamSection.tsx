import { useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import type { AnswerEvent } from '@/modules/answer/public'
import {
  stableAeSearchContextKey,
  type AeSearchContext,
} from '@/modules/answer/search-context'
import type { FollowUpIntent, PublicThreadTurn } from '@/modules/answer-thread/public'
import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { AeAnswerThinkingTrace } from './AeAnswerThinkingTrace'
import { AeThreadTurnQueryHeader } from './AeThreadTurnQueryHeader'
import { AeTurnContextLine } from './AeTurnContextLine'
import { ANSWER_SECTION_CLASS } from './thread-turn-view'
import { orderShortlistArtifacts } from './shortlist-projection'
import type { StreamAnswerResult } from './answer-stream'
import {
  initialAnswerTurnUiState,
  reduceAnswerTurnEvent,
  stopRunningWorkSteps,
  type AnswerTurnUiState,
} from './answer-turn-state'
import { abortAnswerTurnStream, attachAnswerTurnStream } from './turn-stream-session'

const STREAM_ERROR_COPY = 'The answer could not be built right now. Try again or browse services.'
const RATE_LIMIT_COPY = 'Too many answer requests right now. Wait a minute and try again, or browse services.'

export type TurnStreamOutcome = 'complete' | 'error' | 'stopped' | 'rate_limited'

export type AeThreadTurnStreamSectionProps = {
  query: string
  searchContext?: AeSearchContext
  intent?: FollowUpIntent
  seq?: number
  threadId?: string
  generation: number
  onThreadCreated?: (threadId: string, turnMeta?: { turnId: string; turnSeq: number }) => void
  onSettledTurn?: (turn: PublicThreadTurn, generation: number) => void
  onStreamEnd?: (outcome: TurnStreamOutcome) => void
  onRetry?: () => void
}

export function AeThreadTurnStreamSection({
  query,
  searchContext,
  intent = 'refine_search',
  seq = 1,
  threadId,
  generation,
  onThreadCreated,
  onStreamEnd,
  onSettledTurn,
  onRetry,
}: AeThreadTurnStreamSectionProps) {
  const [state, sendTurnUpdate] = useReducer(turnReducer, initialAnswerTurnUiState)

  const mountedRef = useRef(true)
  const completeRef = useRef(false)
  const userStopRef = useRef(false)
  const generationRef = useRef(generation)
  const onStreamEndRef = useRef(onStreamEnd)
  const onThreadCreatedRef = useRef(onThreadCreated)
  const onSettledTurnRef = useRef(onSettledTurn)
  const latestStateRef = useRef<AnswerTurnUiState>(initialAnswerTurnUiState)
  const turnMetaRef = useRef<{ threadId: string; turnId: string; turnSeq: number } | null>(null)
  const requestThreadIdRef = useRef<string | undefined>(threadId)
  const requestIntentRef = useRef<FollowUpIntent>(intent)
  const streamKey = `${generation}:${query}:${stableAeSearchContextKey(searchContext)}`

  useLayoutEffect(() => {
    generationRef.current = generation
    onStreamEndRef.current = onStreamEnd
    onThreadCreatedRef.current = onThreadCreated
    onSettledTurnRef.current = onSettledTurn
  })

  // Freeze thread id at generation boundaries so remounts do not POST a just-created
  // thread id before Convex persistence finishes.
  useLayoutEffect(() => {
    requestThreadIdRef.current = threadId
    requestIntentRef.current = intent
    // oxlint-disable-next-line react-doctor/exhaustive-deps -- threadId and intent are intentionally frozen until generation changes.
  }, [generation])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    sendTurnUpdate({ type: 'reset' })
    completeRef.current = false
    userStopRef.current = false
    latestStateRef.current = initialAnswerTurnUiState
    turnMetaRef.current = null

    const activeGeneration = generation
    const threadIdAtStart = requestThreadIdRef.current

    function applyEvent(event: AnswerEvent) {
      if (!mountedRef.current || generationRef.current !== activeGeneration) return
      if (event.type === 'complete') completeRef.current = true
      latestStateRef.current = reduceAnswerTurnEvent(latestStateRef.current, event)
      sendTurnUpdate({ type: 'event', event })
    }

    function handleStreamResult(result: StreamAnswerResult) {
      if (!mountedRef.current || generationRef.current !== activeGeneration) return

      if (result === 'aborted') {
        if (userStopRef.current) {
          userStopRef.current = false
          onStreamEndRef.current?.('stopped')
        }
        return
      }

      if (result === 'rate_limited') {
        sendTurnUpdate({ type: 'rate_limited' })
        onStreamEndRef.current?.('rate_limited')
        return
      }

      if (result === 'error') {
        sendTurnUpdate({ type: 'stream_failed' })
        onStreamEndRef.current?.('error')
        return
      }

      if (result === 'done') {
        sendTurnUpdate({ type: 'stream_finished' })
        const settledTurn = buildOptimisticSettledTurn({
          state: latestStateRef.current,
          meta: turnMetaRef.current,
          query,
          intent: requestIntentRef.current,
          searchContext,
        })
        if (settledTurn !== null) onSettledTurnRef.current?.(settledTurn, activeGeneration)
        onStreamEndRef.current?.(completeRef.current ? 'complete' : 'error')
      }
    }

    const detach = attachAnswerTurnStream({
      key: streamKey,
      query,
      ...(searchContext === undefined ? {} : { searchContext }),
      ...(threadIdAtStart === undefined ? {} : { threadId: threadIdAtStart }),
      subscriber: {
        onThread: (meta) => {
          if (!mountedRef.current || generationRef.current !== activeGeneration) {
            return
          }
          turnMetaRef.current = meta
          onThreadCreatedRef.current?.(meta.threadId, { turnId: meta.turnId, turnSeq: meta.turnSeq })
        },
        onFrame: (frame) => applyEvent(frame.event),
        onResult: handleStreamResult,
      },
    })

    return () => {
      detach()
      const generationChanged = generation !== generationRef.current
      if (userStopRef.current || generationChanged) {
        abortAnswerTurnStream(streamKey)
      }
    }
  }, [query, searchContext, generation, streamKey])

  function stop() {
    if (userStopRef.current || !mountedRef.current) {
      return
    }
    userStopRef.current = true
    latestStateRef.current = stopRunningWorkSteps(latestStateRef.current)
    sendTurnUpdate({ type: 'stopped' })
    abortAnswerTurnStream(streamKey)
  }

  const busy = state.phase === 'streaming'

  return (
    <div className="flex flex-col gap-2">
      <AeThreadTurnQueryHeader query={query} intent={intent} seq={seq} />
      <Message from="assistant" className={ANSWER_SECTION_CLASS}>
        <MessageContent className="w-full">
          <AeTurnContextLine intent={intent} seq={seq} artifacts={state.artifacts} />
          <AeAnswerThinkingTrace
            isStreaming={busy}
            label={state.thinkingLabel}
            steps={state.thinkingSteps}
            workLog={state.workLog}
            {...(state.thinkingStep === undefined ? {} : { thinkingStep: state.thinkingStep })}
            query={query}
          />
          <AeGenerativeAnswer
            artifacts={orderShortlistArtifacts(state.artifacts, searchContext?.timing)}
            query={query}
            {...(state.layoutProfile === undefined ? {} : { layoutProfile: state.layoutProfile })}
            busy={busy}
            oneLineFallback={state.oneLineFallback}
            onStop={stop}
            phase={state.phase}
            {...(threadId === undefined ? {} : { threadId })}
            errorMessage={
              state.phase === 'error' || state.phase === 'stopped' ? (
                <>
                  {state.phase === 'stopped' ? 'Answer stopped.' : (state.errorMessage ?? STREAM_ERROR_COPY)}{' '}
                  {onRetry !== undefined ? (
                    <button type="button" className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-primary underline underline-offset-4 hover:text-primary" onClick={onRetry}>
                      Try again
                    </button>
                  ) : null}{' '}
                  <Link to="/registry" search={{ q: '', limit: 10 }} className="text-primary underline underline-offset-4">
                    Browse services
                  </Link>
                </>
              ) : null
            }
          />
        </MessageContent>
      </Message>
    </div>
  )
}

function buildOptimisticSettledTurn({
  state,
  meta,
  query,
  intent,
  searchContext,
}: {
  state: AnswerTurnUiState
  meta: { threadId: string; turnId: string; turnSeq: number } | null
  query: string
  intent: FollowUpIntent
  searchContext: AeSearchContext | undefined
}): PublicThreadTurn | null {
  if (!state.complete || meta === null) {
    return null
  }

  return {
    turnId: meta.turnId,
    seq: meta.turnSeq,
    query,
    intent,
    status: 'complete',
    workLog: state.workLog,
    artifacts: state.artifacts,
    oneLine: state.oneLineFallback,
    ...(searchContext?.timing === undefined ? {} : { timing: searchContext.timing }),
    ...(searchContext?.timingDate === undefined ? {} : { timingDate: searchContext.timingDate }),
    ...(state.layoutProfile === undefined ? {} : { layoutProfile: state.layoutProfile }),
  }
}

type TurnAction =
  | { type: 'reset' }
  | { type: 'event'; event: AnswerEvent }
  | { type: 'stopped' }
  | { type: 'stream_failed' }
  | { type: 'rate_limited' }
  | { type: 'stream_finished' }

function turnReducer(current: AnswerTurnUiState, action: TurnAction): AnswerTurnUiState {
  switch (action.type) {
    case 'reset':
      return initialAnswerTurnUiState
    case 'event':
      return reduceAnswerTurnEvent(current, action.event)
    case 'stopped':
      return current.phase === 'streaming' ? { ...stopRunningWorkSteps(current), phase: 'stopped' } : current
    case 'stream_failed':
      return current.complete
        ? current
        : {
            ...current,
            phase: 'error',
            errorMessage: STREAM_ERROR_COPY,
          }
    case 'rate_limited':
      return current.complete
        ? current
        : {
            ...current,
            phase: 'error',
            errorMessage: RATE_LIMIT_COPY,
          }
    case 'stream_finished':
      if (current.complete) {
        return { ...current, phase: 'complete' }
      }
      return {
        ...current,
        phase: 'error',
        errorMessage: STREAM_ERROR_COPY,
      }
    default: {
      const _exhaustive: never = action
      void _exhaustive
      return current
    }
  }
}

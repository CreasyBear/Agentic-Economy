import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import type { AeSearchContext } from '@/modules/answer/search-context'
import type { PublicThreadTurn } from '@/modules/answer-thread/public'
import type { AnswerStreamFrame, StreamAnswerResult, TurnThreadMeta } from './answer-stream'
import {
  initialAnswerTurnUiState,
  reduceAnswerTurnState,
  type AnswerTurnAction,
  type AnswerTurnMeta,
  type AnswerTurnUiState,
} from './answer-turn-state'
import { abortAnswerTurnStream, attachAnswerTurnStream } from './turn-stream-session'
import { readAnswerThreadProjection, type ThreadReadbackResult } from './thread-readback'
import { stopAnswerTurnRequest } from './turn-stop'

export type TurnStreamOutcome = 'complete' | 'pending' | 'error' | 'stopped'

type UseAnswerTurnLifecycleInput = {
  query: string
  searchContext?: AeSearchContext
  threadId?: string
  clientTurnKey: string
  generation: number
  onThreadCreated?: (threadId: string, turnMeta?: { turnId: string; turnSeq: number }) => void
  onSettledTurn?: (turn: PublicThreadTurn, generation: number) => void
  onStreamEnd?: (outcome: TurnStreamOutcome) => void
}

type ReadbackWork = {
  epoch: number
  controller: AbortController
}

const READBACK_RETRY_DELAY_MS = 250

export function useAnswerTurnLifecycle(input: UseAnswerTurnLifecycleInput): {
  state: AnswerTurnUiState
  stop: () => Promise<void>
} {
  const [state, reactDispatch] = useReducer(reduceAnswerTurnState, initialAnswerTurnUiState)
  const mountedRef = useRef(true)
  const generationRef = useRef(input.generation)
  const onStreamEndRef = useRef(input.onStreamEnd)
  const onThreadCreatedRef = useRef(input.onThreadCreated)
  const onSettledTurnRef = useRef(input.onSettledTurn)
  const latestStateRef = useRef<AnswerTurnUiState>(initialAnswerTurnUiState)
  const requestThreadIdRef = useRef<string | undefined>(input.threadId)
  const readbackEpochRef = useRef(0)
  const readbackStartedEpochRef = useRef<number | null>(null)
  const readbackWorkRef = useRef<ReadbackWork | null>(null)
  const settleFromReadbackRef = useRef<(() => Promise<void>) | null>(null)

  const dispatchAction = useCallback((action: AnswerTurnAction): AnswerTurnUiState => {
    const next = reduceAnswerTurnState(latestStateRef.current, action)
    latestStateRef.current = next
    reactDispatch(action)
    return next
  }, [])

  const invalidateReadback = useCallback((): void => {
    readbackEpochRef.current += 1
    readbackStartedEpochRef.current = null
    const work = readbackWorkRef.current
    readbackWorkRef.current = null
    work?.controller.abort()
  }, [])

  useLayoutEffect(() => {
    generationRef.current = input.generation
    onStreamEndRef.current = input.onStreamEnd
    onThreadCreatedRef.current = input.onThreadCreated
    onSettledTurnRef.current = input.onSettledTurn
  }, [input.generation, input.onStreamEnd, input.onSettledTurn, input.onThreadCreated])

  useLayoutEffect(() => {
    requestThreadIdRef.current = input.threadId
    // oxlint-disable-next-line react-doctor/exhaustive-deps -- threadId is frozen until a new generation.
  }, [input.generation])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      invalidateReadback()
    }
  }, [invalidateReadback])

  useEffect(() => {
    invalidateReadback()
    dispatchAction({ type: 'reset' })

    const activeGeneration = input.generation
    const threadIdAtStart = requestThreadIdRef.current

    function isActive(): boolean {
      return mountedRef.current && generationRef.current === activeGeneration
    }

    function isCurrentReadback(work: ReadbackWork): boolean {
      return readbackWorkRef.current === work
        && readbackEpochRef.current === work.epoch
        && work.controller.signal.aborted === false
    }

    function handleThread(meta: TurnThreadMeta): void {
      if (!isActive()) {
        return
      }
      onThreadCreatedRef.current?.(meta.threadId, { turnId: meta.turnId, turnSeq: meta.turnSeq })
    }

    function handleFrame(frame: AnswerStreamFrame): void {
      if (!isActive()) {
        return
      }
      dispatchAction({ type: 'frame', frame })
    }

    function handleReadback(result: ThreadReadbackResult, meta: AnswerTurnMeta): void {
      if (result.kind === 'ok') {
        const turn = result.projection.turns.find((candidate) => candidate.turnId === meta.turnId)
        if (turn === undefined) {
          dispatchAction({ type: 'readback_not_found' })
          onStreamEndRef.current?.('error')
          return
        }
        dispatchAction({ type: 'readback_turn', turn })
        onSettledTurnRef.current?.(turn, activeGeneration)
        onStreamEndRef.current?.(turnOutcome(turn.status))
        return
      }

      if (result.kind === 'not_found') {
        if (latestStateRef.current.stopState === 'accepted') {
          onStreamEndRef.current?.('stopped')
          return
        }
        dispatchAction({ type: 'readback_not_found' })
        onStreamEndRef.current?.('error')
        return
      }

      if (latestStateRef.current.stopState === 'accepted') {
        onStreamEndRef.current?.('stopped')
        return
      }
      if (result.kind === 'failed') {
        dispatchAction({ type: 'readback_failed', problem: result.problem })
      } else {
        dispatchAction({ type: 'readback_failed', transportError: result.error })
      }
      onStreamEndRef.current?.('error')
    }

    async function settleFromReadback(): Promise<void> {
      if (!isActive()) {
        return
      }
      const epoch = readbackEpochRef.current
      if (readbackStartedEpochRef.current === epoch) {
        return
      }
      const meta = latestStateRef.current.threadMeta
      if (meta === null) {
        readbackStartedEpochRef.current = epoch
        dispatchAction({
          type: 'readback_failed',
          transportError: {
            kind: 'protocol',
            code: 'missing_stream',
            detail: 'The answer did not provide a durable turn identity.',
          },
        })
        onStreamEndRef.current?.('error')
        return
      }

      readbackStartedEpochRef.current = epoch
      const work: ReadbackWork = { epoch, controller: new AbortController() }
      readbackWorkRef.current = work
      let result = await readAnswerThreadProjection(meta.threadId, work.controller.signal)
      if (!isCurrentReadback(work) || !isActive()) {
        return
      }

      if (shouldRetryReadback(result)) {
        const retryAllowed = await waitForRetry(work.controller.signal)
        if (!retryAllowed || !isCurrentReadback(work) || !isActive()) {
          return
        }
        result = await readAnswerThreadProjection(meta.threadId, work.controller.signal)
        if (!isCurrentReadback(work) || !isActive()) {
          return
        }
      }

      readbackWorkRef.current = null
      handleReadback(result, meta)
    }

    async function handleResult(result: StreamAnswerResult): Promise<void> {
      if (!isActive()) {
        return
      }
      dispatchAction({ type: 'stream_result', result })
      if (result.kind === 'aborted') {
        return
      }
      if (
        latestStateRef.current.threadMeta === null
        && (result.kind === 'problem' || result.kind === 'transport_error')
      ) {
        onStreamEndRef.current?.('error')
        return
      }
      await settleFromReadback()
    }

    settleFromReadbackRef.current = settleFromReadback
    const detach = attachAnswerTurnStream({
      key: input.clientTurnKey,
      query: input.query,
      ...(input.searchContext === undefined ? {} : { searchContext: input.searchContext }),
      ...(threadIdAtStart === undefined ? {} : { threadId: threadIdAtStart }),
      subscriber: {
        onThread: handleThread,
        onFrame: handleFrame,
        onResult: (result) => { void handleResult(result) },
      },
    })

    return () => {
      if (settleFromReadbackRef.current === settleFromReadback) {
        settleFromReadbackRef.current = null
      }
      invalidateReadback()
      detach()
    }
  }, [dispatchAction, input.clientTurnKey, input.generation, input.query, input.searchContext, invalidateReadback])

  const stop = useCallback(async (): Promise<void> => {
    const current = latestStateRef.current
    const meta = current.threadMeta
    if (
      !mountedRef.current
      || meta === null
      || current.stopState === 'requested'
      || (current.phase !== 'streaming' && current.phase !== 'settling' && current.phase !== 'pending')
    ) {
      return
    }

    dispatchAction({ type: 'stop_requested' })
    const result = await stopAnswerTurnRequest({ threadId: meta.threadId, turnId: meta.turnId })
    if (!mountedRef.current || generationRef.current !== input.generation) {
      return
    }

    if (result.kind === 'stopped') {
      dispatchAction({ type: 'stop_accepted' })
      abortAnswerTurnStream(input.clientTurnKey)
      invalidateReadback()
      await settleFromReadbackRef.current?.()
      return
    }

    if (result.kind === 'already_settled') {
      dispatchAction({ type: 'stop_too_late', status: result.status })
      invalidateReadback()
      await settleFromReadbackRef.current?.()
      return
    }

    if (result.kind === 'problem') {
      dispatchAction({ type: 'stop_failed', problem: result.problem })
      return
    }
    if (result.kind === 'transport_error') {
      dispatchAction({ type: 'stop_failed', transportError: result.error })
      return
    }

    dispatchAction({
      type: 'stop_failed',
      problem: {
        type: 'about:blank',
        title: 'Not found',
        status: 404,
        kind: 'NOT_FOUND',
        code: 'thread_not_found',
      },
    })
  }, [dispatchAction, input.clientTurnKey, input.generation, invalidateReadback])

  return { state, stop }
}

function shouldRetryReadback(result: ThreadReadbackResult): boolean {
  return result.kind === 'transport_error'
    ? result.error.kind === 'network'
    : result.kind === 'failed' && result.problem.retryable === true
}

function waitForRetry(signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (value: boolean): void => {
      if (timer !== undefined) {
        clearTimeout(timer)
      }
      signal.removeEventListener('abort', onAbort)
      resolve(value)
    }
    const onAbort = (): void => finish(false)
    if (signal.aborted) {
      finish(false)
      return
    }
    signal.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => finish(true), READBACK_RETRY_DELAY_MS)
  })
}

function turnOutcome(status: PublicThreadTurn['status']): TurnStreamOutcome {
  switch (status) {
    case 'complete':
      return 'complete'
    case 'pending':
      return 'pending'
    case 'stopped':
      return 'stopped'
    case 'error':
      return 'error'
    default: {
      const _exhaustive: never = status
      void _exhaustive
      return 'error'
    }
  }
}

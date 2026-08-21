import { useEffect, useRef } from 'react'
import { MessageScrollerItem } from '@/components/ui/message-scroller'
import type { AeSearchContext } from '@/modules/answer/search-context'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'
import type { StopAnswerTurnResult } from './turn-stop'
import { AeThreadTurnCollapsed } from './AeThreadTurnCollapsed'
import { AeThreadTurnReplaySection } from './AeThreadTurnReplaySection'
import { AeThreadTurnStreamSection, type TurnStreamOutcome } from './AeThreadTurnStreamSection'
import { toThreadViewModel } from './thread-turn-view'

export type AeThreadTranscriptProps = {
  threadId?: string | null
  projection: PublicThreadProjection | null
  liveTurn?: {
    query: string
    generation: number
    clientTurnKey: string
    searchContext: AeSearchContext
    intent: FollowUpIntent
    turnId?: string
    turnSeq?: number
  } | null
  turnRenderKeys?: Readonly<Record<string, string>>
  onThreadCreated?: (threadId: string, turnMeta?: { turnId: string; turnSeq: number }) => void
  onStreamEnd?: (outcome: TurnStreamOutcome) => void
  onSettledTurn?: (turn: PublicThreadTurn, generation: number) => void
  onLiveStopChange?: (stop: (() => Promise<void>) | null) => void
  onFollowUp?: (query: string) => void
  onRetry?: (query: string) => void
  onStopPendingTurn?: (threadId: string, turnId: string) => Promise<StopAnswerTurnResult>
}

type TurnStatusSnapshot = {
  turnId: string
  status: PublicThreadTurn['status']
}

export function AeThreadTranscript({
  threadId = null,
  projection,
  liveTurn = null,
  turnRenderKeys,
  onThreadCreated,
  onStreamEnd,
  onSettledTurn,
  onLiveStopChange,
  onFollowUp,
  onStopPendingTurn,
  onRetry,
}: AeThreadTranscriptProps) {
  const completedTurns = projection?.turns.filter((turn) => turn.status === 'complete') ?? []
  const displayedTurns = projection?.turns ?? []
  const resolvedThreadId = resolveThreadId(threadId, projection?.threadId).threadId
  const latestProjectedTurn = projection?.turns.at(-1)
  const previousTurnRef = useRef<TurnStatusSnapshot | null>(null)
  const liveGenerationRef = useRef<number | null>(null)
  const settledLiveTurnRef = useRef<TurnStatusSnapshot | null>(null)
  const announcedTerminalRef = useRef<string | null>(null)
  const onOperationSelect = onFollowUp === undefined
    ? undefined
    : (operationRef: string, input: Record<string, unknown>, candidateSetDigest: string) => {
        onFollowUp(JSON.stringify({ operationRef, input, candidateSetDigest }))
      }
  const latestStatusSnapshot = latestProjectedTurn === undefined
    ? null
    : { turnId: latestProjectedTurn.turnId, status: latestProjectedTurn.status }
  const latestTerminalKey = latestStatusSnapshot === null
    ? null
    : terminalAnnouncementKey(latestStatusSnapshot)
  const transitionedFromPending =
    latestStatusSnapshot !== null
    && previousTurnRef.current?.turnId === latestStatusSnapshot.turnId
    && previousTurnRef.current.status === 'pending'
    && latestStatusSnapshot.status !== 'pending'
  const transitionedFromLive =
    latestStatusSnapshot !== null
    && liveTurn === null
    && settledLiveTurnRef.current?.turnId === latestStatusSnapshot.turnId
    && settledLiveTurnRef.current.status === latestStatusSnapshot.status
    && latestStatusSnapshot.status !== 'pending'
  const terminalTransition =
    latestTerminalKey !== null
    && (transitionedFromPending || transitionedFromLive)
    && announcedTerminalRef.current !== latestTerminalKey
  const currentLiveStatus =
    liveTurn !== null && liveGenerationRef.current === liveTurn.generation
      ? settledLiveTurnRef.current?.status
      : undefined
  const currentLiveTerminalKey =
    liveTurn !== null && settledLiveTurnRef.current !== null && currentLiveStatus !== undefined
      ? terminalAnnouncementKey({ turnId: settledLiveTurnRef.current.turnId, status: currentLiveStatus })
      : null
  const statusAnnouncement =
    liveTurn !== null
      ? currentLiveStatus === 'error'
        ? null
        : terminalAnnouncementForStatus(currentLiveStatus) ?? (
          currentLiveStatus === 'pending'
            ? 'Answer is still pending.'
            : 'Working on your answer…'
        )
      : latestStatusSnapshot?.status === 'pending'
        ? 'Answer is still pending.'
        : terminalTransition && latestStatusSnapshot !== null
          ? terminalAnnouncementForStatus(latestStatusSnapshot.status)
          : null

  useEffect(() => {
    if (liveTurn !== null && liveGenerationRef.current !== liveTurn.generation) {
      liveGenerationRef.current = liveTurn.generation
      settledLiveTurnRef.current = null
    } else if (liveTurn === null && liveGenerationRef.current !== null) {
      liveGenerationRef.current = null
      settledLiveTurnRef.current = null
    }
    previousTurnRef.current = latestStatusSnapshot
    if (currentLiveTerminalKey !== null) {
      announcedTerminalRef.current = currentLiveTerminalKey
    }
    if (terminalTransition && latestTerminalKey !== null) {
      announcedTerminalRef.current = latestTerminalKey
    }
  }, [currentLiveTerminalKey, latestStatusSnapshot?.status, latestStatusSnapshot?.turnId, latestTerminalKey, liveTurn, terminalTransition])

  function handleSettledTurn(turn: PublicThreadTurn, generation: number): void {
    settledLiveTurnRef.current = { turnId: turn.turnId, status: turn.status }
    onSettledTurn?.(turn, generation)
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {statusAnnouncement ?? ''}
      </p>
      {displayedTurns.map((turn, index) => {
        const isLastSettled = index === displayedTurns.length - 1
        const expanded = isLastSettled
        const viewModel = toThreadViewModel(turn)
        const turnKey = turnRenderKeys?.[turn.turnId] ?? turn.turnId

        const anchorThisTurn = liveTurn === null && isLastSettled
        const canSelectOperations = liveTurn === null && isLastSettled

        return (
          <MessageScrollerItem
            key={turnKey}
            messageId={turn.turnId}
            scrollAnchor={anchorThisTurn}
            data-message-id={turn.turnId}
            {...(anchorThisTurn ? { 'data-scroll-anchor': 'true' } : {})}
          >
            <div className="flex flex-col gap-2">
              {expanded ? (
                <AeThreadTurnReplaySection
                  {...viewModel}
                  scrollTargetId={turn.turnId}
                  {...(resolvedThreadId === undefined ? {} : { threadId: resolvedThreadId })}
                  {...(turn.status === 'error' && onRetry !== undefined ? { onRetry: () => onRetry(turn.query) } : {})}
                  {...(onStopPendingTurn === undefined || resolvedThreadId === undefined || turn.status !== 'pending'
                    ? {}
                    : { onStopPending: () => onStopPendingTurn(resolvedThreadId, turn.turnId) })}
                  {...(onOperationSelect === undefined || !canSelectOperations ? {} : { onOperationSelect })}
                />
              ) : (
                <AeThreadTurnCollapsed
                  {...viewModel}
                  {...(resolvedThreadId === undefined ? {} : { threadId: resolvedThreadId })}
                  {...(onStopPendingTurn === undefined || resolvedThreadId === undefined || turn.status !== 'pending'
                    ? {}
                    : { onStopPending: () => onStopPendingTurn(resolvedThreadId, turn.turnId) })}
                  {...(onOperationSelect === undefined || !canSelectOperations ? {} : { onOperationSelect })}
                />
              )}
            </div>
          </MessageScrollerItem>
        )
      })}

      {liveTurn !== null ? (
        <MessageScrollerItem
          key={`live-${liveTurn.generation}`}
          messageId={`live-${liveTurn.generation}`}
          scrollAnchor
          data-message-id={`live-${liveTurn.generation}`}
          data-scroll-anchor="true"
        >
          <div className="flex flex-col gap-2">
            <AeThreadTurnStreamSection
              query={liveTurn.query}
              searchContext={liveTurn.searchContext}
              generation={liveTurn.generation}
              clientTurnKey={liveTurn.clientTurnKey}
              seq={liveTurn.turnSeq ?? (latestProjectedTurn?.seq ?? completedTurns.length) + 1}
              intent={liveTurn.intent}
              {...(resolvedThreadId === undefined ? {} : { threadId: resolvedThreadId })}
              {...(onThreadCreated === undefined ? {} : { onThreadCreated })}
              {...(onStreamEnd === undefined ? {} : { onStreamEnd })}
              {...(onLiveStopChange === undefined ? {} : { onStopChange: onLiveStopChange })}
              onSettledTurn={handleSettledTurn}
              {...(onRetry === undefined ? {} : { onRetry: () => onRetry(liveTurn.query) })}
              {...(onOperationSelect === undefined ? {} : { onOperationSelect })}
            />
          </div>
        </MessageScrollerItem>
      ) : null}
    </>
  )
}

function terminalAnnouncementKey(snapshot: TurnStatusSnapshot): string | null {
  return terminalAnnouncementForStatus(snapshot.status) === null
    ? null
    : `${snapshot.turnId}:${snapshot.status}`
}

function terminalAnnouncementForStatus(status: PublicThreadTurn['status'] | undefined): string | null {
  switch (status) {
    case 'complete':
      return 'Answer ready.'
    case 'stopped':
      return 'Answer stopped.'
    default:
      return null
  }
}
export type { PublicThreadTurn }

function resolveThreadId(
  routeThreadId: string | null | undefined,
  projectionThreadId: string | undefined,
): { threadId?: string } {
  const id = routeThreadId ?? projectionThreadId
  return id === undefined || id.length === 0 ? {} : { threadId: id }
}

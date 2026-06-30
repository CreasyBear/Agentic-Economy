import { MessageScrollerItem } from '@/components/ui/message-scroller'
import type { PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'
import { AeThreadTurnCollapsed } from './AeThreadTurnCollapsed'
import { AeThreadTurnReplaySection } from './AeThreadTurnReplaySection'
import { AeThreadTurnStreamSection } from './AeThreadTurnStreamSection'
import { AeFollowUpChips } from './AeSuggestionChips'
import { toThreadViewModel } from './thread-turn-view'

export type AeThreadTranscriptProps = {
  threadId?: string | null
  projection: PublicThreadProjection | null
  liveTurn?: {
    query: string
    generation: number
  } | null
  onThreadCreated?: (threadId: string) => void
  onStreamEnd?: (outcome: 'complete' | 'error' | 'stopped' | 'rate_limited') => void
  onFollowUp?: (query: string) => void
  onRetry?: (query: string) => void
}

export function AeThreadTranscript({
  threadId = null,
  projection,
  liveTurn = null,
  onThreadCreated,
  onStreamEnd,
  onFollowUp,
  onRetry,
}: AeThreadTranscriptProps) {
  const completedTurns = projection?.turns.filter((turn) => turn.status === 'complete') ?? []

  return (
    <>
      {completedTurns.map((turn, index) => {
        const isLastCompleted = index === completedTurns.length - 1
        const expanded = isLastCompleted && liveTurn === null
        const viewModel = toThreadViewModel(turn)

        const anchorThisTurn = liveTurn === null && isLastCompleted

        return (
          <MessageScrollerItem
            key={turn.turnId}
            messageId={turn.turnId}
            scrollAnchor={anchorThisTurn}
          >
            <div className="ae-thread-transcript__turn">
              {expanded ? (
                <AeThreadTurnReplaySection {...viewModel} />
              ) : (
                <AeThreadTurnCollapsed {...viewModel} />
              )}
              {isLastCompleted && liveTurn === null ? (
                <AeFollowUpChips turn={turn} {...(onFollowUp === undefined ? {} : { onSelect: onFollowUp })} />
              ) : null}
            </div>
          </MessageScrollerItem>
        )
      })}

      {liveTurn !== null ? (
        <MessageScrollerItem
          key={`live-${liveTurn.generation}`}
          messageId={`live-${liveTurn.generation}`}
          scrollAnchor
        >
          <div className="ae-thread-transcript__turn">
            <AeThreadTurnStreamSection
              query={liveTurn.query}
              generation={liveTurn.generation}
              seq={completedTurns.length + 1}
              intent="refine_search"
              {...resolveThreadId(threadId, projection?.threadId)}
              {...(onThreadCreated === undefined ? {} : { onThreadCreated })}
              {...(onStreamEnd === undefined ? {} : { onStreamEnd })}
              {...(onRetry === undefined ? {} : { onRetry: () => onRetry(liveTurn.query) })}
            />
          </div>
        </MessageScrollerItem>
      ) : null}
    </>
  )
}

export type { PublicThreadTurn }

function resolveThreadId(
  routeThreadId: string | null | undefined,
  projectionThreadId: string | undefined,
): { threadId?: string } {
  const id = routeThreadId ?? projectionThreadId
  return id === undefined || id.length === 0 ? {} : { threadId: id }
}

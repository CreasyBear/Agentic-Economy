import { MessageScrollerItem } from './AeThreadMessageScroller'
import type { AeSearchContext } from '@/modules/answer/search-context'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'
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
    searchContext: AeSearchContext
    intent: FollowUpIntent
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
  const resolvedThreadId = resolveThreadId(threadId, projection?.threadId).threadId
  const followUpContextTurn = buildFollowUpContextTurn(completedTurns)

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
            <div className="flex flex-col gap-2">
              {expanded ? (
                <AeThreadTurnReplaySection
                  {...viewModel}
                  scrollTargetId={turn.turnId}
                  {...(resolvedThreadId === undefined ? {} : { threadId: resolvedThreadId })}
                />
              ) : (
                <AeThreadTurnCollapsed {...viewModel} {...(resolvedThreadId === undefined ? {} : { threadId: resolvedThreadId })} />
              )}
              {isLastCompleted && liveTurn === null ? (
                <AeFollowUpChips turn={followUpContextTurn ?? turn} {...(onFollowUp === undefined ? {} : { onSelect: onFollowUp })} />
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
          <div className="flex flex-col gap-2">
            <AeThreadTurnStreamSection
              query={liveTurn.query}
              searchContext={liveTurn.searchContext}
              generation={liveTurn.generation}
              seq={completedTurns.length + 1}
              intent={liveTurn.intent}
              {...(resolvedThreadId === undefined ? {} : { threadId: resolvedThreadId })}
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

function buildFollowUpContextTurn(turns: readonly PublicThreadTurn[]): PublicThreadTurn | undefined {
  const latest = turns.at(-1)
  if (latest === undefined || hasProviderContext(latest)) {
    return latest
  }

  const providerContextTurn = turns
    .slice(0, -1)
    .reverse()
    .find(hasProviderContext)
  if (providerContextTurn === undefined) {
    return latest
  }

  return {
    ...latest,
    artifacts: [
      ...latest.artifacts,
      ...providerContextTurn.artifacts.filter(isProviderContextArtifact),
    ],
  }
}

function hasProviderContext(turn: PublicThreadTurn): boolean {
  return turn.artifacts.some(isProviderContextArtifact)
}

function isProviderContextArtifact(artifact: PublicThreadTurn['artifacts'][number]): boolean {
  switch (artifact.kind) {
    case 'selected-provider':
      return true
    case 'provider-cards':
    case 'provider-compare-table':
      return artifact.providers.length > 0
    default:
      return false
  }
}

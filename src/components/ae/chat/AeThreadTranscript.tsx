import { MessageScrollerItem } from './AeThreadMessageScroller'
import type { AeSearchContext } from '@/modules/answer/search-context'
import type { FollowUpIntent, PublicThreadProjection, PublicThreadTurn } from '@/modules/answer-thread/public'
import { AeThreadTurnCollapsed } from './AeThreadTurnCollapsed'
import { AeThreadTurnReplaySection } from './AeThreadTurnReplaySection'
import { AeThreadTurnStreamSection } from './AeThreadTurnStreamSection'
import { AeFollowUpChips } from './AeSuggestionChips'
import { toThreadViewModel } from './thread-turn-view'
import { AeShortlistTerminal, settledShortlistFromArtifacts } from './AeShortlistTerminal'

export type AeThreadTranscriptProps = {
  threadId?: string | null
  projection: PublicThreadProjection | null
  liveTurn?: {
    query: string
    generation: number
    searchContext: AeSearchContext
    intent: FollowUpIntent
    turnId?: string
    turnSeq?: number
  } | null
  turnRenderKeys?: Readonly<Record<string, string>>
  onThreadCreated?: (threadId: string, turnMeta?: { turnId: string; turnSeq: number }) => void
  onStreamEnd?: (outcome: 'complete' | 'error' | 'stopped' | 'rate_limited') => void
  onSettledTurn?: (turn: PublicThreadTurn, generation: number) => void
  onFollowUp?: (query: string) => void
  onRetry?: (query: string) => void
}

export function AeThreadTranscript({
  threadId = null,
  projection,
  liveTurn = null,
  turnRenderKeys,
  onThreadCreated,
  onStreamEnd,
  onSettledTurn,
  onFollowUp,
  onRetry,
}: AeThreadTranscriptProps) {
  const completedTurns = projection?.turns.filter((turn) => turn.status === 'complete') ?? []
  const resolvedThreadId = resolveThreadId(threadId, projection?.threadId).threadId
  const followUpContext = buildFollowUpContext(completedTurns)
  const latestProjectedTurn = projection?.turns.at(-1)
  const terminal = latestProjectedTurn?.status === 'complete'
    ? settledShortlistFromArtifacts(latestProjectedTurn.artifacts, latestProjectedTurn.timing)
    : null

  return (
    <>
      {completedTurns.map((turn, index) => {
        const isLastCompleted = index === completedTurns.length - 1
        const expanded = isLastCompleted
        const viewModel = toThreadViewModel(turn)
        const turnKey = turnRenderKeys?.[turn.turnId] ?? turn.turnId

        const anchorThisTurn = liveTurn === null && isLastCompleted

        return (
          <MessageScrollerItem
            key={turnKey}
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
              {isLastCompleted && turn.turnId === latestProjectedTurn?.turnId && liveTurn === null && terminal !== null ? (
                <AeShortlistTerminal
                  {...terminal}
                  threadId={resolvedThreadId ?? projection?.threadId ?? 'shortlist'}
                  revision={`${latestProjectedTurn.turnId}:${latestProjectedTurn.seq}`}
                  {...(latestProjectedTurn.createdAt === undefined ? {} : { sourceAt: new Date(latestProjectedTurn.createdAt).toISOString() })}
                  {...(onFollowUp === undefined ? {} : { onChangeCriteria: () => onFollowUp('Change my shortlist criteria') })}
                />
              ) : isLastCompleted && liveTurn === null ? (
                <AeFollowUpChips
                  turn={followUpContext?.turn ?? turn}
                  contextPlacement={followUpContext?.contextPlacement ?? 'current'}
                  {...(onFollowUp === undefined ? {} : { onSelect: onFollowUp })}
                />
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
              seq={liveTurn.turnSeq ?? completedTurns.length + 1}
              intent={liveTurn.intent}
              {...(resolvedThreadId === undefined ? {} : { threadId: resolvedThreadId })}
              {...(onThreadCreated === undefined ? {} : { onThreadCreated })}
              {...(onStreamEnd === undefined ? {} : { onStreamEnd })}
              {...(onSettledTurn === undefined ? {} : { onSettledTurn })}
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

type FollowUpContext = {
  turn: PublicThreadTurn
  contextPlacement: 'current' | 'carried'
}

function buildFollowUpContext(turns: readonly PublicThreadTurn[]): FollowUpContext | undefined {
  const latest = turns.at(-1)
  if (latest === undefined || hasProviderContext(latest)) {
    return latest === undefined ? undefined : { turn: latest, contextPlacement: 'current' }
  }

  const providerContextTurn = turns
    .slice(0, -1)
    .reverse()
    .find(hasProviderContext)
  if (providerContextTurn === undefined) {
    return { turn: latest, contextPlacement: 'current' }
  }

  return {
    turn: {
      ...latest,
      artifacts: [
        ...latest.artifacts,
        ...providerContextTurn.artifacts.filter(isProviderContextArtifact),
      ],
    },
    contextPlacement: 'carried',
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

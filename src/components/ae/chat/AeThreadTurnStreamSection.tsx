import { Link } from '@tanstack/react-router'
import type { AeSearchContext } from '@/modules/answer/search-context'
import type { FollowUpIntent, PublicThreadTurn } from '@/modules/answer-thread/public'
import { Button } from '@/components/ui/button'
import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent } from '@/components/ui/message'
import { AeThreadTurnQueryHeader } from './AeThreadTurnQueryHeader'
import { AeTurnContextLine } from './AeTurnContextLine'
import { orderShortlistArtifacts } from './shortlist-projection'
import { useAnswerTurnLifecycle } from './use-answer-turn-lifecycle'
import type { AnswerTurnUiState } from './answer-turn-state'

const STREAM_ERROR_COPY = "The answer couldn't be put together right now. Try again or see other options."
const PENDING_COPY = 'This answer is still pending. Reload this thread to check its durable status.'
const STOPPED_COPY = 'Answer stopped.'

export type TurnStreamOutcome = 'complete' | 'pending' | 'error' | 'stopped'

export type AeThreadTurnStreamSectionProps = {
  query: string
  searchContext?: AeSearchContext
  intent?: FollowUpIntent
  seq?: number
  threadId?: string
  clientTurnKey: string
  generation: number
  onThreadCreated?: (threadId: string, turnMeta?: { turnId: string; turnSeq: number }) => void
  onSettledTurn?: (turn: PublicThreadTurn, generation: number) => void
  onStreamEnd?: (outcome: TurnStreamOutcome) => void
  onOperationSelect?: (operationRef: string, input: Record<string, unknown>, candidateSetDigest: string) => void
  onRetry?: () => void
}

export function AeThreadTurnStreamSection({
  query,
  searchContext,
  intent = 'refine_search',
  seq = 1,
  threadId,
  clientTurnKey,
  generation,
  onThreadCreated,
  onStreamEnd,
  onSettledTurn,
  onOperationSelect,
  onRetry,
}: AeThreadTurnStreamSectionProps) {
  const { state, stop } = useAnswerTurnLifecycle({
    query,
    ...(searchContext === undefined ? {} : { searchContext }),
    ...(threadId === undefined ? {} : { threadId }),
    clientTurnKey,
    generation,
    ...(onThreadCreated === undefined ? {} : { onThreadCreated }),
    ...(onSettledTurn === undefined ? {} : { onSettledTurn }),
    ...(onStreamEnd === undefined ? {} : { onStreamEnd }),
  })

  const busy = state.phase === 'streaming' || state.phase === 'settling' || state.phase === 'pending'
  const canSelectOperations = state.phase === 'complete' && state.readbackState === 'ok'
  const presenterPhase = state.phase === 'settling' || state.phase === 'pending' ? 'streaming' : state.phase
  const turnThreadId = state.threadMeta?.threadId ?? threadId
  const errorMessage = buildErrorMessage(state)

  return (
    <div className="flex flex-col gap-2" data-lifecycle={state.phase}>
      <AeThreadTurnQueryHeader query={query} intent={intent} seq={seq} />
      <Message align="start">
        <MessageContent>
          <Bubble align="start" variant="ghost" className="w-full">
            <BubbleContent className="flex w-full flex-col gap-2">
              <AeTurnContextLine intent={intent} seq={seq} artifacts={state.artifacts} />
              {state.phase === 'settling' ? <p className="text-sm text-muted-foreground">Confirming the saved answer…</p> : null}
              {state.phase === 'pending' ? <p className="text-sm text-muted-foreground">{PENDING_COPY}</p> : null}
              {state.phase === 'stopped' ? <p className="text-sm text-muted-foreground">{STOPPED_COPY}</p> : null}
              {state.stopState === 'requested' ? <p className="text-sm text-muted-foreground">Stopping…</p> : null}
              {state.stopState === 'failed' ? <p className="text-sm text-red-vivid" role="alert">Stop was not confirmed. The answer is still running; try Stop again.</p> : null}
              <AeGenerativeAnswer
                artifacts={orderShortlistArtifacts(state.artifacts, searchContext?.timing)}
                query={query}
                {...(state.layoutProfile === undefined ? {} : { layoutProfile: state.layoutProfile })}
                busy={busy}
                oneLineFallback={state.oneLineFallback}
                {...(busy && state.stopState !== 'requested' && state.threadMeta !== null ? { onStop: () => void stop() } : {})}
                phase={presenterPhase}
                workSteps={state.workLog}
                thinkingSteps={state.thinkingSteps}
                thinkingLabel={state.thinkingLabel}
                {...(state.thinkingStep === undefined ? {} : { thinkingStep: state.thinkingStep })}
                {...(turnThreadId === undefined ? {} : { threadId: turnThreadId })}
                {...(onOperationSelect === undefined || !canSelectOperations ? {} : { onOperationSelect })}
                errorMessage={state.phase === 'error' ? (
                  <>
                    {errorMessage} {' '}
                    {onRetry !== undefined ? (
                      <Button
                        type="button"
                        variant="link"
                        className="inline h-auto cursor-pointer p-0 font-semibold text-foreground underline underline-offset-4 hover:text-foreground"
                        onClick={onRetry}
                      >
                        Try again
                      </Button>
                    ) : null}{' '}
                    <Link to="/" className="text-foreground underline underline-offset-4">
                      Start a new ask
                    </Link>
                  </>
                ) : null}
              />
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </div>
  )
}

function buildErrorMessage(state: AnswerTurnUiState): string {
  if (state.readbackState === 'not_found') {
    return 'This answer is no longer available. Start a new ask.'
  }
  if (state.problem !== null) {
    return state.problem.detail ?? state.problem.title
  }
  if (state.transportError !== null) {
    return state.transportError.detail
  }
  if (state.stopFailure !== null) {
    return state.stopFailure.kind === 'protocol' || state.stopFailure.kind === 'network'
      ? state.stopFailure.detail
      : 'The stop request was not accepted.'
  }
  return STREAM_ERROR_COPY
}


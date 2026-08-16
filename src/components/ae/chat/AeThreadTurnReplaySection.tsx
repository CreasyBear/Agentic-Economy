import { useState } from 'react'
import { Link } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent } from '@/components/ui/message'
import type { StopAnswerTurnResult } from './turn-stop'
import { AeThreadTurnQueryHeader } from './AeThreadTurnQueryHeader'
import { AeTurnContextLine } from './AeTurnContextLine'
import {
  presenterPhaseForTurnStatus,
  turnProblemCopy,
  turnStatusCopy,
  type ThreadTurnViewModel,
} from './thread-turn-view'

export type AeThreadTurnReplaySectionProps = ThreadTurnViewModel & {
  scrollTargetId?: string
  threadId?: string
  onRetry?: () => void
  onOperationSelect?: (operationRef: string, input: Record<string, unknown>, candidateSetDigest: string) => void
  onStopPending?: () => Promise<StopAnswerTurnResult>
}

export function AeThreadTurnReplaySection({
  scrollTargetId,
  threadId,
  onRetry,
  onOperationSelect,
  onStopPending,
  ...turn
}: AeThreadTurnReplaySectionProps) {
  const [stopState, setStopState] = useState<'idle' | 'requested' | 'failed'>('idle')
  const canStop = turn.status === 'pending' && onStopPending !== undefined
  const presenterPhase = presenterPhaseForTurnStatus(turn.status)
  const statusCopy = turnStatusCopy(turn.status)
  const problemCopy = turnProblemCopy(turn.problem)

  async function requestStop(): Promise<void> {
    if (onStopPending === undefined || turn.status !== 'pending' || stopState === 'requested') {
      return
    }
    setStopState('requested')
    const result = await onStopPending()
    setStopState(result.kind === 'stopped' || result.kind === 'already_settled' ? 'idle' : 'failed')
  }

  const fallback = (
    <AeGenerativeAnswer
      artifacts={turn.artifacts}
      query={turn.query}
      oneLineFallback={turn.oneLine}
      busy={turn.status === 'pending'}
      phase={presenterPhase}
      workSteps={turn.workLog}
      errorMessage={turn.status === 'error' ? (
        <>
          {problemCopy === null ? null : <p>{problemCopy}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            {onRetry === undefined ? null : (
              <Button type="button" size="sm" onClick={onRetry}>
                Try again
              </Button>
            )}
            <Button asChild size="sm" variant="ghost">
              <Link to="/">New chat</Link>
            </Button>
          </div>
        </>
      ) : turn.status === 'stopped' ? statusCopy : null}
      {...(canStop && stopState !== 'requested' ? { onStop: () => void requestStop() } : {})}
      {...(turn.answerCheckSummary === undefined ? {} : { checkSummary: turn.answerCheckSummary })}
      {...(turn.layoutProfile === undefined ? {} : { layoutProfile: turn.layoutProfile })}
      {...(threadId === undefined ? {} : { threadId })}
      {...(onOperationSelect === undefined ? {} : { onOperationSelect })}
    />
  )
  return (
    <div className="flex flex-col gap-2" data-turn-status={turn.status}>
      <AeThreadTurnQueryHeader query={turn.query} intent={turn.intent} seq={turn.seq} />
      <Message
        align="start"
        {...(scrollTargetId === undefined ? {} : { 'data-ae-scroll-target': scrollTargetId })}
      >
        <MessageContent>
          <Bubble align="start" variant="ghost" className="w-full">
            <BubbleContent className="flex w-full flex-col gap-2">
              <AeTurnContextLine intent={turn.intent} seq={turn.seq} artifacts={turn.artifacts} />
              {statusCopy === null || turn.status === 'stopped' ? null : (
                <p className="text-sm text-muted-foreground">{statusCopy}</p>
              )}
              {turn.status === 'pending' && stopState === 'requested' ? <p className="text-sm text-muted-foreground">Stopping…</p> : null}
              {turn.status === 'pending' && stopState === 'failed' ? <p className="text-sm text-destructive" role="alert">Stop was not confirmed. The response is still pending; try Stop again.</p> : null}
              {fallback}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </div>
  )
}

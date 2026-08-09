import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { neutralizeBidiFormattingControls } from '@/modules/answer/public'
import { formatTurnQueryLabel } from '@/modules/answer-thread/public'
import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import { Message, MessageContent } from '@/components/ai-elements/message'
import type { StopAnswerTurnResult } from './turn-stop'
import { AeThreadTurnQueryHeader } from './AeThreadTurnQueryHeader'
import { AeTurnContextLine } from './AeTurnContextLine'
import {
  ANSWER_SECTION_CLASS,
  presenterPhaseForTurnStatus,
  turnStatusCopy,
  type ThreadTurnViewModel,
} from './thread-turn-view'

export type AeThreadTurnCollapsedProps = ThreadTurnViewModel & {
  threadId?: string
  onStopPending?: () => Promise<StopAnswerTurnResult>
}

export function AeThreadTurnCollapsed({ threadId, onStopPending, ...turn }: AeThreadTurnCollapsedProps) {
  const [stopState, setStopState] = useState<'idle' | 'requested' | 'failed'>('idle')
  const label = formatTurnQueryLabel({ query: turn.query, intent: turn.intent, seq: turn.seq })
  const oneLine = neutralizeBidiFormattingControls(turn.oneLine)
  const canStop = turn.status === 'pending' && onStopPending !== undefined
  const presenterPhase = presenterPhaseForTurnStatus(turn.status)
  const statusCopy = turnStatusCopy(turn.status)

  async function requestStop(): Promise<void> {
    if (onStopPending === undefined || turn.status !== 'pending' || stopState === 'requested') {
      return
    }
    setStopState('requested')
    const result = await onStopPending()
    setStopState(result.kind === 'stopped' || result.kind === 'already_settled' ? 'idle' : 'failed')
  }

  return (
    <Collapsible className="flex flex-col gap-2" data-turn-status={turn.status}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-4 py-3 text-left font-normal whitespace-normal transition-colors hover:border-border-strong hover:bg-transparent dark:hover:bg-transparent data-[state=open]:hidden"
        >
          <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="col-start-1 font-heading text-sm font-semibold text-foreground">{label.text}</span>
          <span dir="auto" style={{ unicodeBidi: 'isolate' }} className="col-start-1 truncate text-sm text-muted-foreground">{oneLine}</span>
          {statusCopy === null ? null : <span className="col-start-1 text-xs text-muted-foreground">{statusCopy}</span>}
          <span className={`col-start-2 ${statusCopy === null ? 'row-span-2' : 'row-span-3'} self-center font-mono text-xs uppercase tracking-wider text-muted-foreground`}>Expand</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2">
          <AeThreadTurnQueryHeader
            query={turn.query}
            intent={turn.intent}
            seq={turn.seq}
            actions={
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" size="sm">
                  Collapse
                </Button>
              </CollapsibleTrigger>
            }
          />
          <Message from="assistant" className={ANSWER_SECTION_CLASS}>
            <MessageContent className="w-full">
              <AeTurnContextLine intent={turn.intent} seq={turn.seq} artifacts={turn.artifacts} />
              {statusCopy === null || turn.status === 'stopped' ? null : (
                <p className="text-sm text-muted-foreground">{statusCopy}</p>
              )}
              {turn.status === 'pending' && stopState === 'requested' ? <p className="text-sm text-muted-foreground">Stopping…</p> : null}
              {turn.status === 'pending' && stopState === 'failed' ? <p className="text-sm text-red-vivid" role="alert">Stop was not confirmed. The answer is still pending; try Stop again.</p> : null}
              <AeGenerativeAnswer
                artifacts={turn.artifacts}
                query={turn.query}
                oneLineFallback={turn.oneLine}
                busy={turn.status === 'pending'}
                phase={presenterPhase}
                workSteps={turn.workLog}
                errorMessage={turn.status === 'error'
                  ? (turn.problem?.detail ?? 'This answer could not be completed.')
                  : turn.status === 'stopped' ? statusCopy : null}
                {...(canStop && stopState !== 'requested' ? { onStop: () => void requestStop() } : {})}
                {...(turn.answerCheckSummary === undefined ? {} : { checkSummary: turn.answerCheckSummary })}
                {...(turn.layoutProfile === undefined ? {} : { layoutProfile: turn.layoutProfile })}
                {...(threadId === undefined ? {} : { threadId })}
              />
            </MessageContent>
          </Message>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { formatTurnQueryLabel } from '@/modules/answer-thread/public'
import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { AeAnswerThinkingTrace } from './AeAnswerThinkingTrace'
import { AeThreadTurnQueryHeader } from './AeThreadTurnQueryHeader'
import { AeTurnContextLine } from './AeTurnContextLine'
import { ANSWER_SECTION_CLASS, type ThreadTurnViewModel } from './thread-turn-view'

export type AeThreadTurnCollapsedProps = ThreadTurnViewModel & {
  threadId?: string
}

export function AeThreadTurnCollapsed({ threadId, ...turn }: AeThreadTurnCollapsedProps) {
  const [expanded, setExpanded] = useState(false)
  const label = formatTurnQueryLabel({ query: turn.query, intent: turn.intent, seq: turn.seq })

  if (expanded) {
    return (
      <div className="flex flex-col gap-2">
        <AeThreadTurnQueryHeader
          query={turn.query}
          intent={turn.intent}
          seq={turn.seq}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(false)}
            >
              Collapse
            </Button>
          }
        />
        <Message from="assistant" className={ANSWER_SECTION_CLASS}>
          <MessageContent className="w-full">
            <AeTurnContextLine intent={turn.intent} seq={turn.seq} artifacts={turn.artifacts} />
            <AeAnswerThinkingTrace
              isStreaming={false}
              label="Ready"
              steps={[]}
              workLog={turn.workLog}
              checkSummary={turn.answerCheckSummary}
              query={turn.query}
            />
            <AeGenerativeAnswer
              artifacts={turn.artifacts}
              query={turn.query}
              oneLineFallback={turn.oneLine}
              phase="complete"
              {...(turn.layoutProfile === undefined ? {} : { layoutProfile: turn.layoutProfile })}
              {...(threadId === undefined ? {} : { threadId })}
            />
          </MessageContent>
        </Message>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:border-border-strong"
        onClick={() => setExpanded(true)}
      >
        <span className="col-start-1 font-heading text-sm font-semibold text-foreground">{label.text}</span>
        <span className="col-start-1 truncate text-sm text-muted-foreground">{turn.oneLine}</span>
        <span className="col-start-2 row-span-2 self-center font-mono text-xs uppercase tracking-wider text-muted-foreground">Expand</span>
      </button>
    </div>
  )
}

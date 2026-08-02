import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
  const label = formatTurnQueryLabel({ query: turn.query, intent: turn.intent, seq: turn.seq })

  return (
    <Collapsible className="flex flex-col gap-2">
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="grid h-auto w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-4 py-3 text-left font-normal whitespace-normal transition-colors hover:border-border-strong hover:bg-transparent dark:hover:bg-transparent data-[state=open]:hidden"
        >
          <span className="col-start-1 font-heading text-sm font-semibold text-foreground">{label.text}</span>
          <span className="col-start-1 truncate text-sm text-muted-foreground">{turn.oneLine}</span>
          <span className="col-start-2 row-span-2 self-center font-mono text-xs uppercase tracking-wider text-muted-foreground">Expand</span>
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
      </CollapsibleContent>
    </Collapsible>
  )
}

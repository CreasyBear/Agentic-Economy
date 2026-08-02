import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { AeAnswerThinkingTrace } from './AeAnswerThinkingTrace'
import { AeThreadTurnQueryHeader } from './AeThreadTurnQueryHeader'
import { AeTurnContextLine } from './AeTurnContextLine'
import { ANSWER_SECTION_CLASS, type ThreadTurnViewModel } from './thread-turn-view'

export type AeThreadTurnReplaySectionProps = ThreadTurnViewModel & {
  scrollTargetId?: string
  threadId?: string
}

export function AeThreadTurnReplaySection({ scrollTargetId, threadId, ...turn }: AeThreadTurnReplaySectionProps) {
  const fallback = (
    <AeGenerativeAnswer
      artifacts={turn.artifacts}
      query={turn.query}
      oneLineFallback={turn.oneLine}
      phase="complete"
      {...(turn.layoutProfile === undefined ? {} : { layoutProfile: turn.layoutProfile })}
      {...(threadId === undefined ? {} : { threadId })}
    />
  )
  return (
    <div className="flex flex-col gap-2">
      <AeThreadTurnQueryHeader query={turn.query} intent={turn.intent} seq={turn.seq} />
      <Message
        from="assistant"
        className={ANSWER_SECTION_CLASS}
        {...(scrollTargetId === undefined ? {} : { 'data-ae-scroll-target': scrollTargetId })}
      >
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
          {fallback}
        </MessageContent>
      </Message>
    </div>
  )
}

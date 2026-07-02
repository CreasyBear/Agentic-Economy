import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import { Message, MessageContent } from '@/components/ai-elements/message'
import { AeAnswerChecks } from './AeAnswerChecks'
import { AeAnswerThinkingTrace } from './AeAnswerThinkingTrace'
import { AeThreadTurnQueryHeader } from './AeThreadTurnQueryHeader'
import type { ThreadTurnViewModel } from './thread-turn-view'

export type AeThreadTurnReplaySectionProps = ThreadTurnViewModel & {
  scrollTargetId?: string
}

export function AeThreadTurnReplaySection({ scrollTargetId, ...turn }: AeThreadTurnReplaySectionProps) {
  return (
    <div className="ae-chat-section">
      <AeThreadTurnQueryHeader query={turn.query} intent={turn.intent} seq={turn.seq} />
      <Message
        from="assistant"
        className="ae-chat-section__answer"
        {...(scrollTargetId === undefined ? {} : { 'data-ae-scroll-target': scrollTargetId })}
      >
        <MessageContent className="ae-chat-section__answer-content">
          <AeAnswerThinkingTrace
            isStreaming={false}
            label="Ready"
            steps={[]}
            workLog={turn.workLog}
          />
          <AeAnswerChecks summary={turn.answerCheckSummary} />
          <AeGenerativeAnswer
            artifacts={turn.artifacts}
            query={turn.query}
            oneLineFallback={turn.oneLine}
            phase="complete"
            {...(turn.layoutProfile === undefined ? {} : { layoutProfile: turn.layoutProfile })}
          />
        </MessageContent>
      </Message>
    </div>
  )
}

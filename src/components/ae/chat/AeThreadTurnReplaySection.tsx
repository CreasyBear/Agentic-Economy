import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import { AeThreadTurnQueryHeader } from './AeThreadTurnQueryHeader'
import type { ThreadTurnViewModel } from './thread-turn-view'

export type AeThreadTurnReplaySectionProps = ThreadTurnViewModel

export function AeThreadTurnReplaySection(turn: AeThreadTurnReplaySectionProps) {
  return (
    <div className="ae-chat-section">
      <AeThreadTurnQueryHeader query={turn.query} intent={turn.intent} seq={turn.seq} />
      <div className="ae-chat-section__answer">
        <AeGenerativeAnswer
          artifacts={turn.artifacts}
          query={turn.query}
          oneLineFallback={turn.oneLine}
          phase="complete"
          {...(turn.layoutProfile === undefined ? {} : { layoutProfile: turn.layoutProfile })}
        />
      </div>
    </div>
  )
}

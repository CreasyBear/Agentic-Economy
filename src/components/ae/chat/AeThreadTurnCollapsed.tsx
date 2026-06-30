import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { formatTurnQueryLabel } from '@/modules/answer-thread/public'
import { AeGenerativeAnswer } from '@/components/ae/artifacts/AeGenerativeAnswer'
import { AeThreadTurnQueryHeader } from './AeThreadTurnQueryHeader'
import type { ThreadTurnViewModel } from './thread-turn-view'

export type AeThreadTurnCollapsedProps = ThreadTurnViewModel

export function AeThreadTurnCollapsed(turn: AeThreadTurnCollapsedProps) {
  const [expanded, setExpanded] = useState(false)
  const label = formatTurnQueryLabel({ query: turn.query, intent: turn.intent, seq: turn.seq })

  if (expanded) {
    return (
      <div className="ae-chat-section ae-chat-section--expanded">
        <AeThreadTurnQueryHeader
          query={turn.query}
          intent={turn.intent}
          seq={turn.seq}
          actions={
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="ae-chat-section__collapse"
              onClick={() => setExpanded(false)}
            >
              Collapse
            </Button>
          }
        />
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

  return (
    <div className="ae-chat-section ae-chat-section--collapsed">
      <button type="button" className="ae-chat-section__collapsed-trigger" onClick={() => setExpanded(true)}>
        <span className={`ae-chat-section__query-text ae-chat-section__query-text--${label.role}`}>{label.text}</span>
        <span className="ae-chat-section__collapsed-one-line">{turn.oneLine}</span>
        <span className="ae-chat-section__collapsed-expand">Expand</span>
      </button>
    </div>
  )
}

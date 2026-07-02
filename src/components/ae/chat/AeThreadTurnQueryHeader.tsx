import type { ReactNode } from 'react'

import { Message, MessageContent } from '@/components/ai-elements/message'
import type { FollowUpIntent } from '@/modules/answer-thread/public'
import { formatTurnQueryLabel } from '@/modules/answer-thread/public'

export type AeThreadTurnQueryHeaderProps = {
  query: string
  intent: FollowUpIntent
  seq: number
  actions?: ReactNode
}

export function AeThreadTurnQueryHeader({ query, intent, seq, actions }: AeThreadTurnQueryHeaderProps) {
  const label = formatTurnQueryLabel({ query, intent, seq })

  return (
    <header className={`ae-chat-section__query ae-chat-section__query--${label.role}`}>
      <Message from="user" className="ae-chat-section__query-message">
        <MessageContent className="ae-chat-section__query-bubble">
          <p className="ae-chat-section__query-text">{label.text}</p>
          {actions}
        </MessageContent>
      </Message>
    </header>
  )
}

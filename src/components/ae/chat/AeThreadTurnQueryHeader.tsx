import type { ReactNode } from 'react'

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
      <p className="ae-chat-section__query-text">{label.text}</p>
      {actions}
    </header>
  )
}

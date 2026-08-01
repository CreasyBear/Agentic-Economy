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
    <header className="flex justify-end">
      <Message from="user" className="max-w-[min(36rem,92%)]">
        <MessageContent>
          <p className="font-heading text-base font-semibold text-foreground">{label.text}</p>
          {actions}
        </MessageContent>
      </Message>
    </header>
  )
}

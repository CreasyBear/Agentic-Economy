import type { ReactNode } from 'react'

import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Message, MessageContent } from '@/components/ui/message'
import { neutralizeBidiFormattingControls } from '@/modules/answer/public'
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
  const displayLabel = neutralizeBidiFormattingControls(label.text)

  return (
    <header>
      <Message align="end">
        <MessageContent>
          <Bubble align="end" variant="muted" className="max-w-[42rem]">
            <BubbleContent className="rounded-md px-3 py-2">
              <p
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
                className="whitespace-pre-wrap"
              >
                {displayLabel}
              </p>
              {actions}
            </BubbleContent>
          </Bubble>
        </MessageContent>
      </Message>
    </header>
  )
}

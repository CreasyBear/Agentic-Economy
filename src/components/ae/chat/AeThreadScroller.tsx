import type { ReactNode } from 'react'

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  type MessageScrollerDefaultScrollPosition,
} from '@/components/ui/message-scroller'
import { cn } from '@/lib/utils'

/** Peek height for the previous turn when anchoring a new one (principle 6). */
export const AE_THREAD_SCROLL_PREVIOUS_PEEK_PX = 72

export type AeThreadScrollerProps = {
  children: ReactNode
  /**
   * Follow the live edge only while true. Never default on - the reader stays
   * put unless they are already at the bottom (MessageScroller handles yield).
   */
  autoScroll?: boolean
  /** Where to land when opening a saved thread (principle 11). */
  defaultScrollPosition?: MessageScrollerDefaultScrollPosition
  className?: string
  contentClassName?: string
  'aria-label'?: string
}

export function AeThreadScroller({
  children,
  autoScroll = false,
  defaultScrollPosition = 'end',
  className,
  contentClassName,
  'aria-label': ariaLabel = 'Chat',
}: AeThreadScrollerProps) {
  return (
    <MessageScrollerProvider
      autoScroll={autoScroll}
      defaultScrollPosition={defaultScrollPosition}
      scrollPreviousItemPeek={AE_THREAD_SCROLL_PREVIOUS_PEEK_PX}
    >
      <MessageScroller className={cn('ae-chat-scroll', className)} aria-label={ariaLabel}>
        <MessageScrollerViewport className="ae-chat-scroll__viewport">
          <MessageScrollerContent className={cn('ae-thread-transcript', contentClassName)}>
            {children}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        <MessageScrollerButton
          variant="outline"
          size="sm"
          className="ae-chat-scroll__jump"
          direction="end"
        >
          Jump to latest
        </MessageScrollerButton>
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

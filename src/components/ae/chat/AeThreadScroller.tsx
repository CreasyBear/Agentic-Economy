import { useEffect, useRef, type ReactNode } from 'react'

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  type MessageScrollerDefaultScrollPosition,
} from '@/components/ui/message-scroller'
import { cn } from '@/lib/utils'
import { AeThreadStreamingIndicator } from './AeStreamingLabel'

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
  /** Completed message to place at the top once, after streaming settles. */
  settleMessageId?: string | null
  /** Show the out-of-view streaming state as an overlay, not document flow. */
  streaming?: boolean
  /** Floating jump affordance is useful while live content moves, noisy after settle. */
  showJumpButton?: boolean
  className?: string
  contentClassName?: string
  'aria-label'?: string
}

export function AeThreadScroller({
  children,
  autoScroll = false,
  defaultScrollPosition = 'end',
  settleMessageId = null,
  streaming = false,
  showJumpButton = true,
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
        <AeThreadScrollSettler enabled={!autoScroll} messageId={settleMessageId} />
        <AeThreadStreamingIndicator streaming={streaming} />
        {showJumpButton ? (
          <MessageScrollerButton
            variant="outline"
            size="sm"
            className="ae-chat-scroll__jump"
            direction="end"
          >
            Jump to latest
          </MessageScrollerButton>
        ) : null}
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

function AeThreadScrollSettler({
  enabled,
  messageId,
}: {
  enabled: boolean
  messageId: string | null
}) {
  const { scrollToMessage } = useMessageScroller()
  const settledMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled || messageId === null || settledMessageIdRef.current === messageId) {
      return
    }

    const settle = () => {
      if (settledMessageIdRef.current === messageId) {
        return
      }

      if (scrollToAeTarget(messageId)) {
        settledMessageIdRef.current = messageId
        return
      }

      scrollToMessage(messageId, { align: 'start', behavior: 'auto', scrollMargin: 0 })
      settledMessageIdRef.current = messageId
    }

    let secondFrame = 0
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(settle)
    })
    const timeout = window.setTimeout(settle, 180)

    return () => {
      window.cancelAnimationFrame(firstFrame)
      window.cancelAnimationFrame(secondFrame)
      window.clearTimeout(timeout)
    }
  }, [enabled, messageId, scrollToMessage])

  return null
}

function scrollToAeTarget(targetId: string): boolean {
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-ae-scroll-target]')).find(
    (element) => element.dataset.aeScrollTarget === targetId,
  )
  const viewport = target?.closest<HTMLElement>('[data-slot="message-scroller-viewport"]')

  if (target === undefined || viewport === null || viewport === undefined) {
    return false
  }

  const targetRect = target.getBoundingClientRect()
  const viewportRect = viewport.getBoundingClientRect()
  const margin = 4
  const scrollTop = viewport.scrollTop + targetRect.top - viewportRect.top - margin
  viewport.scrollTo({ top: Math.max(0, scrollTop), behavior: 'auto' })

  return true
}

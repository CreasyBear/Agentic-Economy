import { useEffect, useRef, type ReactNode } from 'react'

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { useStickToBottomContext } from 'use-stick-to-bottom'

import { cn } from '@/lib/utils'
import { AeThreadStreamingIndicator } from './AeStreamingLabel'

/** Peek height for the previous turn when anchoring a new one (principle 6). */
export const AE_THREAD_SCROLL_PREVIOUS_PEEK_PX = 72

export type AeThreadScrollerProps = {
  children: ReactNode
  /**
   * Keep the saved-thread settling behavior separate from the live-edge lock
   * provided by Conversation.
   */
  autoScroll?: boolean
  /** Where to land when opening a saved thread (principle 11). */
  defaultScrollPosition?: 'start' | 'end' | 'last-anchor'
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
    <Conversation
      aria-label={ariaLabel}
      className={cn('min-h-0 flex flex-col', className)}
      initial={defaultScrollPosition === 'end' ? 'smooth' : false}
    >
      <ConversationContent
        aria-label="Chat transcript"
        className={cn('mx-auto flex w-full max-w-[56rem] flex-col gap-6 p-0', contentClassName)}
        scrollClassName="min-h-0 flex-1 overflow-auto px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-6"
      >
        {children}
      </ConversationContent>
      {/*
       * Conversation does not provide AE's 72px previous-turn peek or
       * data-ae-scroll-target/data-message-id settling, so this helper uses
       * its scroll context refs for that one-time placement.
       */}
      <AeThreadLiveEdge enabled={autoScroll} />
      <AeThreadScrollSettler
        defaultScrollPosition={defaultScrollPosition}
        enabled={!autoScroll}
        messageId={settleMessageId}
      />
      <AeThreadStreamingIndicator streaming={streaming} />
      {showJumpButton ? (
        <ConversationScrollButton
          aria-label="Jump to latest"
          className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 font-mono text-xs uppercase tracking-wide"
        />
      ) : null}
    </Conversation>
  )
}

/**
 * Conversation keeps the live edge when it is already locked. Re-enter it
 * explicitly after AE's saved-thread settler has intentionally escaped that lock.
 */
function AeThreadLiveEdge({ enabled }: { enabled: boolean }) {
  const { scrollToBottom } = useStickToBottomContext()
  const wasEnabledRef = useRef(false)

  useEffect(() => {
    if (enabled && !wasEnabledRef.current) {
      scrollToBottom('smooth')
    }
    wasEnabledRef.current = enabled
  }, [enabled, scrollToBottom])

  return null
}

function AeThreadScrollSettler({
  defaultScrollPosition,
  enabled,
  messageId,
}: {
  defaultScrollPosition: 'start' | 'end' | 'last-anchor'
  enabled: boolean
  messageId: string | null
}) {
  const { scrollRef, stopScroll } = useStickToBottomContext()
  const settledMessageIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    const viewport = scrollRef.current
    if (viewport === null) {
      return undefined
    }
    const shouldSettle = defaultScrollPosition !== 'end' || messageId !== null
    if (shouldSettle) {
      stopScroll()
    }

    if (defaultScrollPosition === 'last-anchor') {
      const anchor = viewport.querySelector<HTMLElement>('[data-scroll-anchor="true"]')
      if (anchor !== null) {
        scrollToElement(viewport, anchor, AE_THREAD_SCROLL_PREVIOUS_PEEK_PX)
      }
    }

    if (messageId === null || settledMessageIdRef.current === messageId) {
      return undefined
    }

    const settle = () => {
      if (settledMessageIdRef.current === messageId) {
        return
      }

      const aeTarget = Array.from(
        viewport.querySelectorAll<HTMLElement>('[data-ae-scroll-target]'),
      ).find((element) => element.dataset.aeScrollTarget === messageId)
      const messageTarget =
        aeTarget === undefined
          ? Array.from(viewport.querySelectorAll<HTMLElement>('[data-message-id]')).find(
              (element) => element.dataset.messageId === messageId,
            )
          : undefined
      const target = aeTarget ?? messageTarget

      if (target !== undefined) {
        scrollToElement(viewport, target, aeTarget === undefined ? 0 : 4)
        settledMessageIdRef.current = messageId
      }
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
  }, [defaultScrollPosition, enabled, messageId, scrollRef, stopScroll])

  return null
}


function scrollToElement(
  viewport: HTMLElement,
  target: HTMLElement,
  scrollMargin: number,
): boolean {
  const targetRect = target.getBoundingClientRect()
  const viewportRect = viewport.getBoundingClientRect()
  const scrollTop = viewport.scrollTop + targetRect.top - viewportRect.top - scrollMargin
  viewport.scrollTo({ top: Math.max(0, scrollTop), behavior: 'auto' })

  return true
}

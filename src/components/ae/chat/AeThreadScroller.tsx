import type { ReactNode } from 'react'

import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from '@/components/ui/message-scroller'
import { cn } from '@/lib/utils'
const AE_THREAD_SCROLL_PREVIOUS_PEEK_PX = 72

export type AeThreadScrollerProps = {
  children: ReactNode
  autoScroll?: boolean
  defaultScrollPosition?: 'start' | 'end' | 'last-anchor'
  streaming?: boolean
  showJumpButton?: boolean
  className?: string
  contentClassName?: string
  'aria-label'?: string
}

export function AeThreadScroller({
  children,
  autoScroll = false,
  defaultScrollPosition = 'end',
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
      <MessageScroller
        aria-busy={streaming}
        aria-label={ariaLabel}
        className={cn('min-h-0 flex-1', className)}
      >
        <MessageScrollerViewport aria-label="Chat transcript">
          <MessageScrollerContent
            className={cn(
              'mx-auto w-full max-w-2xl gap-6 px-4 pt-6 pb-[max(2rem,env(safe-area-inset-bottom))] md:px-6',
              contentClassName,
            )}
          >
            {children}
          </MessageScrollerContent>
        </MessageScrollerViewport>
        {showJumpButton ? (
          <MessageScrollerButton aria-label="Jump to latest" />
        ) : null}
      </MessageScroller>
    </MessageScrollerProvider>
  )
}

import * as React from 'react'

import { Button } from '@astryxdesign/core/Button'

import { cn } from '@/lib/utils'

export type MessageScrollerDefaultScrollPosition = 'start' | 'end' | 'last-anchor'

type ScrollToMessageOptions = {
  align?: 'start' | 'end' | 'center'
  behavior?: ScrollBehavior
  scrollMargin?: number
}

type MessageScrollerScrollable = {
  start: boolean
  end: boolean
}

type MessageScrollerContextValue = {
  viewportRef: React.RefObject<HTMLDivElement | null>
  scrollToMessage: (id: string, options?: ScrollToMessageOptions) => void
  scrollable: MessageScrollerScrollable
}

const MessageScrollerContext = React.createContext<MessageScrollerContextValue | null>(null)
const SCROLL_EDGE_TOLERANCE_PX = 4

export function MessageScrollerProvider({
  children,
  autoScroll = false,
  defaultScrollPosition = 'end',
  scrollPreviousItemPeek = 0,
}: {
  children?: React.ReactNode
  autoScroll?: boolean
  defaultScrollPosition?: MessageScrollerDefaultScrollPosition
  scrollPreviousItemPeek?: number
}) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const [scrollable, setScrollable] = React.useState<MessageScrollerScrollable>({ start: true, end: true })

  const updateScrollable = React.useCallback(() => {
    const viewport = viewportRef.current
    if (viewport === null) {
      setScrollable({ start: true, end: true })
      return
    }

    const atStart = viewport.scrollTop <= SCROLL_EDGE_TOLERANCE_PX
    const atEnd = viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - SCROLL_EDGE_TOLERANCE_PX
    setScrollable((current) => (current.start === atStart && current.end === atEnd ? current : { start: atStart, end: atEnd }))
  }, [])

  const scrollToMessage = React.useCallback((id: string, options: ScrollToMessageOptions = {}) => {
    const viewport = viewportRef.current
    const target = viewport?.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(id)}"]`)
    if (viewport === null || viewport === undefined || target === null || target === undefined) return
    target.scrollIntoView({ block: options.align ?? 'start', behavior: options.behavior ?? 'auto' })
    if (options.scrollMargin !== undefined) viewport.scrollTop = Math.max(0, viewport.scrollTop - options.scrollMargin)
  }, [])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null) return undefined

    viewport.addEventListener('scroll', updateScrollable, { passive: true })
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateScrollable)
    resizeObserver?.observe(viewport)

    updateScrollable()

    return () => {
      viewport.removeEventListener('scroll', updateScrollable)
      resizeObserver?.disconnect()
    }
  }, [updateScrollable])

  React.useEffect(() => {
    const viewport = viewportRef.current
    if (viewport === null) return
    if (autoScroll || defaultScrollPosition === 'end') {
      viewport.scrollTop = viewport.scrollHeight
      return
    }
    if (defaultScrollPosition === 'last-anchor') {
      const anchor = viewport.querySelector<HTMLElement>('[data-scroll-anchor="true"]')
      if (anchor !== null) {
        const viewportRect = viewport.getBoundingClientRect()
        const anchorRect = anchor.getBoundingClientRect()
        viewport.scrollTop += anchorRect.top - viewportRect.top - scrollPreviousItemPeek
      }
    }
  }, [autoScroll, children, defaultScrollPosition, scrollPreviousItemPeek, updateScrollable])

  const value = React.useMemo(() => ({ viewportRef, scrollToMessage, scrollable }), [scrollToMessage, scrollable])
  return <MessageScrollerContext.Provider value={value}>{children}</MessageScrollerContext.Provider>
}

export function useMessageScroller() {
  return React.use(MessageScrollerContext) ?? { scrollToMessage: () => undefined }
}

export function useMessageScrollerScrollable(): MessageScrollerScrollable {
  return React.use(MessageScrollerContext)?.scrollable ?? { start: false, end: true }
}

export function MessageScroller({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('relative flex min-h-0 flex-1 flex-col', className)} {...props} />
}

export function MessageScrollerViewport({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  const context = React.use(MessageScrollerContext)
  return <div ref={context?.viewportRef} data-slot="message-scroller-viewport" className={cn('min-h-0 flex-1 overflow-auto', className)} {...props} />
}

export function MessageScrollerContent({ className, ...props }: React.ComponentPropsWithoutRef<'div'>) {
  return <div className={cn('grid gap-4', className)} {...props} />
}

export function MessageScrollerButton({
  className,
  direction: _direction = 'end',
  children = 'Jump',
  label,
  ...props
}: React.ComponentProps<typeof Button> & { direction?: 'start' | 'end' }) {
  const resolvedLabel = label ?? (typeof children === 'string' ? children : 'Jump')

  return (
    <Button label={resolvedLabel} variant="secondary" size="sm" className={className} {...props}>
      {children}
    </Button>
  )
}

export function MessageScrollerItem({
  className,
  messageId,
  scrollAnchor = false,
  ...props
}: React.ComponentPropsWithoutRef<'div'> & { messageId?: string; scrollAnchor?: boolean }) {
  return <div data-message-id={messageId} data-scroll-anchor={scrollAnchor ? 'true' : undefined} className={className} {...props} />
}

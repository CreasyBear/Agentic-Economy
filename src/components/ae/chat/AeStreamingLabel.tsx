import type { CSSProperties } from 'react'
import { useStickToBottomContext } from 'use-stick-to-bottom'

import { cn } from '@/lib/utils'

export type AeStreamingLabelProps = {
  children: string
  as?: 'p' | 'span'
  className?: string
  duration?: number
}

/** Shimmer label for in-progress copy. */
export function AeStreamingLabel({
  children,
  as = 'span',
  className = 'text-muted-foreground',
  duration = 2,
}: AeStreamingLabelProps) {
  const Component = as
  return (
    <Component
      className={cn('ae-text-shimmer', className)}
      style={{ '--ae-shimmer-duration': `${duration}s` } as CSSProperties}
    >
      {children}
    </Component>
  )
}

export type AeThreadStreamingIndicatorProps = {
  streaming: boolean
}

/** Principle 8: show when a response is still streaming out of view. */
export function AeThreadStreamingIndicator({ streaming }: AeThreadStreamingIndicatorProps) {
  // Conversation exposes the live-edge state rather than a scroll element.
  const { isAtBottom } = useStickToBottomContext()

  if (!streaming || isAtBottom) {
    return null
  }

  return (
    <p className="pointer-events-none absolute bottom-24 left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-md border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground">
      <AeStreamingLabel as="span">Results are still loading below.</AeStreamingLabel>
    </p>
  )
}

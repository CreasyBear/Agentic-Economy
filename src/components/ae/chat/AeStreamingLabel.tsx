import { Shimmer } from '@/components/ai-elements/shimmer'
import { useStickToBottomContext } from 'use-stick-to-bottom'

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
  return (
    <Shimmer as={as} className={className} duration={duration}>
      {children}
    </Shimmer>
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
    <p className="pointer-events-none absolute bottom-24 left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-1 font-mono text-xs text-muted-foreground" role="status" aria-live="polite">
      <AeStreamingLabel as="span">Answer still streaming below.</AeStreamingLabel>
    </p>
  )
}

import { Shimmer } from '@/components/ai-elements/shimmer'
import { useMessageScrollerScrollable } from './AeThreadMessageScroller'

export type AeStreamingLabelProps = {
  children: string
  as?: 'p' | 'span'
  className?: string
  duration?: number
}

/** Astryx-era shimmer for in-progress copy. */
export function AeStreamingLabel({
  children,
  as = 'span',
  className = 'text-secondary',
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
  const scrollable = useMessageScrollerScrollable()

  if (!streaming || scrollable.end) {
    return null
  }

  return (
    <p className="pointer-events-none absolute bottom-24 left-1/2 z-20 w-max max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-1 font-mono text-xs text-secondary" role="status" aria-live="polite">
      <AeStreamingLabel as="span">Answer still streaming below.</AeStreamingLabel>
    </p>
  )
}

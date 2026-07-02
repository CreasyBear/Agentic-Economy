import { Shimmer } from '@/components/ai-elements/shimmer'
import { useMessageScrollerScrollable } from '@/components/ui/message-scroller'

export type AeStreamingLabelProps = {
  children: string
  as?: 'p' | 'span'
  className?: string
  duration?: number
}

/** Daylight Commerce Routing shimmer for in-progress copy. */
export function AeStreamingLabel({
  children,
  as = 'span',
  className = 'ae-streaming-label',
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
    <p className="ae-chat-scroll__streaming-hint" role="status" aria-live="polite">
      <AeStreamingLabel as="span">Answer still streaming below.</AeStreamingLabel>
    </p>
  )
}

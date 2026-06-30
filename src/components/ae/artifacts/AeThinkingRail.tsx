import type { ThinkingStep } from '@/modules/answer-thread/public'

import { AeStreamingLabel } from '@/components/ae/chat/AeStreamingLabel'

const STEPS: readonly { id: ThinkingStep; label: string }[] = [
  { id: 'search', label: 'Search' },
  { id: 'read', label: 'Read' },
  { id: 'write', label: 'Write' },
]

export type AeThinkingRailProps = {
  step?: ThinkingStep
  label: string
  visible: boolean
}

export function AeThinkingRail({ step, label, visible }: AeThinkingRailProps) {
  if (!visible) {
    return null
  }

  const activeIndex = step === undefined ? 0 : STEPS.findIndex((item) => item.id === step)

  return (
    <div className="ae-thinking-rail" aria-hidden={!visible}>
      <ol className="ae-thinking-rail__ticks">
        {STEPS.map((item, index) => (
          <li
            key={item.id}
            className="ae-thinking-rail__tick"
            data-active={index <= activeIndex ? 'true' : 'false'}
            aria-hidden="true"
          />
        ))}
      </ol>
      <p className="ae-thinking-rail__label" role="status">
        <AeStreamingLabel as="span">{label}</AeStreamingLabel>
      </p>
    </div>
  )
}

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
    <div className="flex items-start gap-3" aria-hidden={!visible}>
      <ol className="flex flex-col gap-1" aria-hidden="true">
        {STEPS.map((item, index) => (
          <li
            key={item.id}
            data-active={index <= activeIndex ? 'true' : 'false'}
            className="size-1.5 rounded-full bg-border data-[active=true]:bg-primary"
            aria-hidden="true"
          />
        ))}
      </ol>
      <p className="font-mono text-xs text-secondary" role="status">
        <AeStreamingLabel as="span">{label}</AeStreamingLabel>
      </p>
    </div>
  )
}

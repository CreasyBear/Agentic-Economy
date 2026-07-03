import type { ThinkingStep } from '@/modules/answer-thread/public'

import { AeStreamingLabel } from '@/components/ae/chat/AeStreamingLabel'

const STEPS: readonly { id: ThinkingStep; label: string; detail: string }[] = [
  { id: 'search', label: 'Search listings', detail: 'Find published businesses.' },
  { id: 'read', label: 'Read details', detail: 'Check service area and inquiry path.' },
  { id: 'write', label: 'Prepare next step', detail: 'Summarize fit and route safely.' },
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

  const stepIndex = step === undefined ? 0 : STEPS.findIndex((item) => item.id === step)
  const activeIndex = stepIndex === -1 ? 0 : stepIndex

  return (
    <section className="grid gap-3 rounded-md border border-border bg-surface p-3" aria-label="Visible answer process">
      <header className="grid gap-1">
        <p className="font-mono text-2xs font-semibold uppercase tracking-wider text-secondary">Visible process</p>
        <p className="text-sm font-medium text-primary" role="status">
          <AeStreamingLabel as="span">{label}</AeStreamingLabel>
        </p>
        <p className="text-xs leading-snug text-secondary">
          AE is checking published listing facts and routing to the next safe step.
        </p>
      </header>
      <ol className="grid gap-2 sm:grid-cols-3" aria-label="Answer process steps">
        {STEPS.map((item, index) => {
          const state = index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'pending'
          return (
            <li
              key={item.id}
              className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2 rounded-md border border-border bg-card p-2 data-[state=active]:border-border-strong data-[state=active]:bg-muted data-[state=pending]:opacity-70"
              data-state={state}
              aria-current={state === 'active' ? 'step' : undefined}
            >
              <span
                className="mt-px inline-flex size-5 items-center justify-center rounded-full border border-border bg-surface font-mono text-2xs font-semibold text-secondary data-[state=active]:border-border-strong data-[state=active]:text-primary data-[state=complete]:border-border-strong data-[state=complete]:text-primary"
                data-state={state}
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="grid min-w-0 gap-0.5">
                <span className="text-sm font-medium leading-snug text-primary">{item.label}</span>
                <span className="text-xs leading-snug text-secondary">{item.detail}</span>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

import { CheckCircle2Icon } from 'lucide-react'

import { STEP_META, TACTILE } from '../supplier-onboarding-wizard.contracts'
import type { OnboardingStepperProps } from '../supplier-onboarding-wizard.contracts'

export function OnboardingStepper({
  step,
  isVisited,
  isCompleted,
  onGoToStep,
}: OnboardingStepperProps) {
  return (
    <nav aria-label="Supplier activation" className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-b pb-4 mb-4">
      {STEP_META.map(({ id, label, duration, icon: Icon }) => {
        const active = step === id
        const completed = isCompleted(id)
        const visited = isVisited(id)
        return (
          <button
            key={id}
            type="button"
            disabled={!visited}
            aria-current={active ? 'step' : undefined}
            onClick={() => onGoToStep(id)}
            className={`flex flex-col items-start gap-0.5 p-2 rounded-md text-left disabled:opacity-50 disabled:cursor-not-allowed ${TACTILE} ${
              active ? 'bg-primary/10 text-primary font-semibold' : 'text-muted-foreground'
            }`}
          >
            <span className="flex items-center gap-2 w-full">
              {completed ? (
                <CheckCircle2Icon className="size-4 shrink-0" aria-hidden />
              ) : (
                <Icon className="size-4 shrink-0" aria-hidden />
              )}
              <span className="text-xs">{label}</span>
              {completed ? <span className="sr-only">Completed</span> : null}
            </span>
            <span className="text-[10px] text-muted-foreground/80 font-normal pl-6">{duration}</span>
          </button>
        )
      })}
    </nav>
  )
}

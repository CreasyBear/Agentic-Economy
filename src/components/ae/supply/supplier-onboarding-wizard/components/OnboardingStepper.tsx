import { CheckCircle2Icon } from 'lucide-react'
import { Button } from '@/components/arc/button/button'

import '../OnboardingComposition.css'

import { STEP_META } from '../supplier-onboarding-wizard.contracts'
import type { OnboardingStepperProps } from '../supplier-onboarding-wizard.contracts'

export function OnboardingStepper({
  step,
  isVisited,
  isCompleted,
  onGoToStep,
}: OnboardingStepperProps) {
  return (
    <nav aria-label="Provider setup" className="arc-market arc-provider-setup-steps">
      {STEP_META.map(({ id, label, duration, icon: Icon }) => {
        const active = step === id
        const completed = isCompleted(id)
        const visited = isVisited(id)
        return (
          <Button
            key={id}
            type="button"
            disabled={!visited}
            aria-current={active ? 'step' : undefined}
            onClick={() => onGoToStep(id)}
            variant="ghost"
            size="md"
            labelLayout="start"
            className="arc-provider-setup-step"
          >
            <span className="arc-provider-setup-step-content">
              <span className="arc-provider-setup-step-title">
                {completed ? (
                  <CheckCircle2Icon className="arc-provider-setup-step-icon" aria-hidden />
                ) : (
                  <Icon className="arc-provider-setup-step-icon" aria-hidden />
                )}
                <span>{label}</span>
                {completed ? <span className="sr-only">Completed</span> : null}
              </span>
              <span className="arc-provider-setup-step-duration">{duration}</span>
            </span>
          </Button>
        )
      })}
    </nav>
  )
}

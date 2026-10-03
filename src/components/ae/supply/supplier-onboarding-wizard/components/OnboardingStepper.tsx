import { Stepper } from '@/components/arc/stepper/stepper'

import '../OnboardingComposition.css'

import { STEP_META } from '../supplier-onboarding-wizard.contracts'
import type { OnboardingStepperProps } from '../supplier-onboarding-wizard.contracts'

export function OnboardingStepper({
  step,
  isVisited,
  isCompleted,
  onGoToStep,
}: OnboardingStepperProps) {
  const steps = STEP_META.map(({ id, label, duration }) => {
    const active = step === id
    const completed = isCompleted(id)
    const visited = isVisited(id)
    return {
      id,
      label: label.replace(/^\d+\.\s*/u, ''),
      description: duration,
      status: active ? 'current' as const : completed ? 'complete' as const : 'upcoming' as const,
      statusLabel: completed ? 'Completed' : visited ? 'Visited' : 'Not started',
    }
  })

  return (
    <Stepper
      steps={steps}
      current={STEP_META.findIndex(({ id }) => id === step)}
      orientation="vertical"
      details="all"
      label="Provider setup"
      className="arc-market arc-provider-setup-steps"
      canSelectStep={(index) => {
        const meta = STEP_META[index]
        return meta !== undefined && isVisited(meta.id)
      }}
      onStepSelect={(index) => {
        const meta = STEP_META[index]
        if (meta && isVisited(meta.id)) onGoToStep(meta.id)
      }}
    />
  )
}

import type { OnboardingStepIndicatorProps } from '../onboarding.contracts'

export function OnboardingStepIndicator({ step }: OnboardingStepIndicatorProps) {
  return (
    <div className="grid gap-related">
      <p className="text-sm text-muted-foreground">Step {step} of 2</p>
      <div className="grid grid-cols-2 gap-2" aria-hidden>
        <div
          className="h-0.5 bg-muted transition-[background-color] duration-100 ease-out data-[active=true]:bg-foreground"
          data-active={step >= 1}
        />
        <div
          className="h-0.5 bg-muted transition-[background-color] duration-100 ease-out data-[active=true]:bg-foreground"
          data-active={step >= 2}
        />
      </div>
    </div>
  )
}

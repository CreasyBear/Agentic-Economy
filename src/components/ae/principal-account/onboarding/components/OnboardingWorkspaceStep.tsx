import { Button } from '@/components/ui/button'
import { FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import {
  ONBOARDING_SKIP_HELPER,
  type OnboardingWorkspaceStepProps,
} from '../onboarding.contracts'

export function OnboardingWorkspaceStep({
  workspaceName,
  finishDisabled,
  skipDisabled,
  submitting,
  completionDescription,
  workspaceInputRef,
  onWorkspaceNameChange,
  onBack,
  onSkip,
  onFinish,
}: OnboardingWorkspaceStepProps) {
  return (
    <div className="grid gap-section">
      <div className="grid gap-2">
        <FieldLabel htmlFor="onboarding-workspace-name">Workspace name</FieldLabel>
        <Input
          ref={workspaceInputRef}
          id="onboarding-workspace-name"
          aria-label="Workspace name"
          value={workspaceName}
          onChange={(event) => onWorkspaceNameChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !finishDisabled) {
              event.preventDefault()
              void onFinish()
            }
          }}
          autoComplete="organization"
          maxLength={200}
        />
      </div>
      <FieldDescription>{completionDescription}</FieldDescription>
      <div className="grid gap-related sm:grid-cols-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-touch w-full"
          disabled={submitting}
          onClick={onBack}
        >
          Back
        </Button>
        <Button
          type="button"
          className="min-h-touch w-full"
          disabled={finishDisabled}
          onClick={() => void onFinish()}
        >
          {submitting ? 'Creating workspace...' : 'Create workspace'}
        </Button>
      </div>
      <div className="grid justify-items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          className="min-h-touch"
          disabled={skipDisabled}
          onClick={() => void onSkip()}
        >
          Skip
        </Button>
        <FieldDescription>{ONBOARDING_SKIP_HELPER}</FieldDescription>
      </div>
    </div>
  )
}

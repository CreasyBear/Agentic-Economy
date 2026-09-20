import { Button } from '@/components/ui/button'
import { FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import type { OnboardingWorkspaceStepProps } from '../onboarding.contracts'

export function OnboardingWorkspaceStep({
  workspaceName,
  finishDisabled,
  submitting,
  workspaceInputRef,
  onWorkspaceNameChange,
  onBack,
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
        />
      </div>
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
          {submitting ? 'Creating workspace...' : 'Finish setup'}
        </Button>
      </div>
    </div>
  )
}

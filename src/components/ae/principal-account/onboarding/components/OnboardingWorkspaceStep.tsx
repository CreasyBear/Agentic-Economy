import { Button } from '@/components/ui/button'
import { FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

import {
  ONBOARDING_NAME_REQUIRED,
  type OnboardingWorkspaceStepProps,
} from '../onboarding.contracts'

const COMPLETION_DESCRIPTION_ID = 'onboarding-workspace-completion'
const NAME_ERROR_ID = 'onboarding-workspace-name-error'

export function OnboardingWorkspaceStep({
  workspaceName,
  finishDisabled,
  submitting,
  nameInvalid,
  completionDescription,
  workspaceInputRef,
  onWorkspaceNameChange,
  onBack,
  onFinish,
}: OnboardingWorkspaceStepProps) {
  const nameDescribedBy = nameInvalid
    ? `${COMPLETION_DESCRIPTION_ID} ${NAME_ERROR_ID}`
    : COMPLETION_DESCRIPTION_ID

  return (
    <div className="grid gap-section">
      <div className="grid gap-2">
        <FieldLabel htmlFor="onboarding-workspace-name">Workspace name</FieldLabel>
        <Input
          ref={workspaceInputRef}
          id="onboarding-workspace-name"
          aria-label="Workspace name"
          aria-describedby={nameDescribedBy}
          aria-invalid={nameInvalid || undefined}
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
      <FieldDescription id={COMPLETION_DESCRIPTION_ID}>{completionDescription}</FieldDescription>
      {nameInvalid ? (
        <FieldError id={NAME_ERROR_ID}>{ONBOARDING_NAME_REQUIRED}</FieldError>
      ) : null}
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
    </div>
  )
}

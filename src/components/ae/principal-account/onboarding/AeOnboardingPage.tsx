import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSiteAuthPanel, AeSiteAuthStage } from '@/components/ae/website'

import { OnboardingOpeningPanel } from './components/OnboardingOpeningPanel'
import { OnboardingRoleStep } from './components/OnboardingRoleStep'
import { OnboardingStepIndicator } from './components/OnboardingStepIndicator'
import { OnboardingWorkspaceStep } from './components/OnboardingWorkspaceStep'
import type { AeOnboardingPageProps, OnboardingWizardStep } from './onboarding.contracts'
import { useOnboardingPage } from './useOnboardingPage'

export type { AeOnboardingPageProps } from './onboarding.contracts'

export function AeOnboardingPage(props: AeOnboardingPageProps) {
  const model = useOnboardingPage(props)
  const { surface } = model

  if (surface.kind === 'opening') {
    return (
      <AePublicPage>
        <AeSiteAuthStage labelledBy="onboarding-opening-heading" url="/onboarding">
          <AeSiteAuthPanel
            eyebrow="Account"
            title="Opening your workspace"
            titleId="onboarding-opening-heading"
            body="One moment while we take you to your workspace."
          >
            <OnboardingOpeningPanel />
          </AeSiteAuthPanel>
        </AeSiteAuthStage>
      </AePublicPage>
    )
  }

  const wizardStep: OnboardingWizardStep = surface.kind === 'role' ? 1 : 2

  return (
    <AePublicPage>
      <AeSiteAuthStage labelledBy="onboarding-context-heading" url="/onboarding">
        <AeSiteAuthPanel
          eyebrow="Account"
          title="Finish workspace"
          titleId="onboarding-context-heading"
          body="Choose how you’ll use Agentic Economy and name your workspace."
        >
          <div className="grid min-h-96 gap-section">
            <OnboardingStepIndicator step={wizardStep} />
            {surface.kind === 'role' ? (
              <OnboardingRoleStep
                roleIntent={surface.roleIntent}
                continueDisabled={surface.continueDisabled}
                onRoleIntentChange={model.onRoleIntentChange}
                onContinue={model.onContinue}
              />
            ) : (
              <OnboardingWorkspaceStep
                workspaceName={surface.workspaceName}
                finishDisabled={surface.finishDisabled}
                skipDisabled={surface.skipDisabled}
                submitting={surface.submitting}
                completionDescription={surface.completionDescription}
                workspaceInputRef={model.workspaceInputRef}
                onWorkspaceNameChange={model.onWorkspaceNameChange}
                onBack={model.onBack}
                onSkip={model.onSkip}
                onFinish={model.onFinish}
              />
            )}
          </div>
        </AeSiteAuthPanel>
      </AeSiteAuthStage>
    </AePublicPage>
  )
}

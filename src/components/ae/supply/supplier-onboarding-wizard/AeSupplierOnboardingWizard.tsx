'use client'


import { AeAlert } from '@/components/ae/shared/arc/alert/AeAlert'

import { FirstToolStep } from './components/FirstToolStep'
import { OnboardingStepper } from './components/OnboardingStepper'
import { ProviderIdentityFields, SUPPLIER_IDENTITY_ERROR_ID } from './components/ProviderIdentityFields'
import type { AeSupplierOnboardingWizardProps } from './supplier-onboarding-wizard.contracts'
import { useSupplierOnboardingWizard } from './useSupplierOnboardingWizard'
import './OnboardingComposition.css'

export type { AeSupplierOnboardingWizardProps } from './supplier-onboarding-wizard.contracts'

export function AeSupplierOnboardingWizard({
  currentStep = 'profile',
  providerName,
  onSaveProfile,
}: AeSupplierOnboardingWizardProps) {
  const wizard = useSupplierOnboardingWizard({
    currentStep,
    ...(providerName !== undefined ? { providerName } : {}),
    ...(onSaveProfile !== undefined ? { onSaveProfile } : {}),
  })
  const { view } = wizard

  const diagnosticSlot = (
    <div className="arc-provider-setup-diagnostic" aria-live="polite">
      {view.diagnostic !== undefined ? (
        <AeAlert tone="danger" title={view.diagnostic.whatHappened} id={SUPPLIER_IDENTITY_ERROR_ID} className="py-2">
            <span>{view.diagnostic.financialImpact}</span>
            <span>{view.diagnostic.nextStep}</span>
          </AeAlert>
      ) : null}
    </div>
  )

  return (
    <div className="arc-market arc-provider-setup-shell">
      <div className="arc-provider-setup-heading">
        <h2>
          Provider setup
        </h2>
        <p>
          Set up your Provider profile, then add your first Tool.
        </p>
      </div>

      <OnboardingStepper
        step={view.step}
        isVisited={wizard.isVisited}
        isCompleted={wizard.isCompleted}
        onGoToStep={wizard.goToStep}
      />

      {diagnosticSlot}

      {view.step === 'profile' && (
        <ProviderIdentityFields
          name={view.name}
          website={view.website}
          abn={view.abn}
          pending={view.pending}
          {...(view.invalidField === undefined ? {} : { invalidField: view.invalidField })}
          {...(view.diagnostic === undefined ? {} : { fieldError: view.diagnostic.whatHappened })}
          onNameChange={wizard.handleNameChange}
          onWebsiteChange={wizard.handleWebsiteChange}
          onAbnChange={wizard.handleAbnChange}
          onSubmit={(e) => void wizard.handleProfileSubmit(e)}
        />
      )}


      {view.step === 'first_tool' && <FirstToolStep />}
    </div>
  )
}

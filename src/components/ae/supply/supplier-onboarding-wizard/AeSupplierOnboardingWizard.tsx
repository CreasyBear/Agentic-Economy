'use client'

import { AlertCircleIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { FirstToolStep } from './components/FirstToolStep'
import { OnboardingStepper } from './components/OnboardingStepper'
import { ProviderIdentityFields, SUPPLIER_IDENTITY_ERROR_ID } from './components/ProviderIdentityFields'
import type { AeSupplierOnboardingWizardProps } from './supplier-onboarding-wizard.contracts'
import { SHELL, SLOT } from './supplier-onboarding-wizard.contracts'
import { useSupplierOnboardingWizard } from './useSupplierOnboardingWizard'

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
    <div className={SLOT} aria-live="polite">
      {view.diagnostic !== undefined ? (
        <Alert id={SUPPLIER_IDENTITY_ERROR_ID} variant="destructive" className="py-2">
          <AlertCircleIcon className="size-4" />
          <AlertTitle className="text-xs">{view.diagnostic.whatHappened}</AlertTitle>
          <AlertDescription className="text-xs grid gap-0.5">
            <span>{view.diagnostic.financialImpact}</span>
            <span>{view.diagnostic.nextStep}</span>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )

  return (
    <div className={`grid max-w-2xl gap-4 rounded-xl border bg-card p-6 shadow-xs ${SHELL}`}>
      <div className="grid gap-1">
        <h2 className="text-lg font-medium tracking-tight text-foreground">
          Provider setup
        </h2>
        <p className="text-xs text-muted-foreground">
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

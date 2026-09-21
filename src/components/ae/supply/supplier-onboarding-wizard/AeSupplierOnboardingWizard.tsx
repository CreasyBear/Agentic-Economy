'use client'

import { AlertCircleIcon } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

import { FirstToolStep } from './components/FirstToolStep'
import { OnboardingStepper } from './components/OnboardingStepper'
import { PayoutsStep } from './components/PayoutsStep'
import { ProviderIdentityFields } from './components/ProviderIdentityFields'
import type { AeSupplierOnboardingWizardProps } from './supplier-onboarding-wizard.contracts'
import { SHELL, SLOT } from './supplier-onboarding-wizard.contracts'
import { useSupplierOnboardingWizard } from './useSupplierOnboardingWizard'

export type { AeSupplierOnboardingWizardProps } from './supplier-onboarding-wizard.contracts'

export function AeSupplierOnboardingWizard({
  currentStep = 'profile',
  providerName,
  payoutsConfigured = false,
  onSaveProfile,
  onConnectPayouts,
}: AeSupplierOnboardingWizardProps) {
  const wizard = useSupplierOnboardingWizard({
    currentStep,
    payoutsConfigured,
    ...(providerName !== undefined ? { providerName } : {}),
    ...(onSaveProfile !== undefined ? { onSaveProfile } : {}),
    ...(onConnectPayouts !== undefined ? { onConnectPayouts } : {}),
  })
  const { view } = wizard

  const diagnosticSlot = (
    <div className={SLOT} aria-live="polite">
      {view.diagnostic !== undefined ? (
        <Alert variant="destructive" className="py-2">
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
          Supplier activation
        </h2>
        <p className="text-xs text-muted-foreground">
          Complete the 3-step checklist to start selling tools and receiving automated AUD payouts.
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
          onNameChange={wizard.handleNameChange}
          onWebsiteChange={wizard.handleWebsiteChange}
          onAbnChange={wizard.handleAbnChange}
          onSubmit={(e) => void wizard.handleProfileSubmit(e)}
        />
      )}

      {view.step === 'payouts' && (
        <PayoutsStep
          payoutsConfigured={view.payoutsConfigured}
          onConnectPayouts={wizard.handleConnectPayouts}
          onSkipForNow={wizard.handleSkipForNow}
        />
      )}

      {view.step === 'first_tool' && <FirstToolStep />}
    </div>
  )
}

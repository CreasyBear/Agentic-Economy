'use client'

import { useEffect, useRef } from 'react'


import { AeAlert } from '@/components/ae/shared/alert/AeAlert'

import { FirstToolStep } from './components/FirstToolStep'
import { AeProviderSetupWizard } from '../AeProviderSetupWizard'
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
  const headingRef = useRef<HTMLHeadingElement>(null)
  const focusedStep = useRef(view.step)
  useEffect(() => {
    if (focusedStep.current === view.step) return
    focusedStep.current = view.step
    if (view.invalidField === undefined) headingRef.current?.focus()
  }, [view.step, view.invalidField])

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
    <AeProviderSetupWizard
      steps={[{ id: 'profile', title: 'Provider identity' }, { id: 'first_tool', title: 'First Tool' }]}
      activeStep={view.step}
      completedSteps={view.step === 'first_tool' && onSaveProfile !== undefined ? [{ id: 'profile', title: 'Provider identity', detail: view.name, disabled: view.pending, onEdit: () => wizard.goToStep('profile') }] : []}
      busy={view.pending}
      progressLabel="Provider setup"
      heading={<div className="grid gap-1"><h2 ref={headingRef} tabIndex={-1} className="text-lg font-medium">Provider setup</h2><p className="text-sm text-muted-foreground">Set up your Provider profile, then add your first Tool.</p></div>}
      feedback={diagnosticSlot}
    >
      {view.step === 'profile' && (
        <ProviderIdentityFields
          name={view.name}
          website={view.website}
          pending={view.pending}
          {...(view.invalidField === undefined ? {} : { invalidField: view.invalidField })}
          {...(view.diagnostic === undefined ? {} : { fieldError: view.diagnostic.whatHappened })}
          onNameChange={wizard.handleNameChange}
          onWebsiteChange={wizard.handleWebsiteChange}
          onSubmit={(e) => void wizard.handleProfileSubmit(e)}
        />
      )}


      {view.step === 'first_tool' && <FirstToolStep />}
    </AeProviderSetupWizard>
  )
}

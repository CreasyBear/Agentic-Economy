import { useEffect, useState, type FormEvent } from 'react'

import { toast } from '@/lib/ui/toast'
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { formatAbnDisplay, normalizeAbn } from '@/modules/money/public'
import type { SupplierOnboardingStep } from '@/modules/capability-supply/supplier-onboarding.contracts'
import { providerWorkspacePayoutConnection } from '@/components/ae/offerings/provider-workspace/provider-workspace.view-model'

import {
  type SupplierOnboardingWizardPorts,
  type SupplierOnboardingWizardViewState,
} from './supplier-onboarding-wizard.contracts'
import {
  diagnosticForProfileValidation,
  FINANCIAL_NO_UPDATE,
  SAVE_FAILURE_DIAGNOSTIC,
} from './provider-identity-validation'

export function useSupplierOnboardingWizard({
  currentStep = 'profile',
  providerName,
  payoutConnection,
  onSaveProfile,
  onConnectPayouts,
}: SupplierOnboardingWizardPorts) {
  const resolvedPayoutConnection = payoutConnection ?? providerWorkspacePayoutConnection({
    result: { kind: 'not_applicable' },
    pending: false,
  })
  const [step, setStep] = useState<SupplierOnboardingStep>(currentStep)
  const [name, setName] = useState(providerName ?? '')
  const [website, setWebsite] = useState('')
  const [abn, setAbn] = useState('')
  const [diagnostic, setDiagnostic] = useState<Rule4Diagnostic>()
  const [pending, setPending] = useState(false)
  const [profileCompleted, setProfileCompleted] = useState(
    currentStep === 'payouts' || currentStep === 'first_tool',
  )
  const [firstToolVisited, setFirstToolVisited] = useState(currentStep === 'first_tool')

  useEffect(() => {
    setStep(currentStep)
    if (currentStep === 'payouts' || currentStep === 'first_tool') {
      setProfileCompleted(true)
    }
    if (currentStep === 'first_tool') {
      setFirstToolVisited(true)
    }
  }, [currentStep])

  const isVisited = (stepId: SupplierOnboardingStep): boolean => {
    if (stepId === 'profile') return true
    if (stepId === 'payouts') return profileCompleted
    return firstToolVisited
  }

  const isCompleted = (stepId: SupplierOnboardingStep): boolean => {
    if (stepId === 'profile') return profileCompleted
    if (stepId === 'payouts') return resolvedPayoutConnection.state === 'connected'
    return false
  }

  const goToStep = (stepId: SupplierOnboardingStep) => {
    if (!isVisited(stepId)) return
    setStep(stepId)
    if (stepId === 'first_tool') setFirstToolVisited(true)
    setDiagnostic(undefined)
  }

  const handleProfileSubmit = async (e: Pick<FormEvent, 'preventDefault'>) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedWebsite = website.trim()
    const cleanAbn = normalizeAbn(abn)

    const validationError = diagnosticForProfileValidation(trimmedName, trimmedWebsite, cleanAbn)
    if (validationError !== undefined) {
      setDiagnostic(validationError)
      return
    }

    if (!onSaveProfile) {
      setProfileCompleted(true)
      setStep('payouts')
      return
    }

    setPending(true)
    setDiagnostic(undefined)
    try {
      const result = await onSaveProfile({
        name: trimmedName,
        website: trimmedWebsite,
        abn: cleanAbn,
      })
      if (result.kind === 'ok') {
        toast.success('Provider profile saved')
        setProfileCompleted(true)
        setStep('payouts')
      } else {
        setDiagnostic({
          whatHappened: result.message,
          financialImpact: FINANCIAL_NO_UPDATE,
          nextStep: SAVE_FAILURE_DIAGNOSTIC.nextStep,
        })
      }
    } catch (cause) {
      void cause
      setDiagnostic(SAVE_FAILURE_DIAGNOSTIC)
    } finally {
      setPending(false)
    }
  }

  const handleNameChange = (value: string) => {
    setName(value)
    setDiagnostic(undefined)
  }

  const handleWebsiteChange = (value: string) => {
    setWebsite(value)
    setDiagnostic(undefined)
  }

  const handleAbnChange = (value: string) => {
    const formatted = formatAbnDisplay(value)
    setAbn(formatted)
    setDiagnostic(undefined)
  }

  const handleConnectPayouts = () => {
    void onConnectPayouts?.()
  }

  const handleSkipForNow = () => {
    setFirstToolVisited(true)
    setStep('first_tool')
  }

  const view: SupplierOnboardingWizardViewState = {
    step,
    name,
    website,
    abn,
    diagnostic,
    pending,
    payoutConnection: resolvedPayoutConnection,
  }

  return {
    view,
    isVisited,
    isCompleted,
    goToStep,
    handleProfileSubmit,
    handleNameChange,
    handleWebsiteChange,
    handleAbnChange,
    handleConnectPayouts,
    handleSkipForNow,
  }
}

import { useEffect, useState, type FormEvent } from 'react'

import { toast } from '@/lib/ui/toast'
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import { formatAbnDisplay, normalizeAbn } from '@/modules/money/public'

import {
  type SupplierOnboardingWizardPorts,
  type SupplierOnboardingWizardViewState,
} from './supplier-onboarding-wizard.contracts'
import {
  FINANCIAL_NO_UPDATE,
  profileValidationIssue,
  SAVE_FAILURE_DIAGNOSTIC,
  type ProviderIdentityFieldId,
} from './provider-identity-validation'

export function useSupplierOnboardingWizard({
  currentStep = 'profile',
  providerName,
  onSaveProfile,
}: SupplierOnboardingWizardPorts) {
  const [step, setStep] = useState<NonNullable<SupplierOnboardingWizardPorts['currentStep']>>(currentStep)
  const [name, setName] = useState(providerName ?? '')
  const [website, setWebsite] = useState('')
  const [abn, setAbn] = useState('')
  const [diagnostic, setDiagnostic] = useState<Rule4Diagnostic>()
  const [invalidField, setInvalidField] = useState<ProviderIdentityFieldId>()
  const [pending, setPending] = useState(false)
  const [profileCompleted, setProfileCompleted] = useState(currentStep === 'first_tool')
  const [firstToolVisited, setFirstToolVisited] = useState(currentStep === 'first_tool')

  useEffect(() => {
    setStep(currentStep)
    if (currentStep === 'first_tool') setProfileCompleted(true)
    if (currentStep === 'first_tool') {
      setFirstToolVisited(true)
    }
  }, [currentStep])

  const isVisited = (stepId: NonNullable<SupplierOnboardingWizardPorts['currentStep']>): boolean => {
    if (stepId === 'profile') return true
    return firstToolVisited
  }

  const isCompleted = (stepId: NonNullable<SupplierOnboardingWizardPorts['currentStep']>): boolean => {
    if (stepId === 'profile') return profileCompleted
    return false
  }

  const goToStep = (stepId: NonNullable<SupplierOnboardingWizardPorts['currentStep']>) => {
    if (!isVisited(stepId)) return
    setStep(stepId)
    if (stepId === 'first_tool') setFirstToolVisited(true)
    setDiagnostic(undefined)
    setInvalidField(undefined)
  }

  const handleProfileSubmit = async (e: Pick<FormEvent, 'preventDefault'>) => {
    e.preventDefault()
    const trimmedName = name.trim()
    const trimmedWebsite = website.trim()
    const cleanAbn = normalizeAbn(abn)

    const validationIssue = profileValidationIssue(trimmedName, trimmedWebsite, cleanAbn)
    if (validationIssue !== undefined) {
      setDiagnostic(validationIssue.diagnostic)
      setInvalidField(validationIssue.field)
      return
    }

    if (!onSaveProfile) {
      setProfileCompleted(true)
      setFirstToolVisited(true)
      setStep('first_tool')
      return
    }

    setPending(true)
    setDiagnostic(undefined)
    setInvalidField(undefined)
    try {
      const result = await onSaveProfile({
        name: trimmedName,
        website: trimmedWebsite,
        abn: cleanAbn,
      })
      if (result.kind === 'ok') {
        toast.success('Provider profile saved')
        setProfileCompleted(true)
        setFirstToolVisited(true)
        setStep('first_tool')
      } else {
        setDiagnostic({
          whatHappened: result.message,
          financialImpact: FINANCIAL_NO_UPDATE,
          nextStep: SAVE_FAILURE_DIAGNOSTIC.nextStep,
        })
        setInvalidField(undefined)
      }
    } catch (cause) {
      void cause
      setDiagnostic(SAVE_FAILURE_DIAGNOSTIC)
      setInvalidField(undefined)
    } finally {
      setPending(false)
    }
  }

  const handleNameChange = (value: string) => {
    setName(value)
    setDiagnostic(undefined)
    setInvalidField(undefined)
  }

  const handleWebsiteChange = (value: string) => {
    setWebsite(value)
    setDiagnostic(undefined)
    setInvalidField(undefined)
  }

  const handleAbnChange = (value: string) => {
    const formatted = formatAbnDisplay(value)
    setAbn(formatted)
    setDiagnostic(undefined)
    setInvalidField(undefined)
  }


  const view: SupplierOnboardingWizardViewState = {
    step,
    name,
    website,
    abn,
    diagnostic,
    invalidField,
    pending,
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
  }
}

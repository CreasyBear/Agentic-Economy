import type { FormEvent } from 'react'
import type { Rule4Diagnostic } from '@/lib/ui/diagnostic'
import type {
  SupplierOnboardingProfile,
  SupplierOnboardingSaveResult,
  SupplierOnboardingStep,
} from '@/modules/capability-supply/supplier-onboarding.contracts'

export type AeSupplierOnboardingWizardProps = Readonly<{
  currentStep?: SupplierOnboardingStep
  providerName?: string
  onSaveProfile?: (profile: SupplierOnboardingProfile) => Promise<SupplierOnboardingSaveResult>
}>


export type SupplierOnboardingWizardPorts = Readonly<{
  currentStep?: SupplierOnboardingStep
  providerName?: string
  onSaveProfile?: (profile: SupplierOnboardingProfile) => Promise<SupplierOnboardingSaveResult>
}>

export type SupplierOnboardingWizardViewState = Readonly<{
  step: SupplierOnboardingStep
  name: string
  website: string
  diagnostic: Rule4Diagnostic | undefined
  invalidField: ProviderIdentityFieldId | undefined
  pending: boolean
}>



export type ProviderIdentityFieldId = 'name' | 'website'

export type ProviderIdentityFieldsProps = Readonly<{
  name: string
  website: string
  pending: boolean
  invalidField?: ProviderIdentityFieldId
  fieldError?: string
  onNameChange: (value: string) => void
  onWebsiteChange: (value: string) => void
  onSubmit: (e: Pick<FormEvent, 'preventDefault'>) => void
}>


export type FirstToolStepProps = Readonly<Record<string, never>>

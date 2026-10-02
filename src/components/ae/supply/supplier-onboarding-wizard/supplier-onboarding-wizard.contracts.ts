import { Building2Icon, WrenchIcon } from 'lucide-react'
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

export const STEP_META: ReadonlyArray<{
  id: SupplierOnboardingStep
  label: string
  duration: string
  icon: typeof Building2Icon
}> = [
  { id: 'profile', label: '1. Provider identity', duration: '~2 mins', icon: Building2Icon },
  { id: 'first_tool', label: '2. First Tool', duration: '~1 min', icon: WrenchIcon },
]

export type SupplierOnboardingWizardPorts = Readonly<{
  currentStep?: SupplierOnboardingStep
  providerName?: string
  onSaveProfile?: (profile: SupplierOnboardingProfile) => Promise<SupplierOnboardingSaveResult>
}>

export type SupplierOnboardingWizardViewState = Readonly<{
  step: SupplierOnboardingStep
  name: string
  website: string
  abn: string
  diagnostic: Rule4Diagnostic | undefined
  invalidField: ProviderIdentityFieldId | undefined
  pending: boolean
}>

export type OnboardingStepperProps = Readonly<{
  step: SupplierOnboardingStep
  isVisited: (stepId: SupplierOnboardingStep) => boolean
  isCompleted: (stepId: SupplierOnboardingStep) => boolean
  onGoToStep: (stepId: SupplierOnboardingStep) => void
}>

export type ProviderIdentityFieldId = 'name' | 'website' | 'abn'

export type ProviderIdentityFieldsProps = Readonly<{
  name: string
  website: string
  abn: string
  pending: boolean
  invalidField?: ProviderIdentityFieldId
  fieldError?: string
  onNameChange: (value: string) => void
  onWebsiteChange: (value: string) => void
  onAbnChange: (value: string) => void
  onSubmit: (e: Pick<FormEvent, 'preventDefault'>) => void
}>


export type FirstToolStepProps = Readonly<Record<string, never>>

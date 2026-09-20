import {
  Building2Icon,
  CreditCardIcon,
  WrenchIcon,
} from 'lucide-react'
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
  payoutsConfigured?: boolean
  onSaveProfile?: (profile: SupplierOnboardingProfile) => Promise<SupplierOnboardingSaveResult>
  onConnectPayouts?: () => void | Promise<void>
}>

export const TACTILE =
  'enabled:active:scale-[0.98] transition-transform duration-100 ease-out motion-reduce:transition-none motion-reduce:active:scale-100'
export const SHELL = 'min-h-[28rem]'
export const SLOT = 'min-h-[3rem]'
export const ABN_INPUT_CLASS = 'text-sm font-mono tabular-nums'

export const STEP_META: ReadonlyArray<{
  id: SupplierOnboardingStep
  label: string
  duration: string
  icon: typeof Building2Icon
}> = [
  { id: 'profile', label: '1. Provider Identity', duration: '~2 mins', icon: Building2Icon },
  { id: 'payouts', label: '2. Payout Account (Stripe)', duration: '~3 mins', icon: CreditCardIcon },
  { id: 'first_tool', label: '3. First Tool Publication', duration: '~1 min', icon: WrenchIcon },
]

export type SupplierOnboardingWizardPorts = Readonly<{
  currentStep?: SupplierOnboardingStep
  providerName?: string
  payoutsConfigured?: boolean
  onSaveProfile?: (profile: SupplierOnboardingProfile) => Promise<SupplierOnboardingSaveResult>
  onConnectPayouts?: () => void | Promise<void>
}>

export type SupplierOnboardingWizardViewState = Readonly<{
  step: SupplierOnboardingStep
  name: string
  website: string
  abn: string
  diagnostic: Rule4Diagnostic | undefined
  pending: boolean
  payoutsConfigured: boolean
}>

export type OnboardingStepperProps = Readonly<{
  step: SupplierOnboardingStep
  isVisited: (stepId: SupplierOnboardingStep) => boolean
  isCompleted: (stepId: SupplierOnboardingStep) => boolean
  onGoToStep: (stepId: SupplierOnboardingStep) => void
}>

export type ProviderIdentityFieldsProps = Readonly<{
  name: string
  website: string
  abn: string
  pending: boolean
  onNameChange: (value: string) => void
  onWebsiteChange: (value: string) => void
  onAbnChange: (value: string) => void
  onSubmit: (e: Pick<FormEvent, 'preventDefault'>) => void
}>

export type PayoutsStepProps = Readonly<{
  payoutsConfigured: boolean
  onConnectPayouts: () => void
  onSkipForNow: () => void
}>

export type FirstToolStepProps = Readonly<Record<string, never>>

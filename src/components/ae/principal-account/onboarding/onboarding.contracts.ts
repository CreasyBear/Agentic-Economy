import type { RefObject } from 'react'

import type { OnboardingRoleIntent } from '@/modules/principal-account/onboarding.contracts'

export type AeOnboardingPageProps = Readonly<{
  redirect?: string
}>

export type OnboardingWizardStep = 1 | 2

export type OnboardingSurface =
  | Readonly<{ kind: 'opening' }>
  | Readonly<{
      kind: 'role'
      roleIntent: OnboardingRoleIntent | null
      continueDisabled: boolean
    }>
  | Readonly<{
      kind: 'workspace'
      workspaceName: string
      finishDisabled: boolean
      submitting: boolean
    }>

export type UseOnboardingPageInput = AeOnboardingPageProps

export type UseOnboardingPageResult = Readonly<{
  surface: OnboardingSurface
  workspaceInputRef: RefObject<HTMLInputElement | null>
  onRoleIntentChange: (intent: OnboardingRoleIntent) => void
  onContinue: () => void
  onWorkspaceNameChange: (value: string) => void
  onBack: () => void
  onFinish: () => void
}>

export type OnboardingStepIndicatorProps = Readonly<{
  step: OnboardingWizardStep
}>

export type OnboardingRoleStepProps = Readonly<{
  roleIntent: OnboardingRoleIntent | null
  continueDisabled: boolean
  onRoleIntentChange: (intent: OnboardingRoleIntent) => void
  onContinue: () => void
}>

export type OnboardingWorkspaceStepProps = Readonly<{
  workspaceName: string
  finishDisabled: boolean
  submitting: boolean
  workspaceInputRef: RefObject<HTMLInputElement | null>
  onWorkspaceNameChange: (value: string) => void
  onBack: () => void
  onFinish: () => void
}>

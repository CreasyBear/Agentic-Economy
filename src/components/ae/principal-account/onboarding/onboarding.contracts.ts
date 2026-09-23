import type { RefObject } from 'react'

import type {
  OnboardingRoleIntent,
  OnboardingSearch,
} from '@/modules/principal-account/onboarding.contracts'

export type AeOnboardingPageProps = OnboardingSearch

export type OnboardingWizardStep = 1 | 2

export const ONBOARDING_ROLE_COPY = {
  buyer: {
    label: 'Buy with an Agent',
    description: 'Unlocks Market, Agents, Credit, and Call records.',
  },
  supplier: {
    label: 'Provide a Tool',
    description: 'Unlocks Provider Operations to publish Tools and manage Calls.',
  },
} as const satisfies Record<
  OnboardingRoleIntent,
  Readonly<{ label: string; description: string }>
>

export const ONBOARDING_ROLE_REQUIRED = 'Choose a role to continue.'
export const ONBOARDING_NAME_REQUIRED = 'Enter a workspace name.'

export function onboardingCompletionDescription(
  redirect: string | undefined,
  roleIntent: OnboardingRoleIntent | null,
): string {
  if (redirect !== undefined) return `Create workspace continues to ${redirect}.`
  return roleIntent === 'supplier'
    ? 'Create workspace opens Provider Operations.'
    : 'Create workspace opens Workspace overview.'
}

export type OnboardingSurface =
  | Readonly<{ kind: 'opening' }>
  | Readonly<{
      kind: 'role'
      roleIntent: OnboardingRoleIntent | null
      roleInvalid: boolean
    }>
  | Readonly<{
      kind: 'workspace'
      workspaceName: string
      finishDisabled: boolean
      submitting: boolean
      nameInvalid: boolean
      completionDescription: string
    }>

export type UseOnboardingPageInput = AeOnboardingPageProps

export type UseOnboardingPageResult = Readonly<{
  surface: OnboardingSurface
  workspaceInputRef: RefObject<HTMLInputElement | null>
  buyerRadioRef: RefObject<HTMLButtonElement | null>
  supplierRadioRef: RefObject<HTMLButtonElement | null>
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
  roleInvalid: boolean
  buyerRadioRef: RefObject<HTMLButtonElement | null>
  supplierRadioRef: RefObject<HTMLButtonElement | null>
  onRoleIntentChange: (intent: OnboardingRoleIntent) => void
  onContinue: () => void
}>

export type OnboardingWorkspaceStepProps = Readonly<{
  workspaceName: string
  finishDisabled: boolean
  submitting: boolean
  nameInvalid: boolean
  completionDescription: string
  workspaceInputRef: RefObject<HTMLInputElement | null>
  onWorkspaceNameChange: (value: string) => void
  onBack: () => void
  onFinish: () => void
}>

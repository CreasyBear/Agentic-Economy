export type OnboardingRoleIntent = 'buyer' | 'supplier'

export type OnboardingRedirectPath = '/owner' | '/owner/operations'

export type OnboardingSearch = Readonly<{
  redirect?: string
}>

export type OnboardingReadState =
  | Readonly<{
    phase: 'incomplete'
    accountRef: string
    suggestedWorkspaceName: string
  }>
  | Readonly<{
    phase: 'complete'
    accountRef: string
    roleIntent: OnboardingRoleIntent
    redirectPath: OnboardingRedirectPath
  }>

export type OnboardingCompleteResult = Readonly<{
  kind: 'completed'
  accountRef: string
  roleIntent: OnboardingRoleIntent
  workspaceName: string
  redirectPath: OnboardingRedirectPath
  revision: number
}>

export type OnboardingCompletionDiagnostic = Readonly<{
  title: string
  description: string
}>

export type OnboardingCompletionRefusalCode =
  | 'display_name_invalid'
  | 'onboarding_already_complete'
  | 'identity_invalid'
  | 'binding_missing'
  | 'binding_inactive'
  | 'binding_ambiguous'
  | 'ownership_mismatch'

const FINANCIAL_SAFE_SUFFIX = 'No charge was created.'

export function resolveSuggestedWorkspaceName(suggested: string): string {
  const trimmed = suggested.trim()
  if (trimmed.length === 0 || trimmed === 'Workspace' || trimmed.startsWith('user_')) {
    return 'Acme'
  }
  return trimmed
}

export function initialRoleIntentFromRedirect(redirect?: string): OnboardingRoleIntent | null {
  if (redirect?.startsWith('/agent-access') === true) return 'buyer'
  if (redirect?.startsWith('/owner') === true) return 'supplier'
  return null
}

function resolveInteractiveAuthorityCode(error: unknown): string | undefined {
  if (error !== null && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string') return code
  }
  if (error instanceof Error) return error.message
  return undefined
}

export function onboardingCompletionDiagnostic(error: unknown): OnboardingCompletionDiagnostic {
  const code = resolveInteractiveAuthorityCode(error)
  switch (code) {
    case 'display_name_invalid':
      return {
        title: 'Workspace name was not accepted',
        description: `Use letters, numbers, or common punctuation. ${FINANCIAL_SAFE_SUFFIX}`,
      }
    case 'onboarding_already_complete':
      return {
        title: 'Workspace setup is already finished',
        description: `Refresh the page to open your workspace. ${FINANCIAL_SAFE_SUFFIX}`,
      }
    case 'identity_invalid':
    case 'binding_missing':
    case 'binding_inactive':
    case 'binding_ambiguous':
      return {
        title: 'Sign-in session expired',
        description: `Sign in again and retry workspace setup. ${FINANCIAL_SAFE_SUFFIX}`,
      }
    case 'ownership_mismatch':
      return {
        title: 'You do not have permission to finish setup',
        description: `Use the account owner sign-in, then try again. ${FINANCIAL_SAFE_SUFFIX}`,
      }
    default:
      return {
        title: 'Workspace setup could not finish',
        description: `Try again in a moment. ${FINANCIAL_SAFE_SUFFIX}`,
      }
  }
}

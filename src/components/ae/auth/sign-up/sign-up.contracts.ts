export const methodsBlurb = 'Use email, Google, GitHub, or a passkey.'

export type AeSignUpPageProps = Readonly<{
  redirect?: string
}>

export type SignUpCopy = Readonly<{
  heading: string
  body: string
}>

export type SignUpSwitchSearch =
  | Readonly<Record<never, never>>
  | Readonly<{ redirect: string }>

export type SignUpLegalFooterProps = Readonly<{
  switchSearch: SignUpSwitchSearch
}>

export type UseSignUpPageResult = Readonly<{
  heading: string
  body: string
  titleId: 'sign-up-context-heading'
  labelledBy: 'sign-up-context-heading'
  stageUrl: '/sign-up'
  onboardingRedirectUrl: string
  signInFallbackRedirectUrl: string
  signInUrl: '/sign-in'
  switchSearch: SignUpSwitchSearch
}>

export function projectSignUpCopy(redirect: string | undefined): SignUpCopy {
  const isAgentAccessFlow = redirect?.startsWith('/agent-access') ?? false
  const isProviderFlow = redirect?.startsWith('/owner') ?? false
  const heading = isAgentAccessFlow
    ? 'Create an account to connect an Agent'
    : isProviderFlow
      ? 'Create a Provider account'
      : 'Create an account'
  const body = isAgentAccessFlow
    ? `${methodsBlurb} After you create your account, you’ll return to the Agent connection you started.`
    : isProviderFlow
      ? `${methodsBlurb} After you create your account, you’ll continue to the Tool publishing Workspace.`
      : redirect === undefined
        ? `${methodsBlurb} After you create your account, you’ll set up your Workspace.`
        : `${methodsBlurb} After you create your account, you’ll return to where you left off.`
  return { heading, body }
}

export function buildOnboardingRedirectUrl(redirect: string | undefined): string {
  return redirect === undefined
    ? '/onboarding'
    : `/onboarding?redirect=${encodeURIComponent(redirect)}`
}

export function buildSwitchSearch(redirect: string | undefined): SignUpSwitchSearch {
  return redirect === undefined ? {} : { redirect }
}

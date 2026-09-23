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

function isSupplyReturn(redirect: string): boolean {
  return (
    redirect === '/owner/operations' ||
    redirect.startsWith('/owner/operations/') ||
    redirect === '/owner/supply' ||
    redirect.startsWith('/owner/supply/')
  )
}

export function projectSignUpCopy(redirect: string | undefined): SignUpCopy {
  const heading = 'Create an account'
  if (redirect !== undefined && isSupplyReturn(redirect)) {
    return {
      heading,
      body: 'After you create your account, you’ll continue to the Tool publishing Workspace.',
    }
  }
  if (redirect?.startsWith('/agent-access') ?? false) {
    return {
      heading,
      body: 'After you create your account, you’ll return to the Agent connection you started.',
    }
  }
  if (redirect === undefined) {
    return {
      heading,
      body: 'After you create your account, you’ll set up your Workspace.',
    }
  }
  return {
    heading,
    body: 'After you create your account, you’ll return to where you left off.',
  }
}

export function buildOnboardingRedirectUrl(redirect: string | undefined): string {
  return redirect === undefined
    ? '/onboarding'
    : `/onboarding?redirect=${encodeURIComponent(redirect)}`
}

export function buildSwitchSearch(redirect: string | undefined): SignUpSwitchSearch {
  return redirect === undefined ? {} : { redirect }
}

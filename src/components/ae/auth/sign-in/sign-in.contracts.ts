export const methodsBlurb = 'Use email, Google, GitHub, or a passkey.'

export type AeSignInPageProps = Readonly<{
  redirect?: string
}>

export type SignInCopy = Readonly<{
  heading: string
  body: string
}>

export type UseSignInPageResult = Readonly<{
  heading: string
  body: string
  titleId: 'sign-in-context-heading'
  labelledBy: 'sign-in-context-heading'
  stageUrl: '/sign-in'
  fallbackRedirectUrl: string
  signUpFallbackRedirectUrl: string
  signUpUrl: '/sign-up'
}>

export function projectSignInCopy(redirect: string | undefined): SignInCopy {
  const isAgentAccessFlow = redirect?.startsWith('/agent-access') ?? false
  const isProviderFlow = redirect?.startsWith('/owner') ?? false
  const heading = isAgentAccessFlow
    ? 'Sign in to connect an agent'
    : isProviderFlow
      ? 'Sign in to manage Tools'
      : 'Sign in'
  const body = isAgentAccessFlow
    ? `${methodsBlurb} After you sign in, you’ll return to the agent connection you started.`
    : isProviderFlow
      ? `${methodsBlurb} After you sign in, you’ll return to your Provider workspace.`
      : `${methodsBlurb} After you sign in, you’ll return to where you left off.`
  return { heading, body }
}

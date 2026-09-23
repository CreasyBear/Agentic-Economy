import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'

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

export function resolveSignInRedirectTarget(value: unknown): string {
  return sanitizeAuthRedirectTarget(value) ?? '/market'
}

function isSupplyReturn(redirect: string | undefined): boolean {
  if (redirect === undefined) return false
  return (
    redirect === '/owner/operations' ||
    redirect.startsWith('/owner/operations/') ||
    redirect === '/owner/supply' ||
    redirect.startsWith('/owner/supply/')
  )
}

export function projectSignInCopy(redirect: string | undefined): SignInCopy {
  const isAgentAccessFlow = redirect?.startsWith('/agent-access') ?? false
  const isProviderFlow = isSupplyReturn(redirect)
  const heading = isAgentAccessFlow
    ? 'Sign in to connect an Agent'
    : isProviderFlow
      ? 'Sign in to manage Tools'
      : 'Sign in'
  const body = isAgentAccessFlow
    ? 'After you sign in, you’ll return to the Agent connection you started.'
    : isProviderFlow
      ? 'After you sign in, you’ll return to your Provider Workspace.'
      : 'After you sign in, you’ll continue on Market.'
  return { heading, body }
}

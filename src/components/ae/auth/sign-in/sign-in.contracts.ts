import { ADMIN_NAVIGATION } from '@/components/ae/layout/app-shell/app-shell.contracts'
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'
import { appDestination, resolveAppDestination } from '@/lib/navigation/app-navigation'

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

function preservedDestination(redirect: string): string | null {
  const hashStart = redirect.indexOf('#')
  const queryStart = redirect.indexOf('?')
  const cuts = [hashStart, queryStart].filter((index) => index >= 0)
  const pathname = cuts.length === 0 ? redirect : redirect.slice(0, Math.min(...cuts))
  const hash = hashStart >= 0 ? redirect.slice(hashStart + 1) : undefined
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    const match = [...ADMIN_NAVIGATION]
      .sort((left, right) => right.href.length - left.href.length)
      .find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    if (match !== undefined && match.href !== '/admin') return match.label
    return 'Admin'
  }
  const destination = resolveAppDestination(pathname, hash)
  if (destination === null) return 'the page you requested'
  if (destination === 'market' || destination === 'agents' || destination === 'tools') return null
  return appDestination(destination).label
}

export function projectSignInCopy(redirect: string | undefined): SignInCopy {
  const isAgentAccessFlow = redirect?.startsWith('/agent-access') ?? false
  const isProviderFlow = isSupplyReturn(redirect)
  const destination = !isAgentAccessFlow && !isProviderFlow && redirect !== undefined
    ? preservedDestination(redirect)
    : null
  const heading = isAgentAccessFlow
    ? 'Sign in to connect an Agent'
    : isProviderFlow
      ? 'Sign in to manage Tools'
      : 'Sign in'
  const body = isAgentAccessFlow
    ? 'After you sign in, you’ll return to the Agent connection you started.'
    : isProviderFlow
      ? 'After you sign in, you’ll return to your Provider Workspace.'
      : destination === null
        ? 'After you sign in, you’ll continue on Market.'
        : `After you sign in, you’ll continue on ${destination}.`
  return { heading, body }
}

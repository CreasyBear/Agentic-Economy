import { useAuth } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import { AeSignInPage } from '@/components/ae/auth/sign-in/AeSignInPage'
import { resolveSignInRedirectTarget } from '@/components/ae/auth/sign-in/sign-in.contracts'
import { sanitizeAuthRedirectTarget, type AuthRedirectSearch } from '@/lib/client/auth-redirect'

export { SignInClerkFallback } from '@/components/ae/auth/sign-in/AeSignInPage'

export const Route = createFileRoute('/sign-in/$')({
  staticData: { shellMode: 'minimal' },
  validateSearch: (search: Record<string, unknown>): AuthRedirectSearch => {
    const redirect = sanitizeAuthRedirectTarget(search.redirect)
    return redirect === undefined ? {} : { redirect }
  },
  head: () => ({
    meta: [
      { title: 'Sign in | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SignInRoute,
})

function SignInRoute() {
  const { redirect } = Route.useSearch()
  const { isLoaded, isSignedIn } = useAuth()
  const redirectTarget = resolveSignInRedirectTarget(redirect)

  useEffect(() => {
    if (isLoaded && isSignedIn) window.location.replace(redirectTarget)
  }, [isLoaded, isSignedIn, redirectTarget])

  if (isLoaded && isSignedIn) return null
  return <AeSignInPage {...(redirect === undefined ? {} : { redirect })} />
}

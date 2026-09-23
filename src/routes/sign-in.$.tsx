import { createFileRoute } from '@tanstack/react-router'

import { AeSignInPage } from '@/components/ae/auth/sign-in/AeSignInPage'
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
  return <AeSignInPage {...(redirect === undefined ? {} : { redirect })} />
}

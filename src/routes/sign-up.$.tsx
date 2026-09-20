import { createFileRoute } from '@tanstack/react-router'

import { AeSignUpPage } from '@/components/ae/auth/sign-up/AeSignUpPage'
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'

export { SignUpClerkFallback } from '@/components/ae/auth/sign-up/AeSignUpPage'

type SignUpSearch = {
  redirect?: string
}

export const Route = createFileRoute('/sign-up/$')({
  staticData: { shellMode: 'minimal' },
  validateSearch: (search: Record<string, unknown>): SignUpSearch => {
    const redirect = sanitizeAuthRedirectTarget(search.redirect)
    return redirect === undefined ? {} : { redirect }
  },
  head: () => ({
    meta: [
      { title: 'Sign up | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SignUpRoute,
})

function SignUpRoute() {
  const { redirect } = Route.useSearch()
  return <AeSignUpPage {...(redirect === undefined ? {} : { redirect })} />
}

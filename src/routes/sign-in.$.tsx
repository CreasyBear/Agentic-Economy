import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import {
  AeSiteAuthPanel,
  AeSiteAuthStage,
  clerkSignInSurfaceAppearance,
} from '@/components/ae/website'
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'

type SignInSearch = {
  redirect?: string
}

export const Route = createFileRoute('/sign-in/$')({
  validateSearch: (search: Record<string, unknown>): SignInSearch => {
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
  const isAgentAccessFlow = redirect?.startsWith('/agent-access') ?? false
  const isProviderFlow = redirect?.startsWith('/owner') ?? false
  const heading = isAgentAccessFlow
    ? 'Sign in to connect an agent'
    : isProviderFlow
      ? 'Sign in to manage Tools'
      : 'Sign in'
  const body = isAgentAccessFlow
    ? 'After you sign in, you’ll return to the agent connection you started.'
    : isProviderFlow
      ? 'After you sign in, you’ll return to your Provider workspace.'
      : 'After you sign in, you’ll return to where you left off.'
  return (
    <AePublicPage>
      <AeSiteAuthStage labelledBy="sign-in-context-heading" url="/sign-in">
        <AeSiteAuthPanel
          eyebrow="Account"
          title={heading}
          titleId="sign-in-context-heading"
          body={body}
        >
          <SignIn
            appearance={clerkSignInSurfaceAppearance}
            fallbackRedirectUrl={redirect ?? '/owner/settings'}
            signUpUrl="/sign-up"
          />
        </AeSiteAuthPanel>
      </AeSiteAuthStage>
    </AePublicPage>
  )
}

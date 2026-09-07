import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import {
  AeSiteAuthPanel,
  AeSiteAuthStage,
  AeSiteButton,
  clerkSignInSurfaceAppearance,
} from '@/components/ae/website'
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'

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
  const isLocalE2E = isLocalE2EAuthBypassEnabled()
  const isAgentAccessFlow = redirect?.startsWith('/agent-access') ?? false
  const isProviderFlow = redirect?.startsWith('/owner') ?? false
  const heading = isLocalE2E
    ? 'Local preview sign-in is off'
    : isAgentAccessFlow
      ? 'Sign in to connect an agent'
      : isProviderFlow
        ? 'Sign in to manage Tools'
        : 'Sign in'
  const body = isLocalE2E
    ? 'This browser journey does not connect a Clerk account. Nothing is signed in or authorized.'
    : isAgentAccessFlow
      ? 'After you sign in, you’ll return to the agent connection you started.'
      : isProviderFlow
        ? 'After you sign in, you’ll return to your Provider workspace.'
        : redirect === undefined
          ? 'After you sign in, you’ll return to your account settings.'
          : 'After you sign in, you’ll return to where you left off.'
  return (
    <AePublicPage>
      <AeSiteAuthStage labelledBy="sign-in-context-heading" url="/sign-in">
        {isLocalE2E ? (
          <AeSiteAuthPanel
            eyebrow="Local preview"
            title={heading}
            titleId="sign-in-context-heading"
            body={body}
          >
            <AeSiteButton asChild>
              <a href={isAgentAccessFlow ? '/agent-access' : '/market?window=30d#tools'}>
                {isAgentAccessFlow ? 'Open agent access preview' : 'Browse the catalog'}
              </a>
            </AeSiteButton>
          </AeSiteAuthPanel>
        ) : (
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
        )}
      </AeSiteAuthStage>
    </AePublicPage>
  )
}

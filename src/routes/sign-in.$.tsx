import { SignIn } from '@clerk/tanstack-react-start'
import { Link, createFileRoute } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import {
  AeSiteAuthPanel,
  AeSiteAuthStage,
  AeSiteButton,
  clerkAuthSurfaceAppearance,
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
  const isProviderFlow = redirect === undefined || redirect.startsWith('/owner')
  const heading = isLocalE2E
    ? 'Local preview sign-in is off'
    : isAgentAccessFlow
      ? 'Sign in to connect an agent'
      : isProviderFlow
        ? 'Sign in to manage Operations'
        : 'Sign in'
  const body = isLocalE2E
    ? 'This browser journey does not connect a Clerk account. Nothing is signed in or authorized.'
    : isAgentAccessFlow
      ? 'After you sign in, you’ll return to Access and create a caller identity.'
      : 'After you sign in, you’ll return to your supplier workspace.'
  const switchSearch = redirect === undefined ? {} : { redirect }

  return (
    <AePublicShell>
      <AeSiteAuthStage labelledBy="sign-in-context-heading" url="/sign-in">
        {isLocalE2E ? (
          <AeSiteAuthPanel
            eyebrow="Local preview"
            title={heading}
            titleId="sign-in-context-heading"
            body={body}
          >
            <AeSiteButton asChild>
              <a href={isAgentAccessFlow ? '/agent-access' : '/market?window=30d#operations'}>
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
            footer={
              <>
                Don’t have an account?{' '}
                <Link
                  to="/sign-up/$"
                  params={{ _splat: '' }}
                  search={switchSearch}
                  className="inline-flex min-h-touch items-center font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Create one
                </Link>
              </>
            }
          >
            <SignIn
              appearance={clerkAuthSurfaceAppearance}
              fallbackRedirectUrl={redirect ?? '/owner/offerings'}
              signUpUrl="/sign-up"
            />
          </AeSiteAuthPanel>
        )}
      </AeSiteAuthStage>
    </AePublicShell>
  )
}

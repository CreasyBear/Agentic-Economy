import { SignUp } from '@clerk/tanstack-react-start'
import { Link, createFileRoute } from '@tanstack/react-router'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import {
  AeSiteAuthPanel,
  AeSiteAuthStage,
  AeSiteButton,
  clerkAuthSurfaceAppearance,
} from '@/components/ae/website'
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'

type SignUpSearch = {
  redirect?: string
}

export const Route = createFileRoute('/sign-up/$')({
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
  const isLocalE2E = isLocalE2EAuthBypassEnabled()
  const isAgentAccessFlow = redirect?.startsWith('/agent-access') ?? false
  const isProviderFlow = redirect?.startsWith('/owner') ?? false
  const heading = isLocalE2E
    ? 'Local preview sign-up is off'
    : isAgentAccessFlow
      ? 'Create an account to connect an agent'
      : isProviderFlow
        ? 'Create a Provider account'
        : 'Create an account'
  const body = isLocalE2E
    ? 'This browser journey does not connect a Clerk account. Nothing is signed in or authorized.'
    : isAgentAccessFlow
      ? 'After you create your account, you’ll return to the agent connection you started.'
      : isProviderFlow
        ? 'After you create your account, you’ll continue to the Tool publishing workspace.'
        : redirect === undefined
          ? 'After you create your account, you’ll return to your account settings.'
          : 'After you create your account, you’ll return to where you left off.'
  const switchSearch = redirect === undefined ? {} : { redirect }

  return (
    <AePublicPage>
      <AeSiteAuthStage labelledBy="sign-up-context-heading" url="/sign-up">
        {isLocalE2E ? (
          <AeSiteAuthPanel
            eyebrow="Local preview"
            title={heading}
            titleId="sign-up-context-heading"
            body={body}
          >
            <AeSiteButton asChild>
              <Link to="/market" search={{ window: '30d' }} hash="tools">
                Browse the catalog
              </Link>
            </AeSiteButton>
          </AeSiteAuthPanel>
        ) : (
          <AeSiteAuthPanel
            eyebrow="Account"
            title={heading}
            titleId="sign-up-context-heading"
            body={body}
            footer={
              <div className="grid gap-related">
                <p>
                  Already have an account?{' '}
                  <Link
                    to="/sign-in/$"
                    params={{ _splat: '' }}
                    search={switchSearch}
                    className="inline-flex min-h-touch items-center font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Sign in
                  </Link>
                </p>
                <p>
                  By continuing you agree to the{' '}
                  <Link
                    to="/terms"
                    className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Terms
                  </Link>
                  {' '}and{' '}
                  <Link
                    to="/privacy"
                    className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Privacy
                  </Link>
                  .
                </p>
              </div>
            }
          >
            <SignUp
              appearance={clerkAuthSurfaceAppearance}
              fallbackRedirectUrl={redirect ?? '/owner/settings'}
              signInUrl="/sign-in"
            />
          </AeSiteAuthPanel>
        )}
      </AeSiteAuthStage>
    </AePublicPage>
  )
}

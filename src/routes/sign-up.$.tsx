import { SignUp } from '@clerk/tanstack-react-start'
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
  const heading = isLocalE2E
    ? 'Local preview sign-up is off'
    : isAgentAccessFlow
      ? 'Create an account to connect an agent'
      : 'Create a supplier account'
  const body = isLocalE2E
    ? 'This browser journey does not connect a Clerk account. Nothing is signed in or authorized.'
    : isAgentAccessFlow
      ? 'After you create your account, you’ll return to Access and create a caller identity.'
      : 'After you create your account, you’ll continue to the Operation publishing workspace.'
  const switchSearch = redirect === undefined ? {} : { redirect }

  return (
    <AePublicShell>
      <AeSiteAuthStage labelledBy="sign-up-context-heading" url="/sign-up">
        {isLocalE2E ? (
          <AeSiteAuthPanel
            eyebrow="Local preview"
            title={heading}
            titleId="sign-up-context-heading"
            body={body}
          >
            <AeSiteButton asChild>
              <Link to="/market" search={{ window: '30d' }} hash="operations">
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
              fallbackRedirectUrl={redirect ?? '/owner/offerings'}
              signInUrl="/sign-in"
            />
          </AeSiteAuthPanel>
        )}
      </AeSiteAuthStage>
    </AePublicShell>
  )
}

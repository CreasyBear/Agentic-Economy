import { SignUp } from '@clerk/tanstack-react-start'
import { Link, createFileRoute } from '@tanstack/react-router'
import type { SignUpProps } from '@clerk/shared/types'
import type { ReactNode } from 'react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import {
  AeSiteAuthPanel,
  AeSiteAuthStage,
  clerkAuthSurfaceAppearance,
} from '@/components/ae/website'
import { sanitizeAuthRedirectTarget } from '@/lib/client/auth-redirect'

type SignUpSearch = {
  redirect?: string
}

const methodsBlurb = 'Use email, Google, GitHub, or a passkey.'

export function SignUpClerkFallback() {
  return (
    <div
      data-slot="ae-site-auth-clerk-fallback"
      className="grid min-h-96 w-full gap-related"
      aria-hidden
    >
      <div className="min-h-touch bg-muted" />
      <div className="min-h-touch bg-foreground/20" />
      <div className="min-h-touch border border-border bg-muted/40" />
      <div className="min-h-touch border border-border bg-muted/40" />
    </div>
  )
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
  const isAgentAccessFlow = redirect?.startsWith('/agent-access') ?? false
  const isProviderFlow = redirect?.startsWith('/owner') ?? false
  const heading = isAgentAccessFlow
    ? 'Create an account to connect an agent'
    : isProviderFlow
      ? 'Create a Provider account'
      : 'Create an account'
  const body = isAgentAccessFlow
    ? `${methodsBlurb} After you create your account, you’ll return to the agent connection you started.`
    : isProviderFlow
      ? `${methodsBlurb} After you create your account, you’ll continue to the Tool publishing workspace.`
      : redirect === undefined
        ? `${methodsBlurb} After you create your account, you’ll set up your workspace.`
        : `${methodsBlurb} After you create your account, you’ll return to where you left off.`
  const switchSearch = redirect === undefined ? {} : { redirect }
  const onboardingRedirectUrl = redirect === undefined
    ? '/onboarding'
    : `/onboarding?redirect=${encodeURIComponent(redirect)}`

  const signUpProps: SignUpProps & { fallback?: ReactNode } = {
    appearance: clerkAuthSurfaceAppearance,
    fallback: <SignUpClerkFallback />,
    fallbackRedirectUrl: onboardingRedirectUrl,
    forceRedirectUrl: onboardingRedirectUrl,
    signInFallbackRedirectUrl: redirect ?? '/owner/settings',
    signInUrl: '/sign-in',
  }

  return (
    <AePublicPage>
      <AeSiteAuthStage labelledBy="sign-up-context-heading" url="/sign-up">
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
          <SignUp {...signUpProps} />
        </AeSiteAuthPanel>
      </AeSiteAuthStage>
    </AePublicPage>
  )
}

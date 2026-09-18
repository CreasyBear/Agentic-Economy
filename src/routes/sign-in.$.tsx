import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'
import type { SignInProps } from '@clerk/shared/types'
import type { ReactNode } from 'react'

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

const methodsBlurb = 'Use email, Google, GitHub, or a passkey.'

export function SignInClerkFallback() {
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
    ? `${methodsBlurb} After you sign in, you’ll return to the agent connection you started.`
    : isProviderFlow
      ? `${methodsBlurb} After you sign in, you’ll return to your Provider workspace.`
      : `${methodsBlurb} After you sign in, you’ll return to where you left off.`

  const signInProps: SignInProps & { fallback?: ReactNode } = {
    appearance: clerkSignInSurfaceAppearance,
    fallback: <SignInClerkFallback />,
    fallbackRedirectUrl: redirect ?? '/owner/settings',
    signUpFallbackRedirectUrl: redirect ?? '/owner/settings',
    signUpUrl: '/sign-up',
  }

  return (
    <AePublicPage>
      <AeSiteAuthStage labelledBy="sign-in-context-heading" url="/sign-in">
        <AeSiteAuthPanel
          eyebrow="Account"
          title={heading}
          titleId="sign-in-context-heading"
          body={body}
        >
          <SignIn {...signInProps} />
        </AeSiteAuthPanel>
      </AeSiteAuthStage>
    </AePublicPage>
  )
}

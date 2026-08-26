import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
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
  const contextHeading = isAgentAccessFlow ? 'Sign in to connect an agent' : 'Sign in to manage Operations'
  const contextText = isAgentAccessFlow
    ? 'After you sign in, you’ll return to Access and create a caller identity.'
    : 'After you sign in, you’ll return to your supplier workspace.'

  return (
    <AePublicShell>
      <div className="ae-rail grid min-h-full w-full max-w-lg place-items-center py-page">
        <section className="grid w-full gap-6" aria-labelledby={isLocalE2E || (!isProviderFlow && !isAgentAccessFlow) ? undefined : 'sign-in-context-heading'}>
          {isLocalE2E ? (
            <div className="grid gap-4">
              <div className="grid gap-1">
                <h1 id="sign-in-context-heading" className="text-3xl font-semibold leading-tight tracking-tight text-balance text-foreground">Local preview sign-in is off</h1>
                <p className="block text-muted-foreground">This browser journey does not connect a Clerk account. Nothing is signed in or authorized.</p>
              </div>
              <Button asChild variant="default" className="min-h-11 justify-self-start"><a href={isAgentAccessFlow ? '/agent-access' : '/market?window=30d#operations'}>{isAgentAccessFlow ? 'Open agent access preview' : 'Browse the catalog'}</a></Button>
            </div>
          ) : (
            <>
              {isProviderFlow || isAgentAccessFlow ? (
                <div className="grid gap-1">
                  <h1 id="sign-in-context-heading" className="text-3xl font-semibold leading-tight tracking-tight text-balance text-foreground">{contextHeading}</h1>
                  <p className="block text-muted-foreground">{contextText}</p>
                </div>
              ) : null}
              <SignIn fallbackRedirectUrl={redirect ?? '/owner/offerings'} signUpUrl="/sign-up" />
            </>
          )}
        </section>
      </div>
    </AePublicShell>
  )
}

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
  const isClaimFlow = redirect === undefined || redirect.startsWith('/claim')
  const contextHeading = isAgentAccessFlow ? 'Sign in to connect your assistant' : 'Almost there'
  const contextText = isAgentAccessFlow
    ? 'After you sign in, you’ll return to assistant access.'
    : 'After you sign in, you’ll continue straight to your listing.'

  return (
    <AePublicShell>
      <div className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center px-4 py-12 md:px-6">
        <section className="grid w-full gap-6" aria-labelledby={isLocalE2E || (!isClaimFlow && !isAgentAccessFlow) ? undefined : 'sign-in-context-heading'}>
          {isLocalE2E ? (
            <div className="grid gap-4">
              <div className="grid gap-1">
                <h1 id="sign-in-context-heading" className="text-4xl font-semibold leading-tight tracking-tight text-balance text-foreground">Local preview sign-in is off</h1>
                <p className="block text-muted-foreground">This browser journey does not connect a Clerk account. Nothing is signed in or authorized.</p>
              </div>
              <Button asChild variant="default" className="min-h-11 justify-self-start"><a href={isAgentAccessFlow ? '/agent-access' : '/'}>{isAgentAccessFlow ? 'Open assistant access preview' : 'Browse the local demo'}</a></Button>
            </div>
          ) : (
            <>
              {isClaimFlow || isAgentAccessFlow ? (
                <div className="grid gap-1">
                  <h1 id="sign-in-context-heading" className="text-4xl font-semibold leading-tight tracking-tight text-balance text-foreground">{contextHeading}</h1>
                  <p className="block text-muted-foreground">{contextText}</p>
                </div>
              ) : null}
              <SignIn fallbackRedirectUrl={redirect ?? '/claim'} signUpUrl="/sign-up" />
            </>
          )}
        </section>
      </div>
    </AePublicShell>
  )
}

import { SignUp } from '@clerk/tanstack-react-start'
import { Link, createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
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
  const contextHeading = isAgentAccessFlow ? 'Create an account to connect an agent' : 'Create a supplier account'
  const contextText = isAgentAccessFlow
    ? 'After you create your account, you’ll return to Access and create a caller identity.'
    : 'After you create your account, you’ll continue to the Operation publishing workspace.'

  return (
    <AePublicShell>
      <div className="ae-rail grid min-h-full w-full max-w-lg place-items-center py-page">
        <section className="grid w-full gap-6" aria-labelledby="sign-up-context-heading">
          {isLocalE2E ? (
            <div className="grid gap-4">
              <div className="grid gap-1">
                <h1 id="sign-up-context-heading" className="text-3xl font-semibold leading-tight tracking-tight text-balance text-foreground">Local preview sign-up is off</h1>
                <p className="block text-muted-foreground">This browser journey does not connect a Clerk account. Nothing is signed in or authorized.</p>
              </div>
              <Button asChild variant="default" className="min-h-11 justify-self-start"><Link to="/market" search={{ window: '30d' }} hash="operations">Browse the catalog</Link></Button>
            </div>
          ) : (
            <>
              <div className="grid gap-1">
                <h1 id="sign-up-context-heading" className="text-3xl font-semibold leading-tight tracking-tight text-balance text-foreground">{contextHeading}</h1>
                <p className="block text-muted-foreground">{contextText}</p>
              </div>
              <SignUp fallbackRedirectUrl={redirect ?? '/owner/offerings'} signInUrl="/sign-in" />
            </>
          )}
        </section>
      </div>
    </AePublicShell>
  )
}

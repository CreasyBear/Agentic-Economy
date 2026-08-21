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
  const contextHeading = isAgentAccessFlow ? 'Create an account to connect your assistant' : 'Almost there'
  const contextText = isAgentAccessFlow
    ? 'After you create your account, you’ll return to assistant access.'
    : 'After you create your account, you’ll continue straight to your listing.'

  return (
    <AePublicShell>
      <div className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center px-4 py-12 md:px-6">
        <section className="grid w-full gap-6" aria-labelledby="sign-up-context-heading">
          {isLocalE2E ? (
            <div className="grid gap-4">
              <div className="grid gap-1">
                <h1 id="sign-up-context-heading" className="text-4xl font-semibold leading-tight tracking-tight text-balance text-foreground">Local preview sign-up is off</h1>
                <p className="block text-muted-foreground">This browser journey does not connect a Clerk account. Nothing is signed in or authorized.</p>
              </div>
              <Button asChild variant="default" className="min-h-11 justify-self-start"><Link to="/">Browse the local demo</Link></Button>
            </div>
          ) : (
            <>
              <div className="grid gap-1">
                <h1 id="sign-up-context-heading" className="text-4xl font-semibold leading-tight tracking-tight text-balance text-foreground">{contextHeading}</h1>
                <p className="block text-muted-foreground">{contextText}</p>
              </div>
              <SignUp fallbackRedirectUrl={redirect ?? '/owner/supply'} signInUrl="/sign-in" />
            </>
          )}
        </section>
      </div>
    </AePublicShell>
  )
}

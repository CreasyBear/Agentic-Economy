import { SignUp } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'

export const Route = createFileRoute('/sign-up/$')({
  head: () => ({
    meta: [
      { title: 'Sign up | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SignUpRoute,
})

function SignUpRoute() {
  const isLocalE2E = isLocalE2EAuthBypassEnabled()

  return (
    <AePublicShell>
      <main className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center px-4 py-12 md:px-6">
        {isLocalE2E ? (
          <section className="grid w-full gap-4" aria-labelledby="sign-up-context-heading">
            <div className="grid gap-1">
              <h1 id="sign-up-context-heading">Local preview sign-up is off</h1>
              <p className="block text-muted-foreground">This browser journey does not connect a Clerk account. Nothing is signed in or authorized.</p>
            </div>
            <Button asChild variant="default" className="min-h-11 justify-self-start"><a href="/">Browse the local demo</a></Button>
          </section>
        ) : (
          <SignUp fallbackRedirectUrl="/claim" signInUrl="/sign-in" />
        )}
      </main>
    </AePublicShell>
  )
}

import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'

type SignInSearch = {
  redirect?: string
}

const signInAppearance = {
  variables: {
    fontSize: '1.125rem',
    spacing: '1rem',
    borderRadius: '0.75rem',
  },
  elements: {
    formFieldRow__password: 'aria-hidden:!hidden',
    identityPreviewEditButton: '!min-h-10 !min-w-10',
    socialButtonsBlockButton: 'min-h-10',
    formButtonPrimary: 'min-h-10',
    formFieldInput: 'min-h-10',
    formFieldInputShowPasswordButton: 'min-h-10 min-w-10',
  },
  options: {
    unsafe_disableDevelopmentModeWarnings: true,
  },
}

/** Only accept a same-origin relative path; rejects protocol-relative ("//host") and absolute URLs to avoid an open redirect. */
function sanitizeRedirectTarget(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return undefined
  }

  return trimmed
}

export const Route = createFileRoute('/sign-in/$')({
  validateSearch: (search: Record<string, unknown>): SignInSearch => {
    const redirect = sanitizeRedirectTarget(search.redirect)
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
      <main className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center px-4 py-12 md:px-6">
        <section className="grid w-full gap-6" aria-labelledby={isLocalE2E || (!isClaimFlow && !isAgentAccessFlow) ? undefined : 'sign-in-context-heading'}>
          {isLocalE2E ? (
            <div className="grid gap-4">
              <div className="grid gap-1">
                <h1 id="sign-in-context-heading">Local preview sign-in is off</h1>
                <p className="block text-muted-foreground">This browser journey does not connect a Clerk account. Nothing is signed in or authorized.</p>
              </div>
              <Button asChild variant="default" className="min-h-11 justify-self-start"><a href={isAgentAccessFlow ? '/agent-access' : '/'}>{isAgentAccessFlow ? 'Open assistant access preview' : 'Browse the local demo'}</a></Button>
            </div>
          ) : (
            <>
              {isClaimFlow || isAgentAccessFlow ? (
                <div className="grid gap-1">
                  <h1 id="sign-in-context-heading">{contextHeading}</h1>
                  <p className="block text-muted-foreground">{contextText}</p>
                </div>
              ) : null}
              <SignIn
                fallbackRedirectUrl={redirect ?? '/claim'}
                signUpUrl="/sign-up"
                appearance={signInAppearance}
              />
            </>
          )}
        </section>
      </main>
    </AePublicShell>
  )
}

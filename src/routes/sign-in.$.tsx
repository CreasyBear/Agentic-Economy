import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'

export const Route = createFileRoute('/sign-in/$')({
  head: () => ({
    meta: [
      { title: 'Sign in | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: SignInRoute,
})

function SignInRoute() {
  return (
    <AePublicShell>
      <main className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center px-4 py-12 md:px-6">
        <SignIn fallbackRedirectUrl="/claim" signUpUrl="/sign-up" />
      </main>
    </AePublicShell>
  )
}

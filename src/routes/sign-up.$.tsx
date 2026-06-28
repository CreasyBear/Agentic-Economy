import { SignUp } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'

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
  return (
    <AePublicShell>
      <main className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center px-4 py-12 md:px-6">
        <SignUp fallbackRedirectUrl="/claim" signInUrl="/sign-in" />
      </main>
    </AePublicShell>
  )
}

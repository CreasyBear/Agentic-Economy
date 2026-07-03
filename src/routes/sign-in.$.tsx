import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

import { AePublicShell } from '@/components/ae/layout/AePublicShell'

type SignInSearch = {
  redirect?: string
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

  return (
    <AePublicShell>
      <main className="mx-auto grid min-h-[70vh] w-full max-w-lg place-items-center px-4 py-12 md:px-6">
        <SignIn fallbackRedirectUrl={redirect ?? '/claim'} signUpUrl="/sign-up" />
      </main>
    </AePublicShell>
  )
}

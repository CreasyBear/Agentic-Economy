import { auth } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { signedInReturnPath } from '@/lib/client/auth-redirect'

export type ClerkServerSessionAdmission = { userId: string }

type RequireClerkServerSessionInput = {
  redirectTo: string
}

export async function requireClerkServerSession({
  redirectTo,
}: RequireClerkServerSessionInput): Promise<ClerkServerSessionAdmission> {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) {
    throw redirect({
      to: '/sign-in/$',
      params: { _splat: '' },
      search: { redirect: redirectTo },
    })
  }

  return { userId }
}

const requireSignedInServer = createServerFn()
  .validator((data: { redirectTo: string }) => data)
  .handler(async ({ data }) => requireClerkServerSession(data))

export async function requireSignedInBeforeLoad(location: { href: string }): Promise<void> {
  await requireSignedInServer({ data: { redirectTo: signedInReturnPath(location.href, '/market') } })
}

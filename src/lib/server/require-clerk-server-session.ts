import { auth } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'

import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

export type ClerkServerSessionAdmission = { userId: string }

type RequireClerkServerSessionInput = {
  redirectTo: string
  localBypassPrincipal: string
}

export async function requireClerkServerSession({
  redirectTo,
  localBypassPrincipal,
}: RequireClerkServerSessionInput): Promise<ClerkServerSessionAdmission> {
  if (isLocalE2EAuthBypassEnabled()) {
    return { userId: localBypassPrincipal }
  }

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

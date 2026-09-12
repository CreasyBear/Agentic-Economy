import { auth } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'

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

import { auth } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

export const requireClaimOwnerSession = createServerFn().handler(async () => {
  if (isLocalE2EAuthBypassEnabled()) {
    return { userId: 'local-e2e-owner' }
  }

  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) {
    throw redirect({ to: '/sign-in/$', params: { _splat: '' } })
  }

  return { userId }
})

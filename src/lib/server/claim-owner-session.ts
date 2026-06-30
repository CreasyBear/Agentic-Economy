import { auth } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

export const requireClaimOwnerSession = createServerFn().handler(async () => {
  if (process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E === 'true') {
    return { userId: 'local-e2e-owner' }
  }

  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated) {
    throw redirect({ to: '/sign-in/$', params: { _splat: '' } })
  }

  return { userId }
})

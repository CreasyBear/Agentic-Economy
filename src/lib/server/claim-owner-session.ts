import { auth } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

const admitClaimOwnerSession = createServerFn()
  .validator((data: { redirectTo: string }) => data)
  .handler(async ({ data }) => {
    if (isLocalE2EAuthBypassEnabled()) {
      return { userId: 'local-e2e-owner' }
    }

    const { isAuthenticated, userId } = await auth()
    if (!isAuthenticated) {
      throw redirect({
        to: '/sign-in/$',
        params: { _splat: '' },
        search: { redirect: data.redirectTo },
      })
    }

    return { userId }
  })

export function requireClaimOwnerSession({ location }: { location: { href: string } }) {
  return admitClaimOwnerSession({ data: { redirectTo: location.href } })
}

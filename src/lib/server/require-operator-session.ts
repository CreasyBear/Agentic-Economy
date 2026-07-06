import { auth } from '@clerk/tanstack-react-start/server'
import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

import { isLocalE2EAuthBypassEnabled } from '@/lib/server/local-e2e-bypass'

export type OperatorSessionAdmission = { userId: string }

const admitOperatorSessionServer = createServerFn()
  .validator((data: { redirectTo: string }) => data)
  .handler(async ({ data }): Promise<OperatorSessionAdmission> => {
    if (isLocalE2EAuthBypassEnabled()) {
      return { userId: 'local-e2e-operator' }
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

/**
 * Shared beforeLoad guard for every /owner/*, /admin/*, and /developers/*
 * route. Unauthenticated visitors are redirected to /sign-in with a
 * `redirect` search param honored after auth completes. Authorized-but-
 * wrong-role denial stays in-page (each route's own readback branch), this
 * guard only establishes that *someone* is signed in.
 */
export function requireOperatorBeforeLoad({ location }: { location: { href: string } }) {
  return admitOperatorSessionServer({ data: { redirectTo: location.href } })
}

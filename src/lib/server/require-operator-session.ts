import { createServerFn } from '@tanstack/react-start'

import { LOCAL_E2E_OPERATOR_PRINCIPAL } from '@/lib/server/local-e2e-bypass'
import {
  requireClerkServerSession,
  type ClerkServerSessionAdmission,
} from '@/lib/server/require-clerk-server-session'

export type OperatorSessionAdmission = ClerkServerSessionAdmission

const admitOperatorSessionServer = createServerFn()
  .validator((data: { redirectTo: string }) => data)
  .handler(({ data }): Promise<OperatorSessionAdmission> =>
    requireClerkServerSession({
      localBypassPrincipal: LOCAL_E2E_OPERATOR_PRINCIPAL,
      redirectTo: data.redirectTo,
    }),
  )

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

import { createServerFn } from '@tanstack/react-start'

import { requireClerkServerSession } from '@/lib/server/require-clerk-server-session'

const admitClaimOwnerSession = createServerFn()
  .validator((data: { redirectTo: string }) => data)
  .handler(({ data }) =>
    requireClerkServerSession({
      localBypassPrincipal: 'local-e2e-owner',
      redirectTo: data.redirectTo,
    }),
  )

export function requireClaimOwnerSession({ location }: { location: { href: string } }) {
  return admitClaimOwnerSession({ data: { redirectTo: location.href } })
}

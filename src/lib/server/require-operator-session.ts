import { createServerFn } from '@tanstack/react-start'

import {
  isLocalE2EAuthBypassEnabled,
  LOCAL_E2E_OPERATOR_PRINCIPAL,
} from '@/lib/server/local-e2e-bypass'
import {
  requireClerkServerSession,
} from '@/lib/server/require-clerk-server-session'
import {
  admitOperatorContext,
  type OperatorContext,
  type OperatorContextReadResult,
} from '@/lib/operator/operator-context'
import { readOperatorContextThroughSource } from '@/lib/server/operator-context.functions'

export type OperatorSessionAdmission = OperatorContext

const admitOperatorSessionServer = createServerFn()
  .validator((data: { redirectTo: string }) => data)
  .handler(async ({ data }): Promise<OperatorContextReadResult> => {
    const session = await requireClerkServerSession({
      localBypassPrincipal: LOCAL_E2E_OPERATOR_PRINCIPAL,
      redirectTo: data.redirectTo,
    })
    // Browser acceptance runs intentionally have no Clerk or Convex admin
    // credential. Give that non-production preview only the owner/developer
    // shell surfaces; actions and loaders still keep their own local guards.
    if (isLocalE2EAuthBypassEnabled()) return {
      kind: 'authorized',
      userId: session.userId,
      principalRef: `prn_${'0'.repeat(32)}`,
      accountRef: 'account:local-e2e-preview',
      allowedSurfaces: ['owner', 'developer'],
    }
    return await readOperatorContextThroughSource()
  })

/**
 * Shared beforeLoad guard for every /owner/*, /admin/*, and /developers/*
 * route. Unauthenticated visitors are redirected to /sign-in with a
 * `redirect` search param honored after auth completes. Authenticated callers
 * must also have canonical Account ownership and the requested surface.
 */
export async function requireOperatorBeforeLoad({ location }: { location: { href: string } }) {
  const result = await admitOperatorSessionServer({ data: { redirectTo: location.href } })
  return admitOperatorContext(result, location.href)
}

import { createServerFn } from '@tanstack/react-start'

import {
  requireClerkServerSession,
} from '@/lib/server/require-clerk-server-session'
import {
  admitOperatorContext,
  type OperatorContext,
  type OperatorContextReadResult,
} from '@/lib/operator/operator-context'
import { rememberOperatorContext, rememberedOperatorContext } from '@/lib/operator/operator-context-memory'
import { readOperatorContextThroughSource } from '@/lib/server/operator-context.functions'

export type OperatorSessionAdmission = OperatorContext

const admitOperatorSessionServer = createServerFn()
  .validator((data: { redirectTo: string }) => data)
  .handler(async ({ data }): Promise<OperatorContextReadResult> => {
    await requireClerkServerSession({ redirectTo: data.redirectTo })
    return await readOperatorContextThroughSource()
  })

/**
 * Shared beforeLoad guard for every /owner/* and /admin/* route.
 * Unauthenticated visitors are redirected to /sign-in with a `redirect`
 * search param honored after auth completes. Authenticated callers must
 * also have canonical Account ownership and the requested surface.
 *
 * Entering the workspace admits through Clerk and the source. While the
 * layout stays mounted (`stay`) or a link preloads, the surface check runs
 * against the remembered context, which the Workspace menu's Convex
 * subscription keeps current, so moving between pages never round-trips.
 */
export async function requireOperatorBeforeLoad({ location, cause }: {
  location: { href: string }
  cause?: 'preload' | 'enter' | 'stay'
}) {
  const remembered = cause === 'stay' || cause === 'preload' ? rememberedOperatorContext() : undefined
  const result = remembered ?? await admitOperatorSessionServer({ data: { redirectTo: location.href } })
  rememberOperatorContext(result)
  return admitOperatorContext(result, location.href)
}

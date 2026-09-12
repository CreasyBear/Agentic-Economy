import { createServerFn } from '@tanstack/react-start'

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
    await requireClerkServerSession({ redirectTo: data.redirectTo })
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

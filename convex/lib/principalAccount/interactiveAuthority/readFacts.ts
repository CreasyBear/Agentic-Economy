import { degradeBackend } from '@/lib/observability/degrade-backend'
import { v } from 'convex/values'
import type { QueryCtx } from '../../../_generated/server'
import { resolveInteractiveAuthorityFacts } from './factResolution'
import { interactiveAuthorityFactsValue, type InteractiveAuthorityFacts } from './contracts'

export const readCurrentInteractiveAuthorityFactsArgs = {}

export const readCurrentInteractiveAuthorityFactsResult = v.union(
  interactiveAuthorityFactsValue,
  v.null(),
)

export async function readCurrentInteractiveAuthorityFactsHandler(
  ctx: QueryCtx,
): Promise<InteractiveAuthorityFacts | null> {
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) return null
  try {
    return await resolveInteractiveAuthorityFacts(ctx.db, identity)
  } catch (cause) {
    // This is an authority read: malformed facts and storage failures both
    // deny rather than exposing a partially resolved identity.
    return degradeBackend(cause, null, { site: 'readCurrentInteractiveAuthorityFacts', reason: 'source_unavailable' })
  }
}

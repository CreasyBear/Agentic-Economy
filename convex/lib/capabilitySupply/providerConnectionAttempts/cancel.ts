import { type Infer } from 'convex/values'

import type { MutationCtx } from '../../../_generated/server'
import { resolveBusinessActor } from '../../../authz'
import { requireSourceWrite } from '../../../sourceWriteAdmission'
import {
  cancelOwnerResult,
  prepareOwnerArgsValue,
} from './contracts'

type CancelOwnerArgs = Infer<typeof prepareOwnerArgsValue>

export { cancelOwnerResult }

export async function cancelOwnerHandler(ctx: MutationCtx, args: CancelOwnerArgs) {
  const sourceWrite = await requireSourceWrite(ctx, args, 'catalog_publish')
  const actor = await resolveBusinessActor(ctx)
  if (sourceWrite.kind === 'rejected' || actor.kind !== 'authenticated_owner') return { kind: 'refused' as const, code: 'not_found' as const }
  const attempt = await ctx.db.query('capabilityProviderConnectionAttempts').withIndex('by_attemptRef', (query) => query.eq('attemptRef', args.attemptRef)).unique()
  if (attempt === null || attempt.owningAccountRef !== actor.canonicalAccountRef) return { kind: 'refused' as const, code: 'not_found' as const }
  const now = Date.now()
  if (attempt.lifecycle === 'pending' && attempt.expiresAt > now) {
    await ctx.db.patch(attempt._id, { lifecycle: 'cancelled', updatedAt: now })
    return { kind: 'cancelled' as const, state: 'cancelled' as const }
  }
  const state = attempt.lifecycle === 'pending' ? 'expired' as const : attempt.lifecycle
  if (attempt.lifecycle === 'pending') await ctx.db.patch(attempt._id, { lifecycle: 'expired', updatedAt: now })
  return state === 'cancelled' || state === 'consumed' || state === 'expired'
    ? { kind: 'unchanged' as const, state }
    : { kind: 'refused' as const, code: 'not_found' as const }
}

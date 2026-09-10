import { ConvexError, v } from 'convex/values'
import { requireSourceRead, requireSourceWrite, type SourceWriteArgs } from '../../../sourceWriteAdmission'

// -- Primitives shared by two or more convex/lib/agentAccess/oauth/* groups. --
// -- Kept neutral (no imports of sibling oauth group files) so none of the ---
// -- grouped modules need to import one another to reach these. -------------

const OAUTH_SOURCE_WRITE_SCOPE = 'agent_identity' as const

export const environment = v.union(v.literal('sandbox'), v.literal('production'))
export const authorityMode = v.union(
  v.literal('read_only'),
  v.literal('approval_required'),
  v.literal('spending_policy'),
  v.literal('unrestricted_test_only'),
)
export const refreshFamilyLifecycle = v.union(v.literal('active'), v.literal('revoked'), v.literal('expired'))

export function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export async function requireOAuthSourceWrite(
  ctx: { db: unknown },
  args: SourceWriteArgs & { operationKey: string; correlationId: string },
): Promise<void> {
  const admitted = await requireSourceWrite(ctx, args, OAUTH_SOURCE_WRITE_SCOPE)
  if (admitted.kind === 'rejected') {
    throw new Error(`agent_access_oauth_source_write_rejected:${admitted.reason}`)
  }
}

export async function requireOAuthSourceRead(
  args: SourceWriteArgs & { operationKey: string; correlationId: string },
): Promise<void> {
  const verification = await requireSourceRead(args, OAUTH_SOURCE_WRITE_SCOPE)
  if (verification.kind === 'rejected') {
    throw new ConvexError({ code: 'oauth_source_read_rejected', reason: verification.reason })
  }
}

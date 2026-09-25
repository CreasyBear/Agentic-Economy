import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
export async function invalidateOAuthRefreshFamilies(
  ctx: MutationCtx,
  target: Readonly<{ credentialRef?: string; principalRef?: string }>,
  reason: string,
  now: number,
): Promise<void> {
  let rows: Doc<'agentAccessOAuthRefreshFamilies'>[]
  if (target.credentialRef !== undefined) {
    const credentialRef = target.credentialRef
    rows = await ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_currentCredentialRef_and_lifecycle', (query) => query
        .eq('currentCredentialRef', credentialRef).eq('lifecycle', 'active')).collect()
  } else if (target.principalRef !== undefined) {
    const principalRefValue = target.principalRef
    rows = await ctx.db.query('agentAccessOAuthRefreshFamilies')
      .withIndex('by_principalRef_and_lifecycle', (query) => query
        .eq('principalRef', principalRefValue).eq('lifecycle', 'active')).collect()
  } else {
    rows = []
  }
  await Promise.all(rows.map(async (row) => await ctx.db.patch(row._id, {
    lifecycle: 'revoked',
    revision: row.revision + 1,
    revokedAt: now,
    revocationReason: reason,
    updatedAt: now,
  })))
}

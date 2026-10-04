import type { QueryCtx } from '../../../_generated/server'
import { canonicalDigest, schemaDescriptorDigest } from '@/modules/common/canonical-digest'

/** Transactional cohort fingerprint includes row identity and all projected fields.
 * A final check catches deletions, cursor moves and updates to already-read rows.
 * Later inserts are outside the declared creation cutoff, including equal dates. */
export async function callExportSourceDigest(ctx: Pick<QueryCtx, 'db'>, scope: {
  accountRef: string; principalRef?: string; periodStartAt: number; periodEndAt: number; snapshotAt: number
}): Promise<string> {
  const principal = scope.principalRef
  const rows = principal === undefined
    ? await ctx.db.query('capabilityCallProjections').withIndex('by_accountRef_and_createdAt', q => q
      .eq('accountRef', scope.accountRef).gte('createdAt', scope.periodStartAt).lt('createdAt', scope.periodEndAt)).order('desc').take(10_001)
    : await ctx.db.query('capabilityCallProjections').withIndex('by_accountRef_and_principalRef_and_createdAt', q => q
      .eq('accountRef', scope.accountRef).eq('principalRef', principal).gte('createdAt', scope.periodStartAt).lt('createdAt', scope.periodEndAt)).order('desc').take(10_001)
  if (rows.length > 10_000) throw new Error('call_export_window_too_large')
  return schemaDescriptorDigest({ format: 'ae.call-export-source:v1',
    rows: rows.filter(row => row._creationTime <= scope.snapshotAt).map(row => canonicalDigest(row)) })
}
